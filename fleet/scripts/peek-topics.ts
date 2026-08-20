import { createPublicClient, http, parseAbi, toEventSelector, type Address } from 'viem'
const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const CLOCK = '0x55642A3F10F1Af5145D3d59021B1D6b03BB8692c' as Address
const client = createPublicClient({ chain: { id: 4663, name: 'rh', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as never, transport: http(RPC) })
const head = await client.getBlockNumber()
const logs = await client.getLogs({ address: CLOCK, fromBlock: head - 400_000n, toBlock: head - 340_000n })
console.log('jurnale brute:', logs.length)
const counts = new Map<string, number>()
for (const l of logs) counts.set(l.topics[0] ?? '?', (counts.get(l.topics[0] ?? '?') ?? 0) + 1)
for (const [t, c] of counts) console.log('  ', t, c)
for (const sig of [
  'event ClockedIn(address token, uint64 round, uint256 tokenId, address wallet, uint256 amount)',
  'event ClockedIn(address indexed token, uint64 indexed round, uint256 indexed tokenId, address wallet, uint256 amount)',
  'event RoundStarted(address token, uint64 round, uint256 pot, uint256 totalWeight)'
]) console.log('  calculat:', toEventSelector(parseAbi([sig])[0]), sig.slice(6, 40))
