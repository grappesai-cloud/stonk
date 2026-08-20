import { createPublicClient, http, type Address } from 'viem'
const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const CLOCK = '0x55642A3F10F1Af5145D3d59021B1D6b03BB8692c' as Address
const client = createPublicClient({ chain: { id: 4663, name: 'rh', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as never, transport: http(RPC) })
const head = await client.getBlockNumber()
for (const step of [40_000n, 60_000n, 100_000n]) {
  const from = head - 400_000n
  try {
    const logs = await client.getLogs({ address: CLOCK, fromBlock: from, toBlock: from + step - 1n })
    console.log(`  pas ${step}: ${logs.length} jurnale`)
  } catch (e) {
    console.log(`  pas ${step}: EROARE ${(e as Error).message.split("\n")[0].slice(0, 70)}`)
  }
}
