/**
 * Sablonul de argumente. Fara el unealta merge doar cu contracte scrise de noi,
 * pentru ca orice contract adevarat cere structuri sau mai multe argumente.
 */
import { describe, expect, it } from 'vitest'
import type { Address } from 'viem'
import { MAX_UINT128, MAX_UINT256, resolveArgs, templateFrom } from '../../src/args.js'

const W = '0x1111111111111111111111111111111111111111' as Address
const O = '0x2222222222222222222222222222222222222222' as Address
const ctx = { tokenId: 42n, wallet: W, owner: O }

describe('sablonul', () => {
  it('umple id-ul si portofelul', () => {
    expect(resolveArgs(['$tokenId', '$wallet'], ctx)).toEqual([42n, W])
  })

  it('merge si in structuri, ca la Uniswap', () => {
    const t = [{ tokenId: '$tokenId', recipient: '$wallet', amount0Max: '$max128', amount1Max: '$max128' }]
    expect(resolveArgs(t, ctx)).toEqual([{ tokenId: 42n, recipient: W, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 }])
  })

  it('merge si in liste imbricate', () => {
    expect(resolveArgs([['$tokenId', ['$wallet']]], ctx)).toEqual([[42n, [W]]])
  })

  it('un sir de cifre devine numar intreg, ca sumele mari sa se poata scrie in JSON', () => {
    expect(resolveArgs(['12345678901234567890123456'], ctx)).toEqual([12345678901234567890123456n])
  })

  it('lasa in pace sirurile care nu sunt cifre', () => {
    expect(resolveArgs(['0xdeadbeef', 'ceva'], ctx)).toEqual(['0xdeadbeef', 'ceva'])
  })

  it('are valorile maxime corecte pe 128 si 256 de biti', () => {
    expect(MAX_UINT128).toBe(2n ** 128n - 1n)
    expect(MAX_UINT256).toBe(2n ** 256n - 1n)
  })

  it('se opreste clar daca cere proprietarul si nu il stim', () => {
    expect(() => resolveArgs(['$owner'], { tokenId: 1n, wallet: W })).toThrow(/\$owner/)
  })

  it('pastreaza forma scurta de dinainte', () => {
    expect(templateFrom('tokenId', null)).toEqual(['$tokenId'])
    expect(templateFrom('wallet', null)).toEqual(['$wallet'])
    expect(templateFrom('tokenId', ['$wallet', '7'])).toEqual(['$wallet', '7'])
  })
})
