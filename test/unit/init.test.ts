/**
 * Clasificarea ABI-ului. Functie pura, deci se poate proba pe un contract
 * scris de mana care seamana cu ce ar avea StonkBrokers.
 */
import { describe, expect, it } from 'vitest'
import { classify, signatureOf, type AbiFn } from '../../src/init.js'

const abi: AbiFn[] = [
  {
    type: 'function',
    name: 'pendingOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'ethAmount', type: 'uint256' },
      { name: 'tokenAmount', type: 'uint256' }
    ]
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }]
  },
  { type: 'function', name: 'deliver', stateMutability: 'nonpayable', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'setTip', stateMutability: 'nonpayable', inputs: [{ name: 'bps', type: 'uint16' }], outputs: [] },
  { type: 'function', name: 'sweep', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }], outputs: [] },
  { type: 'error', name: 'NothingPending', inputs: [{ name: 'tokenId', type: 'uint256' }] },
  { type: 'event', name: 'Delivered', inputs: [{ name: 'tokenId', type: 'uint256' }] }
]

describe('clasificarea', () => {
  const r = classify(abi)

  it('pune pe primul loc functia care chiar spune cat e nerevendicat', () => {
    expect(r.pending[0]?.signature).toContain('pendingOf')
    expect(r.pending[0]?.why.join(' ')).toMatch(/campurile din raspuns au nume/)
  })

  it('nu propune functii fara argument, ca nu se pot cere per broker', () => {
    expect(r.pending.some((c) => c.signature.includes('totalSupply'))).toBe(false)
  })

  it('nu propune functii care raspund cu altceva decat numere', () => {
    expect(r.pending.some((c) => c.signature.includes('owner('))).toBe(false)
  })

  it('pune pe primul loc livrarea, nu setarea de bacsis', () => {
    expect(r.deliver[0]?.signature).toContain('deliver')
    expect(r.deliver.findIndex((c) => c.signature.includes('setTip'))).toBeGreaterThan(0)
  })

  it('scoate si erorile proprii, ca simularea sa spuna nume in loc de hex', () => {
    expect(r.errors).toContain('error NothingPending(uint256 tokenId)')
  })

  it('nu ia evenimentele drept functii', () => {
    expect([...r.pending, ...r.deliver].some((c) => c.signature.includes('Delivered'))).toBe(false)
  })

  it('scrie semnaturi pe care viem le poate citi', () => {
    const s = signatureOf(abi[0]!)
    expect(s).toBe('function pendingOf(uint256 tokenId) view returns (uint256 ethAmount, uint256 tokenAmount)')
  })
})
