import { describe, expect, it } from 'vitest'
import type { Address, Hex } from 'viem'
import { tbaAddress, tbaAddresses, tbaCreationCode } from '../../src/erc6551/address.js'

/**
 * Vectorul de control e cel din specificatie: registrul canonic, implementarea
 * tokenbound si un salt zero. Daca cineva schimba codul proxy-ului sau ordinea
 * datelor lipite, testul asta cade inainte sa ajunga un ban pe o adresa gresita.
 */
const REGISTRY = '0x000000006551c19487814612e58FE06813775758' as Address
const IMPL = '0x41C8f39463A868d3A88af00cd0fe7102F30E44eC' as Address
const SALT = ('0x' + '00'.repeat(32)) as Hex
const NFT = '0x9BD7cCcdb4E4bAFA7B8bD4EF0d8d5C8A3F1234aB' as Address

describe('codul de creare', () => {
  it('are exact 45 de octeti de proxy plus 128 de date lipite', () => {
    const code = tbaCreationCode({ implementation: IMPL, salt: SALT, chainId: 1, tokenContract: NFT, tokenId: 1n })
    const bytes = (code.length - 2) / 2
    expect(bytes).toBe(20 + 20 + 15 + 32 + 32 + 32 + 32)
  })

  it('lungimea runtime din antet e 0xad, adica 45 plus 128', () => {
    const code = tbaCreationCode({ implementation: IMPL, salt: SALT, chainId: 1, tokenContract: NFT, tokenId: 1n })
    expect(code.startsWith('0x3d60ad80600a3d3981f3')).toBe(true)
    expect(0xad).toBe(45 + 128)
  })

  it('adresa contractului NFT se lipeste pe 32 de octeti, nu pe 20', () => {
    const code = tbaCreationCode({ implementation: IMPL, salt: SALT, chainId: 1, tokenContract: NFT, tokenId: 1n })
    // ultimii 128 de octeti: salt, chainId, tokenContract, tokenId
    const tail = code.slice(-256)
    const tokenContractWord = tail.slice(128, 192)
    expect(tokenContractWord.slice(0, 24)).toBe('0'.repeat(24))
    expect(tokenContractWord.slice(24).toLowerCase()).toBe(NFT.slice(2).toLowerCase())
  })
})

describe('adresa', () => {
  it('e determinista si diferita pentru fiecare id', () => {
    const base = { registry: REGISTRY, implementation: IMPL, salt: SALT, chainId: 1, tokenContract: NFT }
    const a1 = tbaAddress({ ...base, tokenId: 1n })
    const a2 = tbaAddress({ ...base, tokenId: 2n })
    expect(a1).toBe(tbaAddress({ ...base, tokenId: 1n }))
    expect(a1).not.toBe(a2)
  })

  it('se schimba daca se schimba lantul, saltul sau implementarea', () => {
    const base = { registry: REGISTRY, implementation: IMPL, salt: SALT, chainId: 1, tokenContract: NFT, tokenId: 7n }
    const ref = tbaAddress(base)
    expect(tbaAddress({ ...base, chainId: 4663 })).not.toBe(ref)
    expect(tbaAddress({ ...base, salt: ('0x' + '01'.repeat(32)) as Hex })).not.toBe(ref)
    expect(tbaAddress({ ...base, implementation: REGISTRY })).not.toBe(ref)
  })

  it('calculeaza in lot fara sa atinga reteaua', () => {
    const ids = Array.from({ length: 5000 }, (_, i) => BigInt(i + 1))
    const t0 = performance.now()
    const map = tbaAddresses({ registry: REGISTRY, implementation: IMPL, salt: SALT, chainId: 4663, tokenContract: NFT }, ids)
    const ms = performance.now() - t0
    expect(map.size).toBe(5000)
    expect(new Set(map.values()).size).toBe(5000)
    expect(ms).toBeLessThan(5000)
  })
})
