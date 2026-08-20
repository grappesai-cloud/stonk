/**
 * Descoperirea configurarii din ABI-ul verificat.
 *
 * Partea cea mai enervanta la pornire e sa scrii de mana semnaturile
 * contractului de drop-uri, si e si locul unde gresesti cel mai usor: un nume
 * de camp gresit inseamna ca botul citeste zero peste tot si crede ca nu are ce
 * livra. Asa ca il intrebam pe explorer si propunem noi.
 *
 * Nu ghiceste in locul tau. Propune candidati, ii pune in ordine si spune de ce.
 * Alegerea ramane a omului, pentru ca o functie numita `claim` poate face
 * oricare din trei lucruri diferite.
 */
import { log } from './log.js'

export interface AbiInput {
  name: string
  type: string
}
export interface AbiFn {
  type: string
  name?: string
  stateMutability?: string
  inputs?: AbiInput[]
  outputs?: AbiInput[]
}

export interface Candidate {
  signature: string
  score: number
  why: string[]
}

export interface Discovered {
  address: string
  name: string | null
  verified: boolean
  pending: Candidate[]
  deliver: Candidate[]
  errors: string[]
}

const DELIVER_WORDS = /deliver|claim|push|distribute|settle|release|payout|harvest|collect|sweep/i
const PENDING_WORDS = /pending|claimable|unclaimed|owed|earned|accrued|available|balanceOf|rewards?/i

export function signatureOf(fn: AbiFn): string {
  const ins = (fn.inputs ?? []).map((i) => `${i.type}${i.name ? ' ' + i.name : ''}`).join(', ')
  const outs = (fn.outputs ?? []).map((o) => `${o.type}${o.name ? ' ' + o.name : ''}`).join(', ')
  const mut = fn.stateMutability === 'view' || fn.stateMutability === 'pure' ? ' view' : ''
  return `function ${fn.name}(${ins})${mut}${outs ? ` returns (${outs})` : ''}`
}

export function classify(abi: AbiFn[]): { pending: Candidate[]; deliver: Candidate[]; errors: string[] } {
  const pending: Candidate[] = []
  const deliver: Candidate[] = []
  const errors: string[] = []

  for (const fn of abi) {
    if (fn.type === 'error' && fn.name) {
      errors.push(signatureOf({ ...fn, type: 'error' }).replace(/^function /, 'error ').replace(/ returns \(\)$/, ''))
      continue
    }
    if (fn.type !== 'function' || !fn.name) continue

    const ins = fn.inputs ?? []
    const outs = fn.outputs ?? []
    const readOnly = fn.stateMutability === 'view' || fn.stateMutability === 'pure'
    const oneArg = ins.length === 1 && /^(uint\d*|address)$/.test(ins[0]!.type)

    if (readOnly && oneArg && outs.length > 0 && outs.every((o) => /^uint\d*$/.test(o.type))) {
      const why: string[] = ['citeste, un singur argument, raspunde doar cu numere']
      let score = 3
      if (PENDING_WORDS.test(fn.name)) {
        score += 4
        why.push(`numele contine un cuvant de asteptare (${fn.name})`)
      }
      if (outs.every((o) => o.name)) {
        score += 2
        why.push('campurile din raspuns au nume, deci se pot lega in configurare')
      }
      if (ins[0]!.type.startsWith('uint')) {
        score += 1
        why.push('primeste id de token')
      }
      pending.push({ signature: signatureOf(fn), score, why })
    }

    if (!readOnly && oneArg) {
      const why: string[] = ['scrie, un singur argument']
      let score = 2
      if (DELIVER_WORDS.test(fn.name)) {
        score += 5
        why.push(`numele suna a livrare (${fn.name})`)
      }
      if (fn.stateMutability === 'nonpayable') {
        score += 1
        why.push('nu cere ETH la apel')
      }
      deliver.push({ signature: signatureOf(fn), score, why })
    }
  }

  const bySore = (a: Candidate, b: Candidate) => b.score - a.score
  return { pending: pending.sort(bySore).slice(0, 6), deliver: deliver.sort(bySore).slice(0, 6), errors }
}

/** ABI-ul verificat, de la un explorer Blockscout */
export async function fetchAbi(explorer: string, address: string): Promise<{ abi: AbiFn[]; name: string | null }> {
  const base = explorer.replace(/\/+$/, '')
  const res = await fetch(`${base}/api/v2/smart-contracts/${address}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(25_000)
  })
  if (!res.ok) throw new Error(`explorerul a raspuns ${res.status}`)
  const body = (await res.json()) as {
    abi?: AbiFn[]
    name?: string
    implementations?: Array<{ address?: string; address_hash?: string }>
  }

  // contract de tip proxy: ABI-ul util e al implementarii
  const impl = body.implementations?.[0]?.address ?? body.implementations?.[0]?.address_hash
  if ((!body.abi || body.abi.length === 0) && impl) {
    log.info({ impl }, 'contractul e un proxy, iau ABI-ul implementarii')
    return fetchAbi(explorer, impl)
  }
  if (!body.abi || body.abi.length === 0) throw new Error('contractul nu are ABI verificat pe explorer')
  return { abi: body.abi, name: body.name ?? null }
}

export async function discover(explorer: string, address: string): Promise<Discovered> {
  try {
    const { abi, name } = await fetchAbi(explorer, address)
    const c = classify(abi)
    return { address, name, verified: true, ...c }
  } catch (e) {
    log.warn({ err: (e as Error).message }, 'nu am putut lua ABI-ul')
    return { address, name: null, verified: false, pending: [], deliver: [], errors: [] }
  }
}
