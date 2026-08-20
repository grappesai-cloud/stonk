/**
 * Bancul de proba: un lant local cu contracte reale, nu obiecte false.
 *
 * Testele cu obiecte false dovedesc ca ti-ai scris corect obiectele false.
 * Aici se desfasoara registrul 6551, colectia de brokeri si distribuitorul,
 * si Courier-ul le vede exact cum ar vedea productia.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = resolve(HERE, '../..')

export const ANVIL_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex
export const ANVIL_KEY_2 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex

export const localChain = (port: number, id = 31337) =>
  defineChain({
    id,
    name: 'anvil',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [`http://127.0.0.1:${port}`] } }
  })

export interface Anvil {
  proc: ChildProcess
  port: number
  url: string
  stop: () => void
}

export async function startAnvil(port = 8545, forkUrl?: string): Promise<Anvil> {
  const bin = process.env.ANVIL_BIN ?? `${process.env.HOME}/.foundry/bin/anvil`
  const args = ['--port', String(port)]
  if (forkUrl) args.push('--fork-url', forkUrl)
  else args.push('--silent')

  /* iesirea NU se arunca: cand forkul nu porneste, singurul loc in care scrie
     de ce e chiar aici, si un test care spune doar "nu a pornit" te trimite sa
     ghicesti */
  const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  proc.stdout?.on('data', (b: Buffer) => (out += b.toString()))
  proc.stderr?.on('data', (b: Buffer) => (out += b.toString()))

  const url = `http://127.0.0.1:${port}`
  const client = createPublicClient({ chain: localChain(port), transport: http(url) })
  const waitMs = forkUrl ? 180_000 : 30_000
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`anvil s-a inchis singur (cod ${proc.exitCode}):\n${out.slice(-800)}`)
    }
    try {
      await client.getBlockNumber()
      return { proc, port, url, stop: () => proc.kill('SIGKILL') }
    } catch {
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  proc.kill('SIGKILL')
  throw new Error(`anvil nu a pornit in ${waitMs / 1000} secunde. Ultima iesire:\n${out.slice(-800)}`)
}

export interface Artifact {
  abi: Abi
  bytecode: Hex
}

export function artifact(file: string, name: string): Artifact {
  const path = resolve(ROOT, 'contracts/out', file, `${name}.json`)
  const json = JSON.parse(readFileSync(path, 'utf8'))
  return { abi: json.abi as Abi, bytecode: (json.bytecode?.object ?? json.bytecode) as Hex }
}

export interface Deployed {
  chain: ReturnType<typeof localChain>
  registry: Address
  implementation: Address
  brokers: Address
  stock: Address
  drops: Address
  batch: Address
  treasury: Address
  operator: Address
  holder: Address
  client: PublicClient
  wallet: WalletClient
}

export async function deployAll(
  anvil: Anvil,
  opts: { brokerCount: number; feeBps?: number; chainId?: number; registry?: Address; implementation?: Address }
): Promise<Deployed> {
  const chain = localChain(anvil.port, opts.chainId ?? 31337)
  const account = privateKeyToAccount(ANVIL_KEY)
  const holderAccount = privateKeyToAccount(ANVIL_KEY_2)
  const client = createPublicClient({ chain, transport: http(anvil.url) }) as PublicClient
  const wallet = createWalletClient({ account, chain, transport: http(anvil.url) })

  const deploy = async (a: Artifact, args: readonly unknown[] = []): Promise<Address> => {
    const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode, args: args as never, account, chain })
    const receipt = await client.waitForTransactionReceipt({ hash })
    if (!receipt.contractAddress) throw new Error('desfasurare fara adresa')
    return receipt.contractAddress
  }

  /* pe fork folosim registrul si implementarea care exista deja pe lantul real,
     nu copiile noastre. Asta e diferenta dintre "codul meu e consecvent cu el
     insusi" si "codul meu e consecvent cu productia". */
  const registry = opts.registry ?? (await deploy(artifact('ERC6551Registry.sol', 'ERC6551Registry')))
  const implementation = opts.implementation ?? (await deploy(artifact('ERC6551Account.sol', 'ERC6551Account')))
  const brokers = await deploy(artifact('MockBrokerNFT.sol', 'MockBrokerNFT'))
  const stock = await deploy(artifact('MockERC20.sol', 'MockERC20'), ['Mock NVDA', 'mNVDA', 18])
  const salt = ('0x' + '00'.repeat(32)) as Hex
  const drops = await deploy(artifact('MockDrops.sol', 'MockDrops'), [registry, implementation, salt, brokers, stock])
  const treasury = '0x00000000000000000000000000000000000000A1' as Address
  const batch = await deploy(artifact('CourierBatch.sol', 'CourierBatch'), [treasury, opts.feeBps ?? 1000])

  // brokerii sunt pe un alt cont decat operatorul: asa aratam ca livram
  // pentru altcineva, nu pentru noi
  const brokersAbi = artifact('MockBrokerNFT.sol', 'MockBrokerNFT').abi
  await client.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      address: brokers,
      abi: brokersAbi,
      functionName: 'mint',
      args: [holderAccount.address, BigInt(opts.brokerCount)],
      account,
      chain
    })
  })

  return {
    chain,
    registry,
    implementation,
    brokers,
    stock,
    drops,
    batch,
    treasury,
    operator: account.address,
    holder: holderAccount.address,
    client,
    wallet
  }
}

/** pune ETH si tokeni nerevendicati pe brokerii dati */
export async function fundDrops(
  d: Deployed,
  ids: bigint[],
  ethEach: bigint,
  tokenEach: bigint
): Promise<void> {
  const dropsAbi = artifact('MockDrops.sol', 'MockDrops').abi
  const stockAbi = artifact('MockERC20.sol', 'MockERC20').abi
  const account = privateKeyToAccount(ANVIL_KEY)
  const chain = d.chain

  await d.client.waitForTransactionReceipt({
    hash: await d.wallet.writeContract({
      address: d.stock,
      abi: stockAbi,
      functionName: 'mint',
      args: [d.drops, tokenEach * BigInt(ids.length)],
      account,
      chain
    })
  })

  await d.client.waitForTransactionReceipt({
    hash: await d.wallet.writeContract({
      address: d.drops,
      abi: dropsAbi,
      functionName: 'fund',
      args: [ids, ids.map(() => ethEach), ids.map(() => tokenEach)],
      value: ethEach * BigInt(ids.length),
      account,
      chain
    })
  })
}

export function writeTestConfig(
  file: string,
  d: Deployed,
  anvil: Anvil,
  over: Record<string, unknown> = {}
): string {
  const cfg = {
    network: {
      name: 'anvil',
      chainId: d.chain.id,
      rpc: [anvil.url],
      nativeSymbol: 'ETH',
      multicall3: null,
      blockTimeMs: 100
    },
    erc6551: {
      registry: d.registry,
      implementation: d.implementation,
      salt: '0x' + '00'.repeat(32),
      verifyOnChain: true
    },
    brokers: { address: d.brokers, idStrategy: 'range', firstId: 1 },
    drops: {
      address: d.drops,
      pending: {
        signature:
          'function pendingOf(uint256 tokenId) view returns (uint256 ethAmount, uint256 tokenAmount)',
        arg: 'tokenId',
        nativeFields: ['ethAmount'],
        tokenFields: [
          { field: 'tokenAmount', token: d.stock, decimals: 18, symbol: 'mNVDA', weiPerToken: '1000000000000000' }
        ]
      },
      deliverSignature: 'function deliver(uint256 tokenId) returns (uint256)',
      deliverArg: 'tokenId',
      errorSignatures: ['error NothingPending(uint256 tokenId)', 'error NotBrokerOwner(uint256 tokenId)'],
      readChunk: 100
    },
    policy: {
      mode: 'profit',
      minValueWei: '1',
      profitMultiple: 0,
      cooldownSec: 0,
      maxDeliveriesPerRun: 100,
      batchSize: 10,
      gasCapPerCall: '500000'
    },
    execution: {
      dryRun: true,
      privateKey: ANVIL_KEY,
      batchContract: d.batch,
      beneficiary: d.holder,
      confirmations: 1,
      killSwitchFile: './data/test-STOP'
    },
    runner: { intervalSec: 5, jitterSec: 0 },
    alerts: {
      telegram: { enabled: false },
      watchers: { enabled: true }
    },
    api: { enabled: false, host: '127.0.0.1', port: 8899 },
    storage: { file: ':memory:' }
  }
  const merged = deepMerge(cfg as Record<string, unknown>, over)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(merged, null, 2))
  return file
}

export function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a }
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') {
      out[k] = deepMerge(a[k] as Record<string, unknown>, v as Record<string, unknown>)
    } else {
      out[k] = v
    }
  }
  return out
}

export function cleanup(paths: string[]): void {
  for (const p of paths) rmSync(p, { force: true, recursive: true })
}

export { parseEther }
