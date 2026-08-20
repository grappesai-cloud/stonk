/**
 * Pretul fiecarui jeton din meniu, in wei, din pool-urile de pe lant.
 *
 * Fara asta, orice socoteala despre castig e o parere: meniul are douasprezece
 * jetoane, iar daca pretuiesti doua, cifra iese de cateva ori mai mica si arata
 * la fel de convingator.
 */
import { createPublicClient, http, parseAbi, formatEther, type Address } from 'viem'
import { writeFileSync } from 'node:fs'
const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const FACTORY = '0x1f7d7550B1b028f7571E69A784071F0205FD2EfA' as Address
const WETH = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' as Address
const client = createPublicClient({ chain: { id: 4663, name: 'rh', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as never, transport: http(RPC, { batch: true }) })
const facAbi = parseAbi(['function getPool(address,address,uint24) view returns (address)'])
const poolAbi = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 a, uint16 b, uint16 c, uint8 d, bool e)',
  'function token0() view returns (address)',
  'function liquidity() view returns (uint128)'
])
const erc = parseAbi(['function symbol() view returns (string)', 'function decimals() view returns (uint8)'])

const MENU: Address[] = [
  '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9','0x12f190a9F9d7D37a250758b26824B97CE941bF54',
  '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC','0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3',
  '0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa','0xd917B029C761D264c6A312BBbcDA868658eF86a6',
  '0x1b0E319c6A659F002271B69dB8A7df2F911c153E','0x322F0929c4625eD5bAd873c95208D54E1c003b2d',
  '0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A','0x86923f96303D656E4aa86D9d42D1e57ad2023fdC',
  '0xe934e36A439C94017B64a3FecE66AF12099aBF50','0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'
] as Address[]

const out: Record<string, string> = {}
const decimals: Record<string, number> = {}
for (const t of MENU) {
  const sym = (await client.readContract({ address: t, abi: erc, functionName: 'symbol' }).catch(() => '???')) as string
  /* zecimalele NU sunt mereu 18. USDG are 6, si fara corectie pretul iese de
     un milion de ori mai mare, ceea ce arata perfect credibil intr-un tabel. */
  const dec = (await client.readContract({ address: t, abi: erc, functionName: 'decimals' }).catch(() => 18)) as number
  let best = { price: 0n, liq: 0n, fee: 0 }
  for (const fee of [500, 3000, 10000]) {
    const pool = (await client.readContract({ address: FACTORY, abi: facAbi, functionName: 'getPool', args: [t, WETH, fee] }).catch(() => null)) as Address | null
    if (!pool || pool === '0x0000000000000000000000000000000000000000') continue
    try {
      const [sqrt] = (await client.readContract({ address: pool, abi: poolAbi, functionName: 'slot0' })) as unknown as [bigint]
      const liq = (await client.readContract({ address: pool, abi: poolAbi, functionName: 'liquidity' })) as bigint
      if (liq === 0n) continue
      const token0 = (await client.readContract({ address: pool, abi: poolAbi, functionName: 'token0' })) as Address
      const num = sqrt * sqrt
      const den = 1n << 192n
      const price =
        token0.toLowerCase() === t.toLowerCase()
          ? (num * 10n ** BigInt(dec)) / den
          : (den * 10n ** BigInt(dec)) / num
      /* alegem pool-ul cu cea mai multa lichiditate: e pretul in care chiar poti iesi */
      if (liq > best.liq) best = { price, liq, fee }
    } catch {
      /* pool stricat, mergem mai departe */
    }
  }
  out[t.toLowerCase()] = best.price.toString()
  console.log(
    `  ${sym.padEnd(12)} ${dec}z  ${best.price === 0n ? 'FARA PIATA' : formatEther(best.price) + ' ETH'}${best.fee ? '  (pool ' + best.fee + ')' : ''}`
  )
  decimals[t.toLowerCase()] = dec
}
writeFileSync('./data/prices.json', JSON.stringify({ price: out, decimals }, null, 2))
