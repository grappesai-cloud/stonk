/**
 * Franele, probate pe lant, nu doar in teste unitare.
 *
 * O frana care merge doar in test unitar e o frana care nu exista: acolo o
 * chemi tu direct, aici trebuie sa se aprinda singura, in mijlocul unei rulari
 * complete, si sa opreasca o tranzactie care altfel ar fi plecat. Toate
 * testele de aici pornesc de la o stare in care botul CHIAR ar apasa.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { parseEther, type Address } from 'viem'
import {
  ANVIL_KEY_3,
  artifact,
  cleanup,
  deploy,
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

const PORT = 8634
const CFG = './data/test/brakes.json'
const STOP = './data/test/BRAKE-STOP'

let anvil: Anvil
let rig: Rig
let clock: Address

const clockAbi = artifact('MockClock.sol', 'MockClock').abi

/** un context proaspat, cu oala plina si butonul copt */
async function ready(over: Record<string, unknown> = {}): Promise<Ctx> {
  const pot = (await rig.client.readContract({ address: clock, abi: clockAbi, functionName: 'pot' })) as bigint
  if (pot === 0n) {
    await send(rig, clock, clockAbi, 'fund', [], { key: ANVIL_KEY_3, value: parseEther('1') })
    await increaseTime(rig.url, 120)
    await mine(rig.url)
  }
  const file = './data/test/brakes-run.json'
  writeTestConfig(file, 'ringer', rig, clock, {
    execution: { dryRun: false, killSwitchFile: STOP },
    ...over
  })
  return buildContext(file)
}

beforeAll(async () => {
  anvil = await startAnvil(PORT)
  rig = await rigOf(anvil)
  clock = await deploy(rig, artifact('MockClock.sol', 'MockClock'), [60n, parseEther('0.001'), 500n])
  mkdirSync('./data/test', { recursive: true })
}, 60_000)

beforeEach(() => {
  rmSync(STOP, { force: true })
})

afterAll(() => {
  anvil?.stop()
  cleanup([CFG, STOP, './data/test/brakes-run.json'])
})

describe('franele', () => {
  it('comutatorul de oprire opreste inainte de orice calcul', async () => {
    const ctx = await ready()
    writeFileSync(STOP, 'stop\n')
    const o = await runOnce(ctx)
    expect(o.candidates).toBe(1)
    expect(o.done).toBe(0)
    expect(o.stoppedBy).toMatch(/kill switch/)
    ctx.ledger.close()
  })

  it('veghea nu semneaza nimic, chiar daca exista cheie si oala e plina', async () => {
    const ctx = await ready({ watchtower: true })
    expect(ctx.account).not.toBeNull()
    const o = await runOnce(ctx)
    expect(o.done).toBe(0)
    expect(o.stoppedBy).toMatch(/watchtower/)
    ctx.ledger.close()
  })

  it('castigul nemasurat NU trece in modul profit, si spune exact de ce', async () => {
    const ctx = await ready({
      job: { reward: { mode: 'const', wei: parseEther('99').toString() } }
    })
    const o = await runOnce(ctx)
    expect(o.done).toBe(0)
    expect(o.stoppedBy).toMatch(/reward that can be read up front/)
    /* si motivul ramane in registru, nu doar in log */
    const reasons = ctx.ledger.skipReasons()
    expect(reasons.some((r) => /read up front/.test(r.reason))).toBe(true)
    ctx.ledger.close()
  })

  it('pretul gazului peste plafon opreste lotul', async () => {
    const ctx = await ready({ policy: { maxGasPriceWei: '1' } })
    const o = await runOnce(ctx)
    expect(o.done).toBe(0)
    expect(o.stoppedBy).toMatch(/gas too expensive/)
    ctx.ledger.close()
  })

  it('bugetul zilnic epuizat opreste lotul', async () => {
    const ctx = await ready({ policy: { dailyGasBudgetWei: '1' } })
    const o = await runOnce(ctx)
    expect(o.done).toBe(0)
    expect(o.stoppedBy).toMatch(/daily budget/)
    ctx.ledger.close()
  })

  it('marja de rentabilitate refuza o treaba care nu isi plateste gazul', async () => {
    const ctx = await ready({ policy: { profitMultiple: 1_000_000 } })
    const o = await runOnce(ctx)
    expect(o.done).toBe(0)
    const reasons = ctx.ledger.skipReasons()
    expect(reasons.some((r) => /below/.test(r.reason))).toBe(true)
    ctx.ledger.close()
  })

  it('dupa ce toate franele sunt ridicate, chiar apasa', async () => {
    const ctx = await ready()
    const o = await runOnce(ctx)
    expect(o.done).toBe(1)
    expect(existsSync(STOP)).toBe(false)
    ctx.ledger.close()
  })
})
