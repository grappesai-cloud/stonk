import { createPublicClient, http, parseAbi, formatEther, keccak256, toHex, type Address } from 'viem'

const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const B = '0x1f12fe622c11947f93F53d63f68f7F46B6D081c9' as Address
const MULTICALL = '0xcA11bde05977b3631167028862bE2a173976CA11' as Address
const STRANGER = '0x000000000000000000000000000000000000dEaD' as Address

const client = createPublicClient({
  chain: { id: 4663, name: 'rh', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } }, contracts: { multicall3: { address: MULTICALL } } } as never,
  transport: http(RPC, { batch: true })
})

const abi = parseAbi([
  'function ethCredit(uint256) view returns (uint256)',
  'function creditsOf(uint256 tokenId, address[] tokens) view returns (uint256[] amounts, uint256 owedEth)',
  'function deliver(uint256 tokenId, address[] tokens)',
  'function deliverBatch(uint256[] tokenIds, address[] tokens)',
  'function crank(uint256 maxRecipients, uint256 deadline)'
])

// selectorii erorilor, ca sa stim ce ne spune contractul
for (const e of ['DropBelowThreshold()', 'DropRoundInProgress()', 'NoActiveWeight()', 'PublicStartNotConfigured()', 'Unauthorized()', 'InvalidConfig()']) {
  console.log('  selector', keccak256(toHex(e)).slice(0, 10), e)
}

const ids = Array.from({ length: 900 }, (_, i) => BigInt(i + 1))
const res = await client.multicall({
  contracts: ids.map((id) => ({ address: B, abi, functionName: 'ethCredit', args: [id] })),
  allowFailure: true
})
const owed = ids
  .map((id, i) => ({ id, wei: res[i]!.status === 'success' ? (res[i]!.result as bigint) : 0n }))
  .filter((r) => r.wei > 0n)
  .sort((a, b) => (a.wei > b.wei ? -1 : 1))

console.log(`\nbrokeri cu ETH nerevendicat, din primii 900: ${owed.length}`)
for (const o of owed.slice(0, 8)) console.log('  #' + o.id, formatEther(o.wei), 'ETH')

if (owed.length > 0) {
  const target = owed[0]!.id
  console.log(`\n=== deliver(#${target}) simulat DIN CONT STRAIN ===`)
  try {
    await client.simulateContract({ address: B, abi, functionName: 'deliver', args: [target, []], account: STRANGER })
    console.log('  TRECE: un strain poate livra')
  } catch (e) {
    console.log('  respins:', (e as Error).message.split('\n')[0])
  }
  console.log(`=== deliverBatch cu ${Math.min(owed.length, 25)} brokeri, tot din cont strain ===`)
  try {
    await client.simulateContract({
      address: B,
      abi,
      functionName: 'deliverBatch',
      args: [owed.slice(0, 25).map((o) => o.id), []],
      account: STRANGER
    })
    console.log('  TRECE: lotul merge dintr-un cont strain')
  } catch (e) {
    console.log('  respins:', (e as Error).message.split('\n')[0])
  }
}
