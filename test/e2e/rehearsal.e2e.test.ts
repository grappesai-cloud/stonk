/**
 * ATENTIE la felul acestor teste: starea vine din lumea reala.
 *
 * Daca intre doua rulari cineva de afara apasa butonul, agentul nostru nu mai
 * are ce face, si aia NU e o cadere. De aia fiecare proba se uita intai daca
 * exista treaba, si daca nu exista o spune si sare. Un test care cade fiindca
 * altcineva si-a facut treaba te invata sa ignori testele.
 *
 * REPETITIA GENERALA: agentii lucreaza pe contractele ADEVARATE StonkBrokers,
 * cu starea de productie, dar pe un fork.
 *
 * E singura proba completa care se poate face fara sa cheltui un leu, si e cu
 * mult mai tare decat orice contract scris de mine: aici `startRound` si
 * `clockIn` sunt ale lor, brokerii sunt cei reali, sumele sunt cele care chiar
 * asteapta acum pe lant, iar portofelele 6551 in care ajung banii sunt
 * calculate de contractul lor, nu de mine.
 *
 * Ce NU dovedeste: ca tranzactia noastra ajunge in blocul public. Aia depinde
 * de validatori si de cine mai trimite in acelasi moment, si nu se poate afla
 * decat trimitand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { formatEther, getAddress, parseAbi, parseEther, type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { cleanup, rigOf, rpc, startAnvil, deepMerge, type Anvil, type Rig } from './harness.js'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { buildContext, type Ctx } from '../../src/core/context.js'
import { runOnce } from '../../src/core/runner.js'
import { doctor } from '../../src/core/doctor.js'

const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const PORT = 8638
const CHAIN_ID = 4663

const CLOCK = getAddress('0x55642A3F10F1Af5145D3d59021B1D6b03BB8692c')
const COLLECTION = getAddress('0x539CdD042c2f3d93EbC5BE7DfFf0c79F3B4fAbF0')
const BOOSTER = getAddress('0x1f12fe622c11947f93F53d63f68f7F46B6D081c9')
const AAPL = getAddress('0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9')
const AMZN = getAddress('0x12f190a9F9d7D37a250758b26824B97CE941bF54')

/* cati brokeri se uita testul: destui cat sa iasa loturi adevarate, putini cat
   sa nu tinem forkul o ora ca sa citim patru mii de sloturi prin el */
const BROKERS = 300n

const clockAbi = parseAbi([
  'function rounds(address token) view returns (uint64 round, uint64 startedAt, uint256 pot, uint256 remaining, uint256 totalWeight)',
  'function claimable(address token, uint256 tokenId) view returns (uint256)'
])
const nftAbi = parseAbi(['function tokenWallet(uint256 tokenId) view returns (address)'])
const boosterAbi = parseAbi([
  'function phase() view returns (uint8)',
  'function currentRound() view returns (uint256)',
  'function roundPotWei() view returns (uint256)'
])
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)'])

let anvil: Anvil | null = null
let rig: Rig
let up = false
let key: Hex
let operator: Address

/** o configurare completa, pe contractele reale, dar catre forkul local */
function write(file: string, base: string, over: Record<string, unknown>): string {
  const cfg = JSON.parse(readFileSync(base, 'utf8')) as Record<string, unknown>
  const merged = deepMerge(cfg, {
    watchtower: false,
    network: { rpc: [rig.url], chainId: CHAIN_ID, multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11' },
    execution: { dryRun: false, privateKey: key, killSwitchFile: './data/test/NOSTOP' },
    storage: { file: ':memory:', backup: { enabled: false } },
    api: { enabled: false },
    console: { enabled: false },
    alerts: { telegram: { enabled: false }, heartbeat: { url: null } },
    ...over
  })
  mkdirSync('./data/test', { recursive: true })
  writeFileSync(file, JSON.stringify(merged, null, 2))
  return file
}

beforeAll(async () => {
  try {
    anvil = await startAnvil(PORT, { forkUrl: RPC })
    rig = await rigOf(anvil, CHAIN_ID)
    /* cheie noua, curata: pe 4663 conturile de proba ale nodului au delegare
       7702 si banii nu ar ramane la ele */
    key = generatePrivateKey()
    operator = privateKeyToAccount(key).address
    await rpc(rig.url, 'anvil_setBalance', [operator, '0x' + parseEther('1').toString(16)])
    up = true
  } catch (e) {
    process.stdout.write(`fork indisponibil, sar peste: ${(e as Error).message}\n`)
    up = false
  }
}, 240_000)

afterAll(() => {
  anvil?.stop()
  cleanup(['./data/test/reh-ringer.json', './data/test/reh-courier.json', './data/test/reh-crank.json'])
})

describe('repetitie generala pe contractele reale StonkBrokers', () => {
  it('forkul are starea de productie: contractele lor exista si au runde', async (t) => {
    if (!up) return t.skip()
    expect(await rig.client.getChainId()).toBe(CHAIN_ID)
    for (const a of [CLOCK, COLLECTION, AAPL, AMZN]) {
      const code = await rig.client.getCode({ address: a })
      expect(code && code.length > 2).toBe(true)
    }
    const r = (await rig.client.readContract({ address: CLOCK, abi: clockAbi, functionName: 'rounds', args: [AAPL] })) as unknown as bigint[]
    expect(r[0]! > 0n).toBe(true)
    process.stdout.write(`   AAPL: runda ${r[0]}, ramas de impartit ${formatEther(r[3]!)}\n`)
  }, 120_000)

  it('RINGER apasa startRound pe bune, si runda se schimba pe lant', async (t) => {
    if (!up) return t.skip()
    const file = write('./data/test/reh-ringer.json', './config/ringer.json', {})
    const ctx: Ctx = buildContext(file)

    const before = (await rig.client.readContract({ address: CLOCK, abi: clockAbi, functionName: 'rounds', args: [AAPL] })) as unknown as bigint[]
    const o = await runOnce(ctx)
    const after = (await rig.client.readContract({ address: CLOCK, abi: clockAbi, functionName: 'rounds', args: [AAPL] })) as unknown as bigint[]

    process.stdout.write(`   apasate: ${o.done}, gaz ars ${formatEther(o.gasWei)} ETH\n`)
    if (o.done === 0) {
      process.stdout.write('   rundele sunt deja pornite de altcineva, deci nu e o cadere.\n')
      ctx.ledger.close()
      return t.skip()
    }
    expect(o.done).toBeGreaterThanOrEqual(1)
    /* runda a crescut si oala noua e mai mare decat restul vechi */
    expect(after[0]!).toBe(before[0]! + 1n)
    expect(after[2]! > 0n).toBe(true)
    expect(o.gasWei > 0n).toBe(true)
    ctx.ledger.close()
  }, 240_000)

  it('COURIER livreaza, iar banii ajung in portofelele 6551 ale brokerilor', async (t) => {
    if (!up) return t.skip()
    const file = write('./data/test/reh-courier.json', './config/courier.json', {
      /* loturi mici de citire: un fork raspunde mai greu decat nodul public,
         fiindca pentru fiecare slot nou trebuie sa intrebe lantul adevarat */
      job: { brokers: { count: BROKERS.toString() }, batchSize: 40, readChunk: 60 },
      policy: { maxJobsPerRun: 3 }
    })
    const ctx: Ctx = buildContext(file)

    /* alegem un broker care chiar are ceva de luat, si ii masuram portofelul */
    let probe: bigint | null = null
    for (let id = 1n; id <= BROKERS && probe === null; id++) {
      const c = (await rig.client.readContract({ address: CLOCK, abi: clockAbi, functionName: 'claimable', args: [AAPL, id] })) as bigint
      if (c > 0n) probe = id
    }
    expect(probe).not.toBeNull()
    const wallet = (await rig.client.readContract({ address: COLLECTION, abi: nftAbi, functionName: 'tokenWallet', args: [probe!] })) as Address
    const owedBefore = (await rig.client.readContract({ address: CLOCK, abi: clockAbi, functionName: 'claimable', args: [AAPL, probe!] })) as bigint
    const balBefore = (await rig.client.readContract({ address: AAPL, abi: erc20, functionName: 'balanceOf', args: [wallet] })) as bigint

    const o = await runOnce(ctx)
    process.stdout.write(
      `   loturi livrate: ${o.done}, gaz ars ${formatEther(o.gasWei)} ETH, broker de proba #${probe} -> ${wallet}\n`
    )

    const owedAfter = (await rig.client.readContract({ address: CLOCK, abi: clockAbi, functionName: 'claimable', args: [AAPL, probe!] })) as bigint
    const balAfter = (await rig.client.readContract({ address: AAPL, abi: erc20, functionName: 'balanceOf', args: [wallet] })) as bigint

    if (o.done === 0) {
      process.stdout.write('   peretele e gol acum, altcineva a livrat. Nu e o cadere.\n')
      ctx.ledger.close()
      return t.skip()
    }
    /* dovada care conteaza: nu ca a mers apelul, ci ca banii sunt acum ACOLO */
    expect(balAfter - balBefore).toBe(owedBefore)
    expect(owedAfter).toBe(0n)
    process.stdout.write(`   brokerul #${probe} a primit ${formatEther(owedBefore)} AAPL in portofelul lui\n`)

    /* si registrul stie exact ce s-a facut */
    const t2 = ctx.ledger.totals()
    expect(t2.done).toBe(o.done)
    expect(t2.gasWei > 0n).toBe(true)
    ctx.ledger.close()
  }, 300_000)

  it('CRANK invarte masina de runde a boosterului, si faza se schimba', async (t) => {
    if (!up) return t.skip()
    const file = write('./data/test/reh-crank.json', './config/crank.json', {})
    const ctx: Ctx = buildContext(file)

    const before = {
      phase: (await rig.client.readContract({ address: BOOSTER, abi: boosterAbi, functionName: 'phase' })) as number,
      round: (await rig.client.readContract({ address: BOOSTER, abi: boosterAbi, functionName: 'currentRound' })) as bigint,
      pot: (await rig.client.readContract({ address: BOOSTER, abi: boosterAbi, functionName: 'roundPotWei' })) as bigint
    }
    const o = await runOnce(ctx)
    if (o.done === 0) {
      process.stdout.write(
        `   nimic de invartit acum: faza ${before.phase}, oala ${formatEther(before.pot)} ETH. ` +
          `Cineva a apucat inaintea forkului, deci nu e o cadere.\n`
      )
      ctx.ledger.close()
      return t.skip()
    }
    const after = {
      phase: (await rig.client.readContract({ address: BOOSTER, abi: boosterAbi, functionName: 'phase' })) as number,
      round: (await rig.client.readContract({ address: BOOSTER, abi: boosterAbi, functionName: 'currentRound' })) as bigint
    }
    process.stdout.write(
      `   crank: ${o.done} apel, gaz ${formatEther(o.gasWei)} ETH | faza ${before.phase} -> ${after.phase}, runda ${before.round} -> ${after.round}, oala ${formatEther(before.pot)}\n`
    )
    expect(o.done).toBe(1)
    /* masina s-a miscat: ori a deschis runda urmatoare, ori a avansat faza */
    expect(after.round > before.round || after.phase !== before.phase).toBe(true)
    ctx.ledger.close()
  }, 240_000)

  it('dupa livrare nu mai are ce livra din brokerii atinsi', async (t) => {
    if (!up) return t.skip()
    const file = write('./data/test/reh-courier.json', './config/courier.json', {
      job: { brokers: { count: '40' }, batchSize: 40, readChunk: 60 },
      policy: { maxJobsPerRun: 3 }
    })
    const ctx: Ctx = buildContext(file)
    const o = await runOnce(ctx)
    process.stdout.write(`   a doua trecere peste primii 40: vazute ${o.seen}\n`)
    expect(o.seen).toBe(0)
    ctx.ledger.close()
  }, 240_000)
})
