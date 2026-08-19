/**
 * LOBBYIST: voteaza gauge-urile inainte sa se inchida epoca si isi incaseaza
 * partea.
 *
 * O granita pe care agentul asta NU o trece: **nu blocheaza jetoane si nu
 * prelungeste blocarea**. Pozitia veUP e o decizie de om, luata o data, cu
 * bani care nu se mai pot lua inapoi luni de zile. Botul lucreaza CU o pozitie
 * care exista deja: voteaza cu ea si strange ce i se cuvine. Daca pozitia nu e
 * acolo, sta si spune ca sta.
 *
 * Al doilea lucru care il deosebeste de restul flotei: aici castigul nu se
 * citeste dintr-un singur camp, se CALCULEAZA. Cat luam dintr-un gauge depinde
 * de cat plateste el si de cati au votat deja acolo:
 *
 *     partea noastra = putere / (voturi existente + putere) * mita
 *
 * Cifra e masurata, fiindca toate intrarile ei sunt citite de pe lant, dar e o
 * estimare pentru sfarsitul epocii: daca dupa noi mai vine cineva cu putere
 * mare pe acelasi gauge, partea noastra scade. Asta nu se poate afla dinainte
 * si nu ma prefac ca se poate.
 */
import { z } from 'zod'
import { getAddress, type Address } from 'viem'
import { abiWithErrors, zAddress, zBig, type Config } from '../core/config.js'
import { functionNameOf } from '../core/chain/reader.js'
import { readCall, zCall, asBig } from '../core/read.js'
import { resolveArgs } from '../core/args.js'
import type { DiscoverInput, Job, JobCheck, Target, WorkItem } from '../core/work.js'
import { ownerOf } from './ringer.js'

export const LobbyistSchema = z.object({
  /** pozitia cu care votam. NU o creeaza agentul, doar o foloseste. */
  position: z.object({
    /** id-ul NFT-ului de blocare, cand protocolul lucreaza cu NFT-uri */
    tokenId: zBig.nullable().default(null),
    /** cata putere de vot avem */
    power: zCall,
    /** cine detine pozitia; gol = contul care semneaza */
    owner: zAddress.nullable().default(null)
  }),

  epoch: z.object({
    /** cand se inchide epoca */
    end: zCall,
    /** cu cat timp inainte de inchidere votam */
    voteBeforeSec: z.number().int().min(0).default(3600),
    /** si cu cat timp inainte ne oprim, ca sa nu trimitem intr-o epoca deja moarta */
    stopBeforeSec: z.number().int().min(0).default(0)
  }),

  /** pe cine putem vota */
  gauges: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('config'), list: z.array(zAddress).min(1) }),
    z.object({ mode: z.literal('call'), call: zCall })
  ]),

  /** cat plateste un gauge pe epoca asta */
  bribes: zCall,
  /** cate voturi are deja */
  votes: zCall,

  /** cum se scriu greutatile in apelul de vot */
  weights: z
    .object({
      mode: z.enum(['power', 'bps', 'equal']).default('bps'),
      /** pe cate gauge-uri impartim puterea */
      topN: z.number().int().min(1).max(20).default(1)
    })
    .default({}),

  vote: zCall,

  /** ce e de incasat si cu ce apel; gol = agentul doar voteaza */
  claim: z
    .object({ claimable: zCall, action: zCall })
    .nullable()
    .default(null)
})

export type LobbyistJob = z.infer<typeof LobbyistSchema>

const VOTE = 'vote'
const CLAIM = 'claim'

export const lobbyist: Job<LobbyistJob> = {
  kind: 'lobbyist',
  /* votam cu blocarea noastra: un strain TREBUIE respins */
  actsOnOwnPosition: true,

  parse(raw) {
    const p = LobbyistSchema.safeParse(raw ?? {})
    if (!p.success) {
      const lines = p.error.issues.map((i) => `  job.${i.path.join('.') || '(root)'}: ${i.message}`)
      throw new Error(`invalid lobbyist job config:\n${lines.join('\n')}`)
    }
    return p.data
  },

  required(cfg) {
    return [{ what: 'voting contract', address: cfg.target.address }]
  },

  /**
   * Doua apeluri, un singur agent: votul si incasarea. De aia tinta se ia pe
   * bucata, nu pe rulare.
   */
  target(cfg, job, item): Target {
    const spec = item?.key.startsWith(CLAIM) && job.claim ? job.claim.action : job.vote
    const abi = abiWithErrors(spec.signature, cfg.target.errorSignatures, 'job.vote/claim signature')
    return { address: cfg.target.address, abi, functionName: functionNameOf(abi) }
  },

  async authority(client, cfg) {
    return ownerOf(client, cfg.target.address)
  },

  async discover({ client, cfg, job, from }): Promise<WorkItem[]> {
    const nowSec = Math.floor(Date.now() / 1000)
    const holder = job.position.owner ?? from
    const idCtx = { id: job.position.tokenId ?? undefined, account: holder, beneficiary: cfg.execution.beneficiary ?? holder, nowSec }

    const power = asBig((await readCall(client, cfg.target.address, job.position.power, idCtx, 'job.position.power')).pick(job.position.power.field))
    const epochEnd = asBig((await readCall(client, cfg.target.address, job.epoch.end, idCtx, 'job.epoch.end')).pick(job.epoch.end.field))
    /* ceasul lantului, nu al masinii noastre: fereastra de vot se inchide dupa
       timpul din bloc */
    const chainNow = (await client.getBlock()).timestamp

    const out: WorkItem[] = []

    // ------------------------------------------------------------- incasarea
    if (job.claim) {
      const claimable = asBig(
        (await readCall(client, cfg.target.address, job.claim.claimable, idCtx, 'job.claim.claimable')).pick(
          job.claim.claimable.field
        )
      )
      if (claimable > 0n) {
        out.push({
          key: `${CLAIM}:${epochEnd}`,
          label: 'CLAIM',
          args: resolveArgs(job.claim.action.args, { ...idCtx, power }),
          rewardWei: claimable,
          rewardMeasured: true,
          stakeWei: claimable,
          valueWei: 0n,
          costWei: 0n,
          costMeasured: true,
          costToken: null,
          once: true,
          meta: { claimable: claimable.toString() }
        })
      }
    }

    // ---------------------------------------------------------------- votul
    if (power === 0n) return out
    const opensAt = epochEnd - BigInt(job.epoch.voteBeforeSec)
    const closesAt = epochEnd - BigInt(job.epoch.stopBeforeSec)
    if (chainNow < opensAt || chainNow > closesAt) return out

    const gauges = await gaugesOf(client, cfg, job)
    if (gauges.length === 0) return out

    /* pentru fiecare gauge: cat plateste si cati au votat deja acolo */
    const rows: Array<{ gauge: Address; bribes: bigint; votes: bigint; take: bigint }> = []
    for (const gauge of gauges) {
      const ctx = { ...idCtx, gauge }
      try {
        const bribes = asBig((await readCall(client, cfg.target.address, job.bribes, ctx, 'job.bribes')).pick(job.bribes.field))
        const votes = asBig((await readCall(client, cfg.target.address, job.votes, ctx, 'job.votes')).pick(job.votes.field))
        /* partea noastra daca punem TOATA puterea aici. Impartirea pe mai
           multe gauge-uri se socoteste mai jos, pe cotele reale. */
        const take = bribes === 0n ? 0n : (bribes * power) / (votes + power)
        rows.push({ gauge, bribes, votes, take })
      } catch {
        /* un gauge care nu se poate citi nu intra in socoteala; nu il votam
           pe baza unei presupuneri */
      }
    }
    if (rows.length === 0) return out

    rows.sort((a, b) => (a.take > b.take ? -1 : a.take < b.take ? 1 : 0))
    const picked = rows.slice(0, Math.min(job.weights.topN, rows.length)).filter((r) => r.take > 0n)
    if (picked.length === 0) return out

    const share = power / BigInt(picked.length)
    const weights = weightsFor(job, picked.length, share)
    /* castigul asteptat cu puterea chiar impartita, nu cu toata pe fiecare */
    const expected = picked.reduce((s, r) => s + (r.bribes === 0n ? 0n : (r.bribes * share) / (r.votes + share)), 0n)

    out.push({
      key: `${VOTE}:${epochEnd}`,
      label: `VOTE ${picked.map((p) => p.gauge.slice(0, 8)).join(' ')}`,
      args: resolveArgs(job.vote.args, {
        ...idCtx,
        power,
        gauge: picked[0]!.gauge,
        gauges: picked.map((p) => p.gauge),
        weights
      }),
      rewardWei: expected,
      /* toate intrarile socotelii sunt citite de pe lant. Ramane o estimare
         pentru sfarsitul epocii, si asta scrie si in meta. */
      rewardMeasured: true,
      stakeWei: picked.reduce((s, r) => s + r.bribes, 0n),
      valueWei: 0n,
      costWei: 0n,
      costMeasured: true,
      costToken: null,
      /* o epoca, un vot */
      once: true,
      meta: {
        power: power.toString(),
        epochEnd: epochEnd.toString(),
        gauges: picked.map((p) => `${p.gauge}=${p.take}`).join(','),
        note: 'estimate for the end of the epoch: a bigger voter after us lowers our share'
      }
    })
    return out
  },

  async checks({ client, cfg, job, from }): Promise<JobCheck[]> {
    const checks: JobCheck[] = []
    checks.push({
      name: 'never locks',
      ok: true,
      detail: 'this agent votes with an existing position and claims. It never locks or extends a lock: that stays a human decision.'
    })

    const holder = job.position.owner ?? from
    const idCtx = { id: job.position.tokenId ?? undefined, account: holder, beneficiary: holder }
    try {
      const power = asBig(
        (await readCall(client, cfg.target.address, job.position.power, idCtx, 'job.position.power')).pick(
          job.position.power.field
        )
      )
      checks.push({
        name: 'voting power',
        ok: power > 0n,
        detail:
          power > 0n
            ? `${power} at ${holder}${job.position.tokenId !== null ? ` (lock #${job.position.tokenId})` : ''}`
            : `no voting power at ${holder}. Nothing to vote with, and the agent will not create a lock to get some.`
      })
    } catch (e) {
      checks.push({ name: 'voting power', ok: false, detail: `cannot read it: ${(e as Error).message}`, fatal: true })
    }

    try {
      const end = asBig((await readCall(client, cfg.target.address, job.epoch.end, idCtx, 'job.epoch.end')).pick(job.epoch.end.field))
      const chainNow = (await client.getBlock()).timestamp
      const left = end - chainNow
      checks.push({
        name: 'epoch',
        ok: true,
        detail:
          left > 0n
            ? `closes in ${left}s; the agent votes in the last ${job.epoch.voteBeforeSec}s`
            : `epoch end is ${end}, chain clock is ${chainNow}: already past, waiting for the next one`
      })
    } catch (e) {
      checks.push({ name: 'epoch', ok: false, detail: `cannot read it: ${(e as Error).message}`, fatal: true })
    }

    const gauges = await gaugesOf(client, cfg, job).catch(() => [])
    checks.push({
      name: 'gauges',
      ok: gauges.length > 0,
      detail: gauges.length > 0 ? `${gauges.length} to choose from` : 'no gauges to vote on',
      fatal: gauges.length === 0
    })

    if (!job.claim) {
      checks.push({
        name: 'claiming',
        ok: false,
        detail: 'job.claim is not configured: the agent will vote and never collect. What it earns stays on the contract.'
      })
    }
    return checks
  }
}

function weightsFor(job: LobbyistJob, n: number, share: bigint): bigint[] {
  switch (job.weights.mode) {
    case 'power':
      return Array.from({ length: n }, () => share)
    case 'equal':
      return Array.from({ length: n }, () => 1n)
    case 'bps': {
      /* restul se da primului, ca suma sa fie exact 10000: multe contracte
         cer fix asta si resping orice altceva */
      const each = 10_000n / BigInt(n)
      const rest = 10_000n - each * BigInt(n)
      return Array.from({ length: n }, (_, i) => (i === 0 ? each + rest : each))
    }
  }
}

async function gaugesOf(client: DiscoverInput['client'], cfg: Config, job: LobbyistJob): Promise<Address[]> {
  if (job.gauges.mode === 'config') return job.gauges.list
  const { pick } = await readCall(client, cfg.target.address, job.gauges.call, {}, 'job.gauges.call')
  const v = pick(job.gauges.call.field)
  if (!Array.isArray(v)) return []
  return v.map((a) => getAddress(String(a)))
}
