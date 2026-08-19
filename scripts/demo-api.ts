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
import { createConsole } from '../src/console/server.js'
import { Controller } from '../src/control.js'

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
const r2 = rnd(7)
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

// cateva rulari si motive de sarire, ca sa aiba consola ce arata
ledger.finishRun(run, {
  scanned: 5000, candidates: 62, delivered: 18, failed: 44,
  gasWei: parseEther('0.000038'), tipsWei: parseEther('0.0072'), valueWei: parseEther('4.31'), note: null
})
for (let i = 0; i < 4; i++) {
  const r2 = ledger.startRun(i % 2 ? 'campaign' : 'profit', i === 3)
  ledger.finishRun(r2, {
    scanned: 5000, candidates: 40 - i * 7, delivered: 12 - i * 3, failed: 8 + i,
    gasWei: parseEther('0.00002'), tipsWei: parseEther('0.004'), valueWei: parseEther('2.2'), note: null
  })
}
for (const [reason, n] of [['sub pragul de valoare', 31], ['pauza intre livrari', 12], ['nu mai era nimic de livrat', 7], ['bacsis sub gaz', 3]] as const) {
  for (let i = 0; i < n; i++) {
    ledger.recordDelivery({
      runId: run, tokenId: String(900 + i), wallet: addr(900 + i), owner: null,
      valueWei: 0n, nativeWei: 0n, tipWei: 0n, gasWei: 0n, txHash: null, blockNumber: null,
      status: 'skipped', reason
    })
  }
}

/* Evenimentele primesc ceasuri diferite, imprastiate pe ultima ora, altfel
   logul arata ca o singura secunda in care s-a intamplat tot. */
const nowSec = Math.floor(Date.now() / 1000)
const rows = ledger.raw().prepare('SELECT id FROM deliveries ORDER BY id').all() as Array<{ id: number }>
const stamp = ledger.raw().prepare('UPDATE deliveries SET created_at=? WHERE id=?')
/* imprastiate aleator pe ultima ora, ca livrarile si sariturile sa se
   intrepatrunda, cum se intampla intr-o rulare adevarata */
rows.forEach((r) => stamp.run(nowSec - Math.floor(r2() * 3600), r.id))

cfg.console.enabled = true
cfg.console.token = 'demo'
cfg.console.port = 8789
cfg.alerts.telegram.gasLowWei = parseEther('0.01')

const control = new Controller()
/* in demo nu exista bucla, deci butoanele de rulare raman inactive, cum trebuie */
const ctx = { cfg, client: publicClientOf(cfg), account: null, wallet: null, ledger, tg: new Telegram(cfg, ledger), control }
createApi(ctx).listen(cfg.api.port, '127.0.0.1', () => {
  process.stdout.write(`peretele pe http://127.0.0.1:${cfg.api.port}/\n`)
})
createConsole(ctx).listen(cfg.console.port, '127.0.0.1', () => {
  process.stdout.write(`consola pe http://127.0.0.1:${cfg.console.port}/?token=demo\n`)
})
