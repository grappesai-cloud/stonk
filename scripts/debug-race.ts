import { parseEther } from 'viem'
import { ANVIL_KEY_2, artifact, deploy, mine, pendingCount, rigOf, send, setAutomine, sleep, startAnvil, writeTestConfig } from '../test/e2e/harness.js'
import { buildContext } from '../src/core/context.js'
import { runOnce } from '../src/core/runner.js'
import { RaceBook } from '../src/core/race.js'

const anvil = await startAnvil(8698, { order: 'fees' })
const rig = await rigOf(anvil)
const clockAbi = artifact('MockClock.sol', 'MockClock').abi
const clock = await deploy(rig, artifact('MockClock.sol', 'MockClock'), [0n, parseEther('0.01'), 500n])
await setAutomine(rig.url, false)
writeTestConfig('./data/test/dbg.json', 'ringer', rig, clock, {
  execution: { dryRun: false, maxPriorityFeePerGasWei: '10000000000' },
  job: { race: { priorityBumpBps: 0 } }
})
const ctx = buildContext('./data/test/dbg.json')
const book = new RaceBook(ctx.cfg, ctx.ledger, ctx.job, ctx.jobCfg)

await send(rig, clock, clockAbi, 'fund', [], { value: parseEther('1'), wait: false })
await mine(rig.url)
console.log('pot funded, pending =', await pendingCount(rig.url))

await send(rig, clock, clockAbi, 'clockIn', [], { key: ANVIL_KEY_2, maxPriorityFeePerGas: 1_000_000_000n, wait: false })
console.log('rival submitted, pending =', await pendingCount(rig.url))

const running = runOnce(ctx, { race: book })
for (let i = 0; i < 20; i++) {
  await sleep(150)
  const p = await pendingCount(rig.url)
  console.log(`t+${(i + 1) * 150}ms pending=${p}`)
  if (p >= 2) break
}
await mine(rig.url)
const o = await running
console.log('outcome', { done: o.done, candidates: o.candidates, simulatedOk: o.simulatedOk, stoppedBy: o.stoppedBy, races: o.racesRecorded })
console.log('events', ctx.ledger.recentEvents(5))
const head = await rig.client.getBlockNumber()
console.log('head', head)
const logs = await rig.client.getLogs({ address: clock, fromBlock: 0n, toBlock: head })
console.log('logs', logs.map((l) => ({ b: l.blockNumber, t: l.topics[0]?.slice(0, 12) })))
console.log('races', ctx.ledger.recentRaces(5))
ctx.ledger.close()
anvil.stop()
