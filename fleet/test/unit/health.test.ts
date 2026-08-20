import { describe, expect, it } from 'vitest'
import { ConfigSchema } from '../../src/core/config.js'
import { healthOf, isWedged, staleAfterSec, watchdogSec } from '../../src/core/health.js'
import { classify } from '../../src/core/simulate.js'

const cfg = (over: Record<string, unknown> = {}) =>
  ConfigSchema.parse({
    agent: { kind: 'ringer' },
    network: { name: 'x', chainId: 1, rpc: ['http://a.test'] },
    target: { address: '0x0000000000000000000000000000000000000001' },
    ...over
  })

describe('cat de viu e botul', () => {
  it('ferestrele se calculeaza din interval, ca sa nu ramana cifre care mint', () => {
    const c = cfg({ runner: { intervalSec: 100 } })
    expect(staleAfterSec(c)).toBe(420)
    expect(watchdogSec(c)).toBe(1200)
  })

  it('cainele de paza se poate opri dinadins, dar nu din intamplare', () => {
    expect(watchdogSec(cfg({ runner: { watchdogSec: 0 } }))).toBeNull()
    expect(watchdogSec(cfg({ runner: { watchdogSec: 30 } }))).toBe(30)
  })

  it('inainte de prima rulare nu e vechi, e doar nou pornit', () => {
    expect(healthOf(null, cfg()).stale).toBe(false)
  })

  it('devine vechi doar dupa fereastra, nu inainte', () => {
    const c = cfg({ runner: { intervalSec: 10, staleAfterSec: 60 } })
    expect(healthOf(1000, c, 1059).stale).toBe(false)
    expect(healthOf(1000, c, 1061).stale).toBe(true)
  })

  it('procesul intepenit se recunoaste dupa timp, nu dupa cadere', () => {
    expect(isWedged(0, 10_000, 5)).toBe(true)
    expect(isWedged(0, 4_000, 5)).toBe(false)
    expect(isWedged(0, 10 ** 9, null)).toBe(false)
  })
})

describe('clasificarea reverturilor', () => {
  it('recunoaste o functie rezervata dupa mai multe formulari', () => {
    for (const m of ['NotAuthorized()', 'only owner', 'OnlyCoordinator', 'caller is not the owner', 'access denied']) {
      expect(classify(m)).toBe('authority-gated')
    }
  })

  it('recunoaste "nu e nimic de facut" ca situatie normala, nu ca defect', () => {
    for (const m of ['NothingPending', 'too early', 'already settled', 'cooldown active']) {
      expect(classify(m)).toBe('nothing-to-do')
    }
  })

  it('ce nu intelege ramane doar "a picat", fara sa inventeze o cauza', () => {
    expect(classify('0x1234abcd')).toBe('reverted')
  })
})
