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
import { reconcile } from './reconcile.js'
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
}

export async function runOnce(ctx: Ctx): Promise<RunOutcome> {
  const { cfg, client, ledger, tg } = ctx
  const runId = ledger.startRun(cfg.policy.mode, cfg.execution.dryRun)
  const from = ctx.account?.address ?? STRANGER

  // intai punem la punct ce a ramas in aer de la rularea trecuta
  await reconcile(ctx)

  const ids = await discoverTokenIds(client, cfg)
  log.info({ ids: ids.length }, 'brokeri descoperiti')

  const scan = await scanClaims(client, cfg, ids)
  log.info(
    { withSomething: scan.claims.length, failed: scan.failed, value: formatEther(scan.totalValueWei) },
    'scanare terminata'
  )

  const owners = await ownersOf(
    client,
    cfg,
    scan.claims.map((c) => c.tokenId)
  )

  // peretele uitatilor se actualizeaza indiferent daca livram sau nu
  for (const c of scan.claims) {
    ledger.seeClaim(c.tokenId.toString(), c.wallet, owners.get(c.tokenId) ?? null, c.valueWei, c.native)
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
          `deliver() e rezervata proprietarului (dovedit pe #${probe.testedTokenId}: ${probe.reason}). ` +
          `Fara o schimbare de contract sau un opt-in, Courier-ul nu poate livra in numele nimanui.`
        log.error({ tested: probe.testedTokenId }, gatingWarning)
      }
    }
    for (const s of sims) {
      if (!s.ok) log.debug({ tokenId: s.claim.tokenId.toString(), kind: s.kind, reason: s.reason }, 'livrare exclusa')
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
    gatingWarning
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
  let consecutiveFailures = 0

  while (true) {
    try {
      const o = await runOnce(ctx)
      onRun?.(o)
      consecutiveFailures = 0
      log.info(
        {
          delivered: o.delivered,
          candidates: o.candidates,
          wall: o.wallCount,
          gas: formatEther(o.gasWei),
          tips: formatEther(o.tipsWei)
        },
        'rulare incheiata'
      )
    } catch (e) {
      consecutiveFailures++
      log.error({ err: (e as Error).message, consecutiveFailures }, 'rulare picata')
      if (consecutiveFailures >= ctx.cfg.execution.maxConsecutiveFailures) {
        log.fatal('prea multe rulari picate la rand, ma opresc')
        throw e
      }
    }
    const jitter = Math.floor(Math.random() * (jitterSec + 1))
    await new Promise((r) => setTimeout(r, (intervalSec + jitter) * 1000))
  }
}
