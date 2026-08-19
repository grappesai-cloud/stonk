#!/usr/bin/env node
/**
 * Linia de comanda. Regula: implicit nu se trimite nimic. `--live` e singurul
 * lucru care porneste semnarea, si se scrie de mana de fiecare data.
 */
import { formatEther } from 'viem'
import { Command } from 'commander'
import { buildContext, type Ctx } from './context.js'
import { doctor, verifyTbaMath } from './doctor.js'
import { discover } from './init.js'
import { tbaAddress } from './erc6551/address.js'
import { runForever, runOnce } from './runner.js'
import { startApi } from './api/server.js'
import { startConsole } from './console/server.js'
import { discoverTokenIds, ownersOf } from './discover/brokers.js'
import { scanClaims } from './scan/claims.js'
import { screenClaims } from './policy/rules.js'
import { simulateEach } from './simulate/simulate.js'
import { STRANGER } from './context.js'
import { log } from './log.js'

const program = new Command()
program
  .name('courier')
  .description('Courier: gaseste drop-urile nerevendicate din portofelele 6551 si le livreaza')
  .option('-c, --config <path>', 'fisierul de configurare', './config/default.json')
  .option('--live', 'chiar trimite tranzactii (implicit e rulare uscata)', false)
  .option('--campaign', 'modul campanie: livreaza si cand nu se plateste singur', false)

function ctxOf(): Ctx {
  const opts = program.opts<{ config: string; live: boolean; campaign: boolean }>()
  const ctx = buildContext(opts.config)
  if (opts.live) ctx.cfg.execution.dryRun = false
  if (opts.campaign) ctx.cfg.policy.mode = 'campaign'
  return ctx
}

const sym = (ctx: Ctx) => ctx.cfg.network.nativeSymbol

program
  .command('init <dropsAddress>')
  .description('citeste ABI-ul verificat de pe explorer si propune semnaturile pentru configurare')
  .action(async (dropsAddress: string) => {
    const ctx = ctxOf()
    const explorer = ctx.cfg.network.explorer
    if (!explorer) {
      process.stdout.write('nu e configurat niciun explorer, nu am de unde lua ABI-ul\n')
      ctx.ledger.close()
      return
    }
    const d = await discover(explorer, dropsAddress)
    if (!d.verified) {
      process.stdout.write(
        `\nContractul ${dropsAddress} nu are ABI verificat pe ${explorer}.\n` +
          `Scrie semnaturile de mana in configurare, sau cere-le echipei.\n`
      )
      ctx.ledger.close()
      return
    }
    process.stdout.write(`\n${d.name ?? 'contract'} ${d.address}\n`)
    process.stdout.write('\nCANDIDATI PENTRU CITIREA NEREVENDICATULUI (drops.pending.signature)\n')
    for (const c of d.pending) {
      process.stdout.write(`  [${String(c.score).padStart(2)}] ${c.signature}\n        ${c.why.join('; ')}\n`)
    }
    process.stdout.write('\nCANDIDATI PENTRU LIVRARE (drops.deliverSignature)\n')
    for (const c of d.deliver) {
      process.stdout.write(`  [${String(c.score).padStart(2)}] ${c.signature}\n        ${c.why.join('; ')}\n`)
    }
    if (d.errors.length) {
      process.stdout.write('\nERORI PROPRII (drops.errorSignatures), pune-le ca simularea sa spuna nume, nu hex\n')
      for (const e of d.errors) process.stdout.write(`  ${e}\n`)
    }
    process.stdout.write(
      '\nAlegi tu, nu ghicesc eu: un nume ca `claim` poate face trei lucruri diferite.\n' +
        'Dupa ce le pui in configurare, `courier doctor` iti spune daca ai nimerit.\n'
    )
    ctx.ledger.close()
  })

program
  .command('doctor')
  .description('verifica tot ce trebuie sa fie adevarat ca botul sa poata munci')
  .action(async () => {
    const ctx = ctxOf()
    const checks = await doctor(ctx)
    let fatal = 0
    for (const c of checks) {
      const mark = c.ok ? 'OK  ' : c.fatal ? 'STOP' : 'ATN '
      if (!c.ok && c.fatal) fatal++
      process.stdout.write(`${mark} ${c.name.padEnd(32)} ${c.detail}\n`)
    }
    ctx.ledger.close()
    process.exit(fatal > 0 ? 1 : 0)
  })

program
  .command('scan')
  .description('cine are ceva nerevendicat si cat valoreaza')
  .option('--limit <n>', 'cate randuri afisez', '25')
  .action(async (o: { limit: string }) => {
    const ctx = ctxOf()
    const ids = await discoverTokenIds(ctx.client, ctx.cfg)
    const scan = await scanClaims(ctx.client, ctx.cfg, ids)
    const owners = await ownersOf(ctx.client, ctx.cfg, scan.claims.map((c) => c.tokenId))
    for (const c of scan.claims) {
      ctx.ledger.seeClaim(c.tokenId.toString(), c.wallet, owners.get(c.tokenId) ?? null, c.valueWei, c.native)
    }
    const rows = [...scan.claims].sort((a, b) => (a.valueWei > b.valueWei ? -1 : 1)).slice(0, Number(o.limit))
    process.stdout.write(`\nbrokeri: ${scan.scanned}   cu ceva nerevendicat: ${scan.claims.length}   citiri picate: ${scan.failed}\n`)
    process.stdout.write(`valoare totala: ${formatEther(scan.totalValueWei)} ${sym(ctx)}\n\n`)
    for (const c of rows) {
      const tok = c.tokens.map((t) => `${formatUnits(t.amount, t.decimals)} ${t.symbol}`).join(', ')
      process.stdout.write(
        `#${c.tokenId.toString().padStart(5)}  ${c.wallet}  ${formatEther(c.valueWei).padStart(12)} ${sym(ctx)}${tok ? '  + ' + tok : ''}\n`
      )
    }
    ctx.ledger.close()
  })

program
  .command('simulate')
  .description('ce s-ar livra, cu ce gaz, cu ce bacsis si de ce nu se livreaza restul')
  .action(async () => {
    const ctx = ctxOf()
    const from = ctx.account?.address ?? STRANGER
    const ids = await discoverTokenIds(ctx.client, ctx.cfg)
    const scan = await scanClaims(ctx.client, ctx.cfg, ids)
    const owners = await ownersOf(ctx.client, ctx.cfg, scan.claims.map((c) => c.tokenId))
    const screened = screenClaims({
      claims: scan.claims,
      owners,
      cfg: ctx.cfg,
      lastDeliveryAt: (id) => ctx.ledger.lastDeliveryAt(id),
      nowSec: Math.floor(Date.now() / 1000)
    })
    const sims = await simulateEach(ctx.client, ctx.cfg, from, screened.pass)
    const okCount = sims.filter((s) => s.ok).length
    const gas = sims.reduce((s, x) => s + x.gas, 0n)
    const gasPrice = await ctx.client.getGasPrice()

    process.stdout.write(`\ncandidati: ${screened.pass.length}   simulari reusite: ${okCount}\n`)
    process.stdout.write(`gaz estimat: ${gas} unitati la ${gasPrice} wei = ${formatEther(gas * gasPrice)} ${sym(ctx)}\n\n`)
    const byReason = new Map<string, number>()
    for (const s of sims) if (!s.ok) byReason.set(s.kind, (byReason.get(s.kind) ?? 0) + 1)
    for (const [k, v] of byReason) process.stdout.write(`  respinse (${k}): ${v}\n`)
    for (const s of screened.skipped.slice(0, 10)) {
      process.stdout.write(`  sarit #${s.tokenId}: ${s.reason}${s.detail ? ' · ' + s.detail : ''}\n`)
    }
    ctx.ledger.close()
  })

program
  .command('run')
  .description('o singura rulare completa')
  .action(async () => {
    const ctx = ctxOf()
    const o = await runOnce(ctx)
    printOutcome(ctx, o)
    ctx.ledger.close()
    process.exit(o.gatingWarning ? 2 : 0)
  })

program
  .command('start')
  .description('bucla continua, plus API si botul de Telegram')
  .action(async () => {
    const ctx = ctxOf()
    const server = startApi(ctx)
    const consoleServer = startConsole(ctx)
    const tgTimer = ctx.tg.enabled ? setInterval(() => void ctx.tg.poll(), 3000) : null

    const shutdown = () => {
      log.info('opresc')
      if (tgTimer) clearInterval(tgTimer)
      server?.close()
      consoleServer?.close()
      ctx.ledger.close()
      process.exit(0)
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    await runForever(ctx, (o) => printOutcome(ctx, o))
  })

program
  .command('console')
  .description('doar consola de operator (jeton din console.token)')
  .action(async () => {
    const ctx = ctxOf()
    ctx.cfg.console.enabled = true
    if (!startConsole(ctx)) process.exit(1)
  })

program
  .command('serve')
  .description('doar API-ul de citire')
  .action(async () => {
    const ctx = ctxOf()
    startApi(ctx)
  })

program
  .command('wall')
  .description('peretele uitatilor: ce zace nerevendicat, dupa ultima scanare')
  .option('--limit <n>', 'cate randuri', '25')
  .action(async (o: { limit: string }) => {
    const ctx = ctxOf()
    const w = ctx.ledger.wallTotals()
    const s = sym(ctx)
    process.stdout.write(
      `\n${w.count} portofele cu ceva nerevendicat, ${formatEther(w.valueWei)} ${s} in total, cel mai vechi de ${w.oldestDays} zile\n\n`
    )
    for (const r of ctx.ledger.wall(Number(o.limit))) {
      process.stdout.write(
        `#${r.tokenId.padStart(5)}  ${r.wallet}  ${formatEther(r.valueWei).padStart(12)} ${s}  de ${r.ageDays} zile\n`
      )
    }
    ctx.ledger.close()
  })

program
  .command('tba <tokenId>')
  .description('adresa portofelului 6551 al unui broker, calculata local')
  .action(async (tokenId: string) => {
    const ctx = ctxOf()
    const addr = tbaAddress({
      registry: ctx.cfg.erc6551.registry,
      implementation: ctx.cfg.erc6551.implementation,
      salt: ctx.cfg.erc6551.salt,
      chainId: ctx.cfg.network.chainId,
      tokenContract: ctx.cfg.brokers.address,
      tokenId: BigInt(tokenId)
    })
    const check = await verifyTbaMath(
      ctx.client,
      ctx.cfg.erc6551.registry,
      ctx.cfg.erc6551.implementation,
      ctx.cfg.erc6551.salt,
      ctx.cfg.network.chainId,
      ctx.cfg.brokers.address
    )
    process.stdout.write(`${addr}\n${check.ok ? 'verificat cu registrul de pe lant' : 'ATENTIE: ' + check.detail}\n`)
    ctx.ledger.close()
  })

program
  .command('report')
  .description('cat a livrat, cat a castigat, cat a ars pe gaz')
  .action(async () => {
    const ctx = ctxOf()
    const day = Math.floor(Date.now() / 1000) - 86400
    const week = Math.floor(Date.now() / 1000) - 7 * 86400
    const s = sym(ctx)
    for (const [label, since] of [
      ['24h', day],
      ['7 zile', week],
      ['total', 0]
    ] as const) {
      const t = ctx.ledger.totals(since)
      process.stdout.write(
        `${label.padEnd(8)} livrari ${String(t.deliveries).padStart(6)}  portofele ${String(t.wallets).padStart(6)}  ` +
          `livrat ${formatEther(t.valueWei).padStart(12)} ${s}  castigat ${formatEther(t.tipsWei).padStart(12)} ${s}  ` +
          `gaz ${formatEther(t.gasWei).padStart(12)} ${s}  net ${formatEther(t.netWei).padStart(12)} ${s}\n`
      )
    }
    const w = ctx.ledger.wallTotals()
    process.stdout.write(`\nnerevendicat acum: ${w.count} portofele, ${formatEther(w.valueWei)} ${s}, cel mai vechi de ${w.oldestDays} zile\n`)
    ctx.ledger.close()
  })

function printOutcome(ctx: Ctx, o: Awaited<ReturnType<typeof runOnce>>): void {
  const s = sym(ctx)
  process.stdout.write(
    `\nrulare #${o.runId}${ctx.cfg.execution.dryRun ? ' (uscata)' : ''}\n` +
      `  scanati ${o.scanned}, cu ceva ${o.withSomething}, candidati ${o.candidates}, simulari bune ${o.simulatedOk}\n` +
      `  livrati ${o.delivered}, sariti ${o.skipped}\n` +
      `  valoare ${formatEther(o.valueWei)} ${s}, bacsis ${formatEther(o.tipsWei)} ${s}, gaz ${formatEther(o.gasWei)} ${s}\n` +
      `  nerevendicat ramas: ${o.wallCount} portofele, ${formatEther(o.wallValueWei)} ${s}\n` +
      (o.stoppedBy ? `  oprit de: ${o.stoppedBy}\n` : '') +
      (o.gatingWarning ? `  ATENTIE: ${o.gatingWarning}\n` : '')
  )
}

function formatUnits(v: bigint, decimals: number): string {
  const d = 10n ** BigInt(decimals)
  const whole = v / d
  const frac = (v % d).toString().padStart(decimals, '0').slice(0, 4)
  return `${whole}.${frac}`
}

program.parseAsync(process.argv).catch((e) => {
  log.fatal({ err: (e as Error).message }, 'a picat')
  process.exit(1)
})
