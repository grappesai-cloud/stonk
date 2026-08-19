import { describe, expect, it } from 'vitest'
import type { PublicClient } from 'viem'
import { valueOf, asBig } from '../../src/core/read.js'

const ADDR = '0x00000000000000000000000000000000000000A1' as const
const clientOf = (result: unknown): PublicClient => ({ readContract: async () => result }) as unknown as PublicClient

describe('de unde vine cifra castigului', () => {
  it('citita de pe lant = masurata', async () => {
    const m = await valueOf(clientOf(500n), ADDR, { mode: 'call', call: { signature: 'function tip() view returns (uint256)', args: [], field: null } }, {})
    expect(m.wei).toBe(500n)
    expect(m.measured).toBe(true)
  })

  it('scrisa in configurare = NU e masurata, oricat de sigura pare', async () => {
    const m = await valueOf(clientOf(null), ADDR, { mode: 'const', wei: 10n ** 18n }, {})
    expect(m.wei).toBe(10n ** 18n)
    expect(m.measured).toBe(false)
    expect(m.detail).toMatch(/config/)
  })

  it('o parte din miza e masurata doar daca miza chiar a fost citita', async () => {
    const withStake = await valueOf(clientOf(null), ADDR, { mode: 'bps', bps: 500 }, {}, { stakeWei: 1000n })
    expect(withStake.wei).toBe(50n)
    expect(withStake.measured).toBe(true)

    const withoutStake = await valueOf(clientOf(null), ADDR, { mode: 'bps', bps: 500 }, {}, {})
    expect(withoutStake.measured).toBe(false)
  })

  it('un camp din citirea de stare e masurat; unul care lipseste nu se inventeaza', async () => {
    const ok = await valueOf(clientOf(null), ADDR, { mode: 'field', field: 'bounty' }, {}, { stateField: () => 77n })
    expect(ok.wei).toBe(77n)
    expect(ok.measured).toBe(true)

    const missing = await valueOf(clientOf(null), ADDR, { mode: 'field', field: 'bounty' }, {}, { stateField: () => undefined })
    expect(missing.wei).toBe(0n)
    expect(missing.measured).toBe(false)
  })

  it('necunoscut ramane necunoscut, nu zero', async () => {
    const m = await valueOf(clientOf(null), ADDR, { mode: 'none' }, {})
    expect(m.measured).toBe(false)
    expect(m.detail).toMatch(/unknown/)
  })

  it('numerele vin in mai multe forme de pe lant si toate ajung bigint', () => {
    expect(asBig(5)).toBe(5n)
    expect(asBig('42')).toBe(42n)
    expect(asBig(true)).toBe(1n)
    expect(asBig('nu e numar')).toBe(0n)
  })
})
