/**
 * Flota.
 *
 * Briefingul cerea ca fiecare NFT sa fie un muncitor autonom, cu gazul lui si
 * strategia lui. Asta suna bine si costa scump: o mie de agenti inseamna o mie
 * de chei fierbinti de tinut undeva, si o mie de tranzactii separate in loc de
 * una grupata, adica de cateva ori mai mult gaz pentru aceeasi treaba.
 *
 * Solutia e alta: **un singur executor, munca impartita, plata pe lant.**
 * Livrarile se dau pe rand agentilor din flota, iar bacsisul se imparte in
 * aceeasi tranzactie, fiecare la portofelul lui 6551. Nimeni nu tine cheia
 * nimanui si nimeni nu trebuie sa aiba incredere in registrul nostru: plata e
 * pe lant, cu numele agentului pe ea.
 *
 * Rotatia, nu cursa. Daca agentii s-ar bate pe aceleasi livrari, castiga cine
 * are gaz mai mult, iar restul ard gaz degeaba. Aici rotatia e echitabila prin
 * constructie: fiecare ia acelasi numar de livrari, indiferent cine a fost
 * mintat primul.
 */
import type { Address } from 'viem'

export interface FleetMember {
  id: number
  wallet: Address
}

export interface Split {
  to: Address
  bps: number
}

/**
 * Cine ia fiecare livrare dintr-un lot, prin rotatie, pornind de unde s-a
 * ramas. Intoarce indici in flota, nu id-uri, ca sa nu presupuna nimic despre
 * cum sunt numerotati agentii.
 */
export function rotate(size: number, count: number, cursor: number): number[] {
  if (size <= 0 || count <= 0) return []
  const start = ((cursor % size) + size) % size
  const picks: number[] = []
  for (let i = 0; i < count; i++) picks.push((start + i) % size)
  return picks
}

/**
 * Cotele din bacsis, in miimi de procent, proportionale cu cate livrari a luat
 * fiecare. Suma e mereu exact 10000, iar restul din impartirea intreaga merge
 * la prima cota. Contractul cere fix asta, si tot acolo prima cota primeste si
 * restul in wei, deci nu se pierde praf pe drum.
 */
export function sharesOf(members: FleetMember[], picks: number[]): Split[] {
  const counts = new Map<number, number>()
  /* ordinea e cea in care au aparut in lot, nu cea din lista. Contractul da
     restul in wei primei cote, iar daca prima ar fi mereu acelasi agent, praful
     s-ar aduna sistematic la el. Asa, restul se roteste odata cu munca. */
  const used: number[] = []
  for (const p of picks) {
    if (!counts.has(p)) used.push(p)
    counts.set(p, (counts.get(p) ?? 0) + 1)
  }
  if (!used.length) return []

  const total = picks.length
  const splits: Split[] = []
  let given = 0
  for (const idx of used) {
    const m = members[idx]
    if (!m) continue
    const bps = Math.floor(((counts.get(idx) ?? 0) * 10_000) / total)
    splits.push({ to: m.wallet, bps })
    given += bps
  }
  const first = splits[0]
  if (first) first.bps += 10_000 - given
  return splits
}

/** id-urile de agent pentru fiecare livrare, in ordinea lotului */
export function agentIdsOf(members: FleetMember[], picks: number[]): Array<number | null> {
  return picks.map((p) => members[p]?.id ?? null)
}
