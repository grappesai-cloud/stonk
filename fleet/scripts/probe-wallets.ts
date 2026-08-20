/**
 * Cine detine NFT-urile si ce zace in portofelele lor 6551.
 *
 * Citirile se fac pe felii, nu intr-un bloc: un multicall de patru mii de
 * apeluri se intoarce cu toate randurile esuate, iar rezultatul arata exact ca
 * "nu detine nimeni nimic". Aia nu e o masuratoare, e o tacere.
 */
import { createPublicClient, http, parseAbi, formatEther, type Address } from 'viem'

const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const V = '0xE302733accF4800146E55fC45B46b4E4fFC032D2' as Address
const NFT = '0x539CdD042c2f3d93EbC5BE7DfFf0c79F3B4fAbF0' as Address
const MC = '0xcA11bde05977b3631167028862bE2a173976CA11' as Address
const TOKENS: Record<string, Address> = {
  AAPL: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9',
  AMZN: '0x12f190a9F9d7D37a250758b26824B97CE941bF54',
  NVDA: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC'
}
const client = createPublicClient({
  chain: { id: 4663, name: 'rh', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [MC && RPC] } }, contracts: { multicall3: { address: MC } } } as never,
  transport: http(RPC, { batch: { wait: 16, batchSize: 40 }, retryCount: 5, retryDelay: 1000 })
})
const ownerAbi = parseAbi(['function ownerOf(uint256) view returns (address)'])
const walletAbi = parseAbi(['function tokenWallet(uint256) view returns (address)'])
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)'])

async function chunked<T>(items: bigint[], size: number, fn: (ids: bigint[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < items.length; i += size) out.push(...(await fn(items.slice(i, i + size))))
  return out
}

const ids = Array.from({ length: 4444 }, (_, i) => BigInt(i + 1))
const owners = await chunked(ids, 100, async (slice) => {
  const r = await client.multicall({
    contracts: slice.map((id) => ({ address: NFT, abi: ownerAbi, functionName: 'ownerOf', args: [id] })),
    allowFailure: true
  })
  return r.map((x, i) => ({ id: slice[i]!, owner: x.status === 'success' ? ((x.result as Address).toLowerCase()) : null }))
})
const ok = owners.filter((o) => o.owner)
console.log(`proprietari cititi: ${ok.length} din ${ids.length}`)
const inVault = ok.filter((o) => o.owner === V.toLowerCase())
console.log(`NFT-uri detinute de VAULT: ${inVault.length}`)
const holders = new Set(ok.filter((o) => o.owner !== V.toLowerCase()).map((o) => o.owner))
console.log(`detinatori individuali: ${holders.size}`)

/* ce zace in portofelele lor, pe un esantion */
const sample = [...inVault.slice(0, 50), ...ok.filter((o) => o.owner !== V.toLowerCase()).slice(0, 50)]
const wallets = await chunked(sample.map((s) => s.id), 100, async (slice) => {
  const r = await client.multicall({
    contracts: slice.map((id) => ({ address: NFT, abi: walletAbi, functionName: 'tokenWallet', args: [id] })),
    allowFailure: true
  })
  return r.map((x, i) => ({ id: slice[i]!, wallet: x.status === 'success' ? (x.result as Address) : null }))
})

const totals: Record<string, bigint> = { AAPL: 0n, AMZN: 0n, NVDA: 0n }
let eth = 0n
let nonEmpty = 0
for (const w of wallets) {
  if (!w.wallet) continue
  const b = await client.getBalance({ address: w.wallet })
  eth += b
  let any = b > 0n
  for (const [sym, t] of Object.entries(TOKENS)) {
    const bal = (await client.readContract({ address: t, abi: erc20, functionName: 'balanceOf', args: [w.wallet] })) as bigint
    totals[sym]! += bal
    if (bal > 0n) any = true
  }
  if (any) nonEmpty++
}
console.log(`\nesantion de ${wallets.length} portofele 6551 (50 din vault + 50 ale oamenilor):`)
console.log(`  cu ceva inauntru: ${nonEmpty}`)
console.log(`  ETH total       : ${formatEther(eth)}`)
for (const [s, v] of Object.entries(totals)) console.log(`  ${s} total       : ${formatEther(v)}`)
