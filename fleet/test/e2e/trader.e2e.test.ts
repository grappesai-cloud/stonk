/**
 * PROBA CAP-COADA A TRADERULUI: contractele Financial NFA deployate pe un fork
 * al lantului real, NFT mintat, vault fondat cu USDG adevarat (ETH -> USDG prin
 * pool-ul v4 canonic), apoi FLOTA — nu runner-ul vechi — descopera rotatia,
 * o simuleaza, o semneaza si o confirma. La final, actiunile sunt in vault.
 *
 * Are nevoie de repo-ul PRIVAT financial-nfa pe disc (creierul + contractele).
 * Fara el, proba se sare si o spune: repo-ul asta e public, iar strategiile si
 * contractele nu locuiesc aici.
 *
 * Preturile pentru semnal sunt SCRISE de test in cache-ul zilei (bull curat,
 * NVDA lider), fiindca o proba care depinde de dispozitia pietei de azi ar
 * dovedi ceva doar in zilele in care piata coopereaza. Preturile ONCHAIN insa
 * sunt cele reale: guard-ul valideaza trade-ul contra feed-urilor Chainlink de
 * pe fork, nu contra cache-ului nostru.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseAbi, parseEther, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ANVIL_KEY, ANVIL_KEY_2, ROOT, rigOf, startAnvil, type Anvil, type Rig } from './harness.js'
import { buildContext } from '../../src/core/context.js'
import { runOnce } from '../../src/core/runner.js'
import { doctor } from '../../src/core/doctor.js'
import { loadBrain } from '../../src/jobs/trader.js'

const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const PORT = 8642
const CHAIN_ID = 4663

const NFA = process.env.FINANCIAL_NFA_DIR ?? resolve(ROOT, '../../financial-nfa')
const FORGE = process.env.FORGE_BIN ?? `${process.env.HOME}/.foundry/bin/forge`

const TOKENS = {
  USDG: { address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', decimals: 6, feed: null as string | null },
  NVDA: { address: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC', decimals: 18, feed: '0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15' },
  TSLA: { address: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d', decimals: 18, feed: '0x4A1166a659A55625345e9515b32adECea5547C38' },
  SPY: { address: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C', decimals: 18, feed: '0x319724394D3A0e3669269846abE664Cd621f9f6A' },
  COIN: { address: '0x6330D8C3178a418788dF01a47479c0ce7CCF450b', decimals: 18, feed: '0xA3a468A452940B7D6b69991207B508c609a98Ef2' },
  MSTR: { address: '0xec262a75e413fAfD0dF80480274532C79D42da09', decimals: 18, feed: '0x2521a77F42098357e83bDea7fBb2A38745bf9280' },
  PLTR: { address: '0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A', decimals: 18, feed: '0x820ABedFF239034956B7A9d2F0a331f9F075eB4c' },
  AMD: { address: '0x86923f96303D656E4aa86D9d42D1e57ad2023fdC', decimals: 18, feed: '0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72' }
}

const registryAbi = parseAbi([
  'function policyOf(uint16 id) view returns ((uint256 maxTradeUsd, uint256 maxDailyUsd, uint32 maxSlippageBps, uint32 cooldownSec, uint32 maxStaleSec, bool exists))',
  'function setPolicy(uint16 id, (uint256 maxTradeUsd, uint256 maxDailyUsd, uint32 maxSlippageBps, uint32 cooldownSec, uint32 maxStaleSec, bool exists) p)'
])
const nftAbi = parseAbi(['function accountOf(uint256 id) view returns (address)'])
const erc20 = parseAbi(['function balanceOf(address a) view returns (uint256)'])

let anvil: Anvil | null = null
let rig: Rig
let up = false
let why = ''
let nft: Address
let registry: Address
let track: Address
let vault: Address
let tmp = ''
let cfgFile = ''

const agentSigner = privateKeyToAccount(ANVIL_KEY_2)

function forge(script: string, env: Record<string, string>): string {
  /* Anvil-ul de fork trage starea de pe lantul real abia la prima atingere, si
     forge taie orice cerere la ~45s indiferent de flaguri. Dar cache-ul de fork
     al lui anvil RAMANE intre incercari: fiecare rulare picata mai incalzeste o
     bucata de stare, pana cand cererea incape sub prag. Simularea picata nu a
     difuzat nimic, deci reluarea e sigura. */
  let lastErr = ''
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      return execFileSync(
        FORGE,
        ['script', `script/${script}`, '--rpc-url', rig.url, '--broadcast', '--rpc-timeout', '600', '--timeout', '600'],
        {
          cwd: join(NFA, 'contracts'),
          env: { ...process.env, ...env },
          encoding: 'utf8',
          timeout: 540_000
        }
      )
    } catch (e) {
      lastErr = (e as Error).message
      if (!/timed out|timeout/i.test(lastErr)) throw e
    }
  }
  throw new Error(`forge ${script} a picat si dupa incalzirea cache-ului: ${lastErr.slice(0, 400)}`)
}

/** aduce codul contractelor grele in cache-ul forkului, o adresa = un drum remote */
async function warmFork(): Promise<void> {
  const heavy: Address[] = [
    '0x8876789976dEcBfCbBbe364623C63652db8C0904', // UniversalRouter
    '0x000000000022D473030F116dDEE9F6B43aC78BA3', // Permit2
    '0x000000006551c19487814612e58FE06813775758', // ERC-6551 registry
    '0xcA11bde05977b3631167028862bE2a173976CA11', // Multicall3
    ...Object.values(TOKENS).map((t) => t.address as Address),
    ...Object.values(TOKENS).flatMap((t) => (t.feed ? [t.feed as Address] : []))
  ]
  await Promise.all(heavy.map((a) => rig.client.getCode({ address: a }).catch(() => null)))
}

/** adresele din jurnalul de broadcast al forge, pe numele contractului */
function deployedAddresses(script: string): Record<string, Address> {
  const file = join(NFA, 'contracts', 'broadcast', script, String(CHAIN_ID), 'run-latest.json')
  const j = JSON.parse(readFileSync(file, 'utf8')) as {
    transactions: Array<{ transactionType: string; contractName: string | null; contractAddress: string | null }>
  }
  const out: Record<string, Address> = {}
  for (const t of j.transactions) {
    if (t.transactionType === 'CREATE' && t.contractName && t.contractAddress) {
      out[t.contractName] = t.contractAddress as Address
    }
  }
  return out
}

/** un bull curat, cu NVDA lider: destule bare cat warmup-ul strategiei-fanion */
function writeSyntheticBars(cacheDir: string, symbols: string[]): void {
  const day = new Date().toISOString().slice(0, 10)
  const dir = join(cacheDir, day)
  mkdirSync(dir, { recursive: true })
  const N = 300
  for (const sym of symbols) {
    const bars: Array<{ t: number; c: number }> = []
    for (let i = 0; i < N; i++) {
      const c = sym === 'NVDA' ? 100 * (1 + 0.005 * i) : sym === 'QQQ' || sym === 'SPY' ? 100 * (1 + 0.001 * i) : 100
      bars.push({ t: i + 1, c })
    }
    writeFileSync(join(dir, `${sym}.json`), JSON.stringify(bars))
  }
}

beforeAll(async () => {
  if (!existsSync(join(NFA, 'contracts/script/Deploy.s.sol')) || !existsSync(join(NFA, 'dist/src/backtest/signals.js'))) {
    why = `financial-nfa lipseste sau nu e build-uit la ${NFA}`
    return
  }
  if (!existsSync(FORGE)) {
    why = `forge lipseste la ${FORGE}`
    return
  }
  try {
    /* cups mic: RPC-ul public taie cu 429 la rafale, iar un deploy intreg pe
       fork E o rafala. Proba asta e lenta prin natura ei; rabdarea e a ei. */
    anvil = await startAnvil(PORT, { forkUrl: RPC, cups: 300 })
    rig = await rigOf(anvil, CHAIN_ID)
    await warmFork()

    // 1) contractele, cu deployerul = primul cont anvil
    forge('Deploy.s.sol', { DEPLOYER_KEY: ANVIL_KEY })
    const a = deployedAddresses('Deploy.s.sol')
    if (!a.AgentNFT || !a.StrategyRegistry || !a.TrackRecord) {
      throw new Error(`lipsesc adrese din broadcast: ${Object.keys(a).join(', ')}`)
    }
    nft = a.AgentNFT
    registry = a.StrategyRegistry
    track = a.TrackRecord

    // 2) NFT-ul canary (strategia 7, fanionul) + cheia de agent
    forge('Seed.s.sol', { DEPLOYER_KEY: ANVIL_KEY, NFT: nft, AGENT_SIGNER: agentSigner.address, STRATEGY: '7' })
    vault = (await rig.client.readContract({ address: nft, abi: nftAbi, functionName: 'accountOf', args: [1n] })) as Address

    // 3) fondarea: ETH real de pe fork -> USDG prin pool-ul canonic, in vault
    forge('SeedSwap.s.sol', {
      DEPLOYER_KEY: ANVIL_KEY,
      VAULT: vault,
      TRACK: track,
      TOKEN_ID: '1',
      SEED_ETH_WEI: parseEther('0.2').toString(),
      MIN_USDG_OUT: '400000000' // 400 USDG pentru 0.2 ETH: frana e reala si in proba
    })

    /* 4) pe fork timpul sta pe loc fata de feed-uri, deci orice fereastra
       normala de prospetime ar opri totul; o largim, DOAR aici. Slippage-ul,
       plafoanele si cooldown-ul raman cele reale. */
    const policy = await rig.client.readContract({ address: registry, abi: registryAbi, functionName: 'policyOf', args: [7] })
    await rig.wallet.writeContract({
      address: registry,
      abi: registryAbi,
      functionName: 'setPolicy',
      args: [7, { ...policy, maxStaleSec: 1_000_000_000 }],
      account: privateKeyToAccount(ANVIL_KEY),
      chain: rig.chain
    })

    // 5) semnalul: bull sintetic cu NVDA lider, scris in cache-ul zilei
    tmp = join(tmpdir(), `trader-e2e-${process.pid}`)
    const brain = await loadBrain(NFA)
    writeSyntheticBars(join(tmp, 'prices'), brain.ALL_SYMBOLS)

    // 6) configurarea flotei, pe fork, cu cheia de agent si dry-run OPRIT
    cfgFile = join(tmp, 'trader.json')
    writeFileSync(
      cfgFile,
      JSON.stringify({
        watchtower: false,
        agent: { kind: 'trader', id: 1, name: 'TRADER E2E' },
        network: {
          name: 'fork-4663',
          chainId: CHAIN_ID,
          rpc: [rig.url],
          nativeSymbol: 'ETH',
          multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11'
        },
        target: { address: nft, errorSignatures: ['error NotAgent()', 'error SlippageTooHigh()', 'error Cooldown()'] },
        job: {
          tokenId: 1,
          registry,
          brain: { dir: NFA },
          tokens: TOKENS,
          eth: { usd8: '400000000000' },
          history: { range: '1y', cacheDir: join(tmp, 'prices') }
        },
        policy: { mode: 'campaign', requireMeasuredReward: false, maxJobsPerRun: 1, gasCapPerCall: '2500000' },
        execution: { dryRun: false, privateKey: ANVIL_KEY_2, killSwitchFile: join(tmp, 'NOSTOP') },
        runner: { mode: 'interval', intervalSec: 600 },
        api: { enabled: false },
        console: { enabled: false },
        storage: { file: join(tmp, 'ledger.db'), backup: { enabled: false } }
      })
    )
    up = true
  } catch (e) {
    why = (e as Error).message.slice(0, 800)
  }
}, 600_000)

afterAll(() => {
  anvil?.stop()
  if (tmp) rmSync(tmp, { recursive: true, force: true })
})

describe('traderul flotei, cap-coada pe fork', () => {
  it('doctorul da verde pe lumea deployata: cheia e a agentului, strainul e respins', async () => {
    if (!up) return console.log(`SKIP: ${why}`)
    const ctx = buildContext(cfgFile)
    const checks = await doctor(ctx)
    const fatal = checks.filter((c) => !c.ok && c.fatal)
    expect(fatal, JSON.stringify(fatal, null, 2)).toHaveLength(0)
    const mine = checks.find((c) => c.name === 'executeTrade() callable by us')
    expect(mine?.ok).toBe(true)
    const stranger = checks.find((c) => c.name === 'a stranger cannot vote with our position')
    expect(stranger?.ok).toBe(true)
  }, 300_000)

  it('rotatia USDG -> NVDA trece prin executorul flotei si actiunile ajung in vault', async () => {
    if (!up) return console.log(`SKIP: ${why}`)
    const usdgBefore = (await rig.client.readContract({
      address: TOKENS.USDG.address as Address,
      abi: erc20,
      functionName: 'balanceOf',
      args: [vault]
    })) as bigint
    expect(usdgBefore).toBeGreaterThan(0n)

    const ctx = buildContext(cfgFile)
    const outcome = await runOnce(ctx)
    expect(outcome.stoppedBy, `stoppedBy: ${outcome.stoppedBy}`).toBeNull()
    expect(outcome.done).toBe(1)

    const [usdgAfter, nvdaAfter] = (await Promise.all([
      rig.client.readContract({ address: TOKENS.USDG.address as Address, abi: erc20, functionName: 'balanceOf', args: [vault] }),
      rig.client.readContract({ address: TOKENS.NVDA.address as Address, abi: erc20, functionName: 'balanceOf', args: [vault] })
    ])) as [bigint, bigint]

    /* dovada: marfa s-a schimbat, nu s-a scurs. USDG plecat, NVDA sosit, si
       nimic nu a ajuns la cheia de agent. */
    expect(nvdaAfter).toBeGreaterThan(0n)
    expect(usdgAfter).toBeLessThan(usdgBefore / 100n)
    const agentNvda = (await rig.client.readContract({
      address: TOKENS.NVDA.address as Address,
      abi: erc20,
      functionName: 'balanceOf',
      args: [agentSigner.address]
    })) as bigint
    expect(agentNvda).toBe(0n)
  }, 300_000)

  it('a doua rulare in aceeasi zi nu mai trimite nimic: aceeasi cheie, aceeasi zi, o singura data', async () => {
    if (!up) return console.log(`SKIP: ${why}`)
    const ctx = buildContext(cfgFile)
    const outcome = await runOnce(ctx)
    expect(outcome.done).toBe(0)
  }, 300_000)
})
