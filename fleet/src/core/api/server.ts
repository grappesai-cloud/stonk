/**
 * Doua servere din acelasi fisier, si diferenta dintre ele e o regula de
 * securitate, nu o comoditate:
 *
 *  - PUBLIC: strict citire. Daca ajunge cineva la el, nu are ce sa faca cu el.
 *  - CONSOLA: pe alt port, legata pe loopback, cu jeton obligatoriu, si exact
 *    doua actiuni care scriu: opreste si porneste. Amandoua inseamna acelasi
 *    lucru: fisierul de oprire.
 *
 * Capcana platita o data la Courier: legarea pe 127.0.0.1 INAUNTRUL unui
 * container ascunde serverul si de proxy-ul care publica portul. De aia
 * API_HOST si CONSOLE_HOST din mediu bat configurarea.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { formatEther } from 'viem'
import type { Ctx } from '../context.js'
import { healthOf } from '../health.js'
import { log } from '../log.js'
import { statusPage } from './page.js'

export interface ServerHandle {
  close: () => Promise<void>
  port: number
}

interface Bucket {
  count: number
  resetAt: number
}

export function startServer(ctx: Ctx, mode: 'public' | 'console'): ServerHandle | null {
  const cfg = ctx.cfg
  const conf = mode === 'public' ? cfg.api : cfg.console
  if (!conf.enabled) return null
  const host = (mode === 'public' ? process.env.API_HOST : process.env.CONSOLE_HOST) ?? conf.host
  const token = mode === 'console' ? cfg.console.token : null
  if (mode === 'console' && !token) {
    log.error('console is enabled but CONSOLE_TOKEN is empty; refusing to open an unguarded control port')
    return null
  }

  const buckets = new Map<string, Bucket>()
  const limited = (ip: string): boolean => {
    const per = cfg.api.rateLimitPerMinute
    if (mode === 'console' || per === 0) return false
    const now = Date.now()
    const b = buckets.get(ip)
    if (!b || now > b.resetAt) {
      buckets.set(ip, { count: 1, resetAt: now + 60_000 })
      return false
    }
    b.count++
    return b.count > per
  }

  const server = createServer((req, res) => {
    handle(ctx, mode, token, req, res, limited).catch((e) => {
      log.error({ err: (e as Error).message }, 'request failed')
      json(res, 500, { error: 'internal' })
    })
  })
  server.listen(conf.port, host)
  log.info({ mode, host, port: conf.port }, 'server listening')
  return {
    port: conf.port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

async function handle(
  ctx: Ctx,
  mode: 'public' | 'console',
  token: string | null,
  req: IncomingMessage,
  res: ServerResponse,
  limited: (ip: string) => boolean
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const ip = (req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '')
  if (limited(ip)) return json(res, 429, { error: 'slow down' })

  if (mode === 'public') {
    const origins = ctx.cfg.api.cors
    res.setHeader('access-control-allow-origin', origins.includes('*') ? '*' : origins.join(','))
    res.setHeader('access-control-allow-methods', 'GET, OPTIONS')
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return void res.end()
  }

  if (mode === 'console') {
    const given = url.searchParams.get('token') ?? (req.headers['x-token'] as string | undefined) ?? ''
    if (!token || given !== token) return json(res, 401, { error: 'bad token' })
  }

  const path = url.pathname

  if (path === '/health') {
    const h = healthOf(ctx.ledger.lastFinishedAt(), ctx.cfg)
    const standby = ctx.control.standby
    const ok = standby !== null || !h.stale
    return json(res, ok ? 200 : 503, {
      status: standby !== null ? 'standby' : h.stale ? 'stale' : 'ok',
      standby,
      lastRunAt: h.lastRunAt,
      ageSec: h.ageSec,
      staleAfterSec: h.staleAfterSec,
      agent: ctx.cfg.agent.name,
      kind: ctx.cfg.agent.kind
    })
  }

  if (path === '/stats') return json(res, 200, stats(ctx))
  /**
   * Cifrele pentru pagina publica, in forma pe care o citeste ea.
   *
   * Exista separat de `/stats` dinadins: pagina nu trebuie sa stie cum arata
   * registrul nostru, iar noi nu trebuie sa ne temem ca o schimbare interna
   * strica site-ul. Si tot ce iese pe aici e masurat: daca nu s-a livrat nimic,
   * scrie zero, nu o cifra frumoasa.
   */
  if (path === '/site') return json(res, 200, sitePayload(ctx))
  if (path === '/races') return json(res, 200, races(ctx))
  if (path === '/open') {
    return json(res, 200, {
      open: ctx.ledger.openList(100).map((o) => ({
        key: o.key,
        label: o.label,
        stake: formatEther(o.stakeWei),
        reward: formatEther(o.rewardWei),
        ageSec: o.ageSec
      }))
    })
  }

  if (mode === 'console' && req.method === 'POST') {
    const file = ctx.cfg.execution.killSwitchFile
    if (path === '/stop') {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, `stopped from console at ${new Date().toISOString()}\n`)
      log.warn({ file }, 'stopped from console')
      return json(res, 200, { stopped: true, file })
    }
    if (path === '/go') {
      if (existsSync(file)) unlinkSync(file)
      log.warn({ file }, 'released from console')
      return json(res, 200, { stopped: false, file })
    }
    if (path === '/run') {
      const dry = url.searchParams.get('dry') !== '0'
      const accepted = ctx.control.request(dry)
      return json(res, accepted ? 200 : 409, { accepted, dry })
    }
  }

  if (path === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    return void res.end(statusPage(ctx, mode))
  }

  return json(res, 404, { error: 'not found' })
}

export function stats(ctx: Ctx) {
  const { ledger, cfg } = ctx
  const all = ledger.totals()
  const day = ledger.totals(Math.floor(Date.now() / 1000) - 86400)
  const open = ledger.openTotals()
  const h = healthOf(ledger.lastFinishedAt(), cfg)
  return {
    agent: { name: cfg.agent.name, kind: cfg.agent.kind, id: cfg.agent.id, wallet: cfg.agent.wallet },
    network: { name: cfg.network.name, chainId: cfg.network.chainId, symbol: cfg.network.nativeSymbol },
    mode: cfg.watchtower ? 'watchtower' : cfg.policy.mode,
    dryRun: cfg.execution.dryRun,
    /* siguranta manuala, citita de pe disc la fiecare cerere: cine intreaba
       trebuie sa afle starea de ACUM, nu pe cea de la pornirea procesului */
    stopped: existsSync(cfg.execution.killSwitchFile),
    standby: ctx.control.standby,
    health: { lastRunAt: h.lastRunAt, ageSec: h.ageSec, stale: h.stale },
    live: {
      jobsDone: all.done,
      earned: formatEther(all.rewardWei),
      burned: formatEther(all.gasWei),
      net: formatEther(all.netWei),
      jobsDone24h: day.done,
      earned24h: formatEther(day.rewardWei),
      openCount: open.count,
      openStake: formatEther(open.stakeWei)
    },
    feed: ledger.recentEvents(20).map((e) => ({
      at: e.at,
      kind: e.kind,
      label: e.label || e.key,
      reward: formatEther(e.rewardWei),
      reason: e.reason,
      txHash: e.txHash
    })),
    runs: ledger.recentRuns(8).map((r) => ({
      id: r.id,
      at: r.startedAt,
      done: r.done,
      candidates: r.candidates,
      seen: r.seen,
      gas: formatEther(r.gasWei),
      reward: formatEther(r.rewardWei),
      dry: r.dry,
      note: r.note
    })),
    skips: ledger.skipReasons(Math.floor(Date.now() / 1000) - 86400)
  }
}

/** cati brokeri a atins un lot: cheia e `drop:<primul>:<cati>` */
function brokersOf(key: string): number {
  const parts = key.split(':')
  const n = Number(parts[2])
  return Number.isFinite(n) ? n : 0
}

export function sitePayload(ctx: Ctx) {
  const { ledger, cfg } = ctx
  const all = ledger.totals()
  const open = ledger.openTotals()
  const openList = ledger.openList(500)
  const events = ledger.recentEvents(60)
  const done = events.filter((e) => e.kind === 'work')

  const brokersReached = done.reduce((s, e) => s + brokersOf(e.key), 0)
  const brokersWaiting = openList.reduce((s, o) => s + brokersOf(o.key), 0)

  /* fluxul: ce s-a facut chiar acum, in cuvintele agentului */
  const feed = events.slice(0, 8).map((e) => {
    const who = cfg.agent.name
    const what = e.label || e.key
    if (e.kind === 'work') return `${who} · ${what} · DONE`
    if (e.kind === 'dry') return `${who} · ${what} · READY`
    if (e.kind === 'fail') return `${who} · ${what} · FAILED`
    return `${who} · ${what} · ${(e.reason ?? 'skipped').split(':')[0]!.toUpperCase()}`
  })

  const last = ledger.lastFinishedRun()
  const meta =
    ctx.control.standby !== null
      ? ctx.control.standby.toUpperCase()
      : brokersWaiting > 0
        ? `${open.count} BATCHES WAITING · ${brokersWaiting} BROKERS UNPAID`
        : 'NOTHING UNCLAIMED RIGHT NOW'

  return {
    stats: {
      jobs: all.done,
      agents: brokersReached,
      unclaimedCount: open.count,
      brokersWaiting
    },
    feed,
    meta,
    /* ca sa se vada din afara ca nu e o poza: cand a fost ultima masuratoare */
    measuredAt: ledger.lastFinishedAt(),
    /* din ultima rulare TERMINATA: una in curs are zerouri si ar arata ca o
       flota care nu vede nimic */
    lastRun: last,
    live: !ctx.cfg.watchtower && !ctx.cfg.execution.dryRun
  }
}

export function races(ctx: Ctx) {
  const s = ctx.ledger.raceStats()
  const day = ctx.ledger.raceStats(Math.floor(Date.now() / 1000) - 86400)
  return {
    all: {
      total: s.total,
      won: s.won,
      lost: s.lost,
      winRate: s.winRate,
      wantedButNotSent: s.wantedButNotSent,
      competitors: s.competitors,
      medianWinnerGasPrice: s.medianWinnerGasPriceWei.toString(),
      medianOurGasPrice: s.medianOurGasPriceWei.toString(),
      medianLatencyMs: s.medianLatencyMs
    },
    last24h: { total: day.total, won: day.won, winRate: day.winRate, competitors: day.competitors },
    recent: ctx.ledger.recentRaces(25).map((r) => ({
      at: r.at,
      key: r.key,
      winner: r.winner,
      wanted: r.wanted,
      sent: r.sent,
      winnerGasPrice: r.winnerGasPriceWei.toString(),
      ourGasPrice: r.ourGasPriceWei.toString(),
      blocksLate: r.blocksLate,
      txHash: r.txHash,
      note: r.note
    }))
  }
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body, null, 2))
}
