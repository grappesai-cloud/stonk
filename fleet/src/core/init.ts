/**
 * Descoperirea configurarii din ABI-ul verificat.
 *
 * Partea cea mai enervanta la pornire e sa scrii de mana semnaturile
 * contractului, si e si locul unde gresesti cel mai usor: un nume de camp
 * gresit inseamna ca botul citeste zero peste tot si crede ca nu are ce
 * lucra. Asa ca il intrebam pe explorer si propunem noi.
 *
 * Nu ghiceste in locul tau. Propune candidati, ii pune in ordine si spune de
 * ce. Alegerea ramane a omului, pentru ca o functie numita `settle` poate face
 * oricare din trei lucruri diferite.
 */
import type { AgentKind } from './config.js'
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
  anonymous?: boolean
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
  /** ce apasa / ce inchide */
  action: Candidate[]
  /** de unde se citeste miza (oala, bounty) */
  value: Candidate[]
  /** de unde se afla ce e de lucru */
  discovery: Candidate[]
  /** evenimentul din care se tine caietul de curse */
  events: Candidate[]
  errors: string[]
}

const WORDS: Record<AgentKind, { action: RegExp; value: RegExp; discovery: RegExp; event: RegExp }> = {
  ringer: {
    action: /clock ?in|clockin|ring|poke|ping|trigger|kick|start|advance|tick|crank/i,
    value: /pot|pool|prize|jackpot|reward|tip|bounty|accrued|balance/i,
    discovery: /can|is|next|due|deadline|ready|last|cooldown|eligible/i,
    event: /clock ?in|clockin|ring|trigger|crank|poke/i
  },
  miner: {
    action: /settle|fulfill|finali[sz]e|close|resolve|complete|reveal|draw|process/i,
    value: /bounty|reward|fee|tip|payout|prize|pot/i,
    discovery: /pending|open|active|unsettled|awaiting|next|count|total|rounds?|requests?/i,
    event: /settled|fulfilled|resolved|closed|drawn|revealed|opened|requested/i
  },
  stocker: {
    action: /restock|refill|resupply|stock|load|replenish|fill/i,
    value: /commission|reward|fee|price|cost|payout|margin/i,
    discovery: /machine|slot|inventory|stock|level|capacity|low|empty|needs/i,
    event: /restock|refill|stocked|filled|empty|depleted/i
  },
  courier: {
    action: /deliver|clock ?in|clockin|claim|push|distribute|sweep|payout|flush/i,
    value: /claimable|pending|owed|unclaimed|credit|earned|share/i,
    discovery: /claimable|pending|owed|credit|supply|total|rounds?|brokers?/i,
    event: /delivered|clockedin|clocked|claimed|distributed|credited/i
  },
  lobbyist: {
    action: /vote|cast|poke|claim|harvest|collect/i,
    value: /bribe|reward|fee|incentive|payout|claimable|earned/i,
    discovery: /gauge|pool|epoch|period|weight|votes?|power|balanceOfNFT|locked/i,
    event: /voted|abstained|claimed|notify|bribe|deposit/i
  },
  /* traderul lucreaza pe contractele NOASTRE: `init` (facut pentru contracte
     straine) nu are ce ghici la el, dar cuvintele exista ca sa nu fie cazul
     special al fiecarui switch */
  trader: {
    action: /executeTrade|execute|trade|swap|rotate/i,
    value: /balance|nav|value|equity/i,
    discovery: /nextId|accountOf|strategyOf|paused|policy|route/i,
    event: /trade|swap|rotated|executed/i
  }
}

export function signatureOf(fn: AbiFn): string {
  const ins = (fn.inputs ?? []).map((i) => `${i.type}${i.name ? ' ' + i.name : ''}`).join(', ')
  const outs = (fn.outputs ?? []).map((o) => `${o.type}${o.name ? ' ' + o.name : ''}`).join(', ')
  const mut = fn.stateMutability === 'view' || fn.stateMutability === 'pure' ? ' view' : ''
  return `function ${fn.name}(${ins})${mut}${outs ? ` returns (${outs})` : ''}`
}

export function eventSignatureOf(fn: AbiFn): string {
  const ins = (fn.inputs ?? [])
    .map((i) => `${i.type}${(i as { indexed?: boolean }).indexed ? ' indexed' : ''}${i.name ? ' ' + i.name : ''}`)
    .join(', ')
  return `event ${fn.name}(${ins})`
}

export function classify(abi: AbiFn[], kind: AgentKind): Omit<Discovered, 'address' | 'name' | 'verified'> {
  const w = WORDS[kind]
  const action: Candidate[] = []
  const value: Candidate[] = []
  const discovery: Candidate[] = []
  const events: Candidate[] = []
  const errors: string[] = []

  for (const fn of abi) {
    if (fn.type === 'error' && fn.name) {
      const ins = (fn.inputs ?? []).map((i) => `${i.type}${i.name ? ' ' + i.name : ''}`).join(', ')
      errors.push(`error ${fn.name}(${ins})`)
      continue
    }
    if (fn.type === 'event' && fn.name) {
      const why: string[] = []
      let score = 1
      if (w.event.test(fn.name)) {
        score += 5
        why.push(`numele suna a treaba facuta (${fn.name})`)
      }
      if ((fn.inputs ?? []).some((i) => i.type === 'address')) {
        score += 3
        why.push('are o adresa, deci se poate afla CINE a apucat primul')
      }
      if (score > 1) events.push({ signature: eventSignatureOf(fn), score, why })
      continue
    }
    if (fn.type !== 'function' || !fn.name) continue

    const ins = fn.inputs ?? []
    const outs = fn.outputs ?? []
    const readOnly = fn.stateMutability === 'view' || fn.stateMutability === 'pure'
    const simpleArgs = ins.length <= 1 && ins.every((i) => /^(uint\d*|address|bool)$/.test(i.type))

    if (!readOnly && simpleArgs) {
      const why: string[] = [ins.length === 0 ? 'scrie, fara argumente' : 'scrie, un singur argument simplu']
      let score = 2
      if (w.action.test(fn.name)) {
        score += 5
        why.push(`numele suna a treaba (${fn.name})`)
      }
      if (fn.stateMutability === 'nonpayable') {
        score += 1
        why.push('nu cere ETH la apel')
      }
      action.push({ signature: signatureOf(fn), score, why })
    }

    if (!readOnly && !simpleArgs && w.action.test(fn.name)) {
      /* candidat, dar cu semn de intrebare: argumentele nu sunt banale, deci
         poate cere date pe care nu le avem */
      action.push({
        signature: signatureOf(fn),
        score: 3,
        why: [`numele suna a treaba (${fn.name})`, 'ATENTIE: cere argumente complexe, verifica daca sunt ale tale']
      })
    }

    if (readOnly && outs.length > 0) {
      if (outs.every((o) => /^uint\d*$/.test(o.type))) {
        const why: string[] = ['citeste si raspunde cu numere']
        let score = 2
        if (w.value.test(fn.name)) {
          score += 4
          why.push(`numele suna a bani (${fn.name})`)
        }
        if (outs.every((o) => o.name)) {
          score += 2
          why.push('campurile au nume, deci se pot lega in configurare')
        }
        value.push({ signature: signatureOf(fn), score, why })
      }
      const why: string[] = ['citeste']
      let score = 1
      if (w.discovery.test(fn.name)) {
        score += 4
        why.push(`numele suna a "ce e de lucru" (${fn.name})`)
      }
      if (outs.some((o) => o.type.endsWith('[]'))) {
        score += 3
        why.push('raspunde cu o lista, deci da direct lista de lucru')
      }
      if (outs.some((o) => o.type === 'bool')) {
        score += 2
        why.push('raspunde cu da/nu, bun pentru "e gata?"')
      }
      if (score > 1) discovery.push({ signature: signatureOf(fn), score, why })
    }
  }

  const byScore = (a: Candidate, b: Candidate) => b.score - a.score
  return {
    action: action.sort(byScore).slice(0, 6),
    value: value.sort(byScore).slice(0, 6),
    discovery: discovery.sort(byScore).slice(0, 6),
    events: events.sort(byScore).slice(0, 4),
    errors
  }
}

/** ABI-ul verificat, de la un explorer Blockscout */
export async function fetchAbi(explorer: string, address: string): Promise<{ abi: AbiFn[]; name: string | null }> {
  const base = explorer.replace(/\/+$/, '')
  const res = await fetch(`${base}/api/v2/smart-contracts/${address}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(25_000)
  })
  if (!res.ok) throw new Error(`the explorer answered ${res.status}`)
  const body = (await res.json()) as {
    abi?: AbiFn[]
    name?: string
    implementations?: Array<{ address?: string; address_hash?: string }>
  }
  const impl = body.implementations?.[0]?.address ?? body.implementations?.[0]?.address_hash
  if ((!body.abi || body.abi.length === 0) && impl) {
    log.info({ impl }, 'this is a proxy, taking the implementation ABI')
    return fetchAbi(explorer, impl)
  }
  if (!body.abi || body.abi.length === 0) throw new Error('the contract has no verified ABI on the explorer')
  return { abi: body.abi, name: body.name ?? null }
}

export async function discoverAbi(explorer: string, address: string, kind: AgentKind): Promise<Discovered> {
  try {
    const { abi, name } = await fetchAbi(explorer, address)
    return { address, name, verified: true, ...classify(abi, kind) }
  } catch (e) {
    log.warn({ err: (e as Error).message }, 'could not fetch the ABI')
    return { address, name: null, verified: false, action: [], value: [], discovery: [], events: [], errors: [] }
  }
}
