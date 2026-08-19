/**
 * Citiri descrise din configurare.
 *
 * Ambele meserii au nevoie de acelasi lucru: "citeste cifra asta din
 * contract", unde si functia, si campul din raspuns, si argumentele vin din
 * fisierul de configurare, nu din cod. Cand apar contractele adevarate
 * StonkBrokers, aici nu se schimba nimic.
 */
import { z } from 'zod'
import type { Address, PublicClient } from 'viem'
import { abiOf, zAddress, zBig } from './config.js'
import { functionNameOf, outputCount, outputIndex } from './chain/reader.js'
import { resolveArgs, type ArgContext } from './args.js'

/** o citire: semnatura, argumente ca sablon, si eventual ce camp din raspuns */
export const zCall = z.object({
  signature: z.string().min(5),
  args: z.array(z.unknown()).default([]),
  /** numele campului din raspuns; gol = primul */
  field: z.string().nullable().default(null),
  /**
   * De la ce contract se citeste. Gol = tinta agentului.
   *
   * Trebuie, fiindca in realitate cifra dupa care se ia decizia nu sta mereu
   * in contractul pe care apesi: oala urmatoarei runde e soldul de jetoane al
   * contractului, adica o citire de pe JETON, nu de pe el.
   */
  address: zAddress.nullable().default(null)
})
export type CallSpec = z.infer<typeof zCall>

/** de unde vine o suma in wei */
export const zSource = z.discriminatedUnion('mode', [
  /** nu stim si nu pretindem ca stim */
  z.object({ mode: z.literal('none') }),
  /** scrisa de mana in configurare: declarata, NU masurata */
  z.object({ mode: z.literal('const'), wei: zBig }),
  /** o parte din miza, in puncte de baza (500 = 5%) */
  z.object({ mode: z.literal('bps'), bps: z.number().int().min(0).max(10_000) }),
  /** citita de pe lant: singura care conteaza cu adevarat */
  z.object({ mode: z.literal('call'), call: zCall }),
  /** un camp din raspunsul citirii de stare, cand acolo scrie deja cat se plateste */
  z.object({ mode: z.literal('field'), field: z.string() })
])
export type Source = z.infer<typeof zSource>

export interface Measured {
  wei: bigint
  /** true doar cand cifra vine de pe lant */
  measured: boolean
  detail: string
}

/** apeleaza o citire si intoarce raspunsul ca lista de valori, cu numele campurilor */
export async function readCall(
  client: PublicClient,
  address: Address,
  spec: CallSpec,
  ctx: ArgContext,
  what: string
): Promise<{ values: unknown[]; pick: (field: string | null) => unknown }> {
  const abi = abiOf(spec.signature, what)
  const fn = functionNameOf(abi)
  const n = outputCount(abi, fn)
  const result = await client.readContract({
    address: spec.address ?? address,
    abi,
    functionName: fn,
    args: resolveArgs(spec.args, ctx) as never
  })
  const values = n === 1 ? [result] : (result as unknown[])
  const pick = (field: string | null): unknown => {
    if (field === null) return values[0]
    return values[outputIndex(abi, fn, field)]
  }
  return { values, pick }
}

export function asBig(v: unknown): bigint {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number') return BigInt(v)
  if (typeof v === 'boolean') return v ? 1n : 0n
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v)
  return 0n
}

/**
 * Cat se castiga. Regula care conteaza: `measured` e adevarat DOAR cand cifra
 * vine de pe lant. O suma scrisa in configurare e o presupunere, si in modul
 * profit o presupunere nu are voie sa treaca de frana.
 */
export async function valueOf(
  client: PublicClient,
  address: Address,
  source: Source,
  ctx: ArgContext,
  opts: { stakeWei?: bigint; stateField?: (field: string) => unknown } = {}
): Promise<Measured> {
  switch (source.mode) {
    case 'none':
      return { wei: 0n, measured: false, detail: 'unknown: no reward source configured' }
    case 'const':
      return { wei: source.wei, measured: false, detail: `declared in config: ${source.wei}` }
    case 'bps': {
      const stake = opts.stakeWei ?? 0n
      const wei = (stake * BigInt(source.bps)) / 10_000n
      return {
        wei,
        /* miza chiar a fost citita de pe lant, deci partea din ea e masurata;
           daca miza lipseste, nu avem ce masura */
        measured: opts.stakeWei !== undefined,
        detail: `${source.bps}bps of ${stake}`
      }
    }
    case 'field': {
      const raw = opts.stateField?.(source.field)
      if (raw === undefined) {
        return { wei: 0n, measured: false, detail: `field ${source.field} is not in the state read` }
      }
      return { wei: asBig(raw), measured: true, detail: `read from state field ${source.field}` }
    }
    case 'call': {
      const { pick } = await readCall(client, address, source.call, ctx, 'job.reward.call')
      return { wei: asBig(pick(source.call.field)), measured: true, detail: `read from ${source.call.signature}` }
    }
  }
}
