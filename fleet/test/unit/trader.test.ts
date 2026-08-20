import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeAbiParameters } from 'viem'
import { beforeAll, describe, expect, it } from 'vitest'
import { ConfigSchema } from '../../src/core/config.js'
import { drawdownBrake, loadBrain, movePct, navMarks, signed, trader, tradesLeft, usd } from '../../src/jobs/trader.js'

const BRAIN_DIR = fileURLToPath(new URL('./fixtures/brain', import.meta.url))
const CACHE = join(tmpdir(), `trader-test-${process.pid}`)
const DAY = new Date().toISOString().slice(0, 10)

const COLLECTION = '0x00000000000000000000000000000000000000c1'
const REGISTRY = '0x00000000000000000000000000000000000000b0'
const ACCT = '0x000000000000000000000000000000000000acc1'
const SIGNER = '0x000000000000000000000000000000000000f00d'
const USDG_TOKEN = '0x0000000000000000000000000000000000000222'
const NVDA_TOKEN = '0x0000000000000000000000000000000000000111'
const NVDA_FEED = '0x0000000000000000000000000000000000000333'
const ZERO = '0x0000000000000000000000000000000000000000'

const NOW = BigInt(Math.floor(Date.now() / 1000))

const cfg = (over: Record<string, unknown> = {}) =>
  ConfigSchema.parse({
    agent: { kind: 'trader' },
    network: { name: 'x', chainId: 4663, rpc: ['http://a.test'] },
    target: { address: COLLECTION, errorSignatures: ['error NotAgent()'] },
    ...over
  })

const jobCfg = (over: Record<string, unknown> = {}) =>
  trader.parse({
    tokenId: 1,
    registry: REGISTRY,
    brain: { dir: BRAIN_DIR },
    tokens: {
      USDG: { address: USDG_TOKEN, decimals: 6, feed: null },
      NVDA: { address: NVDA_TOKEN, decimals: 18, feed: NVDA_FEED }
    },
    eth: { usd8: '400000000000' },
    history: { range: '1y', cacheDir: CACHE },
    ...over
  })

interface FakeState {
  strategyId?: number
  agentSigner?: string
  paused?: boolean
  globallyPaused?: boolean
  policyExists?: boolean
  routeExists?: boolean
  usdgBal?: bigint
  nvdaBal?: bigint
  nvdaUsd8?: bigint
  updatedAt?: bigint
  aggAllowed?: boolean
  v4Out?: bigint
  aggOut?: bigint
  gasWei?: bigint
}

function clientFor(state: FakeState = {}) {
  return {
    async readContract({ address, functionName }: { address: string; functionName: string }) {
      const a = address.toLowerCase()
      if (a === COLLECTION) {
        if (functionName === 'strategyOf') return state.strategyId ?? 6
        if (functionName === 'accountOf') return ACCT
      }
      if (a === ACCT) {
        if (functionName === 'agentSigner') return state.agentSigner ?? SIGNER
        if (functionName === 'paused') return state.paused ?? false
      }
      if (a === REGISTRY) {
        if (functionName === 'paused') return state.globallyPaused ?? false
        if (functionName === 'policyOf') {
          return {
            maxTradeUsd: 0n,
            maxDailyUsd: 0n,
            maxSlippageBps: 50,
            cooldownSec: 1800,
            maxStaleSec: 3600,
            exists: state.policyExists ?? true
          }
        }
        if (functionName === 'routeOf') {
          return { fee: 3000, tickSpacing: 60, hooks: ZERO, exists: state.routeExists ?? true }
        }
      }
      if (a === NVDA_FEED) {
        if (functionName === 'latestRoundData') return [1n, state.nvdaUsd8 ?? 20_000_000_000n, 0n, state.updatedAt ?? NOW, 1n]
        if (functionName === 'decimals') return 8
      }
      if (a === USDG_TOKEN && functionName === 'balanceOf') return state.usdgBal ?? 0n
      if (a === NVDA_TOKEN && functionName === 'balanceOf') return state.nvdaBal ?? 0n
      if (a === REGISTRY && functionName === 'isAllowedAggregator') return state.aggAllowed ?? true
      throw new Error(`unexpected read: ${functionName} at ${address}`)
    },
    async getBlock() {
      return { timestamp: NOW }
    },
    async getBalance() {
      return state.gasWei ?? 300_000_000_000_000n
    },
    async simulateContract({ functionName }: { functionName: string }) {
      if (functionName === 'executeTrade') return { result: state.v4Out ?? 4_975_000_000_000_000_000n }
      if (functionName === 'executeAggregatorTrade') return { result: state.aggOut ?? 5_100_000_000_000_000_000n }
      throw new Error(`unexpected simulate: ${functionName}`)
    }
  } as never
}

const discoverInput = (client: unknown, job: unknown, over: Record<string, unknown> = {}) =>
  ({ client, cfg: cfg(), job, ledger: fakeLedger(), from: SIGNER, ...over }) as never

function writeBars(closes: number[]): void {
  const dir = join(CACHE, DAY)
  mkdirSync(dir, { recursive: true })
  const bars = closes.map((c, i) => ({ t: i + 1, c }))
  writeFileSync(join(dir, 'NVDA.json'), JSON.stringify(bars))
}

beforeAll(() => {
  writeBars([100, 105, 110, 120, 130])
})

describe('trader: creierul', () => {
  it('fara creier, eroarea spune unde trebuia sa fie si ca e privat', async () => {
    await expect(loadBrain('/nope/nothing-here')).rejects.toThrow(/PRIVATE financial-nfa/)
  })

  it('creierul de proba se incarca din layout-ul de build (dist/)', async () => {
    const brain = await loadBrain(BRAIN_DIR)
    expect(brain.CASH).toBe('USDG')
    expect(brain.SIGNALS[6]!.name).toBe('Fixture Rotor')
  })
})

describe('trader: configurarea', () => {
  it('refuza configurarea fara tokenId si registry', () => {
    expect(() => trader.parse({})).toThrow(/job\.(tokenId|registry)/)
  })

  it('tinta pe bucata e contul 6551 din meta, nu colectia', () => {
    const job = jobCfg()
    const generic = trader.target(cfg(), job)
    expect(generic.address.toLowerCase()).toBe(COLLECTION)
    const item = { meta: { account: ACCT } } as never
    const perItem = trader.target(cfg(), job, item)
    expect(perItem.address.toLowerCase()).toBe(ACCT)
    expect(perItem.functionName).toBe('executeTrade')
    expect(perItem.abi.some((x) => x.type === 'error' && (x as { name?: string }).name === 'NotAgent')).toBe(true)
  })
})

describe('trader: descoperirea', () => {
  it('vault-ul 100% cash SE ROTESTE cand semnalul cere: fix bug-ul runner-ului vechi, care sarea peste cash ca "fara feed" si nu pleca niciodata din USDG', async () => {
    const job = jobCfg()
    const items = await trader.discover(discoverInput(clientFor({ usdgBal: 1_000_000_000n }), job))
    expect(items).toHaveLength(1)
    const it0 = items[0]!
    expect(it0.key).toBe(`rotate:1:${DAY}:USDG->NVDA`)
    expect(it0.once).toBe(true)
    expect(it0.meta.from).toBe('USDG')
    expect(it0.meta.to).toBe('NVDA')

    // $1000 la intrare, slippage 50bps => acceptam minim 4.975 NVDA la $200
    expect(it0.meta.inUsd8).toBe('100000000000')
    expect(it0.meta.minAmountOut).toBe('4975000000000000000')
    // pierderea tolerata: $5, in wei la cursul static de $4000/ETH
    expect(it0.meta.maxLossUsd8).toBe('500000000')
    expect(it0.costWei).toBe(1_250_000_000_000_000n)
    expect(it0.costMeasured).toBe(true)
    expect(it0.stakeWei).toBe(250_000_000_000_000_000n)
    // castigul e alpha, nu se pretinde masurat
    expect(it0.rewardWei).toBe(0n)
    expect(it0.rewardMeasured).toBe(false)

    // calldata decodabila, cu perechea ordonata pe adresa in PoolKey
    const [decoded] = decodeAbiParameters(
      [
        {
          type: 'tuple',
          components: [
            { name: 'tokenIn', type: 'address' },
            { name: 'tokenOut', type: 'address' },
            { name: 'amountIn', type: 'uint256' },
            { name: 'minAmountOut', type: 'uint256' },
            {
              name: 'poolKey',
              type: 'tuple',
              components: [
                { name: 'currency0', type: 'address' },
                { name: 'currency1', type: 'address' },
                { name: 'fee', type: 'uint24' },
                { name: 'tickSpacing', type: 'int24' },
                { name: 'hooks', type: 'address' }
              ]
            },
            { name: 'hookData', type: 'bytes' }
          ]
        }
      ],
      it0.args[0] as `0x${string}`
    )
    expect((decoded as { tokenIn: string }).tokenIn.toLowerCase()).toBe(USDG_TOKEN)
    expect((decoded as { tokenOut: string }).tokenOut.toLowerCase()).toBe(NVDA_TOKEN)
    expect((decoded as { amountIn: bigint }).amountIn).toBe(1_000_000_000n)
    const pk = (decoded as { poolKey: { currency0: string; currency1: string } }).poolKey
    expect(pk.currency0.toLowerCase() < pk.currency1.toLowerCase()).toBe(true)
  })

  it('semnal pe cash cand vault-ul e deja cash: hold, nicio bucata', async () => {
    writeBars([130, 120, 110, 105, 100])
    const items = await trader.discover(discoverInput(clientFor({ usdgBal: 1_000_000_000n }), jobCfg()))
    expect(items).toHaveLength(0)
    writeBars([100, 105, 110, 120, 130])
  })

  it('oracol vechi = piata inchisa: sta, nu construieste rotatia', async () => {
    const items = await trader.discover(
      discoverInput(clientFor({ usdgBal: 1_000_000_000n, updatedAt: NOW - 100_000n }), jobCfg())
    )
    expect(items).toHaveLength(0)
  })

  it('cheia care nu e agentSigner nu propune nimic', async () => {
    const items = await trader.discover(
      discoverInput(clientFor({ usdgBal: 1_000_000_000n, agentSigner: '0x000000000000000000000000000000000000beef' }), jobCfg())
    )
    expect(items).toHaveLength(0)
  })

  it('vault pauzat sau circuit-breaker global: sta', async () => {
    expect(await trader.discover(discoverInput(clientFor({ usdgBal: 1_000_000_000n, paused: true }), jobCfg()))).toHaveLength(0)
    expect(
      await trader.discover(discoverInput(clientFor({ usdgBal: 1_000_000_000n, globallyPaused: true }), jobCfg()))
    ).toHaveLength(0)
  })

  it('fara ruta canonica de pool: sta, nu inventeaza un PoolKey', async () => {
    const items = await trader.discover(discoverInput(clientFor({ usdgBal: 1_000_000_000n, routeExists: false }), jobCfg()))
    expect(items).toHaveLength(0)
  })

  it('fara curs ETH, costul iese NEMASURAT, ca frana implicita sa il refuze', async () => {
    const job = jobCfg({ eth: { usd8: '0' } })
    const items = await trader.discover(discoverInput(clientFor({ usdgBal: 1_000_000_000n }), job))
    expect(items).toHaveLength(1)
    expect(items[0]!.costMeasured).toBe(false)
    expect(items[0]!.costWei).toBe(0n)
  })
})

describe('trader: best execution', () => {
  it('cu execution=best si agregator mai bun la simulare, castiga agregatorul, iar tinta stie functia din meta', async () => {
    process.env.ONEINCH_API_KEY = 'test-key'
    try {
      const job = jobCfg({ execution: 'best' })
      const items = await trader.discover(
        discoverInput(clientFor({ usdgBal: 1_000_000_000n, aggOut: 5_100_000_000_000_000_000n }), job)
      )
      expect(items).toHaveLength(1)
      expect(items[0]!.meta.via).toBe('aggregator')
      expect(items[0]!.meta.fn).toBe('executeAggregatorTrade')
      const t = trader.target(cfg(), job, items[0])
      expect(t.functionName).toBe('executeAggregatorTrade')
    } finally {
      delete process.env.ONEINCH_API_KEY
    }
  })

  it('cu v4 mai bun la simulare, ramane v4 chiar daca agregatorul exista', async () => {
    process.env.ONEINCH_API_KEY = 'test-key'
    try {
      const items = await trader.discover(
        discoverInput(clientFor({ usdgBal: 1_000_000_000n, aggOut: 1n }), jobCfg({ execution: 'best' }))
      )
      expect(items).toHaveLength(1)
      expect(items[0]!.meta.via).toBe('v4')
      expect(items[0]!.meta.fn).toBe('executeTrade')
    } finally {
      delete process.env.ONEINCH_API_KEY
    }
  })

  it('un router care nu e in allowlist-ul on-chain nu devine cale de executie', async () => {
    process.env.ONEINCH_API_KEY = 'test-key'
    try {
      const items = await trader.discover(
        discoverInput(
          clientFor({ usdgBal: 1_000_000_000n, aggAllowed: false, aggOut: 9_000_000_000_000_000_000n }),
          jobCfg({ execution: 'best' })
        )
      )
      expect(items).toHaveLength(1)
      expect(items[0]!.meta.via).toBe('v4')
    } finally {
      delete process.env.ONEINCH_API_KEY
    }
  })

  it('fara ONEINCH_API_KEY, execution=best cade cuminte pe v4', async () => {
    delete process.env.ONEINCH_API_KEY
    const items = await trader.discover(
      discoverInput(clientFor({ usdgBal: 1_000_000_000n }), jobCfg({ execution: 'best' }))
    )
    expect(items).toHaveLength(1)
    expect(items[0]!.meta.via).toBe('v4')
  })

  it('execution=aggregator fara cheie e o configurare pe care doctorul o pica', async () => {
    delete process.env.ONEINCH_API_KEY
    const checks = await trader.checks!(discoverInput(clientFor({}), jobCfg({ execution: 'aggregator' })))
    const c = checks.find((x) => x.name === 'aggregator path')
    expect(c!.ok).toBe(false)
    expect(c!.fatal).toBe(true)
  })
})

describe('trader: diagnosticul', () => {
  it('cheia straina e fatala si spune ce asteapta lantul', async () => {
    const checks = await trader.checks!(
      discoverInput(clientFor({}), jobCfg(), { from: '0x000000000000000000000000000000000000beef' })
    )
    const c = checks.find((x) => x.name === 'operator key is the agent signer')
    expect(c!.ok).toBe(false)
    expect(c!.fatal).toBe(true)
    expect(c!.detail).toContain(SIGNER)
  })

  it('creierul lipsa e fatal, restul verificarilor nici nu se mai incearca', async () => {
    const job = jobCfg({ brain: { dir: '/nope/nothing-here' } })
    const checks = await trader.checks!(discoverInput(clientFor({}), job))
    expect(checks).toHaveLength(1)
    expect(checks[0]!.name).toBe('brain')
    expect(checks[0]!.fatal).toBe(true)
  })

  it('fara curs ETH, doctor pica inainte sa se piarda o luna in jurnal', async () => {
    const checks = await trader.checks!(discoverInput(clientFor({}), jobCfg({ eth: { usd8: '0' } })))
    const c = checks.find((x) => x.name === 'ETH is priced')
    expect(c!.ok).toBe(false)
    expect(c!.fatal).toBe(true)
  })

  it('cand totul e la locul lui, doctorul o spune', async () => {
    const checks = await trader.checks!(discoverInput(clientFor({}), jobCfg()))
    const bad = checks.filter((x) => !x.ok && x.name !== 'daily spend budget')
    expect(bad).toHaveLength(0)
    expect(checks.find((x) => x.name === 'universe tokens')!.ok).toBe(true)
    expect(checks.find((x) => x.name === 'price history')!.ok).toBe(true)
  })
})

function fakeLedger(over: { done?: number; gasWei?: bigint; events?: unknown[] } = {}) {
  const kv = new Map<string, string>()
  return {
    kv,
    kvGet: (k: string) => kv.get(k) ?? null,
    kvSet: (k: string, v: string) => {
      kv.set(k, v)
    },
    totals: () => ({
      done: over.done ?? 1,
      rewardWei: 0n,
      costWei: 0n,
      gasWei: over.gasWei ?? 7_770_136_936_000n,
      netWei: 0n
    }),
    recentEvents: () => over.events ?? []
  }
}

const lineOf = (lines: Array<{ name: string; value: string; level?: string }>, name: string) =>
  lines.find((l) => l.name === name)!

describe('trader: socoteala din dare de seama', () => {
  it('dolarii se scriu cu doua zecimale, si zero e zero, nu gol', () => {
    expect(usd(227_000_000n)).toBe('$2.27')
    expect(usd(0n)).toBe('$0.00')
    expect(usd(100_000_000n)).toBe('$1.00')
    expect(usd(-50_000_000n)).toBe('-$0.50')
  })

  it('procentele au semn, iar lipsa reperului nu devine 0%', () => {
    expect(signed(movePct(100_000_000n, 110_000_000n))).toBe('+10.00%')
    expect(signed(movePct(100_000_000n, 95_000_000n))).toBe('-5.00%')
    expect(movePct(0n, 100n)).toBeNull()
    expect(signed(null)).toBe('n/a')
  })

  it('gazul se traduce in rotatii DOAR daca exista istoric: fara el, "nu stiu"', () => {
    expect(tradesLeft(100n, 10n, 1)).toBe(10)
    expect(tradesLeft(100n, 0n, 0)).toBeNull()
    expect(tradesLeft(100n, 10n, 0)).toBeNull()
  })

  it('reperele se scriu o singura data: prima valoare vazuta si prima a zilei', () => {
    const l = fakeLedger()
    const a = navMarks(l, 200_000_000n, '2026-08-20')
    expect(a.first).toBe(200_000_000n)
    expect(a.dayOpen).toBe(200_000_000n)
    const b = navMarks(l, 220_000_000n, '2026-08-20')
    expect(b.first).toBe(200_000_000n)
    expect(b.dayOpen).toBe(200_000_000n)
    const c = navMarks(l, 220_000_000n, '2026-08-21')
    expect(c.first).toBe(200_000_000n)
    expect(c.dayOpen).toBe(220_000_000n)
    expect(l.kvGet('nav.last')).toBe('220000000')
  })
})

describe('trader: darea de seama', () => {
  it('spune ce tine seiful si cat valoreaza, cu reperul de la prima citire', async () => {
    const job = jobCfg()
    const ledger = fakeLedger()
    /* 0.0129 NVDA la $200 = $2.58 */
    const lines = await trader.report!(
      discoverInput(clientFor({ nvdaBal: 12_906_168_112_630_544n }), job, { ledger })
    )
    expect(lineOf(lines, 'position').value).toContain('NVDA')
    expect(lineOf(lines, 'value').value).toContain('$2.58')
    expect(lineOf(lines, 'value').value).toContain('since start +0.00%')

    /* pretul urca 10%: reperul ramane pe loc, deci castigul se vede */
    const after = await trader.report!(
      discoverInput(clientFor({ nvdaBal: 12_906_168_112_630_544n, nvdaUsd8: 22_000_000_000n }), job, { ledger })
    )
    expect(lineOf(after, 'value').value).toContain('since start +10.00%')
  })

  it('gazul aproape terminat e alarma, nu o cifra printre altele', async () => {
    const job = jobCfg()
    const lines = await trader.report!(
      discoverInput(clientFor({ usdgBal: 2_000_000n, gasWei: 20_000_000_000_000n }), job, {
        ledger: fakeLedger({ done: 1, gasWei: 8_000_000_000_000n })
      })
    )
    expect(lineOf(lines, 'gas').value).toContain('~2 rotations')
    expect(lineOf(lines, 'gas').level).toBe('bad')
  })

  it('vault-ul pauzat si proba uscata se vad, ca doua feluri de "nu se intampla nimic"', async () => {
    const job = jobCfg()
    const lines = await trader.report!(
      discoverInput(clientFor({ usdgBal: 2_000_000n, paused: true }), job, {
        ledger: fakeLedger(),
        cfg: cfg({ execution: { dryRun: true } })
      })
    )
    expect(lineOf(lines, 'halted').level).toBe('bad')
    expect(lineOf(lines, 'mode').level).toBe('warn')
  })

  it('fara creier, raportul e un singur rand si acela e rosu', async () => {
    const lines = await trader.report!(
      discoverInput(clientFor({}), jobCfg({ brain: { dir: '/nope/nothing-here' } }), { ledger: fakeLedger() })
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]!.level).toBe('bad')
  })
})

describe('trader: frana de pierdere', () => {
  const brakeArgs = (over: Record<string, unknown> = {}) => ({
    client: clientFor({ usdgBal: 1_000_000_000n }),
    cfg: cfg(),
    job: jobCfg(),
    ledger: fakeLedger(),
    cash: 'USDG',
    account: ACCT,
    maxStaleSec: 3600,
    nowSec: NOW,
    tag: '#1',
    ...over
  })

  it('cat timp valoarea e peste linie, frana tace', async () => {
    const args = brakeArgs()
    expect(await drawdownBrake(args as never)).toBeNull()
    expect(args.ledger.kvGet('nav.first')).toBe('100000000000')
  })

  it('sub linie: se opreste, scrie siguranta si spune cu cat s-a cazut', async () => {
    const dir = join(tmpdir(), `trader-brake-${process.pid}`)
    const stop = join(dir, 'STOP-test')
    const ledger = fakeLedger()
    /* reper de $1000, iar acum vaultul mai are $600: 40% pierdere, peste 30% */
    ledger.kvSet('nav.first', '100000000000')
    const args = brakeArgs({
      ledger,
      client: clientFor({ usdgBal: 600_000_000n }),
      cfg: cfg({ execution: { killSwitchFile: stop } })
    })
    const reason = await drawdownBrake(args as never)
    expect(reason).toContain('40.00%')
    expect(existsSync(stop)).toBe(true)
    expect(ledger.kvGet('brake.armed')).toBe('1')
    rmSync(dir, { recursive: true, force: true })
  })

  it('nu se lupta cu omul: siguranta ridicata inapoi nu e rescrisa la fiecare rulare', async () => {
    const dir = join(tmpdir(), `trader-brake2-${process.pid}`)
    const stop = join(dir, 'STOP-test')
    const ledger = fakeLedger()
    ledger.kvSet('nav.first', '100000000000')
    const args = brakeArgs({
      ledger,
      client: clientFor({ usdgBal: 600_000_000n }),
      cfg: cfg({ execution: { killSwitchFile: stop } })
    })
    await drawdownBrake(args as never)
    rmSync(stop, { force: true })
    /* a doua rulare, tot sub linie: rotatiile raman oprite, dar fisierul nu se
       rescrie peste decizia operatorului */
    expect(await drawdownBrake(args as never)).not.toBeNull()
    expect(existsSync(stop)).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('cand valoarea revine peste linie, frana se rearmeaza', async () => {
    const ledger = fakeLedger()
    ledger.kvSet('nav.first', '100000000000')
    ledger.kvSet('brake.armed', '1')
    const args = brakeArgs({ ledger, client: clientFor({ usdgBal: 900_000_000n }) })
    expect(await drawdownBrake(args as never)).toBeNull()
    expect(ledger.kvGet('brake.armed')).toBe('0')
  })

  it('fara prag, nu exista frana', async () => {
    const ledger = fakeLedger()
    ledger.kvSet('nav.first', '100000000000')
    const args = brakeArgs({ ledger, job: jobCfg({ maxDrawdownBps: null }), client: clientFor({ usdgBal: 1n }) })
    expect(await drawdownBrake(args as never)).toBeNull()
  })

  it('frana trasa opreste descoperirea, oricat de tare ar striga semnalul', async () => {
    const dir = join(tmpdir(), `trader-brake3-${process.pid}`)
    const ledger = fakeLedger()
    ledger.kvSet('nav.first', '100000000000')
    const items = await trader.discover(
      discoverInput(clientFor({ usdgBal: 600_000_000n }), jobCfg(), {
        ledger,
        cfg: cfg({ execution: { killSwitchFile: join(dir, 'STOP-test') } })
      })
    )
    expect(items).toHaveLength(0)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('trader: minimul strans din simulare', () => {
  it('ridica minimul sub umplerea simulata, si scrie in registru si podeaua de oracol', async () => {
    /* pool-ul da 5.1 NVDA, podeaua de oracol e 4.975: minimul urca la 5.1 - 50bps */
    const items = await trader.discover(discoverInput(clientFor({ usdgBal: 1_000_000_000n, v4Out: 5_100_000_000_000_000_000n }), jobCfg()))
    expect(items).toHaveLength(1)
    const m = items[0]!.meta
    expect(m.oracleFloor).toBe('4975000000000000000')
    expect(m.minAmountOut).toBe('5074500000000000000')
    expect(m.simulatedOut).toBe('5100000000000000000')
    /* costul scade odata cu minimul strans: pierdem mai putin fata de oracol */
    expect(BigInt(items[0]!.meta.maxLossUsd8)).toBeLessThan(500_000_000n)
  })

  it('cand pool-ul da fix cat podeaua, minimul ramane podeaua', async () => {
    const items = await trader.discover(discoverInput(clientFor({ usdgBal: 1_000_000_000n, v4Out: 4_975_000_000_000_000_000n }), jobCfg()))
    expect(items[0]!.meta.minAmountOut).toBe('4975000000000000000')
  })

  it('cu strangerea oprita, minimul e exact podeaua de oracol', async () => {
    const items = await trader.discover(
      discoverInput(clientFor({ usdgBal: 1_000_000_000n, v4Out: 6_000_000_000_000_000_000n }), jobCfg({ tightenBps: 0 }))
    )
    expect(items[0]!.meta.minAmountOut).toBe('4975000000000000000')
  })
})
