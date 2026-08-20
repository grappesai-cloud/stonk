/**
 * Scanarea: cine are ceva nerevendicat si cat valoreaza.
 *
 * Iesirea de aici e in acelasi timp lista de lucru a botului si "peretele
 * uitatilor" de pe site. Aceleasi date, doua intrebuintari.
 */
import type { Address, PublicClient } from 'viem'
import { abiOf, type Config } from '../config.js'
import { functionNameOf, multiRead, outputCount, outputIndex, type Call } from '../chain/reader.js'
import { walletsOf } from '../discover/brokers.js'
import { resolveArgs, templateFrom } from '../args.js'

export interface TokenClaim {
  token: Address
  symbol: string
  decimals: number
  amount: bigint
  /** valoarea in wei nativi, 0 daca nu stim pretul */
  weiValue: bigint
}

export interface Claim {
  tokenId: bigint
  wallet: Address
  native: bigint
  tokens: TokenClaim[]
  /** valoarea totala pe care o putem pretui, in wei */
  valueWei: bigint
  /** are ceva de livrat, indiferent daca stim sa pretuim */
  hasSomething: boolean
}

export interface ScanResult {
  claims: Claim[]
  scanned: number
  failed: number
  totalValueWei: bigint
  totalNativeWei: bigint
}

export async function scanClaims(client: PublicClient, cfg: Config, tokenIds: bigint[]): Promise<ScanResult> {
  const abi = abiOf(cfg.drops.pending.signature, 'drops.pending.signature')
  const fnName = functionNameOf(abi)
  const nOut = outputCount(abi, fnName)
  const wallets = walletsOf(cfg, tokenIds)

  const p = cfg.drops.pending
  const nativeIdx = p.nativeFields.map((f) => outputIndex(abi, fnName, f))
  const tokenIdx = p.tokenFields.map((t) => ({ ...t, idx: outputIndex(abi, fnName, t.field) }))

  const template = templateFrom(p.arg, p.args)
  const calls: Call[] = tokenIds.map((id) => ({
    address: cfg.drops.address,
    abi,
    functionName: fnName,
    args: resolveArgs(template, { tokenId: id, wallet: wallets.get(id)! })
  }))

  const res = await multiRead<unknown>(client, calls, { chunk: cfg.drops.readChunk })

  const claims: Claim[] = []
  let failed = 0
  let totalValueWei = 0n
  let totalNativeWei = 0n

  res.forEach((r, i) => {
    const tokenId = tokenIds[i]!
    if (r.status !== 'success') {
      failed++
      return
    }
    const values = nOut === 1 ? [r.result] : (r.result as unknown[])

    let native = 0n
    if (nOut === 1 && p.singleReturnIsNative) native = asBig(values[0])
    for (const idx of nativeIdx) native += asBig(values[idx])

    const tokens: TokenClaim[] = []
    for (const t of tokenIdx) {
      const amount = asBig(values[t.idx])
      if (amount === 0n) continue
      const weiValue = t.weiPerToken > 0n ? (amount * t.weiPerToken) / 10n ** BigInt(t.decimals) : 0n
      tokens.push({ token: t.token, symbol: t.symbol, decimals: t.decimals, amount, weiValue })
    }

    const valueWei = native + tokens.reduce((s, t) => s + t.weiValue, 0n)
    const hasSomething = native > 0n || tokens.length > 0
    if (!hasSomething) return

    totalValueWei += valueWei
    totalNativeWei += native
    claims.push({ tokenId, wallet: wallets.get(tokenId)!, native, tokens, valueWei, hasSomething })
  })

  return { claims, scanned: tokenIds.length, failed, totalValueWei, totalNativeWei }
}

function asBig(v: unknown): bigint {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number') return BigInt(v)
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v)
  return 0n
}
