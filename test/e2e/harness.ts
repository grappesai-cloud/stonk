/**
 * Bancul de proba: un lant local cu contracte reale, nu obiecte false.
 *
 * Testele cu obiecte false dovedesc ca ti-ai scris corect obiectele false.
 * Aici se desfasoara contractele, iar agentii le vad exact cum ar vedea
 * productia: prin acelasi drum de configurare, aceleasi simulari, acelasi
 * executor.
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
export const ANVIL_KEY_3 = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as Hex

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

export interface AnvilOptions {
  forkUrl?: string
  /** oprim mineritul automat: asa se poate pune la cale o cursa in acelasi bloc */
  noMining?: boolean
  /** 'fees' (implicit) sau 'fifo' */
  order?: 'fees' | 'fifo'
}

export async function startAnvil(port = 8545, opts: AnvilOptions = {}): Promise<Anvil> {
  const bin = process.env.ANVIL_BIN ?? `${process.env.HOME}/.foundry/bin/anvil`
  const args = ['--port', String(port)]
  if (opts.forkUrl) args.push('--fork-url', opts.forkUrl)
  if (opts.noMining) args.push('--no-mining')
  if (opts.order) args.push('--order', opts.order)

  /* iesirea NU se arunca: cand forkul nu porneste, singurul loc in care scrie
     de ce e chiar aici, si un test care spune doar "nu a pornit" te trimite sa
     ghicesti */
  const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  proc.stdout?.on('data', (b: Buffer) => (out += b.toString()))
  proc.stderr?.on('data', (b: Buffer) => (out += b.toString()))

  const url = `http://127.0.0.1:${port}`
  const client = createPublicClient({ chain: localChain(port), transport: http(url) })
  const waitMs = opts.forkUrl ? 180_000 : 30_000
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`anvil exited on its own (code ${proc.exitCode}):\n${out.slice(-800)}`)
    try {
      await client.getBlockNumber()
      return { proc, port, url, stop: () => proc.kill('SIGKILL') }
    } catch {
      await sleep(250)
    }
  }
  proc.kill('SIGKILL')
  throw new Error(`anvil did not start in ${waitMs / 1000}s. Last output:\n${out.slice(-800)}`)
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

export interface Rig {
  chain: ReturnType<typeof localChain>
  client: PublicClient
  wallet: WalletClient
  operator: Address
  rival: Address
  oracle: Address
  url: string
}

export async function rigOf(anvil: Anvil, chainId = 31337): Promise<Rig> {
  const chain = localChain(anvil.port, chainId)
  const account = privateKeyToAccount(ANVIL_KEY)
  return {
    chain,
    client: createPublicClient({ chain, transport: http(anvil.url) }) as PublicClient,
    wallet: createWalletClient({ account, chain, transport: http(anvil.url) }),
    operator: account.address,
    rival: privateKeyToAccount(ANVIL_KEY_2).address,
    oracle: privateKeyToAccount(ANVIL_KEY_3).address,
    url: anvil.url
  }
}

export async function deploy(rig: Rig, a: Artifact, args: readonly unknown[] = [], value = 0n): Promise<Address> {
  const account = privateKeyToAccount(ANVIL_KEY)
  const hash = await rig.wallet.deployContract({
    abi: a.abi,
    bytecode: a.bytecode,
    args: args as never,
    account,
    chain: rig.chain,
    value
  })
  const receipt = await rig.client.waitForTransactionReceipt({ hash })
  if (!receipt.contractAddress) throw new Error('deployment without an address')
  return receipt.contractAddress
}

export async function send(
  rig: Rig,
  address: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
  opts: { key?: Hex; value?: bigint; maxPriorityFeePerGas?: bigint; wait?: boolean } = {}
): Promise<Hex> {
  const account = privateKeyToAccount(opts.key ?? ANVIL_KEY)
  const wallet = createWalletClient({ account, chain: rig.chain, transport: http(rig.url) })
  const hash = await wallet.writeContract({
    address,
    abi,
    functionName,
    args: args as never,
    account,
    chain: rig.chain,
    value: opts.value ?? 0n,
    ...(opts.maxPriorityFeePerGas !== undefined
      ? { maxPriorityFeePerGas: opts.maxPriorityFeePerGas, maxFeePerGas: opts.maxPriorityFeePerGas + 10_000_000_000n }
      : {})
  })
  if (opts.wait !== false) await rig.client.waitForTransactionReceipt({ hash })
  return hash
}

/** ETH simplu catre o adresa */
export async function fundEth(rig: Rig, to: Address, value: bigint): Promise<void> {
  const account = privateKeyToAccount(ANVIL_KEY)
  const hash = await rig.wallet.sendTransaction({ account, chain: rig.chain, to, value })
  await rig.client.waitForTransactionReceipt({ hash })
}

/** control fin al mineritului, ca sa se poata pune la cale o cursa reala */
export async function rpc(url: string, method: string, params: unknown[] = []): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  })
  const body = (await res.json()) as { result?: unknown; error?: { message: string } }
  if (body.error) throw new Error(`${method}: ${body.error.message}`)
  return body.result
}

export const setAutomine = (url: string, on: boolean) => rpc(url, 'evm_setAutomine', [on])
export const mine = (url: string, blocks = 1) => rpc(url, 'anvil_mine', [`0x${blocks.toString(16)}`])
export const setNextTimestamp = (url: string, ts: number) => rpc(url, 'evm_setNextBlockTimestamp', [ts])
export const increaseTime = (url: string, sec: number) => rpc(url, 'evm_increaseTime', [sec])

/** cate tranzactii asteapta in mempool */
export async function pendingCount(url: string): Promise<number> {
  const status = (await rpc(url, 'txpool_status')) as { pending?: string | number } | null
  if (!status) return 0
  const p = status.pending
  return typeof p === 'string' ? parseInt(p, 16) : (p ?? 0)
}

export async function waitForPending(url: string, want: number, timeoutMs = 15_000): Promise<number> {
  const deadline = Date.now() + timeoutMs
  let last = 0
  while (Date.now() < deadline) {
    last = await pendingCount(url)
    if (last >= want) return last
    await sleep(50)
  }
  return last
}

export interface ConfigOverrides {
  [k: string]: unknown
}

/** o configurare completa si valida pentru bancul de proba */
export type Kind = 'ringer' | 'miner' | 'stocker' | 'lobbyist'

const JOB_DEFAULTS: Record<Kind, unknown> = {
  ringer: {
    slots: null,
    pot: { signature: 'function pot() view returns (uint256)' },
    ready: { mode: 'call-bool', call: { signature: 'function canClockIn() view returns (bool)' } },
    reward: { mode: 'call', call: { signature: 'function clockInTip() view returns (uint256)' } },
    action: { signature: 'function clockIn()' },
    event: {
      signature: 'event ClockIn(address indexed caller, uint256 pot, uint256 tip)',
      callerField: 'caller',
      rewardField: 'tip'
    },
    race: { priorityBumpBps: 0, maxPriorityFeeWei: null, staleBlocks: 3 }
  },
  miner: {
    discovery: { mode: 'list', call: { signature: 'function pendingRounds() view returns (uint256[])' } },
    state: {
      call: {
        signature: 'function roundOf(uint256 id) view returns (uint8 status, uint256 bounty, uint256 pot)',
        args: ['$id']
      },
      readyWhen: { mode: 'equals', field: 'status', value: 2 },
      stakeField: 'pot'
    },
    reward: { mode: 'field', field: 'bounty' },
    action: { signature: 'function settle(uint256 id)', args: ['$id'] },
    readChunk: 100
  },
  stocker: {
    discovery: { mode: 'list', call: { signature: 'function machines_() view returns (uint256[])' } },
    state: {
      call: {
        signature:
          'function machineOf(uint256 id) view returns (uint8 status, uint256 stock, uint256 capacity, uint256 price, uint256 commission)',
        args: ['$id']
      },
      stockField: 'stock',
      capacityField: 'capacity',
      lowWhen: { mode: 'belowFraction', bps: 5000 }
    },
    amount: { mode: 'toCapacity' },
    maxUnitsPerJob: '1000',
    unitCost: { mode: 'field', field: 'price' },
    payment: { mode: 'native' },
    reward: { mode: 'field', field: 'commission' },
    action: { signature: 'function restock(uint256 id, uint256 units)', args: ['$id', '$amount'] },
    readChunk: 100
  },
  lobbyist: {
    position: {
      tokenId: '1',
      power: { signature: 'function balanceOfNFT(uint256 id) view returns (uint256)', args: ['$id'] }
    },
    epoch: { end: { signature: 'function epochEnd() view returns (uint256)' }, voteBeforeSec: 3600 },
    gauges: { mode: 'call', call: { signature: 'function gauges() view returns (address[])' } },
    bribes: { signature: 'function bribesOf(address gauge) view returns (uint256)', args: ['$gauge'] },
    votes: { signature: 'function votesOf(address gauge) view returns (uint256)', args: ['$gauge'] },
    weights: { mode: 'bps', topN: 1 },
    vote: { signature: 'function vote(uint256 tokenId, address[] gauges, uint256[] weights)', args: ['$id', '$gauges', '$weights'] },
    claim: {
      claimable: { signature: 'function claimable(uint256 id) view returns (uint256)', args: ['$id'] },
      action: { signature: 'function claim(uint256 id)', args: ['$id'] }
    }
  }
}

const ERRORS: Record<Kind, string[]> = {
  ringer: ['error NotAuthorized()', 'error NotReady(uint256 nextAt)', 'error EmptyPot()'],
  miner: ['error NotOracle()', 'error NotReady(uint256 id)', 'error AlreadySettled(uint256 id)'],
  stocker: ['error NotAuthorized()', 'error NoRoom(uint256 id)', 'error WrongPayment(uint256 want, uint256 got)'],
  lobbyist: ['error NotLockOwner(uint256 tokenId)', 'error VotingClosed(uint256 epochEnd)', 'error BadWeights()']
}

export function writeTestConfig(file: string, kind: Kind, rig: Rig, target: Address, over: ConfigOverrides = {}): string {
  const base: Record<string, unknown> = {
    watchtower: false,
    agent: { kind, id: 0, name: `${kind.toUpperCase()} #0000` },
    network: {
      name: 'anvil',
      chainId: rig.chain.id,
      rpc: [rig.url],
      nativeSymbol: 'ETH',
      multicall3: null,
      blockTimeMs: 100
    },
    target: { address: target, errorSignatures: ERRORS[kind], deployBlock: 0 },
    job: JOB_DEFAULTS[kind],
    policy: {
      mode: 'profit',
      profitMultiple: 0,
      minRewardWei: '0',
      minStakeWei: '0',
      requireMeasuredReward: true,
      cooldownSec: 0,
      maxJobsPerRun: 25,
      batchSize: 1,
      gasCapPerCall: '500000'
    },
    execution: {
      dryRun: true,
      privateKey: ANVIL_KEY,
      confirmations: 1,
      killSwitchFile: './data/test/STOP-test'
    },
    runner: { mode: kind === 'ringer' ? 'block' : 'interval', intervalSec: 5, jitterSec: 0, pollMs: 100 },
    alerts: { telegram: { enabled: false } },
    api: { enabled: false, host: '127.0.0.1', port: 8899 },
    console: { enabled: false },
    storage: { file: ':memory:', backup: { enabled: false } }
  }
  const merged = deepMerge(base, over)
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

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
export { parseEther }
