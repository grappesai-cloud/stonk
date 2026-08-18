/**
 * Simularea. Regula casei: nicio tranzactie nu pleaca nesimulata.
 *
 * Se face in doi pasi, si ordinea conteaza:
 *  1. fiecare livrare separat, ca sa afli motivul exact al fiecarui esec.
 *     Intr-un lot cu tolerare de esec motivele se pierd, si atunci nu mai stii
 *     daca functia e rezervata proprietarului, daca nu mai e nimic de livrat
 *     sau daca ti-a luat altcineva runda.
 *  2. lotul supravietuitorilor, o singura data, ca sa afli bacsisul total si
 *     gazul real. Bacsisul se citeste din ce intoarce contractul de lot, deci
 *     e masurat, nu presupus.
 */
import {
  encodeFunctionData,
  type Abi,
  type Account,
  type Address,
  type Hex,
  type PublicClient
} from 'viem'
import { abiOf, type Config } from '../config.js'
import { functionNameOf } from '../chain/reader.js'
import { pool } from '../chain/client.js'
import type { Claim } from '../scan/claims.js'

export const BATCH_ABI = [
  {
    type: 'function',
    name: 'run',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'calls', type: 'bytes[]' },
      { name: 'gasCap', type: 'uint256' },
      { name: 'beneficiary', type: 'address' }
    ],
    outputs: [
      { name: 'ok', type: 'bool[]' },
      { name: 'tips', type: 'uint256' },
      { name: 'fee', type: 'uint256' }
    ]
  }
] as const

export interface SingleSim {
  claim: Claim
  ok: boolean
  gas: bigint
  reason: string | null
  /** clasificarea motivului, ca sa putem reactiona diferit */
  kind: 'ok' | 'owner-gated' | 'nothing-pending' | 'reverted' | 'error'
}

export interface BatchSim {
  claims: Claim[]
  calldata: Hex[]
  ok: boolean[]
  tipsWei: bigint
  feeWei: bigint
  gasUnits: bigint
  gasPriceWei: bigint
  gasCostWei: bigint
  /** bacsisul e masurat doar cand trecem prin contractul de lot */
  tipsMeasured: boolean
}

export function deliverCalldata(cfg: Config, claim: Claim): Hex {
  const abi = abiOf(cfg.drops.deliverSignature, 'drops.deliverSignature') as Abi
  const fn = functionNameOf(abi)
  const arg = cfg.drops.deliverArg === 'wallet' ? claim.wallet : claim.tokenId
  return encodeFunctionData({ abi, functionName: fn, args: [arg] })
}

/**
 * ABI-ul folosit la simulare: functia plus erorile proprii ale contractului.
 * Fara erori in ABI, un revert cu eroare proprie ajunge la noi ca patru octeti
 * hex si nu mai stim daca am fost respinsi sau nu mai era nimic de livrat.
 */
export function simAbiOf(cfg: Config): Abi {
  const parts = [cfg.drops.deliverSignature, ...cfg.drops.errorSignatures]
  const merged: unknown[] = []
  for (const p of parts) merged.push(...(abiOf(p, 'drops.errorSignatures') as unknown as unknown[]))
  return merged as Abi
}

function classify(message: string): SingleSim['kind'] {
  const m = message.toLowerCase()
  if (/notbrokerowner|not owner|onlyowner|unauthorized|not allowed|caller is not/.test(m)) return 'owner-gated'
  if (/nothingpending|nothing to claim|no pending|zero amount|already claimed|already delivered/.test(m)) {
    return 'nothing-pending'
  }
  return 'reverted'
}

/** fiecare livrare separat: succes, gaz si motivul exact al esecului */
export async function simulateEach(
  client: PublicClient,
  cfg: Config,
  from: Address,
  claims: Claim[],
  concurrency = 10
): Promise<SingleSim[]> {
  const abi = simAbiOf(cfg)
  const fn = functionNameOf(abi)
  return pool(claims, concurrency, async (claim) => {
    const data = deliverCalldata(cfg, claim)
    const arg = cfg.drops.deliverArg === 'wallet' ? claim.wallet : claim.tokenId
    try {
      await client.simulateContract({ address: cfg.drops.address, abi, functionName: fn, args: [arg], account: from })
      let gas = 0n
      try {
        gas = await client.estimateGas({ account: from, to: cfg.drops.address, data })
      } catch {
        gas = 0n
      }
      return { claim, ok: true, gas, reason: null, kind: 'ok' as const }
    } catch (e) {
      const err = e as { shortMessage?: string; details?: string; message?: string; metaMessages?: string[] }
      const reason = [err.shortMessage, err.details, ...(err.metaMessages ?? [])].filter(Boolean).join(' | ') ||
        err.message || 'revert necunoscut'
      return { claim, ok: false, gas: 0n, reason, kind: classify(reason) }
    }
  })
}

/** lotul intreg, o singura data: bacsis masurat si gaz real */
export async function simulateBatch(
  client: PublicClient,
  cfg: Config,
  account: Account | Address,
  claims: Claim[]
): Promise<BatchSim> {
  const calldata = claims.map((c) => deliverCalldata(cfg, c))
  const gasPriceWei = await client.getGasPrice()
  const from = typeof account === 'string' ? account : account.address
  const batch = cfg.execution.batchContract
  const beneficiary = cfg.execution.beneficiary ?? from

  if (!batch) {
    // fara contract de lot: trimitem apelurile una cate una, deci gazul e suma,
    // iar bacsisul nu poate fi masurat inainte. Il declaram nemasurat, nu il inventam.
    const each = await simulateEach(client, cfg, from, claims)
    const gasUnits = each.reduce((s, e) => s + e.gas, 0n)
    return {
      claims,
      calldata,
      ok: each.map((e) => e.ok),
      tipsWei: 0n,
      feeWei: 0n,
      gasUnits,
      gasPriceWei,
      gasCostWei: gasUnits * gasPriceWei,
      tipsMeasured: false
    }
  }

  const args = [cfg.drops.address, calldata, cfg.policy.gasCapPerCall, beneficiary] as const
  const { result } = await client.simulateContract({
    address: batch,
    abi: BATCH_ABI,
    functionName: 'run',
    args,
    account: from
  })
  const [ok, tips, fee] = result as unknown as [boolean[], bigint, bigint]

  let gasUnits = 0n
  try {
    gasUnits = await client.estimateGas({
      account: from,
      to: batch,
      data: encodeFunctionData({ abi: BATCH_ABI, functionName: 'run', args })
    })
  } catch {
    gasUnits = 0n
  }

  return {
    claims,
    calldata,
    ok: [...ok],
    tipsWei: tips,
    feeWei: fee,
    gasUnits,
    gasPriceWei,
    gasCostWei: gasUnits * gasPriceWei,
    tipsMeasured: true
  }
}

export interface GatingProbe {
  callableByStranger: boolean
  reason: string | null
  kind: SingleSim['kind']
  testedTokenId: string | null
}

/**
 * Intrebarea de la pasul zero: `deliver()` merge apelata de un strain?
 * Daca nu, tot conceptul de Courier pica, si e mai bine sa afli asta dintr-un
 * eth_call decat dupa ce ai scris contracte si ai vandut o poveste.
 */
export async function probeGating(
  client: PublicClient,
  cfg: Config,
  claims: Claim[],
  stranger: Address,
  ownerOf?: (tokenId: bigint) => Address | undefined
): Promise<GatingProbe> {
  const candidate = claims.find((c) => c.hasSomething)
  if (!candidate) {
    return { callableByStranger: false, reason: 'nu exista nicio livrare de incercat', kind: 'error', testedTokenId: null }
  }
  const [asStranger] = await simulateEach(client, cfg, stranger, [candidate], 1)
  const testedTokenId = candidate.tokenId.toString()

  if (asStranger!.ok) {
    return { callableByStranger: true, reason: null, kind: 'ok', testedTokenId }
  }

  /**
   * Strainul a fost respins. Intrebarea urmatoare nu se rezolva ghicind din
   * textul erorii, ci simuland acelasi apel din contul proprietarului. Daca
   * proprietarului ii merge si strainului nu, atunci functia e rezervata, si
   * asta e dovada, nu banuiala.
   */
  const owner = ownerOf?.(candidate.tokenId)
  if (owner) {
    const [asOwner] = await simulateEach(client, cfg, owner, [candidate], 1)
    if (asOwner!.ok) {
      return {
        callableByStranger: false,
        reason: `merge apelata de proprietar, nu si de un strain: ${asStranger!.reason ?? 'revert'}`,
        kind: 'owner-gated',
        testedTokenId
      }
    }
  }

  return {
    callableByStranger: false,
    reason: asStranger!.reason,
    kind: asStranger!.kind,
    testedTokenId
  }
}
