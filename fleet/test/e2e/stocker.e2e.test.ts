/**
 * STOCKER, cap-coada, pe lant.
 *
 * Aici testele nu mai verifica doar ca agentul face treaba, ci ca **socoteste
 * corect banii care ies**. Un agent care cheltuie gresit nu se opreste la
 * cativa centi de gaz: goleste portofelul facand exact ce i-ai cerut.
 *
 * De aia jumatate din testele de mai jos sunt despre refuz, nu despre lucru:
 * comision sub cost, plafon pe bucata, buget zilnic, aprobare lipsa, pret
 * necunoscut.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { formatEther, parseEther, type Address } from 'viem'
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

const PORT = 8636
const CFG = './data/test/stocker.json'

/* pretul marfii si comisionul, pe unitate */
const PRICE = parseEther('0.001')
const COMMISSION = parseEther('0.0012')
const CAPACITY = 100n

let anvil: Anvil
let rig: Rig
let vendor: Address
let ctx: Ctx

const vendorAbi = artifact('MockVendor.sol', 'MockVendor').abi
const erc20Abi = artifact('MockERC20.sol', 'MockERC20').abi

beforeAll(async () => {
  anvil = await startAnvil(PORT)
  rig = await rigOf(anvil)
  vendor = await deploy(rig, artifact('MockVendor.sol', 'MockVendor'), ['0x0000000000000000000000000000000000000000'])
  await fundEth(rig, vendor, parseEther('5'))
  /* trei masini: una plina, doua golite */
  for (let i = 0; i < 3; i++) await send(rig, vendor, vendorAbi, 'open', [CAPACITY, CAPACITY, PRICE, COMMISSION])
  await send(rig, vendor, vendorAbi, 'sell', [1n, 80n])
  await send(rig, vendor, vendorAbi, 'sell', [2n, 60n])
  writeTestConfig(CFG, 'stocker', rig, vendor, {
    policy: { dailySpendBudgetWei: parseEther('10').toString() }
  })
  ctx = buildContext(CFG)
}, 60_000)

afterAll(() => {
  ctx?.ledger.close()
  anvil?.stop()
  cleanup([CFG])
})

describe('stocker', () => {
  it('vede doar masinile golite si stie exact cate unitati intra', async () => {
    const items = await ctx.job.discover({ client: rig.client, cfg: ctx.cfg, job: ctx.jobCfg, ledger: ctx.ledger, from: rig.operator })
    expect(items.map((i) => i.key).sort()).toEqual(['machine:1', 'machine:2'])
    const m1 = items.find((i) => i.key === 'machine:1')!
    expect(m1.meta.units).toBe('80')
  })

  it('stie cat da si cat ia, si amandoua CITITE de pe lant', async () => {
    const items = await ctx.job.discover({ client: rig.client, cfg: ctx.cfg, job: ctx.jobCfg, ledger: ctx.ledger, from: rig.operator })
    const m1 = items.find((i) => i.key === 'machine:1')!
    expect(m1.costWei).toBe(PRICE * 80n)
    expect(m1.costMeasured).toBe(true)
    expect(m1.rewardWei).toBe(COMMISSION * 80n)
    expect(m1.rewardMeasured).toBe(true)
    /* plata in ETH pleaca odata cu apelul, deci trebuie sa fie si `value` */
    expect(m1.valueWei).toBe(PRICE * 80n)
  })

  it('rularea uscata nu cheltuie nimic', async () => {
    const before = await rig.client.getBalance({ address: rig.operator })
    const o = await runOnce(ctx)
    const after = await rig.client.getBalance({ address: rig.operator })
    expect(o.candidates).toBe(2)
    expect(o.done).toBe(0)
    expect(after).toBe(before)
  })

  it('umple masinile, plateste marfa si incaseaza comisionul', async () => {
    ctx.cfg.execution.dryRun = false
    const before = await rig.client.getBalance({ address: rig.operator })
    const o = await runOnce(ctx)
    const after = await rig.client.getBalance({ address: rig.operator })

    expect(o.done).toBe(2)
    expect(o.costWei).toBe(PRICE * 140n)
    expect(o.rewardWei).toBe(COMMISSION * 140n)
    /* soldul creste exact cu incasare minus marfa minus gaz */
    expect(after - before).toBe(o.rewardWei - o.costWei - o.gasWei)

    const [, stock] = (await rig.client.readContract({
      address: vendor,
      abi: vendorAbi,
      functionName: 'machineOf',
      args: [1n]
    })) as [number, bigint]
    expect(stock).toBe(CAPACITY)
  })

  it('raportul scade cheltuiala, nu doar gazul', () => {
    const t = ctx.ledger.totals()
    expect(t.costWei).toBe(PRICE * 140n)
    expect(t.netWei).toBe(t.rewardWei - t.costWei - t.gasWei)
    /* si chiar iese pe plus, cu marfa la pretul asta */
    expect(t.netWei > 0n).toBe(true)
  })

  it('REFUZA cand comisionul e sub pretul marfii, oricat de mare ar parea castigul', async () => {
    /* comision pe jumatate fata de pret: incasarea e mare, afacerea e in pierdere */
    await send(rig, vendor, vendorAbi, 'open', [CAPACITY, 0n, PRICE, PRICE / 2n])
    const id = 4n
    const badCfg = './data/test/stocker-bad.json'
    writeTestConfig(badCfg, 'stocker', rig, vendor, {
      execution: { dryRun: false },
      policy: { dailySpendBudgetWei: parseEther('10').toString() },
      job: { discovery: { mode: 'range', cursor: { signature: 'function nextMachineId() view returns (uint256)' }, firstId: id.toString(), window: 1 } }
    })
    const bctx = buildContext(badCfg)
    const o = await runOnce(bctx)
    expect(o.done).toBe(0)
    const reasons = bctx.ledger.skipReasons()
    /* motivul spune limpede ca s-a scazut costul, nu doar ca "nu merita" */
    expect(reasons.some((r) => /net .* minus cost|net -/.test(r.reason))).toBe(true)
    bctx.ledger.close()
    cleanup([badCfg])
  })

  it('plafonul pe bucata taie cantitatea, ca o capacitate gresita sa nu devina o suma gresita', async () => {
    await send(rig, vendor, vendorAbi, 'sell', [1n, 90n])
    const capCfg = './data/test/stocker-cap.json'
    writeTestConfig(capCfg, 'stocker', rig, vendor, { job: { maxUnitsPerJob: '10' } })
    const cctx = buildContext(capCfg)
    const items = await cctx.job.discover({ client: rig.client, cfg: cctx.cfg, job: cctx.jobCfg, ledger: cctx.ledger, from: rig.operator })
    const m1 = items.find((i) => i.key === 'machine:1')!
    expect(m1.meta.units).toBe('10')
    expect(m1.costWei).toBe(PRICE * 10n)
    cctx.ledger.close()
    cleanup([capCfg])
  })

  it('bugetul zilnic de cheltuiala opreste, si e alt robinet decat cel de gaz', async () => {
    const budgetCfg = './data/test/stocker-budget.json'
    writeTestConfig(budgetCfg, 'stocker', rig, vendor, {
      execution: { dryRun: false },
      policy: { dailySpendBudgetWei: '1' }
    })
    const bctx = buildContext(budgetCfg)
    const o = await runOnce(bctx)
    expect(o.done).toBe(0)
    expect(o.stoppedBy).toMatch(/daily spend budget/)
    bctx.ledger.close()
    cleanup([budgetCfg])
  })

  it('cu plata in jetoane, limita reala e cat ai APROBAT, nu cat ai', async () => {
    const token = await deploy(rig, artifact('MockERC20.sol', 'MockERC20'), ['Stock', 'STK', 18])
    const vendor2 = await deploy(rig, artifact('MockVendor.sol', 'MockVendor'), [token])
    await fundEth(rig, vendor2, parseEther('5'))
    await send(rig, vendor2, vendorAbi, 'open', [CAPACITY, 0n, PRICE, COMMISSION])
    await send(rig, token, erc20Abi, 'mint', [rig.operator, parseEther('1000')])

    const tokenCfg = './data/test/stocker-token.json'
    writeTestConfig(tokenCfg, 'stocker', rig, vendor2, {
      execution: { dryRun: false },
      policy: { dailySpendBudgetWei: parseEther('10').toString() },
      job: {
        payment: { mode: 'token', token, decimals: 18, symbol: 'STK', weiPerToken: parseEther('1').toString() }
      }
    })
    const tctx = buildContext(tokenCfg)

    /* Fara aprobare, masina goala ramane in lista si simularea o opreste, cu
       motiv scris. Daca ar disparea din lista, jurnalul ar spune "nimic de
       facut" cand adevarul e "n-am cu ce plati". */
    const none = await runOnce(tctx)
    expect(none.seen).toBe(1)
    expect(none.done).toBe(0)
    expect(none.simulatedOk).toBe(0)

    /* aprobam exact cat trebuie pentru bucata asta, nu nelimitat */
    await send(rig, token, erc20Abi, 'approve', [vendor2, PRICE * CAPACITY])
    const o = await runOnce(tctx)
    expect(o.done).toBe(1)
    expect(o.costWei).toBe(PRICE * CAPACITY)

    const left = (await rig.client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [rig.operator, vendor2]
    })) as bigint
    expect(left).toBe(0n)
    tctx.ledger.close()
    cleanup([tokenCfg])
  })

  it('jeton fara pret = cost nemasurat, si atunci refuza in modul profit', async () => {
    const token = await deploy(rig, artifact('MockERC20.sol', 'MockERC20'), ['Stock', 'STK', 18])
    const vendor3 = await deploy(rig, artifact('MockVendor.sol', 'MockVendor'), [token])
    await fundEth(rig, vendor3, parseEther('1'))
    await send(rig, vendor3, vendorAbi, 'open', [CAPACITY, 0n, PRICE, COMMISSION])
    await send(rig, token, erc20Abi, 'mint', [rig.operator, parseEther('1000')])
    await send(rig, token, erc20Abi, 'approve', [vendor3, parseEther('1000')])

    const blindCfg = './data/test/stocker-blind.json'
    writeTestConfig(blindCfg, 'stocker', rig, vendor3, {
      execution: { dryRun: false },
      job: { payment: { mode: 'token', token, decimals: 18, symbol: 'STK', weiPerToken: '0' } }
    })
    const bctx = buildContext(blindCfg)
    const o = await runOnce(bctx)
    expect(o.done).toBe(0)
    expect(o.stoppedBy).toMatch(/could not be read up front/)

    const checks = await doctor(bctx)
    expect(checks.find((c) => c.name === 'token is priced')?.fatal).toBe(true)
    bctx.ledger.close()
    cleanup([blindCfg])
  })

  it('daca umplerea devine rezervata proprietarului, o DOVEDESTE', async () => {
    await send(rig, vendor, vendorAbi, 'setRestricted', [true])
    const strangerCfg = './data/test/stocker-stranger.json'
    writeTestConfig(strangerCfg, 'stocker', rig, vendor, { execution: { privateKey: null } })
    const sctx = buildContext(strangerCfg)
    const o = await runOnce(sctx)
    expect(o.simulatedOk).toBe(0)
    expect(o.gatingWarning).toMatch(/authority-gated/)
    await send(rig, vendor, vendorAbi, 'setRestricted', [false])
    sctx.ledger.close()
    cleanup([strangerCfg])
  })
})
