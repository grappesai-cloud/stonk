/**
 * RINGER: apasa Clock In in secunda in care se umple oala.
 *
 * E singurul agent din flota la care testele verzi nu inseamna bani. Ceilalti
 * fac o treaba pe care o poate face oricine, oricand; Ringer intra intr-o
 * CURSA. Daca altcineva apasa cu un bloc inaintea noastra, munca noastra
 * valoreaza exact zero, indiferent cat de corect e codul.
 *
 * De aia agentul asta are ceva ce ceilalti nu au: un caiet de curse. La
 * fiecare bloc se uita cine a apasat, cu cat gaz si la cate blocuri dupa ce
 * s-a copt oala. In modul de veghe face doar atat, fara sa cheltuie nimic, si
 * dupa cateva zile stii daca meseria e libera sau e deja luata de un bot mai
 * rapid. Asta e singurul raspuns onest la "castigam cursa?": o masuratoare,
 * nu o parere.
 */
import { z } from 'zod'
import { decodeEventLog, parseAbi, type Abi, type Address, type PublicClient } from 'viem'
import { abiOf, abiWithErrors, zBig, type Config } from '../core/config.js'
import { functionNameOf } from '../core/chain/reader.js'
import { readCall, valueOf, zCall, zSource, asBig } from '../core/read.js'
import { resolveArgs } from '../core/args.js'
import type { DiscoverInput, Job, JobCheck, Press, Target, WorkItem } from '../core/work.js'

export const RingerSchema = z.object({
  /**
   * Cate butoane pastoreste agentul. Gol = unul singur. Cu id-uri, fiecare id
   * devine o bucata de munca separata si `$id` se umple in sabloane.
   */
  slots: z.array(zBig).nullable().default(null),

  /** cat s-a strans in oala; miza dupa care se judeca daca merita */
  pot: zCall.nullable().default(null),

  /** cand e de apasat */
  ready: z
    .discriminatedUnion('mode', [
      /** contractul spune singur da sau nu */
      z.object({ mode: z.literal('call-bool'), call: zCall, expect: z.boolean().default(true) }),
      /** contractul da un moment; e copt cand a trecut */
      z.object({ mode: z.literal('deadline'), call: zCall, graceSec: z.number().int().min(0).default(0) }),
      /** e copt cand oala trece de un prag */
      z.object({ mode: z.literal('threshold'), minWei: zBig }),
      /** mereu; simularea ramane singurul filtru */
      z.object({ mode: z.literal('always') })
    ])
    .default({ mode: 'always' }),

  /** cat se plateste celui care apasa */
  reward: zSource.default({ mode: 'none' }),

  /** apelul care apasa butonul */
  action: zCall,

  /**
   * Evenimentul pe care il emite contractul cand cineva apasa. Fara el nu
   * exista caiet de curse: nu ai de unde sti ca ai pierdut, vezi doar ca oala
   * s-a golit singura.
   */
  event: z
    .object({
      signature: z.string().min(5),
      /** campul cu adresa celui care a apasat */
      callerField: z.string().default('caller'),
      /** campul cu cat a incasat, daca exista */
      rewardField: z.string().nullable().default(null),
      /** campul cu id-ul butonului, cand agentul pastoreste mai multe */
      slotField: z.string().nullable().default(null)
    })
    .nullable()
    .default(null),

  race: z
    .object({
      /** cu cat urcam bacsisul de gaz peste pretul pietei ca sa intram in fata */
      priorityBumpBps: z.number().int().min(0).max(100_000).default(2000),
      /** plafon absolut peste care nu urcam, oricat ar cere cursa */
      maxPriorityFeeWei: zBig.nullable().default(null),
      /** cate blocuri pastram o ocazie deschisa inainte sa o socotim pierduta */
      staleBlocks: z.number().int().min(1).default(3)
    })
    .default({})
})

export type RingerJob = z.infer<typeof RingerSchema>

function keyOf(id: bigint | null): string {
  return id === null ? 'clockin' : `clockin:${id}`
}

export const ringer: Job<RingerJob> = {
  kind: 'ringer',

  parse(raw) {
    const p = RingerSchema.safeParse(raw ?? {})
    if (!p.success) {
      const lines = p.error.issues.map((i) => `  job.${i.path.join('.') || '(root)'}: ${i.message}`)
      throw new Error(`invalid ringer job config:\n${lines.join('\n')}`)
    }
    return p.data
  },

  required(cfg) {
    return [{ what: 'clock contract', address: cfg.target.address }]
  },

  target(cfg, job): Target {
    const abi = abiWithErrors(job.action.signature, cfg.target.errorSignatures, 'job.action.signature')
    return { address: cfg.target.address, abi, functionName: functionNameOf(abi) }
  },

  async authority(client, cfg) {
    return ownerOf(client, cfg.target.address)
  },

  async discover({ client, cfg, job }): Promise<WorkItem[]> {
    const ids: (bigint | null)[] = job.slots && job.slots.length > 0 ? job.slots : [null]
    const out: WorkItem[] = []
    const nowSec = Math.floor(Date.now() / 1000)

    for (const id of ids) {
      const ctx = { id: id ?? undefined, account: cfg.execution.beneficiary, beneficiary: cfg.execution.beneficiary, nowSec }
      let stakeWei: bigint | undefined
      if (job.pot) {
        const { pick } = await readCall(client, cfg.target.address, job.pot, ctx, 'job.pot')
        stakeWei = asBig(pick(job.pot.field))
      }

      const ready = await isReady(client, cfg, job, ctx, stakeWei)
      if (!ready.ok) continue

      const reward = await valueOf(client, cfg.target.address, job.reward, ctx, {
        ...(stakeWei !== undefined ? { stakeWei } : {})
      })

      out.push({
        key: keyOf(id),
        label: id === null ? 'CLOCK IN' : `CLOCK IN #${id}`,
        args: resolveArgs(job.action.args, ctx),
        rewardWei: reward.wei,
        rewardMeasured: reward.measured,
        stakeWei: stakeWei ?? 0n,
        meta: { ready: ready.detail, reward: reward.detail }
      })
    }
    return out
  },

  async presses(client, cfg, job, fromBlock, toBlock) {
    return pressesIn(client, cfg, job, fromBlock, toBlock)
  },

  async checks({ client, cfg, job }): Promise<JobCheck[]> {
    const checks: JobCheck[] = []
    if (!job.event) {
      checks.push({
        name: 'race book',
        ok: false,
        detail:
          'job.event is not configured, so nothing records who pressed the button first. ' +
          'Without it you cannot tell a lost race from an empty pot.'
      })
    } else {
      try {
        parseAbi([job.event.signature])
        checks.push({ name: 'race book', ok: true, detail: `watching ${job.event.signature}` })
      } catch (e) {
        checks.push({ name: 'race book', ok: false, detail: `bad event signature: ${(e as Error).message}` })
      }
    }
    if (job.pot) {
      try {
        const { pick } = await readCall(client, cfg.target.address, job.pot, {}, 'job.pot')
        checks.push({ name: 'pot', ok: true, detail: `${asBig(pick(job.pot.field))} wei in the pot` })
      } catch (e) {
        checks.push({ name: 'pot', ok: false, detail: `cannot read the pot: ${(e as Error).message}`, fatal: true })
      }
    } else {
      checks.push({
        name: 'pot',
        ok: true,
        detail: 'no pot configured: the agent cannot tell how much is at stake, only whether the call goes through'
      })
    }
    if (job.reward.mode === 'none' && cfg.policy.mode === 'profit' && cfg.policy.requireMeasuredReward) {
      checks.push({
        name: 'reward',
        ok: false,
        detail: 'profit mode with no reward source: every run will refuse to press. Configure job.reward or run in campaign mode.',
        fatal: true
      })
    }
    return checks
  }
}

async function isReady(
  client: PublicClient,
  cfg: Config,
  job: RingerJob,
  ctx: Parameters<typeof resolveArgs>[1],
  stakeWei: bigint | undefined
): Promise<{ ok: boolean; detail: string }> {
  const r = job.ready
  switch (r.mode) {
    case 'always':
      return { ok: true, detail: 'always ready; simulation is the only filter' }
    case 'threshold': {
      if (stakeWei === undefined) return { ok: false, detail: 'threshold mode needs job.pot' }
      return stakeWei >= r.minWei
        ? { ok: true, detail: `pot ${stakeWei} over ${r.minWei}` }
        : { ok: false, detail: `pot ${stakeWei} under ${r.minWei}` }
    }
    case 'call-bool': {
      const { pick } = await readCall(client, cfg.target.address, r.call, ctx, 'job.ready.call')
      const v = pick(r.call.field)
      const truthy = v === true || asBig(v) > 0n
      return truthy === r.expect
        ? { ok: true, detail: 'contract says it is ready' }
        : { ok: false, detail: 'contract says it is not ready' }
    }
    case 'deadline': {
      const { pick } = await readCall(client, cfg.target.address, r.call, ctx, 'job.ready.call')
      const at = asBig(pick(r.call.field))
      /* ceasul lantului, nu al masinii noastre: pe un lant cu blocuri rare
         diferenta e chiar fereastra in care se castiga sau se pierde cursa */
      const block = await client.getBlock()
      const nowChain = block.timestamp + BigInt(r.graceSec)
      return nowChain >= at
        ? { ok: true, detail: `due at ${at}, chain clock at ${block.timestamp}` }
        : { ok: false, detail: `due at ${at}, chain clock at ${block.timestamp}` }
    }
  }
}

/** owner() daca exista; e cel mai des locul unde sta autorizarea */
export async function ownerOf(client: PublicClient, address: Address): Promise<Address | null> {
  const abi = abiOf('function owner() view returns (address)', 'owner()') as Abi
  try {
    return (await client.readContract({ address, abi, functionName: 'owner' })) as Address
  } catch {
    return null
  }
}

/** cine a apasat butonul in blocurile astea, si cu cat gaz a platit */
export async function pressesIn(
  client: PublicClient,
  cfg: Config,
  job: RingerJob,
  fromBlock: bigint,
  toBlock: bigint
): Promise<Press[]> {
  if (!job.event) return []
  const abi = parseAbi([job.event.signature])
  const logs = await client.getLogs({ address: cfg.target.address, fromBlock, toBlock })
  const out: Press[] = []
  for (const l of logs) {
    let decoded: { args: Record<string, unknown> }
    try {
      decoded = decodeEventLog({ abi, data: l.data, topics: l.topics as [`0x${string}`, ...`0x${string}`[]] }) as never
    } catch {
      continue
    }
    const args = decoded.args as Record<string, unknown>
    const caller = args[job.event.callerField] as Address | undefined
    if (!caller) continue
    let gasPriceWei = 0n
    try {
      const tx = await client.getTransaction({ hash: l.transactionHash! })
      gasPriceWei = tx.gasPrice ?? tx.maxFeePerGas ?? 0n
    } catch {
      gasPriceWei = 0n
    }
    const slot = job.event.slotField && args[job.event.slotField] !== undefined ? asBig(args[job.event.slotField]) : null
    out.push({
      key: keyOf(slot),
      caller,
      rewardWei: job.event.rewardField ? asBig(args[job.event.rewardField]) : 0n,
      txHash: l.transactionHash!,
      blockNumber: l.blockNumber!,
      gasPriceWei
    })
  }
  return out
}
