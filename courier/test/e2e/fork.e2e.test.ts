/**
 * Proba pe un fork al lantului real (4663).
 *
 * Testele de pe lantul local dovedesc ca logica e consecventa cu ea insasi:
 * acolo desfasor registrul MEU de 6551, deci daca as fi inteles gresit
 * specificatia, si codul si testul ar gresi la fel si nimic nu ar cadea.
 *
 * Aici starea e cea de productie, iar registrul si implementarea sunt CELE
 * ADEVARATE, deja desfasurate pe 4663. Daca matematica mea de adrese e gresita,
 * cade aici. Fara chei, fara fonduri, fara adresele StonkBrokers.
 *
 * Se sare de la sine daca RPC-ul public nu raspunde, ca sa nu pice suita din
 * cauza altcuiva.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getAddress, parseAbi, parseEther, type Address, type Hex } from 'viem'
import { deployAll, fundDrops, startAnvil, writeTestConfig, type Anvil, type Deployed } from './harness.js'
import { buildContext, STRANGER, type Ctx } from '../../src/context.js'
import { runOnce } from '../../src/runner.js'
import { tbaAddress, REGISTRY_ABI } from '../../src/erc6551/address.js'
import { doctor } from '../../src/doctor.js'

const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const PORT = 8559
const CHAIN_ID = 4663
const CFG = './data/test/fork.json'
const SALT = ('0x' + '00'.repeat(32)) as Hex

/* adresele reale, deja desfasurate pe 4663 */
const REAL_REGISTRY = getAddress('0x000000006551c19487814612e58FE06813775758')
const REAL_IMPL = getAddress('0x41C8f39463A868d3A88af00cd0fe7102F30E44eC')
const UNISWAP_POSITIONS = getAddress('0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3')

const BROKERS = 8
const ETH_EACH = parseEther('0.005')

let anvil: Anvil | null = null
let d: Deployed
let ctx: Ctx
let up = false

beforeAll(async () => {
  try {
    anvil = await startAnvil(PORT, RPC)
    d = await deployAll(anvil, {
      brokerCount: BROKERS,
      feeBps: 1000,
      chainId: CHAIN_ID,
      registry: REAL_REGISTRY,
      implementation: REAL_IMPL
    })
    await fundDrops(d, Array.from({ length: BROKERS }, (_, i) => BigInt(i + 1)), ETH_EACH, 0n)
    writeTestConfig(CFG, d, anvil, {
      policy: { minValueWei: '1', profitMultiple: 0, cooldownSec: 0, mode: 'campaign' },
      execution: { dryRun: true }
    })
    ctx = buildContext(CFG)
    up = true
  } catch (e) {
    process.stdout.write(`fork indisponibil, sar peste: ${(e as Error).message}\n`)
    up = false
  }
}, 180_000)

afterAll(() => {
  ctx?.ledger.close()
  anvil?.stop()
})

describe('pe forkul lantului real', () => {
  it('forkul chiar e 4663, cu starea de productie', async (t) => {
    if (!up) return t.skip()
    expect(await d.client.getChainId()).toBe(CHAIN_ID)
    /* contracte care exista doar pe lantul real, nu pe unul gol */
    for (const a of [REAL_REGISTRY, REAL_IMPL, UNISWAP_POSITIONS]) {
      const code = await d.client.getCode({ address: a })
      expect(code && code.length > 2).toBe(true)
    }
  }, 60_000)

  it('adresa calculata local bate cu REGISTRUL ADEVARAT, nu cu copia mea', async (t) => {
    if (!up) return t.skip()
    for (let id = 1n; id <= BigInt(BROKERS); id++) {
      const local = tbaAddress({
        registry: REAL_REGISTRY,
        implementation: REAL_IMPL,
        salt: SALT,
        chainId: CHAIN_ID,
        tokenContract: d.brokers,
        tokenId: id
      })
      const onchain = (await d.client.readContract({
        address: REAL_REGISTRY,
        abi: REGISTRY_ABI,
        functionName: 'account',
        args: [REAL_IMPL, SALT, BigInt(CHAIN_ID), d.brokers, id]
      })) as Address
      expect(local.toLowerCase()).toBe(onchain.toLowerCase())
    }
  }, 90_000)

  it('diagnosticul trece pe starea de productie', async (t) => {
    if (!up) return t.skip()
    const checks = await doctor(ctx)
    const failed = checks.filter((c) => !c.ok && c.fatal)
    expect(failed.map((f) => `${f.name}: ${f.detail}`)).toEqual([])
  }, 120_000)

  it('livreaza pe bune si banii ajung in portofelul brokerului', async (t) => {
    if (!up) return t.skip()
    ctx.cfg.execution.dryRun = false
    const wallets = Array.from({ length: BROKERS }, (_, i) =>
      tbaAddress({
        registry: REAL_REGISTRY,
        implementation: REAL_IMPL,
        salt: SALT,
        chainId: CHAIN_ID,
        tokenContract: d.brokers,
        tokenId: BigInt(i + 1)
      })
    )
    const before = await Promise.all(wallets.map((w) => d.client.getBalance({ address: w })))
    const o = await runOnce(ctx)
    const after = await Promise.all(wallets.map((w) => d.client.getBalance({ address: w })))

    expect(o.delivered).toBe(BROKERS)
    for (let i = 0; i < wallets.length; i++) expect(after[i]! > before[i]!).toBe(true)
    /* gazul real al lantului, nu unul inventat de un nod gol */
    expect(o.gasWei).toBeGreaterThan(0n)
  }, 180_000)
})

describe('detectarea autorizarii, pe un contract adevarat', () => {
  /**
   * Uniswap nu are nicio legatura cu noi, si tocmai de aia e proba buna:
   * `collect()` e rezervata proprietarului pozitiei. Daca unealta spune ca un
   * strain o poate apela, detectia e stricata.
   */
  const posAbi = parseAbi([
    'function ownerOf(uint256 tokenId) view returns (address)',
    'function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max) params) returns (uint256 amount0, uint256 amount1)'
  ])
  const MAX = (1n << 128n) - 1n

  it('un strain e respins, proprietarul nu', async (t) => {
    if (!up) return t.skip()
    const tokenId = 1n
    const owner = (await d.client.readContract({
      address: UNISWAP_POSITIONS,
      abi: posAbi,
      functionName: 'ownerOf',
      args: [tokenId]
    })) as Address

    const call = (from: Address) =>
      d.client.simulateContract({
        address: UNISWAP_POSITIONS,
        abi: posAbi,
        functionName: 'collect',
        args: [{ tokenId, recipient: from, amount0Max: MAX, amount1Max: MAX }],
        account: from
      })

    let strangerFailed = false
    let strangerReason = ''
    try {
      await call(STRANGER as Address)
    } catch (e) {
      strangerFailed = true
      strangerReason = (e as Error).message
    }

    let ownerFailed = false
    try {
      await call(owner)
    } catch {
      ownerFailed = true
    }

    expect(strangerFailed).toBe(true)
    expect(ownerFailed).toBe(false)
    /* si motivul chiar vorbeste despre autorizare, nu despre altceva */
    expect(strangerReason.toLowerCase()).toMatch(/not approved|unauthorized|not owner/)
  }, 120_000)
})
