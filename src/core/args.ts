/**
 * Argumentele apelurilor, ca sablon.
 *
 * Lectia de la Courier: prima varianta accepta un singur argument, si merge
 * doar cu contracte scrise de mine. Contractele adevarate cer structuri.
 * Sablonul se scrie in configurare, cu locuri goale care se umplu la fiecare
 * bucata de munca:
 *   ["$id"]
 *   [{ roundId: "$id", recipient: "$beneficiary" }]
 *
 * Locuri goale: $id, $key, $account, $beneficiary, $now, $max128, $max256,
 * $zero, $amount, $gauge, $gauges, $weights, $power. Orice sir format doar din
 * cifre devine numar intreg, ca sa nu fie nevoie sa scrii sume mari altfel
 * decat ca text.
 */
import type { Address } from 'viem'

export const MAX_UINT128 = (1n << 128n) - 1n
export const MAX_UINT256 = (1n << 256n) - 1n

export interface ArgContext {
  /** id-ul numeric al bucatii, cand exista */
  id?: bigint
  /** identitatea ei ca text, cand nu e numerica */
  key?: string
  /** contul care semneaza */
  account?: Address | null
  /** unde vrem sa ajunga castigul */
  beneficiary?: Address | null
  nowSec?: number
  /** cate unitati punem la loc (Stocker) */
  amount?: bigint
  /** pe cine votam si cu cat (Lobbyist) */
  gauge?: Address
  gauges?: Address[]
  weights?: bigint[]
  power?: bigint
}

export function resolveArgs(template: unknown[], ctx: ArgContext): unknown[] {
  return template.map((t) => resolveOne(t, ctx))
}

function need<T>(v: T | null | undefined, name: string): T {
  if (v === null || v === undefined) throw new Error(`sablonul cere ${name} dar valoarea nu e cunoscuta`)
  return v
}

function resolveOne(node: unknown, ctx: ArgContext): unknown {
  if (Array.isArray(node)) return node.map((n) => resolveOne(n, ctx))
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node)) out[k] = resolveOne(v, ctx)
    return out
  }
  if (typeof node !== 'string') return node

  switch (node) {
    case '$id':
      return need(ctx.id, '$id')
    case '$key':
      return need(ctx.key, '$key')
    case '$account':
      return need(ctx.account, '$account')
    case '$beneficiary':
      return need(ctx.beneficiary ?? ctx.account, '$beneficiary')
    case '$now':
      return BigInt(ctx.nowSec ?? Math.floor(Date.now() / 1000))
    case '$max128':
      return MAX_UINT128
    case '$max256':
      return MAX_UINT256
    case '$zero':
      return 0n
    case '$amount':
      return need(ctx.amount, '$amount')
    case '$gauge':
      return need(ctx.gauge, '$gauge')
    case '$gauges':
      return need(ctx.gauges, '$gauges')
    case '$weights':
      return need(ctx.weights, '$weights')
    case '$power':
      return need(ctx.power, '$power')
    default:
      if (/^\d+$/.test(node)) return BigInt(node)
      return node
  }
}
