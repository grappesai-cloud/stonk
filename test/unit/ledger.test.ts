import { describe, expect, it, beforeEach } from 'vitest'
import { Ledger } from '../../src/core/ledger/db.js'

let led: Ledger
const row = (over: Record<string, unknown> = {}) => ({
  runId: 1,
  agentId: 0,
  key: 'k1',
  label: 'K1',
  stakeWei: 100n,
  rewardWei: 0n,
  costWei: 0n,
  gasWei: 0n,
  txHash: null as string | null,
  blockNumber: null as bigint | null,
  status: 'sent' as const,
  reason: null as string | null,
  ...over
})

beforeEach(() => {
  led = new Ledger(':memory:')
})

describe('registrul', () => {
  it('imparte gazul si castigul pe randurile unei tranzactii, CU REST', () => {
    led.recordJob(row({ key: 'a', txHash: '0xaa' }))
    led.recordJob(row({ key: 'b', txHash: '0xaa' }))
    led.recordJob(row({ key: 'c', txHash: '0xaa' }))
    led.settleTx('0xaa', { gasWei: 100n, rewardWei: 10n, costWei: 7n, blockNumber: 5n, status: 'confirmed' })
    const t = led.totals()
    /* nimic nu se pierde prin impartire: 100/3, 10/3 si 7/3 se intorc intregi */
    expect(t.gasWei).toBe(100n)
    expect(t.rewardWei).toBe(10n)
    expect(t.costWei).toBe(7n)
    expect(t.done).toBe(3)
    /* si netul scade si ce a plecat din portofel, nu doar gazul */
    expect(t.netWei).toBe(10n - 7n - 100n)
  })

  it('nu scrie de doua ori aceeasi bucata pentru aceeasi tranzactie', () => {
    led.recordJob(row({ txHash: '0xbb' }))
    led.recordJob(row({ txHash: '0xbb' }))
    expect(led.keysOfTx('0xbb').length).toBe(1)
  })

  it('stie ce a ramas nefacut si de cand', () => {
    led.seeOpportunity('r1', 'ROUND 1', 500n, 10n)
    led.seeOpportunity('r2', 'ROUND 2', 700n, 20n)
    expect(led.openTotals()).toMatchObject({ count: 2, stakeWei: 1200n })
    led.clearOpportunity('r1')
    expect(led.openTotals().count).toBe(1)
  })

  it('spune ce s-a schimbat de la ultima privire, nu doar ce vede acum', () => {
    expect(led.seeOpportunity('r1', 'R', 100n, 1n).isNew).toBe(true)
    const again = led.seeOpportunity('r1', 'R', 250n, 1n)
    expect(again.isNew).toBe(false)
    expect(again.deltaWei).toBe(150n)
  })

  it('o ocazie inchisa si redeschisa se socoteste din nou noua', () => {
    led.seeOpportunity('r1', 'R', 100n, 1n)
    led.clearOpportunity('r1')
    expect(led.seeOpportunity('r1', 'R', 100n, 1n).isNew).toBe(true)
  })

  it('tine minte cursele si scoate din ele o rata de castig', () => {
    const r = (winner: string, ourGas: bigint, theirGas: bigint, tx: string) =>
      led.recordRace({
        key: 'clockin',
        blockNumber: 1n,
        winner,
        wanted: true,
        sent: winner === 'us',
        ourGasPriceWei: ourGas,
        winnerGasPriceWei: theirGas,
        blocksLate: 0,
        latencyMs: 120,
        txHash: tx,
        note: null
      })
    r('us', 10n, 10n, '0x1')
    r('0xrival1', 10n, 30n, '0x2')
    r('0xrival1', 10n, 50n, '0x3')
    r('0xrival2', 10n, 40n, '0x4')
    const s = led.raceStats()
    expect(s.total).toBe(4)
    expect(s.won).toBe(1)
    expect(s.winRate).toBe(0.25)
    expect(s.competitors).toBe(2)
    /* cifra din care se decide daca merita urcat bacsisul */
    expect(s.medianWinnerGasPriceWei).toBe(40n)
    expect(s.medianLatencyMs).toBe(120)
  })

  it('nu inregistreaza de doua ori aceeasi cursa, chiar daca o vede de doua ori', () => {
    const one = {
      key: 'clockin',
      blockNumber: 1n,
      winner: 'us',
      wanted: true,
      sent: true,
      ourGasPriceWei: 1n,
      winnerGasPriceWei: 1n,
      blocksLate: 0,
      latencyMs: null,
      txHash: '0xsame',
      note: null
    }
    led.recordRace(one)
    led.recordRace(one)
    expect(led.raceStats().total).toBe(1)
  })

  it('grupeaza motivele pentru care NU s-a lucrat', () => {
    led.recordJob(row({ status: 'skipped', reason: 'cooldown' }))
    led.recordJob(row({ key: 'k2', status: 'skipped', reason: 'cooldown' }))
    led.recordJob(row({ key: 'k3', status: 'skipped', reason: 'gas-price-cap' }))
    const r = led.skipReasons()
    expect(r[0]).toEqual({ reason: 'cooldown', count: 2 })
  })

  it('fluxul de evenimente arata si ce s-a sarit, nu doar reusitele', () => {
    led.recordJob(row({ key: 'ok1', txHash: '0xc1' }))
    led.settleTx('0xc1', { gasWei: 1n, rewardWei: 2n, blockNumber: 1n, status: 'confirmed' })
    led.recordJob(row({ key: 'no1', status: 'skipped', reason: 'unprofitable' }))
    const kinds = led.recentEvents(10).map((e) => e.kind)
    expect(kinds).toContain('work')
    expect(kinds).toContain('skip')
  })

  it('sumele mari trec neatinse prin baza', () => {
    const huge = 123456789012345678901234567890n
    led.recordJob(row({ txHash: '0xd1' }))
    led.settleTx('0xd1', { gasWei: 0n, rewardWei: huge, blockNumber: null, status: 'confirmed' })
    expect(led.totals().rewardWei).toBe(huge)
  })
})

describe('indexul arata prezentul', () => {
  it('inchide ce nu s-a mai vazut la rularea asta', () => {
    led.seeOpportunity('a', 'A', 10n, 0n)
    led.seeOpportunity('b', 'B', 20n, 0n)
    led.seeOpportunity('c', 'C', 30n, 0n)
    expect(led.openTotals().count).toBe(3)
    /* a doua rulare vede doar doua dintre ele */
    const closed = led.closeUnseen(['a', 'c'])
    expect(closed).toBe(1)
    expect(led.openTotals().count).toBe(2)
    expect(led.openList(10).map((o) => o.key).sort()).toEqual(['a', 'c'])
  })

  it('o rulare in curs nu se ia drept masuratoare', () => {
    const running = led.startRun('courier', 'campaign', true)
    expect(led.lastFinishedRun()).toBeNull()
    led.finishRun(running, { seen: 7, candidates: 5, done: 0, failed: 0, gasWei: 0n, rewardWei: 0n, costWei: 0n })
    led.startRun('courier', 'campaign', true)
    /* cea noua e in curs, deci raspunsul ramane cea terminata */
    expect(led.lastFinishedRun()?.seen).toBe(7)
  })
})
