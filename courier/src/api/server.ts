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
import { agentPage, walletPage } from './pages.js'

/** doar bucata din ABI-ul colectiei de care are nevoie pagina publica */
const AGENT_ABI = [
  {
    type: 'function',
    name: 'snapshot',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'tokenOwner', type: 'address' },
      { name: 'wallet', type: 'address' },
      { name: 'walletBalance', type: 'uint256' },
      { name: 'role', type: 'uint8' },
      { name: 'nonce', type: 'uint64' }
    ]
  }
] as const
import { serveFont } from '../ui/assets.js'
import { healthOf } from '../health.js'
import { log } from '../log.js'

function htmlPage(res: ServerResponse, body: string): void {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'public, max-age=30',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy':
      "default-src 'none'; connect-src 'self'; font-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
  })
  res.end(body)
}

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

    /* rutele cu prefix se rezolva inaintea switch-ului: sunt mai usor de citit
       aici decat strecurate intr-un case cu expresie */
    try {
      if (url.pathname.startsWith('/a/')) return htmlPage(res, agentPage(cfg))
      if (url.pathname.startsWith('/w/')) return htmlPage(res, walletPage(cfg))
      if (url.pathname.startsWith('/api/agent/')) {
        const raw = decodeURIComponent(url.pathname.slice('/api/agent/'.length))
        const id = Number(raw)
        if (!Number.isInteger(id) || id < 0) return json(res, 400, { error: 'invalid agent id' }, cors)
        const t = ledger.agentTotals(id)

        /* daca colectia e desfasurata, adevarul despre bucata vine de pe lant,
           nu din configurare: proprietar, rol, portofel si soldul lui */
        let onchain: { owner: string; wallet: string; walletEth: number; role: number; nonce: string } | null = null
        if (cfg.agent.collection) {
          try {
            const snap = (await ctx.client.readContract({
              address: cfg.agent.collection,
              abi: AGENT_ABI,
              functionName: 'snapshot',
              args: [BigInt(id)]
            })) as [string, string, bigint, number, bigint]
            onchain = {
              owner: snap[0],
              wallet: snap[1],
              walletEth: eth(snap[2]),
              role: snap[3],
              nonce: snap[4].toString()
            }
          } catch {
            /* bucata poate sa nu existe inca; pagina merge si fara */
          }
        }

        return json(
          res,
          200,
          {
            id,
            name: cfg.agent.id === id ? cfg.agent.name : `AGENT #${String(id).padStart(4, '0')}`,
            wallet: onchain?.wallet ?? (cfg.agent.id === id ? cfg.agent.wallet : null),
            onchain,
            deliveries: t.deliveries,
            wallets: t.wallets,
            deliveredEth: eth(t.valueWei),
            earnedEth: eth(t.tipsWei),
            gasEth: eth(t.gasWei),
            netEth: eth(t.netWei),
            firstAt: t.firstAt,
            lastAt: t.lastAt,
            history: ledger.agentHistory(id, 20).map((h) => ({
              tokenId: h.tokenId,
              valueEth: eth(h.valueWei),
              at: h.at,
              txHash: h.txHash
            }))
          },
          cors
        )
      }
      if (url.pathname.startsWith('/api/wallet/')) {
        const raw = decodeURIComponent(url.pathname.slice('/api/wallet/'.length))
        if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) return json(res, 400, { error: 'invalid address' }, cors)
        const v = ledger.walletView(raw, limit)
        return json(
          res,
          200,
          {
            address: raw,
            pendingEth: eth(v.pending.reduce((s2, p) => s2 + p.valueWei, 0n)),
            pending: v.pending.map((p) => ({
              tokenId: p.tokenId,
              wallet: p.wallet,
              valueEth: eth(p.valueWei),
              ageDays: p.ageDays
            })),
            delivered: { count: v.delivered.count, valueEth: eth(v.delivered.valueWei), lastAt: v.delivered.lastAt },
            history: v.history.map((h) => ({ tokenId: h.tokenId, valueEth: eth(h.valueWei), at: h.at, txHash: h.txHash }))
          },
          cors
        )
      }

      switch (url.pathname) {
        /* Sondajul containerului si al oricarui monitor din afara. Raspunde 503
           cand nu s-a mai terminat nicio rulare de prea mult timp: un proces
           care raspunde vesel 200 in timp ce nu mai scaneaza nimic e cel mai
           scump fel de a fi picat. */
        case '/health': {
          let block: string | null = null
          let chainOk = true
          try {
            block = String(await ctx.client.getBlockNumber())
          } catch {
            chainOk = false
          }
          const h = healthOf(ledger.lastFinishedRunAt(), cfg)
          /* in asteptare nu se termina rulari, deci vechimea nu inseamna nimic:
             procesul e sanatos, ii lipsesc adresele */
          const ok = chainOk && (!h.stale || ctx.control.standby !== null)
          return json(
            res,
            ok ? 200 : 503,
            {
              ok,
              chainId: cfg.network.chainId,
              chainOk,
              block,
              mode: cfg.watchtower ? 'watchtower' : cfg.policy.mode,
              dry: cfg.execution.dryRun,
              standby: ctx.control.standby,
              lastRunAt: h.lastRunAt,
              ageSec: h.ageSec,
              staleAfterSec: h.staleAfterSec,
              stale: h.stale
            },
            cors
          )
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

        case '/leaderboard': {
          return json(
            res,
            200,
            {
              rows: ledger.leaderboard(20).map((r) => ({
                agentId: r.agentId,
                deliveries: r.deliveries,
                deliveredEth: eth(r.valueWei),
                earnedEth: eth(r.tipsWei)
              }))
            },
            cors
          )
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
  /* In container, 127.0.0.1 inseamna "nimeni nu ma vede", nici macar proxy-ul
     care publica portul. De aia mediul bate configurarea aici: docker-compose
     pune API_HOST=0.0.0.0, iar granita ramane tot pe gazda, unde portul e
     publicat doar pe loopback. */
  const host = process.env.API_HOST || ctx.cfg.api.host
  server.listen(ctx.cfg.api.port, host, () => {
    log.info({ host, port: ctx.cfg.api.port }, 'api listening')
  })
  return server
}
