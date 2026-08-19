/**
 * Cat zace nerevendicat, chiar acum, pe contractul adevarat.
 *
 * Asta e cifra care spune daca serviciul are ce vinde: daca boti straini
 * termina treaba oricum, peretele e gol si un agent nu aduce nimic. Daca
 * ramane in urma, fiecare wei de acolo e un broker care si-a uitat banii.
 */
import { createPublicClient, http, parseAbi, formatEther, type Address } from 'viem'

const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const CLOCK = '0x55642A3F10F1Af5145D3d59021B1D6b03BB8692c' as Address
const MULTICALL = '0xcA11bde05977b3631167028862bE2a173976CA11' as Address

const client = createPublicClient({
  chain: { id: 4663, name: 'rh', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } }, contracts: { multicall3: { address: MULTICALL } } } as never,
  transport: http(RPC, { batch: true })
})

const abi = parseAbi([
  'function rounds(address token) view returns (uint64 round, uint64 startedAt, uint256 pot, uint256 remaining, uint256 totalWeight)',
  'function claimable(address token, uint256 tokenId) view returns (uint256)',
  'function brokerNft() view returns (address)',
  'function ROUND_COOLDOWN() view returns (uint64)',
  'event RoundStarted(address token, uint64 round, uint256 pot, uint256 totalWeight)'
])
const erc20 = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)'])

/* lista jetoanelor o da chiar colectia: stockTokenAt/Count. Mai sigur decat
   sa scormonesc prin evenimente, si e sursa pe care o foloseste protocolul. */
const COLLECTION = '0x539CdD042c2f3d93EbC5BE7DfFf0c79F3B4fAbF0' as Address
const nftAbi = parseAbi([
  'function stockTokenCount() view returns (uint256)',
  'function stockTokenAt(uint256) view returns (address)'
])
const n = (await client.readContract({ address: COLLECTION, abi: nftAbi, functionName: 'stockTokenCount' })) as bigint
const tokens: Address[] = []
for (let i = 0n; i < n; i++) {
  tokens.push((await client.readContract({ address: COLLECTION, abi: nftAbi, functionName: 'stockTokenAt', args: [i] })) as Address)
}
console.log(`jetoane de stoc in colectie: ${tokens.length}\n`)

const cooldown = await client.readContract({ address: CLOCK, abi, functionName: 'ROUND_COOLDOWN' })
console.log('racirea intre runde:', Number(cooldown), 'secunde\n')

let grand = 0n
for (const token of tokens) {
  const [r, sym] = await Promise.all([
    client.readContract({ address: CLOCK, abi, functionName: 'rounds', args: [token] }),
    client.readContract({ address: token, abi: erc20, functionName: 'symbol' }).catch(() => '???')
  ])
  const [round, startedAt, pot, remaining] = r as unknown as [bigint, bigint, bigint, bigint, bigint]
  const ageMin = Math.round((Date.now() / 1000 - Number(startedAt)) / 60)
  console.log(
    `${String(sym).padEnd(12)} runda ${round}  pot ${formatEther(pot).padStart(14)}  RAMAS ${formatEther(remaining).padStart(14)}  (pornita acum ${ageMin} min)`
  )
  grand += remaining
}
console.log(`\nTOTAL NEREVENDICAT ACUM: ${formatEther(grand)} (in unitatile fiecarui jeton, nu ETH)\n`)

/* cati brokeri au ceva de luat, pe jetonul cu cel mai mult ramas */
if (tokens.length > 0) {
  const ids = Array.from({ length: 600 }, (_, i) => BigInt(i + 1))
  for (const token of tokens.slice(0, 3)) {
    const res = await client.multicall({
      contracts: ids.map((id) => ({ address: CLOCK, abi, functionName: 'claimable', args: [token, id] })),
      allowFailure: true
    })
    const owed = res.map((x, i) => ({ id: ids[i]!, wei: x.status === 'success' ? (x.result as bigint) : 0n })).filter((x) => x.wei > 0n)
    const sum = owed.reduce((s, o) => s + o.wei, 0n)
    const sym = await client.readContract({ address: token, abi: erc20, functionName: 'symbol' }).catch(() => token)
    console.log(`${sym}: ${owed.length} brokeri din primii 600 au de luat, total ${formatEther(sum)}`)
    if (owed.length) console.log('   cei mai grasi:', owed.sort((a, b) => (a.wei > b.wei ? -1 : 1)).slice(0, 5).map((o) => `#${o.id}=${formatEther(o.wei)}`).join(' '))
  }
}
