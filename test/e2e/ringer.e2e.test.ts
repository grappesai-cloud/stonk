/**
 * RINGER, cap-coada, pe lant.
 *
 * Ce trebuie dovedit, in ordinea in care conteaza:
 *  1. vede oala si stie cat ia din ea, citit de pe lant, nu presupus
 *  2. nu apasa cand nu e copt, si spune de ce
 *  3. cand apasa, banii ajung in portofel si registrul stie cati
 *  4. cand butonul e rezervat proprietarului, diagnosticul DOVEDESTE asta,
 *     simuland acelasi apel din doua conturi diferite
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { formatEther, parseEther, type Address } from 'viem'
import {
  artifact,
  cleanup,
  deploy,
  rigOf,
  send,
  startAnvil,
  writeTestConfig,
  increaseTime,
  mine,
  type Anvil,
  type Rig
} from './harness.js'
import { buildContext, type Ctx } from '../../src/core/context.js'
import { runOnce } from '../../src/core/runner.js'
import { doctor } from '../../src/core/doctor.js'

const PORT = 8631
const CFG = './data/test/ringer.json'
const PERIOD = 60
const TIP_BPS = 500 // 5%

let anvil: Anvil
let rig: Rig
let clock: Address
let ctx: Ctx

const clockAbi = artifact('MockClock.sol', 'MockClock').abi

beforeAll(async () => {
  anvil = await startAnvil(PORT)
  rig = await rigOf(anvil)
  clock = await deploy(rig, artifact('MockClock.sol', 'MockClock'), [BigInt(PERIOD), parseEther('0.01'), BigInt(TIP_BPS)])
  writeTestConfig(CFG, 'ringer', rig, clock)
  ctx = buildContext(CFG)
}, 60_000)

afterAll(() => {
  ctx?.ledger.close()
  anvil?.stop()
  cleanup([CFG])
})

describe('ringer', () => {
  it('cu oala goala nu are ce apasa, si nu inventeaza nimic', async () => {
    const items = await ctx.job.discover({ client: rig.client, cfg: ctx.cfg, job: ctx.jobCfg, ledger: ctx.ledger, from: rig.operator })
    expect(items).toEqual([])
  })

  it('vede oala si isi calculeaza bacsisul CITIND de pe lant', async () => {
    await send(rig, clock, clockAbi, 'fund', [], { value: parseEther('1') })
    const items = await ctx.job.discover({ client: rig.client, cfg: ctx.cfg, job: ctx.jobCfg, ledger: ctx.ledger, from: rig.operator })
    expect(items.length).toBe(1)
    const it0 = items[0]!
    expect(it0.stakeWei).toBe(parseEther('1'))
    expect(it0.rewardWei).toBe((parseEther('1') * BigInt(TIP_BPS)) / 10_000n)
    /* si, mai important decat cifra: stie ca a MASURAT-o */
    expect(it0.rewardMeasured).toBe(true)
  })

  it('rularea uscata calculeaza tot si nu trimite nimic', async () => {
    const before = await rig.client.getBalance({ address: rig.operator })
    const o = await runOnce(ctx)
    const after = await rig.client.getBalance({ address: rig.operator })
    expect(o.candidates).toBe(1)
    expect(o.simulatedOk).toBe(1)
    expect(o.done).toBe(0)
    expect(after).toBe(before)
  })

  it('apasa pe bune si bacsisul ajunge la operator', async () => {
    ctx.cfg.execution.dryRun = false
    const before = await rig.client.getBalance({ address: rig.operator })
    const potBefore = (await rig.client.readContract({ address: clock, abi: clockAbi, functionName: 'pot' })) as bigint
    const expectedTip = (potBefore * BigInt(TIP_BPS)) / 10_000n

    const o = await runOnce(ctx)
    expect(o.done).toBe(1)

    const after = await rig.client.getBalance({ address: rig.operator })
    /* soldul creste cu bacsisul minus gazul; gazul e mic, bacsisul e 5% dintr-un ETH */
    expect(after > before).toBe(true)
    expect(o.rewardWei).toBe(expectedTip)
    expect(o.gasWei > 0n).toBe(true)

    const presses = (await rig.client.readContract({ address: clock, abi: clockAbi, functionName: 'presses' })) as bigint
    expect(presses).toBe(1n)
  })

  it('registrul stie ce s-a castigat si ce s-a ars, pe randuri', () => {
    const t = ctx.ledger.totals()
    expect(t.done).toBe(1)
    expect(t.rewardWei > 0n).toBe(true)
    expect(t.gasWei > 0n).toBe(true)
    expect(t.netWei).toBe(t.rewardWei - t.gasWei)
  })

  it('imediat dupa apasare nu mai e nimic de facut, si asta nu e o eroare', async () => {
    const o = await runOnce(ctx)
    expect(o.seen).toBe(0)
    expect(o.done).toBe(0)
  })

  it('cand se coace din nou, apasa din nou', async () => {
    await send(rig, clock, clockAbi, 'fund', [], { value: parseEther('0.5') })
    await increaseTime(rig.url, PERIOD + 5)
    await mine(rig.url)
    const o = await runOnce(ctx)
    expect(o.done).toBe(1)
  })

  it('cand butonul e rezervat proprietarului, o DOVEDESTE, nu o ghiceste', async () => {
    await send(rig, clock, clockAbi, 'setRestricted', [true])
    await send(rig, clock, clockAbi, 'fund', [], { value: parseEther('1') })
    await increaseTime(rig.url, PERIOD + 5)
    await mine(rig.url)

    /* contextul curent are cheia proprietarului (operatorul chiar E owner),
       deci pentru proba folosim o configurare fara cheie: asa simularea pleaca
       dintr-un cont strain, exact ca in productie */
    const strangerCfg = './data/test/ringer-stranger.json'
    writeTestConfig(strangerCfg, 'ringer', rig, clock, { execution: { privateKey: null } })
    const sctx = buildContext(strangerCfg)
    const o = await runOnce(sctx)
    expect(o.simulatedOk).toBe(0)
    expect(o.gatingWarning).toMatch(/authority-gated/)

    const checks = await doctor(sctx)
    const q = checks.find((c) => c.name.includes('callable by a stranger'))
    expect(q?.ok).toBe(false)
    expect(q?.fatal).toBe(true)
    expect(q?.detail).toMatch(/only 0x/)
    sctx.ledger.close()
    cleanup([strangerCfg])
  })
})
