/**
 * Franele, probate pe lant, nu doar in teste unitare.
 *
 * O frana care merge doar in test unitar e o frana care nu exista: acolo o
 * chemi tu direct, aici trebuie sa se aprinda singura, in mijlocul unei rulari
 * complete, si sa opreasca o tranzactie care altfel ar fi plecat.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { parseEther } from 'viem'
import { cleanup, deployAll, fundDrops, startAnvil, writeTestConfig, type Anvil, type Deployed } from './harness.js'
import { buildContext, type Ctx } from '../../src/context.js'
import { runOnce } from '../../src/runner.js'

const PORT = 8557
const CFG = './data/test/brakes.json'
const STOP = './data/test/BRAKE-STOP'
const BROKERS = 6
const ETH_EACH = parseEther('0.02')

let anvil: Anvil
let d: Deployed

beforeAll(async () => {
  anvil = await startAnvil(PORT)
  d = await deployAll(anvil, { brokerCount: BROKERS, feeBps: 1000 })
}, 120_000)

afterAll(() => {
  anvil?.stop()
  cleanup(['./data/test'])
})

async function freshCtx(over: Record<string, unknown>): Promise<Ctx> {
  await fundDrops(
    d,
    Array.from({ length: BROKERS }, (_, i) => BigInt(i + 1)),
    ETH_EACH,
    0n
  )
  writeTestConfig(CFG, d, anvil, over)
  return buildContext(CFG)
}

describe('franele', () => {
  it('modul profit refuza lotul cand bacsisul nu acopera gazul inmultit cu marja', async () => {
    const ctx = await freshCtx({
      execution: { dryRun: false },
      policy: { mode: 'profit', profitMultiple: 1000, cooldownSec: 0 }
    })
    const o = await runOnce(ctx)
    expect(o.candidates).toBe(BROKERS)
    expect(o.simulatedOk).toBe(BROKERS) // se putea livra
    expect(o.delivered).toBe(0) // dar nu merita
    expect(o.gasWei).toBe(0n)
    ctx.ledger.close()
  }, 60_000)

  it('modul campanie livreaza acelasi lot, in pierdere, pentru ca asta e scopul', async () => {
    const ctx = await freshCtx({
      execution: { dryRun: false },
      policy: { mode: 'campaign', profitMultiple: 1000, cooldownSec: 0 }
    })
    const o = await runOnce(ctx)
    expect(o.delivered).toBe(BROKERS)
    expect(o.gasWei).toBeGreaterThan(0n)
    ctx.ledger.close()
  }, 60_000)

  it('bugetul zilnic de gaz opreste rularea si spune de ce', async () => {
    const ctx = await freshCtx({
      execution: { dryRun: false },
      policy: { mode: 'campaign', cooldownSec: 0, dailyGasBudgetWei: '1' }
    })
    const o = await runOnce(ctx)
    expect(o.delivered).toBe(0)
    expect(o.stoppedBy).toMatch(/buget zilnic/)
    ctx.ledger.close()
  }, 60_000)

  it('plafonul de pret al gazului opreste rularea inainte de orice simulare de lot', async () => {
    const ctx = await freshCtx({
      execution: { dryRun: false },
      policy: { mode: 'campaign', cooldownSec: 0, maxGasPriceWei: '1' }
    })
    const o = await runOnce(ctx)
    expect(o.delivered).toBe(0)
    expect(o.stoppedBy).toMatch(/gaz prea scump/)
    ctx.ledger.close()
  }, 60_000)

  it('fisierul de oprire opreste totul, chiar daca restul e in regula', async () => {
    mkdirSync('./data/test', { recursive: true })
    writeFileSync(STOP, 'stop')
    const ctx = await freshCtx({
      execution: { dryRun: false, killSwitchFile: STOP },
      policy: { mode: 'campaign', cooldownSec: 0 }
    })
    const before = await d.client.getBalance({ address: d.operator })
    const o = await runOnce(ctx)
    const after = await d.client.getBalance({ address: d.operator })
    expect(o.delivered).toBe(0)
    expect(o.stoppedBy).toMatch(/comutator/)
    expect(after).toBe(before)
    rmSync(STOP, { force: true })
    ctx.ledger.close()
  }, 60_000)

  it('pauza dintre livrari tine, chiar daca a aparut ceva nou de livrat', async () => {
    const ctx = await freshCtx({ execution: { dryRun: false }, policy: { mode: 'campaign', cooldownSec: 0 } })
    const first = await runOnce(ctx)
    expect(first.delivered).toBe(BROKERS)

    // punem din nou bani si repornim cu pauza mare, pe acelasi registru
    await fundDrops(
      d,
      Array.from({ length: BROKERS }, (_, i) => BigInt(i + 1)),
      ETH_EACH,
      0n
    )
    ctx.cfg.policy.cooldownSec = 86400
    const second = await runOnce(ctx)
    expect(second.withSomething).toBe(BROKERS) // exista marfa
    expect(second.candidates).toBe(0) // dar nu se atinge de ea
    expect(second.delivered).toBe(0)
    ctx.ledger.close()
  }, 90_000)

  it('fara cheie privata se poate scana si simula, dar nu se poate livra', async () => {
    const ctx = await freshCtx({
      execution: { dryRun: false, privateKey: null },
      policy: { mode: 'campaign', cooldownSec: 0 }
    })
    const o = await runOnce(ctx)
    expect(o.simulatedOk).toBeGreaterThan(0)
    expect(o.delivered).toBe(0)
    expect(o.stoppedBy).toMatch(/cheia privata/)
    ctx.ledger.close()
  }, 60_000)
})

describe('fara contract de lot', () => {
  it('modul profit refuza sa livreze orbeste, si spune ce ai de facut', async () => {
    const ctx = await freshCtx({
      execution: { dryRun: false, batchContract: null },
      policy: { mode: 'profit', cooldownSec: 0 }
    })
    const o = await runOnce(ctx)
    expect(o.delivered).toBe(0)
    expect(o.stoppedBy).toMatch(/bacsis masurat/)
    expect(o.stoppedBy).toMatch(/CourierBatch/)
    ctx.ledger.close()
  }, 60_000)

  it('o tranzactie duce exact o livrare, ca registrul sa nu minta', async () => {
    const ctx = await freshCtx({
      execution: { dryRun: false, batchContract: null },
      policy: { mode: 'campaign', cooldownSec: 0, batchSize: 10 }
    })
    const o = await runOnce(ctx)
    expect(o.delivered).toBe(BROKERS)
    // cate livrari, atatea tranzactii: nicio livrare inregistrata fara acoperire
    const rows = ctx.ledger.recentDeliveries(100)
    expect(new Set(rows.map((r) => r.txHash)).size).toBe(BROKERS)
    ctx.ledger.close()
  }, 90_000)
})
