/**
 * Argumentele apelurilor, ca sablon.
 *
 * Prima varianta accepta un singur argument: id-ul sau adresa portofelului.
 * Merge pentru un contract scris de noi, si nu merge pentru niciun contract
 * adevarat. Uniswap, de exemplu, cere o structura cu patru campuri.
 *
 * Sablonul se scrie in configurare, cu locuri goale care se umplu la fiecare
 * livrare:
 *   ["$tokenId"]
 *   [{ tokenId: "$tokenId", recipient: "$wallet", amount0Max: "$max128" }]
 *
 * Locuri goale: $tokenId, $wallet, $owner, $max128, $max256, $zero.
 * Orice sir format doar din cifre devine numar intreg, ca sa nu fie nevoie sa
 * scrii sume mari altfel decat ca text.
 */
import type { Address } from 'viem'

export const MAX_UINT128 = (1n << 128n) - 1n
export const MAX_UINT256 = (1n << 256n) - 1n

export interface ArgContext {
  tokenId: bigint
  wallet: Address
  owner?: Address | null
}

export function resolveArgs(template: unknown[], ctx: ArgContext): unknown[] {
  return template.map((t) => resolveOne(t, ctx))
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
    case '$tokenId':
      return ctx.tokenId
    case '$wallet':
      return ctx.wallet
    case '$owner':
      if (!ctx.owner) throw new Error('sablonul cere $owner dar proprietarul nu e cunoscut')
      return ctx.owner
    case '$max128':
      return MAX_UINT128
    case '$max256':
      return MAX_UINT256
    case '$zero':
      return 0n
    default:
      /* sir de cifre = numar intreg. Asa se scriu sumele mari in JSON. */
      if (/^\d+$/.test(node)) return BigInt(node)
      return node
  }
}

/** compatibilitate cu forma veche, cu un singur argument */
export function templateFrom(arg: 'tokenId' | 'wallet', explicit: unknown[] | null): unknown[] {
  if (explicit && explicit.length > 0) return explicit
  return [arg === 'wallet' ? '$wallet' : '$tokenId']
}
