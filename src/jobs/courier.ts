/**
 * COURIER: impinge in portofelele brokerilor ce si-au uitat acolo.
 *
 * Fata de ceilalti agenti, aici o tranzactie duce MULTI brokeri deodata,
 * fiindca insusi contractul stie sa primeasca liste: `clockIn(tokens[],
 * tokenIds[])`. Gruparea se face aici, in modul meseriei, si iese tot O
 * SINGURA bucata de munca, cu suma ei masurata. Asa se pastreaza garantia din
 * executor: o tranzactie, o bucata. Lectia care a costat o data la agentul
 * vechi: cu grupare facuta in executor, se trimitea o livrare si se treceau in
 * registru toate.
 *
 * Al doilea lucru pe care il stie meseria asta si nu-l stie miezul: cat i se
 * cuvine fiecarui broker se citeste pe PERECHE (jeton, broker). Cu trei
 * jetoane si 4444 de brokeri sunt peste treisprezece mii de citiri, deci se
 * fac prin multicall, in bucati.
 *
 * Contractul nu plateste nimic celui care apeleaza. Nu e o scapare de
 * configurare, e realitatea lui: banii merg in portofelul 6551 al brokerului.
 * De aia agentul asta ruleaza in modul campanie, si de aia raportul lui nu
 * arata profit, ci **cat a livrat si cui**. Aia e dovada pe care o vinde.
 */
import { z } from 'zod'
import { getAddress, type Address } from 'viem'
import { abiWithErrors, abiOf, zAddress, zBig, type Config } from '../core/config.js'
import { functionNameOf, multiRead, type Call } from '../core/chain/reader.js'
import { readCall, zCall, asBig } from '../core/read.js'
import { resolveArgs } from '../core/args.js'
import type { DiscoverInput, Job, JobCheck, Press, Target, WorkItem } from '../core/work.js'
import { ownerOf } from './ringer.js'

export const CourierSchema = z.object({
  /** de unde stim cati brokeri exista */
  brokers: z.object({
    address: zAddress,
    firstId: zBig.default(1n),
    /** cate id-uri; gol = se citeste totalSupply de pe colectie */
    count: zBig.nullable().default(null),
    supply: zCall.nullable().default(null)
  }),

  /** jetoanele in care se plateste */
  tokens: z.array(zAddress).min(1),

  /** cat i se cuvine unui broker dintr-un jeton */
  claimable: zCall,

  /** apelul care livreaza, cu liste */
  action: zCall,

  /**
   * Cati brokeri intr-o tranzactie.
   *
   * Nu e un numar de gust: fiecare pereche (jeton, broker) face un transfer,
   * deci lotul inmulteste. Prea mare inseamna o tranzactie care nu incape in
   * bloc si care pica DUPA ce a ars gazul.
   */
  batchSize: z.number().int().positive().max(200).default(40),

  /** cate citiri intr-un multicall */
  readChunk: z.number().int().positive().default(500),

  /**
   * Citirea care spune daca un jeton mai are ceva de impartit.
   *
   * Fara ea, agentul intreaba pentru fiecare broker in parte pe fiecare jeton,
   * si cu mii de brokeri ajunge sa bata RPC-ul de zeci de mii de ori pe
   * rulare. Cu ea, un jeton fara rest se sare din UNA citire.
   */
  roundState: zCall.nullable().default(null),
  /** campul cu ce a mai ramas de impartit */
  remainingField: z.string().default('remaining'),

  event: z
    .object({
      signature: z.string().min(5),
      callerField: z.string().nullable().default(null),
      idField: z.string().nullable().default('tokenId'),
      amountField: z.string().nullable().default('amount')
    })
    .nullable()
    .default(null)
})

export type CourierJob = z.infer<typeof CourierSchema>

export const courier: Job<CourierJob> = {
  kind: 'courier',

  parse(raw) {
    const p = CourierSchema.safeParse(raw ?? {})
    if (!p.success) {
      const lines = p.error.issues.map((i) => `  job.${i.path.join('.') || '(root)'}: ${i.message}`)
      throw new Error(`invalid courier job config:\n${lines.join('\n')}`)
    }
    return p.data
  },

  required(cfg, job) {
    return [
      { what: 'clock-in contract', address: cfg.target.address },
      { what: 'brokers collection', address: job.brokers.address }
    ]
  },

  target(cfg, job): Target {
    const abi = abiWithErrors(job.action.signature, cfg.target.errorSignatures, 'job.action.signature')
    return { address: cfg.target.address, abi, functionName: functionNameOf(abi) }
  },

  async authority(client, cfg) {
    return ownerOf(client, cfg.target.address)
  },

  async discover({ client, cfg, job, from }): Promise<WorkItem[]> {
    const total = await supplyOf(client, cfg, job)
    if (total === 0n) return []
    const ids: bigint[] = []
    for (let i = job.brokers.firstId; i < job.brokers.firstId + total; i++) ids.push(i)

    const abi = abiOf(job.claimable.signature, 'job.claimable')
    const fn = functionNameOf(abi)

    /* Intai jetoanele care chiar au ceva de impartit. O citire pe jeton in loc
       de mii, si pe langa economie e si corect: un jeton fara rest nu are ce
       livra, oricat de multi brokeri ar avea. */
    const live: Address[] = []
    for (const token of job.tokens) {
      if (!job.roundState) {
        live.push(token)
        continue
      }
      try {
        const { pick } = await readCall(client, cfg.target.address, job.roundState, { gauge: token }, 'job.roundState')
        if (asBig(pick(job.remainingField)) > 0n) live.push(token)
      } catch {
        /* daca nu se poate citi starea, nu presupunem ca e goala */
        live.push(token)
      }
    }
    if (live.length === 0) return []

    /* cat i se cuvine fiecarui broker, pe fiecare jeton */
    const owed = new Map<string, bigint>()
    let reads = 0
    let failed = 0
    for (const token of live) {
      const calls: Call[] = ids.map((id) => ({
        address: job.claimable.address ?? cfg.target.address,
        abi,
        functionName: fn,
        args: resolveArgs(job.claimable.args, { id, gauge: token }) as readonly unknown[]
      }))
      const res = await multiRead<unknown>(client, calls, { chunk: job.readChunk })
      res.forEach((r, i) => {
        reads++
        if (r.status !== 'success') {
          failed++
          return
        }
        const amount = asBig(r.result)
        if (amount === 0n) return
        const key = ids[i]!.toString()
        owed.set(key, (owed.get(key) ?? 0n) + amount)
      })
    }
    /**
     * Citirile picate NU au voie sa arate ca un perete gol.
     *
     * Asta s-a intamplat pe server la prima rulare adevarata: RPC-ul a inceput
     * sa refuze, toate citirile au picat, iar agentul a raportat linistit
     * "nimic de facut". Un scan cazut si un perete gol arata identic in log si
     * inseamna lucruri opuse, deci un scan cazut trebuie sa CADA.
     */
    if (failed > reads / 10) {
      throw new Error(`${failed} of ${reads} claimable reads failed: the wall cannot be trusted this run, not reporting it as empty`)
    }
    if (owed.size === 0) return []

    /* cei mai grasi primii: daca lotul se taie, se taie de la coada ieftina */
    const waiting = [...owed.entries()]
      .map(([id, amount]) => ({ id: BigInt(id), amount }))
      .sort((a, b) => (a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0))

    const out: WorkItem[] = []
    for (let i = 0; i < waiting.length; i += job.batchSize) {
      const group = waiting.slice(i, i + job.batchSize)
      const sum = group.reduce((s, g) => s + g.amount, 0n)
      out.push({
        key: `drop:${group[0]!.id}:${group.length}`,
        label: `DELIVER x${group.length}`,
        args: resolveArgs(job.action.args, {
          gauges: job.tokens,
          weights: group.map((g) => g.id),
          account: from,
          beneficiary: cfg.execution.beneficiary ?? from
        }),
        /* nu ne plateste nimeni: castigul agentului asta e dovada, nu banul */
        rewardWei: 0n,
        rewardMeasured: true,
        /* miza e cat se muta, in unitatile jetoanelor, nu in ETH */
        stakeWei: sum,
        valueWei: 0n,
        costWei: 0n,
        costMeasured: true,
        costToken: null,
        meta: {
          brokers: group.map((g) => g.id.toString()).join(','),
          total: sum.toString()
        }
      })
    }
    return out
  },

  async presses(client, cfg, job, fromBlock, toBlock): Promise<Press[]> {
    if (!job.event) return []
    const { parseAbi, decodeEventLog } = await import('viem')
    const abi = parseAbi([job.event.signature])
    const logs = await client.getLogs({ address: cfg.target.address, fromBlock, toBlock })
    const out: Press[] = []
    const seen = new Set<string>()
    for (const l of logs) {
      let args: Record<string, unknown>
      try {
        args = (decodeEventLog({ abi, data: l.data, topics: l.topics as [`0x${string}`, ...`0x${string}`[]] }) as unknown as { args: Record<string, unknown> }).args
      } catch {
        continue
      }
      /* o tranzactie livreaza multi brokeri, deci un rand pe TRANZACTIE, nu pe
         eveniment: altfel caietul ar numara aceeasi cursa de patruzeci de ori */
      const tx = l.transactionHash!
      if (seen.has(tx)) continue
      seen.add(tx)
      let caller = (job.event.callerField ? (args[job.event.callerField] as Address | undefined) : undefined) ?? undefined
      let gasPriceWei = 0n
      try {
        const t = await client.getTransaction({ hash: tx })
        gasPriceWei = t.gasPrice ?? t.maxFeePerGas ?? 0n
        if (!caller) caller = t.from
      } catch {
        gasPriceWei = 0n
      }
      if (!caller) continue
      out.push({ key: 'drop', caller, rewardWei: 0n, txHash: tx, blockNumber: l.blockNumber!, gasPriceWei })
    }
    return out
  },

  async checks({ client, cfg, job }): Promise<JobCheck[]> {
    const checks: JobCheck[] = []
    const total = await supplyOf(client, cfg, job).catch(() => 0n)
    checks.push({
      name: 'brokers',
      ok: total > 0n,
      detail: total > 0n ? `${total} brokers to look after` : 'cannot tell how many brokers exist',
      fatal: total === 0n
    })
    checks.push({
      name: 'tokens watched',
      ok: job.tokens.length > 0,
      detail: job.tokens.map((t) => t.slice(0, 10)).join(', ')
    })
    if (cfg.policy.mode === 'profit') {
      checks.push({
        name: 'mode',
        ok: false,
        detail:
          'this contract pays the caller nothing, so profit mode will refuse every delivery. ' +
          'Run it in campaign mode: the point is the coverage and the proof, not a fee.',
        fatal: true
      })
    }
    if (cfg.policy.dailyGasBudgetWei === null) {
      checks.push({
        name: 'daily gas budget',
        ok: false,
        detail: 'no daily gas ceiling, and this agent deliberately works at a loss. Set one.'
      })
    }
    return checks
  }
}

async function supplyOf(client: DiscoverInput['client'], cfg: Config, job: CourierJob): Promise<bigint> {
  if (job.brokers.count !== null) return job.brokers.count
  const spec = job.brokers.supply ?? {
    signature: 'function totalSupply() view returns (uint256)',
    args: [],
    field: null,
    address: job.brokers.address
  }
  const { pick } = await readCall(client, job.brokers.address, spec, {}, 'job.brokers.supply')
  return asBig(pick(spec.field))
}
