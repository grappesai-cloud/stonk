import { describe, expect, it } from 'vitest'
import { MAX_UINT128, resolveArgs } from '../../src/core/args.js'

const ADDR = '0x00000000000000000000000000000000000000A1' as const

describe('sabloane de argumente', () => {
  it('umple id-ul si adresele', () => {
    expect(resolveArgs(['$id', '$account'], { id: 7n, account: ADDR })).toEqual([7n, ADDR])
  })

  it('merge si prin structuri, nu doar prin argumente simple', () => {
    const out = resolveArgs([{ roundId: '$id', to: '$beneficiary', max: '$max128' }], { id: 3n, beneficiary: ADDR })
    expect(out).toEqual([{ roundId: 3n, to: ADDR, max: MAX_UINT128 }])
  })

  it('un sir de cifre devine numar intreg, ca sa se poata scrie sume mari in JSON', () => {
    expect(resolveArgs(['1000000000000000000'], {})).toEqual([10n ** 18n])
  })

  it('lasa in pace ce nu e substituent', () => {
    expect(resolveArgs(['0xdead', true, 5], {})).toEqual(['0xdead', true, 5])
  })

  it('cere clar ce ii lipseste, in loc sa trimita o adresa goala', () => {
    expect(() => resolveArgs(['$account'], {})).toThrow(/\$account/)
  })

  it('beneficiarul cade pe contul care semneaza cand nu e altul', () => {
    expect(resolveArgs(['$beneficiary'], { account: ADDR })).toEqual([ADDR])
  })
})
