/**
 * O rulare completa: descopera, scaneaza, filtreaza, simuleaza, livreaza,
 * anunta, scrie in registru. Fiecare pas isi lasa urma, inclusiv cele care
 * nu au facut nimic, pentru ca "de ce nu a livrat" e intrebarea pe care o
 * pui cel mai des cand tii un bot in productie.
 */
import { formatEther } from 'viem'
import type { Ctx } from './context.js'
import { STRANGER } from './context.js'
import { discoverTokenIds, ownersOf } from './discover/brokers.js'
import { scanClaims, type Claim } from './scan/claims.js'
import { screenClaims } from './policy/rules.js'
import { probeGating, simulateEach } from './simulate/simulate.js'
import { execute } from './execute/executor.js'
import type { FoundNews } from './alerts/telegram.js'
import { reconcile } from './reconcile.js'
import { backupDue, backupOnce } from './ledger/backup.js'
import { beat, beatFailure } from './alerts/heartbeat.js'
import { isWedged, watchdogSec } from './health.js'
import { standbyReason } from './standby.js'
import { log } from './log.js'

export interface RunOutcome {
  runId: number
  scanned: number
  withSomething: number
  candidates: number
  simulatedOk: number
  delivered: number
  skipped: number
  gasWei: bigint
  tipsWei: bigint
  valueWei: bigint
  wallCount: number
  wallValueWei: bigint
  stoppedBy: string | null
  gatingWarning: string | null
  /** cate descoperiri noi, folosit in modul de veghe */
  found: number
}

export async function runOnce(ctx: Ctx): Promise<RunOutcome> {
  const { cfg, client, ledger, tg } = ctx
  const runId = ledger.startRun(cfg.watchtower ? 'watchtower' : cfg.policy.mode, cfg.execution.dryRun)
  const from = ctx.account?.address ?? STRANGER

  // intai punem la punct ce a ramas in aer de la rularea trecuta
  await reconcile(ctx)

  const ids = await discoverTokenIds(client, cfg)
  log.info({ ids: ids.length }, 'brokers discovered')

  const scan = await scanClaims(client, cfg, ids)
  log.info(
    { withSomething: scan.claims.length, failed: scan.failed, value: formatEther(scan.totalValueWei) },
    'scan complete'
  )

  const owners = await ownersOf(
    client,
    cfg,
    scan.claims.map((c) => c.tokenId)
  )

  /* Peretele uitatilor se actualizeaza indiferent daca livram sau nu, si tot
     aici aflam ce e nou fata de rularea trecuta. Diferenta e tot ce conteaza
     pentru veghe: un index care nu stie ce s-a schimbat e doar o poza. */
  const found: FoundNews[] = []
  for (const c of scan.claims) {
    const owner = owners.get(c.tokenId) ?? null
    const d = ledger.seeClaim(c.tokenId.toString(), c.wallet, owner, c.valueWei, c.native)
    if (d.isNew || d.deltaWei > 0n) {
      found.push({ tokenId: c.tokenId.toString(), wallet: c.wallet, owner, valueWei: c.valueWei, isNew: d.isNew })
    }
  }

  /* ------------------------------------------------------------- veghe ---
     Modul de veghe se opreste aici: a scanat, a tinut indexul, a anuntat.
     Nu simuleaza si nu semneaza nimic, deci nu are nevoie nici de cheie, nici
     de raspunsul la intrebarea daca deliver() e apelabila de un strain. */
  if (cfg.watchtower) {
    await tg.announceFound(found)
    await tg.maybeDigest()
    const wall = ledger.wallTotals()
    const outcome: RunOutcome = {
      runId,
      scanned: scan.scanned,
      withSomething: scan.claims.length,
      candidates: 0,
      simulatedOk: 0,
      delivered: 0,
      skipped: 0,
      gasWei: 0n,
      tipsWei: 0n,
      valueWei: 0n,
      wallCount: wall.count,
      wallValueWei: wall.valueWei,
      stoppedBy: null,
      gatingWarning: null,
      found: found.length
    }
    ledger.finishRun(runId, {
      scanned: outcome.scanned,
      candidates: 0,
      delivered: 0,
      failed: 0,
      gasWei: 0n,
      tipsWei: 0n,
      valueWei: 0n,
      note: `watch: ${found.length} new finds`
    })
    log.info({ found: found.length, wall: wall.count }, 'watch pass complete')
    return outcome
  }

  const screened = screenClaims({
    claims: scan.claims,
    owners,
    cfg,
    lastDeliveryAt: (id) => ledger.lastDeliveryAt(id),
    nowSec: Math.floor(Date.now() / 1000)
  })

  let gatingWarning: string | null = null
  let deliverable: Claim[] = []
  let simulatedOk = 0

  if (screened.pass.length > 0) {
    const sims = await simulateEach(client, cfg, from, screened.pass)
    deliverable = sims.filter((s) => s.ok).map((s) => s.claim)
    simulatedOk = deliverable.length

    /**
     * Cand nicio simulare nu trece, nu ne multumim cu textul erorii: cerem
     * dovada, simuland acelasi apel din contul proprietarului. Diferenta
     * dintre cele doua raspunsuri e singurul lucru care demonstreaza ca
     * functia e rezervata.
     */
    if (simulatedOk === 0 && sims.length > 0) {
      const probe = await probeGating(client, cfg, screened.pass, from, (id) => owners.get(id))
      if (probe.kind === 'owner-gated') {
        gatingWarning =
          `deliver() is owner-gated (proven on #${probe.testedTokenId}: ${probe.reason}). ` +
          `Without a contract change or an opt-in, Courier cannot deliver on anyone's behalf.`
        log.error({ tested: probe.testedTokenId }, gatingWarning)
      }
    }
    for (const s of sims) {
      if (!s.ok) log.debug({ tokenId: s.claim.tokenId.toString(), kind: s.kind, reason: s.reason }, 'delivery excluded')
    }
  }

  const res = await execute({
    client,
    wallet: ctx.wallet,
    account: ctx.account,
    cfg,
    ledger,
    runId,
    claims: deliverable,
    owners
  })

  if (res.delivered.length > 0) {
    await tg.announce(
      res.delivered.map((d) => ({
        tokenId: d.claim.tokenId.toString(),
        wallet: d.claim.wallet,
        owner: owners.get(d.claim.tokenId) ?? null,
        valueWei: d.claim.valueWei,
        tipWei: 0n,
        txHash: d.txHash
      }))
    )
  }
  if (ctx.account) {
    const balance = await client.getBalance({ address: ctx.account.address })
    await tg.gasLow(balance, ctx.account.address)
  }
  await tg.maybeDigest()

  const wall = ledger.wallTotals()
  const outcome: RunOutcome = {
    runId,
    scanned: scan.scanned,
    withSomething: scan.claims.length,
    candidates: screened.pass.length,
    simulatedOk,
    delivered: res.delivered.length,
    skipped: screened.skipped.length + res.skipped.length,
    gasWei: res.gasWei,
    tipsWei: res.tipsWei,
    valueWei: res.valueWei,
    wallCount: wall.count,
    wallValueWei: wall.valueWei,
    stoppedBy: res.stoppedBy,
    gatingWarning,
    found: found.length
  }

  ledger.finishRun(runId, {
    scanned: outcome.scanned,
    candidates: outcome.candidates,
    delivered: outcome.delivered,
    failed: res.skipped.length,
    gasWei: outcome.gasWei,
    tipsWei: outcome.tipsWei,
    valueWei: outcome.valueWei,
    note: outcome.gatingWarning ?? outcome.stoppedBy
  })

  return outcome
}

/** bucla, cu jitter ca sa nu batem RPC-ul in acelasi moment cu toata lumea */
export async function runForever(ctx: Ctx, onRun?: (o: RunOutcome) => void): Promise<void> {
  const { intervalSec, jitterSec } = ctx.cfg.runner
  const control = ctx.control
  let consecutiveFailures = 0
  control.attached = true
  const savedDry = ctx.cfg.execution.dryRun

  /* Cainele de paza. Nu apara de caderi, alea le prinde politica de restart a
     containerului. Apara de cazul urat: procesul traieste, portul raspunde,
     dar nicio rulare nu se mai termina. Atunci iese singur, cu cod 1, si il
     ridica inapoi acelasi restart. */
  const watchdog = watchdogSec(ctx.cfg)
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

  while (true) {
    /* o cerere din consola poate cere explicit rulare uscata, fara sa schimbe
       configurarea de fond */
    const asked = control.take()
    const dryThisRun = asked ? asked.dry : savedDry
    ctx.cfg.execution.dryRun = dryThisRun
    control.running = true
    control.nextRunAt = null

    try {
      /* Inainte de orice: avem cu ce lucra? Fara adrese, o rulare nu esueaza
         interesant, esueaza mereu la fel, iar cinci esecuri la rand inchid
         procesul. Asteptarea e o stare, nu o eroare. */
      const waiting = await standbyReason(ctx.client, ctx.cfg)
      control.standby = waiting
      if (waiting) {
        if (waiting !== lastStandby) log.warn({ reason: waiting }, 'standing by')
        lastStandby = waiting
        /* procesul e sanatos si face exact ce trebuie, deci pulsul bate si
           cainele de paza nu are ce cauta aici */
        lastCompletedMs = Date.now()
        await beat(ctx.cfg.alerts.heartbeat)
      } else {
        if (lastStandby) log.info('addresses are in place, going back to work')
        lastStandby = null
        const o = await runOnce(ctx)
        control.finished(o, dryThisRun)
        onRun?.(o)
        lastCompletedMs = Date.now()
        await beat(ctx.cfg.alerts.heartbeat)
        maybeBackup(ctx)
        log.info(
          {
            delivered: o.delivered,
            candidates: o.candidates,
            wall: o.wallCount,
            gas: formatEther(o.gasWei),
            tips: formatEther(o.tipsWei)
          },
          'run complete'
        )
      }
      consecutiveFailures = 0
    } catch (e) {
      consecutiveFailures++
      log.error({ err: (e as Error).message, consecutiveFailures }, 'run failed')
      await beatFailure(ctx.cfg.alerts.heartbeat)
      if (consecutiveFailures >= ctx.cfg.execution.maxConsecutiveFailures) {
        control.running = false
        control.attached = false
        if (guard) clearInterval(guard)
        log.fatal('too many consecutive failed runs, stopping')
        throw e
      }
    } finally {
      control.running = false
      ctx.cfg.execution.dryRun = savedDry
    }

    const jitter = Math.floor(Math.random() * (jitterSec + 1))
    const waitMs = (intervalSec + jitter) * 1000
    control.nextRunAt = Math.floor((Date.now() + waitMs) / 1000)
    /* somnul se rupe daca cineva apasa butonul din consola */
    await control.sleep(waitMs)
  }
}

/**
 * Copia registrului, daca a trecut destul de la ultima. Ruleaza in procesul
 * care scrie, imediat dupa o rulare terminata, adica in momentul cel mai
 * linistit din tot ciclul.
 *
 * Nu are voie sa opreasca bucla: o copie care nu s-a putut face e o problema
 * de raportat, nu un motiv sa nu mai livrezi.
 */
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
