/**
 * Registrul. Tot ce vede si tot ce face agentul ajunge aici.
 *
 * Nu e telemetrie, e produsul: dupa o luna de rulare, tabelele astea sunt
 * contul de profit si pierdere al unui agent. De aia se scrie si ce NU s-a
 * facut, si de ce.
 *
 * Sumele stau ca TEXT, niciodata ca INTEGER: weiul depaseste ce poate tine un
 * numar din JavaScript, iar o rotunjire tacuta aici strica toate cifrele de
 * mai tarziu.
 *
 * Fata de Courier exista un tabel in plus, `races`, si e cel mai important
 * dintre toate pentru Ringer: acolo scrie cine a apasat butonul inaintea
 * noastra, cu cat gaz si la cate blocuri dupa ce s-a copt oala. Fara el,
 * "cred ca pierdem cursa" ramane o parere. Cu el, e o cifra.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type JobStatus = 'sent' | 'confirmed' | 'reverted' | 'skipped' | 'failed' | 'dry'

export interface JobRow {
  runId: number
  agentId: number | null
  key: string
  label: string
  stakeWei: bigint
  rewardWei: bigint
  /** ce a plecat din portofel pentru bucata asta, in afara de gaz */
  costWei: bigint
  gasWei: bigint
  txHash: string | null
  blockNumber: bigint | null
  status: JobStatus
  reason: string | null
}

export interface RunStats {
  seen: number
  candidates: number
  done: number
  failed: number
  gasWei: bigint
  rewardWei: bigint
  costWei: bigint
  note?: string | null
}

/** un rand din caietul de curse */
export interface RaceRow {
  key: string
  blockNumber: bigint | null
  /** cine a apasat: 'us' cand am fost noi, altfel adresa castigatorului */
  winner: string
  /** am fi vrut si noi? true cand bucata era coapta si pentru noi */
  wanted: boolean
  /** am si trimis, sau doar am privit (veghe / rulare uscata) */
  sent: boolean
  ourGasPriceWei: bigint
  winnerGasPriceWei: bigint
  /** cate blocuri au trecut de cand era de apasat pana s-a apasat */
  blocksLate: number | null
  /** cat ne-a luat noua drumul de la vedere pana la semnatura */
  latencyMs: number | null
  txHash: string | null
  note: string | null
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  kind TEXT NOT NULL,
  mode TEXT NOT NULL,
  dry INTEGER NOT NULL DEFAULT 1,
  seen INTEGER DEFAULT 0,
  candidates INTEGER DEFAULT 0,
  done INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  gas_wei TEXT DEFAULT '0',
  reward_wei TEXT DEFAULT '0',
  cost_wei TEXT DEFAULT '0',
  note TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  agent_id INTEGER,
  key TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  stake_wei TEXT NOT NULL DEFAULT '0',
  reward_wei TEXT NOT NULL DEFAULT '0',
  cost_wei TEXT NOT NULL DEFAULT '0',
  gas_wei TEXT NOT NULL DEFAULT '0',
  tx_hash TEXT,
  block_number TEXT,
  status TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_key ON jobs(key);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS jobs_created ON jobs(created_at);
CREATE INDEX IF NOT EXISTS jobs_agent ON jobs(agent_id);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_tx_key ON jobs(tx_hash, key) WHERE tx_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS opportunities (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  stake_wei TEXT NOT NULL DEFAULT '0',
  reward_wei TEXT NOT NULL DEFAULT '0',
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  done_at INTEGER
);
CREATE INDEX IF NOT EXISTS opportunities_open ON opportunities(done_at);

CREATE TABLE IF NOT EXISTS races (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  block_number TEXT,
  winner TEXT NOT NULL,
  wanted INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  our_gas_price_wei TEXT NOT NULL DEFAULT '0',
  winner_gas_price_wei TEXT NOT NULL DEFAULT '0',
  blocks_late INTEGER,
  latency_ms INTEGER,
  tx_hash TEXT,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS races_created ON races(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS races_tx ON races(tx_hash) WHERE tx_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

export class Ledger {
  private db: DatabaseSync

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
    this.db.exec(SCHEMA)
    this.migrate()
  }

  /**
   * Baze facute inainte sa existe agenti care cheltuie nu au coloana de
   * cheltuiala. Se adauga la pornire. Registrul e produsul, nu se arunca
   * pentru o coloana.
   */
  private migrate(): void {
    for (const [table, col] of [
      ['jobs', 'cost_wei'],
      ['runs', 'cost_wei']
    ] as const) {
      const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
      if (!cols.some((c) => c.name === col)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT NOT NULL DEFAULT '0'`)
      }
    }
  }

  close(): void {
    this.db.close()
  }

  /** acces direct, pentru copii de siguranta si unelte. Nu se foloseste in bot. */
  raw(): DatabaseSync {
    return this.db
  }

  // ---------------------------------------------------------------- rulari
  startRun(kind: string, mode: string, dry: boolean): number {
    const r = this.db.prepare('INSERT INTO runs (started_at, kind, mode, dry) VALUES (?,?,?,?)').run(now(), kind, mode, dry ? 1 : 0)
    return Number(r.lastInsertRowid)
  }

  finishRun(id: number, s: RunStats): void {
    this.db
      .prepare(
        `UPDATE runs SET finished_at=?, seen=?, candidates=?, done=?, failed=?, gas_wei=?, reward_wei=?, cost_wei=?, note=? WHERE id=?`
      )
      .run(
        now(),
        s.seen,
        s.candidates,
        s.done,
        s.failed,
        s.gasWei.toString(),
        s.rewardWei.toString(),
        s.costWei.toString(),
        s.note ?? null,
        id
      )
  }

  lastFinishedAt(): number | null {
    const r = this.db.prepare('SELECT MAX(finished_at) AS t FROM runs').get() as { t: number | null } | undefined
    return r?.t ?? null
  }

  // ----------------------------------------------------------------- munca
  recordJob(j: JobRow): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO jobs
         (run_id, agent_id, key, label, stake_wei, reward_wei, cost_wei, gas_wei, tx_hash, block_number, status, reason, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        j.runId,
        j.agentId,
        j.key,
        j.label,
        j.stakeWei.toString(),
        j.rewardWei.toString(),
        j.costWei.toString(),
        j.gasWei.toString(),
        j.txHash,
        j.blockNumber === null ? null : j.blockNumber.toString(),
        j.status,
        j.reason,
        now()
      )
  }

  /**
   * Inchide o tranzactie: imparte gazul si castigul pe randurile din ea, cu
   * rest, ca sa nu se piarda wei prin impartire. Lectia asta a costat la
   * Courier un raport care arata castig zero dupa treburi adevarate.
   */
  settleTx(
    txHash: string,
    p: { gasWei: bigint; rewardWei: bigint; costWei?: bigint; blockNumber: bigint | null; status: JobStatus }
  ): void {
    const ids = this.db.prepare('SELECT id FROM jobs WHERE tx_hash=? ORDER BY id').all(txHash) as Array<{ id: number }>
    if (ids.length === 0) return
    const n = BigInt(ids.length)
    const cost = p.costWei ?? 0n
    const gasEach = p.gasWei / n
    const rewardEach = p.rewardWei / n
    const costEach = cost / n
    const gasRest = p.gasWei - gasEach * n
    const rewardRest = p.rewardWei - rewardEach * n
    const costRest = cost - costEach * n
    const st = this.db.prepare('UPDATE jobs SET status=?, gas_wei=?, reward_wei=?, cost_wei=?, block_number=? WHERE id=?')
    ids.forEach((r, i) => {
      const gas = i === 0 ? gasEach + gasRest : gasEach
      const reward = i === 0 ? rewardEach + rewardRest : rewardEach
      const c = i === 0 ? costEach + costRest : costEach
      st.run(
        p.status,
        gas.toString(),
        reward.toString(),
        c.toString(),
        p.blockNumber === null ? null : p.blockNumber.toString(),
        r.id
      )
    })
  }

  unconfirmedTxs(): string[] {
    const rows = this.db
      .prepare(`SELECT DISTINCT tx_hash FROM jobs WHERE status='sent' AND tx_hash IS NOT NULL`)
      .all() as Array<{ tx_hash: string }>
    return rows.map((r) => r.tx_hash)
  }

  keysOfTx(txHash: string): string[] {
    const rows = this.db.prepare('SELECT key FROM jobs WHERE tx_hash=?').all(txHash) as Array<{ key: string }>
    return rows.map((r) => r.key)
  }

  lastDoneAt(key: string): number | null {
    const r = this.db
      .prepare(`SELECT MAX(created_at) AS t FROM jobs WHERE key=? AND status IN ('sent','confirmed')`)
      .get(key) as { t: number | null } | undefined
    return r?.t ?? null
  }

  // ------------------------------------------------------------- ce e liber
  /** ce e de facut acum, si ce s-a schimbat fata de ultima privire */
  seeOpportunity(
    key: string,
    label: string,
    stakeWei: bigint,
    rewardWei: bigint
  ): { isNew: boolean; previousWei: bigint; deltaWei: bigint } {
    const prev = this.db.prepare('SELECT stake_wei, done_at FROM opportunities WHERE key=?').get(key) as
      | { stake_wei: string; done_at: number | null }
      | undefined
    const t = now()
    if (!prev) {
      this.db
        .prepare(
          `INSERT INTO opportunities (key, label, stake_wei, reward_wei, first_seen, last_seen) VALUES (?,?,?,?,?,?)`
        )
        .run(key, label, stakeWei.toString(), rewardWei.toString(), t, t)
      return { isNew: true, previousWei: 0n, deltaWei: stakeWei }
    }
    const previousWei = BigInt(prev.stake_wei)
    this.db
      .prepare('UPDATE opportunities SET label=?, stake_wei=?, reward_wei=?, last_seen=?, done_at=NULL WHERE key=?')
      .run(label, stakeWei.toString(), rewardWei.toString(), t, key)
    return { isNew: prev.done_at !== null, previousWei, deltaWei: stakeWei - previousWei }
  }

  clearOpportunity(key: string): void {
    this.db.prepare('UPDATE opportunities SET done_at=?, stake_wei=?, reward_wei=? WHERE key=?').run(now(), '0', '0', key)
  }

  openTotals(): { count: number; stakeWei: bigint; oldestDays: number } {
    const rows = this.db
      .prepare(`SELECT stake_wei, first_seen FROM opportunities WHERE done_at IS NULL`)
      .all() as Array<{ stake_wei: string; first_seen: number }>
    const stakeWei = rows.reduce((s, r) => s + BigInt(r.stake_wei), 0n)
    const oldest = rows.reduce<number | null>((m, r) => (m === null || r.first_seen < m ? r.first_seen : m), null)
    return { count: rows.length, stakeWei, oldestDays: oldest ? Math.floor((now() - oldest) / 86400) : 0 }
  }

  openList(limit = 50): Array<{ key: string; label: string; stakeWei: bigint; rewardWei: bigint; ageSec: number }> {
    const rows = this.db
      .prepare(
        `SELECT key, label, stake_wei, reward_wei, first_seen FROM opportunities
         WHERE done_at IS NULL ORDER BY CAST(stake_wei AS REAL) DESC LIMIT ?`
      )
      .all(limit) as Array<Record<string, string | number>>
    const t = now()
    return rows.map((r) => ({
      key: String(r.key),
      label: String(r.label),
      stakeWei: BigInt(String(r.stake_wei)),
      rewardWei: BigInt(String(r.reward_wei)),
      ageSec: t - Number(r.first_seen)
    }))
  }

  // ------------------------------------------------------------- caietul de curse
  recordRace(r: RaceRow): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO races
         (key, block_number, winner, wanted, sent, our_gas_price_wei, winner_gas_price_wei, blocks_late, latency_ms, tx_hash, note, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        r.key,
        r.blockNumber === null ? null : r.blockNumber.toString(),
        r.winner,
        r.wanted ? 1 : 0,
        r.sent ? 1 : 0,
        r.ourGasPriceWei.toString(),
        r.winnerGasPriceWei.toString(),
        r.blocksLate,
        r.latencyMs,
        r.txHash,
        r.note,
        now()
      )
  }

  /**
   * Cursa, in cifre. Asta e raportul din care se decide daca meseria de Ringer
   * merita continuata: cate ocazii au trecut, cate le-am luat, si cand nu, cu
   * cat mai mult gaz a platit cel care a luat-o.
   */
  raceStats(sinceTs = 0): {
    total: number
    won: number
    lost: number
    wantedButNotSent: number
    winRate: number
    /** cati wei pe gaz platea castigatorul, la mijloc */
    medianWinnerGasPriceWei: bigint
    medianOurGasPriceWei: bigint
    medianLatencyMs: number | null
    competitors: number
  } {
    const rows = this.db
      .prepare(
        `SELECT winner, wanted, sent, our_gas_price_wei, winner_gas_price_wei, latency_ms
         FROM races WHERE created_at >= ?`
      )
      .all(sinceTs) as Array<Record<string, string | number>>
    const total = rows.length
    const won = rows.filter((r) => String(r.winner) === 'us').length
    const lost = total - won
    const wantedButNotSent = rows.filter((r) => Number(r.wanted) === 1 && Number(r.sent) === 0).length
    const winnerPrices = rows.filter((r) => String(r.winner) !== 'us').map((r) => BigInt(String(r.winner_gas_price_wei)))
    const ourPrices = rows.map((r) => BigInt(String(r.our_gas_price_wei))).filter((v) => v > 0n)
    const lat = rows.map((r) => (r.latency_ms === null ? null : Number(r.latency_ms))).filter((v): v is number => v !== null)
    const competitors = new Set(rows.map((r) => String(r.winner)).filter((w) => w !== 'us')).size
    return {
      total,
      won,
      lost,
      wantedButNotSent,
      winRate: total === 0 ? 0 : won / total,
      medianWinnerGasPriceWei: medianBig(winnerPrices),
      medianOurGasPriceWei: medianBig(ourPrices),
      medianLatencyMs: lat.length ? median(lat) : null,
      competitors
    }
  }

  recentRaces(limit = 20): Array<{
    at: number
    key: string
    winner: string
    wanted: boolean
    sent: boolean
    winnerGasPriceWei: bigint
    ourGasPriceWei: bigint
    blocksLate: number | null
    txHash: string | null
    note: string | null
  }> {
    const rows = this.db
      .prepare(
        `SELECT created_at, key, winner, wanted, sent, winner_gas_price_wei, our_gas_price_wei, blocks_late, tx_hash, note
         FROM races ORDER BY id DESC LIMIT ?`
      )
      .all(limit) as Array<Record<string, string | number | null>>
    return rows.map((r) => ({
      at: Number(r.created_at),
      key: String(r.key),
      winner: String(r.winner),
      wanted: Number(r.wanted) === 1,
      sent: Number(r.sent) === 1,
      winnerGasPriceWei: BigInt(String(r.winner_gas_price_wei ?? '0')),
      ourGasPriceWei: BigInt(String(r.our_gas_price_wei ?? '0')),
      blocksLate: r.blocks_late === null ? null : Number(r.blocks_late),
      txHash: r.tx_hash === null ? null : String(r.tx_hash),
      note: r.note === null ? null : String(r.note)
    }))
  }

  // ------------------------------------------------------------- socoteala
  totals(sinceTs = 0): { done: number; rewardWei: bigint; costWei: bigint; gasWei: bigint; netWei: bigint } {
    const rows = this.db
      .prepare(`SELECT reward_wei, cost_wei, gas_wei FROM jobs WHERE created_at >= ? AND status IN ('sent','confirmed')`)
      .all(sinceTs) as Array<{ reward_wei: string; cost_wei: string; gas_wei: string }>
    let rewardWei = 0n
    let costWei = 0n
    let gasWei = 0n
    for (const r of rows) {
      rewardWei += BigInt(r.reward_wei)
      costWei += BigInt(r.cost_wei)
      gasWei += BigInt(r.gas_wei)
    }
    /* net = ce a intrat minus ce a iesit minus ce s-a ars. Un raport care nu
       scade cheltuiala arata profit la un agent care pierde bani. */
    return { done: rows.length, rewardWei, costWei, gasWei, netWei: rewardWei - costWei - gasWei }
  }

  /** cat s-a cheltuit (in afara de gaz) de la un moment incoace */
  spentSince(ts: number): bigint {
    const rows = this.db
      .prepare(`SELECT cost_wei FROM jobs WHERE created_at >= ? AND status IN ('sent','confirmed')`)
      .all(ts) as Array<{ cost_wei: string }>
    return rows.reduce((s, r) => s + BigInt(r.cost_wei), 0n)
  }

  gasSpentSince(ts: number): bigint {
    const rows = this.db
      .prepare(`SELECT gas_wei FROM jobs WHERE created_at >= ? AND status IN ('sent','confirmed')`)
      .all(ts) as Array<{ gas_wei: string }>
    return rows.reduce((s, r) => s + BigInt(r.gas_wei), 0n)
  }

  /**
   * Fluxul de evenimente: si ce s-a facut, si ce s-a sarit, in aceeasi ordine.
   * Un log care arata doar reusitele minte prin omisiune: cand botul nu face
   * nimic, liniile de sarire sunt singurele care spun de ce.
   */
  recentEvents(limit = 40): Array<{
    at: number
    kind: 'work' | 'skip' | 'fail' | 'dry'
    key: string
    label: string
    rewardWei: bigint
    gasWei: bigint
    reason: string | null
    txHash: string | null
  }> {
    const rows = this.db
      .prepare(
        `SELECT created_at, status, key, label, reward_wei, gas_wei, reason, tx_hash
         FROM jobs ORDER BY created_at DESC, id DESC LIMIT ?`
      )
      .all(limit) as Array<Record<string, string | number | null>>
    const kindOf = (s: string): 'work' | 'skip' | 'fail' | 'dry' =>
      s === 'sent' || s === 'confirmed' ? 'work' : s === 'failed' || s === 'reverted' ? 'fail' : s === 'dry' ? 'dry' : 'skip'
    return rows.map((r) => ({
      at: Number(r.created_at),
      kind: kindOf(String(r.status)),
      key: String(r.key),
      label: String(r.label ?? ''),
      rewardWei: BigInt(String(r.reward_wei ?? '0')),
      gasWei: BigInt(String(r.gas_wei ?? '0')),
      reason: r.reason === null ? null : String(r.reason),
      txHash: r.tx_hash === null ? null : String(r.tx_hash)
    }))
  }

  recentRuns(limit = 12): Array<{
    id: number
    startedAt: number
    finishedAt: number | null
    kind: string
    mode: string
    dry: boolean
    seen: number
    candidates: number
    done: number
    failed: number
    gasWei: bigint
    rewardWei: bigint
    note: string | null
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, started_at, finished_at, kind, mode, dry, seen, candidates, done, failed, gas_wei, reward_wei, note
         FROM runs ORDER BY id DESC LIMIT ?`
      )
      .all(limit) as Array<Record<string, string | number | null>>
    return rows.map((r) => ({
      id: Number(r.id),
      startedAt: Number(r.started_at),
      finishedAt: r.finished_at === null ? null : Number(r.finished_at),
      kind: String(r.kind),
      mode: String(r.mode),
      dry: Number(r.dry) === 1,
      seen: Number(r.seen),
      candidates: Number(r.candidates),
      done: Number(r.done),
      failed: Number(r.failed),
      gasWei: BigInt(String(r.gas_wei ?? '0')),
      rewardWei: BigInt(String(r.reward_wei ?? '0')),
      note: r.note === null ? null : String(r.note)
    }))
  }

  /** de ce NU s-a lucrat, grupat. Intrebarea cea mai deasa in productie. */
  skipReasons(sinceTs = 0, limit = 8): Array<{ reason: string; count: number }> {
    const rows = this.db
      .prepare(
        `SELECT COALESCE(reason,'fara motiv') AS reason, COUNT(*) AS c FROM jobs
         WHERE created_at >= ? AND status IN ('skipped','failed') GROUP BY reason ORDER BY c DESC LIMIT ?`
      )
      .all(sinceTs, limit) as Array<{ reason: string; c: number }>
    return rows.map((r) => ({ reason: r.reason, count: r.c }))
  }

  dailySeries(days = 7): Array<{ day: number; done: number; rewardWei: bigint; gasWei: bigint }> {
    const since = Math.floor(Date.now() / 1000) - days * 86400
    const rows = this.db
      .prepare(`SELECT created_at, reward_wei, gas_wei FROM jobs WHERE created_at >= ? AND status IN ('sent','confirmed')`)
      .all(since) as Array<{ created_at: number; reward_wei: string; gas_wei: string }>
    const buckets = new Map<number, { done: number; rewardWei: bigint; gasWei: bigint }>()
    for (let i = days - 1; i >= 0; i--) {
      const day = Math.floor((Math.floor(Date.now() / 1000) - i * 86400) / 86400) * 86400
      buckets.set(day, { done: 0, rewardWei: 0n, gasWei: 0n })
    }
    for (const r of rows) {
      const day = Math.floor(r.created_at / 86400) * 86400
      const b = buckets.get(day)
      if (!b) continue
      b.done++
      b.rewardWei += BigInt(r.reward_wei)
      b.gasWei += BigInt(r.gas_wei)
    }
    return [...buckets.entries()].map(([day, b]) => ({ day, ...b }))
  }

  // ------------------------------------------------------------------- kv
  kvGet(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM kv WHERE key=?').get(key) as { value: string } | undefined
    return r?.value ?? null
  }

  kvSet(key: string, value: string): void {
    this.db.prepare('INSERT INTO kv (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value)
  }
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2)
}

function medianBig(values: bigint[]): bigint {
  if (values.length === 0) return 0n
  const s = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2n
}
