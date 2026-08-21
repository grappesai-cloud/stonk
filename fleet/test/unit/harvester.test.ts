import { describe, expect, it } from 'vitest'
import { ConfigSchema } from '../../src/core/config.js'
import { harvester, loadLpBrain } from '../../src/jobs/harvester.js'
import type { WorkItem } from '../../src/core/work.js'

const COLLECTION = '0x00000000000000000000000000000000000000c1'
const REGISTRY = '0x00000000000000000000000000000000000000b0'
const POOL_MANAGER = '0x00000000000000000000000000000000000000d0'
// USDG must sort BELOW the stock (currency0) - mirrors the real 4663 layout
const USDG_TOKEN = '0x0000000000000000000000000000000000000111'
const NVDA_TOKEN = '0x0000000000000000000000000000000000000999'
const NVDA_FEED = '0x0000000000000000000000000000000000000333'

const cfg = (over: Record<string, unknown> = {}) =>
  ConfigSchema.parse({
    agent: { kind: 'harvester' },
    network: { name: 'x', chainId: 4663, rpc: ['http://a.test'] },
    target: { address: COLLECTION, errorSignatures: ['error NotAgent()'] },
    ...over
  })

const jobRaw = (over: Record<string, unknown> = {}) => ({
  tokenIds: [1],
  registry: REGISTRY,
  poolManager: POOL_MANAGER,
  tokens: {
    USDG: { address: USDG_TOKEN, decimals: 6, feed: null },
    NVDA: { address: NVDA_TOKEN, decimals: 18, feed: NVDA_FEED }
  },
  pools: [
    { symbol: 'NVDA', fee: 3000, tickSpacing: 60, widthTicks: 200, weight: 0.4 }
  ],
  ...over
})

describe('harvester config', () => {
  it('parses a valid job and applies brake defaults', () => {
    const j = harvester.parse(jobRaw())
    expect(j.brakes.staleSec).toBe(3600)
    expect(j.brakes.feedJumpBps).toBe(150)
    expect(j.maxDrawdownBps).toBe(2000)
    expect(j.pools[0]!.maxShareOfActiveLBps).toBe(2000)
  })

  it('rejects pool weights above 1', () => {
    expect(() =>
      harvester.parse(
        jobRaw({
          pools: [
            { symbol: 'NVDA', fee: 3000, tickSpacing: 60, widthTicks: 200, weight: 0.7 },
            { symbol: 'NVDA', fee: 3000, tickSpacing: 60, widthTicks: 200, weight: 0.7 }
          ]
        })
      )
    ).toThrow(/weights/)
  })

  it('rejects an empty tokenIds list and a missing pools list', () => {
    expect(() => harvester.parse(jobRaw({ tokenIds: [] }))).toThrow()
    expect(() => harvester.parse(jobRaw({ pools: [] }))).toThrow()
  })
})

describe('harvester target', () => {
  const item = (fn: string): WorkItem => ({
    key: 'k',
    label: 'l',
    args: [],
    rewardWei: 0n,
    rewardMeasured: false,
    stakeWei: 0n,
    valueWei: 0n,
    costWei: 0n,
    costMeasured: true,
    costToken: null,
    meta: { account: '0x000000000000000000000000000000000000acc1', fn }
  })

  it('routes lpProvide and lpWithdraw to the vault named by the item', () => {
    const j = harvester.parse(jobRaw())
    const c = cfg()
    const add = harvester.target(c, j, item('lpProvide'))
    expect(add.functionName).toBe('lpProvide')
    expect(add.address).toBe('0x000000000000000000000000000000000000acc1')
    const wd = harvester.target(c, j, item('lpWithdraw'))
    expect(wd.functionName).toBe('lpWithdraw')
    // the safe default, with no item, is the exit door
    expect(harvester.target(c, j).functionName).toBe('lpWithdraw')
  })
})

describe('harvester brain', () => {
  it('refuses to run without the private brain and says where it looked', async () => {
    await expect(loadLpBrain('/nonexistent/brain')).rejects.toThrow(/financial-nfa/)
  })
})
