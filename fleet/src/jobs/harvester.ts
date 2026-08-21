/**
 * HARVESTER: casa de schimb a flotei pe Financial NFA. Vault-ul unui NFT sta
 * ca LP concentrat in pool-urile v4 aprobate si incaseaza comisionul din
 * fluxul tuturor celorlalti, in loc sa-l plateasca.
 *
 * Fratele traderului, cu aceeasi impartire a raspunderii: FRANA ADEVARATA e
 * IN contract (AgentAccountV3: ruta canonica, latimea benzii, centrarea pe
 * oracol, prospetimea feed-ului, plafoane USD, cooldown, iar retragerea nu
 * poate fi blocata de nimic). Ce adauga flota e ce contractul nu poate sti:
 * istoria feed-ului (frana de furtuna se uita la VITEZA miscarii, contractul
 * vede doar o poza), cadenta de colectare, siguranta de drawdown pe NAV si
 * registrul cu fiecare decizie.
 *
 * CREIERUL NU STA AICI. Planner-ul, matematica de tick/lichiditate si
 * cititorii de stare v4 traiesc in repo-ul privat financial-nfa (dist/src/lp)
 * si se incarca de pe disc, ca la trader. Fara creier, agentul sta si spune
 * de ce.
 *
 * Lectiile masurate pe 21 aug 2026, direct in reguli:
 *  - LP pe un singur nume volatil moare din zilele cu gap => cos multi-pool,
 *    ponderi per pool, si frana de furtuna care goleste TOT la miscari rapide;
 *  - fara oracol nu se coteaza (weekendul e orb, nu ieftin);
 *  - randamentul se dilueaza cu marimea => plafon de cota din lichiditatea
 *    activa a pool-ului, nu "cat incape".
 */
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { encodeAbiParameters, formatUnits, keccak256, parseAbi, type Address, type PublicClient } from 'viem'
import { abiOf, zAddress, zBig, type Config } from '../core/config.js'
import type { Abi } from 'viem'
import { log } from '../core/log.js'
import type { DiscoverInput, Job, JobCheck, ReportLine, Target, WorkItem } from '../core/work.js'

const ZERO = '0x0000000000000000000000000000000000000000'

// ---- formele creierului: doar TIPURILE stau aici, implementarea e privata

export type LpPoolConfigB = {
  symbol: string
  widthTicks: number
  weight: number
  maxShareOfActiveLBps: number
  recenterEdgeQuarters: number
  maxPoolDevBps: number
}
export type LpPositionB = { tickLower: number; tickUpper: number; liquidity: bigint }
export type LpActionB =
  | { kind: 'hold'; symbol: string; reason: string }
  | { kind: 'withdraw'; symbol: string; reason: string; tickLower: number; tickUpper: number; liquidity: bigint }
  | {
      kind: 'provide'
      symbol: string
      reason: string
      tickLower: number
      tickUpper: number
      liquidity: bigint
      maxAmount0: bigint
      maxAmount1: bigint
    }
  | { kind: 'rebalance'; symbol: string; reason: string; usdgIn: bigint; minStockOut: bigint }

export interface LpBrain {
  planPool(obs: unknown, brakes: unknown, equityUsd8: bigint): LpActionB
  readSlot0(pc: unknown, poolManager: Address, key: unknown): Promise<{ sqrtPriceX96: bigint; tick: number }>
  readActiveLiquidity(pc: unknown, poolManager: Address, key: unknown): Promise<bigint>
  poolIdOf(key: unknown): `0x${string}`
  positionValueUsd8(
    sqrtPriceX96: bigint,
    tickLower: number,
    tickUpper: number,
    liquidity: bigint,
    cashUsd8: bigint,
    stockUsd8: bigint,
    dec0: number,
    dec1: number
  ): bigint
  /** the trader's swap encoder, reused for the bootstrap leg (cash -> stock) */
  encodeTrade(t: {
    tokenIn: Address
    tokenOut: Address
    amountIn: bigint
    minAmountOut: bigint
    poolKey: unknown
    hookData?: `0x${string}`
  }): `0x${string}`
}

const lpBrains = new Map<string, LpBrain>()

/** Incarca bucata de LP a creierului din financial-nfa: dist/ in container, sursa la dezvoltare. */
export async function loadLpBrain(dir: string): Promise<LpBrain> {
  const cached = lpBrains.get(dir)
  if (cached) return cached
  const root = resolve(dir)
  const layouts = [
    { lp: 'dist/src/lp/index.js', trade: 'dist/src/trade.js' },
    { lp: 'src/lp/index.ts', trade: 'src/trade.ts' }
  ]
  for (const rel of layouts) {
    if (!existsSync(join(root, rel.lp))) continue
    const mod = await import(pathToFileURL(join(root, rel.lp)).href)
    const trd = await import(pathToFileURL(join(root, rel.trade)).href)
    const brain: LpBrain = {
      planPool: mod.planPool,
      readSlot0: mod.readSlot0,
      readActiveLiquidity: mod.readActiveLiquidity,
      poolIdOf: mod.poolIdOf,
      positionValueUsd8: mod.positionValueUsd8,
      encodeTrade: trd.encodeTrade
    }
    const missing = (Object.keys(brain) as Array<keyof LpBrain>).filter((k) => brain[k] === undefined)
    if (missing.length > 0) throw new Error(`the LP brain at ${root} is missing ${missing.join(', ')}`)
    lpBrains.set(dir, brain)
    return brain
  }
  throw new Error(
    `no LP brain at ${root}: expected dist/src/lp/index.js (built) or src/lp/index.ts (source) from financial-nfa`
  )
}

/** doar pentru teste */
export function plantLpBrain(dir: string, brain: LpBrain): void {
  lpBrains.set(dir, brain)
}

// ---- configurare

const PoolCfg = z.object({
  /** simbolul piciorului de actiune (cash-ul e mereu USDG, currency0 pe 4663) */
  symbol: z.string(),
  fee: z.number().int(),
  tickSpacing: z.number().int(),
  /** latimea totala a benzii, in tick-uri (un tick = un bp de pret) */
  widthTicks: z.number().int().min(20),
  /** cota din capitalul harvester-ului pentru pool-ul asta, 0..1 */
  weight: z.number().min(0).max(1),
  /** plafon de diluare: cat la suta (bps) din lichiditatea ACTIVA a pool-ului avem voie sa fim */
  maxShareOfActiveLBps: z.number().int().min(1).max(10_000).default(2_000),
  /** retragere cand pretul intra in sferturile de margine (1 = sfertul exterior) */
  recenterEdgeQuarters: z.number().int().min(1).max(2).default(1),
  /** peste atatia bps pool-vs-feed nu se adauga; peste dublu se fuge */
  maxPoolDevBps: z.number().int().min(10).max(2_000).default(100),
  /** podeaua de slippage a bootstrap-ului PE POOLUL ASTA (fee-ul de 3% al MSTR cere mai mult
      decat global); lipsa = brakes.rebalanceSlippageBps */
  bootstrapSlippageBps: z.number().int().min(10).max(1_000).optional()
})

export const HarvesterSchema = z.object({
  /** NFT-urile operate: seiful fiecaruia devine o casa de schimb */
  tokenIds: z.array(zBig).min(1),
  registry: zAddress,
  poolManager: zAddress,
  brain: z.object({ dir: z.string().default('./brain') }).default({}),
  /** simbol -> token; trebuie sa cuprinda USDG si fiecare picior de actiune */
  tokens: z.record(
    z.string(),
    z.object({
      address: zAddress,
      decimals: z.number().int().min(0).max(36),
      feed: zAddress.nullable().default(null)
    })
  ),
  cashSymbol: z.string().default('USDG'),
  pools: z.array(PoolCfg).min(1),
  brakes: z
    .object({
      /** feed mai vechi de atat = piata inchisa sau oprita => nu se coteaza */
      staleSec: z.number().int().default(3_600),
      /** miscare de feed (bps) in fereastra care declanseaza fuga */
      feedJumpBps: z.number().int().default(150),
      feedJumpWindowSec: z.number().int().default(900),
      /** cat se sta pe margine dupa o frana de furtuna */
      brakeCooldownSec: z.number().int().default(21_600),
      /** sub atat (USD 1e8) nu se deschide pozitie */
      minNotionalUsd8: zBig.default(10_0000_0000n),
      /** podeaua de slippage a swap-ului de bootstrap; trebuie sa incapa in maxSlippageBps al politicii */
      rebalanceSlippageBps: z.number().int().min(10).max(1000).default(250),
      /** cel mai mare clip de bootstrap (USD 1e8): pool-urile subtiri inghit ~$500 per pas */
      bootstrapClipUsd8: zBig.default(500_0000_0000n),
      /** un clip de bootstrap per pool per fereastra asta (sec): pool-ul subtire trebuie
          lasat sa se RE-ANCOREZE la oracol dupa fiecare clip, altfel garda refuza in gol */
      rebalanceRetrySec: z.number().int().default(3600)
    })
    .default({}),
  /** cat de des se culeg comisioanele unei pozitii tinute (secunde) */
  collectIntervalSec: z.number().int().default(21_600),
  /**
   * Siguranta de drawdown pe NAV, ca la trader: sub prag se goleste TOT si se
   * scrie siguranta in registru; repornirea e o decizie de om (sterge cheia
   * `harvester.fuse.<id>` din kv). Referinta e prima valoare vazuta, deci la
   * orice alimentare a seifului se sterge `harvester.nav.first.<id>`.
   */
  maxDrawdownBps: z.number().int().min(0).max(10_000).nullable().default(2_000),
  eth: z
    .object({ feed: zAddress.nullable().default(null), usd8: zBig.default(0n) })
    .default({})
})

export type HarvesterJob = z.infer<typeof HarvesterSchema>

const nftAbi = parseAbi([
  'function strategyOf(uint256 id) view returns (uint16)',
  'function accountOf(uint256 id) view returns (address)'
])
const accountAbi = parseAbi([
  'function agentSigner() view returns (address)',
  'function paused() view returns (bool)',
  'function version() view returns (uint8)',
  'function lpPositions() view returns (((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, int24 tickLower, int24 tickUpper)[])',
  'function lpLiquidityOf(bytes32 posId) view returns (uint128)'
])
const registryAbi = parseAbi([
  'function routeOf(address a, address b) view returns ((uint24 fee, int24 tickSpacing, address hooks, bool exists))',
  'function paused() view returns (bool)'
])
const erc20Abi = parseAbi(['function balanceOf(address a) view returns (uint256)'])
const feedAbi = parseAbi([
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)'
])
/* toate apelurile contului, ca target-ul sa poata encoda oricare dupa meta.fn;
   executeTrade e piciorul de bootstrap (cash -> actiune), pe garda traderului */
const lpAbi = parseAbi([
  'function lpProvide((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 maxAmount0, uint256 maxAmount1) returns (uint256 used0, uint256 used1)',
  'function lpWithdraw((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 minAmount0, uint256 minAmount1) returns (uint256 got0, uint256 got1)',
  'function executeTrade(bytes params) returns (uint256 amountOut)'
])

type PoolKeyT = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }

function poolKeyFor(job: HarvesterJob, p: z.infer<typeof PoolCfg>): PoolKeyT {
  const cash = job.tokens[job.cashSymbol]
  const stock = job.tokens[p.symbol]
  if (!cash || !stock) throw new Error(`harvester: tokens map is missing ${job.cashSymbol} or ${p.symbol}`)
  const [c0, c1] =
    BigInt(cash.address) < BigInt(stock.address) ? [cash.address, stock.address] : [stock.address, cash.address]
  if (c0 !== cash.address) {
    /* toate pool-urile tinta de pe 4663 au USDG pe currency0; planner-ul si valorarea
       se sprijina pe asta, deci o pereche rasturnata se refuza la pornire, nu tarziu */
    throw new Error(`harvester: ${p.symbol} sorts below USDG; flipped pairs are not supported`)
  }
  return { currency0: c0, currency1: c1, fee: p.fee, tickSpacing: p.tickSpacing, hooks: ZERO }
}

async function readFeed(client: PublicClient, feed: Address): Promise<{ usd8: bigint; updatedAt: number }> {
  const r = (await client.readContract({ address: feed, abi: feedAbi, functionName: 'latestRoundData' })) as readonly [
    bigint,
    bigint,
    bigint,
    bigint,
    bigint
  ]
  return { usd8: r[1], updatedAt: Number(r[3]) }
}

/** istoricul de feed pentru frana de furtuna, tinut in kv; contractul nu vede viteza */
function pushFeedHistory(
  ledger: DiscoverInput['ledger'],
  key: string,
  usd8: bigint,
  nowSec: number,
  keepSec: number
): Array<{ ts: number; usd8: bigint }> {
  let hist: Array<{ ts: number; usd8: string }> = []
  try {
    hist = JSON.parse(ledger.kvGet(key) ?? '[]')
  } catch {
    hist = []
  }
  hist.push({ ts: nowSec, usd8: usd8.toString() })
  hist = hist.filter((h) => nowSec - h.ts <= keepSec)
  ledger.kvSet(key, JSON.stringify(hist))
  return hist.map((h) => ({ ts: h.ts, usd8: BigInt(h.usd8) }))
}

function usdToWei(usd8: bigint, rate8: bigint): bigint {
  if (rate8 <= 0n) return 0n
  return (usd8 * 10n ** 18n) / rate8
}

async function ethRate8(client: PublicClient, job: HarvesterJob): Promise<bigint> {
  if (job.eth.feed) {
    try {
      return (await readFeed(client, job.eth.feed as Address)).usd8
    } catch {
      /* cade pe cursul static */
    }
  }
  return job.eth.usd8
}

export const harvester: Job<HarvesterJob> = {
  kind: 'harvester',
  /** lpProvide/lpWithdraw sunt ale cheii de agent; un strain respins e protocolul functionand */
  actsOnOwnPosition: true,

  parse(raw) {
    const p = HarvesterSchema.safeParse(raw ?? {})
    if (!p.success) {
      const lines = p.error.issues.map((i) => `  job.${i.path.join('.') || '(root)'}: ${i.message}`)
      throw new Error(`invalid harvester job config:\n${lines.join('\n')}`)
    }
    const weights = p.data.pools.reduce((s, x) => s + x.weight, 0)
    if (weights > 1.0001) throw new Error(`harvester: pool weights sum to ${weights}, must be <= 1`)
    return p.data
  },

  required(cfg, job) {
    return [
      { what: 'AgentNFT', address: cfg.target.address },
      { what: 'StrategyRegistry', address: job.registry as Address },
      { what: 'PoolManager', address: job.poolManager as Address }
    ]
  },

  target(cfg, job, item?): Target {
    const errors = cfg.target.errorSignatures.flatMap(
      (e) => abiOf(e, 'target.errorSignatures') as unknown as unknown[]
    )
    const abi = [...(lpAbi as unknown as unknown[]), ...errors] as Abi
    const address = (item?.meta.account as Address | undefined) ?? cfg.target.address
    const functionName =
      (item?.meta.fn as 'lpProvide' | 'lpWithdraw' | 'executeTrade' | undefined) ?? 'lpWithdraw'
    return { address, abi, functionName }
  },

  async authority(client, cfg, job) {
    try {
      const account = (await client.readContract({
        address: cfg.target.address,
        abi: nftAbi,
        functionName: 'accountOf',
        args: [job.tokenIds[0]!]
      })) as Address
      return (await client.readContract({ address: account, abi: accountAbi, functionName: 'agentSigner' })) as Address
    } catch {
      return null
    }
  },

  async checks({ client, cfg, job }): Promise<JobCheck[]> {
    const out: JobCheck[] = []
    try {
      await loadLpBrain(job.brain.dir)
      out.push({ name: 'lp brain', ok: true, detail: job.brain.dir })
    } catch (e) {
      out.push({ name: 'lp brain', ok: false, fatal: true, detail: (e as Error).message })
    }
    for (const p of job.pools) {
      try {
        const key = poolKeyFor(job, p)
        const rt = (await client.readContract({
          address: job.registry as Address,
          abi: registryAbi,
          functionName: 'routeOf',
          args: [key.currency0, key.currency1]
        })) as { fee: number; tickSpacing: number; hooks: Address; exists: boolean }
        const match = rt.exists && rt.fee === p.fee && rt.tickSpacing === p.tickSpacing && rt.hooks === ZERO
        out.push({
          name: `route ${p.symbol}`,
          ok: match,
          fatal: !match,
          detail: match ? `${p.fee}/${p.tickSpacing} canonical` : 'pool config does not match the canonical route on chain'
        })
        const feed = job.tokens[p.symbol]?.feed
        out.push({ name: `feed ${p.symbol}`, ok: !!feed, fatal: !feed, detail: feed ?? 'missing' })
      } catch (e) {
        out.push({ name: `route ${p.symbol}`, ok: false, fatal: true, detail: (e as Error).message })
      }
    }
    for (const id of job.tokenIds) {
      try {
        const account = (await client.readContract({
          address: cfg.target.address,
          abi: nftAbi,
          functionName: 'accountOf',
          args: [id]
        })) as Address
        const version = (await client.readContract({ address: account, abi: accountAbi, functionName: 'version' })) as number
        out.push({
          name: `vault #${id}`,
          ok: version >= 3,
          fatal: version < 3,
          detail: version >= 3 ? `v${version}, LP-capable` : `v${version}: no liquidity entrypoints (needs AgentAccountV3)`
        })
      } catch (e) {
        out.push({ name: `vault #${id}`, ok: false, fatal: true, detail: (e as Error).message })
      }
    }
    return out
  },

  async discover({ client, cfg, job, ledger }): Promise<WorkItem[]> {
    const brain = await loadLpBrain(job.brain.dir)
    const nowSec = Math.floor(Date.now() / 1000)
    const rate8 = await ethRate8(client, job)
    const items: WorkItem[] = []

    const cash = job.tokens[job.cashSymbol]!
    const cashFeed = cash.feed
      ? await readFeed(client, cash.feed as Address).catch(() => ({ usd8: 1_0000_0000n, updatedAt: nowSec }))
      : { usd8: 1_0000_0000n, updatedAt: nowSec }
    const globallyPaused = (await client.readContract({
      address: job.registry as Address,
      abi: registryAbi,
      functionName: 'paused'
    })) as boolean

    for (const id of job.tokenIds) {
      const account = (await client.readContract({
        address: cfg.target.address,
        abi: nftAbi,
        functionName: 'accountOf',
        args: [id]
      })) as Address
      const positions = (await client.readContract({
        address: account,
        abi: accountAbi,
        functionName: 'lpPositions'
      })) as ReadonlyArray<{ key: PoolKeyT; tickLower: number; tickUpper: number }>

      /* NAV: cash + actiuni + pozitiile LP, toate la oracol; siguranta de drawdown pe el */
      let navUsd8 = 0n
      const perPool: Array<{
        p: z.infer<typeof PoolCfg>
        key: PoolKeyT
        obs: Record<string, unknown>
        held: LpPositionB | null
      }> = []

      const cashBal = (await client.readContract({
        address: cash.address as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account]
      })) as bigint
      navUsd8 += (cashBal * cashFeed.usd8) / 10n ** BigInt(cash.decimals)

      for (const p of job.pools) {
        const stock = job.tokens[p.symbol]!
        const key = poolKeyFor(job, p)
        const [slot0, activeL, stockBal, feed] = await Promise.all([
          brain.readSlot0(client, job.poolManager as Address, key),
          brain.readActiveLiquidity(client, job.poolManager as Address, key),
          client.readContract({
            address: stock.address as Address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [account]
          }) as Promise<bigint>,
          readFeed(client, stock.feed as Address)
        ])
        navUsd8 += (stockBal * feed.usd8) / 10n ** BigInt(stock.decimals)

        /* pozitia noastra din pool-ul asta, din evidenta contului */
        const ref = positions.find(
          (x) => x.key.currency1.toLowerCase() === (stock.address as string).toLowerCase() && x.key.fee === p.fee
        )
        let held: LpPositionB | null = null
        if (ref) {
          const posId = keccak256(
            encodeAbiParameters(
              [{ type: 'bytes32' }, { type: 'int24' }, { type: 'int24' }],
              [brain.poolIdOf(key), ref.tickLower, ref.tickUpper]
            )
          )
          const liq = (await client.readContract({
            address: account,
            abi: accountAbi,
            functionName: 'lpLiquidityOf',
            args: [posId]
          })) as bigint
          if (liq > 0n) {
            held = { tickLower: ref.tickLower, tickUpper: ref.tickUpper, liquidity: liq }
            navUsd8 += brain.positionValueUsd8(
              slot0.sqrtPriceX96,
              ref.tickLower,
              ref.tickUpper,
              liq,
              cashFeed.usd8,
              feed.usd8,
              cash.decimals,
              stock.decimals
            )
          }
        }

        const histKey = `harvester.feed.${p.symbol}`
        const feedHistory = pushFeedHistory(ledger, histKey, feed.usd8, nowSec, job.brakes.feedJumpWindowSec * 4)
        const lastBrakeAt = Number(ledger.kvGet(`harvester.brake.${id}.${p.symbol}`) ?? '0')

        perPool.push({
          p,
          key,
          held,
          obs: {
            cfg: {
              symbol: p.symbol,
              widthTicks: p.widthTicks,
              weight: p.weight,
              maxShareOfActiveLBps: p.maxShareOfActiveLBps,
              recenterEdgeQuarters: p.recenterEdgeQuarters,
              maxPoolDevBps: p.maxPoolDevBps,
              ...(p.bootstrapSlippageBps !== undefined ? { bootstrapSlippageBps: p.bootstrapSlippageBps } : {})
            },
            tickSpacing: p.tickSpacing,
            dec0: cash.decimals,
            dec1: stock.decimals,
            sqrtPriceX96: slot0.sqrtPriceX96,
            tick: slot0.tick,
            activeLiquidity: activeL,
            feedUsd8: feed.usd8,
            feedUpdatedAt: feed.updatedAt,
            cashUsd8: cashFeed.usd8,
            feedHistory,
            position: held,
            balance0: cashBal,
            balance1: stockBal,
            nowSec,
            lastBrakeAt
          }
        })
      }

      /* siguranta de drawdown: prima valoare vazuta e reperul; sub prag se goleste tot */
      const navKey = `harvester.nav.first.${id}`
      const first = BigInt(ledger.kvGet(navKey) ?? '0')
      if (first === 0n && navUsd8 > 0n) ledger.kvSet(navKey, navUsd8.toString())
      const fuseKey = `harvester.fuse.${id}`
      let fused = ledger.kvGet(fuseKey) !== null
      if (!fused && job.maxDrawdownBps !== null && first > 0n) {
        const floor = (first * BigInt(10_000 - job.maxDrawdownBps)) / 10_000n
        if (navUsd8 < floor) {
          ledger.kvSet(fuseKey, JSON.stringify({ at: nowSec, navUsd8: navUsd8.toString(), floor: floor.toString() }))
          fused = true
          log.warn(`harvester #${id}: NAV ${formatUnits(navUsd8, 8)} sub podeaua de drawdown; sig arsa, doar retrageri`)
        }
      }

      for (const { p, key, obs, held } of perPool) {
        const action = fused
          ? held
            ? ({ kind: 'withdraw', symbol: p.symbol, reason: 'drawdown fuse', ...held } as LpActionB)
            : ({ kind: 'hold', symbol: p.symbol, reason: 'drawdown fuse' } as LpActionB)
          : brain.planPool(obs, job.brakes, navUsd8)

        if (action.kind === 'withdraw') {
          if (action.reason.includes('storm')) {
            ledger.kvSet(`harvester.brake.${id}.${p.symbol}`, String(nowSec))
          }
          items.push({
            key: `harvester:${id}:${p.symbol}:wd:${action.tickLower}:${action.tickUpper}:${nowSec}`,
            label: `#${id} ${p.symbol} withdraw (${action.reason})`,
            args: [key, action.tickLower, action.tickUpper, action.liquidity, 0n, 0n],
            rewardWei: 0n,
            rewardMeasured: false,
            stakeWei: 0n,
            valueWei: 0n,
            costWei: 0n,
            costMeasured: true,
            costToken: null,
            once: true,
            meta: { account, fn: 'lpWithdraw', tokenId: String(id), symbol: p.symbol, reason: action.reason }
          })
          continue
        }

        if (action.kind === 'rebalance' && !globallyPaused) {
          /* the bootstrap leg: cash -> stock through executeTrade, the SAME guard the
             trader lives under (allowlist, canonical route, caps, oracle floor).
             Rate-limited per pool: a thin pool gets pushed off the oracle by one clip
             and needs time to re-anchor; hammering it just burns refused gas. */
          const rk = `harvester.reb.${id}.${p.symbol}`
          const lastReb = Number(ledger.kvGet(rk) ?? '0')
          if (nowSec - lastReb < job.brakes.rebalanceRetrySec) continue
          ledger.kvSet(rk, String(nowSec))
          const stock = job.tokens[p.symbol]!
          const td = brain.encodeTrade({
            tokenIn: cash.address as Address,
            tokenOut: stock.address as Address,
            amountIn: action.usdgIn,
            minAmountOut: action.minStockOut,
            poolKey: key,
            hookData: '0x'
          })
          items.push({
            key: `harvester:${id}:${p.symbol}:reb:${nowSec}`,
            label: `#${id} ${p.symbol} bootstrap swap (${action.reason})`,
            args: [td],
            rewardWei: 0n,
            rewardMeasured: false,
            stakeWei: usdToWei(navUsd8, rate8),
            valueWei: 0n,
            costWei: 0n,
            costMeasured: true,
            costToken: null,
            once: true,
            meta: { account, fn: 'executeTrade', tokenId: String(id), symbol: p.symbol, reason: action.reason }
          })
          continue
        }

        if (action.kind === 'provide' && !globallyPaused) {
          const stake = usdToWei(navUsd8, rate8)
          items.push({
            key: `harvester:${id}:${p.symbol}:add:${action.tickLower}:${action.tickUpper}:${nowSec}`,
            label: `#${id} ${p.symbol} provide [${action.tickLower},${action.tickUpper}] (${action.reason})`,
            args: [key, action.tickLower, action.tickUpper, action.liquidity, action.maxAmount0, action.maxAmount1],
            rewardWei: 0n,
            rewardMeasured: false,
            stakeWei: stake,
            valueWei: 0n,
            costWei: 0n,
            costMeasured: true,
            costToken: null,
            once: true,
            meta: { account, fn: 'lpProvide', tokenId: String(id), symbol: p.symbol, reason: action.reason }
          })
          continue
        }

        /* pozitie tinuta: comisioanele se culeg pe cadenta, nu la fiecare rulare */
        if (action.kind === 'hold' && held) {
          const ck = `harvester.collect.${id}.${p.symbol}`
          const last = Number(ledger.kvGet(ck) ?? '0')
          if (nowSec - last >= job.collectIntervalSec) {
            ledger.kvSet(ck, String(nowSec))
            items.push({
              key: `harvester:${id}:${p.symbol}:col:${nowSec}`,
              label: `#${id} ${p.symbol} collect fees`,
              args: [key, held.tickLower, held.tickUpper, 0n, 0n, 0n],
              rewardWei: 0n,
              rewardMeasured: false,
              stakeWei: 0n,
              valueWei: 0n,
              costWei: 0n,
              costMeasured: true,
              costToken: null,
              once: true,
              meta: { account, fn: 'lpWithdraw', tokenId: String(id), symbol: p.symbol, reason: 'collect' }
            })
          }
        }
      }
    }
    return items
  },

  async report({ client, cfg, job, ledger }): Promise<ReportLine[]> {
    const lines: ReportLine[] = []
    try {
      const brain = await loadLpBrain(job.brain.dir)
      const cash = job.tokens[job.cashSymbol]!
      for (const id of job.tokenIds) {
        const account = (await client.readContract({
          address: cfg.target.address,
          abi: nftAbi,
          functionName: 'accountOf',
          args: [id]
        })) as Address
        const positions = (await client.readContract({
          address: account,
          abi: accountAbi,
          functionName: 'lpPositions'
        })) as ReadonlyArray<{ key: PoolKeyT; tickLower: number; tickUpper: number }>
        const fuse = ledger.kvGet(`harvester.fuse.${id}`)
        lines.push({
          name: `#${id} vault`,
          value: `${account.slice(0, 10)}… ${positions.length} open position(s)${fuse ? ' FUSE BLOWN' : ''}`,
          level: fuse ? 'bad' : 'ok'
        })
        for (const p of job.pools) {
          const stock = job.tokens[p.symbol]!
          const ref = positions.find(
            (x) => x.key.currency1.toLowerCase() === (stock.address as string).toLowerCase() && x.key.fee === p.fee
          )
          if (!ref) {
            lines.push({ name: `#${id} ${p.symbol}`, value: 'flat (no position)' })
            continue
          }
          const key = poolKeyFor(job, p)
          const slot0 = await brain.readSlot0(client, job.poolManager as Address, key)
          const inRange = slot0.tick >= ref.tickLower && slot0.tick < ref.tickUpper
          lines.push({
            name: `#${id} ${p.symbol}`,
            value: `[${ref.tickLower},${ref.tickUpper}] tick ${slot0.tick} ${inRange ? 'in range' : 'OUT OF RANGE'}`,
            level: inRange ? 'ok' : 'warn'
          })
        }
      }
    } catch (e) {
      lines.push({ name: 'harvester', value: (e as Error).message, level: 'bad' })
    }
    return lines
  }
}
