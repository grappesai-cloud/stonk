/**
 * Panourile, cu date de proba, ca sa poata fi privite si apasate inainte sa
 * existe contractele adevarate.
 *
 *   npx tsx scripts/demo-api.ts
 *   public:  http://127.0.0.1:8890
 *   consola: http://127.0.0.1:8891/?token=demo
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { parseEther } from 'viem'
import { buildContext } from '../src/core/context.js'
import { startServer } from '../src/core/api/server.js'

const DIR = './data/demo'
mkdirSync(DIR, { recursive: true })
const file = `${DIR}/demo.json`
writeFileSync(
  file,
  JSON.stringify(
    {
      agent: { kind: 'ringer', id: 204, name: 'RINGER #0204' },
      network: { name: 'robinhood', chainId: 4663, rpc: ['https://rpc.mainnet.chain.robinhood.com'], explorer: 'https://explorer.mainnet.chain.robinhood.com' },
      target: { address: '0x00000000000000000000000000000000000000A1' },
      job: { action: { signature: 'function clockIn()' } },
      execution: { dryRun: false },
      api: { enabled: true, host: '127.0.0.1', port: 8890 },
      console: { enabled: true, host: '127.0.0.1', port: 8891, token: 'demo' },
      storage: { file: `${DIR}/demo.db`, backup: { enabled: false } }
    },
    null,
    2
  )
)

const ctx = buildContext(file)
const now = Math.floor(Date.now() / 1000)
const rival = '0x9c8Ff314C9Bc7F6e59A9d9225Fb22946427eDC03'

/* cateva apasari castigate si cateva pierdute, ca pagina sa arate ce arata in
   realitate: si ce s-a luat, si ce a luat altcineva */
for (let i = 0; i < 6; i++) {
  const run = ctx.ledger.startRun('ringer', 'profit', false)
  const tx = `0x${(i + 1).toString(16).padStart(64, '0')}`
  ctx.ledger.recordJob({
    runId: run,
    agentId: 204,
    key: 'clockin',
    label: 'CLOCK IN',
    stakeWei: parseEther('1.2'),
    rewardWei: 0n,
    gasWei: 0n,
    txHash: tx,
    blockNumber: null,
    status: 'sent',
    reason: null
  })
  ctx.ledger.settleTx(tx, {
    gasWei: parseEther('0.00004'),
    rewardWei: parseEther('0.06'),
    blockNumber: BigInt(40_000_000 + i),
    status: 'confirmed'
  })
  ctx.ledger.recordRace({
    key: 'clockin',
    blockNumber: BigInt(40_000_000 + i),
    winner: 'us',
    wanted: true,
    sent: true,
    ourGasPriceWei: 2_400_000_000n,
    winnerGasPriceWei: 2_400_000_000n,
    blocksLate: 0,
    latencyMs: 380 + i * 12,
    txHash: tx,
    note: null
  })
  ctx.ledger.finishRun(run, {
    seen: 1,
    candidates: 1,
    done: 1,
    failed: 0,
    gasWei: parseEther('0.00004'),
    rewardWei: parseEther('0.06'),
    note: null
  })
}

for (let i = 0; i < 3; i++) {
  ctx.ledger.recordRace({
    key: 'clockin',
    blockNumber: BigInt(40_000_100 + i),
    winner: rival,
    wanted: true,
    sent: i === 0,
    ourGasPriceWei: 2_400_000_000n,
    winnerGasPriceWei: 9_100_000_000n + BigInt(i) * 10_000_000n,
    blocksLate: 1,
    latencyMs: 410,
    txHash: `0xbb${i.toString(16).padStart(62, '0')}`,
    note: i === 0 ? 'we sent and still lost' : 'we saw it and did not send'
  })
}

const run = ctx.ledger.startRun('ringer', 'profit', false)
for (const [key, reason] of [
  ['clockin', 'unprofitable: reward 210000000000000 below 240000000000000 (gas 160000000000000 x 1.5)'],
  ['clockin', 'cooldown: 40s < 60s'],
  ['clockin', 'gas-price-cap: 12000000000 above cap 8000000000']
] as const) {
  ctx.ledger.recordJob({
    runId: run,
    agentId: 204,
    key,
    label: 'CLOCK IN',
    stakeWei: parseEther('0.4'),
    rewardWei: 0n,
    gasWei: 0n,
    txHash: null,
    blockNumber: null,
    status: 'skipped',
    reason
  })
}
ctx.ledger.finishRun(run, { seen: 1, candidates: 0, done: 0, failed: 3, gasWei: 0n, rewardWei: 0n, note: null })
ctx.ledger.seeOpportunity('clockin', 'CLOCK IN', parseEther('0.4'), parseEther('0.02'))

startServer(ctx, 'public')
startServer(ctx, 'console')
process.stdout.write(`public:  http://127.0.0.1:8890\nconsola: http://127.0.0.1:8891/?token=demo\n`)
