/**
 * Cat a incasat, pe bune, un broker.
 *
 * Nu modelez nimic: iau evenimentele de pe lant si adun. Cu o capcana platita
 * pe drum: RPC-ul lantului **ignora filtrul pe topic**, deci `getLogs` cu
 * `event:` intoarce TOT ce a emis contractul, nedecodat. Se vede greu, fiindca
 * numarul pare rezonabil si campurile ies pur si simplu goale. Asa ca cerem
 * toate jurnalele si le potrivim noi dupa topic.
 */
import { createPublicClient, http, parseAbi, decodeEventLog, toEventSelector, formatEther, type Address } from 'viem'
import { writeFileSync } from 'node:fs'

const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const BOOSTER = '0x1f12fe622c11947f93F53d63f68f7F46B6D081c9' as Address
const CLOCK = '0x55642A3F10F1Af5145D3d59021B1D6b03BB8692c' as Address

const client = createPublicClient({
  chain: { id: 4663, name: 'rh', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as never,
  transport: http(RPC, { batch: { wait: 16, batchSize: 30 }, retryCount: 5, retryDelay: 1200, timeout: 30_000 })
})

const DROP = parseAbi(['event DropCredited(uint256 indexed round, uint256 indexed tokenId, uint256 ethCredited)'])
const CLOCKED = parseAbi(['event ClockedIn(address indexed token, uint64 indexed round, uint256 indexed tokenId, address wallet, uint256 amount)'])
const ACCRUED = parseAbi(['event CreditAccrued(uint256 indexed round, uint256 indexed tokenId, address indexed token, uint256 amount)'])
/* preturile TUTUROR jetoanelor din meniu, scoase de scripts/prices.ts din
   pool-urile de pe lant. Meniul are douasprezece, iar cinci nu au piata. */
const { readFileSync } = await import('node:fs')
const priced = JSON.parse(readFileSync('./data/prices.json', 'utf8')) as {
  price: Record<string, string>
  decimals: Record<string, number>
}
const PRICE: Record<string, bigint> = Object.fromEntries(
  Object.entries(priced.price).map(([k, v]) => [k, BigInt(v)])
)
const DEC: Record<string, number> = priced.decimals
const accruedTopic = toEventSelector(ACCRUED[0])
const dropTopic = toEventSelector(DROP[0])
const clockedTopic = toEventSelector(CLOCKED[0])

async function sweep(address: Address, from: bigint, to: bigint, step: bigint, onLog: (l: { topics: readonly string[]; data: string }) => void) {
  let failed = 0
  let raw = 0
  let chunks = 0
  for (let b = from; b <= to; b += step) {
    chunks++
    const end = b + step - 1n > to ? to : b + step - 1n
    try {
      const logs = await client.getLogs({ address, fromBlock: b, toBlock: end })
      raw += logs.length
      for (const l of logs) onLog(l as never)
    } catch {
      failed++
    }
  }
  console.log(`   (${chunks} bucati, ${raw} jurnale brute, ${failed} picate)`)
  return failed
}

const head = await client.getBlockNumber()
const WINDOW = 1_300_000n /* ~o luna la 2s pe bloc */
const from = head - WINDOW
const days = Number(WINDOW) * 2 / 86400
console.log(`bloc ${head}, fereastra ${WINDOW} blocuri (~${days.toFixed(0)} zile)\n`)

const ethPerBroker = new Map<string, bigint>()
let credits = 0
const stockPerBroker = new Map<string, bigint>()
let accrued = 0
let unsellable = 0n
const f1 = await sweep(BOOSTER, from, head, 12_000n, (l) => {
  if (l.topics[0] === accruedTopic) {
    try {
      const { args } = decodeEventLog({ abi: ACCRUED, data: l.data as `0x${string}`, topics: l.topics as never }) as unknown as {
        args: { tokenId: bigint; token: string; amount: bigint }
      }
      accrued++
      const key = args.token.toLowerCase()
      const p = PRICE[key] ?? 0n
      /* zecimalele jetonului, nu 18 pe ghicite */
      const wei = (args.amount * p) / 10n ** BigInt(DEC[key] ?? 18)
      if (p === 0n) unsellable += args.amount
      stockPerBroker.set(args.tokenId.toString(), (stockPerBroker.get(args.tokenId.toString()) ?? 0n) + wei)
    } catch {
      /* nimic */
    }
    return
  }
  if (l.topics[0] !== dropTopic) return
  try {
    const { args } = decodeEventLog({ abi: DROP, data: l.data as `0x${string}`, topics: l.topics as never }) as unknown as {
      args: { tokenId: bigint; ethCredited: bigint }
    }
    credits++
    ethPerBroker.set(args.tokenId.toString(), (ethPerBroker.get(args.tokenId.toString()) ?? 0n) + args.ethCredited)
  } catch {
    /* alt eveniment cu acelasi topic nu exista, deci aici nu ajungem */
  }
})
console.log(`DropCredited: ${credits} credite ETH catre ${ethPerBroker.size} brokeri (${f1} bucati au picat)`)
console.log(`CreditAccrued: ${accrued} credite in actiuni catre ${stockPerBroker.size} brokeri`)

const tokPerBroker = new Map<string, bigint>()
let clocks = 0
const f2 = await sweep(CLOCK, from, head, 60_000n, (l) => {
  if (l.topics[0] !== clockedTopic) return
  try {
    const { args } = decodeEventLog({ abi: CLOCKED, data: l.data as `0x${string}`, topics: l.topics as never }) as unknown as {
      args: { tokenId: bigint; amount: bigint }
    }
    clocks++
    tokPerBroker.set(args.tokenId.toString(), (tokPerBroker.get(args.tokenId.toString()) ?? 0n) + args.amount)
  } catch {
    /* nimic */
  }
})
console.log(`ClockedIn: ${clocks} livrari catre ${tokPerBroker.size} brokeri (${f2} bucati au picat)\n`)

/* ETH plus actiuni, evaluate la pretul de pe lant */
const merged = new Map<string, bigint>()
for (const [id, w] of ethPerBroker) merged.set(id, (merged.get(id) ?? 0n) + w)
for (const [id, w] of stockPerBroker) merged.set(id, (merged.get(id) ?? 0n) + w)
console.log(`  (jetoane fara piata, deci hartie: ${formatEther(unsellable)} unitati)`)
const all = [...merged.entries()].map(([id, wei]) => ({ id, wei })).sort((a, b) => (a.wei > b.wei ? -1 : 1))
writeFileSync('./data/earnings-per-broker.json', JSON.stringify(all.map((r) => [r.id, r.wei.toString()])))
/* Doar cei care au primit ceva. Restul au greutate zero, adica nu sunt
   activati: nu e ca au castigat putin, e ca nu au jucat. */
const rows = all.filter((r) => r.wei > 0n)
console.log(`  din ${all.length} brokeri atinsi, ${rows.length} au primit efectiv ETH`)
const sum = rows.reduce((s, r) => s + r.wei, 0n)
writeFileSync('./data/earnings.json', JSON.stringify({ days, brokers: rows.length, totalWei: sum.toString() }, null, 2))

console.log('=== ETH INCASAT DE BROKERI, IN FEREASTRA ===')
console.log(`  brokeri platiti : ${rows.length}`)
console.log(`  total           : ${formatEther(sum)} ETH`)
if (rows.length) {
  const mid = rows[Math.floor(rows.length / 2)]!
  console.log(`  cel mai bun     : #${rows[0]!.id} cu ${formatEther(rows[0]!.wei)} ETH`)
  console.log(`  la mijloc       : #${mid.id} cu ${formatEther(mid.wei)} ETH`)
  const avg = sum / BigInt(rows.length)
  console.log(`  media pe broker : ${formatEther(avg)} ETH in ${days.toFixed(0)} zile`)
  const year = (avg * 365n) / BigInt(Math.round(days))
  const yearMid = (mid.wei * 365n) / BigInt(Math.round(days))
  console.log(`\n  => PE AN, la ritmul asta:`)
  console.log(`     broker de mijloc : ${formatEther(yearMid)} ETH`)
  console.log(`     broker mediu     : ${formatEther(year)} ETH`)
  console.log(`     agent cu 3       : ${formatEther(year * 3n)} ETH pe an`)
}
