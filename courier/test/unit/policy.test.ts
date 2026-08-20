import { describe, expect, it } from 'vitest'
import { parseEther, type Address } from 'viem'
import { ConfigSchema } from '../../src/config.js'
import { decideProfit, gasPriceAcceptable, scaleWei, screenClaims, withinDailyBudget } from '../../src/policy/rules.js'
import type { Claim } from '../../src/scan/claims.js'

const A1 = '0x1111111111111111111111111111111111111111' as Address
const A2 = '0x2222222222222222222222222222222222222222' as Address
const W = '0x9999999999999999999999999999999999999999' as Address

function cfg(over: Record<string, unknown> = {}) {
  return ConfigSchema.parse({
    network: { name: 't', chainId: 1, rpc: ['http://localhost:8545'] },
    erc6551: { registry: A1, implementation: A2 },
    brokers: { address: A1 },
    drops: {
      address: A2,
      pending: { signature: 'function p(uint256 a) view returns (uint256 ethAmount)', nativeFields: ['ethAmount'] },
      deliverSignature: 'function deliver(uint256 a)'
    },
    ...over
  })
}

function claim(tokenId: bigint, valueWei: bigint): Claim {
  return { tokenId, wallet: W, native: valueWei, tokens: [], valueWei, hasSomething: true }
}

describe('scaleWei', () => {
  it('inmulteste fara sa piarda precizia weiului', () => {
    expect(scaleWei(parseEther('1'), 1.5)).toBe(parseEther('1.5'))
    expect(scaleWei(1n, 2)).toBe(2n)
    expect(scaleWei(1_000_000n, 0.0001)).toBe(100n)
  })
})

describe('screenClaims', () => {
  const base = { owners: new Map<bigint, Address>(), lastDeliveryAt: () => null, nowSec: 1000 }

  it('taie ce e sub pragul de valoare', () => {
    const c = cfg({ policy: { minValueWei: parseEther('0.01').toString() } })
    const r = screenClaims({ ...base, cfg: c, claims: [claim(1n, parseEther('0.05')), claim(2n, parseEther('0.001'))] })
    expect(r.pass.map((x) => x.tokenId)).toEqual([1n])
    expect(r.skipped[0]?.reason).toBe('below-min-value')
  })

  it('respecta pauza dintre livrari', () => {
    const c = cfg({ policy: { cooldownSec: 3600 } })
    const r = screenClaims({
      ...base,
      cfg: c,
      claims: [claim(1n, 100n), claim(2n, 100n)],
      lastDeliveryAt: (id) => (id === '1' ? 900 : null)
    })
    expect(r.pass.map((x) => x.tokenId)).toEqual([2n])
    expect(r.skipped[0]?.reason).toBe('cooldown')
  })

  it('livreaza intai cele mai grase si taie coada la plafonul rularii', () => {
    const c = cfg({ policy: { maxDeliveriesPerRun: 2 } })
    const r = screenClaims({
      ...base,
      cfg: c,
      claims: [claim(1n, 10n), claim(2n, 300n), claim(3n, 200n), claim(4n, 5n)]
    })
    expect(r.pass.map((x) => x.tokenId)).toEqual([2n, 3n])
    expect(r.skipped.filter((s) => s.reason === 'over-run-cap').length).toBe(2)
  })

  it('sare peste proprietarii care au cerut sa nu fie atinsi', () => {
    const c = cfg({ policy: { denyOwners: [A1] } })
    const owners = new Map<bigint, Address>([[1n, A1], [2n, A2]])
    const r = screenClaims({ ...base, owners, cfg: c, claims: [claim(1n, 100n), claim(2n, 100n)] })
    expect(r.pass.map((x) => x.tokenId)).toEqual([2n])
    expect(r.skipped[0]?.reason).toBe('deny-owner')
  })

  it('in modul lista livreaza doar celor inscrisi', () => {
    const c = cfg({ policy: { optIn: { mode: 'list', list: [A2] } } })
    const owners = new Map<bigint, Address>([[1n, A1], [2n, A2]])
    const r = screenClaims({ ...base, owners, cfg: c, claims: [claim(1n, 100n), claim(2n, 100n)] })
    expect(r.pass.map((x) => x.tokenId)).toEqual([2n])
    expect(r.skipped[0]?.reason).toBe('not-opted-in')
  })
})

describe('decideProfit', () => {
  it('refuza cand bacsisul nu acopera gazul inmultit cu marja', () => {
    const c = cfg({ policy: { profitMultiple: 1.5 } })
    expect(decideProfit({ tipWei: 100n, gasCostWei: 100n, cfg: c }).go).toBe(false)
    expect(decideProfit({ tipWei: 150n, gasCostWei: 100n, cfg: c }).go).toBe(true)
  })

  it('in modul campanie livreaza si in pierdere', () => {
    const c = cfg({ policy: { mode: 'campaign' } })
    expect(decideProfit({ tipWei: 0n, gasCostWei: parseEther('1'), cfg: c }).go).toBe(true)
  })
})

describe('franele', () => {
  it('bugetul zilnic opreste lotul care il depaseste', () => {
    const c = cfg({ policy: { dailyGasBudgetWei: parseEther('0.1').toString() } })
    expect(withinDailyBudget({ spentTodayWei: parseEther('0.09'), plannedWei: parseEther('0.02'), cfg: c }).go).toBe(false)
    expect(withinDailyBudget({ spentTodayWei: parseEther('0.05'), plannedWei: parseEther('0.02'), cfg: c }).go).toBe(true)
  })

  it('plafonul de pret al gazului opreste rularea', () => {
    const c = cfg({ policy: { maxGasPriceWei: '1000000000' } })
    expect(gasPriceAcceptable(2_000_000_000n, c).go).toBe(false)
    expect(gasPriceAcceptable(500_000_000n, c).go).toBe(true)
  })

  it('fara plafon, orice pret trece', () => {
    expect(gasPriceAcceptable(10n ** 18n, cfg()).go).toBe(true)
  })
})
