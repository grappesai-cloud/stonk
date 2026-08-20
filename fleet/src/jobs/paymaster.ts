/**
 * PAYMASTER: the fleet's hands on the fee pipeline.
 *
 * The coin's creator fees land in the Treasury as ETH. This job turns them
 * into funded agents, in two moves it repeats forever:
 *
 *   1. FLUSH   Treasury.flush(minOut): swap all held ETH to USDG through the
 *              canonical v4 route and deposit it into the RewardDistributor.
 *              Operator-gated on chain, because whoever flushes picks the
 *              timing and the price floor. This process holds that key.
 *   2. CLAIM   RewardDistributor.claimMany(ids): push every agent's share
 *              into its own vault. Permissionless on chain; we pay the gas as
 *              a service. There is no way to redirect a cent: claim() has no
 *              destination parameter.
 *
 * Cadence is windows, not a clock: `windowsPerDay` slices the UTC day, and
 * the ledger's once-per-key rule means each window flushes at most once, no
 * matter how many runs happen inside it. Launch day runs 4 windows; steady
 * state runs 1. Claims computed in the same run as a flush see the balances
 * from BEFORE it confirmed, so a freshly flushed deposit is claimed on the
 * next run, minutes later. That lag is deliberate: correctness over haste.
 *
 * Money never sits on this key. It flows Treasury -> Distributor -> vaults,
 * all of it on chain, and the worst a stolen paymaster key can do is flush at
 * a bad price, bounded by the pool's depth and the guard's floor.
 */
import { z } from 'zod'
import { parseAbi, type Address, type PublicClient } from 'viem'
import { zAddress, zBig, type Config } from '../core/config.js'
import { batchRead } from '../core/chain/batch.js'
import { log } from '../core/log.js'
import {
  STRANGER,
  type DiscoverInput,
  type Job,
  type JobCheck,
  type ReportLine,
  type Target,
  type WorkItem
} from '../core/work.js'

const ZERO = '0x0000000000000000000000000000000000000000'

export const PaymasterSchema = z.object({
  /** the Treasury this process is the operator of */
  treasury: zAddress,
  /** the RewardDistributor the Treasury deposits into */
  distributor: zAddress,
  /** the AgentNFT collection, for nextId (how many agents can claim) */
  collection: zAddress,
  usdg: z
    .object({ address: zAddress, decimals: z.number().int().min(0).max(36).default(6) }),
  /**
   * How ETH amounts are valued in USD: a Chainlink feed if one exists, else a
   * static rate. Needed for the flush floor (minUsdgOut) and for pricing the
   * slippage allowance as a measured cost.
   */
  eth: z
    .object({
      feed: zAddress.nullable().default(null),
      usd8: zBig.default(0n)
    })
    .default({}),
  /** how far below fair value the flush swap may fill */
  maxSlippageBps: z.number().int().min(1).max(2000).default(150),
  /** dust threshold: below this, ETH waits for the next window instead of burning gas */
  minFlushWei: zBig.default(200_000_000_000_000n),
  /** how many flush windows per UTC day (launch day 4, steady state 1) */
  windowsPerDay: z.number().int().min(1).max(24).default(1),
  /** how many tokenIds per claimMany transaction */
  claimBatch: z.number().int().min(1).max(200).default(25),
  /** skip claim rounds worth less than this (USDG base units) */
  minClaimTotal: zBig.default(10_000n),
  /** hard cap on how many tokenIds to scan, a runaway backstop */
  maxTokens: z.number().int().min(1).max(10_000).default(2000)
})

export type PaymasterJob = z.infer<typeof PaymasterSchema>

const treasuryAbi = parseAbi([
  'function flush(uint256 minUsdgOut) returns (uint256)',
  'function operator() view returns (address)',
  'function distributor() view returns (address)',
  'error NotOperator()',
  'error NothingToFlush()',
  'error InsufficientOutput()',
  'error SwapFailed()'
])
const distributorAbi = parseAbi([
  'function claimMany(uint256[] tokenIds) returns (uint256)',
  'function claimable(uint256 tokenId) view returns (uint256)',
  'function totalDeposited() view returns (uint256)',
  'function nft() view returns (address)',
  'error NoAgents()',
  'error NothingToClaim()'
])
const collectionAbi = parseAbi(['function nextId() view returns (uint256)'])
const feedAbi = parseAbi([
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)',
  'function decimals() view returns (uint8)'
])
const erc20Abi = parseAbi(['function balanceOf(address a) view returns (uint256)'])

/** ETH/USD (8 decimals) from the feed if set, else the static rate; 0 = unknown */
async function ethUsd8(client: PublicClient, job: PaymasterJob): Promise<bigint> {
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

/** USD (8 decimals) -> native wei at the given rate; 0 when there is no rate */
function usdToWei(usd8: bigint, rate8: bigint): bigint {
  if (rate8 <= 0n) return 0n
  return (usd8 * 10n ** 18n) / rate8
}

/** the flush window this moment falls into, so once-per-key gives once-per-window */
export function windowOf(now: Date, windowsPerDay: number): { day: string; w: number } {
  const day = now.toISOString().slice(0, 10)
  const w = Math.floor(now.getUTCHours() / (24 / windowsPerDay))
  return { day, w }
}

/** the USDG floor for swapping `ethWei` at `rate8`, `slippageBps` below fair */
export function flushFloor(ethWei: bigint, rate8: bigint, usdgDecimals: number, slippageBps: number): bigint {
  const usd8 = (ethWei * rate8) / 10n ** 18n
  const fair = (usd8 * 10n ** BigInt(usdgDecimals)) / 10n ** 8n
  return (fair * BigInt(10_000 - slippageBps)) / 10_000n
}

export const paymaster: Job<PaymasterJob> = {
  kind: 'paymaster',
  /** flush is operator-gated by design; a refused stranger is the healthy state */
  actsOnOwnPosition: true,

  parse(raw) {
    const p = PaymasterSchema.safeParse(raw ?? {})
    if (!p.success) {
      const lines = p.error.issues.map((i) => `  job.${i.path.join('.') || '(root)'}: ${i.message}`)
      throw new Error(`invalid paymaster job config:\n${lines.join('\n')}`)
    }
    return p.data
  },

  required(cfg, job) {
    return [
      { what: 'treasury', address: job.treasury },
      { what: 'reward distributor', address: job.distributor },
      { what: 'agent collection', address: job.collection }
    ]
  },

  /** flush goes to the treasury, claims go to the distributor; meta.fn decides */
  target(cfg, job, item?): Target {
    if (item?.meta.fn === 'claimMany') {
      return { address: job.distributor, abi: distributorAbi as never, functionName: 'claimMany' }
    }
    return { address: job.treasury, abi: treasuryAbi as never, functionName: 'flush' }
  },

  async authority(client, cfg, job) {
    try {
      return await client.readContract({ address: job.treasury, abi: treasuryAbi, functionName: 'operator' })
    } catch {
      return null
    }
  },

  async discover({ client, cfg, job }): Promise<WorkItem[]> {
    const items: WorkItem[] = []
    const { day, w } = windowOf(new Date(), job.windowsPerDay)

    const [ethBal, usdgHeld] = await Promise.all([
      client.getBalance({ address: job.treasury }),
      client.readContract({
        address: job.usdg.address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [job.treasury]
      })
    ])

    // ---- flush: only when there is something worth converting
    if (ethBal >= job.minFlushWei || usdgHeld > 0n) {
      const rate8 = await ethUsd8(client, job)
      if (ethBal > 0n && rate8 <= 0n) {
        /* an unpriced swap cannot have a floor; standing down beats flushing blind */
        log.error('ETH is waiting in the treasury but there is no ETH/USD rate to set the floor with')
      } else {
        const minOut = ethBal > 0n ? flushFloor(ethBal, rate8, job.usdg.decimals, job.maxSlippageBps) : 0n
        const inUsd8 = (ethBal * rate8) / 10n ** 18n
        const lossUsd8 = (inUsd8 * BigInt(job.maxSlippageBps)) / 10_000n
        items.push({
          key: `flush:${day}:${w}`,
          label: `FLUSH ${Number(ethBal) / 1e18 > 0 ? (Number(ethBal) / 1e18).toFixed(5) : '0'} ETH`,
          args: [minOut],
          rewardWei: 0n,
          rewardMeasured: false,
          stakeWei: ethBal,
          valueWei: 0n,
          /* the cost is the slippage allowance: what we may lose against fair value */
          costWei: usdToWei(lossUsd8, rate8),
          costMeasured: ethBal === 0n || rate8 > 0n,
          costToken: null,
          once: true,
          meta: { fn: 'flush', ethWei: ethBal.toString(), minOut: minOut.toString(), day, window: String(w) }
        })
      }
    }

    // ---- claims: whoever is owed, gets paid into their vault
    const nextId = await client.readContract({ address: job.collection, abi: collectionAbi, functionName: 'nextId' })
    const count = Math.min(Number(nextId) - 1, job.maxTokens)
    if (count <= 0) return items

    const claimables = await batchRead(
      client,
      cfg.network.multicall3,
      Array.from({ length: count }, (_, i) => ({
        address: job.distributor,
        abi: distributorAbi as never,
        functionName: 'claimable',
        args: [BigInt(i + 1)]
      }))
    )
    const owed: { id: bigint; amount: bigint }[] = []
    for (let i = 0; i < count; i++) {
      const c = claimables[i]
      if (typeof c === 'bigint' && c > 0n) owed.push({ id: BigInt(i + 1), amount: c })
    }
    const total = owed.reduce((s, o) => s + o.amount, 0n)
    if (owed.length === 0 || total < job.minClaimTotal) return items

    for (let i = 0; i < owed.length; i += job.claimBatch) {
      const batch = owed.slice(i, i + job.claimBatch)
      items.push({
        key: `claim:${day}:${w}:${i / job.claimBatch}`,
        label: `CLAIM ${batch.length} agent(s)`,
        args: [batch.map((b) => b.id)],
        rewardWei: 0n,
        rewardMeasured: false,
        stakeWei: 0n,
        valueWei: 0n,
        /* nothing leaves this key but gas: the money moves distributor -> vaults */
        costWei: 0n,
        costMeasured: true,
        costToken: null,
        once: true,
        meta: {
          fn: 'claimMany',
          ids: batch.map((b) => b.id.toString()).join(','),
          totalUsdg: batch.reduce((s, b) => s + b.amount, 0n).toString(),
          day,
          window: String(w)
        }
      })
    }
    return items
  },

  async checks({ client, cfg, job, from }): Promise<JobCheck[]> {
    const checks: JobCheck[] = []

    let operator: Address | null = null
    try {
      operator = await client.readContract({ address: job.treasury, abi: treasuryAbi, functionName: 'operator' })
    } catch (e) {
      checks.push({ name: 'treasury', ok: false, detail: `cannot read the treasury: ${(e as Error).message}`, fatal: true })
      return checks
    }
    const isOperator = operator.toLowerCase() === from.toLowerCase()
    checks.push({
      name: 'operator key',
      ok: isOperator,
      detail: isOperator
        ? `${from} is the treasury's flush operator`
        : from.toLowerCase() === STRANGER.toLowerCase()
          ? `no key loaded; the treasury expects ${operator}`
          : `the treasury expects ${operator}, this process signs as ${from}. Every flush would revert.`,
      fatal: isOperator ? false : from.toLowerCase() !== STRANGER.toLowerCase()
    })

    try {
      const wired = await client.readContract({ address: job.treasury, abi: treasuryAbi, functionName: 'distributor' })
      const ok = wired.toLowerCase() === job.distributor.toLowerCase()
      checks.push({
        name: 'treasury -> distributor',
        ok,
        detail: ok ? 'deposits land in the configured distributor' : `the treasury deposits into ${wired}, config says ${job.distributor}`,
        fatal: !ok
      })
    } catch (e) {
      checks.push({ name: 'treasury -> distributor', ok: false, detail: (e as Error).message, fatal: true })
    }

    try {
      const nft = await client.readContract({ address: job.distributor, abi: distributorAbi, functionName: 'nft' })
      const ok = nft.toLowerCase() === job.collection.toLowerCase()
      checks.push({
        name: 'distributor -> collection',
        ok,
        detail: ok ? 'claims pay the configured collection\'s vaults' : `the distributor pays ${nft}, config says ${job.collection}`,
        fatal: !ok
      })
    } catch (e) {
      checks.push({ name: 'distributor -> collection', ok: false, detail: (e as Error).message, fatal: true })
    }

    const rate8 = await ethUsd8(client, job)
    checks.push({
      name: 'ETH is priced',
      ok: rate8 > 0n,
      detail:
        rate8 > 0n
          ? `1 ETH = ${rate8} (usd, 8 decimals) for the flush floor`
          : 'no eth.feed and no eth.usd8: a flush cannot set its floor, so ETH would sit unconverted',
      fatal: rate8 <= 0n
    })

    return checks
  },

  /**
   * What the money pipeline is doing right now: what is waiting in the
   * treasury, what is sitting unclaimed, and what has flowed through in total.
   */
  async report({ client, cfg, job, ledger }): Promise<ReportLine[]> {
    const lines: ReportLine[] = []
    const [ethBal, usdgHeld, totalDeposited, nextId] = await Promise.all([
      client.getBalance({ address: job.treasury }),
      client.readContract({ address: job.usdg.address, abi: erc20Abi, functionName: 'balanceOf', args: [job.treasury] }),
      client.readContract({ address: job.distributor, abi: distributorAbi, functionName: 'totalDeposited' }),
      client.readContract({ address: job.collection, abi: collectionAbi, functionName: 'nextId' })
    ])
    const fmt6 = (v: bigint) => (Number(v) / 10 ** job.usdg.decimals).toFixed(job.usdg.decimals >= 2 ? 2 : 0)

    lines.push({
      name: 'treasury',
      value: `${(Number(ethBal) / 1e18).toFixed(6)} ETH + ${fmt6(usdgHeld)} USDG waiting`,
      level: ethBal >= job.minFlushWei * 10n ? 'warn' : undefined
    })
    lines.push({ name: 'distributed lifetime', value: `${fmt6(totalDeposited)} USDG across ${Number(nextId) - 1} agent(s)` })

    const count = Math.min(Number(nextId) - 1, job.maxTokens)
    if (count > 0) {
      const claimables = await batchRead(
        client,
        cfg.network.multicall3,
        Array.from({ length: count }, (_, i) => ({
          address: job.distributor,
          abi: distributorAbi as never,
          functionName: 'claimable',
          args: [BigInt(i + 1)]
        }))
      )
      const pending = claimables.reduce<bigint>((s, c) => s + (typeof c === 'bigint' ? c : 0n), 0n)
      lines.push({ name: 'unclaimed', value: `${fmt6(pending)} USDG (paid out next window)` })
    }

    const lastFlush = ledger.recentEvents(60).find((e) => e.kind === 'work' && e.key.startsWith('flush:'))
    lines.push({
      name: 'last flush',
      value: lastFlush ? `${lastFlush.key} (${new Date(lastFlush.at * 1000).toISOString().slice(0, 16)}Z)` : 'none yet'
    })
    return lines
  }
}
