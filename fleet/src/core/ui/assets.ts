/**
 * Fisierele statice ale temei: fonturile, aceleasi cu ale site-ului.
 * Servite de aici ca peretele si consola sa arate la fel ca site-ul chiar si
 * pe o masina fara ele instalate.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ServerResponse } from 'node:http'

const HERE = dirname(fileURLToPath(import.meta.url))
/** din dist/src/ui sau src/ui, radacina proiectului e doua sau trei niveluri mai sus */
const ROOTS = [resolve(HERE, '../../..'), resolve(HERE, '../..'), process.cwd()]

const cache = new Map<string, Buffer>()

export function fontFile(name: string): Buffer | null {
  const safe = basename(name)
  if (!/^[a-z0-9._-]+\.woff2$/i.test(safe)) return null
  const hit = cache.get(safe)
  if (hit) return hit
  for (const root of ROOTS) {
    const p = join(root, 'assets', 'fonts', safe)
    if (existsSync(p)) {
      const buf = readFileSync(p)
      cache.set(safe, buf)
      return buf
    }
  }
  return null
}

/** intoarce true daca a servit ceva */
export function serveFont(pathname: string, res: ServerResponse): boolean {
  if (!pathname.startsWith('/fonts/')) return false
  const buf = fontFile(pathname.slice('/fonts/'.length))
  if (!buf) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('nu exista')
    return true
  }
  res.writeHead(200, {
    'content-type': 'font/woff2',
    /* fonturile nu se schimba niciodata sub acelasi nume */
    'cache-control': 'public, max-age=31536000, immutable',
    'content-length': String(buf.length)
  })
  res.end(buf)
  return true
}
