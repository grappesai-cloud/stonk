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
import { serveFont } from '../ui/assets.js'
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
      "default-src 'none'; connect-src 'self'; font-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'"
  })
  res.end(body)
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
}

const eth = (wei: bigint): number => Number(formatEther(wei))

/** media reala de gaz pe livrare; daca nu exista istoric, o estimare declarata */
function estimateGas(ledger: Ctx['ledger'], gasPriceWei: bigint): bigint {
  const totals = ledger.totals(0)
  if (totals.deliveries === 0 || totals.gasWei === 0n) return gasPriceWei * 300_000n
  return totals.gasWei / BigInt(totals.deliveries)
}

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

    /* fonturile se servesc si fara jeton: sunt doar fisiere de font, iar
       ecranul de intrare are nevoie de ele ca sa arate a produsul nostru */
    if (serveFont(url.pathname, res)) return

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
      let latencyMs: number | null = null
      let gasPriceWei = 0n
      try {
        const t0 = Date.now()
        block = String(await ctx.client.getBlockNumber())
        latencyMs = Date.now() - t0
        gasPriceWei = await ctx.client.getGasPrice()
        if (ctx.account) balanceWei = await ctx.client.getBalance({ address: ctx.account.address })
      } catch {
        /* lantul poate fi jos; consola trebuie sa mearga oricum */
      }

      /* cat ar costa sa golim toata restanta la gazul de acum: media reala din
         livrarile facute, iar daca nu exista istoric, o estimare declarata */
      const avgGasWei = estimateGas(ledger, gasPriceWei)

      const shape = (t: ReturnType<typeof ledger.totals>) => ({
        deliveries: t.deliveries,
        wallets: t.wallets,
        deliveredEth: eth(t.valueWei),
        earnedEth: eth(t.tipsWei),
        gasEth: eth(t.gasWei),
        netEth: eth(t.netWei)
      })

      const wallTotals = wall
      const backlogCostWei = avgGasWei * BigInt(wallTotals.count)

      return json(res, 200, {
        watchtower: cfg.watchtower,
        paused: existsSync(killFile),
        running: ctx.control.running,
        canRun: ctx.control.attached,
        nextRunAt: ctx.control.nextRunAt,
        lastRunAt: ledger.lastRunAt(),
        intervalSec: cfg.runner.intervalSec,
        latencyMs,
        gasPriceWei,
        backlogCostEth: eth(backlogCostWei),
        perDeliveryEth: eth(avgGasWei),
        series: ledger.dailySeries(7).map((d) => ({
          day: d.day,
          deliveries: d.deliveries,
          valueEth: eth(d.valueWei),
          earnedEth: eth(d.tipsWei),
          gasEth: eth(d.gasWei),
          netEth: eth(d.tipsWei - d.gasWei)
        })),
        topOwners: ledger.topOwners(4).map((o) => ({ owner: o.owner, wallets: o.wallets, valueEth: eth(o.valueWei) })),
        lastOutcome: ctx.control.lastOutcome
          ? {
              dry: ctx.control.lastOutcome.dry,
              at: ctx.control.lastOutcome.at,
              delivered: ctx.control.lastOutcome.delivered,
              found: ctx.control.lastOutcome.found,
              candidates: ctx.control.lastOutcome.candidates,
              valueEth: eth(ctx.control.lastOutcome.valueWei),
              gasEth: eth(ctx.control.lastOutcome.gasWei),
              tipsEth: eth(ctx.control.lastOutcome.tipsWei),
              stoppedBy: ctx.control.lastOutcome.stoppedBy
            }
          : null,
        dryRun: cfg.execution.dryRun,
        mode: cfg.policy.mode,
        symbol: cfg.network.nativeSymbol,
        chainId: cfg.network.chainId,
        explorer: cfg.network.explorer ?? '',
        block,
        operator: ctx.account?.address ?? null,
        operatorBalanceEth: eth(balanceWei),
        /* rosu inseamna "e o problema", nu "nu e configurat". Fara cheie de
           operator nu exista sold scazut, exista doar lipsa cheii. */
        operatorLow: !!ctx.account && cfg.alerts.telegram.gasLowWei > 0n && balanceWei < cfg.alerts.telegram.gasLowWei,
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
        finds: ledger.recentFinds(14).map((f) => ({
          at: f.at,
          tokenId: f.tokenId,
          wallet: f.wallet,
          valueEth: eth(f.valueWei)
        })),
        events: ledger.recentEvents(14).map((e) => ({
          at: e.at,
          kind: e.kind,
          tokenId: e.tokenId,
          wallet: e.wallet,
          valueEth: eth(e.valueWei),
          tipEth: eth(e.tipWei),
          reason: e.reason
        })),
        deliveries: ledger.recentDeliveries(10).map((d) => ({
          tokenId: d.tokenId,
          wallet: d.wallet,
          at: d.at,
          valueEth: eth(d.valueWei)
        }))
      })
    }

    /* a treia actiune care scrie, si singura care nu atinge fisierul de oprire:
       cere buclei o rulare. Nu semneaza nimic ea insasi, doar ridica un steag
       pe care bucla il vede. Cu ?dry=1 cere explicit o rulare uscata. */
    if (req.method === 'POST' && url.pathname === '/api/run') {
      const dry = url.searchParams.get('dry') === '1'
      if (!ctx.control.attached) {
        return json(res, 409, { error: 'nu ruleaza nicio bucla; porneste cu `courier start`' })
      }
      if (ctx.control.running) return json(res, 409, { error: 'deja ruleaza' })
      const ok = ctx.control.request(dry)
      log.warn({ dry }, 'rulare ceruta din consola')
      return json(res, ok ? 200 : 409, { ok, dry })
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
