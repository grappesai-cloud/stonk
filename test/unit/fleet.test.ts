/**
 * Flota: cine ia munca si cine ia banii.
 *
 * Aici se verifica exact propozitia pe care o vinde colectia: "bucata ta a
 * muncit si a castigat". Daca rotatia nu e echitabila sau cotele nu insumeaza
 * fix tot, propozitia aia devine o minciuna verificabila pe lant.
 */
import { describe, expect, it } from 'vitest'
import { agentIdsOf, rotate, sharesOf, type FleetMember } from '../../src/fleet.js'

const W = (n: number) => ('0x' + String(n).repeat(40).slice(0, 40)) as `0x${string}`
const fleet = (n: number): FleetMember[] => Array.from({ length: n }, (_, i) => ({ id: i, wallet: W(i + 1) }))

describe('rotatia flotei', () => {
  it('imparte livrarile pe rand, nu toate primului', () => {
    expect(rotate(3, 6, 0)).toEqual([0, 1, 2, 0, 1, 2])
  })

  it('continua de unde a ramas, ca sa nu ia mereu aceiasi de la capat', () => {
    expect(rotate(3, 3, 2)).toEqual([2, 0, 1])
  })

  it('nu se sperie de un cursor mai mare decat flota sau negativ', () => {
    expect(rotate(3, 3, 100)).toEqual([1, 2, 0])
    expect(rotate(3, 3, -1)).toEqual([2, 0, 1])
  })

  it('fara flota nu imparte nimic', () => {
    expect(rotate(0, 5, 0)).toEqual([])
    expect(rotate(3, 0, 0)).toEqual([])
  })

  it('pe termen lung fiecare agent ia acelasi numar de livrari', () => {
    const size = 7
    let cursor = 0
    const counts = new Array(size).fill(0)
    for (let run = 0; run < 50; run++) {
      const n = 1 + (run % 9)
      for (const p of rotate(size, n, cursor)) counts[p]++
      cursor = (cursor + n) % size
    }
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })
})

describe('cotele din bacsis', () => {
  it('insumeaza exact 10000, mereu', () => {
    for (const [size, count] of [[3, 7], [4, 10], [5, 13], [2, 3], [9, 100]] as const) {
      const s = sharesOf(fleet(size), rotate(size, count, 0))
      expect(s.reduce((a, b) => a + b.bps, 0)).toBe(10_000)
    }
  })

  it('sunt proportionale cu munca, nu egale de complezenta', () => {
    /* 4 livrari, 3 agenti: primul ia doua, ceilalti cate una */
    const s = sharesOf(fleet(3), rotate(3, 4, 0))
    expect(s.map((x) => x.bps)).toEqual([5000, 2500, 2500])
  })

  it('restul din impartire merge la prima cota, nu se pierde', () => {
    /* 3 livrari egale: 3333 fiecare, raman 1 */
    const s = sharesOf(fleet(3), rotate(3, 3, 0))
    expect(s.map((x) => x.bps)).toEqual([3334, 3333, 3333])
    expect(s.reduce((a, b) => a + b.bps, 0)).toBe(10_000)
  })

  it('restul se roteste: prima cota e cine a inceput lotul, nu cine e primul in lista', () => {
    /* cu cursorul pe 1, lotul incepe cu agentul 1, deci el ia si restul */
    const s = sharesOf(fleet(3), rotate(3, 3, 1))
    expect(s.map((x) => x.to)).toEqual([W(2), W(3), W(1)])
    expect(s.map((x) => x.bps)).toEqual([3334, 3333, 3333])
  })

  it('agentii care nu au muncit in lotul asta nu apar deloc', () => {
    const s = sharesOf(fleet(5), rotate(5, 2, 0))
    expect(s).toHaveLength(2)
    expect(s.map((x) => x.to)).toEqual([W(1), W(2)])
  })

  it('fara flota, nicio cota', () => {
    expect(sharesOf([], [])).toEqual([])
  })

  it('fiecare livrare stie al carui agent e', () => {
    expect(agentIdsOf(fleet(3), rotate(3, 4, 1))).toEqual([1, 2, 0, 1])
  })
})
