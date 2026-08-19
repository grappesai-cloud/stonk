/**
 * Consola de operator, pe portul ei.
 *
 * Regula de arhitectura: API-ul public ramane STRICT citire, iar tot ce scrie
 * sta aici, in spatele unui jeton, legat implicit pe 127.0.0.1. Si aici scriu
 * doar doua lucruri, si amandoua inseamna acelasi fisier: opreste si porneste.
 * Nu atinge chei, nu semneaza, nu schimba politici, nu muta bani.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { timingSafeEqual } from 'node:crypto'
import { formatEther } from 'viem'
import type { Ctx } from '../context.js'
import { consolePage, loginPage } from './page.js'
import { log } from '../log.js'

const COOKIE = 'courier_console'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

function cookieOf(req: IncomingMessage, name: string): string | null {
  const raw = req.headers.cookie
  if (!raw) return null
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex, nofollow',
    'content-security-policy':
      "default-src 'none'; connect-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'"
  })
  res.end(body)
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
}

const eth = (wei: bigint): number => Number(formatEther(wei))

export function createConsole(ctx: Ctx) {
  const { cfg, ledger } = ctx
  const token = cfg.console.token
  const killFile = cfg.execution.killSwitchFile

  const authed = (req: IncomingMessage): boolean => {
    if (!token) return false
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (bearer && safeEqual(bearer, token)) return true
    const c = cookieOf(req, COOKIE)
    return !!c && safeEqual(c, token)
  }

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost')

    if (!token) {
      return html(res, 503, loginPage().replace('Jetonul de operator.', 'Nu e configurat niciun jeton (console.token).'))
    }

    /* intrarea cu jeton in adresa: se pune in cookie si se scoate din bara */
    const q = url.searchParams.get('token')
    if (q) {
      if (!safeEqual(q, token)) return html(res, 401, loginPage())
      res.writeHead(302, {
        'set-cookie': `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`,
        location: '/'
      })
      res.end()
      return
    }

    if (url.pathname === '/login') return html(res, 200, loginPage())

    if (!authed(req)) {
      if (url.pathname.startsWith('/api/')) return json(res, 401, { error: 'jeton lipsa' })
      return html(res, 401, loginPage())
    }

    if (url.pathname === '/') return html(res, 200, consolePage())

    if (url.pathname === '/api/state' && req.method === 'GET') {
      const now = Math.floor(Date.now() / 1000)
      const day = ledger.totals(now - 86400)
      const all = ledger.totals(0)
      const wall = ledger.wallTotals()

      let block: string | null = null
      let balanceWei = 0n
      try {
        block = String(await ctx.client.getBlockNumber())
        if (ctx.account) balanceWei = await ctx.client.getBalance({ address: ctx.account.address })
      } catch {
        /* lantul poate fi jos; consola trebuie sa mearga oricum */
      }

      const shape = (t: ReturnType<typeof ledger.totals>) => ({
        deliveries: t.deliveries,
        wallets: t.wallets,
        deliveredEth: eth(t.valueWei),
        earnedEth: eth(t.tipsWei),
        gasEth: eth(t.gasWei),
        netEth: eth(t.netWei)
      })

      return json(res, 200, {
        paused: existsSync(killFile),
        dryRun: cfg.execution.dryRun,
        mode: cfg.policy.mode,
        symbol: cfg.network.nativeSymbol,
        chainId: cfg.network.chainId,
        explorer: cfg.network.explorer ?? '',
        block,
        operator: ctx.account?.address ?? null,
        operatorBalanceEth: eth(balanceWei),
        operatorLow: cfg.alerts.telegram.gasLowWei > 0n && balanceWei < cfg.alerts.telegram.gasLowWei,
        day: shape(day),
        all: shape(all),
        wall: { count: wall.count, valueEth: eth(wall.valueWei), oldestDays: wall.oldestDays },
        runs: ledger.recentRuns(10).map((r) => ({
          id: r.id,
          startedAt: r.startedAt,
          mode: r.mode,
          dry: r.dry,
          scanned: r.scanned,
          candidates: r.candidates,
          delivered: r.delivered,
          gasEth: eth(r.gasWei),
          tipsEth: eth(r.tipsWei),
          note: r.note
        })),
        skips: ledger.skipReasons(now - 7 * 86400),
        deliveries: ledger.recentDeliveries(10).map((d) => ({
          tokenId: d.tokenId,
          wallet: d.wallet,
          at: d.at,
          valueEth: eth(d.valueWei)
        }))
      })
    }

    if (req.method === 'POST' && (url.pathname === '/api/pause' || url.pathname === '/api/resume')) {
      const pause = url.pathname === '/api/pause'
      try {
        if (pause) {
          mkdirSync(dirname(killFile), { recursive: true })
          writeFileSync(killFile, `oprit din consola la ${new Date().toISOString()}\n`)
        } else {
          rmSync(killFile, { force: true })
        }
        log.warn({ pause }, pause ? 'oprit din consola' : 'pornit din consola')
        return json(res, 200, { ok: true, paused: existsSync(killFile) })
      } catch (e) {
        return json(res, 500, { error: (e as Error).message })
      }
    }

    return json(res, 404, { error: 'ruta inexistenta' })
  }

  return createServer((req, res) => {
    void handler(req, res).catch((e) => {
      log.error({ err: (e as Error).message }, 'consola a picat')
      if (!res.headersSent) json(res, 500, { error: 'eroare interna' })
    })
  })
}

export function startConsole(ctx: Ctx): ReturnType<typeof createServer> | null {
  if (!ctx.cfg.console.enabled) return null
  if (!ctx.cfg.console.token) {
    log.error('consola e pornita dar nu are jeton; nu o expun fara jeton')
    return null
  }
  const server = createConsole(ctx)
  server.listen(ctx.cfg.console.port, ctx.cfg.console.host, () => {
    log.info({ host: ctx.cfg.console.host, port: ctx.cfg.console.port }, 'consola de operator pornita')
  })
  return server
}
