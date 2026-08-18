import { describe, expect, it } from 'vitest'
import { parseEther } from 'viem'
import { Ledger } from '../../src/ledger/db.js'

const W1 = '0x1111111111111111111111111111111111111111'
const W2 = '0x2222222222222222222222222222222222222222'
const OWNER = '0x3333333333333333333333333333333333333333'

function led() {
  return new Ledger(':memory:')
}

describe('registrul', () => {
  it('tine sumele in wei fara sa piarda nimic pe drum', () => {
    const l = led()
    const run = l.startRun('profit', false)
    const huge = 123456789012345678901234567890n
    l.recordDelivery({
      runId: run,
      tokenId: '1',
      wallet: W1,
      owner: OWNER,
      valueWei: huge,
      nativeWei: huge,
      tipWei: 7n,
      gasWei: 3n,
      txHash: '0xaa',
      blockNumber: 10n,
      status: 'confirmed',
      reason: null
    })
    const t = l.totals(0)
    expect(t.valueWei).toBe(huge)
    expect(t.netWei).toBe(4n)
    l.close()
  })

  it('nu inregistreaza de doua ori aceeasi livrare din aceeasi tranzactie', () => {
    const l = led()
    const run = l.startRun('profit', false)
    const row = {
      runId: run,
      tokenId: '5',
      wallet: W1,
      owner: null,
      valueWei: 1n,
      nativeWei: 1n,
      tipWei: 0n,
      gasWei: 0n,
      txHash: '0xdup',
      blockNumber: null,
      status: 'sent' as const,
      reason: null
    }
    l.recordDelivery(row)
    l.recordDelivery(row)
    expect(l.totals(0).deliveries).toBe(1)
    l.close()
  })

  it('imparte gazul si bacsisul pe livrarile din tranzactie, cu rest', () => {
    const l = led()
    const run = l.startRun('profit', false)
    for (const id of ['1', '2', '3']) {
      l.recordDelivery({
        runId: run, tokenId: id, wallet: W1, owner: null, valueWei: 0n, nativeWei: 0n,
        tipWei: 0n, gasWei: 0n, txHash: '0xbatch', blockNumber: null, status: 'sent', reason: null
      })
    }
    l.settleTx('0xbatch', { gasWei: 100n, tipWei: 10n, blockNumber: 5n, status: 'confirmed' })
    const t = l.totals(0)
    // suma bucatilor e exact totalul, nimic pierdut la impartire
    expect(t.gasWei).toBe(100n)
    expect(t.tipsWei).toBe(10n)
    l.close()
  })

  it('peretele uitatilor creste, apoi se goleste dupa livrare', () => {
    const l = led()
    l.seeClaim('1', W1, OWNER, parseEther('0.5'), parseEther('0.5'))
    l.seeClaim('2', W2, OWNER, parseEther('1.5'), parseEther('1.5'))
    let w = l.wallTotals()
    expect(w.count).toBe(2)
    expect(w.valueWei).toBe(parseEther('2'))
    expect(l.wall(10)[0]?.tokenId).toBe('2') // cel mai gras primul

    l.clearClaim('2')
    w = l.wallTotals()
    expect(w.count).toBe(1)
    expect(w.valueWei).toBe(parseEther('0.5'))
    l.close()
  })

  it('o revedere actualizeaza valoarea, nu adauga un rand nou', () => {
    const l = led()
    l.seeClaim('1', W1, OWNER, 100n, 100n)
    l.seeClaim('1', W1, OWNER, 300n, 300n)
    expect(l.wallTotals().count).toBe(1)
    expect(l.wallTotals().valueWei).toBe(300n)
    l.close()
  })

  it('numara doar livrarile reale la calculul pauzei', () => {
    const l = led()
    const run = l.startRun('profit', true)
    l.recordDelivery({
      runId: run, tokenId: '9', wallet: W1, owner: null, valueWei: 1n, nativeWei: 1n,
      tipWei: 0n, gasWei: 0n, txHash: null, blockNumber: null, status: 'dry', reason: 'uscat'
    })
    expect(l.lastDeliveryAt('9')).toBe(null)
    l.close()
  })

  it('urmaritorii sunt legati de adresa, cu limite pe ambele capete', () => {
    const l = led()
    l.addWatcher('chat1', W1.toUpperCase(), null)
    l.addWatcher('chat2', W1, null)
    l.addWatcher('chat1', W2, null)
    expect(l.watchersOf(W1).sort()).toEqual(['chat1', 'chat2'])
    expect(l.countAddressesOfChat('chat1')).toBe(2)
    expect(l.countWatchersOfAddress(W1)).toBe(2)
    expect(l.removeWatcher('chat1', null)).toBe(2)
    expect(l.addressesOf('chat1')).toEqual([])
    l.close()
  })
})
