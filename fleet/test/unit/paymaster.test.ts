import { describe, expect, it } from 'vitest'
import { ConfigSchema } from '../../src/core/config.js'
import { flushFloor, paymaster, windowOf } from '../../src/jobs/paymaster.js'

const TREASURY = '0x00000000000000000000000000000000000000e1'
const DISTRIBUTOR = '0x00000000000000000000000000000000000000d1'
const COLLECTION = '0x00000000000000000000000000000000000000c1'
const USDG = '0x0000000000000000000000000000000000000222'
const OPERATOR = '0x000000000000000000000000000000000000f00d'

const cfg = () =>
  ConfigSchema.parse({
    agent: { kind: 'paymaster' },
    network: { name: 'x', chainId: 4663, rpc: ['http://a.test'] },
    target: { address: TREASURY }
  })

const jobCfg = (over: Record<string, unknown> = {}) =>
  paymaster.parse({
    treasury: TREASURY,
    distributor: DISTRIBUTOR,
    collection: COLLECTION,
    usdg: { address: USDG, decimals: 6 },
    eth: { usd8: '230000000000' }, // $2300
    ...over
  })

interface FakeState {
  ethBal?: bigint
  usdgHeld?: bigint
  nextId?: bigint
  claimable?: Record<string, bigint>
  operator?: string
  wiredDistributor?: string
  wiredNft?: string
}

function clientFor(state: FakeState = {}) {
  return {
    async getBalance() {
      return state.ethBal ?? 0n
    },
    async readContract({ address, functionName, args }: { address: string; functionName: string; args?: unknown[] }) {
      const a = address.toLowerCase()
      if (a === USDG && functionName === 'balanceOf') return state.usdgHeld ?? 0n
      if (a === COLLECTION && functionName === 'nextId') return state.nextId ?? 1n
      if (a === DISTRIBUTOR) {
        if (functionName === 'claimable') return state.claimable?.[String(args?.[0])] ?? 0n
        if (functionName === 'totalDeposited') return 0n
        if (functionName === 'nft') return state.wiredNft ?? COLLECTION
      }
      if (a === TREASURY) {
        if (functionName === 'operator') return state.operator ?? OPERATOR
        if (functionName === 'distributor') return state.wiredDistributor ?? DISTRIBUTOR
      }
      throw new Error(`unexpected read: ${functionName} at ${address}`)
    }
  } as never
}

const input = (client: unknown, job: unknown, over: Record<string, unknown> = {}) =>
  ({ client, cfg: cfg(), job, ledger: null, from: OPERATOR, ...over }) as never

describe('paymaster: the flush window', () => {
  it('one window per day means one flush key per day', () => {
    const a = windowOf(new Date(Date.UTC(2026, 7, 21, 3, 0, 0)), 1)
    const b = windowOf(new Date(Date.UTC(2026, 7, 21, 22, 0, 0)), 1)
    expect(a).toEqual({ day: '2026-08-21', w: 0 })
    expect(b).toEqual({ day: '2026-08-21', w: 0 })
  })

  it('launch cadence: four windows slice the UTC day', () => {
    expect(windowOf(new Date(Date.UTC(2026, 7, 21, 0, 0)), 4).w).toBe(0)
    expect(windowOf(new Date(Date.UTC(2026, 7, 21, 6, 0)), 4).w).toBe(1)
    expect(windowOf(new Date(Date.UTC(2026, 7, 21, 13, 0)), 4).w).toBe(2)
    expect(windowOf(new Date(Date.UTC(2026, 7, 21, 23, 59)), 4).w).toBe(3)
  })
})

describe('paymaster: the flush floor', () => {
  it('prices the swap off the ETH rate and shaves the slippage band', () => {
    // 0.0004 ETH at $2300 = $0.92; 150bps below = 0.9062 USDG
    const floor = flushFloor(400_000_000_000_000n, 230_000_000_000n, 6, 150)
    expect(floor).toBe(906_200n)
  })

  it('a zero rate yields a zero floor, which discover refuses to act on', () => {
    expect(flushFloor(1_000_000_000_000_000_000n, 0n, 6, 150)).toBe(0n)
  })
})

describe('paymaster: discovery', () => {
  it('dust waits: below minFlushWei nothing is proposed', async () => {
    const items = await paymaster.discover(input(clientFor({ ethBal: 100n }), jobCfg()))
    expect(items).toHaveLength(0)
  })

  it('ETH above the threshold becomes one flush item with a priced floor and a measured cost', async () => {
    const items = await paymaster.discover(input(clientFor({ ethBal: 400_000_000_000_000n }), jobCfg()))
    expect(items).toHaveLength(1)
    const it0 = items[0]!
    expect(it0.key).toMatch(/^flush:\d{4}-\d{2}-\d{2}:\d+$/)
    expect(it0.once).toBe(true)
    expect(it0.meta.fn).toBe('flush')
    expect(it0.args[0]).toBe(906_200n)
    expect(it0.costMeasured).toBe(true)
    expect(it0.costWei).toBeGreaterThan(0n)
  })

  it('ETH with no rate is refused instead of flushed blind', async () => {
    const items = await paymaster.discover(
      input(clientFor({ ethBal: 400_000_000_000_000n }), jobCfg({ eth: { usd8: '0' } }))
    )
    expect(items).toHaveLength(0)
  })

  it('USDG sitting in the treasury flushes even with zero ETH', async () => {
    const items = await paymaster.discover(input(clientFor({ usdgHeld: 500_000n }), jobCfg()))
    expect(items).toHaveLength(1)
    expect(items[0]!.args[0]).toBe(0n) // no swap, no floor needed
  })

  it('claims batch the owed tokens and skip the ones with nothing', async () => {
    const items = await paymaster.discover(
      input(
        clientFor({
          nextId: 6n,
          claimable: { '1': 100_000n, '3': 50_000n, '5': 1n }
        }),
        jobCfg({ claimBatch: 2 })
      )
    )
    // no flush (treasury empty); claims: owed = [1,3,5] -> batches [1,3], [5]
    expect(items).toHaveLength(2)
    expect(items[0]!.meta.fn).toBe('claimMany')
    expect(items[0]!.args[0]).toEqual([1n, 3n])
    expect(items[1]!.args[0]).toEqual([5n])
    expect(items[0]!.costWei).toBe(0n)
    expect(items[0]!.costMeasured).toBe(true)
  })

  it('a claim round below the dust threshold waits for more', async () => {
    const items = await paymaster.discover(
      input(clientFor({ nextId: 3n, claimable: { '1': 100n } }), jobCfg({ minClaimTotal: '10000' }))
    )
    expect(items).toHaveLength(0)
  })
})

describe('paymaster: the doctor', () => {
  it('a wrong operator key is fatal and names what the treasury expects', async () => {
    const checks = await paymaster.checks!(
      input(clientFor({}), jobCfg(), { from: '0x000000000000000000000000000000000000beef' })
    )
    const c = checks.find((x) => x.name === 'operator key')!
    expect(c.ok).toBe(false)
    expect(c.fatal).toBe(true)
    expect(c.detail).toContain(OPERATOR)
  })

  it('a mis-wired distributor is fatal: deposits would land in a contract we do not pay claims on', async () => {
    const checks = await paymaster.checks!(
      input(clientFor({ wiredDistributor: '0x000000000000000000000000000000000000dead' }), jobCfg())
    )
    const c = checks.find((x) => x.name === 'treasury -> distributor')!
    expect(c.ok).toBe(false)
    expect(c.fatal).toBe(true)
  })

  it('when everything is wired, the doctor says so', async () => {
    const checks = await paymaster.checks!(input(clientFor({}), jobCfg()))
    expect(checks.filter((c) => !c.ok)).toHaveLength(0)
  })
})

describe('paymaster: targets', () => {
  it('flush goes to the treasury, claims go to the distributor', () => {
    const job = jobCfg()
    const flush = paymaster.target(cfg(), job, { meta: { fn: 'flush' } } as never)
    expect(flush.address.toLowerCase()).toBe(TREASURY)
    expect(flush.functionName).toBe('flush')
    const claim = paymaster.target(cfg(), job, { meta: { fn: 'claimMany' } } as never)
    expect(claim.address.toLowerCase()).toBe(DISTRIBUTOR)
    expect(claim.functionName).toBe('claimMany')
  })
})
