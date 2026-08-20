/**
 * Desfasurarea contractelor. Implicit NU desfasoara nimic: tipareste ce ar
 * face si cu ce parametri, ca sa se poata citi inainte sa se cheltuie.
 *
 *   npx tsx scripts/deploy-agent.ts                 # doar arata
 *   npx tsx scripts/deploy-agent.ts --live          # chiar desfasoara
 *
 * Parametrii vin din config/deploy.json. Cheia vine din mediu, niciodata din
 * fisier.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, defineChain, formatEther, http, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { artifact } from '../test/e2e/harness.js'

const LIVE = process.argv.includes('--live')
const FILE = process.argv.find((a) => a.endsWith('.json')) ?? './config/deploy.json'

if (!existsSync(FILE)) {
  process.stdout.write(`lipseste ${FILE}. Copiaza config/deploy.example.json si completeaza-l.\n`)
  process.exit(1)
}

interface DeployCfg {
  chainId: number
  rpc: string
  explorer?: string
  payToken: Address
  priceWei: string
  burnBps: number
  maxSupply: number
  reserveCap: number
  treasury: Address
  registry: Address
  accountImplementation: Address
  accountSalt: Hex
  baseURI: string
  courierBatchFeeBps: number
  deployCourierBatch: boolean
}

const cfg = JSON.parse(readFileSync(FILE, 'utf8')) as DeployCfg
const key = process.env.DEPLOYER_KEY

const chain = defineChain({
  id: cfg.chainId,
  name: 'target',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [cfg.rpc] } }
})
const client = createPublicClient({ chain, transport: http(cfg.rpc) })

const line = (a: string, b: string) => process.stdout.write(`${a.padEnd(26)} ${b}\n`)

line('chain', String(cfg.chainId))
line('pay token', cfg.payToken)
line('price', `${formatEther(BigInt(cfg.priceWei))} tokens per agent`)
line('burn', `${cfg.burnBps / 100}% burned, ${(10000 - cfg.burnBps) / 100}% to treasury`)
line('supply', `${cfg.maxSupply} max, ${cfg.reserveCap} reserved for the house`)
line('treasury', cfg.treasury)
line('6551 registry', cfg.registry)
line('6551 implementation', cfg.accountImplementation)
line('baseURI', cfg.baseURI)
line('CourierBatch', cfg.deployCourierBatch ? `yes, fee ${cfg.courierBatchFeeBps / 100}% of tips` : 'no')

/* verificam ca ce presupunem despre lant chiar e adevarat, inainte de orice */
const onChainId = await client.getChainId()
if (onChainId !== cfg.chainId) {
  process.stdout.write(`\nRPC-ul raspunde cu lantul ${onChainId}, configurarea cere ${cfg.chainId}. Ma opresc.\n`)
  process.exit(1)
}
for (const [what, addr] of [
  ['registry', cfg.registry],
  ['account implementation', cfg.accountImplementation],
  ['pay token', cfg.payToken]
] as const) {
  const code = await client.getCode({ address: addr })
  if (!code || code === '0x') {
    process.stdout.write(`\nNu exista cod la ${what} (${addr}). Ma opresc.\n`)
    process.exit(1)
  }
}
process.stdout.write('\ntoate adresele presupuse au cod pe lant\n')

if (!LIVE) {
  process.stdout.write('\nrulare uscata. Nimic nu s-a desfasurat. Adauga --live cand vrei pe bune.\n')
  process.exit(0)
}
if (!key) {
  process.stdout.write('\nlipseste DEPLOYER_KEY din mediu. Ma opresc.\n')
  process.exit(1)
}

const account = privateKeyToAccount((key.startsWith('0x') ? key : `0x${key}`) as Hex)
const wallet = createWalletClient({ account, chain, transport: http(cfg.rpc) })
const balance = await client.getBalance({ address: account.address })
line('\ndeployer', `${account.address} cu ${formatEther(balance)} ETH`)

const deploy = async (file: string, name: string, args: readonly unknown[]): Promise<Address> => {
  const a = artifact(file, name)
  const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode, args: args as never, account, chain })
  const r = await client.waitForTransactionReceipt({ hash })
  if (!r.contractAddress) throw new Error(`${name}: desfasurare fara adresa`)
  process.stdout.write(`${name.padEnd(26)} ${r.contractAddress}  (gaz ${r.gasUsed})\n`)
  return r.contractAddress
}

const out: Record<string, string> = {}
out.stonkAgent = await deploy('StonkAgent.sol', 'StonkAgent', [
  cfg.payToken,
  BigInt(cfg.priceWei),
  cfg.burnBps,
  BigInt(cfg.maxSupply),
  BigInt(cfg.reserveCap),
  cfg.treasury,
  cfg.registry,
  cfg.accountImplementation,
  cfg.accountSalt,
  cfg.baseURI
])
if (cfg.deployCourierBatch) {
  out.courierBatch = await deploy('CourierBatch.sol', 'CourierBatch', [cfg.treasury, cfg.courierBatchFeeBps])
}

writeFileSync('./config/deployed.json', JSON.stringify({ chainId: cfg.chainId, ...out }, null, 2))
process.stdout.write(`\nscris in config/deployed.json\n`)
process.stdout.write(
  `\nMintul e INCHIS. Se deschide separat, cu setMintOpen(true), dupa ce definesti rolurile\n` +
    `si dupa ce scoti prototipul cu mintReserved.\n`
)
if (cfg.explorer) process.stdout.write(`${cfg.explorer}/address/${out.stonkAgent}\n`)
