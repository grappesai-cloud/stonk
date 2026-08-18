/**
 * Porneste API-ul pe un registru cu date de proba, ca sa se poata vedea pagina
 * inainte sa existe contractele reale. Nu atinge lantul.
 *   npx tsx scripts/demo-api.ts
 */
import { parseEther } from 'viem'
import { loadConfig } from '../src/config.js'
import { Ledger } from '../src/ledger/db.js'
import { Telegram } from '../src/alerts/telegram.js'
import { publicClientOf } from '../src/chain/client.js'
import { createApi } from '../src/api/server.js'

const cfg = loadConfig('./config/robinhood.example.json')
cfg.storage.file = ':memory:'
cfg.api.port = 8788

const ledger = new Ledger(':memory:')
const run = ledger.startRun('campaign', false)

const rnd = (seed: number) => {
  let x = seed
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648
    return x / 2147483648
  }
}
const r = rnd(42)
const addr = (i: number) => ('0x' + (i * 7919).toString(16).padStart(40, 'c')).slice(0, 42)

// nerevendicate
for (let i = 1; i <= 40; i++) {
  ledger.seeClaim(String(i), addr(i), addr(i + 500), parseEther((r() * 2 + 0.01).toFixed(6)), parseEther('0.01'))
}
// livrate deja
for (let i = 100; i < 118; i++) {
  ledger.recordDelivery({
    runId: run,
    tokenId: String(i),
    wallet: addr(i),
    owner: addr(i + 500),
    valueWei: parseEther((r() * 0.8 + 0.02).toFixed(6)),
    nativeWei: parseEther('0.02'),
    tipWei: parseEther('0.0004'),
    gasWei: parseEther('0.0000021'),
    txHash: '0x' + i.toString(16).padStart(64, 'a'),
    blockNumber: 40000000n + BigInt(i),
    status: 'confirmed',
    reason: null
  })
}

const ctx = { cfg, client: publicClientOf(cfg), account: null, wallet: null, ledger, tg: new Telegram(cfg, ledger) }
createApi(ctx).listen(cfg.api.port, '127.0.0.1', () => {
  process.stdout.write(`demo pe http://127.0.0.1:${cfg.api.port}/\n`)
})
