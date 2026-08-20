import { describe, expect, it } from 'vitest'
import { ConfigSchema } from '../../src/core/config.js'
import { decideProfit, gasPriceAcceptable, scaleWei, screen, withinDailyBudget } from '../../src/core/policy/rules.js'
import type { WorkItem } from '../../src/core/work.js'

const cfgOf = (over: Record<string, unknown> = {}) =>
  ConfigSchema.parse({
    agent: { kind: 'ringer' },
    network: { name: 'x', chainId: 1, rpc: ['http://a.test'] },
    target: { address: '0x0000000000000000000000000000000000000001' },
    ...over
  })

const item = (over: Partial<WorkItem> = {}): WorkItem => ({
  key: 'k1',
  label: 'K1',
  args: [],
  rewardWei: 1000n,
  rewardMeasured: true,
  stakeWei: 10_000n,
  valueWei: 0n,
  costWei: 0n,
  costMeasured: true,
  costToken: null,
  meta: {},
  ...over
})

describe('politica', () => {
  it('taie ce e sub pragul de miza si spune cu cat', () => {
    const cfg = cfgOf({ policy: { minStakeWei: '5000' } })
    const r = screen({ items: [item({ stakeWei: 100n })], cfg, lastDoneAt: () => null, nowSec: 0 })
    expect(r.pass).toEqual([])
    expect(r.skipped[0]!.reason).toBe('below-min-stake')
    expect(r.skipped[0]!.detail).toMatch(/100 < 5000/)
  })

  it('nu taie pentru castig mic o bucata al carei castig NU a fost masurat', () => {
    const cfg = cfgOf({ policy: { minRewardWei: '5000' } })
    const r = screen({ items: [item({ rewardWei: 0n, rewardMeasured: false })], cfg, lastDoneAt: () => null, nowSec: 0 })
    /* decizia e a franei de rentabilitate, care stie sa spuna exact ce lipseste */
    expect(r.pass.length).toBe(1)
  })

  it('respecta racirea si spune cate secunde mai are', () => {
    const cfg = cfgOf({ policy: { cooldownSec: 600 } })
    const r = screen({ items: [item()], cfg, lastDoneAt: () => 1000, nowSec: 1100 })
    expect(r.skipped[0]!.reason).toBe('cooldown')
    expect(r.skipped[0]!.detail).toMatch(/100s < 600s/)
  })

  it('pune cele mai grase primele, ca taietura sa cada pe coada ieftina', () => {
    const cfg = cfgOf({ policy: { maxJobsPerRun: 2 } })
    const r = screen({
      items: [item({ key: 'a', rewardWei: 1n }), item({ key: 'b', rewardWei: 9n }), item({ key: 'c', rewardWei: 5n })],
      cfg,
      lastDoneAt: () => null,
      nowSec: 0
    })
    expect(r.pass.map((i) => i.key)).toEqual(['b', 'c'])
    expect(r.skipped[0]).toEqual({ key: 'a', reason: 'over-run-cap' })
  })

  it('lista de refuz e respectata', () => {
    const cfg = cfgOf({ policy: { denyKeys: ['k1'] } })
    const r = screen({ items: [item()], cfg, lastDoneAt: () => null, nowSec: 0 })
    expect(r.skipped[0]!.reason).toBe('deny-key')
  })

  it('MODUL PROFIT REFUZA un castig nemasurat, in loc sa presupuna ca merita', () => {
    const v = decideProfit({ rewardWei: 10n ** 18n, rewardMeasured: false, gasCostWei: 1n, cfg: cfgOf() })
    expect(v.go).toBe(false)
    expect(v.reason).toBe('reward-not-measured')
    expect(v.detail).toMatch(/campaign mode|requireMeasuredReward/)
  })

  it('in campanie se lucreaza si in pierdere, dinadins', () => {
    const v = decideProfit({ rewardWei: 0n, rewardMeasured: false, gasCostWei: 10n ** 18n, cfg: cfgOf({ policy: { mode: 'campaign' } }) })
    expect(v.go).toBe(true)
  })

  it('marja se aplica pe gaz, cu precizie de wei', () => {
    const cfg = cfgOf({ policy: { profitMultiple: 1.5 } })
    expect(decideProfit({ rewardWei: 149n, rewardMeasured: true, gasCostWei: 100n, cfg }).go).toBe(false)
    expect(decideProfit({ rewardWei: 150n, rewardMeasured: true, gasCostWei: 100n, cfg }).go).toBe(true)
  })

  it('inmultirea cu zecimale nu pierde weiul', () => {
    expect(scaleWei(10n ** 18n, 1.5)).toBe(15n * 10n ** 17n)
    expect(scaleWei(3n, 1.5)).toBe(4n)
  })

  it('bugetul zilnic se uita la ce s-a cheltuit plus ce urmeaza', () => {
    const cfg = cfgOf({ policy: { dailyGasBudgetWei: '100' } })
    expect(withinDailyBudget({ spentTodayWei: 90n, plannedWei: 5n, cfg }).go).toBe(true)
    expect(withinDailyBudget({ spentTodayWei: 90n, plannedWei: 20n, cfg }).go).toBe(false)
  })

  it('plafonul de gaz opreste cand pretul sare peste el', () => {
    const cfg = cfgOf({ policy: { maxGasPriceWei: '100' } })
    expect(gasPriceAcceptable(101n, cfg).go).toBe(false)
    expect(gasPriceAcceptable(100n, cfg).go).toBe(true)
  })
})

describe('treaba care se face o singura data', () => {
  it('nu se mai propune dupa ce a fost facuta', () => {
    const cfg = cfgOf()
    const once = item({ key: 'vote:100', once: true })
    expect(screen({ items: [once], cfg, lastDoneAt: () => null, nowSec: 0 }).pass.length).toBe(1)
    const done = screen({ items: [once], cfg, lastDoneAt: () => 12345, nowSec: 99999 })
    expect(done.pass).toEqual([])
    expect(done.skipped[0]!.reason).toBe('already-done')
  })

  it('o bucata obisnuita se propune din nou, oricat de demult a fost facuta', () => {
    const cfg = cfgOf()
    const r = screen({ items: [item()], cfg, lastDoneAt: () => 1, nowSec: 99999 })
    expect(r.pass.length).toBe(1)
  })
})
