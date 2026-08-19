/**
 * Politica: ce se lucreaza, ce nu, si de ce.
 *
 * Totul aici e functie pura, fara retea si fara ceas propriu, ca sa poata fi
 * testat pe bucati. Regula de fond: botul refuza implicit. O treaba se face
 * doar daca trece toate filtrele, nu se opreste doar daca pica vreunul.
 */
import type { Config } from '../config.js'
import type { WorkItem } from '../work.js'

export type SkipReason =
  | 'deny-key'
  | 'below-min-stake'
  | 'below-min-reward'
  | 'cooldown'
  | 'over-run-cap'
  | 'unprofitable'
  | 'reward-not-measured'
  | 'daily-budget'
  | 'gas-price-cap'
  | 'watchtower'

export interface Skipped {
  key: string
  reason: SkipReason
  detail?: string
}

export interface ScreenInput {
  items: WorkItem[]
  cfg: Config
  lastDoneAt: (key: string) => number | null
  nowSec: number
}

export interface Screened {
  pass: WorkItem[]
  skipped: Skipped[]
}

export function screen(input: ScreenInput): Screened {
  const { items, cfg, lastDoneAt, nowSec } = input
  const p = cfg.policy
  const deny = new Set(p.denyKeys)
  const skipped: Skipped[] = []
  const kept: WorkItem[] = []

  for (const it of items) {
    if (deny.has(it.key)) {
      skipped.push({ key: it.key, reason: 'deny-key' })
      continue
    }
    if (it.stakeWei < p.minStakeWei) {
      skipped.push({ key: it.key, reason: 'below-min-stake', detail: `${it.stakeWei} < ${p.minStakeWei}` })
      continue
    }
    /* castigul necunoscut (0 nemasurat) nu se taie aici: cand chiar nu se
       poate masura, decizia e a frânei de rentabilitate, care stie sa spuna
       exact asta in loc de "prea mic" */
    if (it.rewardMeasured && it.rewardWei < p.minRewardWei) {
      skipped.push({ key: it.key, reason: 'below-min-reward', detail: `${it.rewardWei} < ${p.minRewardWei}` })
      continue
    }
    const last = lastDoneAt(it.key)
    if (last !== null && nowSec - last < p.cooldownSec) {
      skipped.push({ key: it.key, reason: 'cooldown', detail: `${nowSec - last}s < ${p.cooldownSec}s` })
      continue
    }
    kept.push(it)
  }

  // cele mai grase primele: daca lista se taie, se taie de la coada ieftina
  kept.sort((a, b) => (a.rewardWei > b.rewardWei ? -1 : a.rewardWei < b.rewardWei ? 1 : 0))

  const pass = kept.slice(0, p.maxJobsPerRun)
  for (const it of kept.slice(p.maxJobsPerRun)) skipped.push({ key: it.key, reason: 'over-run-cap' })
  return { pass, skipped }
}

export interface Verdict {
  go: boolean
  reason: SkipReason | null
  detail: string
}

export interface ProfitInput {
  rewardWei: bigint
  rewardMeasured: boolean
  gasCostWei: bigint
  cfg: Config
}

/**
 * In modul 'profit' castigul trebuie sa acopere gazul inmultit cu marja.
 * In modul 'campaign' se lucreaza si in pierdere, pentru ca scopul e altul.
 *
 * Cazul care conteaza cel mai mult e al treilea: castig NEMASURAT in modul
 * profit. Acolo raspunsul corect nu e "probabil merita", ci refuz. Altfel
 * frana ar exista in configurare si nu s-ar aplica niciodata, si aia e mai
 * rau decat sa lipseasca. Lectia s-a platit o data la Courier.
 */
export function decideProfit(i: ProfitInput): Verdict {
  const { rewardWei, rewardMeasured, gasCostWei, cfg } = i
  if (cfg.policy.mode === 'campaign') {
    return { go: true, reason: null, detail: 'campaign mode: work even at a loss' }
  }
  if (!rewardMeasured && cfg.policy.requireMeasuredReward) {
    return {
      go: false,
      reason: 'reward-not-measured',
      detail:
        'profit mode needs a reward that can be read up front. Point job.reward at a contract call, ' +
        'switch to campaign mode, or set requireMeasuredReward to false and accept working blind.'
    }
  }
  if (rewardWei < cfg.policy.minRewardWei) {
    return { go: false, reason: 'unprofitable', detail: `reward ${rewardWei} below floor ${cfg.policy.minRewardWei}` }
  }
  const needed = scaleWei(gasCostWei, cfg.policy.profitMultiple)
  if (rewardWei < needed) {
    return {
      go: false,
      reason: 'unprofitable',
      detail: `reward ${rewardWei} below ${needed} (gas ${gasCostWei} x ${cfg.policy.profitMultiple})`
    }
  }
  return { go: true, reason: null, detail: `reward ${rewardWei} clears the ${needed} bar` }
}

/** inmultire cu un numar zecimal, fara sa pierdem precizia weiului */
export function scaleWei(value: bigint, multiple: number): bigint {
  const scaled = BigInt(Math.round(multiple * 1_000_000))
  return (value * scaled) / 1_000_000n
}

export function withinDailyBudget(i: { spentTodayWei: bigint; plannedWei: bigint; cfg: Config }): Verdict {
  const cap = i.cfg.policy.dailyGasBudgetWei
  if (cap === null) return { go: true, reason: null, detail: 'no daily budget' }
  if (i.spentTodayWei + i.plannedWei > cap) {
    return { go: false, reason: 'daily-budget', detail: `${i.spentTodayWei} + ${i.plannedWei} exceeds ${cap}` }
  }
  return { go: true, reason: null, detail: `within budget: ${i.spentTodayWei + i.plannedWei} of ${cap}` }
}

export function gasPriceAcceptable(gasPriceWei: bigint, cfg: Config): Verdict {
  const cap = cfg.policy.maxGasPriceWei
  if (cap === null) return { go: true, reason: null, detail: 'no gas price cap' }
  if (gasPriceWei > cap) return { go: false, reason: 'gas-price-cap', detail: `${gasPriceWei} above cap ${cap}` }
  return { go: true, reason: null, detail: `gas ${gasPriceWei} under cap` }
}
