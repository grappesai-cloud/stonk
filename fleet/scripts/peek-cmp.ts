import { createPublicClient, http, parseAbi, toEventSelector, type Address } from 'viem'
const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const CLOCK = '0x55642A3F10F1Af5145D3d59021B1D6b03BB8692c' as Address
const client = createPublicClient({ chain: { id: 4663, name: 'rh', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as never, transport: http(RPC) })
const CLOCKED = parseAbi(['event ClockedIn(address token, uint64 round, uint256 tokenId, address wallet, uint256 amount)'])
const clockedTopic = toEventSelector(CLOCKED[0])
const head = await client.getBlockNumber()
const logs = await client.getLogs({ address: CLOCK, fromBlock: head - 400_000n, toBlock: head - 360_000n })
console.log('asteptat :', clockedTopic)
console.log('primit   :', logs[0]?.topics[0])
console.log('egale?   :', logs[0]?.topics[0] === clockedTopic)
console.log('cate se potrivesc:', logs.filter((l) => l.topics[0] === clockedTopic).length, 'din', logs.length)
const one = logs.find((l) => l.topics[0] === clockedTopic)!
console.log('numar de topicuri:', one.topics.length, '| lungime data:', one.data.length)
import { decodeEventLog as dec } from 'viem'
for (const sig of [
  'event ClockedIn(address token, uint64 round, uint256 tokenId, address wallet, uint256 amount)',
  'event ClockedIn(address indexed token, uint64 indexed round, uint256 indexed tokenId, address wallet, uint256 amount)',
  'event ClockedIn(address indexed token, uint64 round, uint256 indexed tokenId, address wallet, uint256 amount)'
]) {
  try {
    const r = dec({ abi: parseAbi([sig]), data: one.data, topics: one.topics as never }) as unknown as { args: Record<string, unknown> }
    console.log('  MERGE:', sig.slice(6, 52), '->', JSON.stringify(r.args, (_, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 120))
  } catch (e) {
    console.log('  nu :', sig.slice(6, 52), '|', (e as Error).message.split('\n')[0].slice(0, 60))
  }
}
