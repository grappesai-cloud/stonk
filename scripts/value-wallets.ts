/**
 * Cat valoreaza, in ETH, ce zace intr-un portofel de NFT din vault.
 *
 * E singura cifra care decide daca "snipe-ul" are sens: taxa vaultului e fixa
 * si mare, deci continutul trebuie sa o bata. Preturile se iau din pool-urile
 * Uniswap V3 de pe lant, nu dintr-o presupunere.
 */
import { createPublicClient, http, parseAbi, formatEther, type Address } from 'viem'

const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const V = '0xE302733accF4800146E55fC45B46b4E4fFC032D2' as Address
const NFT = '0x539CdD042c2f3d93EbC5BE7DfFf0c79F3B4fAbF0' as Address
const MC = '0xcA11bde05977b3631167028862bE2a173976CA11' as Address
const WETH = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' as Address
const POOLS: Record<string, Address | null> = {
  AAPL: '0x8bb3514e2204E1cDF3Ac149EFEe7Ff04D91B719f',
  NVDA: '0xC0Be1cb0f674D9737C72B2A63fC542361185b807',
  AMZN: null,
  STONK: '0xA9d49CAa5E906558dacDC66d563Ac78f0c26d4ef'
}
const TOKENS: Record<string, Address> = {
  AAPL: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9',
  AMZN: '0x12f190a9F9d7D37a250758b26824B97CE941bF54',
  NVDA: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC',
  STONK: '0xe934e36A439C94017B64a3FecE66AF12099aBF50'
}
const client = createPublicClient({
  chain: { id: 4663, name: 'rh', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } }, contracts: { multicall3: { address: MC } } } as never,
  transport: http(RPC, { batch: { wait: 16, batchSize: 40 }, retryCount: 5, retryDelay: 1000 })
})
const poolAbi = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 a, uint16 b, uint16 c, uint8 d, bool e)',
  'function token0() view returns (address)'
])
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)'])
const ownerAbi = parseAbi(['function ownerOf(uint256) view returns (address)'])
const walletAbi = parseAbi(['function tokenWallet(uint256) view returns (address)'])

/** cati wei valoreaza o unitate intreaga de jeton, dupa pretul de moment */
const price: Record<string, bigint> = {}
for (const [sym, pool] of Object.entries(POOLS)) {
  if (!pool) {
    price[sym] = 0n
    continue
  }
  const [sqrt] = (await client.readContract({ address: pool, abi: poolAbi, functionName: 'slot0' })) as unknown as [bigint]
  const token0 = (await client.readContract({ address: pool, abi: poolAbi, functionName: 'token0' })) as Address
  /* pretul lui token0 in token1 = (sqrt/2^96)^2 */
  const num = sqrt * sqrt
  const den = 1n << 192n
  const tokenIsZero = token0.toLowerCase() === TOKENS[sym]!.toLowerCase()
  price[sym] = tokenIsZero ? (num * 10n ** 18n) / den : (den * 10n ** 18n) / num
  console.log(`  1 ${sym.padEnd(5)} = ${formatEther(price[sym]!)} ETH${pool ? '' : ''}`)
}
console.log(`  1 AMZN  = fara pool, deci nevandabil\n`)

const ids = Array.from({ length: 4444 }, (_, i) => BigInt(i + 1))
const owners: Array<{ id: bigint; owner: string | null }> = []
for (let i = 0; i < ids.length; i += 100) {
  const slice = ids.slice(i, i + 100)
  const r = await client.multicall({
    contracts: slice.map((id) => ({ address: NFT, abi: ownerAbi, functionName: 'ownerOf', args: [id] })),
    allowFailure: true
  })
  r.forEach((x, j) => owners.push({ id: slice[j]!, owner: x.status === 'success' ? (x.result as Address).toLowerCase() : null }))
}
const inVault = owners.filter((o) => o.owner === V.toLowerCase()).map((o) => o.id)
console.log(`NFT-uri in vault: ${inVault.length}`)

const sample = inVault.slice(0, 120)
const wallets: Address[] = []
for (let i = 0; i < sample.length; i += 100) {
  const slice = sample.slice(i, i + 100)
  const r = await client.multicall({
    contracts: slice.map((id) => ({ address: NFT, abi: walletAbi, functionName: 'tokenWallet', args: [id] })),
    allowFailure: true
  })
  r.forEach((x) => x.status === 'success' && wallets.push(x.result as Address))
}

let totalValue = 0n
let best = { id: 0n, value: 0n }
let nonEmpty = 0
for (let i = 0; i < wallets.length; i++) {
  const w = wallets[i]!
  let v = await client.getBalance({ address: w })
  for (const [sym, t] of Object.entries(TOKENS)) {
    if (sym === 'STONK') continue
    const bal = (await client.readContract({ address: t, abi: erc20, functionName: 'balanceOf', args: [w] })) as bigint
    v += (bal * (price[sym] ?? 0n)) / 10n ** 18n
  }
  if (v > 0n) nonEmpty++
  if (v > best.value) best = { id: sample[i]!, value: v }
  totalValue += v
}
console.log(`\nesantion de ${wallets.length} NFT-uri DIN VAULT:`)
console.log(`  cu ceva inauntru : ${nonEmpty}`)
console.log(`  valoare totala   : ${formatEther(totalValue)} ETH`)
console.log(`  media pe NFT     : ${formatEther(totalValue / BigInt(wallets.length))} ETH`)
console.log(`  cel mai gras     : #${best.id} cu ${formatEther(best.value)} ETH`)
console.log(`\n  taxa de snipe a vaultului: 0.975339310154627942 ETH`)
console.log(`  taxa de swap             : 0.650226206769751961 ETH`)
