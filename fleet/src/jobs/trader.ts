/**
 * TRADER: mainile flotei pe Financial NFA. Roteste vault-ul unui NFT intre
 * actiuni tokenizate, dupa ACELEASI semnale ca backtest-ul.
 *
 * E singurul agent din flota care lucreaza pe contractele NOASTRE, nu pe ale
 * altora. Asta schimba doua lucruri:
 *  - intrebarea de la pasul zero nu e "poate un strain?", ci "putem NOI?":
 *    executeTrade e rezervata cheii de agent a NFT-ului, si un strain respins
 *    e semn ca protocolul e in regula (aceeasi distinctie ca la Lobbyist).
 *  - frana adevarata sta IN contract (allowlist, plafoane USD, slippage vs
 *    oracol, cooldown, pauza). Ce adauga flota e ce contractul nu poate sti:
 *    registrul cu fiecare decizie, bugetele zilnice ale operatorului, cainele
 *    de paza, si refuzul implicit cand o cifra nu poate fi masurata.
 *
 * CREIERUL NU STA AICI. Repo-ul asta e public; strategiile sunt exact partea
 * care nu are voie sa fie. Semnalele, datele si encodarea traiesc in repo-ul
 * privat financial-nfa si se incarca la pornire de pe disc (job.brain.dir,
 * montat in container, trecut prin .gitignore). Fara creier, agentul sta si
 * spune de ce; nu exista o copie "de rezerva" care sa poata devia de la
 * backtest sau sa scurga alpha in git.
 *
 * Un agent = UN NFT. Cheia fiecarui NFT sta in procesul lui, deci un leak
 * compromite un vault, nu flota. Al doilea NFT inseamna inca o configurare,
 * nu cod nou.
 *
 * Costul unei rotatii nu e marfa (marfa ramane in vault, schimbata pe alta),
 * e ALUNECAREA: cat avem voie sa pierdem fata de pretul de oracol, adica
 * exact marja pe care o tolereaza minAmountOut. Aia se masoara inainte, se
 * scrie in registru si se aduna in bugetul zilnic de cheltuiala.
 */
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { parseAbi, type Address, type Hex, type PublicClient } from 'viem'
import { abiWithErrors, zAddress, zBig, type Config } from '../core/config.js'
import { log } from '../core/log.js'
import type { DiscoverInput, Job, JobCheck, Target, WorkItem } from '../core/work.js'

const ZERO = '0x0000000000000000000000000000000000000000'

// ---- formele creierului: doar TIPURILE stau aici, implementarea e privata

export type Bar = { t: number; c: number }
export type Series = Record<string, Bar[]>
export interface Signal {
  id: number
  name: string
  warmup: number
  target(s: Series, i: number, current: string): string
}
export type PoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }
export type TradeIntent = {
  tokenIn: Address
  tokenOut: Address
  amountIn: bigint
  minAmountOut: bigint
  poolKey: PoolKey
  hookData: Hex
}

export interface Brain {
  CASH: string
  SIGNALS: Record<number, Signal>
  ALL_SYMBOLS: string[]
  ROTOR_UNI: string[]
  OCTANE: string[]
  loadSeries(symbols: string[], range: string, cacheDir: string): Promise<Series>
  encodeTrade(t: TradeIntent): Hex
  poolKey(a: Address, b: Address, fee: number, tickSpacing: number, hooks: Address): PoolKey
}

const brains = new Map<string, Brain>()

/**
 * Incarca creierul din financial-nfa: intai build-ul (dist/, singurul care
 * merge sub node simplu, deci in container), apoi sursa TS (tsx, dezvoltare).
 *
 * Verificam fiecare bucata pe nume: un creier incomplet care ar crapa abia la
 * prima rotatie e mai rau decat unul refuzat la pornire.
 */
export async function loadBrain(dir: string): Promise<Brain> {
  const cached = brains.get(dir)
  if (cached) return cached
  const root = resolve(dir)
  const layouts = [
    { signals: 'dist/src/backtest/signals.js', data: 'dist/src/backtest/data.js', trade: 'dist/src/trade.js' },
    { signals: 'src/backtest/signals.ts', data: 'src/backtest/data.ts', trade: 'src/trade.ts' }
  ]
  for (const l of layouts) {
    if (!existsSync(join(root, l.signals))) continue
    const [sig, dat, trd] = await Promise.all([
      import(pathToFileURL(join(root, l.signals)).href),
      import(pathToFileURL(join(root, l.data)).href),
      import(pathToFileURL(join(root, l.trade)).href)
    ])
    const brain: Brain = {
      CASH: sig.CASH,
      SIGNALS: sig.SIGNALS,
      ALL_SYMBOLS: sig.ALL_SYMBOLS,
      ROTOR_UNI: sig.ROTOR_UNI,
      OCTANE: sig.OCTANE,
      loadSeries: dat.loadSeries,
      encodeTrade: trd.encodeTrade,
      poolKey: trd.poolKey
    }
    const missing = (Object.keys(brain) as Array<keyof Brain>).filter((k) => brain[k] === undefined)
    if (missing.length > 0) {
      throw new Error(`the brain at ${root} is missing ${missing.join(', ')}: wrong or outdated financial-nfa checkout`)
    }
    brains.set(dir, brain)
    return brain
  }
  throw new Error(
    `no brain at ${root}: expected dist/src/backtest/signals.js (built) or src/backtest/signals.ts (source). ` +
      `The strategies live in the PRIVATE financial-nfa repo; mount it there, never commit it here.`
  )
}

/** doar pentru teste: un creier deja construit, fara disc */
export function plantBrain(dir: string, brain: Brain): void {
  brains.set(dir, brain)
}

export const TraderSchema = z.object({
  /** NFT-ul operat de instanta asta; al doilea NFT = alta configurare, alt proces, alta cheie */
  tokenId: zBig,
  /** StrategyRegistry: politici, rute canonice de pool, circuit-breaker global */
  registry: zAddress,
  /** de unde se incarca creierul privat */
  brain: z.object({ dir: z.string().default('./brain') }).default({}),
  tokens: z.record(
    z.string(),
    z.object({
      address: zAddress,
      decimals: z.number().int().min(0).max(36),
      /** feed-ul Chainlink al actiunii; adresa zero = nu exista (ex. cash-ul) */
      feed: zAddress.nullable().default(null)
    })
  ),
  /**
   * Cum se pun in ETH sumele care sunt in USD.
   *
   * Plafoanele flotei (maxCostPerJobWei, dailySpendBudgetWei) sunt in wei, dar
   * alunecarea unei rotatii se masoara in USD din oracole. Fara un curs, costul
   * nu poate fi masurat, si un cost nemasurat se refuza implicit — de aia lipsa
   * ambelor surse e semnalata la doctor, nu descoperita dupa o luna in jurnal.
   */
  eth: z
    .object({
      /** feed Chainlink ETH/USD, daca exista pe lant; are intaietate */
      feed: zAddress.nullable().default(null),
      /** curs static (USD cu 8 zecimale), plasa de siguranta cand nu e feed */
      usd8: zBig.default(0n)
    })
    .default({}),
  history: z.object({
    range: z.string().default('1y'),
    /**
     * Cache-ul de preturi e datat pe zi (UTC). Lectia din financial-nfa: un
     * cache care nu expira niciodata inseamna un bot care tranzactioneaza la
     * nesfarsit pe bare inghetate din ziua primului fetch.
     */
    cacheDir: z.string().default('./data/prices-live')
  }).default({})
})

export type TraderJob = z.infer<typeof TraderSchema>

const nftAbi = parseAbi([
  'function nextId() view returns (uint256)',
  'function strategyOf(uint256 id) view returns (uint16)',
  'function accountOf(uint256 id) view returns (address)'
])
const accountAbi = parseAbi([
  'function agentSigner() view returns (address)',
  'function paused() view returns (bool)'
])
const registryAbi = parseAbi([
  'function policyOf(uint16 id) view returns ((uint256 maxTradeUsd, uint256 maxDailyUsd, uint32 maxSlippageBps, uint32 cooldownSec, uint32 maxStaleSec, bool exists))',
  'function routeOf(address a, address b) view returns ((uint24 fee, int24 tickSpacing, address hooks, bool exists))',
  'function paused() view returns (bool)'
])
const feedAbi = parseAbi([
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)',
  'function decimals() view returns (uint8)'
])
const erc20Abi = parseAbi(['function balanceOf(address a) view returns (uint256)'])

interface NftState {
  account: Address
  strategyId: number
  agentSigner: Address
  paused: boolean
  globallyPaused: boolean
}

async function nftState(client: PublicClient, cfg: Config, job: TraderJob): Promise<NftState> {
  const [strategyId, account] = await Promise.all([
    client.readContract({ address: cfg.target.address, abi: nftAbi, functionName: 'strategyOf', args: [job.tokenId] }),
    client.readContract({ address: cfg.target.address, abi: nftAbi, functionName: 'accountOf', args: [job.tokenId] })
  ])
  const [agentSigner, paused, globallyPaused] = await Promise.all([
    client.readContract({ address: account, abi: accountAbi, functionName: 'agentSigner' }),
    client.readContract({ address: account, abi: accountAbi, functionName: 'paused' }),
    client.readContract({ address: job.registry, abi: registryAbi, functionName: 'paused' })
  ])
  return { account, strategyId: Number(strategyId), agentSigner, paused, globallyPaused }
}

function hasFeed(tok: { feed: Address | null } | undefined): tok is { feed: Address } {
  return !!tok?.feed && tok.feed.toLowerCase() !== ZERO
}

interface Price {
  usd8: bigint
  stale: boolean
}

/**
 * Pretul unui simbol in USD cu 8 zecimale, normalizat de la zecimalele feed-ului.
 *
 * Cash-ul fara feed valoreaza $1 si nu e niciodata vechi. Fara regula asta,
 * vault-ul proaspat mintat (100% cash) nu are pret pentru piciorul de intrare
 * si prima rotatie nu pleaca NICIODATA — exact bug-ul cu care a trait runner-ul
 * vechi din financial-nfa: activul dominant sarea peste USDG ca "fara feed" si
 * botul tinea cash-ul la nesfarsit, cu semnal de cumparare cu tot.
 */
async function priceOf(
  client: PublicClient,
  job: TraderJob,
  cash: string,
  sym: string,
  maxStaleSec: number,
  nowSec: bigint
): Promise<Price> {
  const tok = job.tokens[sym]
  if (!hasFeed(tok)) {
    if (sym === cash) return { usd8: 100_000_000n, stale: false }
    throw new Error(`no feed for ${sym}`)
  }
  const [round, decimals] = await Promise.all([
    client.readContract({ address: tok.feed, abi: feedAbi, functionName: 'latestRoundData' }),
    client.readContract({ address: tok.feed, abi: feedAbi, functionName: 'decimals' })
  ])
  const answer = round[1]
  const updatedAt = round[3]
  const usd8 =
    decimals === 8 ? answer : decimals < 8 ? answer * 10n ** BigInt(8 - decimals) : answer / 10n ** BigInt(decimals - 8)
  return { usd8, stale: nowSec > updatedAt + BigInt(maxStaleSec) }
}

/** valoarea in USD (8 zecimale) a unei sume de token */
function usdValue(amount: bigint, tokenDecimals: number, usd8: bigint): bigint {
  return (amount * usd8) / 10n ** BigInt(tokenDecimals)
}

/** cursul ETH/USD (8 zecimale) pentru contabilitate; 0 = nu avem de unde */
async function ethUsd8(client: PublicClient, job: TraderJob): Promise<bigint> {
  if (job.eth.feed && job.eth.feed.toLowerCase() !== ZERO) {
    try {
      const [round, decimals] = await Promise.all([
        client.readContract({ address: job.eth.feed, abi: feedAbi, functionName: 'latestRoundData' }),
        client.readContract({ address: job.eth.feed, abi: feedAbi, functionName: 'decimals' })
      ])
      const answer = round[1]
      return decimals === 8
        ? answer
        : decimals < 8
          ? answer * 10n ** BigInt(8 - decimals)
          : answer / 10n ** BigInt(decimals - 8)
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'ETH/USD feed unreadable, falling back to the static rate')
    }
  }
  return job.eth.usd8
}

/** USD (8 zecimale) -> wei nativi, la cursul dat; 0 cand nu exista curs */
function usdToWei(usd8: bigint, rate8: bigint): bigint {
  if (rate8 <= 0n) return 0n
  return (usd8 * 10n ** 18n) / rate8
}

/**
 * Activul dominant din vault: cel cu cea mai mare valoare USD, cash inclus.
 * Vault-ul detine UN activ la un moment dat (rotatii all-in); restul e praf.
 */
async function dominantAsset(
  client: PublicClient,
  job: TraderJob,
  cash: string,
  account: Address,
  maxStaleSec: number,
  nowSec: bigint
): Promise<{ current: string; balance: bigint; price: Price }> {
  let best = cash
  let bestUsd = -1n
  let bestBal = 0n
  let bestPrice: Price = { usd8: 100_000_000n, stale: false }
  for (const sym of Object.keys(job.tokens)) {
    const tok = job.tokens[sym]!
    if (!hasFeed(tok) && sym !== cash) continue
    const bal = await client.readContract({ address: tok.address, abi: erc20Abi, functionName: 'balanceOf', args: [account] })
    if (bal === 0n) continue
    const p = await priceOf(client, job, cash, sym, maxStaleSec, nowSec)
    const usd = usdValue(bal, tok.decimals, p.usd8)
    if (usd > bestUsd) {
      bestUsd = usd
      best = sym
      bestBal = bal
      bestPrice = p
    }
  }
  return { current: best, balance: bestBal, price: bestPrice }
}

/** in ce simboluri poate ateriza strategia; portile (SPY/QQQ pe post de regim) nu apar aici */
export function tradableTargets(strategyId: number, brain: Brain): string[] {
  switch (strategyId) {
    case 1:
      return ['NVDA', 'TSLA']
    case 3:
    case 4:
      return ['SPY']
    case 6:
    case 8:
      return [...brain.ROTOR_UNI]
    case 7:
      return [...new Set([...brain.ROTOR_UNI, ...brain.OCTANE])]
    default:
      return []
  }
}

/** istoricul zilei, din cache-ul datat; expus separat ca doctor sa il poata proba */
export async function seriesOfToday(job: TraderJob, brain: Brain): Promise<{ series: Series; last: number }> {
  const day = new Date().toISOString().slice(0, 10)
  const series = await brain.loadSeries(brain.ALL_SYMBOLS, job.history.range, `${job.history.cacheDir}/${day}`)
  const last = Math.min(...Object.values(series).map((b) => b.length)) - 1
  return { series, last }
}

export const trader: Job<TraderJob> = {
  kind: 'trader',
  /** executeTrade e a cheii de agent; un strain respins e protocolul functionand */
  actsOnOwnPosition: true,

  parse(raw) {
    const p = TraderSchema.safeParse(raw ?? {})
    if (!p.success) {
      const lines = p.error.issues.map((i) => `  job.${i.path.join('.') || '(root)'}: ${i.message}`)
      throw new Error(`invalid trader job config:\n${lines.join('\n')}`)
    }
    return p.data
  },

  required(cfg, job) {
    return [
      { what: 'AgentNFT collection', address: cfg.target.address },
      { what: 'strategy registry', address: job.registry }
    ]
  },

  /**
   * Tinta e contul 6551 al NFT-ului, aflat abia la descoperire; pe bucata vine
   * din meta. Fara bucata (probele generice) ramane colectia din configurare.
   */
  target(cfg, job, item?): Target {
    const abi = abiWithErrors(
      'function executeTrade(bytes params) returns (uint256 amountOut)',
      cfg.target.errorSignatures,
      'trader executeTrade'
    )
    const address = (item?.meta.account as Address | undefined) ?? cfg.target.address
    return { address, abi, functionName: 'executeTrade' }
  },

  async authority(client, cfg, job) {
    try {
      const s = await nftState(client, cfg, job)
      return s.agentSigner
    } catch {
      return null
    }
  },

  async discover({ client, cfg, job, from }): Promise<WorkItem[]> {
    const tag = `#${job.tokenId}`
    let brain: Brain
    try {
      brain = await loadBrain(job.brain.dir)
    } catch (e) {
      /* fara creier agentul sta pe loc si spune de ce, nu intra in bucla de
         caderi: e aceeasi filozofie ca asteptarea adreselor */
      log.error({ err: (e as Error).message }, `${tag} no brain, standing aside`)
      return []
    }
    const cash = brain.CASH
    if (!job.tokens[cash]) {
      log.error(`${tag} the cash token ${cash} is missing from job.tokens, cannot value the vault`)
      return []
    }

    const st = await nftState(client, cfg, job)
    if (st.agentSigner.toLowerCase() !== from.toLowerCase()) {
      log.warn({ agentSigner: st.agentSigner, from }, `${tag} the operator key is not the agent signer, nothing to do`)
      return []
    }
    if (st.paused || st.globallyPaused) {
      log.warn({ paused: st.paused, globallyPaused: st.globallyPaused }, `${tag} paused, standing aside`)
      return []
    }
    const sig = brain.SIGNALS[st.strategyId]
    if (!sig) {
      log.warn({ strategyId: st.strategyId }, `${tag} strategy is experimental or disabled, nothing to trade`)
      return []
    }

    const { series, last } = await seriesOfToday(job, brain)
    if (last < sig.warmup) {
      /* sub warmup, momentum/MA ies pe ferestre trunchiate: semnal degradat, mai bine stam */
      log.warn({ bars: last + 1, warmup: sig.warmup }, `${tag} not enough price history for ${sig.name}, holding`)
      return []
    }

    const policy = await client.readContract({
      address: job.registry,
      abi: registryAbi,
      functionName: 'policyOf',
      args: [st.strategyId]
    })
    if (!policy.exists) {
      log.warn({ strategyId: st.strategyId }, `${tag} strategy has no on-chain policy, nothing would pass the guard`)
      return []
    }

    const nowSec = (await client.getBlock()).timestamp
    const { current, balance, price: pin } = await dominantAsset(client, job, cash, st.account, policy.maxStaleSec, nowSec)
    const target = sig.target(series, last, current)

    if (target === current || balance === 0n) {
      log.info(`${tag} [${sig.name}] hold ${current}`)
      return []
    }
    const tin = job.tokens[current]
    const tout = job.tokens[target]
    if (!tin || !tout || (!hasFeed(tout) && target !== cash)) {
      log.warn(`${tag} [${sig.name}] no token or feed configured for ${current} -> ${target}, holding`)
      return []
    }
    const pout = await priceOf(client, job, cash, target, policy.maxStaleSec, nowSec)
    if (pin.stale || pout.stale) {
      /* fix fereastra de weekend: oracolul doarme, botul sta. Guard-ul ar respinge oricum. */
      log.warn(`${tag} [${sig.name}] oracle is stale for ${pin.stale ? current : target}, market is closed`)
      return []
    }

    /* ruta CANONICA din registry: fee/tickSpacing/hooks ale pool-ului cu lichiditate.
       PoolKey construit altfel e respins de guard (pool == perechea sortata). */
    const route = await client.readContract({
      address: job.registry,
      abi: registryAbi,
      functionName: 'routeOf',
      args: [tin.address, tout.address]
    })
    if (!route.exists) {
      log.warn(`${tag} [${sig.name}] no pool route for ${current}/${target}, holding`)
      return []
    }

    const inUsd = usdValue(balance, tin.decimals, pin.usd8)
    const fairOut = (inUsd * 10n ** BigInt(tout.decimals)) / pout.usd8
    const minOut = (fairOut * BigInt(10_000 - policy.maxSlippageBps)) / 10_000n
    const intent: TradeIntent = {
      tokenIn: tin.address,
      tokenOut: tout.address,
      amountIn: balance,
      minAmountOut: minOut,
      poolKey: brain.poolKey(tin.address, tout.address, route.fee, route.tickSpacing, route.hooks),
      hookData: '0x'
    }

    /* costul = cat avem voie sa pierdem fata de oracol: valoarea de intrare minus
       ce acceptam minim la iesire. Marfa nu e cost, se intoarce schimbata. */
    const minOutUsd = usdValue(minOut, tout.decimals, pout.usd8)
    const lossUsd8 = inUsd > minOutUsd ? inUsd - minOutUsd : 0n
    const rate8 = await ethUsd8(client, job)
    const day = new Date().toISOString().slice(0, 10)

    return [
      {
        key: `rotate:${job.tokenId}:${day}:${current}->${target}`,
        label: `ROTATE ${tag} ${current} -> ${target}`,
        args: [brain.encodeTrade(intent)],
        /* castigul unei rotatii e alpha-ul strategiei, nu se citeste inainte */
        rewardWei: 0n,
        rewardMeasured: false,
        stakeWei: usdToWei(inUsd, rate8),
        valueWei: 0n,
        costWei: usdToWei(lossUsd8, rate8),
        costMeasured: rate8 > 0n,
        costToken: null,
        /* aceeasi rotatie nu se trimite de doua ori in aceeasi zi; ziua urmatoare
           e alta cheie, deci alta decizie */
        once: true,
        meta: {
          account: st.account,
          strategy: sig.name,
          from: current,
          to: target,
          amountIn: balance.toString(),
          minAmountOut: minOut.toString(),
          inUsd8: inUsd.toString(),
          maxLossUsd8: lossUsd8.toString(),
          day
        }
      }
    ]
  },

  async checks({ client, cfg, job, from }): Promise<JobCheck[]> {
    const checks: JobCheck[] = []

    let brain: Brain | null = null
    try {
      brain = await loadBrain(job.brain.dir)
      checks.push({ name: 'brain', ok: true, detail: `strategies loaded from ${job.brain.dir}` })
    } catch (e) {
      checks.push({ name: 'brain', ok: false, detail: (e as Error).message, fatal: true })
      return checks
    }

    if (!job.tokens[brain.CASH]) {
      checks.push({
        name: 'cash token',
        ok: false,
        detail: `the brain trades against ${brain.CASH} but job.tokens has no entry for it`,
        fatal: true
      })
    }

    let st: NftState | null = null
    try {
      st = await nftState(client, cfg, job)
    } catch (e) {
      checks.push({
        name: 'nft state',
        ok: false,
        detail: `cannot read NFT #${job.tokenId} from the collection: ${(e as Error).message}`,
        fatal: true
      })
      return checks
    }

    const isSigner = st.agentSigner.toLowerCase() === from.toLowerCase()
    checks.push({
      name: 'operator key is the agent signer',
      ok: isSigner,
      detail: isSigner
        ? `${from} matches the on-chain agentSigner of NFT #${job.tokenId}`
        : `the 6551 account ${st.account} expects ${st.agentSigner}, this process signs as ${from}. ` +
          `Every executeTrade would revert. Set the per-NFT key of this instance.`,
      fatal: !isSigner
    })

    checks.push({
      name: 'account not paused',
      ok: !st.paused,
      detail: st.paused ? 'the owner paused this vault; the agent stands aside until unpaused' : 'live'
    })
    checks.push({
      name: 'global circuit breaker',
      ok: !st.globallyPaused,
      detail: st.globallyPaused ? 'the registry is globally paused, no vault can trade' : 'off'
    })

    const sig = brain.SIGNALS[st.strategyId]
    checks.push({
      name: 'strategy',
      ok: !!sig,
      detail: sig
        ? `#${st.strategyId} ${sig.name}, warmup ${sig.warmup} bars`
        : `strategy ${st.strategyId} has no signal implementation: this vault cannot be traded by the bot`,
      fatal: !sig
    })
    if (sig) {
      try {
        const policy = await client.readContract({
          address: job.registry,
          abi: registryAbi,
          functionName: 'policyOf',
          args: [st.strategyId]
        })
        checks.push({
          name: 'on-chain policy',
          ok: policy.exists,
          detail: policy.exists
            ? `slippage cap ${policy.maxSlippageBps}bps, cooldown ${policy.cooldownSec}s, oracle staleness ${policy.maxStaleSec}s`
            : `no policy registered for strategy ${st.strategyId}: the guard would refuse every trade`,
          fatal: !policy.exists
        })
      } catch (e) {
        checks.push({ name: 'on-chain policy', ok: false, detail: (e as Error).message, fatal: true })
      }

      const missing = tradableTargets(st.strategyId, brain).filter((s) => !hasFeed(job.tokens[s]))
      checks.push({
        name: 'universe tokens',
        ok: missing.length === 0,
        detail:
          missing.length === 0
            ? 'every symbol this strategy can land on has a token and a feed'
            : `${missing.join(', ')} missing token or feed in job.tokens: rotations into them will be skipped, ` +
              `and a skipped leg is a different strategy than the one that was backtested`
      })

      try {
        const { last } = await seriesOfToday(job, brain)
        checks.push({
          name: 'price history',
          ok: last >= sig.warmup,
          detail:
            last >= sig.warmup
              ? `${last + 1} daily bars cached for today, warmup ${sig.warmup} covered`
              : `${last + 1} bars is under the ${sig.warmup} bar warmup: the signal would be degraded, so the agent holds`
        })
      } catch (e) {
        checks.push({ name: 'price history', ok: false, detail: `cannot load daily bars: ${(e as Error).message}` })
      }
    }

    const rate8 = await ethUsd8(client, job)
    checks.push({
      name: 'ETH is priced',
      ok: rate8 > 0n,
      detail:
        rate8 > 0n
          ? `1 ETH = ${rate8} (usd, 8 decimals) for cost accounting`
          : 'no eth.feed and no eth.usd8: the slippage cost of a rotation cannot be valued in wei, ' +
            'and an unmeasured cost is refused by default. Set one of them.',
      fatal: rate8 <= 0n
    })

    if (cfg.policy.dailySpendBudgetWei === null) {
      checks.push({
        name: 'daily spend budget',
        ok: false,
        detail:
          'policy.dailySpendBudgetWei is not set: there is no ceiling on the slippage this agent may burn in a day. ' +
          "The on-chain guard caps each trade, but the daily total is the operator's rail."
      })
    }

    return checks
  }
}
