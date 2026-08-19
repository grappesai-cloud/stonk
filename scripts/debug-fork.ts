import { parseEther } from 'viem'
import { ANVIL_KEY_3, artifact, deploy, rigOf, send, startAnvil, writeTestConfig } from '../test/e2e/harness.js'
import { buildContext } from '../src/core/context.js'
import { runOnce } from '../src/core/runner.js'

const anvil = await startAnvil(8697, { forkUrl: 'https://rpc.mainnet.chain.robinhood.com' })
const rig = await rigOf(anvil, 4663)
const clockAbi = artifact('MockClock.sol', 'MockClock').abi
const clock = await deploy(rig, artifact('MockClock.sol', 'MockClock'), [60n, parseEther('0.0001'), 500n])
writeTestConfig('./data/test/dbgfork.json', 'ringer', rig, clock, { execution: { dryRun: false } })
const ctx = buildContext('./data/test/dbgfork.json')
await send(rig, clock, clockAbi, 'fund', [], { key: ANVIL_KEY_3, value: parseEther('0.5') })
const potBefore = await rig.client.readContract({ address: clock, abi: clockAbi, functionName: 'pot' })
const cBal = await rig.client.getBalance({ address: clock })
console.log('pot before', potBefore, 'contract balance', cBal, 'canClockIn', await rig.client.readContract({ address: clock, abi: clockAbi, functionName: 'canClockIn' }))
const before = await rig.client.getBalance({ address: rig.operator })
const o = await runOnce(ctx)
const after = await rig.client.getBalance({ address: rig.operator })
console.log('done', o.done, 'reward', o.rewardWei, 'gas', o.gasWei, 'stoppedBy', o.stoppedBy)
console.log('before', before, 'after', after, 'delta', after - before)
const logs = await rig.client.getLogs({ address: clock, fromBlock: 0n, toBlock: await rig.client.getBlockNumber() })
console.log('logs', logs.length, logs.map((l) => l.data))
console.log('pot after', await rig.client.readContract({ address: clock, abi: clockAbi, functionName: 'pot' }), 'contract bal after', await rig.client.getBalance({ address: clock }))
const ev = ctx.ledger.recentEvents(3)
console.log('ledger', ev.map((e) => ({ k: e.kind, tx: e.txHash })))
const tx = await rig.client.getTransactionReceipt({ hash: ev[0]!.txHash as `0x${string}` })
console.log('receipt from', tx.from, 'to', tx.to, 'status', tx.status)
console.log('operator', rig.operator, 'balance now', await rig.client.getBalance({ address: rig.operator }))
const bn = tx.blockNumber
for (const b of [bn - 1n, bn, bn + 0n]) {
  try {
    console.log('balance at block', b, await rig.client.getBalance({ address: rig.operator, blockNumber: b }))
  } catch (e) { console.log('block', b, (e as Error).message.slice(0, 60)) }
}
console.log('head', await rig.client.getBlockNumber())
console.log('gasPrice', await rig.client.getGasPrice(), 'baseFee', (await rig.client.getBlock()).baseFeePerGas)
ctx.ledger.close(); anvil.stop()
