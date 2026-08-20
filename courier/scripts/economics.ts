/**
 * Cat costa de fapt o livrare, la gazul real de pe 4663.
 *
 * Forkeaza lantul, ridica o colectie de brokeri si un distribuitor, apoi
 * livreaza in loturi de marimi diferite si masoara. Ce iese nu e o estimare, e
 * gaz consumat pe stare de productie.
 *
 * Contractul de proba nu e cel de la StonkBrokers, deci cifra absoluta se va
 * schimba cu al lor. Dar ce se vede aici NU se schimba: cat costa o tranzactie
 * in plus fata de o livrare in plus, adica de la ce marime de lot nu mai
 * castigi nimic din grupare.
 *
 *   npx tsx scripts/economics.ts [cati_brokeri]
 */
import { formatEther, parseEther } from 'viem'
import { deployAll, fundDrops, startAnvil, writeTestConfig } from '../test/e2e/harness.js'
import { buildContext } from '../src/context.js'
import { runOnce } from '../src/runner.js'

const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const COUNT = Number(process.argv[2] ?? 60)
const BATCHES = [1, 5, 10, 25, 50]
const REAL_REGISTRY = '0x000000006551c19487814612e58FE06813775758' as const
const REAL_IMPL = '0x41C8f39463A868d3A88af00cd0fe7102F30E44eC' as const

const line = (a: string, b: string) => process.stdout.write(`${a.padEnd(30)} ${b}\n`)

const anvil = await startAnvil(8562, RPC)
try {
  const gasPrice = await (await import('viem')).createPublicClient({
    transport: (await import('viem')).http(RPC)
  }).getGasPrice()

  line('lant', '4663, forkat cu starea de productie')
  line('pret gaz real', `${gasPrice} wei`)
  line('brokeri in proba', String(COUNT))
  process.stdout.write('\n')

  const d = await deployAll(anvil, {
    brokerCount: COUNT,
    feeBps: 1000,
    chainId: 4663,
    registry: REAL_REGISTRY,
    implementation: REAL_IMPL
  })

  const rows: Array<{ batch: number; deliveries: number; gasTotal: bigint; perDelivery: bigint }> = []

  for (const batch of BATCHES) {
    const ids = Array.from({ length: COUNT }, (_, i) => BigInt(i + 1))
    await fundDrops(d, ids, parseEther('0.001'), 0n)

    const cfg = writeTestConfig(`./data/econ/${batch}.json`, d, anvil, {
      policy: { mode: 'campaign', cooldownSec: 0, minValueWei: '1', batchSize: batch, maxDeliveriesPerRun: 1000 },
      execution: { dryRun: false },
      storage: { file: ':memory:' }
    })
    const ctx = buildContext(cfg)
    const o = await runOnce(ctx)
    ctx.ledger.close()

    if (o.delivered > 0) {
      rows.push({
        batch,
        deliveries: o.delivered,
        gasTotal: o.gasWei,
        perDelivery: o.gasWei / BigInt(o.delivered)
      })
    }
  }

  process.stdout.write('lot   livrari   gaz total (ETH)      per livrare (ETH)     unitati/livrare\n')
  for (const r of rows) {
    const units = r.perDelivery / (await Promise.resolve(1n)) // gaz in wei; unitatile ies impartind la pret
    const unitsApprox = r.perDelivery / gasPrice
    process.stdout.write(
      `${String(r.batch).padStart(3)}   ${String(r.deliveries).padStart(7)}   ${formatEther(r.gasTotal).padStart(18)}   ${formatEther(r.perDelivery).padStart(20)}   ${String(unitsApprox).padStart(12)}\n`
    )
  }

  const best = rows.reduce((a, b) => (a.perDelivery <= b.perDelivery ? a : b), rows[0]!)
  const worst = rows.find((r) => r.batch === 1)
  process.stdout.write('\n')
  if (worst && best) {
    const saved = worst.perDelivery > 0n ? Number((worst.perDelivery - best.perDelivery) * 100n / worst.perDelivery) : 0
    line('cel mai ieftin lot', `${best.batch} livrari pe tranzactie`)
    line('economie fata de 1 la 1', `${saved}%`)
    line('bacsis minim ca sa iasa', `${formatEther(best.perDelivery)} ETH pe livrare`)
  }
  process.stdout.write(
    '\nCifra de retinut: gruparea scade costul pe livrare pana la un punct, dupa care\n' +
      'castigul se aplatizeaza fiindca partea fixa a tranzactiei e deja impartita la\n' +
      'destui. Peste acel punct cresti doar riscul, nu si castigul.\n'
  )
} finally {
  anvil.stop()
}
