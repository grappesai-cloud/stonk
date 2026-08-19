/**
 * API-ul de citire. Il consuma landing page-ul, canalul si oricine vrea sa
 * verifice cifrele. Raspunde exact in forma pe care o asteapta site-ul, ca sa
 * nu existe doua adevaruri diferite despre aceleasi livrari.
 *
 * Nu are nicio ruta care scrie. Nu are autentificare pentru ca nu are ce sa
 * protejeze: totul de aici e deja public pe lant.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { formatEther } from 'viem'
import type { Ctx } from '../context.js'
import { wallPage } from './page.js'
import { serveFont } from '../ui/assets.js'
import { log } from '../log.js'

function json(res: ServerResponse, status: number, body: unknown, cors: string): void {
  const text = JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': cors,
    'cache-control': 'public, max-age=15',
    'x-content-type-options': 'nosniff'
  })
  res.end(text)
}

function eth(wei: bigint): number {
  return Number(formatEther(wei))
}

/**
 * Limitare simpla pe adresa IP, cu galeata care se goleste singura.
 * API-ul e public si citeste dintr-o baza locala: fara asta, un singur script
 * plictisit tine procesul ocupat degeaba.
 */
class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>()

  constructor(private perMinute: number) {}

  allow(ip: string): boolean {
    if (this.perMinute === 0) return true
    const now = Date.now()
    const e = this.hits.get(ip)
    if (!e || now > e.resetAt) {
      this.hits.set(ip, { count: 1, resetAt: now + 60_000 })
      if (this.hits.size > 5000) this.sweep(now)
      return true
    }
    e.count++
    return e.count <= this.perMinute
  }

  private sweep(now: number): void {
    for (const [k, v] of this.hits) if (now > v.resetAt) this.hits.delete(k)
  }
}

export function createApi(ctx: Ctx) {
  const { cfg, ledger } = ctx
  const allowed = cfg.api.cors
  const limiter = new RateLimiter(cfg.api.rateLimitPerMinute)

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const origin = req.headers.origin ?? '*'
    const cors = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0] ?? '*'

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': cors,
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-max-age': '86400'
      })
      res.end()
      return
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'GET only' }, cors)

    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ?? 'necunoscut'
    if (!limiter.allow(ip)) {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '60', 'access-control-allow-origin': cors })
      res.end(JSON.stringify({ error: 'too many requests' }))
      return
    }

    const url = new URL(req.url ?? '/', 'http://localhost')
    if (serveFont(url.pathname, res)) return
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 500)

    try {
      switch (url.pathname) {
        case '/health': {
          const block = await ctx.client.getBlockNumber()
          return json(res, 200, { ok: true, chainId: cfg.network.chainId, block, mode: cfg.policy.mode, dry: cfg.execution.dryRun }, cors)
        }

        /* peretele uitatilor, ca pagina */
        case '/': {
          res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'public, max-age=30',
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'no-referrer',
            'content-security-policy':
              "default-src 'none'; connect-src 'self'; font-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
          })
          res.end(wallPage(cfg))
          return
        }

        /* forma pe care o citeste landing page-ul */
        case '/stats': {
          const all = ledger.totals(0)
          const wall = ledger.wallTotals()
          const recent = ledger.recentDeliveries(8)
          return json(
            res,
            200,
            {
              stats: {
                jobs: all.deliveries,
                paid: eth(all.valueWei),
                agents: all.wallets,
                earned: eth(all.tipsWei),
                gas: eth(all.gasWei),
                unclaimedCount: wall.count,
                unclaimedValue: eth(wall.valueWei),
                oldestDays: wall.oldestDays
              },
              feed: recent.map((r) => [
                `COURIER #0000`,
                `DELIVER #${r.tokenId}`,
                `+${eth(r.valueWei).toFixed(4)} ${cfg.network.nativeSymbol}`
              ]),
              meta:
                wall.count > 0
                  ? `${wall.count} WALLETS STILL UNCLAIMED · OLDEST ${wall.oldestDays} DAYS`
                  : `NOTHING LEFT UNCLAIMED`,
              updatedAt: Math.floor(Date.now() / 1000)
            },
            cors
          )
        }

        /* peretele uitatilor */
        case '/wall': {
          const rows = ledger.wall(limit)
          const totals = ledger.wallTotals()
          return json(
            res,
            200,
            {
              count: totals.count,
              valueWei: totals.valueWei,
              valueEth: eth(totals.valueWei),
              oldestDays: totals.oldestDays,
              rows: rows.map((r) => ({
                tokenId: r.tokenId,
                wallet: r.wallet,
                owner: r.owner,
                valueEth: eth(r.valueWei),
                valueWei: r.valueWei,
                ageDays: r.ageDays
              }))
            },
            cors
          )
        }

        case '/feed': {
          const rows = ledger.recentDeliveries(limit)
          return json(
            res,
            200,
            {
              rows: rows.map((r) => ({
                tokenId: r.tokenId,
                wallet: r.wallet,
                valueEth: eth(r.valueWei),
                txHash: r.txHash,
                at: r.at,
                explorer: cfg.network.explorer && r.txHash ? `${cfg.network.explorer}/tx/${r.txHash}` : null
              }))
            },
            cors
          )
        }

        /* contul de profit si pierdere al agentului */
        case '/report': {
          const day = Math.floor(Date.now() / 1000) - 86400
          const week = Math.floor(Date.now() / 1000) - 7 * 86400
          const shape = (t: ReturnType<typeof ledger.totals>) => ({
            deliveries: t.deliveries,
            wallets: t.wallets,
            deliveredEth: eth(t.valueWei),
            earnedEth: eth(t.tipsWei),
            gasEth: eth(t.gasWei),
            netEth: eth(t.netWei)
          })
          return json(res, 200, { day: shape(ledger.totals(day)), week: shape(ledger.totals(week)), all: shape(ledger.totals(0)) }, cors)
        }

        default:
          return json(res, 404, { error: 'no such route' }, cors)
      }
    } catch (e) {
      log.error({ err: (e as Error).message, path: url.pathname }, 'api failed')
      return json(res, 500, { error: 'internal error' }, cors)
    }
  }

  return createServer((req, res) => {
    void handler(req, res)
  })
}

export function startApi(ctx: Ctx): ReturnType<typeof createServer> | null {
  if (!ctx.cfg.api.enabled) return null
  const server = createApi(ctx)
  server.listen(ctx.cfg.api.port, ctx.cfg.api.host, () => {
    log.info({ host: ctx.cfg.api.host, port: ctx.cfg.api.port }, 'api listening')
  })
  return server
}
