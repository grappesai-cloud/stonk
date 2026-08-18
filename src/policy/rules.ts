/**
 * Politica: ce se livreaza, ce nu, si de ce.
 *
 * Totul aici e functie pura, fara retea si fara ceas propriu, ca sa poata fi
 * testat pe bucati. Regula de fond: botul refuza implicit. O livrare se face
 * doar daca trece toate filtrele, nu se opreste doar daca pica vreunul.
 */
import type { Address } from 'viem'
import type { Config } from '../config.js'
import type { Claim } from '../scan/claims.js'

export type SkipReason =
  | 'deny-token'
  | 'deny-owner'
  | 'not-opted-in'
  | 'below-min-value'
  | 'cooldown'
  | 'over-run-cap'
  | 'unprofitable'
  | 'daily-budget'
  | 'gas-price-cap'

export interface Skipped {
  tokenId: bigint
  reason: SkipReason
  detail?: string
}

export interface ScreenInput {
  claims: Claim[]
  owners: Map<bigint, Address>
  cfg: Config
  lastDeliveryAt: (tokenId: string) => number | null
  nowSec: number
}

export interface Screened {
  pass: Claim[]
  skipped: Skipped[]
}

export function screenClaims(input: ScreenInput): Screened {
  const { claims, owners, cfg, lastDeliveryAt, nowSec } = input
  const p = cfg.policy
  const denyTokens = new Set(p.denyTokenIds.map((n) => BigInt(n)))
  const denyOwners = new Set(p.denyOwners.map((a) => a.toLowerCase()))
  const optInList = new Set(p.optIn.list.map((a) => a.toLowerCase()))

  const skipped: Skipped[] = []
  const kept: Claim[] = []

  for (const c of claims) {
    const owner = owners.get(c.tokenId)?.toLowerCase()

    if (denyTokens.has(c.tokenId)) {
      skipped.push({ tokenId: c.tokenId, reason: 'deny-token' })
      continue
    }
    if (owner && denyOwners.has(owner)) {
      skipped.push({ tokenId: c.tokenId, reason: 'deny-owner' })
      continue
    }
    if (p.optIn.mode === 'list' && (!owner || !optInList.has(owner))) {
      skipped.push({ tokenId: c.tokenId, reason: 'not-opted-in' })
      continue
    }
    if (c.valueWei < p.minValueWei) {
      skipped.push({ tokenId: c.tokenId, reason: 'below-min-value', detail: `${c.valueWei} < ${p.minValueWei}` })
      continue
    }
    const last = lastDeliveryAt(c.tokenId.toString())
    if (last !== null && nowSec - last < p.cooldownSec) {
      skipped.push({ tokenId: c.tokenId, reason: 'cooldown', detail: `${nowSec - last}s < ${p.cooldownSec}s` })
      continue
    }
    kept.push(c)
  }

  // cele mai grase primele: daca lotul se taie, se taie de la coada ieftina
  kept.sort((a, b) => (a.valueWei > b.valueWei ? -1 : a.valueWei < b.valueWei ? 1 : 0))

  const pass = kept.slice(0, p.maxDeliveriesPerRun)
  for (const c of kept.slice(p.maxDeliveriesPerRun)) {
    skipped.push({ tokenId: c.tokenId, reason: 'over-run-cap' })
  }

  return { pass, skipped }
}

export interface ProfitInput {
  tipWei: bigint
  gasCostWei: bigint
  cfg: Config
}

export interface ProfitVerdict {
  go: boolean
  reason: SkipReason | null
  detail: string
}

/**
 * In modul 'profit' bacsisul trebuie sa acopere gazul inmultit cu marja.
 * In modul 'campaign' se livreaza si in pierdere, pentru ca scopul e altul:
 * livrarile gratuite dinainte de mint. Bugetul zilnic ramane in picioare in
 * ambele moduri, altfel campania inseamna un portofel gol pana dimineata.
 */
export function decideProfit(i: ProfitInput): ProfitVerdict {
  const { tipWei, gasCostWei, cfg } = i
  if (cfg.policy.mode === 'campaign') {
    return { go: true, reason: null, detail: 'campanie: livram si in pierdere' }
  }
  if (tipWei < cfg.policy.minTipWei) {
    return { go: false, reason: 'unprofitable', detail: `bacsis ${tipWei} sub pragul ${cfg.policy.minTipWei}` }
  }
  const needed = scaleWei(gasCostWei, cfg.policy.profitMultiple)
  if (tipWei < needed) {
    return { go: false, reason: 'unprofitable', detail: `bacsis ${tipWei} sub ${needed} (gaz ${gasCostWei} x ${cfg.policy.profitMultiple})` }
  }
  return { go: true, reason: null, detail: `bacsis ${tipWei} peste pragul ${needed}` }
}

/** inmultire cu un numar zecimal, fara sa pierdem precizia weiului */
export function scaleWei(value: bigint, multiple: number): bigint {
  const scaled = BigInt(Math.round(multiple * 1_000_000))
  return (value * scaled) / 1_000_000n
}

export interface BudgetInput {
  spentTodayWei: bigint
  plannedWei: bigint
  cfg: Config
}

export function withinDailyBudget(i: BudgetInput): ProfitVerdict {
  const cap = i.cfg.policy.dailyGasBudgetWei
  if (cap === null) return { go: true, reason: null, detail: 'fara buget zilnic' }
  if (i.spentTodayWei + i.plannedWei > cap) {
    return {
      go: false,
      reason: 'daily-budget',
      detail: `${i.spentTodayWei} + ${i.plannedWei} depaseste ${cap}`
    }
  }
  return { go: true, reason: null, detail: `sub buget: ${i.spentTodayWei + i.plannedWei} din ${cap}` }
}

export function gasPriceAcceptable(gasPriceWei: bigint, cfg: Config): ProfitVerdict {
  const cap = cfg.policy.maxGasPriceWei
  if (cap === null) return { go: true, reason: null, detail: 'fara plafon de gaz' }
  if (gasPriceWei > cap) {
    return { go: false, reason: 'gas-price-cap', detail: `${gasPriceWei} peste plafonul ${cap}` }
  }
  return { go: true, reason: null, detail: `gaz ${gasPriceWei} sub plafon` }
}
