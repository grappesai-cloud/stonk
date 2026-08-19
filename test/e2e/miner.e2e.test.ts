/**
 * MINER, cap-coada, pe lant.
 *
 * Intrebarea care decide agentul asta nu e "merge codul" ci "poate un strain
 * sa inchida runda?". Contractul de proba contine dinadins amandoua lumile:
 * `settle(id)` e libera, iar `fulfillRandomWords(id, words)` e a oracolului si
 * cere date pe care nu le putem produce. Testul cere ca unealta sa le
 * deosebeasca, si sa DOVEDEASCA diferenta, nu sa o citeasca din textul unei
 * erori.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseEther, type Address } from 'viem'
import {
  ANVIL_KEY_3,
  artifact,
  cleanup,
  deploy,
  fundEth,
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

const PORT = 8633
const CFG = './data/test/miner.json'
const BOUNTY = parseEther('0.02')
const POT = parseEther('0.4')

let anvil: Anvil
let rig: Rig
let rounds: Address
let ctx: Ctx

const roundsAbi = artifact('MockRounds.sol', 'MockRounds').abi

beforeAll(async () => {
  anvil = await startAnvil(PORT)
  rig = await rigOf(anvil)
  rounds = await deploy(rig, artifact('MockRounds.sol', 'MockRounds'), [rig.oracle])
  /* contractul trebuie sa aiba din ce plati rasplata */
  await fundEth(rig, rounds, parseEther('5'))
  /* trei runde deschise, doua cu randomness sosit */
  for (let i = 0; i < 3; i++) await send(rig, rounds, roundsAbi, 'open', [BOUNTY, POT])
  await send(rig, rounds, roundsAbi, 'deliverRandomness', [1n, 42n], { key: ANVIL_KEY_3 })
  await send(rig, rounds, roundsAbi, 'deliverRandomness', [2n, 43n], { key: ANVIL_KEY_3 })
  writeTestConfig(CFG, 'miner', rig, rounds)
  ctx = buildContext(CFG)
}, 60_000)

afterAll(() => {
  ctx?.ledger.close()
  anvil?.stop()
  cleanup([CFG])
})

describe('miner', () => {
  it('vede doar rundele gata de inchis, nu si pe cele care inca asteapta', async () => {
    const items = await ctx.job.discover({ client: rig.client, cfg: ctx.cfg, job: ctx.jobCfg, ledger: ctx.ledger, from: rig.operator })
    expect(items.map((i) => i.key).sort()).toEqual(['round:1', 'round:2'])
    /* rasplata vine din citirea de stare, deci e masurata, nu presupusa */
    expect(items[0]!.rewardWei).toBe(BOUNTY)
    expect(items[0]!.rewardMeasured).toBe(true)
    expect(items[0]!.stakeWei).toBe(POT)
  })

  it('rularea uscata nu atinge nimic', async () => {
    const o = await runOnce(ctx)
    expect(o.candidates).toBe(2)
    expect(o.simulatedOk).toBe(2)
    expect(o.done).toBe(0)
    const s = (await rig.client.readContract({ address: rounds, abi: roundsAbi, functionName: 'roundOf', args: [1n] })) as unknown[]
    expect(Number(s[0])).toBe(2)
  })

  it('inchide rundele si incaseaza, iar registrul stie cat', async () => {
    ctx.cfg.execution.dryRun = false
    const before = await rig.client.getBalance({ address: rig.operator })
    const o = await runOnce(ctx)
    const after = await rig.client.getBalance({ address: rig.operator })

    expect(o.done).toBe(2)
    expect(o.rewardWei).toBe(BOUNTY * 2n)
    expect(after > before).toBe(true)

    const t = ctx.ledger.totals()
    expect(t.done).toBe(2)
    expect(t.rewardWei).toBe(BOUNTY * 2n)
    /* fiecare rand isi are gazul lui, nu unul singur cu tot */
    expect(t.gasWei > 0n).toBe(true)
  })

  it('o tranzactie duce exact o runda, nu un grup intreg', () => {
    const events = ctx.ledger.recentEvents(10).filter((e) => e.kind === 'work')
    const hashes = new Set(events.map((e) => e.txHash))
    expect(events.length).toBe(2)
    expect(hashes.size).toBe(2)
  })

  it('dupa inchidere nu mai are ce lucra, si asta nu e o eroare', async () => {
    const o = await runOnce(ctx)
    expect(o.seen).toBe(0)
    expect(o.done).toBe(0)
  })

  it('runda care inca asteapta randomness ramane in pace pana soseste', async () => {
    await send(rig, rounds, roundsAbi, 'deliverRandomness', [3n, 44n], { key: ANVIL_KEY_3 })
    const o = await runOnce(ctx)
    expect(o.done).toBe(1)
  })

  it('descoperirea prin cursor da acelasi raspuns ca lista', async () => {
    await send(rig, rounds, roundsAbi, 'open', [BOUNTY, POT])
    await send(rig, rounds, roundsAbi, 'deliverRandomness', [4n, 45n], { key: ANVIL_KEY_3 })
    const rangeCfg = './data/test/miner-range.json'
    writeTestConfig(rangeCfg, 'miner', rig, rounds, {
      job: {
        discovery: { mode: 'range', cursor: { signature: 'function nextRoundId() view returns (uint256)' }, firstId: '1', window: 50 }
      }
    })
    const rctx = buildContext(rangeCfg)
    const items = await rctx.job.discover({ client: rig.client, cfg: rctx.cfg, job: rctx.jobCfg, ledger: rctx.ledger, from: rig.operator })
    expect(items.map((i) => i.key)).toEqual(['round:4'])
    rctx.ledger.close()
    cleanup([rangeCfg])
  })

  it('descoperirea din evenimente da acelasi raspuns, fara sa intrebe contractul', async () => {
    const logCfg = './data/test/miner-logs.json'
    writeTestConfig(logCfg, 'miner', rig, rounds, {
      job: {
        discovery: {
          mode: 'logs',
          openedEvent: 'event RoundOpened(uint256 indexed id, uint256 bounty)',
          closedEvent: 'event Settled(uint256 indexed id, address indexed settler, uint256 bounty)',
          idField: 'id',
          lookbackBlocks: '100000'
        }
      }
    })
    const lctx = buildContext(logCfg)
    const items = await lctx.job.discover({ client: rig.client, cfg: lctx.cfg, job: lctx.jobCfg, ledger: lctx.ledger, from: rig.operator })
    expect(items.map((i) => i.key)).toEqual(['round:4'])
    lctx.ledger.close()
    cleanup([logCfg])
  })

  it('cand treaba e a oracolului, DOVEDESTE ca noi nu putem, si spune si de ce', async () => {
    const vrfCfg = './data/test/miner-vrf.json'
    writeTestConfig(vrfCfg, 'miner', rig, rounds, {
      execution: { privateKey: null },
      job: {
        /* rundele care ASTEAPTA randomness, adica exact cele pe care numai
           oracolul le poate misca */
        state: { readyWhen: { mode: 'equals', field: 'status', value: 1 } },
        action: { signature: 'function fulfillRandomWords(uint256 id, uint256[] words)', args: ['$id', ['77']] },
        authority: { call: { signature: 'function oracle() view returns (address)' } }
      }
    })
    await send(rig, rounds, roundsAbi, 'open', [BOUNTY, POT])
    const vctx = buildContext(vrfCfg)

    const checks = await doctor(vctx)
    const args = checks.find((c) => c.name === 'arguments are ours to produce')
    /* prima jumatate a raspunsului: chiar daca ar avea voie, datele nu sunt ale noastre */
    expect(args?.ok).toBe(false)
    expect(args?.detail).toMatch(/uint256\[\]/)

    /* a doua jumatate, si cea care inchide discutia: proba pe lant */
    const q = checks.find((c) => c.name.includes('callable by a stranger'))
    expect(q?.ok).toBe(false)
    expect(q?.fatal).toBe(true)
    expect(q?.detail.toLowerCase()).toContain(rig.oracle.toLowerCase())

    const o = await runOnce(vctx)
    expect(o.simulatedOk).toBe(0)
    expect(o.gatingWarning).toMatch(/authority-gated/)
    vctx.ledger.close()
    cleanup([vrfCfg])
  })
})
