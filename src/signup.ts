/**
 * Lista de asteptare a site-ului.
 *
 * NU e un agent si nu are voie sa devina unul. Exista fiindca butonul
 * principal al paginii trebuie sa duca undeva, iar varianta obisnuita (un
 * serviciu de formulare la altcineva) cere un cont, o cheie si increderea ca
 * nu dispare maine. Aici sunt vreo suta de randuri si un fisier SQLite pe care
 * il putem citi oricand.
 *
 * E singurul loc din tot proiectul care primeste scriere de la un strain, deci
 * are si singurele masuri de acolo: corp mic, campuri mici, ritm limitat pe IP,
 * si nimic din ce se scrie nu ajunge vreodata interpretat ca HTML. Lista se
 * citeste doar cu jeton: sunt portofele si nume, nu numere de afisat.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { log } from './core/log.js'

const PORT = Number(process.env.SIGNUP_PORT ?? 8802)
const HOST = process.env.SIGNUP_HOST ?? '127.0.0.1'
const FILE = process.env.SIGNUP_DB ?? './data/signups.db'
const TOKEN = process.env.CONSOLE_TOKEN ?? ''
/** cate inscrieri acceptam de la acelasi IP intr-o ora */
const PER_HOUR = Number(process.env.SIGNUP_PER_HOUR ?? 5)
const MAX_BODY = 2048
/** caracterele de control nu ajuta pe nimeni si strica orice jurnal */
const CONTROL = new RegExp('[\\x00-\\x1f\\x7f]', 'g')

/** arata a portofel? nu verificam pe lant, doar forma */
export function cleanWallet(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) return s
  if (/^[a-zA-Z0-9-]{3,60}\.(eth|xyz|id)$/.test(s)) return s.toLowerCase()
  return null
}

export function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  return v.replace(CONTROL, '').trim().slice(0, max)
}

/**
 * Ritmul pe IP. Scos afara ca sa poata fi testat fara sa astepti o ora, si
 * fiindca un limitator netestat e o parere despre securitate, nu o masura.
 */
export function makeLimiter(perHour: number, now: () => number = Date.now) {
  const seen = new Map<string, number[]>()
  return (ip: string): boolean => {
    const t = now()
    const hour = t - 3_600_000
    const list = (seen.get(ip) ?? []).filter((x) => x > hour)
    if (list.length >= perHour) {
      seen.set(ip, list)
      return true
    }
    list.push(t)
    seen.set(ip, list)
    return false
  }
}

function json(res: ServerResponse, code: number, obj: unknown): void {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(obj))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    let done = false
    req.on('data', (c: Buffer) => {
      if (done) return
      size += c.length
      if (size > MAX_BODY) {
        done = true
        /* NU inchidem conexiunea aici: daca o rupem, raspunsul nostru nu mai
           ajunge si omul vede o eroare de retea in loc de un motiv. Doar
           oprim cititul si lasam raspunsul sa plece. */
        req.pause()
        reject(new Error('body too large'))
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function start() {
  mkdirSync(dirname(FILE), { recursive: true })
  const db = new DatabaseSync(FILE)
  db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet TEXT NOT NULL,
  handle TEXT,
  klass TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS signups_wallet ON signups(lower(wallet));
CREATE INDEX IF NOT EXISTS signups_created ON signups(created_at);
`)

  const limited = makeLimiter(PER_HOUR)

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const fwd = req.headers['x-forwarded-for']
    const ip =
      (typeof fwd === 'string' ? fwd.split(',')[0]?.trim() : undefined) ||
      (req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '')

    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' })
      return void res.end()
    }

    if (url.pathname === '/count' && req.method === 'GET') {
      const r = db.prepare('SELECT COUNT(*) AS c FROM signups').get() as { c: number }
      return json(res, 200, { count: r.c })
    }

    /* lista intreaga NU e publica */
    if (url.pathname === '/list' && req.method === 'GET') {
      const given = url.searchParams.get('token') ?? ''
      if (!TOKEN || given !== TOKEN) return json(res, 401, { error: 'bad token' })
      const rows = db.prepare('SELECT wallet, handle, klass, created_at FROM signups ORDER BY id DESC').all()
      return json(res, 200, { signups: rows })
    }

    if (url.pathname !== '/' || req.method !== 'POST') return json(res, 404, { error: 'not found' })

    if (limited(ip)) {
      log.warn({ ip }, 'signup rate limited')
      return json(res, 429, { ok: false, error: 'too many' })
    }

    readBody(req)
      .then((raw) => {
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(raw || '{}') as Record<string, unknown>
        } catch {
          return json(res, 400, { ok: false, error: 'bad json' })
        }
        const wallet = cleanWallet(parsed.wallet)
        if (!wallet) return json(res, 400, { ok: false, error: 'wallet does not look like an address' })
        const handle = cleanText(parsed.handle, 40)
        const klass = cleanText(parsed.klass, 40)
        try {
          db.prepare('INSERT INTO signups (wallet, handle, klass, ip, created_at) VALUES (?,?,?,?,?)').run(
            wallet,
            handle || null,
            klass || null,
            ip,
            Math.floor(Date.now() / 1000)
          )
          log.info({ wallet, klass }, 'signup')
        } catch {
          /* acelasi portofel de doua ori nu e eroare pentru om: tot pe lista e */
          log.debug({ wallet }, 'signup already there')
        }
        const c = (db.prepare('SELECT COUNT(*) AS c FROM signups').get() as { c: number }).c
        return json(res, 200, { ok: true, count: c })
      })
      .catch((e) => json(res, 413, { ok: false, error: (e as Error).message }))
  })

  server.listen(PORT, HOST, () => log.info({ host: HOST, port: PORT, file: FILE }, 'signup server listening'))
  return server
}

/* porneste doar cand fisierul e rulat, nu si cand il importa testele */
if (process.argv[1] && /signup\.(ts|js)$/.test(process.argv[1])) start()
