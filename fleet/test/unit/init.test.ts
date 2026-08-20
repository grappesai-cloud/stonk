import { describe, expect, it } from 'vitest'
import { classify, signatureOf, eventSignatureOf, type AbiFn } from '../../src/core/init.js'

const abi: AbiFn[] = [
  { type: 'function', name: 'clockIn', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'setOwner', stateMutability: 'nonpayable', inputs: [{ name: 'o', type: 'address' }], outputs: [] },
  { type: 'function', name: 'pot', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'canClockIn', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bool' }] },
  {
    type: 'function',
    name: 'fulfillRandomWords',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'words', type: 'uint256[]' }
    ],
    outputs: []
  },
  { type: 'function', name: 'settle', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'pendingRounds', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256[]' }] },
  {
    type: 'event',
    name: 'ClockIn',
    inputs: [
      { name: 'caller', type: 'address' },
      { name: 'tip', type: 'uint256' }
    ]
  },
  { type: 'error', name: 'NotAuthorized', inputs: [] }
]

describe('propunerea semnaturilor din ABI', () => {
  it('pentru Ringer pune butonul primul, nu prima functie care scrie', () => {
    const c = classify(abi, 'ringer')
    expect(c.action[0]!.signature).toMatch(/clockIn/)
    expect(c.action[0]!.why.join(' ')).toMatch(/clockIn/)
  })

  it('pentru Ringer gaseste oala si evenimentul din care se tine caietul de curse', () => {
    const c = classify(abi, 'ringer')
    expect(c.value[0]!.signature).toMatch(/pot/)
    expect(c.events[0]!.signature).toMatch(/event ClockIn/)
    expect(c.events[0]!.why.join(' ')).toMatch(/CINE/)
  })

  it('pentru Miner pune inchiderea rundei primul si gaseste lista de lucru', () => {
    const c = classify(abi, 'miner')
    expect(c.action[0]!.signature).toMatch(/settle/)
    expect(c.discovery.some((d) => /pendingRounds/.test(d.signature))).toBe(true)
  })

  it('functia oracolului e propusa, dar cu avertisment ca argumentele pot sa nu fie ale tale', () => {
    const c = classify(abi, 'miner')
    const vrf = c.action.find((a) => /fulfillRandomWords/.test(a.signature))
    expect(vrf).toBeDefined()
    expect(vrf!.why.join(' ')).toMatch(/ATENTIE/)
    /* si nu are voie sa fie primul: ar trimite omul exact pe drumul infundat */
    expect(c.action[0]!.signature).not.toMatch(/fulfillRandomWords/)
  })

  it('erorile contractului ies gata de pus in configurare', () => {
    expect(classify(abi, 'ringer').errors).toContain('error NotAuthorized()')
  })

  it('semnaturile se scriu in forma pe care o intelege configurarea', () => {
    expect(signatureOf(abi[2]!)).toBe('function pot() view returns (uint256)')
    expect(eventSignatureOf(abi[7]!)).toBe('event ClockIn(address caller, uint256 tip)')
  })
})
