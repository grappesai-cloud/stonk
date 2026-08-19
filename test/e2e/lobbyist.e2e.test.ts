/**
 * LOBBYIST, cap-coada, pe lant.
 *
 * Testul care justifica agentul e al doilea: intre un gauge care plateste mult
 * si e deja aglomerat si unul care plateste mai putin si e gol, alegerea buna
 * e al doilea. Un om care se uita la cifra mare alege gresit; agentul asta
 * exista tocmai ca sa imparta mita la voturile deja puse.
 *
 * Si o granita care se probeaza aici: **agentul nu blocheaza niciodata
 * jetoane**. Lucreaza cu o pozitie care exista deja. Daca nu exista, sta.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseEther, type Address } from 'viem'
import {
  ANVIL_KEY_2,
  artifact,
  cleanup,
  deploy,
  fundEth,
  increaseTime,
  mine,
  rigOf,
  send,
  startAnvil,
  writeTestConfig,
  type Anvil,
  type Rig
} from './harness.js'
import { buildContext, type Ctx } from '../../src/core/context.js'
import { runOnce } from '../../src/core/runner.js'
import { doctor } from '../../src/core/doctor.js'

const PORT = 8637
const CFG = './data/test/lobbyist.json'
const EPOCH = 7 * 24 * 3600
const WINDOW = 3600
const POWER = parseEther('100')

/* doua gauge-uri, alese ca sa se bata cap in cap:
   RICH plateste mult dar e aglomerat, THIN plateste mai putin si e gol */
const RICH = '0x00000000000000000000000000000000000000R1'.replace('R1', 'a1') as Address
const THIN = '0x00000000000000000000000000000000000000T1'.replace('T1', 'b2') as Address

let anvil: Anvil
let rig: Rig
let gauges: Address
let ctx: Ctx

const gaugesAbi = artifact('MockGauges.sol', 'MockGauges').abi

beforeAll(async () => {
  anvil = await startAnvil(PORT)
  rig = await rigOf(anvil)
  gauges = await deploy(rig, artifact('MockGauges.sol', 'MockGauges'), [BigInt(EPOCH), BigInt(WINDOW)])
  await fundEth(rig, gauges, parseEther('10'))
  await send(rig, gauges, gaugesAbi, 'mintLock', [rig.operator, POWER])
  await send(rig, gauges, gaugesAbi, 'addGauge', [RICH, parseEther('1'), parseEther('1000')])
  await send(rig, gauges, gaugesAbi, 'addGauge', [THIN, parseEther('0.6'), parseEther('10')])
  writeTestConfig(CFG, 'lobbyist', rig, gauges, { epoch: { voteBeforeSec: WINDOW } })
  ctx = buildContext(CFG)
}, 60_000)

afterAll(() => {
  ctx?.ledger.close()
  anvil?.stop()
  cleanup([CFG])
})

describe('lobbyist', () => {
  it('in afara ferestrei nu are ce vota, si asta nu e o eroare', async () => {
    const items = await ctx.job.discover({ client: rig.client, cfg: ctx.cfg, job: ctx.jobCfg, ledger: ctx.ledger, from: rig.operator })
    expect(items).toEqual([])
  })

  it('ALEGE gauge-ul care plateste cel mai bine PE VOT, nu pe cel cu mita mai mare', async () => {
    /* intram in fereastra de vot */
    await increaseTime(rig.url, EPOCH - WINDOW + 60)
    await mine(rig.url)

    const items = await ctx.job.discover({ client: rig.client, cfg: ctx.cfg, job: ctx.jobCfg, ledger: ctx.ledger, from: rig.operator })
    expect(items.length).toBe(1)
    const vote = items[0]!
    expect(vote.key.startsWith('vote:')).toBe(true)
    /* THIN plateste 0.6 dar e gol, RICH plateste 1 si are 1000 de voturi.
       Cu 100 putere: din THIN luam 0.6*100/110 = 0.545, din RICH 1*100/1100 = 0.09 */
    expect(vote.label).toContain(THIN.slice(0, 8))
    expect(vote.meta.gauges).toContain(THIN)
    expect(vote.rewardWei).toBe((parseEther('0.6') * POWER) / (parseEther('10') + POWER))
    expect(vote.rewardMeasured).toBe(true)
    /* si spune limpede ca e o estimare pentru finalul epocii */
    expect(vote.meta.note).toMatch(/estimate/)
  })

  it('voteaza pe bune, si votul se vede pe lant', async () => {
    ctx.cfg.execution.dryRun = false
    const before = (await rig.client.readContract({ address: gauges, abi: gaugesAbi, functionName: 'votesOf', args: [THIN] })) as bigint
    const o = await runOnce(ctx)
    const after = (await rig.client.readContract({ address: gauges, abi: gaugesAbi, functionName: 'votesOf', args: [THIN] })) as bigint

    expect(o.done).toBe(1)
    expect(after - before).toBe(POWER)
    /* votul nu costa nimic in afara de gaz: nu dam bani, dam greutate */
    expect(o.costWei).toBe(0n)
  })

  it('nu voteaza de doua ori in aceeasi epoca', async () => {
    const o = await runOnce(ctx)
    expect(o.done).toBe(0)
  })

  it('dupa ce se inchide epoca, isi incaseaza partea', async () => {
    await send(rig, gauges, gaugesAbi, 'rollEpoch')
    const claimable = (await rig.client.readContract({ address: gauges, abi: gaugesAbi, functionName: 'claimable', args: [1n] })) as bigint
    expect(claimable > 0n).toBe(true)

    const before = await rig.client.getBalance({ address: rig.operator })
    const o = await runOnce(ctx)
    const after = await rig.client.getBalance({ address: rig.operator })

    expect(o.done).toBe(1)
    expect(o.rewardWei).toBe(claimable)
    /* banii chiar au ajuns: incasare minus gaz */
    expect(after - before).toBe(claimable - o.gasWei)
  })

  it('ce a incasat chiar era cat estimase, la wei', () => {
    const events = ctx.ledger.recentEvents(20).filter((e) => e.kind === 'work')
    const claim = events.find((e) => e.label === 'CLAIM')!
    /* estimarea de la vot: 0.6 * 100/110 */
    expect(claim.rewardWei).toBe((parseEther('0.6') * POWER) / (parseEther('10') + POWER))
  })

  it('un strain NU poate vota cu pozitia noastra, si asta e cum trebuie', async () => {
    await increaseTime(rig.url, EPOCH - WINDOW + 60)
    await mine(rig.url)
    const checks = await doctor(ctx)

    const mine_ = checks.find((c) => c.name.includes('callable by us'))
    expect(mine_?.ok).toBe(true)
    const stranger = checks.find((c) => c.name.includes('stranger cannot vote'))
    expect(stranger?.ok).toBe(true)
    /* si nicaieri nu se da alarma falsa ca agentul nu poate exista */
    expect(checks.some((c) => c.fatal && !c.ok)).toBe(false)
  })

  it('spune singur ca nu blocheaza si nu prelungeste blocari', async () => {
    const checks = await doctor(ctx)
    const rule = checks.find((c) => c.name === 'never locks')
    expect(rule?.detail).toMatch(/never locks or extends a lock/)
  })

  it('fara pozitie nu inventeaza una: sta si spune de ce', async () => {
    const emptyCfg = './data/test/lobbyist-empty.json'
    writeTestConfig(emptyCfg, 'lobbyist', rig, gauges, {
      execution: { privateKey: ANVIL_KEY_2 },
      job: { position: { tokenId: '99' } }
    })
    const ectx = buildContext(emptyCfg)
    const items = await ectx.job.discover({ client: rig.client, cfg: ectx.cfg, job: ectx.jobCfg, ledger: ectx.ledger, from: rig.rival })
    expect(items).toEqual([])
    const checks = await doctor(ectx)
    const power = checks.find((c) => c.name === 'voting power')
    expect(power?.ok).toBe(false)
    expect(power?.detail).toMatch(/will not create a lock/)
    ectx.ledger.close()
    cleanup([emptyCfg])
  })
})
