/**
 * Proba pe date de productie.
 *
 * Testele cap-coada ruleaza pe un lant local, deci dovedesc logica. Asta
 * dovedeste altceva: ca drumul de citire tine pe lantul real, pe o colectie
 * adevarata, cu zeci de mii de detinatori, si ca matematica adreselor 6551 bate
 * cu registrul desfasurat acolo. Nu e test automat, fiindca depinde de reteaua
 * publica si nu vreau teste care pica din cauza altcuiva.
 *
 *   npx tsx scripts/proof-live.ts <adresa colectiei> [cate]
 */
import { formatEther, getAddress, parseAbi, type Address } from 'viem'
import { loadConfig } from '../src/config.js'
import { publicClientOf } from '../src/chain/client.js'
import { multiRead, hasCode, type Call } from '../src/chain/reader.js'
import { REGISTRY_ABI, tbaAddresses } from '../src/erc6551/address.js'

const COLLECTION = getAddress(process.argv[2] ?? '0x4A2C6e28D1FbAdeE3c11C4B4157f4bf2fe2A1f1a')
const HOW_MANY = Number(process.argv[3] ?? 200)

const cfg = loadConfig('./config/robinhood.example.json')
cfg.brokers.address = COLLECTION
const client = publicClientOf(cfg)

const erc721 = parseAbi([
  'function totalSupply() view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenByIndex(uint256 index) view returns (uint256)'
])

function ms(t: number): string {
  return `${Math.round(performance.now() - t)} ms`
}

const line = (a: string, b: string) => process.stdout.write(`${a.padEnd(38)} ${b}\n`)

const chainId = await client.getChainId()
const block = await client.getBlockNumber()
line('lant', `${chainId} la blocul ${block}`)

const [name, symbol, supply] = await Promise.all([
  client.readContract({ address: COLLECTION, abi: erc721, functionName: 'name' }).catch(() => '?'),
  client.readContract({ address: COLLECTION, abi: erc721, functionName: 'symbol' }).catch(() => '?'),
  client.readContract({ address: COLLECTION, abi: erc721, functionName: 'totalSupply' }).catch(() => 0n)
])
line('colectie', `${name} (${symbol}) ${COLLECTION}`)
line('totalSupply', String(supply))

const count = Math.min(HOW_MANY, Number(supply) || HOW_MANY)
const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1))

// 1. adresele calculate local
let t = performance.now()
const wallets = tbaAddresses(
  {
    registry: cfg.erc6551.registry,
    implementation: cfg.erc6551.implementation,
    salt: cfg.erc6551.salt,
    chainId,
    tokenContract: COLLECTION
  },
  ids
)
line('adrese calculate local', `${wallets.size} in ${ms(t)}, fara nicio citire`)

// 2. aceleasi adrese cerute registrului de pe lant
t = performance.now()
const calls: Call[] = ids.map((id) => ({
  address: cfg.erc6551.registry,
  abi: REGISTRY_ABI as never,
  functionName: 'account',
  args: [cfg.erc6551.implementation, cfg.erc6551.salt, BigInt(chainId), COLLECTION, id]
}))
const onchain = await multiRead<Address>(client, calls, { chunk: 200 })
const okReads = onchain.filter((r) => r.status === 'success').length
let mismatches = 0
onchain.forEach((r, i) => {
  if (r.status !== 'success') return
  if (r.result.toLowerCase() !== wallets.get(ids[i]!)!.toLowerCase()) mismatches++
})
line('adrese cerute registrului', `${okReads}/${ids.length} citite in ${ms(t)}`)
line('nepotriviri', mismatches === 0 ? 'ZERO' : `${mismatches} ATENTIE`)

// 3. proprietarii, ca sa probam si drumul de ownerOf in lot
t = performance.now()
const owners = await multiRead<Address>(
  client,
  ids.map((id) => ({ address: COLLECTION, abi: erc721 as never, functionName: 'ownerOf', args: [id] })),
  { chunk: 200 }
)
const okOwners = owners.filter((o) => o.status === 'success').length
const uniqueOwners = new Set(owners.filter((o) => o.status === 'success').map((o) => (o as { result: Address }).result.toLowerCase()))
line('proprietari cititi', `${okOwners}/${ids.length} in ${ms(t)}, ${uniqueOwners.size} adrese distincte`)

// 4. cate portofele 6551 chiar exista
t = performance.now()
const sample = [...wallets.values()].slice(0, 40)
const deployed = await Promise.all(sample.map((w) => hasCode(client, w)))
line('portofele 6551 desfasurate', `${deployed.filter(Boolean).length} din ${sample.length} verificate (${ms(t)})`)

// 5. cat costa gazul acolo
const gas = await client.getGasPrice()
line('pret gaz', `${gas} wei (${formatEther(gas * 100_000n)} ETH pentru 100k unitati)`)

process.stdout.write(
  mismatches === 0
    ? '\nDrumul de citire tine pe lantul real si adresele bat cu registrul.\n'
    : '\nNEPOTRIVIRE DE ADRESE, nu livra nimic pana nu se lamureste.\n'
)
