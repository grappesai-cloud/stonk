/**
 * MINER: inchide rundele care asteapta randomness si incaseaza rasplata.
 *
 * Intrebarea care decide daca agentul asta exista nu e "merge codul", ci
 * "poate un strain sa inchida runda?". Sunt doua lumi diferite sub acelasi
 * cuvant:
 *
 *  1. contractul cere INTAI randomness de la un oracol, iar dupa ce a sosit
 *     oricine poate apela `settle(id)`. Aici Miner are ce cauta.
 *  2. functia e chiar `fulfillRandomWords(...)` a oracolului, rezervata
 *     coordonatorului si insotita de o dovada pe care nu o putem produce.
 *     Aici Miner NU exista, si niciun cod nu schimba asta.
 *
 * Diagnosticul raspunde prin proba, nu din textul erorii: simuleaza acelasi
 * apel din contul strainului si din al celui care are voie. Si mai verifica
 * ceva ce se uita usor: chiar daca apelul ar trece, argumentele lui trebuie sa
 * fie ale noastre. O functie care cere cuvinte aleatoare semnate de altcineva
 * ramane inchisa chiar daca oricine o poate apela.
 */
import { z } from 'zod'
import { parseAbi, type Abi, type Address } from 'viem'
import { abiOf, abiWithErrors, zAddress, zBig, type Config } from '../core/config.js'
import { functionNameOf, multiRead, outputIndex, type Call } from '../core/chain/reader.js'
import { readCall, valueOf, zCall, zSource, asBig } from '../core/read.js'
import { resolveArgs } from '../core/args.js'
import type { DiscoverInput, Job, JobCheck, Target, WorkItem } from '../core/work.js'
import { ownerOf } from './ringer.js'

export const MinerSchema = z.object({
  discovery: z.discriminatedUnion('mode', [
    /** contractul da direct lista; cel mai simplu si cel mai rar */
    z.object({ mode: z.literal('list'), call: zCall }),
    /** un cursor si id-uri consecutive, fiecare verificat prin citirea de stare */
    z.object({
      mode: z.literal('range'),
      cursor: zCall,
      firstId: zBig.default(1n),
      /** cate id-uri in urma cursorului ne uitam; rundele vechi sunt deja inchise */
      window: z.number().int().positive().default(200)
    }),
    /** din evenimente: deschise minus inchise. Merge si cand contractul nu expune nimic */
    z.object({
      mode: z.literal('logs'),
      openedEvent: z.string().min(5),
      closedEvent: z.string().min(5),
      idField: z.string().default('id'),
      /** cate blocuri in urma, ca sa nu citim lantul de la geneza la fiecare rulare */
      lookbackBlocks: zBig.default(50_000n)
    })
  ]),

  /** citirea de stare pentru un id: din ea aflam daca e de lucru si cat se plateste */
  state: z
    .object({
      call: zCall,
      /** cand e de lucru */
      readyWhen: z.discriminatedUnion('mode', [
        z.object({ mode: z.literal('equals'), field: z.string(), value: zBig }),
        z.object({ mode: z.literal('notEquals'), field: z.string(), value: zBig }),
        z.object({ mode: z.literal('truthy'), field: z.string() }),
        z.object({ mode: z.literal('any') })
      ]),
      /** campul cu miza rundei, pentru afisare si praguri */
      stakeField: z.string().nullable().default(null)
    })
    .nullable()
    .default(null),

  reward: zSource.default({ mode: 'none' }),

  action: zCall,

  /** cine are voie, daca functia e rezervata. Gol = incercam owner() */
  authority: z
    .object({ address: zAddress.nullable().default(null), call: zCall.nullable().default(null) })
    .default({}),

  /** cate citiri de stare intr-un multicall */
  readChunk: z.number().int().positive().default(200)
})

export type MinerJob = z.infer<typeof MinerSchema>

export const miner: Job<MinerJob> = {
  kind: 'miner',

  parse(raw) {
    const p = MinerSchema.safeParse(raw ?? {})
    if (!p.success) {
      const lines = p.error.issues.map((i) => `  job.${i.path.join('.') || '(root)'}: ${i.message}`)
      throw new Error(`invalid miner job config:\n${lines.join('\n')}`)
    }
    return p.data
  },

  required(cfg) {
    return [{ what: 'rounds contract', address: cfg.target.address }]
  },

  target(cfg, job): Target {
    const abi = abiWithErrors(job.action.signature, cfg.target.errorSignatures, 'job.action.signature')
    return { address: cfg.target.address, abi, functionName: functionNameOf(abi) }
  },

  async authority(client, cfg, job) {
    if (job.authority.address) return job.authority.address
    if (job.authority.call) {
      try {
        const { pick } = await readCall(client, cfg.target.address, job.authority.call, {}, 'job.authority.call')
        const v = pick(job.authority.call.field)
        if (typeof v === 'string' && v.startsWith('0x')) return v as Address
      } catch {
        /* mergem mai departe cu owner() */
      }
    }
    return ownerOf(client, cfg.target.address)
  },

  async discover({ client, cfg, job }): Promise<WorkItem[]> {
    const ids = await candidateIds(client, cfg, job)
    if (ids.length === 0) return []
    const nowSec = Math.floor(Date.now() / 1000)
    const out: WorkItem[] = []

    /* Fara citire de stare nu putem filtra, deci fiecare id devine candidat si
       simularea ramane singurul filtru. Merge, dar costa: fiecare id inseamna
       un eth_call in plus. */
    if (!job.state) {
      for (const id of ids) {
        const ctx = { id, account: cfg.execution.beneficiary, beneficiary: cfg.execution.beneficiary, nowSec }
        const reward = await valueOf(client, cfg.target.address, job.reward, ctx)
        out.push({
          key: `round:${id}`,
          label: `ROUND #${id}`,
          args: resolveArgs(job.action.args, ctx),
          rewardWei: reward.wei,
          rewardMeasured: reward.measured,
          stakeWei: 0n,
          meta: { reward: reward.detail }
        })
      }
      return out
    }

    const abi = abiOf(job.state.call.signature, 'job.state.call')
    const fn = functionNameOf(abi)
    const calls: Call[] = ids.map((id) => ({
      address: cfg.target.address,
      abi,
      functionName: fn,
      args: resolveArgs(job.state!.call.args, { id, nowSec }) as readonly unknown[]
    }))
    const res = await multiRead<unknown>(client, calls, { chunk: job.readChunk })

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!
      const r = res[i]!
      if (r.status !== 'success') continue
      const values = Array.isArray(r.result) ? (r.result as unknown[]) : [r.result]
      const field = (name: string): unknown => values[outputIndex(abi, fn, name)]

      if (!ready(job.state.readyWhen, field)) continue

      const stakeWei = job.state.stakeField ? asBig(field(job.state.stakeField)) : 0n
      const ctx = { id, account: cfg.execution.beneficiary, beneficiary: cfg.execution.beneficiary, nowSec }
      const reward = await valueOf(client, cfg.target.address, job.reward, ctx, {
        stakeWei,
        stateField: field
      })

      out.push({
        key: `round:${id}`,
        label: `ROUND #${id}`,
        args: resolveArgs(job.action.args, ctx),
        rewardWei: reward.wei,
        rewardMeasured: reward.measured,
        stakeWei,
        meta: { reward: reward.detail }
      })
    }
    return out
  },

  async checks({ cfg, job }): Promise<JobCheck[]> {
    const checks: JobCheck[] = []

    /**
     * Argumentele apelului sunt ale noastre?
     *
     * Verificarea asta prinde exact cazul in care Miner nu poate exista chiar
     * daca functia e deschisa: `fulfillRandomWords(uint256, uint256[])` cere
     * niste cuvinte pe care numai oracolul le poate produce. O functie pe care
     * o poti apela cu date pe care nu le ai ramane inchisa.
     */
    const abi = abiOf(job.action.signature, 'job.action.signature')
    const fn = abi.find((x) => x.type === 'function')
    if (fn && fn.type === 'function') {
      const suspicious = fn.inputs.filter(
        (inp, i) =>
          /bytes|\[\]/.test(inp.type) &&
          !isPlaceholder(job.action.args[i])
      )
      if (suspicious.length > 0) {
        const names = suspicious.map((s) => `${s.type} ${s.name || '?'}`).join(', ')
        checks.push({
          name: 'arguments are ours to produce',
          ok: false,
          detail:
            `${fn.name}() takes ${names} filled from config with fixed values. If those are randomness or a proof ` +
            `that only the oracle can produce, this agent cannot exist no matter who is allowed to call.`
        })
      } else {
        checks.push({
          name: 'arguments are ours to produce',
          ok: true,
          detail: `${fn.name}() only needs values we can derive (${fn.inputs.map((i) => i.type).join(', ') || 'none'})`
        })
      }
    }

    if (job.reward.mode === 'none' && cfg.policy.mode === 'profit' && cfg.policy.requireMeasuredReward) {
      checks.push({
        name: 'reward',
        ok: false,
        detail: 'profit mode with no reward source: every run will refuse to settle. Configure job.reward or run in campaign mode.',
        fatal: true
      })
    }
    return checks
  }
}

function isPlaceholder(v: unknown): boolean {
  return typeof v === 'string' && v.startsWith('$')
}

function ready(rule: NonNullable<MinerJob['state']>['readyWhen'], field: (name: string) => unknown): boolean {
  switch (rule.mode) {
    case 'any':
      return true
    case 'truthy': {
      const v = field(rule.field)
      return v === true || asBig(v) > 0n
    }
    case 'equals':
      return asBig(field(rule.field)) === rule.value
    case 'notEquals':
      return asBig(field(rule.field)) !== rule.value
  }
}

async function candidateIds(
  client: DiscoverInput['client'],
  cfg: Config,
  job: MinerJob
): Promise<bigint[]> {
  const d = job.discovery
  if (d.mode === 'list') {
    const { pick } = await readCall(client, cfg.target.address, d.call, {}, 'job.discovery.call')
    const v = pick(d.call.field)
    return Array.isArray(v) ? v.map(asBig) : []
  }
  if (d.mode === 'range') {
    const { pick } = await readCall(client, cfg.target.address, d.cursor, {}, 'job.discovery.cursor')
    const next = asBig(pick(d.cursor.field))
    const last = next > 0n ? next - 1n : 0n
    const first = last > BigInt(d.window) ? last - BigInt(d.window) + 1n : d.firstId
    const out: bigint[] = []
    for (let id = first; id <= last; id++) out.push(id)
    return out
  }

  // logs: deschise minus inchise
  const head = await client.getBlockNumber()
  const configured = cfg.target.deployBlock
  const lookback = head > d.lookbackBlocks ? head - d.lookbackBlocks : 0n
  const fromBlock = configured > lookback ? configured : lookback
  const openAbi = parseAbi([d.openedEvent]) as Abi
  const closeAbi = parseAbi([d.closedEvent]) as Abi

  const [opened, closed] = await Promise.all([
    client.getLogs({ address: cfg.target.address, event: (openAbi as never)[0], fromBlock, toBlock: head }),
    client.getLogs({ address: cfg.target.address, event: (closeAbi as never)[0], fromBlock, toBlock: head })
  ])
  const idOf = (l: unknown): bigint | null => {
    const args = (l as { args?: Record<string, unknown> }).args
    if (!args) return null
    const v = args[d.idField]
    return v === undefined ? null : asBig(v)
  }
  const done = new Set<string>()
  for (const l of closed) {
    const id = idOf(l)
    if (id !== null) done.add(id.toString())
  }
  const out: bigint[] = []
  const seen = new Set<string>()
  for (const l of opened) {
    const id = idOf(l)
    if (id === null) continue
    const k = id.toString()
    if (done.has(k) || seen.has(k)) continue
    seen.add(k)
    out.push(id)
  }
  return out
}
