/**
 * CURSA. Testul care conteaza cel mai mult pentru Ringer, si singurul care
 * spune ceva despre bani, nu despre cod.
 *
 * Ce NU dovedeste testul asta: ca in productie ajungem primii. Aia depinde de
 * cine mai e pe lantul ala si cat e dispus sa plateasca, si nu se poate afla
 * dintr-un test.
 *
 * Ce dovedeste: ca mecanica e adevarata si ca socoteala e cinstita. Doi boti
 * trimit acelasi apel in acelasi bloc, nodul ii ordoneaza dupa bacsisul de
 * gaz, si:
 *  - cand platim mai mult, luam noi banii
 *  - cand plateste rivalul mai mult, PIERDEM, si pierderea se scrie in caiet
 *    cu numele lui si cu cat a platit
 *
 * Partea a doua e mai importanta decat prima. Un bot care castiga se vede
 * singur; unul care pierde tacut arata exact ca unul care nu are ce lucra.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseEther, type Address } from 'viem'
import {
  ANVIL_KEY_2,
  ANVIL_KEY_3,
  artifact,
  cleanup,
  deploy,
  mine,
  rigOf,
  send,
  sleep,
  setAutomine,
  startAnvil,
  waitForPending,
  writeTestConfig,
  type Anvil,
  type Rig
} from './harness.js'
import { buildContext, type Ctx } from '../../src/core/context.js'
import { runOnce } from '../../src/core/runner.js'
import { RaceBook } from '../../src/core/race.js'

const PORT = 8632
const CFG = './data/test/race.json'
const TIP_BPS = 500

let anvil: Anvil
let rig: Rig
let clock: Address
let ctx: Ctx
let book: RaceBook

const clockAbi = artifact('MockClock.sol', 'MockClock').abi
const GWEI = 1_000_000_000n

/** o cursa: rivalul trimite, noi rulam, amandoi ajung in acelasi bloc */
async function race(rivalPriority: bigint): Promise<Awaited<ReturnType<typeof runOnce>>> {
  /* oala o umple un al treilea cont, nu operatorul: altfel soldul lui ar
     scadea cu ce a bagat in oala si nu s-ar mai vedea daca a castigat ceva */
  await send(rig, clock, clockAbi, 'fund', [], { key: ANVIL_KEY_3, value: parseEther('1'), wait: false })
  await mine(rig.url)

  /* rivalul isi pune tranzactia in mempool si asteapta acolo */
  await send(rig, clock, clockAbi, 'clockIn', [], {
    key: ANVIL_KEY_2,
    maxPriorityFeePerGas: rivalPriority,
    wait: false
  })

  /* noi pornim rularea; ea va simula, va semna si va astepta chitanta */
  const running = runOnce(ctx, { race: book })

  /* cand amandoua tranzactiile sunt in mempool, minam UN bloc: de aici incolo
     ordinea o decide nodul, dupa bacsisul de gaz, exact ca in realitate */
  await waitForPending(rig.url, 2)
  await sleep(100)
  await mine(rig.url)
  return running
}

beforeAll(async () => {
  /* pornim cu minerit normal ca sa putem desfasura contractul, si abia apoi
     il oprim: de aici incolo blocurile le facem noi, cand vrem sa se
     intalneasca cele doua tranzactii */
  anvil = await startAnvil(PORT, { order: 'fees' })
  rig = await rigOf(anvil)
  clock = await deploy(rig, artifact('MockClock.sol', 'MockClock'), [0n, parseEther('0.01'), BigInt(TIP_BPS)])
  await setAutomine(rig.url, false)
  writeTestConfig(CFG, 'ringer', rig, clock, {
    execution: { dryRun: false },
    job: { race: { priorityBumpBps: 0, maxPriorityFeeWei: (10n * GWEI).toString() } }
  })
  ctx = buildContext(CFG)
  book = new RaceBook(ctx.cfg, ctx.ledger, ctx.job, ctx.jobCfg)
}, 60_000)

afterAll(() => {
  ctx?.ledger.close()
  anvil?.stop()
  cleanup([CFG])
})

describe('cursa, doi boti in acelasi bloc', () => {
  it('cand platim mai mult, apasam noi si banii sunt ai nostri', async () => {
    /* noi: 10 gwei bacsis (plafonul din configurare). Rivalul: 1 gwei. */
    ctx.cfg.execution.maxPriorityFeePerGasWei = 10n * GWEI
    const before = await rig.client.getBalance({ address: rig.operator })
    const o = await race(1n * GWEI)

    expect(o.done).toBe(1)
    const after = await rig.client.getBalance({ address: rig.operator })
    expect(after > before).toBe(true)

    const races = ctx.ledger.raceStats()
    expect(races.total).toBe(1)
    expect(races.won).toBe(1)
    expect(races.winRate).toBe(1)
  }, 60_000)

  it('cand plateste rivalul mai mult, PIERDEM, si caietul o spune pe nume', async () => {
    /* noi ramanem la 1 gwei, rivalul urca la 50. Nu simulam infrangerea:
       chiar pierdem cursa, pe acelasi drum de cod cu care am castigat-o. */
    ctx.cfg.execution.maxPriorityFeePerGasWei = 1n * GWEI
    const o = await race(50n * GWEI)

    /* tranzactia noastra a plecat si a picat, fiindca oala era deja goala */
    expect(o.done).toBe(0)

    const races = ctx.ledger.raceStats()
    expect(races.total).toBe(2)
    expect(races.won).toBe(1)
    expect(races.lost).toBe(1)

    const last = ctx.ledger.recentRaces(1)[0]!
    expect(last.winner.toLowerCase()).toBe(rig.rival.toLowerCase())
    expect(last.wanted).toBe(true)
    expect(last.sent).toBe(true)
    expect(last.note).toBe('we sent and still lost')
    /* si cat a platit ca sa ne bata: cifra din care se decide daca merita urcat */
    expect(last.winnerGasPriceWei > last.ourGasPriceWei).toBe(true)
  }, 60_000)

  it('caietul stie deja cu cine ne batem si cat plateste', () => {
    const s = ctx.ledger.raceStats()
    expect(s.competitors).toBe(1)
    expect(s.medianWinnerGasPriceWei > 0n).toBe(true)
    /* si cat ne ia noua drumul de la vedere pana la semnatura */
    expect(s.medianLatencyMs !== null).toBe(true)
  })

  it('in veghe, fara cheie, cursa se masoara fara sa se cheltuie nimic', async () => {
    const watchCfg = './data/test/race-watch.json'
    writeTestConfig(watchCfg, 'ringer', rig, clock, {
      watchtower: true,
      execution: { privateKey: null, dryRun: true },
      storage: { file: ':memory:' }
    })
    const wctx = buildContext(watchCfg)
    const wbook = new RaceBook(wctx.cfg, wctx.ledger, wctx.job, wctx.jobCfg)

    await send(rig, clock, clockAbi, 'fund', [], { key: ANVIL_KEY_3, value: parseEther('1'), wait: false })
    await mine(rig.url)
    await send(rig, clock, clockAbi, 'clockIn', [], { key: ANVIL_KEY_2, maxPriorityFeePerGas: 2n * GWEI, wait: false })
    await mine(rig.url)

    const o = await runOnce(wctx, { race: wbook })
    expect(o.done).toBe(0)
    const s = wctx.ledger.raceStats()
    expect(s.total).toBe(1)
    expect(s.won).toBe(0)
    /* cel mai important rand din tot testul: stim ca s-a apasat, stim de catre
       cine, si nu am cheltuit nimic ca sa aflam */
    expect(wctx.ledger.recentRaces(1)[0]!.winner.toLowerCase()).toBe(rig.rival.toLowerCase())
    wctx.ledger.close()
    cleanup([watchCfg])
  }, 60_000)
})
