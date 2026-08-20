import { createPublicClient, http, parseAbi, type Address } from 'viem'
const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const B = '0x1f12fe622c11947f93F53d63f68f7F46B6D081c9' as Address
const client = createPublicClient({ chain: { id: 4663, name: 'rh', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as never, transport: http(RPC) })
const evs = {
  DropCredited: parseAbi(['event DropCredited(uint256 round, uint256 tokenId, uint256 ethCredited)'])[0],
  Delivered: parseAbi(['event Delivered(uint256 tokenId, address wallet, address token, uint256 amount)'])[0],
  CreditAccrued: parseAbi(['event CreditAccrued(uint256 round, uint256 tokenId, address token, uint256 amount)'])[0]
}
const head = await client.getBlockNumber()
for (const [name, ev] of Object.entries(evs)) {
  let found = 0
  let sample: unknown = null
  for (const back of [50_000n, 300_000n, 900_000n]) {
    const logs = await client.getLogs({ address: B, event: ev as never, fromBlock: head - back, toBlock: head - back + 45_000n })
    if (logs.length) {
      found = logs.length
      sample = (logs[0] as unknown as { args: unknown }).args
      break
    }
  }
  console.log(`${name}: ${found} in fereastra probata | args:`, JSON.stringify(sample, (_, v) => (typeof v === 'bigint' ? v.toString() : v))?.slice(0, 160))
}
