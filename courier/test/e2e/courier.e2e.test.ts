/**
 * Proba cap-coada. Ce trebuie sa dovedeasca, in ordine:
 *  1. adresa portofelului 6551 calculata local e aceeasi cu cea de pe lant,
 *  2. scanarea gaseste exact ce am pus nerevendicat,
 *  3. simularea spune adevarul inainte sa se cheltuie gaz,
 *  4. livrarea chiar muta banii in portofelul brokerului, nu in al nostru,
 *  5. bacsisul ajunge unde trebuie si taxa la trezorerie,
 *  6. cand functia e rezervata proprietarului, unealta o spune si nu trimite,
 *  7. registrul si API-ul arata aceleasi cifre ca lantul.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { formatEther, parseEther, type Address } from 'viem'
import {
  artifact,
  cleanup,
  deployAll,
  fundDrops,
  startAnvil,
  writeTestConfig,
  type Anvil,
  type Deployed
} from './harness.js'
import { buildContext, STRANGER, type Ctx } from '../../src/context.js'
import { doctor } from '../../src/doctor.js'
import { runOnce } from '../../src/runner.js'
import { discoverTokenIds } from '../../src/discover/brokers.js'
import { scanClaims } from '../../src/scan/claims.js'
import { simulateEach, probeGating } from '../../src/simulate/simulate.js'
import { tbaAddress } from '../../src/erc6551/address.js'
import { REGISTRY_ABI } from '../../src/erc6551/address.js'
import { createApi } from '../../src/api/server.js'

const PORT = 8555
const CFG = './data/test/e2e.json'
const BROKERS = 12
const ETH_EACH = parseEther('0.01')
const TOK_EACH = parseEther('5')

let anvil: Anvil
let d: Deployed
let ctx: Ctx

beforeAll(async () => {
  anvil = await startAnvil(PORT)
  d = await deployAll(anvil, { brokerCount: BROKERS, feeBps: 1000 })
  await fundDrops(
    d,
    Array.from({ length: BROKERS }, (_, i) => BigInt(i + 1)),
    ETH_EACH,
    TOK_EACH
  )
  writeTestConfig(CFG, d, anvil)
  ctx = buildContext(CFG)
}, 120_000)

afterAll(() => {
  ctx?.ledger.close()
  anvil?.stop()
  cleanup(['./data/test'])
})

describe('adresele portofelelor 6551', () => {
  it('calculul local bate cu registrul de pe lant, pentru toti brokerii', async () => {
    for (let id = 1n; id <= BigInt(BROKERS); id++) {
      const local = tbaAddress({
        registry: d.registry,
        implementation: d.implementation,
        salt: ('0x' + '00'.repeat(32)) as `0x${string}`,
        chainId: 31337,
        tokenContract: d.brokers,
        tokenId: id
      })
      const onchain = (await d.client.readContract({
        address: d.registry,
        abi: REGISTRY_ABI,
        functionName: 'account',
        args: [d.implementation, ('0x' + '00'.repeat(32)) as `0x${string}`, 31337n, d.brokers, id]
      })) as Address
      expect(local.toLowerCase()).toBe(onchain.toLowerCase())
    }
  })
})

describe('diagnosticul', () => {
  it('trece tot, inclusiv intrebarea daca deliver() merge apelata de un strain', async () => {
    const checks = await doctor(ctx)
    const failed = checks.filter((c) => !c.ok)
    expect(failed.map((f) => `${f.name}: ${f.detail}`)).toEqual([])
    const gating = checks.find((c) => c.name.startsWith('deliver()'))
    expect(gating?.ok).toBe(true)
  }, 60_000)
})

describe('scanarea', () => {
  it('gaseste exact ce am pus nerevendicat si il pretuieste corect', async () => {
    const ids = await discoverTokenIds(ctx.client, ctx.cfg)
    expect(ids.length).toBe(BROKERS)

    const scan = await scanClaims(ctx.client, ctx.cfg, ids)
    expect(scan.claims.length).toBe(BROKERS)
    expect(scan.failed).toBe(0)
    expect(scan.totalNativeWei).toBe(ETH_EACH * BigInt(BROKERS))

    // valoarea = ETH + tokeni pretuiti la weiPerToken din configurare
    const perToken = (TOK_EACH * 1_000_000_000_000_000n) / 10n ** 18n
    expect(scan.claims[0]!.valueWei).toBe(ETH_EACH + perToken)
  })
})

describe('simularea', () => {
  it('spune ca se poate livra, si estimeaza gaz nenul', async () => {
    const ids = await discoverTokenIds(ctx.client, ctx.cfg)
    const scan = await scanClaims(ctx.client, ctx.cfg, ids)
    const sims = await simulateEach(ctx.client, ctx.cfg, ctx.account!.address, scan.claims)
    expect(sims.every((s) => s.ok)).toBe(true)
    expect(sims.every((s) => s.gas > 0n)).toBe(true)
  })

  it('un strain fara nimic in portofel poate totusi apela deliver()', async () => {
    const ids = await discoverTokenIds(ctx.client, ctx.cfg)
    const scan = await scanClaims(ctx.client, ctx.cfg, ids)
    const probe = await probeGating(ctx.client, ctx.cfg, scan.claims, STRANGER as Address)
    expect(probe.callableByStranger).toBe(true)
  })
})

describe('rularea uscata', () => {
  it('calculeaza tot si nu trimite nimic', async () => {
    const before = await d.client.getBalance({ address: d.operator })
    const o = await runOnce(ctx)
    const after = await d.client.getBalance({ address: d.operator })
    expect(o.delivered).toBe(0)
    expect(o.candidates).toBe(BROKERS)
    expect(after).toBe(before)
    expect(o.wallCount).toBe(BROKERS)
  }, 60_000)
})

describe('livrarea pe bune', () => {
  it('muta banii in portofelul brokerului, nu in al nostru', async () => {
    ctx.cfg.execution.dryRun = false

    const ids = await discoverTokenIds(ctx.client, ctx.cfg)
    const scan = await scanClaims(ctx.client, ctx.cfg, ids)
    const wallets = scan.claims.map((c) => c.wallet)
    const before = await Promise.all(wallets.map((w) => d.client.getBalance({ address: w })))
    const treasuryBefore = await d.client.getBalance({ address: d.treasury })
    const holderBefore = await d.client.getBalance({ address: d.holder })

    const o = await runOnce(ctx)

    expect(o.delivered).toBe(BROKERS)
    expect(o.gasWei).toBeGreaterThan(0n)

    const after = await Promise.all(wallets.map((w) => d.client.getBalance({ address: w })))
    for (let i = 0; i < wallets.length; i++) {
      expect(after[i]! > before[i]!).toBe(true)
    }

    // bacsisul s-a impartit: taxa la trezorerie, restul la beneficiar
    const treasuryAfter = await d.client.getBalance({ address: d.treasury })
    const holderAfter = await d.client.getBalance({ address: d.holder })
    expect(treasuryAfter > treasuryBefore).toBe(true)
    expect(holderAfter > holderBefore).toBe(true)

    // taxa e 10% din bacsis, cum a fost desfasurat contractul
    const fee = treasuryAfter - treasuryBefore
    const rest = holderAfter - holderBefore
    expect(Number(fee)).toBeCloseTo(Number((fee + rest) / 10n), -6)
  }, 120_000)

  it('a doua rulare nu mai are ce livra si nu arde gaz degeaba', async () => {
    const o = await runOnce(ctx)
    expect(o.withSomething).toBe(0)
    expect(o.delivered).toBe(0)
    expect(o.gasWei).toBe(0n)
  }, 60_000)

  it('registrul stie ce s-a intamplat, inclusiv cat s-a castigat si cat s-a ars', () => {
    const t = ctx.ledger.totals(0)
    expect(t.deliveries).toBe(BROKERS)
    expect(t.wallets).toBe(BROKERS)
    expect(t.valueWei > 0n).toBe(true)
    // bacsisul chiar ajunge pe randuri: fara asta raportul ar arata castig zero
    expect(t.tipsWei > 0n).toBe(true)
    expect(t.gasWei > 0n).toBe(true)
    expect(t.netWei).toBe(t.tipsWei - t.gasWei)
    expect(ctx.ledger.wallTotals().count).toBe(0)
  })

  it('API-ul raspunde cu aceleasi cifre', async () => {
    const server = createApi(ctx)
    await new Promise<void>((r) => server.listen(8899, '127.0.0.1', () => r()))
    const stats = (await (await fetch('http://127.0.0.1:8899/stats')).json()) as {
      stats: { jobs: number; agents: number }
      feed: string[][]
    }
    expect(stats.stats.jobs).toBe(BROKERS)
    expect(stats.stats.agents).toBe(BROKERS)
    expect(stats.feed.length).toBeGreaterThan(0)
    const report = (await (await fetch('http://127.0.0.1:8899/report')).json()) as { all: { deliveries: number } }
    expect(report.all.deliveries).toBe(BROKERS)

    // peretele uitatilor, ca pagina: HTML propriu, cu politica de continut stransa
    const page = await fetch('http://127.0.0.1:8899/')
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toMatch(/text\/html/)
    expect(page.headers.get('content-security-policy')).toMatch(/default-src 'none'/)
    const html = await page.text()
    expect(html).toContain('We never ask you to connect a wallet')
    expect(html).toContain("fetch('/wall")

    const missing = await fetch('http://127.0.0.1:8899/nu-exista')
    expect(missing.status).toBe(404)

    // metodele care scriu nu exista deloc
    const post = await fetch('http://127.0.0.1:8899/stats', { method: 'POST' })
    expect(post.status).toBe(405)
    server.close()
  })
})

describe('descoperirea prin evenimente', () => {
  it('scanarea de log-uri Transfer gaseste aceiasi brokeri ca numararea directa', async () => {
    const byRange = await discoverTokenIds(ctx.client, ctx.cfg)
    const logsCfg = { ...ctx.cfg, brokers: { ...ctx.cfg.brokers, idStrategy: 'logs' as const, deployBlock: 0n } }
    const byLogs = await discoverTokenIds(ctx.client, logsCfg)
    expect(byLogs).toEqual(byRange)
  }, 60_000)
})

describe('cand deliver() e rezervata proprietarului', () => {
  it('unealta o spune din simulare si nu trimite nimic', async () => {
    // repunem ceva nerevendicat si inchidem functia
    const dropsAbi = artifact('MockDrops.sol', 'MockDrops').abi
    const ids = [1n, 2n, 3n]
    await fundDrops(d, ids, ETH_EACH, 0n)
    await d.client.waitForTransactionReceipt({
      hash: await d.wallet.writeContract({
        address: d.drops,
        abi: dropsAbi,
        functionName: 'setGated',
        args: [true],
        account: d.wallet.account!,
        chain: d.chain
      })
    })

    const before = await d.client.getBalance({ address: d.operator })
    const o = await runOnce(ctx)
    const after = await d.client.getBalance({ address: d.operator })

    expect(o.simulatedOk).toBe(0)
    expect(o.delivered).toBe(0)
    expect(o.gatingWarning).toBeTruthy()
    expect(after).toBe(before) // niciun gaz ars pe o tranzactie care ar fi dat revert

    const checks = await doctor(ctx)
    const gating = checks.find((c) => c.name.startsWith('deliver()'))
    expect(gating?.ok).toBe(false)
    expect(gating?.fatal).toBe(true)
  }, 120_000)
})
