/**
 * Atribuirea pe agent. Fara ea, registrul stie ce s-a livrat dar nu cine a
 * livrat, si atunci nu se poate dovedi niciodata ce a castigat o bucata anume.
 * Toata povestea colectiei sta pe fraza "agentul TAU munceste".
 */
import { describe, expect, it } from 'vitest'
import { parseEther } from 'viem'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Ledger } from '../../src/ledger/db.js'

const W1 = '0x1111111111111111111111111111111111111111'
const W2 = '0x2222222222222222222222222222222222222222'
const OWNER = '0x3333333333333333333333333333333333333333'

function seed() {
  const l = new Ledger(':memory:')
  const run = l.startRun('profit', false)
  const add = (agentId: number | null, tokenId: string, wallet: string, value: string, tip: string) =>
    l.recordDelivery({
      runId: run,
      agentId,
      tokenId,
      wallet,
      owner: OWNER,
      valueWei: parseEther(value),
      nativeWei: parseEther(value),
      tipWei: parseEther(tip),
      gasWei: parseEther('0.00001'),
      txHash: '0x' + tokenId.padStart(64, '0'),
      blockNumber: 1n,
      status: 'confirmed',
      reason: null
    })
  add(0, '1', W1, '1.0', '0.01')
  add(0, '2', W1, '2.0', '0.02')
  add(7, '3', W2, '5.0', '0.05')
  add(null, '4', W2, '9.0', '0.09') // dinainte de atribuire
  return l
}

describe('socoteala pe agent', () => {
  it('numara doar ce a facut agentul cerut', () => {
    const l = seed()
    const a0 = l.agentTotals(0)
    expect(a0.deliveries).toBe(2)
    expect(a0.valueWei).toBe(parseEther('3'))
    expect(a0.tipsWei).toBe(parseEther('0.03'))
    expect(a0.wallets).toBe(1)
    expect(a0.netWei).toBe(a0.tipsWei - a0.gasWei)
    l.close()
  })

  it('nu amesteca agentii intre ei', () => {
    const l = seed()
    expect(l.agentTotals(7).deliveries).toBe(1)
    expect(l.agentTotals(99).deliveries).toBe(0)
    l.close()
  })

  it('livrarile fara agent nu se lipesc de nimeni', () => {
    const l = seed()
    const total = l.totals(0)
    expect(total.deliveries).toBe(4)
    const sum = l.agentTotals(0).deliveries + l.agentTotals(7).deliveries
    expect(sum).toBe(3) // a patra ramane neatribuita, si asa trebuie
    l.close()
  })

  it('clasamentul ordoneaza dupa cat s-a castigat, nu dupa cate livrari', () => {
    const l = seed()
    const board = l.leaderboard()
    expect(board.map((r) => r.agentId)).toEqual([7, 0])
    expect(board[0]!.tipsWei).toBe(parseEther('0.05'))
    l.close()
  })

  it('istoricul unui agent e doar al lui, cel mai nou primul', () => {
    const l = seed()
    const h = l.agentHistory(0)
    expect(h.length).toBe(2)
    expect(h.every((x) => ['1', '2'].includes(x.tokenId))).toBe(true)
    l.close()
  })
})

describe('vederea pe portofel', () => {
  it('gaseste si dupa portofelul brokerului, si dupa proprietar', () => {
    const l = seed()
    expect(l.walletView(W1).delivered.count).toBe(2)
    expect(l.walletView(OWNER).delivered.count).toBe(4) // proprietarul tuturor
    expect(l.walletView(W1.toUpperCase()).delivered.count).toBe(2) // fara sa conteze majusculele
    l.close()
  })

  it('arata si ce mai are de luat, cu vechime', () => {
    const l = seed()
    l.seeClaim('50', W1, OWNER, parseEther('0.5'), parseEther('0.5'))
    const v = l.walletView(W1)
    expect(v.pending.length).toBe(1)
    expect(v.pending[0]!.valueWei).toBe(parseEther('0.5'))
    expect(v.pending[0]!.ageDays).toBe(0)
    l.close()
  })

  it('o adresa fara nimic nu inventeaza date', () => {
    const l = seed()
    const v = l.walletView('0x9999999999999999999999999999999999999999')
    expect(v.delivered.count).toBe(0)
    expect(v.pending).toEqual([])
    expect(v.history).toEqual([])
    l.close()
  })
})

describe('baze vechi', () => {
  it('primesc coloana agentului la pornire, fara sa se piarda randurile', () => {
    /* o baza ADEVARATA in forma dinainte de atribuire, pe disc, ca sa poata fi
       redeschisa. Cu :memory: nu s-ar testa nimic: fiecare deschidere e o baza
       noua, deci migrarea ar trece degeaba. */
    const dir = mkdtempSync(join(tmpdir(), 'courier-mig-'))
    const file = join(dir, 'old.db')
    const old = new DatabaseSync(file)
    old.exec(`CREATE TABLE deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL, token_id TEXT NOT NULL,
      wallet TEXT NOT NULL, owner TEXT, value_wei TEXT NOT NULL DEFAULT '0',
      native_wei TEXT NOT NULL DEFAULT '0', tip_wei TEXT NOT NULL DEFAULT '0',
      gas_wei TEXT NOT NULL DEFAULT '0', tx_hash TEXT, block_number TEXT,
      status TEXT NOT NULL, reason TEXT, created_at INTEGER NOT NULL)`)
    old.exec(`INSERT INTO deliveries (run_id, token_id, wallet, value_wei, tip_wei, status, created_at)
      VALUES (1, '9', '${W1}', '1000000000000000000', '10000000000000000', 'confirmed', 1)`)
    const before = (old.prepare('PRAGMA table_info(deliveries)').all() as Array<{ name: string }>).map((c) => c.name)
    expect(before.includes('agent_id')).toBe(false)
    old.close()

    const l = new Ledger(file)
    const after = (l.raw().prepare('PRAGMA table_info(deliveries)').all() as Array<{ name: string }>).map((c) => c.name)
    expect(after.includes('agent_id')).toBe(true)

    // randul vechi e intact, doar ca fara agent, si asa trebuie
    const t = l.totals(0)
    expect(t.deliveries).toBe(1)
    expect(t.valueWei).toBe(parseEther('1'))
    expect(l.leaderboard().length).toBe(0)
    l.close()
    rmSync(dir, { recursive: true, force: true })
  })
})
