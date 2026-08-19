import { parseEther } from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { ANVIL_KEY_3, artifact, deploy, rigOf, rpc, send, startAnvil, writeTestConfig } from '../test/e2e/harness.js'
import { buildContext } from '../src/core/context.js'
import { runOnce } from '../src/core/runner.js'

const anvil = await startAnvil(8696, { forkUrl: 'https://rpc.mainnet.chain.robinhood.com' })
const rig = await rigOf(anvil, 4663)
const clockAbi = artifact('MockClock.sol', 'MockClock').abi
const clock = await deploy(rig, artifact('MockClock.sol', 'MockClock'), [60n, parseEther('0.0001'), 500n])

const key = generatePrivateKey()
const fresh = privateKeyToAccount(key)
console.log('fresh operator', fresh.address, 'code on chain:', await rig.client.getCode({ address: fresh.address }))
await rpc(rig.url, 'anvil_setBalance', [fresh.address, '0x' + parseEther('1').toString(16)])

writeTestConfig('./data/test/dbg7702.json', 'ringer', rig, clock, {
  execution: { dryRun: false, privateKey: key }
})
const ctx = buildContext('./data/test/dbg7702.json')
await send(rig, clock, clockAbi, 'fund', [], { key: ANVIL_KEY_3, value: parseEther('0.5') })
const before = await rig.client.getBalance({ address: fresh.address })
const o = await runOnce(ctx)
const after = await rig.client.getBalance({ address: fresh.address })
console.log('done', o.done, 'reward', o.rewardWei, 'gas', o.gasWei)
console.log('delta', after - before, 'expected ~', o.rewardWei - o.gasWei)
ctx.ledger.close(); anvil.stop()
