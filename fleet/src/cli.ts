/**
 * Linia de comanda. Un singur binar pentru toata flota: meseria se alege din
 * configurare (`agent.kind`), nu din numele programului.
 *
 * Ordinea in care se folosesc, prima data:
 *   fleet init <adresa>   ce functii are contractul si care par a fi ale noastre
 *   fleet doctor          are sens agentul asta? merge apelat de un strain?
 *   fleet scan            ce e de lucru acum
 *   fleet simulate        ce s-ar intampla, fara sa se trimita nimic
 *   fleet run             o rulare (uscata, daca nu se cere altfel)
 *   fleet start           bucla, cu server si consola
 */
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { Command } from 'commander'
import { formatEther } from 'viem'
import { buildContext, STRANGER, type Ctx } from './core/context.js'
import { doctor } from './core/doctor.js'
import { runForever, runOnce } from './core/runner.js'
import { simulateEach, probeGating } from './core/simulate.js'
import { startServer } from './core/api/server.js'
import { races as raceReport, stats as statsReport } from './core/api/server.js'
import { backupOnce, listBackups } from './core/ledger/backup.js'
import { discoverAbi } from './core/init.js'
import { standbyReason } from './core/standby.js'
import { log } from './core/log.js'

const program = new Command()
program
  .name('fleet')
  .description('Ringer and Miner: keeper agents for the Stonk Agents fleet')
  .option('-c, --config <file>', 'config file', process.env.FLEET_CONFIG ?? './config/default.json')

const cfgPath = (): string => program.opts().config as string
const ctxOf = (): Ctx => buildContext(cfgPath())

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const DIM = '\x1b[2m'
const OFF = '\x1b[0m'

program
  .command('doctor')
  .description('is this agent even possible on this contract?')
  .action(async () => {
    const ctx = ctxOf()
    const checks = await doctor(ctx)
    for (const c of checks) {
      const mark = c.ok ? `${GREEN}ok  ${OFF}` : c.fatal ? `${RED}FAIL${OFF}` : `${RED}warn${OFF}`
      process.stdout.write(`${mark} ${c.name.padEnd(34)} ${DIM}${c.detail}${OFF}\n`)
    }
    const fatal = checks.filter((c) => !c.ok && c.fatal)
    ctx.ledger.close()
    if (fatal.length) {
      process.stdout.write(`\n${RED}${fatal.length} fatal problem(s). The agent will not work like this.${OFF}\n`)
      process.exitCode = 1
    }
  })

program
  .command('scan')
  .description('what is there to do right now')
  .action(async () => {
    const ctx = ctxOf()
    const waiting = await standbyReason(ctx.client, ctx.cfg, ctx.job, ctx.jobCfg)
    if (waiting) {
      process.stdout.write(`${RED}standby${OFF}: ${waiting}\n`)
      ctx.ledger.close()
      return
    }
    const from = ctx.account?.address ?? STRANGER
    const items = await ctx.job.discover({ client: ctx.client, cfg: ctx.cfg, job: ctx.jobCfg, ledger: ctx.ledger, from })
    if (items.length === 0) process.stdout.write(`${DIM}nothing to do right now${OFF}\n`)
    for (const it of items) {
      process.stdout.write(
        `${it.label.padEnd(20)} stake ${formatEther(it.stakeWei).padStart(12)} ` +
          `reward ${formatEther(it.rewardWei).padStart(12)} ${it.rewardMeasured ? `${GREEN}measured${OFF}` : `${RED}not measured${OFF}`} ` +
          `${DIM}${it.meta.reward ?? ''}${OFF}\n`
      )
    }
    ctx.ledger.close()
  })

program
  .command('simulate')
  .description('what would happen, without sending anything')
  .action(async () => {
    const ctx = ctxOf()
    const from = ctx.account?.address ?? STRANGER
    const items = await ctx.job.discover({ client: ctx.client, cfg: ctx.cfg, job: ctx.jobCfg, ledger: ctx.ledger, from })
    const target = ctx.job.target(ctx.cfg, ctx.jobCfg)
    if (items.length === 0) {
      process.stdout.write(`${DIM}nothing to simulate${OFF}\n`)
      ctx.ledger.close()
      return
    }
    const sims = await simulateEach(ctx.client, target, from, items)
    const price = await ctx.client.getGasPrice()
    for (const s of sims) {
      const cost = s.gas * price
      process.stdout.write(
        `${s.ok ? `${GREEN}ok  ${OFF}` : `${RED}no  ${OFF}`} ${s.item.label.padEnd(20)} ` +
          `gas ${formatEther(cost).padStart(12)} ${DIM}${s.reason ?? ''}${OFF}\n`
      )
    }
    if (sims.every((s) => !s.ok)) {
      const authority = ctx.job.authority ? await ctx.job.authority(ctx.client, ctx.cfg, ctx.jobCfg) : null
      const probe = await probeGating(ctx.client, target, items, STRANGER, authority)
      process.stdout.write(
        `\n${probe.kind === 'authority-gated' ? RED : DIM}gating probe: ${probe.kind}` +
          `${probe.authority ? ` (only ${probe.authority} gets through)` : ''}${OFF}\n`
      )
    }
    ctx.ledger.close()
  })

program
  .command('run')
  .description('one pass')
  .option('--live', 'actually send transactions', false)
  .action(async (opts: { live: boolean }) => {
    const ctx = ctxOf()
    if (opts.live) ctx.cfg.execution.dryRun = false
    const waiting = await standbyReason(ctx.client, ctx.cfg, ctx.job, ctx.jobCfg)
    if (waiting) {
      process.stdout.write(`${RED}standby${OFF}: ${waiting}\n`)
      ctx.ledger.close()
      return
    }
    const o = await runOnce(ctx)
    process.stdout.write(
      `seen ${o.seen} | candidates ${o.candidates} | simulated ok ${o.simulatedOk} | done ${o.done} | ` +
        `skipped ${o.skipped} | gas ${formatEther(o.gasWei)} | reward ${formatEther(o.rewardWei)}\n`
    )
    if (o.gatingWarning) process.stdout.write(`${RED}${o.gatingWarning}${OFF}\n`)
    if (o.stoppedBy) process.stdout.write(`${DIM}stopped by: ${o.stoppedBy}${OFF}\n`)
    ctx.ledger.close()
  })

program
  .command('start')
  .description('the loop, with the read-only API and the operator console')
  .option('--live', 'actually send transactions', false)
  .action(async (opts: { live: boolean }) => {
    const ctx = ctxOf()
    if (opts.live) ctx.cfg.execution.dryRun = false
    const api = startServer(ctx, 'public')
    const con = startServer(ctx, 'console')
    const bye = async () => {
      await api?.close()
      await con?.close()
      ctx.ledger.close()
      process.exit(0)
    }
    process.on('SIGINT', bye)
    process.on('SIGTERM', bye)
    log.info(
      { kind: ctx.cfg.agent.kind, cadence: ctx.cfg.runner.mode, dry: ctx.cfg.execution.dryRun, watchtower: ctx.cfg.watchtower },
      'starting'
    )
    await runForever(ctx)
  })

program
  .command('watch')
  .description('watchtower: measure the race without spending anything')
  .action(async () => {
    const ctx = ctxOf()
    ctx.cfg.watchtower = true
    ctx.cfg.execution.dryRun = true
    const api = startServer(ctx, 'public')
    process.on('SIGINT', async () => {
      await api?.close()
      ctx.ledger.close()
      process.exit(0)
    })
    log.info({ kind: ctx.cfg.agent.kind }, 'watching, nothing will be signed')
    await runForever(ctx)
  })

program
  .command('report')
  .description('the profit and loss of this agent')
  .action(() => {
    const ctx = ctxOf()
    const s = statsReport(ctx)
    process.stdout.write(
      `${s.agent.name} (${s.agent.kind}) on ${s.network.name}\n` +
        `jobs ${s.live.jobsDone} | earned ${s.live.earned} | burned ${s.live.burned} | net ${s.live.net} ${s.network.symbol}\n` +
        `last 24h: ${s.live.jobsDone24h} jobs, ${s.live.earned24h} earned\n` +
        `open now: ${s.live.openCount} worth ${s.live.openStake}\n\n`
    )
    if (s.skips.length) {
      process.stdout.write(`why nothing happened:\n`)
      for (const k of s.skips) process.stdout.write(`  ${String(k.count).padStart(5)} ${k.reason}\n`)
    }
    ctx.ledger.close()
  })

program
  .command('races')
  .description('the race book: who presses first, and what they pay')
  .action(() => {
    const ctx = ctxOf()
    const r = raceReport(ctx)
    if (r.all.total === 0) {
      process.stdout.write(
        `${DIM}no races recorded yet. Run "fleet watch" for a while: it measures the race without spending anything.${OFF}\n`
      )
      ctx.ledger.close()
      return
    }
    process.stdout.write(
      `races ${r.all.total} | won ${r.all.won} (${Math.round(r.all.winRate * 100)}%) | lost ${r.all.lost}\n` +
        `other bots seen: ${r.all.competitors}\n` +
        `median gas price - winners ${gwei(r.all.medianWinnerGasPrice)} gwei, us ${gwei(r.all.medianOurGasPrice)} gwei\n` +
        `saw it but did not send: ${r.all.wantedButNotSent}\n` +
        `median latency from seeing to signing: ${r.all.medianLatencyMs ?? '-'} ms\n\n`
    )
    for (const x of r.recent) {
      process.stdout.write(
        `${new Date(x.at * 1000).toISOString().slice(11, 19)} ` +
          `${x.winner === 'us' ? `${GREEN}WON ${OFF}` : `${RED}LOST${OFF}`} ${x.key.padEnd(14)} ` +
          `${x.winner === 'us' ? '' : x.winner.slice(0, 12)} ${DIM}${x.note ?? ''}${OFF}\n`
      )
    }
    ctx.ledger.close()
  })

program
  .command('init <address>')
  .description('read the verified ABI and propose the signatures for the config')
  .action(async (address: string) => {
    const ctx = ctxOf()
    const explorer = ctx.cfg.network.explorer
    if (!explorer) {
      process.stdout.write(`${RED}network.explorer is not set, there is nothing to ask${OFF}\n`)
      ctx.ledger.close()
      return
    }
    const d = await discoverAbi(explorer, address, ctx.cfg.agent.kind)
    if (!d.verified) {
      process.stdout.write(`${RED}no verified ABI for ${address}${OFF}\n`)
      ctx.ledger.close()
      return
    }
    process.stdout.write(`${d.name ?? 'contract'} ${DIM}${address}${OFF}\n\n`)
    const show = (title: string, list: typeof d.action) => {
      if (list.length === 0) return
      process.stdout.write(`${title}\n`)
      for (const c of list) {
        process.stdout.write(`  ${GREEN}${c.signature}${OFF}\n    ${DIM}${c.why.join('; ')}${OFF}\n`)
      }
      process.stdout.write('\n')
    }
    show('ACTION (job.action.signature)', d.action)
    show('VALUE  (job.pot / job.reward)', d.value)
    show('WHAT IS THERE TO DO (job.ready / job.discovery)', d.discovery)
    show('EVENT  (job.event.signature, the race book)', d.events)
    if (d.errors.length) {
      process.stdout.write(`ERRORS (target.errorSignatures)\n  ${d.errors.join('\n  ')}\n`)
    }
    ctx.ledger.close()
  })

program
  .command('backup')
  .description('a verified copy of the ledger')
  .option('--list', 'list the copies', false)
  .action((opts: { list: boolean }) => {
    const ctx = ctxOf()
    if (opts.list) {
      for (const f of listBackups(ctx.cfg.storage.backup.dir)) process.stdout.write(`${f}\n`)
      ctx.ledger.close()
      return
    }
    const r = backupOnce(ctx.ledger, ctx.cfg.storage.backup.dir, ctx.cfg.storage.backup.keep)
    process.stdout.write(`${r.file} ${r.bytes} bytes, integrity ${r.integrity}, ${JSON.stringify(r.rows)}\n`)
    ctx.ledger.close()
  })

program
  .command('stop')
  .description('write the kill switch: nothing gets signed until it is removed')
  .action(() => {
    const ctx = ctxOf()
    const file = ctx.cfg.execution.killSwitchFile
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `stopped from the cli at ${new Date().toISOString()}\n`)
    process.stdout.write(`stopped: ${file}\n`)
    ctx.ledger.close()
  })

program
  .command('go')
  .description('remove the kill switch')
  .action(() => {
    const ctx = ctxOf()
    const file = ctx.cfg.execution.killSwitchFile
    if (existsSync(file)) unlinkSync(file)
    process.stdout.write(`released: ${file}\n`)
    ctx.ledger.close()
  })

function gwei(wei: string): string {
  return (Number(wei) / 1e9).toFixed(2)
}

program.parseAsync(process.argv).catch((e) => {
  log.fatal({ err: (e as Error).message }, 'command failed')
  process.stdout.write(`${RED}${(e as Error).message}${OFF}\n`)
  process.exit(1)
})
