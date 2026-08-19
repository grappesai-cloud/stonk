/**
 * Vaultul AMM de NFT-uri, masurat.
 *
 * Ideile de arbitraj stau toate pe aceleasi doua cifre: cat plateste vaultul
 * pe un NFT, si cat zace in portofelele NFT-urilor din el. Prima se citeste,
 * a doua se numara.
 */
import { createPublicClient, http, parseAbi, formatEther, type Address } from 'viem'

const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const V = '0xE302733accF4800146E55fC45B46b4E4fFC032D2' as Address
const NFT = '0x539CdD042c2f3d93EbC5BE7DfFf0c79F3B4fAbF0' as Address
const CLOCK = '0x55642A3F10F1Af5145D3d59021B1D6b03BB8692c' as Address
const STONK = '0xe934e36A439C94017B64a3FecE66AF12099aBF50' as Address
const MC = '0xcA11bde05977b3631167028862bE2a173976CA11' as Address
const TOKENS: Record<string, Address> = {
  AAPL: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9',
  AMZN: '0x12f190a9F9d7D37a250758b26824B97CE941bF54',
  NVDA: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC'
}

const client = createPublicClient({
  chain: { id: 4663, name: 'rh', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } }, contracts: { multicall3: { address: MC } } } as never,
  transport: http(RPC, { batch: true })
})

const vault = parseAbi([
  'function inventoryCount() view returns (uint256)',
  'function inventoryLength() view returns (uint256)',
  'function quoteRandomBuy() view returns (uint256 tokenCost, uint256 ethFee, uint256 inventorySize, uint256 nextTokenId)',
  'function quoteSellNFT() view returns (uint256 tokenPayout, uint256 ethFee)',
  'function quoteSpecificBuy(uint256 tokenId) view returns (uint256 tokenCost, uint256 ethFee, bool available)',
  'function ethNotionalPerNFT() view returns (uint256)',
  'function liveEthNotionalPerNFT() view returns (uint256)',
  'function randomFeeBps() view returns (uint16)',
  'function specificFeeBps() view returns (uint16)',
  'function feeOracleStatus() view returns (bool wired, bool live, uint256 notionalWei, uint256 swapFeeWei, uint256 snipeFeeWei, uint32 window, uint256 readyAt)'
])
const nftAbi = parseAbi([
  'function tokenWallet(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)'
])
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'])
const clockAbi = parseAbi(['function claimable(address token, uint256 tokenId) view returns (uint256)'])

const num = async (fn: string) => (await client.readContract({ address: V, abi: vault, functionName: fn })) as bigint

console.log('=== VAULT ===')
const invCount = await num('inventoryCount')
console.log('  NFT-uri in inventar :', invCount.toString())
const [tokenCost, ethFee, invSize, nextId] = (await client.readContract({ address: V, abi: vault, functionName: 'quoteRandomBuy' })) as unknown as bigint[]
const [payout, sellFee] = (await client.readContract({ address: V, abi: vault, functionName: 'quoteSellNFT' })) as unknown as bigint[]
console.log('  CUMPERI un NFT la  :', formatEther(tokenCost), 'STONK  + taxa', formatEther(ethFee), 'ETH')
console.log('  VINZI un NFT la    :', formatEther(payout), 'STONK  + taxa', formatEther(sellFee), 'ETH')
const spread = tokenCost > payout ? tokenCost - payout : 0n
console.log('  diferenta (spread) :', formatEther(spread), 'STONK =', tokenCost > 0n ? `${Number((spread * 10000n) / tokenCost) / 100}%` : '-')
console.log('  notional per NFT   :', formatEther(await num('ethNotionalPerNFT')), 'ETH (live:', formatEther(await num('liveEthNotionalPerNFT')), 'ETH)')
const st = (await client.readContract({ address: V, abi: vault, functionName: 'feeOracleStatus' })) as unknown as [boolean, boolean, bigint, bigint, bigint, number, bigint]
console.log('  oracol pret        : wired', st[0], '| live', st[1], '| taxa swap', formatEther(st[3]), 'ETH | taxa SNIPE', formatEther(st[4]), 'ETH')

/* Ideea 4: NFT-urile din vault au bani in portofelele lor? */
console.log('\n=== CE ZACE IN PORTOFELELE NFT-URILOR DIN VAULT ===')
const ids: bigint[] = []
for (let i = 0n; i < (invCount < 200n ? invCount : 200n); i++) {
  try {
    ids.push((await client.readContract({ address: V, abi: parseAbi(['function inventory(uint256) view returns (bool)']), functionName: 'inventory', args: [i] })) as never)
  } catch {
    break
  }
}
/* inventory(i) intoarce bool, deci nu e lista de id-uri: cautam altfel, prin
   ce NFT-uri detine chiar vaultul */
const held: bigint[] = []
for (let id = 1n; id <= 4444n && held.length < 40; id++) {
  /* prea scump unul cate unul; folosim multicall pe felii */
  if (id % 1n === 0n) break
}
const owners = await client.multicall({
  contracts: Array.from({ length: 4444 }, (_, i) => ({
    address: NFT,
    abi: parseAbi(['function ownerOf(uint256) view returns (address)']),
    functionName: 'ownerOf',
    args: [BigInt(i + 1)]
  })),
  allowFailure: true
})
const mine = owners
  .map((r, i) => ({ id: BigInt(i + 1), owner: r.status === 'success' ? (r.result as Address) : null }))
  .filter((x) => x.owner && x.owner.toLowerCase() === V.toLowerCase())
console.log(`  NFT-uri detinute chiar de vault: ${mine.length}`)

let totalEth = 0n
const totals: Record<string, bigint> = { AAPL: 0n, AMZN: 0n, NVDA: 0n }
let withSomething = 0
for (const m of mine.slice(0, 60)) {
  const w = (await client.readContract({ address: NFT, abi: nftAbi, functionName: 'tokenWallet', args: [m.id] })) as Address
  const eth = await client.getBalance({ address: w })
  let any = eth > 0n
  const row: string[] = []
  for (const [sym, t] of Object.entries(TOKENS)) {
    const b = (await client.readContract({ address: t, abi: erc20, functionName: 'balanceOf', args: [w] })) as bigint
    const c = (await client.readContract({ address: CLOCK, abi: clockAbi, functionName: 'claimable', args: [t, m.id] })) as bigint
    totals[sym]! += b + c
    if (b + c > 0n) {
      any = true
      row.push(`${sym} ${formatEther(b + c)}`)
    }
  }
  totalEth += eth
  if (any) {
    withSomething++
    if (withSomething <= 8) console.log(`   #${m.id}: ${formatEther(eth)} ETH ${row.join(' ')}`)
  }
}
console.log(`\n  din ${Math.min(mine.length, 60)} verificate, ${withSomething} au ceva in portofel`)
console.log('  ETH total in ele  :', formatEther(totalEth))
for (const [s, v] of Object.entries(totals)) console.log(`  ${s} total        :`, formatEther(v))
