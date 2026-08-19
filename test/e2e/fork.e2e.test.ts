/**
 * Proba pe un fork al lantului real (4663).
 *
 * Testele de pe lantul gol dovedesc ca logica e consecventa cu ea insasi:
 * acolo contractele sunt scrise de mine, deci daca as fi inteles gresit ceva,
 * si codul si testul ar gresi la fel si nimic nu ar cadea.
 *
 * Aici starea e cea de productie si contractele sunt STRAINE. Detectarea
 * autorizarii se probeaza pe fabrica Uniswap V3 de pe 4663, un contract care
 * nu are nicio legatura cu noi: `setOwner()` e rezervata proprietarului, si
 * proprietarul se afla CITINDU-L de pe lant, exact cum face agentul. Daca
 * unealta spune ca un strain poate apela, detectia e stricata.
 *
 * Si o proba pe dos, la fel de importanta: pe un contract chiar deschis
 * (Multicall3) trebuie sa spuna DA. O unealta care raspunde mereu "e
 * rezervata" nu detecteaza nimic, doar refuza tot.
 *
 * Se sare de la sine daca RPC-ul public nu raspunde, ca sa nu pice suita din
 * cauza altcuiva.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getAddress, parseAbi, parseEther, type Abi, type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import {
  ANVIL_KEY_3,
  artifact,
  cleanup,
  deploy,
  rigOf,
  rpc,
  send,
  startAnvil,
  writeTestConfig,
  type Anvil,
  type Rig
} from './harness.js'
import { buildContext, STRANGER, type Ctx } from '../../src/core/context.js'
import { runOnce } from '../../src/core/runner.js'
import { doctor } from '../../src/core/doctor.js'
import { probeGating } from '../../src/core/simulate.js'
import { standbyReason } from '../../src/core/standby.js'
import type { WorkItem } from '../../src/core/work.js'

const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const PORT = 8635
const CHAIN_ID = 4663
const CFG = './data/test/fork.json'

/* contracte care exista pe lantul real si nu au nicio legatura cu noi */
const UNISWAP_POSITIONS = getAddress('0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3')
const MULTICALL3 = getAddress('0xcA11bde05977b3631167028862bE2a173976CA11')

let anvil: Anvil | null = null
let rig: Rig
let clock: Address
let ctx: Ctx
let up = false
/**
 * Operatorul e o cheie NOUA, nu una dintre cele de proba ale nodului.
 *
 * Pe 4663 adresele de proba au deja cod de delegare EIP-7702 in starea reala,
 * iar cine plateste catre ele prin `call{value}` reuseste apelul fara ca banii
 * sa ramana acolo. Cu cheile de proba, testul asta trecea la "s-a apasat" si
 * pica la "am incasat", si exact aia e greseala care in productie s-ar vedea
 * abia dupa o luna de raportat castiguri inexistente.
 */
const FRESH_KEY: Hex = generatePrivateKey()
const FRESH = privateKeyToAccount(FRESH_KEY).address

const clockAbi = artifact('MockClock.sol', 'MockClock').abi
const item = (args: unknown[]): WorkItem => ({
  key: 'probe',
  label: 'PROBE',
  args,
  rewardWei: 0n,
  rewardMeasured: false,
  stakeWei: 0n,
  valueWei: 0n,
  costWei: 0n,
  costMeasured: true,
  costToken: null,
  meta: {}
})

beforeAll(async () => {
  try {
    anvil = await startAnvil(PORT, { forkUrl: RPC })
    rig = await rigOf(anvil, CHAIN_ID)
    clock = await deploy(rig, artifact('MockClock.sol', 'MockClock'), [60n, parseEther('0.0001'), 500n])
    await rpc(rig.url, 'anvil_setBalance', [FRESH, '0x' + parseEther('1').toString(16)])
    writeTestConfig(CFG, 'ringer', rig, clock, {
      network: { multicall3: MULTICALL3 },
      execution: { dryRun: true, privateKey: FRESH_KEY }
    })
    ctx = buildContext(CFG)
    up = true
  } catch (e) {
    process.stdout.write(`fork unavailable, skipping: ${(e as Error).message}\n`)
    up = false
  }
}, 240_000)

afterAll(() => {
  ctx?.ledger.close()
  anvil?.stop()
  cleanup([CFG])
})

describe('pe forkul lantului real', () => {
  it('forkul chiar e 4663, cu starea de productie', async (t) => {
    if (!up) return t.skip()
    expect(await rig.client.getChainId()).toBe(CHAIN_ID)
    for (const a of [UNISWAP_POSITIONS, MULTICALL3]) {
      const code = await rig.client.getCode({ address: a })
      expect(code && code.length > 2).toBe(true)
    }
  }, 60_000)

  it('DOVEDESTE ca o functie strains e rezervata, aflandu-i singur proprietarul', async (t) => {
    if (!up) return t.skip()
    /* fabrica Uniswap V3, gasita citind pozitia, nu scrisa de mine in test */
    const factory = (await rig.client.readContract({
      address: UNISWAP_POSITIONS,
      abi: parseAbi(['function factory() view returns (address)']),
      functionName: 'factory'
    })) as Address
    const owner = (await rig.client.readContract({
      address: factory,
      abi: parseAbi(['function owner() view returns (address)']),
      functionName: 'owner'
    })) as Address

    const target = {
      address: factory,
      abi: parseAbi(['function setOwner(address _owner)']) as Abi,
      functionName: 'setOwner'
    }
    const probe = await probeGating(rig.client, target, [item([owner])], STRANGER, owner)

    expect(probe.callableByStranger).toBe(false)
    expect(probe.kind).toBe('authority-gated')
    expect(probe.authority?.toLowerCase()).toBe(owner.toLowerCase())
    /* si diferenta e chiar dovada: proprietarului ii merge acelasi apel */
    expect(probe.reason).toMatch(new RegExp(owner.slice(0, 10), 'i'))
  }, 120_000)

  it('si spune DA pe un contract chiar deschis, altfel nu detecteaza, doar refuza', async (t) => {
    if (!up) return t.skip()
    const target = {
      address: MULTICALL3,
      abi: parseAbi(['function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[])']) as Abi,
      functionName: 'aggregate3'
    }
    const probe = await probeGating(rig.client, target, [item([[]])], STRANGER, null)
    expect(probe.callableByStranger).toBe(true)
  }, 120_000)

  it('lucreaza cap-coada pe gazul adevarat al lantului', async (t) => {
    if (!up) return t.skip()
    await send(rig, clock, clockAbi, 'fund', [], { key: ANVIL_KEY_3, value: parseEther('0.5') })
    ctx.cfg.execution.dryRun = false

    const before = await rig.client.getBalance({ address: FRESH })
    const o = await runOnce(ctx)
    const after = await rig.client.getBalance({ address: FRESH })

    expect(o.done).toBe(1)
    expect(after > before).toBe(true)
    /* gazul e cel real al lantului, nu unul inventat de un nod gol */
    expect(o.gasWei > 0n).toBe(true)
    /* si castigul chiar acopera gazul pe lantul asta: cifra care spune daca
       meseria are sens economic acolo, nu doar tehnic */
    expect(o.rewardWei > o.gasWei).toBe(true)
    /* banii chiar au RAMAS in portofel, nu doar au plecat din contract */
    expect(after - before).toBe(o.rewardWei - o.gasWei)
  }, 180_000)

  it('prinde portofelul delegat 7702, in care castigurile nu raman', async (t) => {
    if (!up) return t.skip()
    /* cheia de proba a nodului: pe 4663 adresa ei ARE cod, si asta schimba
       tot, fiindca plata catre ea reuseste fara sa ramana acolo */
    const delegatedCfg = './data/test/fork-delegated.json'
    writeTestConfig(delegatedCfg, 'ringer', rig, clock, {
      network: { multicall3: MULTICALL3 },
      execution: { privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' }
    })
    const dctx = buildContext(delegatedCfg)
    const checks = await doctor(dctx)
    const w = checks.find((c) => c.name === 'operator is a plain wallet')
    expect(w?.ok).toBe(false)
    expect(w?.detail).toMatch(/EIP-7702/)

    /* iar cheia noastra proaspata trece */
    const good = (await doctor(ctx)).find((c) => c.name === 'operator is a plain wallet')
    expect(good?.ok).toBe(true)
    dctx.ledger.close()
    cleanup([delegatedCfg])
  }, 180_000)

  it('diagnosticul trece pe starea de productie', async (t) => {
    if (!up) return t.skip()
    await send(rig, clock, clockAbi, 'fund', [], { key: ANVIL_KEY_3, value: parseEther('0.5') })
    await send(rig, clock, clockAbi, 'setNextAt', [0n])
    const checks = await doctor(ctx)
    const failed = checks.filter((c) => !c.ok && c.fatal)
    expect(failed.map((f) => `${f.name}: ${f.detail}`)).toEqual([])
    /* si a masurat economia, nu doar ca a mers apelul */
    expect(checks.find((c) => c.name === 'economics')?.detail).toMatch(/reward/)
  }, 180_000)

  it('fara adresa reala sta in asteptare, nu intra in bucla de caderi', async (t) => {
    if (!up) return t.skip()
    const waitCfg = './data/test/fork-standby.json'
    writeTestConfig(waitCfg, 'ringer', rig, '0x0000000000000000000000000000000000000000', {
      network: { multicall3: MULTICALL3 }
    })
    const wctx = buildContext(waitCfg)
    const reason = await standbyReason(wctx.client, wctx.cfg, wctx.job, wctx.jobCfg)
    expect(reason).toMatch(/waiting for the real contract addresses/)
    /* si diagnosticul spune acelasi lucru, nu o eroare de retea */
    const checks = await doctor(wctx)
    expect(checks.find((c) => c.name === 'contracts')?.detail).toMatch(/stand by/)
    wctx.ledger.close()
    cleanup([waitCfg])
  }, 120_000)
})
