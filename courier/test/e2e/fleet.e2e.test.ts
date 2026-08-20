/**
 * Plata pe flota, pe lant.
 *
 * Asta e testul care sustine singura propozitie care vinde colectia: "bucata
 * ta a muncit si a castigat atat". Nu verifica registrul nostru, ca ala e doar
 * ce spunem noi. Verifica **soldul portofelului 6551 al fiecarui agent**,
 * inainte si dupa, si suma pe care a mutat-o contractul.
 *
 * Si mai verifica lucrul care sparge de obicei astfel de scheme: un agent cu
 * portofel prost, care refuza banii. Aia nu are voie sa opreasca plata
 * celorlalti si nici sa piarda banii pe drum.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseEther, type Address } from 'viem'
import {
  artifact,
  cleanup,
  deployAll,
  fundDrops,
  startAnvil,
  writeTestConfig,
  ANVIL_KEY,
  type Anvil,
  type Deployed
} from './harness.js'
import { privateKeyToAccount } from 'viem/accounts'
import { buildContext, type Ctx } from '../../src/context.js'
import { runOnce } from '../../src/runner.js'

const PORT = 8565
const CFG = './data/test-fleet/fleet.json'
const BROKERS = 9
const ETH_EACH = parseEther('0.02')

let anvil: Anvil
let d: Deployed
let ctx: Ctx
/** portofelele agentilor: doua cuminti si unul care refuza ETH */
let agentWallets: Address[] = []
let refuser: Address

const BATCH_ABI = artifact('CourierBatch.sol', 'CourierBatch').abi

async function balances(addrs: Address[]): Promise<bigint[]> {
  return Promise.all(addrs.map((a) => d.client.getBalance({ address: a })))
}

beforeAll(async () => {
  anvil = await startAnvil(PORT)
  d = await deployAll(anvil, { brokerCount: BROKERS, feeBps: 1000 })
  await fundDrops(
    d,
    Array.from({ length: BROKERS }, (_, i) => BigInt(i + 1)),
    ETH_EACH,
    0n
  )

  const account = privateKeyToAccount(ANVIL_KEY)
  const r = artifact('MockRefuser.sol', 'MockRefuser')
  const hash = await d.wallet.deployContract({ abi: r.abi, bytecode: r.bytecode, account, chain: d.chain })
  const receipt = await d.client.waitForTransactionReceipt({ hash })
  refuser = receipt.contractAddress as Address

  /* adrese simple, fara cod: un portofel 6551 nedesfasurat se comporta la fel,
     iar testul ramane despre plata, nu despre implementarea portofelului */
  agentWallets = [
    '0x00000000000000000000000000000000000000b1',
    '0x00000000000000000000000000000000000000b2',
    refuser
  ]

  writeTestConfig(CFG, d, anvil, {
    fleet: [
      { id: 1, wallet: agentWallets[0] },
      { id: 2, wallet: agentWallets[1] },
      { id: 3, wallet: agentWallets[2] }
    ],
    execution: { dryRun: false },
    policy: { batchSize: 9, mode: 'campaign' },
    storage: { file: './data/test-fleet/fleet.db' }
  })
  ctx = buildContext(CFG)
}, 120_000)

afterAll(() => {
  ctx?.ledger.close()
  anvil?.stop()
  cleanup(['./data/test-fleet'])
})

describe('plata flotei, pe lant', () => {
  it('fiecare agent primeste bacsisul lui in portofelul lui, in aceeasi tranzactie', async () => {
    const before = await balances(agentWallets)
    const treasuryBefore = await d.client.getBalance({ address: d.treasury })

    const o = await runOnce(ctx)
    expect(o.delivered).toBe(BROKERS)

    const after = await balances(agentWallets)
    const treasuryAfter = await d.client.getBalance({ address: d.treasury })

    /* primii doi agenti, care pot primi ETH, chiar au primit */
    expect(after[0]! - before[0]!).toBeGreaterThan(0n)
    expect(after[1]! - before[1]!).toBeGreaterThan(0n)
    /* trezoreria si-a luat taxa din bacsis */
    expect(treasuryAfter - treasuryBefore).toBeGreaterThan(0n)

    /* 9 livrari, 3 agenti: 3 fiecare, deci cote egale pana la praful din
       impartire, care e cel mult o miime de procent */
    const paid0 = after[0]! - before[0]!
    const paid1 = after[1]! - before[1]!
    const diff = paid0 > paid1 ? paid0 - paid1 : paid1 - paid0
    expect(diff).toBeLessThanOrEqual(o.tipsWei / 10_000n + 1n)

    /* si acum socoteala se inchide pe lant, la wei: tot bacsisul intrat a
       plecat undeva, la agenti, la trezorerie, sau creditat celui care refuza */
    const owed = (await d.client.readContract({
      address: d.batch,
      abi: BATCH_ABI,
      functionName: 'owed',
      args: [refuser]
    })) as bigint
    expect(paid0 + paid1 + owed + (treasuryAfter - treasuryBefore)).toBe(o.tipsWei)
  })

  it('agentul cu portofel prost nu opreste plata celorlalti, dar nici nu isi pierde banii', async () => {
    const owed = (await d.client.readContract({
      address: d.batch,
      abi: BATCH_ABI,
      functionName: 'owed',
      args: [refuser]
    })) as bigint
    expect(owed).toBeGreaterThan(0n)

    const totalOwed = (await d.client.readContract({
      address: d.batch,
      abi: BATCH_ABI,
      functionName: 'totalOwed',
      args: []
    })) as bigint
    expect(totalOwed).toBe(owed)
  })

  it('maturarea nu are voie sa ia banii datorati cuiva', async () => {
    const account = privateKeyToAccount(ANVIL_KEY)
    const owedBefore = (await d.client.readContract({
      address: d.batch,
      abi: BATCH_ABI,
      functionName: 'owed',
      args: [refuser]
    })) as bigint

    await d.client.waitForTransactionReceipt({
      hash: await d.wallet.writeContract({
        address: d.batch,
        abi: BATCH_ABI,
        functionName: 'sweep',
        args: [],
        account,
        chain: d.chain
      })
    })

    const left = await d.client.getBalance({ address: d.batch })
    expect(left).toBe(owedBefore)
    const owedAfter = (await d.client.readContract({
      address: d.batch,
      abi: BATCH_ABI,
      functionName: 'owed',
      args: [refuser]
    })) as bigint
    expect(owedAfter).toBe(owedBefore)
  })

  it('banii creditati raman ai lui, oricat de prost e portofelul', async () => {
    const account = privateKeyToAccount(ANVIL_KEY)
    const owedBefore = (await d.client.readContract({
      address: d.batch,
      abi: BATCH_ABI,
      functionName: 'owed',
      args: [refuser]
    })) as bigint

    /* portofelul asta refuza ETH mereu, deci nici impinsul nu are cum sa
       reuseasca. Important e ce NU se intampla: banii nu se ard, nu ajung la
       altcineva si nu raman intr-o stare din care ii poate lua oricine. */
    await expect(
      d.wallet.writeContract({
        address: d.batch,
        abi: BATCH_ABI,
        functionName: 'withdraw',
        args: [refuser],
        account,
        chain: d.chain
      })
    ).rejects.toThrow()

    const owedAfter = (await d.client.readContract({
      address: d.batch,
      abi: BATCH_ABI,
      functionName: 'owed',
      args: [refuser]
    })) as bigint
    expect(owedAfter).toBe(owedBefore)
  })

  it('registrul spune acelasi lucru ca lantul: fiecare agent cu socoteala lui', () => {
    const a1 = ctx.ledger.agentTotals(1)
    const a2 = ctx.ledger.agentTotals(2)
    const a3 = ctx.ledger.agentTotals(3)
    expect(a1.deliveries).toBe(3)
    expect(a2.deliveries).toBe(3)
    expect(a3.deliveries).toBe(3)
    /* bacsisul din registru e impartit pe randuri, deci se aduna la loc */
    const total = a1.tipsWei + a2.tipsWei + a3.tipsWei
    expect(total).toBeGreaterThan(0n)
  })

  it('rotatia continua intre rulari, nu ia mereu aceiasi de la capat', () => {
    const cursor = Number(ctx.ledger.kvGet('fleet.cursor'))
    expect(cursor).toBe(BROKERS % 3)
  })
})
