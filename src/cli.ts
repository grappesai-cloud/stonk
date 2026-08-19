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
  .description('Courier: finds the unclaimed drops sitting in ERC-6551 wallets and delivers them')
  .option('-c, --config <path>', 'config file', './config/default.json')
  .option('--live', 'actually send transactions (dry run by default)', false)
  .option('--campaign', 'campaign mode: deliver even when it does not pay for itself', false)
  .option('--watchtower', 'watchtower mode: scan and alert, never deliver, never sign', false)

function ctxOf(): Ctx {
  const opts = program.opts<{ config: string; live: boolean; campaign: boolean; watchtower: boolean }>()
  const ctx = buildContext(opts.config)
  if (opts.live) ctx.cfg.execution.dryRun = false
  if (opts.campaign) ctx.cfg.policy.mode = 'campaign'
  if (opts.watchtower) ctx.cfg.watchtower = true
  /* veghea bate orice: daca ai cerut-o, nu se semneaza nimic, punct */
  if (ctx.cfg.watchtower) ctx.cfg.execution.dryRun = true
  return ctx
}

const sym = (ctx: Ctx) => ctx.cfg.network.nativeSymbol

program
  .command('init <dropsAddress>')
  .description('read the verified ABI from the explorer and propose config signatures')
  .action(async (dropsAddress: string) => {
    const ctx = ctxOf()
    const explorer = ctx.cfg.network.explorer
    if (!explorer) {
      process.stdout.write('no explorer configured, nowhere to fetch the ABI from\n')
      ctx.ledger.close()
      return
    }
    const d = await discover(explorer, dropsAddress)
    if (!d.verified) {
      process.stdout.write(
        `\nContract ${dropsAddress} has no verified ABI on ${explorer}.\n` +
          `Write the signatures by hand in the config, or ask the team for them.\n`
      )
      ctx.ledger.close()
      return
    }
    process.stdout.write(`\n${d.name ?? 'contract'} ${d.address}\n`)
    process.stdout.write('\nCANDIDATES FOR READING WHAT IS UNCLAIMED (drops.pending.signature)\n')
    for (const c of d.pending) {
      process.stdout.write(`  [${String(c.score).padStart(2)}] ${c.signature}\n        ${c.why.join('; ')}\n`)
    }
    process.stdout.write('\nCANDIDATES FOR DELIVERY (drops.deliverSignature)\n')
    for (const c of d.deliver) {
      process.stdout.write(`  [${String(c.score).padStart(2)}] ${c.signature}\n        ${c.why.join('; ')}\n`)
    }
    if (d.errors.length) {
      process.stdout.write('\nCUSTOM ERRORS (drops.errorSignatures), add them so simulation prints names, not hex\n')
      for (const e of d.errors) process.stdout.write(`  ${e}\n`)
    }
    process.stdout.write(
      '\nYou pick, I do not guess: a name like claim can mean three different things.\n' +
        'Once they are in the config, courier doctor tells you if you got it right.\n'
    )
    ctx.ledger.close()
  })

program
  .command('doctor')
  .description('check everything that must be true before the bot can work')
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
  .description('who holds something unclaimed and what it is worth')
  .option('--limit <n>', 'rows to print', '25')
  .action(async (o: { limit: string }) => {
    const ctx = ctxOf()
    const ids = await discoverTokenIds(ctx.client, ctx.cfg)
    const scan = await scanClaims(ctx.client, ctx.cfg, ids)
    const owners = await ownersOf(ctx.client, ctx.cfg, scan.claims.map((c) => c.tokenId))
    for (const c of scan.claims) {
      ctx.ledger.seeClaim(c.tokenId.toString(), c.wallet, owners.get(c.tokenId) ?? null, c.valueWei, c.native)
    }
    const rows = [...scan.claims].sort((a, b) => (a.valueWei > b.valueWei ? -1 : 1)).slice(0, Number(o.limit))
    process.stdout.write(`\nbrokers: ${scan.scanned}   holding something: ${scan.claims.length}   failed reads: ${scan.failed}\n`)
    process.stdout.write(`total value: ${formatEther(scan.totalValueWei)} ${sym(ctx)}\n\n`)
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
  .description('what would be delivered, at what gas and tip, and why the rest is not')
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

    process.stdout.write(`\ncandidates: ${screened.pass.length}   simulations passed: ${okCount}\n`)
    process.stdout.write(`estimated gas: ${gas} units at ${gasPrice} wei = ${formatEther(gas * gasPrice)} ${sym(ctx)}\n\n`)
    const byReason = new Map<string, number>()
    for (const s of sims) if (!s.ok) byReason.set(s.kind, (byReason.get(s.kind) ?? 0) + 1)
    for (const [k, v] of byReason) process.stdout.write(`  rejected (${k}): ${v}\n`)
    for (const s of screened.skipped.slice(0, 10)) {
      process.stdout.write(`  skipped #${s.tokenId}: ${s.reason}${s.detail ? ' · ' + s.detail : ''}\n`)
    }
    ctx.ledger.close()
  })

program
  .command('run')
  .description('one full pass')
  .action(async () => {
    const ctx = ctxOf()
    const o = await runOnce(ctx)
    printOutcome(ctx, o)
    ctx.ledger.close()
    process.exit(o.gatingWarning ? 2 : 0)
  })

program
  .command('start')
  .description('continuous loop, plus the API and the Telegram bot')
  .action(async () => {
    const ctx = ctxOf()
    const server = startApi(ctx)
    const consoleServer = startConsole(ctx)
    const tgTimer = ctx.tg.enabled ? setInterval(() => void ctx.tg.poll(), 3000) : null

    const shutdown = () => {
      log.info('shutting down')
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
  .description('operator console only (token from console.token)')
  .action(async () => {
    const ctx = ctxOf()
    ctx.cfg.console.enabled = true
    if (!startConsole(ctx)) process.exit(1)
  })

program
  .command('serve')
  .description('read-only API only')
  .action(async () => {
    const ctx = ctxOf()
    startApi(ctx)
  })

program
  .command('wall')
  .description('the wall of the forgotten: what sits unclaimed, from the last scan')
  .option('--limit <n>', 'rows', '25')
  .action(async (o: { limit: string }) => {
    const ctx = ctxOf()
    const w = ctx.ledger.wallTotals()
    const s = sym(ctx)
    process.stdout.write(
      `\n${w.count} wallets holding something unclaimed, ${formatEther(w.valueWei)} ${s} in total, oldest waiting ${w.oldestDays} days\n\n`
    )
    for (const r of ctx.ledger.wall(Number(o.limit))) {
      process.stdout.write(
        `#${r.tokenId.padStart(5)}  ${r.wallet}  ${formatEther(r.valueWei).padStart(12)} ${s}  waiting ${r.ageDays} days\n`
      )
    }
    ctx.ledger.close()
  })

program
  .command('tba <tokenId>')
  .description('the ERC-6551 wallet address of a broker, computed locally')
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
    process.stdout.write(`${addr}\n${check.ok ? 'verified against the on-chain registry' : 'WARNING: ' + check.detail}\n`)
    ctx.ledger.close()
  })

program
  .command('report')
  .description('what it delivered, what it earned, what it burned on gas')
  .action(async () => {
    const ctx = ctxOf()
    const day = Math.floor(Date.now() / 1000) - 86400
    const week = Math.floor(Date.now() / 1000) - 7 * 86400
    const s = sym(ctx)
    for (const [label, since] of [
      ['24h', day],
      ['7 days', week],
      ['all time', 0]
    ] as const) {
      const t = ctx.ledger.totals(since)
      process.stdout.write(
        `${label.padEnd(9)} deliveries ${String(t.deliveries).padStart(6)}  wallets ${String(t.wallets).padStart(6)}  ` +
          `delivered ${formatEther(t.valueWei).padStart(12)} ${s}  earned ${formatEther(t.tipsWei).padStart(12)} ${s}  ` +
          `gas ${formatEther(t.gasWei).padStart(12)} ${s}  net ${formatEther(t.netWei).padStart(12)} ${s}\n`
      )
    }
    const w = ctx.ledger.wallTotals()
    process.stdout.write(`\nunclaimed right now: ${w.count} wallets, ${formatEther(w.valueWei)} ${s}, oldest waiting ${w.oldestDays} days\n`)
    ctx.ledger.close()
  })

function printOutcome(ctx: Ctx, o: Awaited<ReturnType<typeof runOnce>>): void {
  const s = sym(ctx)
  process.stdout.write(
    `\nrun #${o.runId}${ctx.cfg.execution.dryRun ? ' (dry)' : ''}\n` +
      `  scanned ${o.scanned}, holding something ${o.withSomething}, candidates ${o.candidates}, simulations ok ${o.simulatedOk}\n` +
      `  delivered ${o.delivered}, skipped ${o.skipped}\n` +
      `  value ${formatEther(o.valueWei)} ${s}, tips ${formatEther(o.tipsWei)} ${s}, gas ${formatEther(o.gasWei)} ${s}\n` +
      `  still unclaimed: ${o.wallCount} wallets, ${formatEther(o.wallValueWei)} ${s}\n` +
      (o.stoppedBy ? `  stopped by: ${o.stoppedBy}\n` : '') +
      (o.gatingWarning ? `  WARNING: ${o.gatingWarning}\n` : '')
  )
}

function formatUnits(v: bigint, decimals: number): string {
  const d = 10n ** BigInt(decimals)
  const whole = v / d
  const frac = (v % d).toString().padStart(decimals, '0').slice(0, 4)
  return `${whole}.${frac}`
}

program.parseAsync(process.argv).catch((e) => {
  log.fatal({ err: (e as Error).message }, 'failed')
  process.exit(1)
})
