/**
 * O rulare completa: descopera, filtreaza, simuleaza, lucreaza, anunta, scrie
 * in registru. Fiecare pas isi lasa urma, inclusiv cei care nu au facut nimic,
 * pentru ca "de ce nu a lucrat" e intrebarea pe care o pui cel mai des cand
 * tii un bot in productie.
 *
 * Doua cadente, si alegerea nu e de gust:
 *  - 'interval', ca la Courier: la fiecare cateva minute. Bun pentru Miner,
 *    unde o runda ramane deschisa pana o inchide cineva.
 *  - 'block': la fiecare bloc nou. Obligatoriu pentru Ringer. Cine se uita la
 *    oala din trei in trei minute nu apasa niciodata butonul, fiindca in
 *    intervalul ala a apasat altcineva.
 */
import { formatEther, type Address } from 'viem'
import type { Ctx } from './context.js'
import { STRANGER } from './context.js'
import { screen } from './policy/rules.js'
import { probeGating, simulateEach } from './simulate.js'
import { execute } from './executor.js'
import { RaceBook } from './race.js'
import { backupDue, backupOnce } from './ledger/backup.js'
import { beat, beatFailure } from './alerts/heartbeat.js'
import { isWedged, watchdogSec } from './health.js'
import { standbyReason } from './standby.js'
import { log } from './log.js'
import { scaleWei } from './policy/rules.js'

export interface RunOutcome {
  runId: number
  seen: number
  candidates: number
  simulatedOk: number
  done: number
  skipped: number
  gasWei: bigint
  rewardWei: bigint
  /** ce a plecat din portofel, in afara de gaz */
  costWei: bigint
  openCount: number
  openStakeWei: bigint
  stoppedBy: string | null
  gatingWarning: string | null
  /** ocazii noi fata de rularea trecuta */
  found: number
  racesRecorded: number
}

export interface RunOptions {
  race?: RaceBook | null
}

export async function runOnce(ctx: Ctx, opts: RunOptions = {}): Promise<RunOutcome> {
  const { cfg, client, ledger, tg, job, jobCfg } = ctx
  const runId = ledger.startRun(cfg.agent.kind, cfg.watchtower ? 'watchtower' : cfg.policy.mode, cfg.execution.dryRun)
  const from = ctx.account?.address ?? (STRANGER as Address)
  const seenAtMs = Date.now()

  const items = await job.discover({ client, cfg, job: jobCfg, ledger, from })
  const head = await client.getBlockNumber()

  /* indexul se tine indiferent daca lucram sau nu: cine nu stie ce era liber
     ieri nu poate spune maine daca a pierdut ceva */
  let found = 0
  for (const it of items) {
    const d = ledger.seeOpportunity(it.key, it.label, it.stakeWei, it.rewardWei)
    if (d.isNew) found++
  }
  /* ce nu s-a mai vazut acum nu mai e deschis: indexul spune prezentul, nu
     istoria a tot ce a fost vreodata */
  ledger.closeUnseen(items.map((i) => i.key))

  const race = opts.race ?? null
  if (race?.active && items.length > 0) {
    const gasPriceWei = await client.getGasPrice()
    for (const it of items) race.noteWanted(it.key, head, gasPriceWei)
  }

  const screened = screen({
    items,
    cfg,
    lastDoneAt: (key) => ledger.lastDoneAt(key),
    nowSec: Math.floor(Date.now() / 1000)
  })
  for (const s of screened.skipped) {
    ledger.recordJob({
      runId,
      agentId: cfg.agent.id,
      key: s.key,
      label: '',
      stakeWei: 0n,
      rewardWei: 0n,
      costWei: 0n,
      gasWei: 0n,
      txHash: null,
      blockNumber: null,
      status: 'skipped',
      reason: `${s.reason}${s.detail ? `: ${s.detail}` : ''}`
    })
  }

  /* Tinta se ia PE BUCATA: Lobbyist voteaza cu un apel si isi incaseaza
     partea cu altul, deci o singura tinta pe rulare ar insemna doua meserii
     pentru acelasi agent. */
  const targetOf = (it: (typeof screened.pass)[number]) => job.target(cfg, jobCfg, it)
  const target = job.target(cfg, jobCfg)
  let gatingWarning: string | null = null
  let sims: Awaited<ReturnType<typeof simulateEach>> = []
  let simulatedOk = 0

  if (screened.pass.length > 0) {
    sims = (
      await Promise.all(screened.pass.map((it) => simulateEach(client, targetOf(it), from, [it], 1)))
    ).flat()
    simulatedOk = sims.filter((s) => s.ok).length

    /**
     * Cand nicio simulare nu trece, nu ne multumim cu textul erorii: cerem
     * dovada, simuland acelasi apel din contul celui care are voie. Diferenta
     * dintre cele doua raspunsuri e singurul lucru care demonstreaza ca
     * functia e rezervata.
     */
    /* Cand agentul lucreaza cu pozitia lui, un strain respins e normal si nu
       are ce cauta in alerta. */
    if (simulatedOk === 0 && !job.actsOnOwnPosition) {
      const authority = job.authority ? await job.authority(client, cfg, jobCfg) : null
      const probe = await probeGating(client, targetOf(screened.pass[0]!), screened.pass, STRANGER as Address, authority)
      if (probe.kind === 'authority-gated') {
        gatingWarning =
          `${target.functionName}() is authority-gated (proven on ${probe.testedKey}: only ${probe.authority} gets through). ` +
          `Without a contract change or an opt-in, this agent cannot work on anyone's behalf.`
        log.error({ tested: probe.testedKey, authority: probe.authority }, gatingWarning)
      }
      for (const s of sims) {
        if (!s.ok) log.debug({ key: s.item.key, kind: s.kind, reason: s.reason }, 'excluded')
      }
    }
  }

  const res = await execute({
    client,
    wallet: ctx.wallet,
    account: ctx.account,
    cfg,
    ledger,
    runId,
    target,
    targetOf,
    sims: sims.filter((s) => s.ok),
    seenAtMs,
    ...(await feesFor(ctx))
  })

  for (const d of res.done) {
    race?.noteSent(d.item.key, d.txHash, d.gasPriceWei, d.latencyMs)
  }

  if (res.done.length > 0) {
    await tg.announce(
      res.done.map((d) => ({
        key: d.item.key,
        label: d.item.label,
        rewardWei: d.rewardWei,
        gasWei: d.gasWei,
        txHash: d.txHash
      }))
    )
  }

  /* Caietul de curse se tine si cand nu am facut nimic; mai ales atunci.
     Capul de lant se citeste DIN NOU, nu se refoloseste cel de la descoperire:
     apasarea, a noastra sau a altcuiva, s-a intamplat intre timp, deci intr-un
     bloc care nu exista cand am inceput rularea. Cu capul vechi, fiecare cursa
     s-ar inregistra cu o rulare intarziere, si cea din urma nu s-ar inregistra
     niciodata. */
  let racesRecorded = 0
  if (race?.active) {
    const sweepHead = await client.getBlockNumber()
    racesRecorded = await race.sweep(client, ctx.account?.address ?? null, sweepHead)
    race.forget()
  }

  if (ctx.account) {
    const balance = await client.getBalance({ address: ctx.account.address })
    await tg.gasLow(balance, ctx.account.address)
  }
  await tg.maybeDigest()

  const open = ledger.openTotals()
  const outcome: RunOutcome = {
    runId,
    seen: items.length,
    candidates: screened.pass.length,
    simulatedOk,
    done: res.done.filter((d) => d.status === 'confirmed').length,
    skipped: screened.skipped.length + res.skipped.length,
    gasWei: res.gasWei,
    rewardWei: res.rewardWei,
    costWei: res.costWei,
    openCount: open.count,
    openStakeWei: open.stakeWei,
    stoppedBy: res.stoppedBy,
    gatingWarning,
    found,
    racesRecorded
  }

  ledger.finishRun(runId, {
    seen: outcome.seen,
    candidates: outcome.candidates,
    done: outcome.done,
    failed: res.skipped.length,
    gasWei: outcome.gasWei,
    rewardWei: outcome.rewardWei,
    costWei: outcome.costWei,
    note: outcome.gatingWarning ?? outcome.stoppedBy
  })

  return outcome
}

/**
 * Bacsisul de gaz cu care intram in cursa.
 *
 * Numai Ringer are nevoie de el, si numai cand chiar exista cu cine te lupta.
 * Urcarea se calculeaza din pretul pietei si se opreste la plafonul din
 * configurare: o cursa castigata cu orice pret e o cursa pierduta pe alta
 * socoteala.
 */
async function feesFor(ctx: Ctx): Promise<{ fees?: { maxPriorityFeePerGasWei?: bigint } }> {
  if (ctx.cfg.agent.kind !== 'ringer') return {}
  const job = ctx.jobCfg as unknown as { race?: { priorityBumpBps: number; maxPriorityFeeWei: bigint | null } }
  const r = job?.race
  if (!r || r.priorityBumpBps === 0) return {}
  try {
    const base = await ctx.client.estimateMaxPriorityFeePerGas()
    let bumped = scaleWei(base, 1 + r.priorityBumpBps / 10_000)
    if (bumped === 0n) bumped = base
    if (r.maxPriorityFeeWei !== null && bumped > r.maxPriorityFeeWei) bumped = r.maxPriorityFeeWei
    return { fees: { maxPriorityFeePerGasWei: bumped } }
  } catch {
    /* lanturi fara EIP-1559: ramanem pe pretul implicit */
    return {}
  }
}

/** bucla, cu cadenta ceruta de meserie */
export async function runForever(ctx: Ctx, onRun?: (o: RunOutcome) => void): Promise<void> {
  const { cfg } = ctx
  const control = ctx.control
  const race = new RaceBook(cfg, ctx.ledger, ctx.job, ctx.jobCfg)
  let consecutiveFailures = 0
  control.attached = true
  const savedDry = cfg.execution.dryRun

  /* Cainele de paza. Nu apara de caderi, alea le prinde politica de restart a
     containerului. Apara de cazul urat: procesul traieste, portul raspunde,
     dar nicio rulare nu se mai termina. */
  const watchdog = watchdogSec(cfg)
  let lastCompletedMs = Date.now()
  let lastStandby: string | null = null
  const guard = watchdog
    ? setInterval(() => {
        if (!isWedged(lastCompletedMs, Date.now(), watchdog)) return
        log.fatal(
          { sinceSec: Math.floor((Date.now() - lastCompletedMs) / 1000), watchdogSec: watchdog },
          'no run finished in too long, exiting so the supervisor restarts me'
        )
        process.exit(1)
      }, 30_000)
    : null
  guard?.unref?.()

  let lastBlock = 0n

  while (true) {
    const asked = control.take()
    const dryThisRun = asked ? asked.dry : savedDry
    cfg.execution.dryRun = dryThisRun
    control.running = true
    control.nextRunAt = null

    try {
      const waiting = await standbyReason(ctx.client, cfg, ctx.job, ctx.jobCfg)
      control.standby = waiting
      if (waiting) {
        if (waiting !== lastStandby) log.warn({ reason: waiting }, 'standing by')
        lastStandby = waiting
        lastCompletedMs = Date.now()
        await beat(cfg.alerts.heartbeat)
      } else {
        if (lastStandby) log.info('addresses are in place, going back to work')
        lastStandby = null
        const o = await runOnce(ctx, { race })
        control.finished(o, dryThisRun)
        onRun?.(o)
        lastCompletedMs = Date.now()
        await beat(cfg.alerts.heartbeat)
        maybeBackup(ctx)
        log.info(
          {
            done: o.done,
            candidates: o.candidates,
            open: o.openCount,
            races: o.racesRecorded,
            gas: formatEther(o.gasWei),
            reward: formatEther(o.rewardWei)
          },
          'run complete'
        )
      }
      consecutiveFailures = 0
    } catch (e) {
      consecutiveFailures++
      log.error({ err: (e as Error).message, consecutiveFailures }, 'run failed')
      await beatFailure(cfg.alerts.heartbeat)
      if (consecutiveFailures >= cfg.execution.maxConsecutiveFailures) {
        control.running = false
        control.attached = false
        if (guard) clearInterval(guard)
        log.fatal('too many consecutive failed runs, stopping')
        throw e
      }
    } finally {
      control.running = false
      cfg.execution.dryRun = savedDry
    }

    if (cfg.runner.mode === 'block') {
      /* asteptam un cap de lant NOU, nu un ceas: cursa se joaca pe blocuri */
      lastBlock = await waitForNewBlock(ctx, lastBlock)
    } else {
      const jitter = Math.floor(Math.random() * (cfg.runner.jitterSec + 1))
      const waitMs = (cfg.runner.intervalSec + jitter) * 1000
      control.nextRunAt = Math.floor((Date.now() + waitMs) / 1000)
      await control.sleep(waitMs)
    }
  }
}

async function waitForNewBlock(ctx: Ctx, lastBlock: bigint): Promise<bigint> {
  const pollMs = ctx.cfg.runner.pollMs
  /* plasa de siguranta: daca lantul se opreste, nu ne blocam la nesfarsit
     intr-o bucla care nu mai termina nicio rulare, ci lasam cainele de paza
     sa isi faca treaba */
  const deadline = Date.now() + Math.max(60_000, pollMs * 120)
  while (Date.now() < deadline) {
    if (ctx.control.take()) return lastBlock
    try {
      const b = await ctx.client.getBlockNumber()
      if (b > lastBlock) return b
    } catch (e) {
      log.debug({ err: (e as Error).message }, 'block poll failed')
    }
    await ctx.control.sleep(pollMs)
  }
  return lastBlock
}

function maybeBackup(ctx: Ctx): void {
  const b = ctx.cfg.storage.backup
  if (!b.enabled) return
  if (!backupDue(ctx.ledger, b.everyHours)) return
  try {
    const r = backupOnce(ctx.ledger, b.dir, b.keep)
    log.info({ file: r.file, bytes: r.bytes, rows: r.rows, pruned: r.pruned.length, ms: r.ms }, 'ledger backed up')
  } catch (e) {
    log.error({ err: (e as Error).message }, 'backup failed')
  }
}
