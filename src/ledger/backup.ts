/**
 * Copia de siguranta a registrului.
 *
 * Registrul e produsul: daca se pierde discul, se pierde toata dovada ca
 * agentul a livrat vreodata ceva, adica exact cifra din care se decide
 * supply-ul si pretul. De aia copia nu e optionala si de aia se verifica.
 *
 * Se foloseste VACUUM INTO, nu o copiere de fisier: SQLite scrie in WAL, iar
 * un `cp` peste o baza vie da un fisier care pare in regula si e rupt. VACUUM
 * INTO produce o copie consistenta fara sa opreasca botul.
 *
 * O copie neverificata nu e o copie. Dupa fiecare scriere, fisierul se
 * deschide din nou, i se cere integrity_check si i se numara randurile.
 * Daca ceva nu e in regula, fisierul se sterge pe loc, ca sa nu ramana in
 * folder o copie in care ai incredere degeaba.
 */
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Ledger } from './db.js'

const PREFIX = 'courier-'
const SUFFIX = '.db'

/** tabelele care doar cresc: acolo o copie cu mai putine randuri decat sursa e o problema */
const APPEND_ONLY = ['runs', 'deliveries'] as const
const EXPECTED_TABLES = ['runs', 'deliveries', 'claims', 'watchers', 'kv'] as const

export interface BackupResult {
  file: string
  bytes: number
  integrity: string
  rows: Record<string, number>
  pruned: string[]
  ms: number
}

export class BackupError extends Error {}

function stamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  )
}

/** deschide o copie fara sa o poata strica; daca versiunea de Node nu stie de readOnly, tot merge */
function openForCheck(file: string): DatabaseSync {
  try {
    return new DatabaseSync(file, { readOnly: true })
  } catch {
    return new DatabaseSync(file)
  }
}

function countRows(db: DatabaseSync, table: string): number {
  const r = db.prepare(`SELECT count(*) AS c FROM ${table}`).get() as { c: number }
  return r?.c ?? 0
}

function tablesOf(db: DatabaseSync): Set<string> {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
  return new Set(rows.map((r) => r.name))
}

/**
 * Scrie o copie noua, o verifica, apoi sterge copiile vechi peste `keep`.
 * Arunca daca verificarea nu trece. Nu inghite erori: o copie stricata pe
 * tacute e mai rea decat lipsa ei.
 */
export function backupOnce(ledger: Ledger, dir: string, keep: number, now = new Date()): BackupResult {
  const t0 = Date.now()
  mkdirSync(dir, { recursive: true })

  const src = ledger.raw()
  const before: Record<string, number> = {}
  for (const t of APPEND_ONLY) before[t] = countRows(src, t)

  let file = join(dir, `${PREFIX}${stamp(now)}${SUFFIX}`)
  for (let i = 1; existsSync(file); i++) file = join(dir, `${PREFIX}${stamp(now)}-${i}${SUFFIX}`)

  /* apostroful e singurul caracter care poate rupe literalul de mai jos */
  src.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)

  const after: Record<string, number> = {}
  for (const t of APPEND_ONLY) after[t] = countRows(src, t)

  const rows: Record<string, number> = {}
  let integrity = 'unknown'
  let copy: DatabaseSync | null = null
  try {
    copy = openForCheck(file)
    const check = copy.prepare('PRAGMA integrity_check').get() as { integrity_check?: string }
    integrity = check?.integrity_check ?? 'unknown'
    if (integrity !== 'ok') throw new BackupError(`integrity check said "${integrity}"`)

    const have = tablesOf(copy)
    for (const t of EXPECTED_TABLES) {
      if (!have.has(t)) throw new BackupError(`table ${t} is missing from the copy`)
      rows[t] = countRows(copy, t)
    }

    /* Sursa e vie in timpul copierii, deci egalitatea exacta ar fi o iluzie.
       Dar tabelele care doar cresc nu au voie sa aiba in copie mai putin decat
       avea sursa inainte de copiere, nici mai mult decat are dupa. */
    for (const t of APPEND_ONLY) {
      const got = rows[t] ?? 0
      const was = before[t] ?? 0
      const now = after[t] ?? 0
      if (got < was) throw new BackupError(`${t}: copy has ${got} rows, source had ${was} before the copy`)
      if (got > now) throw new BackupError(`${t}: copy has ${got} rows, source has only ${now}`)
    }
  } catch (e) {
    copy?.close()
    /* o copie in care nu am incredere nu ramane pe disc sub un nume linistitor */
    try {
      unlinkSync(file)
    } catch {
      /* daca nici sters nu se poate, macar eroarea de mai jos spune de ce */
    }
    throw e instanceof BackupError ? e : new BackupError((e as Error).message)
  }
  copy.close()

  const bytes = statSync(file).size
  const pruned = prune(dir, keep, file)
  ledger.kvSet('backup.last', String(Math.floor(now.getTime() / 1000)))
  ledger.kvSet('backup.lastFile', file)

  return { file, bytes, integrity, rows, pruned, ms: Date.now() - t0 }
}

/** pastreaza cele mai noi `keep` copii, sterge restul; niciodata pe cea tocmai scrisa */
export function prune(dir: string, keep: number, protect?: string): string[] {
  if (keep <= 0) return []
  const files = listBackups(dir)
  const doomed = files.slice(keep).filter((f) => f !== protect)
  const pruned: string[] = []
  for (const f of doomed) {
    try {
      unlinkSync(f)
      pruned.push(f)
    } catch {
      /* un fisier care nu se lasa sters nu e motiv sa cada rularea */
    }
  }
  return pruned
}

/** copiile din folder, cea mai noua prima */
export function listBackups(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(SUFFIX))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
}

/** a trecut destul de la ultima copie? */
export function backupDue(ledger: Ledger, everyHours: number, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const last = Number(ledger.kvGet('backup.last') ?? 0)
  if (!last) return true
  return nowSec - last >= everyHours * 3600
}
