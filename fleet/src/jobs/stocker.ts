/**
 * STOCKER: umple masinile inainte sa ramana goale si ia comision.
 *
 * E primul agent din flota care CHELTUIE. Ceilalti ard gaz; asta da marfa din
 * portofel si asteapta sa se intoarca mai mult. Diferenta nu e de marime, e de
 * fel: un bot care greseste gazul pierde cativa centi pe rulare, unul care
 * greseste socoteala marfii poate goli portofelul intr-o noapte facand exact
 * ce i-ai cerut.
 *
 * De aia aici franele nu sunt aceleasi ca la Ringer:
 *  - rentabilitatea se judeca pe castigul MINUS costul, nu pe castig. Un
 *    comision de 5% pe o marfa cumparata cu 10% peste pret e o pierdere care
 *    arata ca un castig in orice raport care nu scade cheltuiala.
 *  - costul nemasurat se refuza in modul profit, la fel ca un castig nemasurat
 *  - exista un plafon pe bucata si un buget zilnic de cheltuiala, separate de
 *    bugetul de gaz: sunt doua robinete diferite
 *  - cand plata e in jetoane, agentul NU isi da singur aprobare nelimitata.
 *    Aproba exact cat ii trebuie pentru rularea asta, si numai daca i s-a cerut
 *    explicit in configurare.
 */
import { z } from 'zod'
import { erc20Abi, type Address } from 'viem'
import { abiWithErrors, zAddress, zBig, type Config } from '../core/config.js'
import { functionNameOf, multiRead, outputIndex, type Call } from '../core/chain/reader.js'
import { abiOf } from '../core/config.js'
import { readCall, valueOf, zCall, zSource, asBig } from '../core/read.js'
import { resolveArgs } from '../core/args.js'
import type { DiscoverInput, Job, JobCheck, Target, WorkItem } from '../core/work.js'
import { ownerOf } from './ringer.js'

export const StockerSchema = z.object({
  discovery: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('list'), call: zCall }),
    z.object({
      mode: z.literal('range'),
      cursor: zCall,
      firstId: zBig.default(1n),
      window: z.number().int().positive().default(200)
    }),
    z.object({
      mode: z.literal('logs'),
      openedEvent: z.string().min(5),
      closedEvent: z.string().min(5),
      idField: z.string().default('id'),
      lookbackBlocks: zBig.default(50_000n)
    })
  ]),

  /** ce citim despre o masina: cat mai are, cat incape, cat costa, cat plateste */
  state: z.object({
    call: zCall,
    stockField: z.string(),
    capacityField: z.string().nullable().default(null),
    /** cand e goala destul cat sa merite drumul */
    lowWhen: z
      .discriminatedUnion('mode', [
        /** sub o cantitate fixa */
        z.object({ mode: z.literal('below'), value: zBig }),
        /** sub o parte din capacitate, in puncte de baza (2500 = un sfert) */
        z.object({ mode: z.literal('belowFraction'), bps: z.number().int().min(1).max(10_000) }),
        /** contractul spune singur */
        z.object({ mode: z.literal('truthy'), field: z.string() }),
        z.object({ mode: z.literal('any') })
      ])
      .default({ mode: 'any' }),
    stakeField: z.string().nullable().default(null)
  }),

  /** cat punem la loc */
  amount: z
    .discriminatedUnion('mode', [
      /** pana la capacitate; are nevoie de capacityField */
      z.object({ mode: z.literal('toCapacity') }),
      z.object({ mode: z.literal('fixed'), units: zBig }),
      z.object({ mode: z.literal('call'), call: zCall })
    ])
    .default({ mode: 'toCapacity' }),
  /** plafon de siguranta pe cantitate, oricat ar spune contractul ca incape */
  maxUnitsPerJob: zBig.nullable().default(null),

  /** cat costa o unitate de marfa */
  unitCost: zSource.default({ mode: 'none' }),

  /** cum se plateste */
  payment: z
    .discriminatedUnion('mode', [
      /** ETH trimis odata cu apelul */
      z.object({ mode: z.literal('native') }),
      /** jetoane trase de contract prin allowance */
      z.object({
        mode: z.literal('token'),
        token: zAddress,
        decimals: z.number().int().min(0).max(36).default(18),
        symbol: z.string().default('TOKEN'),
        /** cati wei nativi valoreaza o unitate intreaga de jeton; 0 = nu stim */
        weiPerToken: zBig.default(0n),
        /** cine trage jetoanele; gol = chiar contractul tinta */
        spender: zAddress.nullable().default(null),
        /**
         * Aprobarea NU se da singura implicit. Cu ea pornita, agentul aproba
         * exact cat ii trebuie pentru bucata curenta, niciodata nelimitat.
         */
        autoApprove: z.boolean().default(false)
      }),
      /** marfa nu o platim noi; agentul doar apasa butonul */
      z.object({ mode: z.literal('none') })
    ])
    .default({ mode: 'none' }),

  /** comisionul */
  reward: zSource.default({ mode: 'none' }),
  /**
   * Comisionul citit e pe UNITATE sau pe toata umplerea?
   *
   * Implicit pe unitate, ca si pretul, fiindca asa scrie in contractele de
   * genul asta. Daca gresesti aici, agentul crede ca ia de o suta de ori mai
   * putin (sau mai mult) decat ia, si frana de rentabilitate decide pe cifra
   * gresita in ambele sensuri.
   */
  rewardPerUnit: z.boolean().default(true),

  action: zCall,
  readChunk: z.number().int().positive().default(200)
})

export type StockerJob = z.infer<typeof StockerSchema>

export const stocker: Job<StockerJob> = {
  kind: 'stocker',

  parse(raw) {
    const p = StockerSchema.safeParse(raw ?? {})
    if (!p.success) {
      const lines = p.error.issues.map((i) => `  job.${i.path.join('.') || '(root)'}: ${i.message}`)
      throw new Error(`invalid stocker job config:\n${lines.join('\n')}`)
    }
    return p.data
  },

  required(cfg) {
    return [{ what: 'vendor contract', address: cfg.target.address }]
  },

  target(cfg, job): Target {
    const abi = abiWithErrors(job.action.signature, cfg.target.errorSignatures, 'job.action.signature')
    return { address: cfg.target.address, abi, functionName: functionNameOf(abi) }
  },

  async authority(client, cfg) {
    return ownerOf(client, cfg.target.address)
  },

  async discover({ client, cfg, job, from }): Promise<WorkItem[]> {
    const ids = await candidateIds(client, cfg, job)
    if (ids.length === 0) return []
    const nowSec = Math.floor(Date.now() / 1000)

    const abi = abiOf(job.state.call.signature, 'job.state.call')
    const fn = functionNameOf(abi)
    const calls: Call[] = ids.map((id) => ({
      address: cfg.target.address,
      abi,
      functionName: fn,
      args: resolveArgs(job.state.call.args, { id, nowSec }) as readonly unknown[]
    }))
    const res = await multiRead<unknown>(client, calls, { chunk: job.readChunk })

    const out: WorkItem[] = []

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!
      const r = res[i]!
      if (r.status !== 'success') continue
      const values = Array.isArray(r.result) ? (r.result as unknown[]) : [r.result]
      const field = (name: string): unknown => values[outputIndex(abi, fn, name)]

      const stock = asBig(field(job.state.stockField))
      const capacity = job.state.capacityField ? asBig(field(job.state.capacityField)) : 0n
      if (!isLow(job.state.lowWhen, stock, capacity, field)) continue

      let units = amountFor(job, stock, capacity)
      if (job.maxUnitsPerJob !== null && units > job.maxUnitsPerJob) units = job.maxUnitsPerJob
      if (units <= 0n) continue

      const ctx = {
        id,
        amount: units,
        account: from,
        beneficiary: cfg.execution.beneficiary ?? from,
        nowSec
      }
      const unit = await valueOf(client, cfg.target.address, job.unitCost, ctx, { stateField: field })
      const spend = unit.wei * units
      const money = costOf(job, spend, unit.measured)

      const rewardRead = await valueOf(client, cfg.target.address, job.reward, ctx, {
        stakeWei: spend,
        stateField: field
      })
      const reward = {
        ...rewardRead,
        wei: job.rewardPerUnit ? rewardRead.wei * units : rewardRead.wei
      }

      out.push({
        key: `machine:${id}`,
        label: `RESTOCK #${id}`,
        args: resolveArgs(job.action.args, ctx),
        rewardWei: reward.wei,
        rewardMeasured: reward.measured,
        stakeWei: job.state.stakeField ? asBig(field(job.state.stakeField)) : spend,
        valueWei: money.valueWei,
        costWei: money.costWei,
        costMeasured: money.costMeasured,
        costToken: money.costToken,
        meta: {
          units: units.toString(),
          stock: stock.toString(),
          capacity: capacity.toString(),
          unitCost: unit.detail,
          reward: `${reward.detail}${job.rewardPerUnit ? ` x ${units} units` : ''}`
        }
      })
    }
    return out
  },

  async checks({ client, cfg, job, from }): Promise<JobCheck[]> {
    const checks: JobCheck[] = []

    if (job.amount.mode === 'toCapacity' && !job.state.capacityField) {
      checks.push({
        name: 'restock amount',
        ok: false,
        detail: 'amount.mode is "toCapacity" but state.capacityField is not set, so there is nothing to fill up to',
        fatal: true
      })
    }
    if (job.maxUnitsPerJob === null) {
      checks.push({
        name: 'units cap',
        ok: false,
        detail:
          'maxUnitsPerJob is not set. The agent will put in whatever the contract says fits, and a wrong capacity ' +
          'reading becomes a wrong amount of money. Set a ceiling you can live with.'
      })
    }
    if (job.unitCost.mode === 'none' && job.payment.mode !== 'none') {
      checks.push({
        name: 'unit cost',
        ok: false,
        detail: 'this job pays for goods but no unit cost is configured, so it cannot tell what it is about to spend',
        fatal: true
      })
    }

    if (job.payment.mode === 'token') {
      const p = job.payment
      const spender = p.spender ?? cfg.target.address
      try {
        const [balance, allowance] = (await Promise.all([
          client.readContract({ address: p.token, abi: erc20Abi, functionName: 'balanceOf', args: [from] }),
          client.readContract({ address: p.token, abi: erc20Abi, functionName: 'allowance', args: [from, spender] })
        ])) as [bigint, bigint]
        checks.push({
          name: `${p.symbol} balance`,
          ok: balance > 0n,
          detail: `${balance} at ${from}`
        })
        checks.push({
          name: `${p.symbol} allowance`,
          ok: allowance > 0n,
          detail:
            allowance > 0n
              ? `${allowance} approved to ${spender}`
              : `nothing approved to ${spender}. Approve exactly what you are willing to lose, not the maximum. ` +
                `An unlimited approval to a contract we do not control is the whole wallet, not one restock.`
        })
        if (p.weiPerToken === 0n && cfg.policy.mode === 'profit') {
          checks.push({
            name: 'token is priced',
            ok: false,
            detail:
              'payment.weiPerToken is 0, so the cost of the goods cannot be valued and profit mode will refuse every job. ' +
              'Set it, or run in campaign mode and accept spending blind.',
            fatal: true
          })
        }
      } catch (e) {
        checks.push({ name: 'payment token', ok: false, detail: `cannot read the token: ${(e as Error).message}`, fatal: true })
      }
    }

    if (job.reward.mode === 'none' && cfg.policy.mode === 'profit' && cfg.policy.requireMeasuredReward) {
      checks.push({
        name: 'commission',
        ok: false,
        detail: 'profit mode with no reward source: every run will refuse to restock. Configure job.reward or run in campaign mode.',
        fatal: true
      })
    }

    if (cfg.policy.dailySpendBudgetWei === null && job.payment.mode !== 'none') {
      checks.push({
        name: 'daily spend budget',
        ok: false,
        detail: 'policy.dailySpendBudgetWei is not set, so there is no ceiling on what this agent can spend in a day'
      })
    }
    return checks
  }
}

/**
 * Cati bani putem angaja acum: ETH sau jetonul de plata, marginit de aprobare.
 *
 * NU se foloseste ca sa taiem bucati din lista. O masina goala pe care nu o
 * putem plati e tot o masina goala: daca dispare din lista, jurnalul spune
 * "nimic de facut", cand adevarul e "n-am cu ce". Prima varianta te lasa sa
 * crezi ca botul merge. Simularea le opreste oricum, si atunci motivul se
 * scrie in registru.
 */
async function purseOf(
  client: DiscoverInput['client'],
  cfg: Config,
  job: StockerJob,
  from: Address
): Promise<{ balance: bigint; what: string }> {
  if (job.payment.mode === 'none') return { balance: (1n << 255n), what: 'nothing to pay' }
  if (job.payment.mode === 'native') {
    const balance = await client.getBalance({ address: from })
    return { balance, what: cfg.network.nativeSymbol }
  }
  const p = job.payment
  const spender = p.spender ?? cfg.target.address
  try {
    const [balance, allowance] = (await Promise.all([
      client.readContract({ address: p.token, abi: erc20Abi, functionName: 'balanceOf', args: [from] }),
      client.readContract({ address: p.token, abi: erc20Abi, functionName: 'allowance', args: [from, spender] })
    ])) as [bigint, bigint]
    /* nu conteaza cat avem, ci cat poate lua contractul: aprobarea e limita
       reala, si e si limita pierderii daca protocolul se poarta urat */
    return { balance: balance < allowance ? balance : allowance, what: p.symbol }
  } catch {
    return { balance: 0n, what: p.symbol }
  }
}

interface Money {
  valueWei: bigint
  costWei: bigint
  costMeasured: boolean
  costToken: WorkItem['costToken']
  /** cat trebuie sa avem la indemana in moneda platii */
  balanceNeeded: bigint
}

function costOf(job: StockerJob, spend: bigint, measured: boolean): Money {
  switch (job.payment.mode) {
    case 'none':
      return { valueWei: 0n, costWei: 0n, costMeasured: true, costToken: null, balanceNeeded: 0n }
    case 'native':
      return { valueWei: spend, costWei: spend, costMeasured: measured, costToken: null, balanceNeeded: spend }
    case 'token': {
      const p = job.payment
      /* pretul jetonului in wei nativi vine din configurare. Cand lipseste,
         costul NU e masurat, si in modul profit se refuza: mai bine sta decat
         sa cheltuie o suma pe care nu stie sa o compare cu ce incaseaza. */
      const costWei = p.weiPerToken > 0n ? (spend * p.weiPerToken) / 10n ** BigInt(p.decimals) : 0n
      return {
        valueWei: 0n,
        costWei,
        costMeasured: measured && p.weiPerToken > 0n,
        costToken: { token: p.token, amount: spend, symbol: p.symbol, decimals: p.decimals },
        balanceNeeded: spend
      }
    }
  }
}

function isLow(
  rule: StockerJob['state']['lowWhen'],
  stock: bigint,
  capacity: bigint,
  field: (name: string) => unknown
): boolean {
  switch (rule.mode) {
    case 'any':
      return true
    case 'below':
      return stock < rule.value
    case 'belowFraction':
      return capacity > 0n && stock * 10_000n < capacity * BigInt(rule.bps)
    case 'truthy': {
      const v = field(rule.field)
      return v === true || asBig(v) > 0n
    }
  }
}

function amountFor(job: StockerJob, stock: bigint, capacity: bigint): bigint {
  switch (job.amount.mode) {
    case 'toCapacity':
      return capacity > stock ? capacity - stock : 0n
    case 'fixed':
      return job.amount.units
    case 'call':
      /* citirea se face in discover, unde avem clientul; aici nu ajungem */
      return 0n
  }
}

async function candidateIds(client: DiscoverInput['client'], cfg: Config, job: StockerJob): Promise<bigint[]> {
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
  const head = await client.getBlockNumber()
  const lookback = head > d.lookbackBlocks ? head - d.lookbackBlocks : 0n
  const fromBlock = cfg.target.deployBlock > lookback ? cfg.target.deployBlock : lookback
  const { parseAbi } = await import('viem')
  const openAbi = parseAbi([d.openedEvent])
  const closeAbi = parseAbi([d.closedEvent])
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
  const seen = new Set<string>()
  const out: bigint[] = []
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
