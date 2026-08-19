/**
 * Registrul. Tot ce vede si tot ce face botul ajunge aici.
 *
 * Nu e telemetrie, e produsul: dupa o luna de rulare, tabelele astea sunt
 * contul de profit si pierdere al unui agent, adica exact cifra din care
 * decizi supply-ul si pretul de mint. De aia se scrie si ce NU s-a livrat,
 * si de ce.
 *
 * Sumele stau ca TEXT, niciodata ca INTEGER: weiul depaseste ce poate tine
 * un numar din JavaScript si o rotunjire tacuta aici ar strica toate cifrele
 * de mai tarziu.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type DeliveryStatus = 'sent' | 'confirmed' | 'reverted' | 'skipped' | 'failed' | 'dry'

export interface DeliveryRow {
  runId: number
  agentId: number | null
  tokenId: string
  wallet: string
  owner: string | null
  valueWei: bigint
  nativeWei: bigint
  tipWei: bigint
  gasWei: bigint
  txHash: string | null
  blockNumber: bigint | null
  status: DeliveryStatus
  reason: string | null
}

export interface WallRow {
  tokenId: string
  wallet: string
  owner: string | null
  valueWei: bigint
  nativeWei: bigint
  firstSeen: number
  lastSeen: number
  ageDays: number
}

export interface RunStats {
  scanned: number
  candidates: number
  delivered: number
  failed: number
  gasWei: bigint
  tipsWei: bigint
  valueWei: bigint
  note?: string | null
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  mode TEXT NOT NULL,
  dry INTEGER NOT NULL DEFAULT 1,
  scanned INTEGER DEFAULT 0,
  candidates INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  gas_wei TEXT DEFAULT '0',
  tips_wei TEXT DEFAULT '0',
  value_wei TEXT DEFAULT '0',
  note TEXT
);

CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  agent_id INTEGER,
  token_id TEXT NOT NULL,
  wallet TEXT NOT NULL,
  owner TEXT,
  value_wei TEXT NOT NULL DEFAULT '0',
  native_wei TEXT NOT NULL DEFAULT '0',
  tip_wei TEXT NOT NULL DEFAULT '0',
  gas_wei TEXT NOT NULL DEFAULT '0',
  tx_hash TEXT,
  block_number TEXT,
  status TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS deliveries_token ON deliveries(token_id);
CREATE INDEX IF NOT EXISTS deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS deliveries_created ON deliveries(created_at);
-- indexul pe agent se face in migrate(): pe o baza veche coloana inca nu
-- exista aici, si CREATE INDEX ar crapa inainte sa apucam sa o adaugam
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_tx_token ON deliveries(tx_hash, token_id) WHERE tx_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS claims (
  token_id TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  owner TEXT,
  value_wei TEXT NOT NULL DEFAULT '0',
  native_wei TEXT NOT NULL DEFAULT '0',
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  delivered_at INTEGER
);
CREATE INDEX IF NOT EXISTS claims_value ON claims(value_wei);

CREATE TABLE IF NOT EXISTS watchers (
  chat_id TEXT NOT NULL,
  address TEXT NOT NULL,
  label TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, address)
);
CREATE INDEX IF NOT EXISTS watchers_address ON watchers(address);

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
   * Baze facute inainte de atribuire nu au coloana agentului. Se adauga la
   * pornire, o singura data. E mai bine decat sa ceri stergerea registrului:
   * registrul e produsul, nu se arunca pentru o coloana.
   */
  private migrate(): void {
    const cols = this.db.prepare('PRAGMA table_info(deliveries)').all() as Array<{ name: string }>
    if (!cols.some((c) => c.name === 'agent_id')) {
      this.db.exec('ALTER TABLE deliveries ADD COLUMN agent_id INTEGER')
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS deliveries_agent ON deliveries(agent_id)')
  }

  close(): void {
    this.db.close()
  }

  /** acces direct, pentru unelte si seminte de proba. Nu se foloseste in bot. */
  raw(): DatabaseSync {
    return this.db
  }

  // ---------------------------------------------------------------- rulari
  startRun(mode: string, dry: boolean): number {
    const st = this.db.prepare('INSERT INTO runs (started_at, mode, dry) VALUES (?, ?, ?)')
    const r = st.run(now(), mode, dry ? 1 : 0)
    return Number(r.lastInsertRowid)
  }

  finishRun(id: number, s: RunStats): void {
    this.db
      .prepare(
        `UPDATE runs SET finished_at=?, scanned=?, candidates=?, delivered=?, failed=?,
         gas_wei=?, tips_wei=?, value_wei=?, note=? WHERE id=?`
      )
      .run(
        now(),
        s.scanned,
        s.candidates,
        s.delivered,
        s.failed,
        s.gasWei.toString(),
        s.tipsWei.toString(),
        s.valueWei.toString(),
        s.note ?? null,
        id
      )
  }

  // -------------------------------------------------------------- livrari
  recordDelivery(d: DeliveryRow): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO deliveries
         (run_id, agent_id, token_id, wallet, owner, value_wei, native_wei, tip_wei, gas_wei, tx_hash, block_number, status, reason, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        d.runId,
        d.agentId,
        d.tokenId,
        d.wallet,
        d.owner,
        d.valueWei.toString(),
        d.nativeWei.toString(),
        d.tipWei.toString(),
        d.gasWei.toString(),
        d.txHash,
        d.blockNumber === null ? null : d.blockNumber.toString(),
        d.status,
        d.reason,
        now()
      )
  }

  /**
   * Inchide o tranzactie: imparte gazul si bacsisul pe livrarile din ea.
   *
   * Impartirea se face cu rest, nu prin taiere: la impartire simpla suma
   * bucatilor iese mai mica decat totalul, si atunci raportul de la final
   * arata mai putin gaz si mai putin castig decat s-a intamplat. Restul se
   * lipeste de primul rand.
   */
  settleTx(
    txHash: string,
    p: { gasWei: bigint; tipWei: bigint; blockNumber: bigint | null; status: DeliveryStatus }
  ): void {
    const ids = this.db.prepare('SELECT id FROM deliveries WHERE tx_hash=? ORDER BY id').all(txHash) as Array<{
      id: number
    }>
    if (ids.length === 0) return
    const n = BigInt(ids.length)
    const gasEach = p.gasWei / n
    const tipEach = p.tipWei / n
    const gasRest = p.gasWei - gasEach * n
    const tipRest = p.tipWei - tipEach * n

    const st = this.db.prepare('UPDATE deliveries SET status=?, gas_wei=?, tip_wei=?, block_number=? WHERE id=?')
    ids.forEach((r, i) => {
      const gas = i === 0 ? gasEach + gasRest : gasEach
      const tip = i === 0 ? tipEach + tipRest : tipEach
      st.run(p.status, gas.toString(), tip.toString(), p.blockNumber === null ? null : p.blockNumber.toString(), r.id)
    })
  }

  /** tranzactii trimise pentru care nu am apucat sa scriem chitanta */
  unconfirmedTxs(): string[] {
    const rows = this.db
      .prepare(`SELECT DISTINCT tx_hash FROM deliveries WHERE status='sent' AND tx_hash IS NOT NULL`)
      .all() as Array<{ tx_hash: string }>
    return rows.map((r) => r.tx_hash)
  }

  tokensOfTx(txHash: string): string[] {
    const rows = this.db.prepare('SELECT token_id FROM deliveries WHERE tx_hash=?').all(txHash) as Array<{
      token_id: string
    }>
    return rows.map((r) => r.token_id)
  }

  lastDeliveryAt(tokenId: string): number | null {
    const row = this.db
      .prepare(
        `SELECT MAX(created_at) AS t FROM deliveries
         WHERE token_id=? AND status IN ('sent','confirmed')`
      )
      .get(tokenId) as { t: number | null } | undefined
    return row?.t ?? null
  }

  // --------------------------------------------------------- peretele uitatilor
  /**
   * Inregistreaza ce e nerevendicat si spune ce s-a schimbat fata de ultima
   * data. Diferenta e tot ce conteaza pentru un supraveghetor: un index care
   * nu stie ce e nou e doar o poza.
   */
  seeClaim(
    tokenId: string,
    wallet: string,
    owner: string | null,
    valueWei: bigint,
    nativeWei: bigint
  ): { isNew: boolean; previousWei: bigint; deltaWei: bigint } {
    const prev = this.db.prepare('SELECT value_wei, delivered_at FROM claims WHERE token_id=?').get(tokenId) as
      | { value_wei: string; delivered_at: number | null }
      | undefined
    const previousWei = prev && prev.delivered_at === null ? BigInt(prev.value_wei) : 0n
    const isNew = !prev || prev.delivered_at !== null
    const t = now()
    this.db
      .prepare(
        `INSERT INTO claims (token_id, wallet, owner, value_wei, native_wei, first_seen, last_seen)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(token_id) DO UPDATE SET
           wallet=excluded.wallet, owner=excluded.owner,
           value_wei=excluded.value_wei, native_wei=excluded.native_wei,
           last_seen=excluded.last_seen, delivered_at=NULL`
      )
      .run(tokenId, wallet, owner, valueWei.toString(), nativeWei.toString(), t, t)
    return { isNew, previousWei, deltaWei: valueWei - previousWei }
  }

  clearClaim(tokenId: string): void {
    this.db.prepare('UPDATE claims SET delivered_at=?, value_wei=?, native_wei=? WHERE token_id=?')
      .run(now(), '0', '0', tokenId)
  }

  wall(limit = 100): WallRow[] {
    const rows = this.db
      .prepare(
        `SELECT token_id, wallet, owner, value_wei, native_wei, first_seen, last_seen
         FROM claims WHERE delivered_at IS NULL AND value_wei != '0'
         ORDER BY CAST(value_wei AS REAL) DESC LIMIT ?`
      )
      .all(limit) as Array<Record<string, string | number | null>>
    const t = now()
    return rows.map((r) => ({
      tokenId: String(r.token_id),
      wallet: String(r.wallet),
      owner: r.owner === null ? null : String(r.owner),
      valueWei: BigInt(String(r.value_wei)),
      nativeWei: BigInt(String(r.native_wei)),
      firstSeen: Number(r.first_seen),
      lastSeen: Number(r.last_seen),
      ageDays: Math.floor((t - Number(r.first_seen)) / 86400)
    }))
  }

  wallTotals(): { count: number; valueWei: bigint; oldestDays: number } {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c, COALESCE(SUM(CAST(value_wei AS REAL)),0) AS v, MIN(first_seen) AS f
         FROM claims WHERE delivered_at IS NULL AND value_wei != '0'`
      )
      .get() as { c: number; v: number; f: number | null }
    // suma exacta se reface din randuri, ca sa nu pierdem precizie prin REAL
    const all = this.db
      .prepare(`SELECT value_wei FROM claims WHERE delivered_at IS NULL AND value_wei != '0'`)
      .all() as Array<{ value_wei: string }>
    const total = all.reduce((s, r) => s + BigInt(r.value_wei), 0n)
    return {
      count: row.c,
      valueWei: total,
      oldestDays: row.f ? Math.floor((now() - row.f) / 86400) : 0
    }
  }

  // ------------------------------------------------------------- socoteala
  totals(sinceTs = 0): {
    deliveries: number
    valueWei: bigint
    tipsWei: bigint
    gasWei: bigint
    netWei: bigint
    wallets: number
  } {
    const rows = this.db
      .prepare(
        `SELECT value_wei, tip_wei, gas_wei, wallet FROM deliveries
         WHERE created_at >= ? AND status IN ('sent','confirmed')`
      )
      .all(sinceTs) as Array<{ value_wei: string; tip_wei: string; gas_wei: string; wallet: string }>
    let valueWei = 0n
    let tipsWei = 0n
    let gasWei = 0n
    const wallets = new Set<string>()
    for (const r of rows) {
      valueWei += BigInt(r.value_wei)
      tipsWei += BigInt(r.tip_wei)
      gasWei += BigInt(r.gas_wei)
      wallets.add(r.wallet)
    }
    return { deliveries: rows.length, valueWei, tipsWei, gasWei, netWei: tipsWei - gasWei, wallets: wallets.size }
  }

  gasSpentSince(ts: number): bigint {
    const rows = this.db
      .prepare(`SELECT gas_wei FROM deliveries WHERE created_at >= ? AND status IN ('sent','confirmed')`)
      .all(ts) as Array<{ gas_wei: string }>
    return rows.reduce((s, r) => s + BigInt(r.gas_wei), 0n)
  }

  recentDeliveries(limit = 20): Array<{
    tokenId: string
    wallet: string
    valueWei: bigint
    tipWei: bigint
    txHash: string | null
    at: number
    status: string
  }> {
    const rows = this.db
      .prepare(
        `SELECT token_id, wallet, value_wei, tip_wei, tx_hash, created_at, status
         FROM deliveries WHERE status IN ('sent','confirmed') ORDER BY id DESC LIMIT ?`
      )
      .all(limit) as Array<Record<string, string | number | null>>
    return rows.map((r) => ({
      tokenId: String(r.token_id),
      wallet: String(r.wallet),
      valueWei: BigInt(String(r.value_wei)),
      tipWei: BigInt(String(r.tip_wei)),
      txHash: r.tx_hash === null ? null : String(r.tx_hash),
      at: Number(r.created_at),
      status: String(r.status)
    }))
  }

  /**
   * Fluxul de evenimente pentru log: si ce s-a livrat, si ce s-a sarit, in
   * aceeasi ordine cronologica. Un log care arata doar reusitele minte prin
   * omisiune: cand botul nu livreaza nimic, tocmai liniile de sarire sunt
   * singurele care iti spun de ce.
   */
  recentEvents(limit = 40): Array<{
    at: number
    kind: 'deliver' | 'skip' | 'fail' | 'dry'
    tokenId: string
    wallet: string
    valueWei: bigint
    tipWei: bigint
    reason: string | null
    txHash: string | null
  }> {
    const rows = this.db
      .prepare(
        `SELECT created_at, status, token_id, wallet, value_wei, tip_wei, reason, tx_hash
         FROM deliveries ORDER BY created_at DESC, id DESC LIMIT ?`
      )
      .all(limit) as Array<Record<string, string | number | null>>
    const kindOf = (s: string): 'deliver' | 'skip' | 'fail' | 'dry' =>
      s === 'sent' || s === 'confirmed' ? 'deliver' : s === 'failed' || s === 'reverted' ? 'fail' : s === 'dry' ? 'dry' : 'skip'
    return rows.map((r) => ({
      at: Number(r.created_at),
      kind: kindOf(String(r.status)),
      tokenId: String(r.token_id),
      wallet: String(r.wallet),
      valueWei: BigInt(String(r.value_wei ?? '0')),
      tipWei: BigInt(String(r.tip_wei ?? '0')),
      reason: r.reason === null ? null : String(r.reason),
      txHash: r.tx_hash === null ? null : String(r.tx_hash)
    }))
  }

  /** ce a aparut nou nerevendicat, pentru logul modului de veghe */
  recentFinds(limit = 14): Array<{ at: number; tokenId: string; wallet: string; valueWei: bigint }> {
    const rows = this.db
      .prepare(
        `SELECT first_seen, token_id, wallet, value_wei FROM claims
         WHERE delivered_at IS NULL AND value_wei != '0'
         ORDER BY first_seen DESC, CAST(value_wei AS REAL) DESC LIMIT ?`
      )
      .all(limit) as Array<Record<string, string | number>>
    return rows.map((r) => ({
      at: Number(r.first_seen),
      tokenId: String(r.token_id),
      wallet: String(r.wallet),
      valueWei: BigInt(String(r.value_wei))
    }))
  }

  recentRuns(limit = 12): Array<{
    id: number
    startedAt: number
    finishedAt: number | null
    mode: string
    dry: boolean
    scanned: number
    candidates: number
    delivered: number
    failed: number
    gasWei: bigint
    tipsWei: bigint
    valueWei: bigint
    note: string | null
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, started_at, finished_at, mode, dry, scanned, candidates, delivered, failed,
                gas_wei, tips_wei, value_wei, note
         FROM runs ORDER BY id DESC LIMIT ?`
      )
      .all(limit) as Array<Record<string, string | number | null>>
    return rows.map((r) => ({
      id: Number(r.id),
      startedAt: Number(r.started_at),
      finishedAt: r.finished_at === null ? null : Number(r.finished_at),
      mode: String(r.mode),
      dry: Number(r.dry) === 1,
      scanned: Number(r.scanned),
      candidates: Number(r.candidates),
      delivered: Number(r.delivered),
      failed: Number(r.failed),
      gasWei: BigInt(String(r.gas_wei ?? '0')),
      tipsWei: BigInt(String(r.tips_wei ?? '0')),
      valueWei: BigInt(String(r.value_wei ?? '0')),
      note: r.note === null ? null : String(r.note)
    }))
  }

  /** de ce NU s-a livrat, grupat. Intrebarea cea mai deasa in productie. */
  skipReasons(sinceTs = 0, limit = 8): Array<{ reason: string; count: number }> {
    const rows = this.db
      .prepare(
        `SELECT COALESCE(reason,'fara motiv') AS reason, COUNT(*) AS c
         FROM deliveries WHERE created_at >= ? AND status IN ('skipped','failed')
         GROUP BY reason ORDER BY c DESC LIMIT ?`
      )
      .all(sinceTs, limit) as Array<{ reason: string; c: number }>
    return rows.map((r) => ({ reason: r.reason, count: r.c }))
  }

  /** serie zilnica pentru grafic: ce s-a livrat, castigat si ars pe zi */
  dailySeries(days = 7): Array<{ day: number; deliveries: number; valueWei: bigint; tipsWei: bigint; gasWei: bigint }> {
    const since = Math.floor(Date.now() / 1000) - days * 86400
    const rows = this.db
      .prepare(
        `SELECT created_at, value_wei, tip_wei, gas_wei FROM deliveries
         WHERE created_at >= ? AND status IN ('sent','confirmed')`
      )
      .all(since) as Array<{ created_at: number; value_wei: string; tip_wei: string; gas_wei: string }>

    const buckets = new Map<number, { deliveries: number; valueWei: bigint; tipsWei: bigint; gasWei: bigint }>()
    const dayOf = (t: number) => Math.floor(t / 86400)
    const today = dayOf(Math.floor(Date.now() / 1000))
    for (let i = days - 1; i >= 0; i--) {
      buckets.set(today - i, { deliveries: 0, valueWei: 0n, tipsWei: 0n, gasWei: 0n })
    }
    for (const r of rows) {
      const key = dayOf(r.created_at)
      const b = buckets.get(key)
      if (!b) continue
      b.deliveries++
      b.valueWei += BigInt(r.value_wei)
      b.tipsWei += BigInt(r.tip_wei)
      b.gasWei += BigInt(r.gas_wei)
    }
    return [...buckets.entries()].map(([day, v]) => ({ day, ...v }))
  }

  /** cine are cei mai multi bani uitati: material de marketing, nu de operare */
  topOwners(limit = 5): Array<{ owner: string; wallets: number; valueWei: bigint }> {
    const rows = this.db
      .prepare(
        `SELECT owner, COUNT(*) AS c, value_wei FROM claims
         WHERE delivered_at IS NULL AND value_wei != '0' AND owner IS NOT NULL
         GROUP BY owner`
      )
      .all() as Array<{ owner: string; c: number }>
    const totals = new Map<string, { wallets: number; valueWei: bigint }>()
    const all = this.db
      .prepare(`SELECT owner, value_wei FROM claims WHERE delivered_at IS NULL AND value_wei != '0' AND owner IS NOT NULL`)
      .all() as Array<{ owner: string; value_wei: string }>
    for (const r of all) {
      const cur = totals.get(r.owner) ?? { wallets: 0, valueWei: 0n }
      cur.wallets++
      cur.valueWei += BigInt(r.value_wei)
      totals.set(r.owner, cur)
    }
    void rows
    return [...totals.entries()]
      .map(([owner, v]) => ({ owner, ...v }))
      .sort((a, b) => (a.valueWei > b.valueWei ? -1 : a.valueWei < b.valueWei ? 1 : 0))
      .slice(0, limit)
  }

  lastRunAt(): number | null {
    const r = this.db.prepare('SELECT MAX(started_at) AS t FROM runs').get() as { t: number | null }
    return r?.t ?? null
  }

  // ---------------------------------------------------------------- agenti
  /**
   * Socoteala unui singur agent. Asta e cifra pe care o vinde toata colectia:
   * nu "flota a livrat", ci "bucata asta a livrat si a castigat atat".
   */
  agentTotals(
    agentId: number,
    sinceTs = 0
  ): { deliveries: number; wallets: number; valueWei: bigint; tipsWei: bigint; gasWei: bigint; netWei: bigint; firstAt: number | null; lastAt: number | null } {
    const rows = this.db
      .prepare(
        `SELECT value_wei, tip_wei, gas_wei, wallet, created_at FROM deliveries
         WHERE agent_id = ? AND created_at >= ? AND status IN ('sent','confirmed')`
      )
      .all(agentId, sinceTs) as Array<{
      value_wei: string
      tip_wei: string
      gas_wei: string
      wallet: string
      created_at: number
    }>
    let valueWei = 0n
    let tipsWei = 0n
    let gasWei = 0n
    let firstAt: number | null = null
    let lastAt: number | null = null
    const wallets = new Set<string>()
    for (const r of rows) {
      valueWei += BigInt(r.value_wei)
      tipsWei += BigInt(r.tip_wei)
      gasWei += BigInt(r.gas_wei)
      wallets.add(r.wallet)
      if (firstAt === null || r.created_at < firstAt) firstAt = r.created_at
      if (lastAt === null || r.created_at > lastAt) lastAt = r.created_at
    }
    return { deliveries: rows.length, wallets: wallets.size, valueWei, tipsWei, gasWei, netWei: tipsWei - gasWei, firstAt, lastAt }
  }

  /** ce a livrat un agent, in ordine */
  agentHistory(
    agentId: number,
    limit = 20
  ): Array<{ tokenId: string; valueWei: bigint; at: number; txHash: string | null }> {
    const rows = this.db
      .prepare(
        `SELECT token_id, value_wei, created_at, tx_hash FROM deliveries
         WHERE agent_id = ? AND status IN ('sent','confirmed')
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(agentId, limit) as Array<{ token_id: string; value_wei: string; created_at: number; tx_hash: string | null }>
    return rows.map((r) => ({
      tokenId: r.token_id,
      valueWei: BigInt(r.value_wei),
      at: r.created_at,
      txHash: r.tx_hash
    }))
  }

  /** clasamentul flotei; gol pana exista mai multi agenti, si e in regula */
  leaderboard(limit = 20, sinceTs = 0): Array<{ agentId: number; deliveries: number; valueWei: bigint; tipsWei: bigint }> {
    const rows = this.db
      .prepare(
        `SELECT agent_id, value_wei, tip_wei FROM deliveries
         WHERE agent_id IS NOT NULL AND created_at >= ? AND status IN ('sent','confirmed')`
      )
      .all(sinceTs) as Array<{ agent_id: number; value_wei: string; tip_wei: string }>
    const map = new Map<number, { deliveries: number; valueWei: bigint; tipsWei: bigint }>()
    for (const r of rows) {
      const cur = map.get(r.agent_id) ?? { deliveries: 0, valueWei: 0n, tipsWei: 0n }
      cur.deliveries++
      cur.valueWei += BigInt(r.value_wei)
      cur.tipsWei += BigInt(r.tip_wei)
      map.set(r.agent_id, cur)
    }
    return [...map.entries()]
      .map(([agentId, v]) => ({ agentId, ...v }))
      .sort((a, b) => (a.tipsWei > b.tipsWei ? -1 : a.tipsWei < b.tipsWei ? 1 : 0))
      .slice(0, limit)
  }

  // -------------------------------------------------------- pe portofel
  /**
   * Tot ce stim despre o adresa: ce i s-a livrat si ce ii mai sta nerevendicat.
   * Cauta si dupa portofelul 6551, si dupa proprietar, fiindca omul stie de
   * obicei doar adresa lui, nu si pe a portofelului brokerului.
   */
  walletView(
    address: string,
    limit = 25
  ): {
    delivered: { count: number; valueWei: bigint; lastAt: number | null }
    pending: Array<{ tokenId: string; wallet: string; valueWei: bigint; ageDays: number }>
    history: Array<{ tokenId: string; valueWei: bigint; at: number; txHash: string | null }>
  } {
    const a = address.toLowerCase()
    const hist = this.db
      .prepare(
        `SELECT token_id, value_wei, created_at, tx_hash FROM deliveries
         WHERE (LOWER(wallet) = ? OR LOWER(owner) = ?) AND status IN ('sent','confirmed')
         ORDER BY created_at DESC LIMIT ?`
      )
      .all(a, a, limit) as Array<{ token_id: string; value_wei: string; created_at: number; tx_hash: string | null }>

    const all = this.db
      .prepare(
        `SELECT value_wei, created_at FROM deliveries
         WHERE (LOWER(wallet) = ? OR LOWER(owner) = ?) AND status IN ('sent','confirmed')`
      )
      .all(a, a) as Array<{ value_wei: string; created_at: number }>

    const pend = this.db
      .prepare(
        `SELECT token_id, wallet, value_wei, first_seen FROM claims
         WHERE delivered_at IS NULL AND value_wei != '0' AND (LOWER(wallet) = ? OR LOWER(owner) = ?)
         ORDER BY CAST(value_wei AS REAL) DESC LIMIT ?`
      )
      .all(a, a, limit) as Array<{ token_id: string; wallet: string; value_wei: string; first_seen: number }>

    const t = now()
    return {
      delivered: {
        count: all.length,
        valueWei: all.reduce((s, r) => s + BigInt(r.value_wei), 0n),
        lastAt: all.length ? Math.max(...all.map((r) => r.created_at)) : null
      },
      pending: pend.map((r) => ({
        tokenId: r.token_id,
        wallet: r.wallet,
        valueWei: BigInt(r.value_wei),
        ageDays: Math.floor((t - r.first_seen) / 86400)
      })),
      history: hist.map((r) => ({
        tokenId: r.token_id,
        valueWei: BigInt(r.value_wei),
        at: r.created_at,
        txHash: r.tx_hash
      }))
    }
  }

  // -------------------------------------------------------------- watchers
  addWatcher(chatId: string, address: string, label: string | null): void {
    this.db
      .prepare('INSERT OR IGNORE INTO watchers (chat_id, address, label, created_at) VALUES (?,?,?,?)')
      .run(chatId, address.toLowerCase(), label, now())
  }

  removeWatcher(chatId: string, address: string | null): number {
    const r = address
      ? this.db.prepare('DELETE FROM watchers WHERE chat_id=? AND address=?').run(chatId, address.toLowerCase())
      : this.db.prepare('DELETE FROM watchers WHERE chat_id=?').run(chatId)
    return Number(r.changes)
  }

  watchersOf(address: string): string[] {
    const rows = this.db.prepare('SELECT chat_id FROM watchers WHERE address=?').all(address.toLowerCase()) as Array<{
      chat_id: string
    }>
    return rows.map((r) => r.chat_id)
  }

  addressesOf(chatId: string): string[] {
    const rows = this.db.prepare('SELECT address FROM watchers WHERE chat_id=?').all(chatId) as Array<{
      address: string
    }>
    return rows.map((r) => r.address)
  }

  countWatchersOfAddress(address: string): number {
    const r = this.db.prepare('SELECT COUNT(*) AS c FROM watchers WHERE address=?').get(address.toLowerCase()) as {
      c: number
    }
    return r.c
  }

  countAddressesOfChat(chatId: string): number {
    const r = this.db.prepare('SELECT COUNT(*) AS c FROM watchers WHERE chat_id=?').get(chatId) as { c: number }
    return r.c
  }

  // -------------------------------------------------------------------- kv
  kvGet(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM kv WHERE key=?').get(key) as { value: string } | undefined
    return r?.value ?? null
  }

  kvSet(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO kv (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
      .run(key, value)
  }
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}
