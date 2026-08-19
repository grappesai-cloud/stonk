/**
 * Copia registrului si pulsul.
 *
 * Doua lucruri care se strica tacut in productie: o copie care nu s-a facut
 * si un proces care traieste dar nu mai lucreaza. Testele de aici verifica
 * exact partile care ar minti: ca in copie chiar sunt randurile scrise
 * ultima data, si ca o copie care nu trece verificarea NU ramane pe disc.
 */
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backupDue, backupOnce, listBackups } from '../../src/ledger/backup.js'
import { Ledger } from '../../src/ledger/db.js'
import { healthOf, isWedged, staleAfterSec, watchdogSec } from '../../src/health.js'
import { loadConfig } from '../../src/config.js'

const W1 = '0x1111111111111111111111111111111111111111'
const OWNER = '0x3333333333333333333333333333333333333333'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'courier-backup-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function ledgerWithRows(n: number): Ledger {
  const l = new Ledger(join(dir, 'courier.db'))
  const run = l.startRun('profit', false)
  for (let i = 0; i < n; i++) {
    l.recordDelivery({
      runId: run, agentId: 0,
      tokenId: String(i), wallet: W1, owner: OWNER,
      valueWei: 10n, nativeWei: 10n, tipWei: 1n, gasWei: 1n,
      txHash: '0x' + String(i).padStart(4, '0'), blockNumber: BigInt(i),
      status: 'confirmed', reason: null
    })
  }
  return l
}

describe('copia registrului', () => {
  it('scrie o copie care trece integrity_check si are randurile', () => {
    const l = ledgerWithRows(5)
    const r = backupOnce(l, join(dir, 'backups'), 5)
    expect(r.integrity).toBe('ok')
    expect(r.rows.deliveries).toBe(5)
    expect(r.bytes).toBeGreaterThan(0)
    expect(existsSync(r.file)).toBe(true)
    l.close()
  })

  it('copia chiar contine ce s-a scris ultima data, nu doar un fisier de marimea potrivita', () => {
    /* Asta e motivul pentru care nu se copiaza fisierul cu cp: baza e in WAL,
       iar randurile proaspete pot sa nu fie inca in fisierul principal. */
    const l = ledgerWithRows(3)
    const run = l.startRun('profit', false)
    l.recordDelivery({
      runId: run, agentId: 0,
      tokenId: 'proaspat', wallet: W1, owner: OWNER,
      valueWei: 999n, nativeWei: 999n, tipWei: 5n, gasWei: 1n,
      txHash: '0xfeed', blockNumber: 99n, status: 'confirmed', reason: null
    })

    const r = backupOnce(l, join(dir, 'backups'), 5)
    const copy = new DatabaseSync(r.file)
    const row = copy.prepare("SELECT value_wei AS v FROM deliveries WHERE token_id = 'proaspat'").get() as { v: string }
    expect(row.v).toBe('999')
    copy.close()
    l.close()
  })

  it('nu lasa pe disc o copie in care nu are incredere', () => {
    const l = ledgerWithRows(2)
    /* stricam sursa asa incat copia sa iasa fara un tabel asteptat */
    l.raw().exec('DROP TABLE watchers')
    const backups = join(dir, 'backups')
    expect(() => backupOnce(l, backups, 5)).toThrow(/watchers/)
    expect(listBackups(backups)).toHaveLength(0)
    l.close()
  })

  it('pastreaza cate copii i-ai cerut si le sterge pe cele mai vechi', () => {
    const l = ledgerWithRows(1)
    const backups = join(dir, 'backups')
    const base = new Date('2026-08-19T10:00:00')
    for (let i = 0; i < 5; i++) {
      backupOnce(l, backups, 3, new Date(base.getTime() + i * 60_000))
    }
    const left = readdirSync(backups)
    expect(left).toHaveLength(3)
    /* cele ramase sunt cele noi, nu cele vechi */
    expect(left.some((f) => f.includes('1004'))).toBe(true)
    expect(left.some((f) => f.includes('1000'))).toBe(false)
    l.close()
  })

  it('nu suprascrie o copie facuta in aceeasi secunda', () => {
    const l = ledgerWithRows(1)
    const backups = join(dir, 'backups')
    const at = new Date('2026-08-19T10:00:00')
    const a = backupOnce(l, backups, 10, at)
    const b = backupOnce(l, backups, 10, at)
    expect(a.file).not.toBe(b.file)
    expect(existsSync(a.file)).toBe(true)
    expect(existsSync(b.file)).toBe(true)
    l.close()
  })

  it('listarea sare peste fisierele straine din folder', () => {
    const l = ledgerWithRows(1)
    const backups = join(dir, 'backups')
    backupOnce(l, backups, 5)
    writeFileSync(join(backups, 'notes.txt'), 'nu sunt o copie')
    expect(listBackups(backups)).toHaveLength(1)
    l.close()
  })

  it('stie cand e vremea urmatoarei copii', () => {
    const l = ledgerWithRows(1)
    expect(backupDue(l, 6)).toBe(true)
    backupOnce(l, join(dir, 'backups'), 5, new Date(1_000_000 * 1000))
    expect(backupDue(l, 6, 1_000_000 + 3600)).toBe(false)
    expect(backupDue(l, 6, 1_000_000 + 6 * 3600)).toBe(true)
    l.close()
  })
})

function cfg(runner: Record<string, unknown> = {}) {
  const file = join(dir, 'c.json')
  writeFileSync(
    file,
    JSON.stringify({
      network: { name: 't', chainId: 4663, rpc: ['https://rpc.example.com'] },
      erc6551: { registry: W1, implementation: OWNER },
      brokers: { address: W1 },
      drops: {
        address: OWNER,
        pending: { signature: 'function pendingOf(uint256 id) view returns (uint256 ethAmount)', nativeFields: ['ethAmount'] },
        deliverSignature: 'function deliver(uint256 id)'
      },
      runner
    })
  )
  return loadConfig(file)
}

describe('cat de viu e', () => {
  it('inainte de prima rulare nu e vechi, e doar pornit', () => {
    const h = healthOf(null, cfg())
    expect(h.stale).toBe(false)
    expect(h.lastRunAt).toBe(null)
  })

  it('o rulare terminata acum e proaspata, una veche nu', () => {
    const c = cfg({ intervalSec: 300 })
    expect(healthOf(1000, c, 1100).stale).toBe(false)
    expect(healthOf(1000, c, 1000 + 3 * 300 + 121).stale).toBe(true)
  })

  it('fereastra se calculeaza din interval, dar configurarea bate calculul', () => {
    expect(staleAfterSec(cfg({ intervalSec: 60 }))).toBe(60 * 3 + 120)
    expect(staleAfterSec(cfg({ intervalSec: 60, staleAfterSec: 45 }))).toBe(45)
  })

  it('cainele de paza: null inseamna calculat, 0 inseamna oprit dinadins', () => {
    expect(watchdogSec(cfg({ intervalSec: 300 }))).toBe(300 * 6 + 600)
    expect(watchdogSec(cfg({ intervalSec: 300, watchdogSec: 0 }))).toBe(null)
    expect(watchdogSec(cfg({ intervalSec: 300, watchdogSec: 900 }))).toBe(900)
  })

  it('latra doar dupa ce a trecut fereastra, si niciodata daca e oprit', () => {
    expect(isWedged(0, 900 * 1000, 900)).toBe(false)
    expect(isWedged(0, 901 * 1000, 900)).toBe(true)
    expect(isWedged(0, 10_000_000, null)).toBe(false)
  })
})
