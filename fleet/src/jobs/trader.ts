/**
 * TRADER: mainile flotei pe Financial NFA. Roteste vault-ul unui NFT intre
 * actiuni tokenizate, dupa ACELEASI semnale ca backtest-ul.
 *
 * E singurul agent din flota care lucreaza pe contractele NOASTRE, nu pe ale
 * altora. Asta schimba doua lucruri:
 *  - intrebarea de la pasul zero nu e "poate un strain?", ci "putem NOI?":
 *    executeTrade e rezervata cheii de agent a NFT-ului, si un strain respins
 *    e semn ca protocolul e in regula (aceeasi distinctie ca la Lobbyist).
 *  - frana adevarata sta IN contract (allowlist, plafoane USD, slippage vs
 *    oracol, cooldown, pauza). Ce adauga flota e ce contractul nu poate sti:
 *    registrul cu fiecare decizie, bugetele zilnice ale operatorului, cainele
 *    de paza, si refuzul implicit cand o cifra nu poate fi masurata.
 *
 * CREIERUL NU STA AICI. Repo-ul asta e public; strategiile sunt exact partea
 * care nu are voie sa fie. Semnalele, datele si encodarea traiesc in repo-ul
 * privat financial-nfa si se incarca la pornire de pe disc (job.brain.dir,
 * montat in container, trecut prin .gitignore). Fara creier, agentul sta si
 * spune de ce; nu exista o copie "de rezerva" care sa poata devia de la
 * backtest sau sa scurga alpha in git.
 *
 * Un agent = UN NFT. Cheia fiecarui NFT sta in procesul lui, deci un leak
 * compromite un vault, nu flota. Al doilea NFT inseamna inca o configurare,
 * nu cod nou.
 *
 * Costul unei rotatii nu e marfa (marfa ramane in vault, schimbata pe alta),
 * e ALUNECAREA: cat avem voie sa pierdem fata de pretul de oracol, adica
 * exact marja pe care o tolereaza minAmountOut. Aia se masoara inainte, se
 * scrie in registru si se aduna in bugetul zilnic de cheltuiala.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { formatEther, formatUnits, parseAbi, type Address, type Hex, type PublicClient } from 'viem'
import { abiOf, zAddress, zBig, type Config } from '../core/config.js'
import type { Abi } from 'viem'
import { batchRead } from '../core/chain/batch.js'
import { log } from '../core/log.js'
import {
  STRANGER,
  type DiscoverInput,
  type Job,
  type JobCheck,
  type ReportLine,
  type Target,
  type WorkItem
} from '../core/work.js'

const ZERO = '0x0000000000000000000000000000000000000000'

// ---- formele creierului: doar TIPURILE stau aici, implementarea e privata

export type Bar = { t: number; c: number }
export type Series = Record<string, Bar[]>
export interface Signal {
  id: number
  name: string
  warmup: number
  target(s: Series, i: number, current: string): string
}
export type PoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }
export type TradeIntent = {
  tokenIn: Address
  tokenOut: Address
  amountIn: bigint
  minAmountOut: bigint
  poolKey: PoolKey
  hookData: Hex
}

export type AggTrade = {
  tokenIn: Address
  tokenOut: Address
  amountIn: bigint
  minAmountOut: bigint
  aggregator: Address
  swapData: Hex
}
export type SwapQuote = { aggregator: Address; swapData: Hex; minAmountOut: bigint }

export interface Brain {
  CASH: string
  SIGNALS: Record<number, Signal>
  ALL_SYMBOLS: string[]
  ROTOR_UNI: string[]
  OCTANE: string[]
  loadSeries(symbols: string[], range: string, cacheDir: string): Promise<Series>
  encodeTrade(t: TradeIntent): Hex
  poolKey(a: Address, b: Address, fee: number, tickSpacing: number, hooks: Address): PoolKey
  /** calea prin agregator: OPTIONALA, un creier mai vechi merge fara ea (doar v4) */
  encodeAggregatorTrade?(t: AggTrade): Hex
  fetchAggregatorSwap?(
    chainId: number,
    from: Address,
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint,
    slippagePct: number
  ): Promise<SwapQuote>
}

const brains = new Map<string, Brain>()

/**
 * Incarca creierul din financial-nfa: intai build-ul (dist/, singurul care
 * merge sub node simplu, deci in container), apoi sursa TS (tsx, dezvoltare).
 *
 * Verificam fiecare bucata pe nume: un creier incomplet care ar crapa abia la
 * prima rotatie e mai rau decat unul refuzat la pornire.
 */
export async function loadBrain(dir: string): Promise<Brain> {
  const cached = brains.get(dir)
  if (cached) return cached
  const root = resolve(dir)
  const layouts = [
    {
      signals: 'dist/src/backtest/signals.js',
      data: 'dist/src/backtest/data.js',
      trade: 'dist/src/trade.js',
      aggregator: 'dist/src/aggregator.js'
    },
    { signals: 'src/backtest/signals.ts', data: 'src/backtest/data.ts', trade: 'src/trade.ts', aggregator: 'src/aggregator.ts' }
  ]
  for (const l of layouts) {
    if (!existsSync(join(root, l.signals))) continue
    const [sig, dat, trd] = await Promise.all([
      import(pathToFileURL(join(root, l.signals)).href),
      import(pathToFileURL(join(root, l.data)).href),
      import(pathToFileURL(join(root, l.trade)).href)
    ])
    /* agregatorul e o bucata mai noua de creier: lipsa lui nu strica nimic, doar
       lasa traderul pe calea v4 */
    const agg = existsSync(join(root, l.aggregator)) ? await import(pathToFileURL(join(root, l.aggregator)).href) : null
    const brain: Brain = {
      CASH: sig.CASH,
      SIGNALS: sig.SIGNALS,
      ALL_SYMBOLS: sig.ALL_SYMBOLS,
      ROTOR_UNI: sig.ROTOR_UNI,
      OCTANE: sig.OCTANE,
      loadSeries: dat.loadSeries,
      encodeTrade: trd.encodeTrade,
      poolKey: trd.poolKey,
      ...(agg ? { encodeAggregatorTrade: agg.encodeAggregatorTrade, fetchAggregatorSwap: agg.fetch1inchSwap } : {})
    }
    const missing = (Object.keys(brain) as Array<keyof Brain>).filter((k) => brain[k] === undefined)
    if (missing.length > 0) {
      throw new Error(`the brain at ${root} is missing ${missing.join(', ')}: wrong or outdated financial-nfa checkout`)
    }
    brains.set(dir, brain)
    return brain
  }
  throw new Error(
    `no brain at ${root}: expected dist/src/backtest/signals.js (built) or src/backtest/signals.ts (source). ` +
      `The strategies live in the PRIVATE financial-nfa repo; mount it there, never commit it here.`
  )
}

/** doar pentru teste: un creier deja construit, fara disc */
export function plantBrain(dir: string, brain: Brain): void {
  brains.set(dir, brain)
}

export const TraderSchema = z.object({
  /** a single NFT operated by this instance (the original mode; still fully supported) */
  tokenId: zBig.optional(),
  /**
   * Or a whole fleet in ONE process. 'all' follows the collection's nextId, so
   * freshly minted agents are picked up on the next run with zero operator
   * work: the mint installs the bot key on chain, and this scan finds it. A
   * {from,to} range pins an explicit window instead.
   *
   * One process for N vaults works because the per-vault state is read in
   * batched multicalls and the heavy things (brain, price series, oracle
   * prices, policies) are shared per run, not per token.
   */
  tokenIds: z.union([z.literal('all'), z.object({ from: zBig, to: zBig })]).optional(),
  /** runaway backstop for 'all': never scan more tokens than this */
  maxTokens: z.number().int().min(1).max(5000).default(1000),
  /**
   * Vaults worth less than this (USD, 8 decimals) are treated as empty. Most
   * minted vaults hold nothing until rewards flow; scanning is cheap but
   * signing dust rotations is not, and the on-chain guard would refuse a
   * zero-notional trade anyway.
   */
  minVaultUsd8: zBig.default(10_000_000n),
  /** StrategyRegistry: politici, rute canonice de pool, circuit-breaker global */
  registry: zAddress,
  /** de unde se incarca creierul privat */
  brain: z.object({ dir: z.string().default('./brain') }).default({}),
  /**
   * Caile de executie: 'v4' = doar pool-ul canonic; 'aggregator' = doar prin
   * agregator; 'best' = amandoua, simulate din contul agentului, castiga
   * incasarea mai mare. Calea de agregator cere ONEINCH_API_KEY in mediu,
   * bucata de agregator in creier si adresa aprobata in allowlist-ul on-chain;
   * fara oricare din ele, traderul ramane pe v4 si spune de ce.
   */
  execution: z.enum(['v4', 'aggregator', 'best']).default('v4'),
  tokens: z.record(
    z.string(),
    z.object({
      address: zAddress,
      decimals: z.number().int().min(0).max(36),
      /** feed-ul Chainlink al actiunii; adresa zero = nu exista (ex. cash-ul) */
      feed: zAddress.nullable().default(null)
    })
  ),
  /**
   * Cum se pun in ETH sumele care sunt in USD.
   *
   * Plafoanele flotei (maxCostPerJobWei, dailySpendBudgetWei) sunt in wei, dar
   * alunecarea unei rotatii se masoara in USD din oracole. Fara un curs, costul
   * nu poate fi masurat, si un cost nemasurat se refuza implicit — de aia lipsa
   * ambelor surse e semnalata la doctor, nu descoperita dupa o luna in jurnal.
   */
  eth: z
    .object({
      /** feed Chainlink ETH/USD, daca exista pe lant; are intaietate */
      feed: zAddress.nullable().default(null),
      /** curs static (USD cu 8 zecimale), plasa de siguranta cand nu e feed */
      usd8: zBig.default(0n)
    })
    .default({}),
  /**
   * Frana de pierdere: sub cat la suta din valoarea de referinta agentul nu
   * mai roteste si trage singur siguranta.
   *
   * Plafonul zilnic marginește cat notional trece intr-o zi, dar NU cat s-a
   * pierdut cumulat in saptamani (M-2 din auditul independent). Un bot care
   * face dus-intors platind alunecare la fiecare picior poate sangera incet,
   * fara sa incalce nimic pe lant, si nimic nu il opreste.
   *
   * Cand se declanseaza: nu se mai propune nicio rotatie si se scrie siguranta
   * o singura data (nu se lupta cu operatorul care o ridica inapoi), iar
   * raportul o spune cu rosu, deci suna si telefonul. Repornirea e o decizie de
   * om: ori valoarea revine peste linie, ori se schimba pragul aici.
   *
   * Referinta e `nav.first` din registru, adica prima valoare vazuta — deci la
   * ORICE alimentare a seifului reperul trebuie sters, altfel depunerea apare
   * ca profit si frana se muta fara sa vrei. null = fara frana.
   */
  maxDrawdownBps: z.number().int().min(0).max(10_000).nullable().default(3000),
  /**
   * Cu cat sub umplerea SIMULATA acceptam sa iasa tranzactia.
   *
   * Podeaua de oracol (ce cere guard-ul) e o podea, nu o tinta: un pool care
   * ar da mai mult are voie sa umple exact la podea si diferenta ramane la el
   * (M-3). Simulam din contul agentului, aflam cat ar da de fapt, si ridicam
   * minimul cat de sus se poate fara sa devina fragil. Ramane mereu cel putin
   * podeaua de oracol: mai jos de ea contractul refuza oricum.
   */
  tightenBps: z.number().int().min(0).max(5000).default(50),
  history: z.object({
    range: z.string().default('1y'),
    /**
     * Cache-ul de preturi e datat pe zi (UTC). Lectia din financial-nfa: un
     * cache care nu expira niciodata inseamna un bot care tranzactioneaza la
     * nesfarsit pe bare inghetate din ziua primului fetch.
     */
    cacheDir: z.string().default('./data/prices-live')
  }).default({})
}).refine((j) => j.tokenId !== undefined || j.tokenIds !== undefined, {
  message: 'set job.tokenId (one agent) or job.tokenIds (a fleet)'
})

export type TraderJob = z.infer<typeof TraderSchema>

const nftAbi = parseAbi([
  'function nextId() view returns (uint256)',
  'function strategyOf(uint256 id) view returns (uint16)',
  'function accountOf(uint256 id) view returns (address)'
])
const accountAbi = parseAbi([
  'function agentSigner() view returns (address)',
  'function paused() view returns (bool)'
])
const registryAbi = parseAbi([
  'function policyOf(uint16 id) view returns ((uint256 maxTradeUsd, uint256 maxDailyUsd, uint32 maxSlippageBps, uint32 cooldownSec, uint32 maxStaleSec, bool exists))',
  'function routeOf(address a, address b) view returns ((uint24 fee, int24 tickSpacing, address hooks, bool exists))',
  'function paused() view returns (bool)',
  'function isAllowedAggregator(address a) view returns (bool)'
])

/* ambele apeluri ale contului, ca target-ul sa poata encoda oricare dupa meta.fn */
const executeAbi = parseAbi([
  'function executeTrade(bytes params) returns (uint256 amountOut)',
  'function executeAggregatorTrade(bytes params) returns (uint256 amountOut)'
])
const feedAbi = parseAbi([
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)',
  'function decimals() view returns (uint8)'
])
const erc20Abi = parseAbi(['function balanceOf(address a) view returns (uint256)'])

interface NftState {
  account: Address
  strategyId: number
  agentSigner: Address
  paused: boolean
  globallyPaused: boolean
}

async function nftState(client: PublicClient, cfg: Config, job: TraderJob, tokenId: bigint): Promise<NftState> {
  const [strategyId, account] = await Promise.all([
    client.readContract({ address: cfg.target.address, abi: nftAbi, functionName: 'strategyOf', args: [tokenId] }),
    client.readContract({ address: cfg.target.address, abi: nftAbi, functionName: 'accountOf', args: [tokenId] })
  ])
  const [agentSigner, paused, globallyPaused] = await Promise.all([
    client.readContract({ address: account, abi: accountAbi, functionName: 'agentSigner' }),
    client.readContract({ address: account, abi: accountAbi, functionName: 'paused' }),
    client.readContract({ address: job.registry, abi: registryAbi, functionName: 'paused' })
  ])
  return { account, strategyId: Number(strategyId), agentSigner, paused, globallyPaused }
}

/**
 * Which tokenIds this process manages. 'all' follows the collection's nextId,
 * so a freshly minted agent joins the fleet on the very next run without
 * anyone touching a config file.
 */
export async function resolveTokenIds(client: PublicClient, cfg: Config, job: TraderJob): Promise<bigint[]> {
  if (job.tokenId !== undefined) return [job.tokenId]
  if (job.tokenIds && job.tokenIds !== 'all') {
    const out: bigint[] = []
    for (let i = job.tokenIds.from; i <= job.tokenIds.to && out.length < job.maxTokens; i++) out.push(i)
    return out
  }
  const nextId = await client.readContract({ address: cfg.target.address, abi: nftAbi, functionName: 'nextId' })
  const count = Math.min(Number(nextId) - 1, job.maxTokens)
  return Array.from({ length: Math.max(count, 0) }, (_, i) => BigInt(i + 1))
}

/** one vault's prefetched state: identity, keys, and every balance in one place */
export interface VaultScan {
  id: bigint
  strategyId: number
  account: Address
  agentSigner: Address | null
  paused: boolean
  balances: Map<string, bigint>
}

/**
 * Reads the whole fleet's state in three batched passes instead of five reads
 * per token: identities, then keys, then balances. With 700 tokens and eight
 * assets that is ~7000 reads collapsed into ~25 RPC round trips. Everything
 * downstream (discover, report, doctor) consumes this one shape.
 */
export async function scanVaults(client: PublicClient, cfg: Config, job: TraderJob, ids: bigint[]): Promise<VaultScan[]> {
  const mc = cfg.network.multicall3
  const base = await batchRead(
    client,
    mc,
    ids.flatMap((id) => [
      { address: cfg.target.address, abi: nftAbi as never, functionName: 'strategyOf', args: [id] },
      { address: cfg.target.address, abi: nftAbi as never, functionName: 'accountOf', args: [id] }
    ])
  )
  const scans: VaultScan[] = []
  ids.forEach((id, i) => {
    const account = base[i * 2 + 1] as Address | null
    if (!account) return
    scans.push({
      id,
      strategyId: Number((base[i * 2] as number | bigint | null) ?? 0),
      account,
      agentSigner: null,
      paused: false,
      balances: new Map()
    })
  })

  const keys = await batchRead(
    client,
    mc,
    scans.flatMap((v) => [
      { address: v.account, abi: accountAbi as never, functionName: 'agentSigner' },
      { address: v.account, abi: accountAbi as never, functionName: 'paused' }
    ])
  )
  scans.forEach((v, i) => {
    v.agentSigner = (keys[i * 2] as Address | null) ?? null
    v.paused = Boolean(keys[i * 2 + 1])
  })

  const syms = Object.keys(job.tokens)
  const bals = await batchRead(
    client,
    mc,
    scans.flatMap((v) =>
      syms.map((sym) => ({
        address: job.tokens[sym]!.address,
        abi: erc20Abi as never,
        functionName: 'balanceOf',
        args: [v.account]
      }))
    )
  )
  scans.forEach((v, i) => {
    syms.forEach((sym, j) => v.balances.set(sym, (bals[i * syms.length + j] as bigint | null) ?? 0n))
  })
  return scans
}

function hasFeed(tok: { feed: Address | null } | undefined): tok is { feed: Address } {
  return !!tok?.feed && tok.feed.toLowerCase() !== ZERO
}

interface Price {
  usd8: bigint
  stale: boolean
}

/**
 * Pretul unui simbol in USD cu 8 zecimale, normalizat de la zecimalele feed-ului.
 *
 * Cash-ul fara feed valoreaza $1 si nu e niciodata vechi. Fara regula asta,
 * vault-ul proaspat mintat (100% cash) nu are pret pentru piciorul de intrare
 * si prima rotatie nu pleaca NICIODATA — exact bug-ul cu care a trait runner-ul
 * vechi din financial-nfa: activul dominant sarea peste USDG ca "fara feed" si
 * botul tinea cash-ul la nesfarsit, cu semnal de cumparare cu tot.
 */
async function priceOf(
  client: PublicClient,
  job: TraderJob,
  cash: string,
  sym: string,
  maxStaleSec: number,
  nowSec: bigint
): Promise<Price> {
  const tok = job.tokens[sym]
  if (!hasFeed(tok)) {
    if (sym === cash) return { usd8: 100_000_000n, stale: false }
    throw new Error(`no feed for ${sym}`)
  }
  const [round, decimals] = await Promise.all([
    client.readContract({ address: tok.feed, abi: feedAbi, functionName: 'latestRoundData' }),
    client.readContract({ address: tok.feed, abi: feedAbi, functionName: 'decimals' })
  ])
  const answer = round[1]
  const updatedAt = round[3]
  const usd8 =
    decimals === 8 ? answer : decimals < 8 ? answer * 10n ** BigInt(8 - decimals) : answer / 10n ** BigInt(decimals - 8)
  return { usd8, stale: nowSec > updatedAt + BigInt(maxStaleSec) }
}

/** valoarea in USD (8 zecimale) a unei sume de token */
function usdValue(amount: bigint, tokenDecimals: number, usd8: bigint): bigint {
  return (amount * usd8) / 10n ** BigInt(tokenDecimals)
}

/** cursul ETH/USD (8 zecimale) pentru contabilitate; 0 = nu avem de unde */
async function ethUsd8(client: PublicClient, job: TraderJob): Promise<bigint> {
  if (job.eth.feed && job.eth.feed.toLowerCase() !== ZERO) {
    try {
      const [round, decimals] = await Promise.all([
        client.readContract({ address: job.eth.feed, abi: feedAbi, functionName: 'latestRoundData' }),
        client.readContract({ address: job.eth.feed, abi: feedAbi, functionName: 'decimals' })
      ])
      const answer = round[1]
      return decimals === 8
        ? answer
        : decimals < 8
          ? answer * 10n ** BigInt(8 - decimals)
          : answer / 10n ** BigInt(decimals - 8)
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'ETH/USD feed unreadable, falling back to the static rate')
    }
  }
  return job.eth.usd8
}

/** USD (8 zecimale) -> wei nativi, la cursul dat; 0 cand nu exista curs */
function usdToWei(usd8: bigint, rate8: bigint): bigint {
  if (rate8 <= 0n) return 0n
  return (usd8 * 10n ** 18n) / rate8
}

// ---- darea de seama: cifrele care se citesc, nu se calculeaza pe lant

/** un mic registru de valori, cat ii trebuie raportului ca sa isi tina reperele */
export interface NavStore {
  kvGet(key: string): string | null
  kvSet(key: string, value: string): void
}

/** $ cu doua zecimale dintr-o suma in USD cu 8 zecimale */
export function usd(usd8: bigint): string {
  const neg = usd8 < 0n
  const v = neg ? -usd8 : usd8
  const whole = v / 100_000_000n
  const cents = ((v % 100_000_000n) * 100n) / 100_000_000n
  return `${neg ? '-' : ''}$${whole}.${String(cents).padStart(2, '0')}`
}

/**
 * Cat s-a miscat, in procente, de la o valoare la alta; null cand nu exista baza.
 *
 * Impartirea pe intregi taie in jos, si taiatul in jos MINTE consecvent in
 * aceeasi directie: o crestere de exact 10% aparea ca 9.99%. Se rotunjeste,
 * departe de zero, ca sa nu se piarda nici castigul, nici pierderea.
 */
export function movePct(from: bigint, to: bigint): number | null {
  if (from <= 0n) return null
  const scaled = (to - from) * 10_000n
  const half = from / 2n
  return Number(scaled >= 0n ? (scaled + half) / from : (scaled - half) / from) / 100
}

export function signed(pct: number | null): string {
  if (pct === null) return 'n/a'
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
}

/**
 * Cate rotatii mai plateste gazul din portofel, la costul mediu de pana acum.
 *
 * Fara istoric nu se ghiceste: "nu stiu" e un raspuns, o medie inventata nu.
 */
export function tradesLeft(balanceWei: bigint, gasWei: bigint, done: number): number | null {
  if (done <= 0 || gasWei <= 0n) return null
  const avg = gasWei / BigInt(done)
  if (avg <= 0n) return null
  return Number(balanceWei / avg)
}

/**
 * Reperele fata de care se masoara valoarea: prima valoare vazuta vreodata si
 * prima valoare a zilei de azi.
 *
 * ATENTIE la ce inseamna "de la start": e valoarea de la PRIMA citire, nu
 * capitalul depus. Cand se mai adauga bani in seif, reperul trebuie sters
 * (kv `nav.first`), altfel alimentarea apare ca profit. Un reper care minte in
 * favoarea noastra e mai rau decat niciun reper.
 */
export function navMarks(store: NavStore, navUsd8: bigint, day: string): { first: bigint; dayOpen: bigint } {
  const firstRaw = store.kvGet('nav.first')
  const first = firstRaw === null ? navUsd8 : BigInt(firstRaw)
  if (firstRaw === null) store.kvSet('nav.first', navUsd8.toString())
  const dayRaw = store.kvGet(`nav.day.${day}`)
  const dayOpen = dayRaw === null ? navUsd8 : BigInt(dayRaw)
  if (dayRaw === null) store.kvSet(`nav.day.${day}`, navUsd8.toString())
  store.kvSet('nav.last', navUsd8.toString())
  return { first, dayOpen }
}

/**
 * Ziua LOCALA, ca "azi" sa fie aceeasi zi cu a omului care citeste raportul
 * dimineata. Cheia rotatiei ramane pe UTC: acolo conteaza sa fie stabila intre
 * procese, nu sa semene cu ceasul de pe perete.
 */
export function localDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * Tot ce tine seiful, pretuit: valoarea totala, ce e destul de mare cat sa se
 * cheme pozitie, si daca vreun pret e vechi.
 *
 * Aceeasi socoteala hraneste si raportul, si frana de pierdere. Daca ar fi
 * doua socoteli, s-ar putea contrazice exact in ziua in care conteaza.
 */
export async function vaultNav(
  client: PublicClient,
  job: TraderJob,
  cash: string,
  account: Address,
  maxStaleSec: number,
  nowSec: bigint
): Promise<{ navUsd8: bigint; held: string[]; staleSym: string | null }> {
  let navUsd8 = 0n
  const held: string[] = []
  let staleSym: string | null = null
  for (const sym of Object.keys(job.tokens)) {
    const tok = job.tokens[sym]!
    if (!hasFeed(tok) && sym !== cash) continue
    const bal = await client.readContract({
      address: tok.address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [account]
    })
    if (bal === 0n) continue
    let p: Price
    try {
      p = await priceOf(client, job, cash, sym, maxStaleSec, nowSec)
    } catch {
      continue
    }
    const value = usdValue(bal, tok.decimals, p.usd8)
    /* sub un cent e praf ramas dintr-o rotatie, nu pozitie: intra in valoare,
       nu in lista */
    navUsd8 += value
    if (value >= 1_000_000n) {
      held.push(`${Number(formatUnits(bal, tok.decimals)).toFixed(6)} ${sym} (${usd(value)})`)
      if (p.stale) staleSym = sym
    }
  }
  return { navUsd8, held, staleSym }
}

/**
 * Frana de pierdere: cand valoarea seifului cade sub linie, agentul nu mai
 * roteste si trage singur siguranta.
 *
 * Ce acopera si ce nu: plafonul zilnic marginește notionalul pe zi, nu
 * pierderea cumulata pe saptamani. Un bot care se roteste des si plateste
 * alunecare la fiecare picior poate sangera incet, fara sa incalce nimic pe
 * lant (M-2 din auditul independent). Asta e franarea aia.
 *
 * Siguranta se scrie O SINGURA DATA per declansare: daca omul o ridica inapoi
 * de pe telefon, agentul nu se lupta cu el. Rotatiile raman insa oprite cat
 * timp valoarea e sub linie — repornirea adevarata e o decizie de om, nu o
 * apasare de buton: ori revine valoarea, ori se schimba pragul.
 */
export function applyBrake(args: {
  cfg: Config
  job: TraderJob
  ledger: NavStore
  navUsd8: bigint
  tag: string
}): string | null {
  const { cfg, job, ledger, navUsd8, tag } = args
  const limit = job.maxDrawdownBps
  if (limit === null) return null

  const { first } = navMarks(ledger, navUsd8, localDay())
  if (first <= 0n) return null

  const dropBps = navUsd8 >= first ? 0 : Number(((first - navUsd8) * 10_000n) / first)
  if (dropBps < limit) {
    if (ledger.kvGet('brake.armed') === '1') {
      /* revenit peste linie: frana se rearmeaza pentru data viitoare, altfel ar
         fi o frana de o singura folosinta */
      ledger.kvSet('brake.armed', '0')
      log.warn(`${tag} value back above the drawdown line, brake re-armed`)
    }
    return null
  }

  const reason = `value ${usd(navUsd8)} is ${(dropBps / 100).toFixed(2)}% below the ${usd(first)} mark, limit ${(limit / 100).toFixed(2)}%`
  if (ledger.kvGet('brake.armed') !== '1') {
    ledger.kvSet('brake.armed', '1')
    ledger.kvSet('brake.reason', reason)
    ledger.kvSet('brake.at', String(Math.floor(Date.now() / 1000)))
    try {
      mkdirSync(dirname(cfg.execution.killSwitchFile), { recursive: true })
      writeFileSync(cfg.execution.killSwitchFile, `drawdown brake: ${reason}\n`)
    } catch (e) {
      log.error({ err: (e as Error).message }, `${tag} could not write the kill switch for the drawdown brake`)
    }
    log.fatal({ reason }, `${tag} DRAWDOWN BRAKE: standing down`)
  }
  return reason
}

/** the single-vault wrapper: reads the NAV, then applies the shared brake */
export async function drawdownBrake(args: {
  client: PublicClient
  cfg: Config
  job: TraderJob
  ledger: NavStore
  cash: string
  account: Address
  maxStaleSec: number
  nowSec: bigint
  tag: string
}): Promise<string | null> {
  const { client, cfg, job, ledger, cash, account, maxStaleSec, nowSec, tag } = args
  if (job.maxDrawdownBps === null) return null
  const { navUsd8 } = await vaultNav(client, job, cash, account, maxStaleSec, nowSec)
  return applyBrake({ cfg, job, ledger, navUsd8, tag })
}

function ago(sec: number): string {
  if (sec < 90) return 'just now'
  if (sec < 5400) return `${Math.round(sec / 60)}m ago`
  if (sec < 172_800) return `${Math.round(sec / 3600)}h ago`
  return `${Math.round(sec / 86_400)}d ago`
}

/** in ce simboluri poate ateriza strategia; portile (SPY/QQQ pe post de regim) nu apar aici */
export function tradableTargets(strategyId: number, brain: Brain): string[] {
  switch (strategyId) {
    case 1:
      return ['NVDA', 'TSLA']
    case 3:
    case 4:
      return ['SPY']
    case 6:
    case 8:
      return [...brain.ROTOR_UNI]
    case 7:
      return [...new Set([...brain.ROTOR_UNI, ...brain.OCTANE])]
    default:
      return []
  }
}

/** istoricul zilei, din cache-ul datat; expus separat ca doctor sa il poata proba */
export async function seriesOfToday(job: TraderJob, brain: Brain): Promise<{ series: Series; last: number }> {
  const day = new Date().toISOString().slice(0, 10)
  const series = await brain.loadSeries(brain.ALL_SYMBOLS, job.history.range, `${job.history.cacheDir}/${day}`)
  const last = Math.min(...Object.values(series).map((b) => b.length)) - 1
  return { series, last }
}

export const trader: Job<TraderJob> = {
  kind: 'trader',
  /** executeTrade e a cheii de agent; un strain respins e protocolul functionand */
  actsOnOwnPosition: true,

  parse(raw) {
    const p = TraderSchema.safeParse(raw ?? {})
    if (!p.success) {
      const lines = p.error.issues.map((i) => `  job.${i.path.join('.') || '(root)'}: ${i.message}`)
      throw new Error(`invalid trader job config:\n${lines.join('\n')}`)
    }
    return p.data
  },

  required(cfg, job) {
    return [
      { what: 'AgentNFT collection', address: cfg.target.address },
      { what: 'strategy registry', address: job.registry }
    ]
  },

  /**
   * Tinta e contul 6551 al NFT-ului, aflat abia la descoperire; pe bucata vine
   * din meta. Fara bucata (probele generice) ramane colectia din configurare.
   */
  target(cfg, job, item?): Target {
    const errors = cfg.target.errorSignatures.flatMap(
      (e) => abiOf(e, 'target.errorSignatures') as unknown as unknown[]
    )
    const abi = [...(executeAbi as unknown as unknown[]), ...errors] as Abi
    const address = (item?.meta.account as Address | undefined) ?? cfg.target.address
    const functionName = (item?.meta.fn as 'executeTrade' | 'executeAggregatorTrade' | undefined) ?? 'executeTrade'
    return { address, abi, functionName }
  },

  async authority(client, cfg, job) {
    try {
      const ids = await resolveTokenIds(client, cfg, job)
      if (ids.length === 0) return null
      const s = await nftState(client, cfg, job, ids[0]!)
      return s.agentSigner
    } catch {
      return null
    }
  },

  async discover({ client, cfg, job, ledger, from }): Promise<WorkItem[]> {
    let brain: Brain
    try {
      brain = await loadBrain(job.brain.dir)
    } catch (e) {
      /* no brain: stand aside and say why instead of crash-looping, the same
         philosophy as waiting for addresses */
      log.error({ err: (e as Error).message }, 'no brain, standing aside')
      return []
    }
    const cash = brain.CASH
    if (!job.tokens[cash]) {
      log.error(`the cash token ${cash} is missing from job.tokens, cannot value any vault`)
      return []
    }

    const ids = await resolveTokenIds(client, cfg, job)
    if (ids.length === 0) {
      log.info('no tokens minted yet, nothing to manage')
      return []
    }

    /* one switch for the whole fleet: read once, not once per token */
    const globallyPaused = await client.readContract({ address: job.registry, abi: registryAbi, functionName: 'paused' })
    if (globallyPaused) {
      log.warn('the registry is globally paused, every vault stands aside')
      return []
    }

    const scans = await scanVaults(client, cfg, job, ids)
    const nowSec = (await client.getBlock()).timestamp
    const syms = Object.keys(job.tokens)

    /* shared per RUN, not per token: 700 vaults must not mean 700 oracle reads,
       700 policy reads and 700 price-series loads. One of each, cached. */
    const priceCache = new Map<string, Price>()
    const getPrice = async (sym: string, maxStaleSec: number): Promise<Price> => {
      const k = `${sym}:${maxStaleSec}`
      const hit = priceCache.get(k)
      if (hit) return hit
      const price = await priceOf(client, job, cash, sym, maxStaleSec, nowSec)
      priceCache.set(k, price)
      return price
    }
    type Policy = {
      maxTradeUsd: bigint
      maxDailyUsd: bigint
      maxSlippageBps: number
      cooldownSec: number
      maxStaleSec: number
      exists: boolean
    }
    const policyCache = new Map<number, Policy | null>()
    const getPolicy = async (strategyId: number): Promise<Policy | null> => {
      if (policyCache.has(strategyId)) return policyCache.get(strategyId) ?? null
      let out: Policy | null = null
      try {
        const raw = (await client.readContract({
          address: job.registry,
          abi: registryAbi,
          functionName: 'policyOf',
          args: [strategyId]
        })) as Policy
        out = raw.exists ? raw : null
      } catch (e) {
        log.warn({ strategyId, err: (e as Error).message }, 'policy unreadable')
      }
      policyCache.set(strategyId, out)
      return out
    }
    let seriesCache: { series: Series; last: number } | null = null
    const getSeries = async (): Promise<{ series: Series; last: number }> =>
      (seriesCache ??= await seriesOfToday(job, brain))

    /* the drawdown brake watches the FLEET's total value: one ledger, one line.
       Reward deposits raise the value, never lower it, so the brake can only get
       less sensitive from inflows - the failure mode is a quiet one, not a false
       stop. On any manual top-up, nav.first must still be reset. */
    let fleetNavUsd8 = 0n
    for (const v of scans) {
      for (const sym of syms) {
        const tok = job.tokens[sym]!
        if (!hasFeed(tok) && sym !== cash) continue
        const bal = v.balances.get(sym) ?? 0n
        if (bal === 0n) continue
        try {
          const price = await getPrice(sym, 3600)
          fleetNavUsd8 += usdValue(bal, tok.decimals, price.usd8)
        } catch {
          /* unpriceable symbol: not counted, same rule as the report */
        }
      }
    }
    const braked = applyBrake({ cfg, job, ledger, navUsd8: fleetNavUsd8, tag: `fleet(${scans.length})` })
    if (braked) {
      log.warn(`drawdown brake: ${braked}`)
      return []
    }

    const items: WorkItem[] = []
    const skipped = { foreign: 0, paused: 0, noSignal: 0, empty: 0, hold: 0 }

    for (const v of scans) {
      const tag = `#${v.id}`
      if (!v.agentSigner || v.agentSigner.toLowerCase() !== from.toLowerCase()) {
        /* someone rotated their key away from our bot: their right, our skip */
        skipped.foreign++
        continue
      }
      if (v.paused) {
        skipped.paused++
        continue
      }
      const sig = brain.SIGNALS[v.strategyId]
      if (!sig) {
        skipped.noSignal++
        continue
      }
      const policy = await getPolicy(v.strategyId)
      if (!policy) {
        skipped.noSignal++
        continue
      }
      const { series, last } = await getSeries()
      if (last < sig.warmup) {
        /* below warmup, momentum/MA run on truncated windows: degraded signal, better to stand */
        log.warn({ bars: last + 1, warmup: sig.warmup }, `${tag} not enough price history for ${sig.name}, holding`)
        continue
      }

      /* the dominant asset, from the prefetched balances: vaults hold ONE asset
         at a time (all-in rotations); the rest is dust */
      let current = cash
      let balance = 0n
      let bestUsd = -1n
      let pin: Price = { usd8: 100_000_000n, stale: false }
      for (const sym of syms) {
        const tok = job.tokens[sym]!
        if (!hasFeed(tok) && sym !== cash) continue
        const bal = v.balances.get(sym) ?? 0n
        if (bal === 0n) continue
        const price = await getPrice(sym, policy.maxStaleSec)
        const usdv = usdValue(bal, tok.decimals, price.usd8)
        if (usdv > bestUsd) {
          bestUsd = usdv
          current = sym
          balance = bal
          pin = price
        }
      }
      if (balance === 0n || bestUsd < job.minVaultUsd8) {
        /* most freshly minted vaults hold nothing until rewards flow; dust below
           the floor is not a position, and the on-chain guard would refuse it */
        skipped.empty++
        continue
      }

      const target = sig.target(series, last, current)
      if (target === current) {
        skipped.hold++
        log.info(`${tag} [${sig.name}] hold ${current}`)
        continue
      }
      const tin = job.tokens[current]
      const tout = job.tokens[target]
      if (!tin || !tout || (!hasFeed(tout) && target !== cash)) {
        log.warn(`${tag} [${sig.name}] no token or feed configured for ${current} -> ${target}, holding`)
        continue
      }
      const pout = await getPrice(target, policy.maxStaleSec)
      if (pin.stale || pout.stale) {
        /* the weekend window: the oracle sleeps, the bot stands. The guard would refuse anyway. */
        log.warn(`${tag} [${sig.name}] oracle is stale for ${pin.stale ? current : target}, market is closed`)
        continue
      }

      const inUsd = usdValue(balance, tin.decimals, pin.usd8)
      const fairOut = (inUsd * 10n ** BigInt(tout.decimals)) / pout.usd8
      /* minOut comes from the ORACLE, not from a quote: the guard demands this
         band anyway, so every execution path gets the same floor */
      const minOut = (fairOut * BigInt(10_000 - policy.maxSlippageBps)) / 10_000n

      /* every path knows how to REBUILD itself on a different floor: without
         that, the floor cannot be tightened after simulation shows the real fill */
      type Candidate = {
        via: 'v4' | 'aggregator'
        fn: 'executeTrade' | 'executeAggregatorTrade'
        data: Hex
        build: (min: bigint) => Hex
        simulated?: bigint
      }
      const candidates: Candidate[] = []

      if (job.execution !== 'aggregator') {
        /* the CANONICAL route from the registry: the fee/tickSpacing/hooks of the
           pool with liquidity. A PoolKey built any other way is refused by the guard. */
        const route = await client.readContract({
          address: job.registry,
          abi: registryAbi,
          functionName: 'routeOf',
          args: [tin.address, tout.address]
        })
        if (route.exists) {
          const poolKey = brain.poolKey(tin.address, tout.address, route.fee, route.tickSpacing, route.hooks)
          const build = (min: bigint): Hex =>
            brain.encodeTrade({
              tokenIn: tin.address,
              tokenOut: tout.address,
              amountIn: balance,
              minAmountOut: min,
              poolKey,
              hookData: '0x'
            } satisfies TradeIntent)
          candidates.push({ via: 'v4', fn: 'executeTrade', data: build(minOut), build })
        } else {
          log.warn(`${tag} [${sig.name}] no pool route for ${current}/${target}`)
        }
      }

      if (job.execution !== 'v4') {
        const quoteFn = brain.fetchAggregatorSwap
        const encodeAgg = brain.encodeAggregatorTrade
        if (!quoteFn || !encodeAgg) {
          log.warn(`${tag} execution=${job.execution} but this brain has no aggregator module, staying on v4`)
        } else if (!process.env.ONEINCH_API_KEY) {
          log.warn(`${tag} execution=${job.execution} but ONEINCH_API_KEY is missing, staying on v4`)
        } else {
          try {
            const q = await quoteFn(cfg.network.chainId, v.account, tin.address, tout.address, balance, policy.maxSlippageBps / 100)
            /* the on-chain allowlist decides which router may touch the vault's
               money; a quote to any other router is an alarm, not a path */
            const allowed = await client.readContract({
              address: job.registry,
              abi: registryAbi,
              functionName: 'isAllowedAggregator',
              args: [q.aggregator]
            })
            if (!allowed) {
              log.warn(`${tag} aggregator ${q.aggregator} is not on the on-chain allowlist, skipping that path`)
            } else {
              const build = (min: bigint): Hex =>
                encodeAgg({
                  tokenIn: tin.address,
                  tokenOut: tout.address,
                  amountIn: balance,
                  minAmountOut: min,
                  aggregator: q.aggregator,
                  swapData: q.swapData
                })
              candidates.push({ via: 'aggregator', fn: 'executeAggregatorTrade', data: build(minOut), build })
            }
          } catch (e) {
            log.warn(`${tag} aggregator quote failed: ${(e as Error).message}`)
          }
        }
      }

      if (candidates.length === 0) {
        log.warn(`${tag} [${sig.name}] no execution path for ${current} -> ${target}, holding`)
        continue
      }

      /* BEST EXECUTION: every path is simulated from the agent account (eth_call,
         no signature). The bigger fill wins; a path that reverts is out. Simulating
         even a lone path matters: that number is also the yardstick the floor is
         tightened against. */
      const trySim = async (c: Candidate, data: Hex): Promise<bigint | null> => {
        try {
          const { result } = await client.simulateContract({
            address: v.account,
            abi: executeAbi,
            functionName: c.fn,
            args: [data],
            account: from
          })
          return result as bigint
        } catch (e) {
          log.warn(`${tag} ${c.via} simulation failed: ${(e as Error).message.split('\n')[0]}`)
          return null
        }
      }

      for (const c of candidates) {
        const out = await trySim(c, c.data)
        if (out !== null) c.simulated = out
      }
      const viable = candidates.filter((c) => c.simulated !== undefined)
      if (viable.length === 0) {
        log.warn(`${tag} [${sig.name}] every path reverts in simulation (liquidity or slippage), holding`)
        continue
      }
      let chosen = viable.reduce((a, b) => ((b.simulated ?? 0n) > (a.simulated ?? 0n) ? b : a))
      if (viable.length > 1) {
        log.info(`${tag} best-exec: ${viable.map((c) => `${c.via}=${c.simulated}`).join(' vs ')} -> ${chosen.via}`)
      }

      /* M-3: the oracle floor is a FLOOR, not a target. A pool that would give
         more may fill exactly at the floor and keep the difference. Simulation
         says what the pool really gives, so the floor climbs to just below it -
         kept only if simulation still passes with the tightened floor, because
         prices move between simulation and mining. */
      let finalMinOut = minOut
      if (job.tightenBps > 0 && chosen.simulated !== undefined) {
        const tightened = (chosen.simulated * BigInt(10_000 - job.tightenBps)) / 10_000n
        if (tightened > minOut) {
          const data = chosen.build(tightened)
          const out = await trySim(chosen, data)
          if (out !== null) {
            log.info(
              `${tag} minOut tightened ${minOut} -> ${tightened} (simulated ${chosen.simulated}, ${job.tightenBps}bps below)`
            )
            chosen = { ...chosen, data, simulated: out }
            finalMinOut = tightened
          }
        }
      }

      /* the cost is what we may lose against the oracle: entry value minus the
         minimum we accept out. The goods are not a cost; they come back swapped. */
      const minOutUsd = usdValue(finalMinOut, tout.decimals, pout.usd8)
      const lossUsd8 = inUsd > minOutUsd ? inUsd - minOutUsd : 0n
      const rate8 = await ethUsd8(client, job)
      const day = new Date().toISOString().slice(0, 10)

      items.push({
        key: `rotate:${v.id}:${day}:${current}->${target}`,
        label: `ROTATE ${tag} ${current} -> ${target}`,
        args: [chosen.data],
        /* a rotation's reward is the strategy's alpha; it cannot be read up front */
        rewardWei: 0n,
        rewardMeasured: false,
        stakeWei: usdToWei(inUsd, rate8),
        valueWei: 0n,
        costWei: usdToWei(lossUsd8, rate8),
        costMeasured: rate8 > 0n,
        costToken: null,
        /* the same rotation is never sent twice in one day; tomorrow is a new
           key, hence a new decision */
        once: true,
        meta: {
          account: v.account,
          strategy: sig.name,
          from: current,
          to: target,
          fn: chosen.fn,
          via: chosen.via,
          amountIn: balance.toString(),
          minAmountOut: finalMinOut.toString(),
          /* the oracle floor too, so the ledger shows HOW MUCH was tightened */
          oracleFloor: minOut.toString(),
          simulatedOut: chosen.simulated === undefined ? '' : chosen.simulated.toString(),
          inUsd8: inUsd.toString(),
          maxLossUsd8: lossUsd8.toString(),
          day
        }
      })
    }

    if (items.length === 0 && scans.length > 1) {
      log.info(
        `fleet of ${scans.length}: nothing to rotate ` +
          `(${skipped.hold} holding, ${skipped.empty} empty, ${skipped.foreign} foreign key, ` +
          `${skipped.paused} paused, ${skipped.noSignal} no strategy)`
      )
    }
    return items
  },

  async checks({ client, cfg, job, from }): Promise<JobCheck[]> {
    const checks: JobCheck[] = []

    let brain: Brain | null = null
    try {
      brain = await loadBrain(job.brain.dir)
      checks.push({ name: 'brain', ok: true, detail: `strategies loaded from ${job.brain.dir}` })
    } catch (e) {
      checks.push({ name: 'brain', ok: false, detail: (e as Error).message, fatal: true })
      return checks
    }

    if (!job.tokens[brain.CASH]) {
      checks.push({
        name: 'cash token',
        ok: false,
        detail: `the brain trades against ${brain.CASH} but job.tokens has no entry for it`,
        fatal: true
      })
    }

    let ids: bigint[] = []
    try {
      ids = await resolveTokenIds(client, cfg, job)
    } catch (e) {
      checks.push({
        name: 'collection',
        ok: false,
        detail: `cannot resolve the token list: ${(e as Error).message}`,
        fatal: true
      })
      return checks
    }
    if (ids.length === 0) {
      checks.push({
        name: 'collection',
        ok: true,
        detail: 'no tokens minted yet; the fleet idles until the first mint and picks it up on the next run'
      })
      return checks
    }

    if (ids.length > 1) {
      /* fleet mode: per-token litanies would drown the signal, so the doctor
         answers the fleet-level questions instead */
      const scans = await scanVaults(client, cfg, job, ids)
      const ours = scans.filter((v) => v.agentSigner && v.agentSigner.toLowerCase() === from.toLowerCase())
      const isStranger = from.toLowerCase() === STRANGER.toLowerCase()
      checks.push({
        name: 'operator key is an agent signer',
        ok: ours.length > 0 || isStranger,
        detail: isStranger
          ? `no key loaded; ${scans.length} vault(s) scanned`
          : `${ours.length} of ${scans.length} vault(s) list this key as their agentSigner` +
            (ours.length === 0 ? '. Every executeTrade would revert.' : ''),
        fatal: ours.length === 0 && !isStranger
      })

      const strategies = [...new Set(ours.map((v) => v.strategyId))]
      const tradable = strategies.filter((sid) => !!brain!.SIGNALS[sid])
      checks.push({
        name: 'strategies',
        ok: strategies.length === 0 || tradable.length > 0,
        detail:
          strategies.length === 0
            ? 'no managed vaults yet'
            : `managed vaults run strategy ${strategies.join(', ')}; ` +
              `${tradable.length} of ${strategies.length} have a signal implementation`,
        fatal: strategies.length > 0 && tradable.length === 0
      })

      const warmups = tradable.map((sid) => brain!.SIGNALS[sid]!.warmup)
      if (warmups.length > 0) {
        try {
          const { last } = await seriesOfToday(job, brain)
          const need = Math.max(...warmups)
          checks.push({
            name: 'price history',
            ok: last >= need,
            detail:
              last >= need
                ? `${last + 1} daily bars cached, deepest warmup ${need} covered`
                : `${last + 1} bars is under the ${need} bar warmup: signals would be degraded, so the fleet holds`
          })
        } catch (e) {
          checks.push({ name: 'price history', ok: false, detail: `cannot load daily bars: ${(e as Error).message}` })
        }
      }

      const rate8m = await ethUsd8(client, job)
      checks.push({
        name: 'ETH is priced',
        ok: rate8m > 0n,
        detail:
          rate8m > 0n
            ? `1 ETH = ${rate8m} (usd, 8 decimals) for cost accounting`
            : 'no eth.feed and no eth.usd8: rotation costs cannot be valued, and unmeasured costs are refused',
        fatal: rate8m <= 0n
      })
      if (cfg.policy.dailySpendBudgetWei === null) {
        checks.push({
          name: 'daily spend budget',
          ok: false,
          detail:
            'policy.dailySpendBudgetWei is not set: with a whole fleet rotating there is no ceiling ' +
            'on the slippage burned in a day'
        })
      }
      return checks
    }

    const tokenId = ids[0]!
    let st: NftState | null = null
    try {
      st = await nftState(client, cfg, job, tokenId)
    } catch (e) {
      checks.push({
        name: 'nft state',
        ok: false,
        detail: `cannot read NFT #${tokenId} from the collection: ${(e as Error).message}`,
        fatal: true
      })
      return checks
    }

    const isSigner = st.agentSigner.toLowerCase() === from.toLowerCase()
    checks.push({
      name: 'operator key is the agent signer',
      ok: isSigner,
      detail: isSigner
        ? `${from} matches the on-chain agentSigner of NFT #${tokenId}`
        : `the 6551 account ${st.account} expects ${st.agentSigner}, this process signs as ${from}. ` +
          `Every executeTrade would revert. Set the per-NFT key of this instance.`,
      fatal: !isSigner
    })

    checks.push({
      name: 'account not paused',
      ok: !st.paused,
      detail: st.paused ? 'the owner paused this vault; the agent stands aside until unpaused' : 'live'
    })
    checks.push({
      name: 'global circuit breaker',
      ok: !st.globallyPaused,
      detail: st.globallyPaused ? 'the registry is globally paused, no vault can trade' : 'off'
    })

    const sig = brain.SIGNALS[st.strategyId]
    checks.push({
      name: 'strategy',
      ok: !!sig,
      detail: sig
        ? `#${st.strategyId} ${sig.name}, warmup ${sig.warmup} bars`
        : `strategy ${st.strategyId} has no signal implementation: this vault cannot be traded by the bot`,
      fatal: !sig
    })
    if (sig) {
      try {
        const policy = await client.readContract({
          address: job.registry,
          abi: registryAbi,
          functionName: 'policyOf',
          args: [st.strategyId]
        })
        checks.push({
          name: 'on-chain policy',
          ok: policy.exists,
          detail: policy.exists
            ? `slippage cap ${policy.maxSlippageBps}bps, cooldown ${policy.cooldownSec}s, oracle staleness ${policy.maxStaleSec}s`
            : `no policy registered for strategy ${st.strategyId}: the guard would refuse every trade`,
          fatal: !policy.exists
        })
      } catch (e) {
        checks.push({ name: 'on-chain policy', ok: false, detail: (e as Error).message, fatal: true })
      }

      const missing = tradableTargets(st.strategyId, brain).filter((s) => !hasFeed(job.tokens[s]))
      checks.push({
        name: 'universe tokens',
        ok: missing.length === 0,
        detail:
          missing.length === 0
            ? 'every symbol this strategy can land on has a token and a feed'
            : `${missing.join(', ')} missing token or feed in job.tokens: rotations into them will be skipped, ` +
              `and a skipped leg is a different strategy than the one that was backtested`
      })

      try {
        const { last } = await seriesOfToday(job, brain)
        checks.push({
          name: 'price history',
          ok: last >= sig.warmup,
          detail:
            last >= sig.warmup
              ? `${last + 1} daily bars cached for today, warmup ${sig.warmup} covered`
              : `${last + 1} bars is under the ${sig.warmup} bar warmup: the signal would be degraded, so the agent holds`
        })
      } catch (e) {
        checks.push({ name: 'price history', ok: false, detail: `cannot load daily bars: ${(e as Error).message}` })
      }
    }

    if (job.execution !== 'v4') {
      const hasModule = !!(brain.fetchAggregatorSwap && brain.encodeAggregatorTrade)
      const hasKey = !!process.env.ONEINCH_API_KEY
      checks.push({
        name: 'aggregator path',
        ok: hasModule && hasKey,
        detail: !hasModule
          ? 'execution wants the aggregator but this brain has no aggregator module: rebuild financial-nfa'
          : hasKey
            ? 'brain module present, ONEINCH_API_KEY set. The quoted router must also pass the on-chain allowlist.'
            : 'ONEINCH_API_KEY is missing: quotes cannot be fetched, the trader stays on v4',
        fatal: job.execution === 'aggregator' && (!hasModule || !hasKey)
      })
    }

    const rate8 = await ethUsd8(client, job)
    checks.push({
      name: 'ETH is priced',
      ok: rate8 > 0n,
      detail:
        rate8 > 0n
          ? `1 ETH = ${rate8} (usd, 8 decimals) for cost accounting`
          : 'no eth.feed and no eth.usd8: the slippage cost of a rotation cannot be valued in wei, ' +
            'and an unmeasured cost is refused by default. Set one of them.',
      fatal: rate8 <= 0n
    })

    if (cfg.policy.dailySpendBudgetWei === null) {
      checks.push({
        name: 'daily spend budget',
        ok: false,
        detail:
          'policy.dailySpendBudgetWei is not set: there is no ceiling on the slippage this agent may burn in a day. ' +
          "The on-chain guard caps each trade, but the daily total is the operator's rail."
      })
    }

    return checks
  },

  /**
   * Ce tine seiful, cat valoreaza si cu ce ramane botul.
   *
   * Un bot cu bani in mana tace la fel cand merge perfect si cand e blocat.
   * Monitorul de uptime nu poate face diferenta — el vede un port care
   * raspunde. Randurile de aici o fac: pozitia, valoarea fata de doua repere
   * (azi si de la start) si gazul, transformat din "cati wei" in singura unitate
   * care conteaza, "cate rotatii mai are".
   */
  async report({ client, cfg, job, ledger, from }): Promise<ReportLine[]> {
    let brain: Brain
    try {
      brain = await loadBrain(job.brain.dir)
    } catch (e) {
      return [{ name: 'brain', value: `not loaded: ${(e as Error).message}`, level: 'bad' }]
    }
    const cash = brain.CASH
    const ids = await resolveTokenIds(client, cfg, job)
    if (ids.length === 0) return [{ name: 'fleet', value: 'no tokens minted yet; waiting for the first mint' }]

    if (ids.length > 1) {
      /* fleet mode: one report for the whole book. Per-vault detail belongs in
         the ledger; the daily message answers "what is the money doing". */
      const scans = await scanVaults(client, cfg, job, ids)
      const nowSec = (await client.getBlock()).timestamp
      const syms = Object.keys(job.tokens)
      const ours = scans.filter((v) => from.toLowerCase() === STRANGER.toLowerCase() || (v.agentSigner ?? '').toLowerCase() === from.toLowerCase())

      const priceCache = new Map<string, Price>()
      let navUsd8 = 0n
      let funded = 0
      const bySym = new Map<string, bigint>()
      for (const v of scans) {
        let vaultUsd = 0n
        for (const sym of syms) {
          const tok = job.tokens[sym]!
          if (!hasFeed(tok) && sym !== cash) continue
          const bal = v.balances.get(sym) ?? 0n
          if (bal === 0n) continue
          let price = priceCache.get(sym)
          if (!price) {
            try {
              price = await priceOf(client, job, cash, sym, 3600, nowSec)
              priceCache.set(sym, price)
            } catch {
              continue
            }
          }
          const usdv = usdValue(bal, tok.decimals, price.usd8)
          vaultUsd += usdv
          if (usdv >= 1_000_000n) bySym.set(sym, (bySym.get(sym) ?? 0n) + usdv)
        }
        navUsd8 += vaultUsd
        if (vaultUsd >= 1_000_000n) funded++
      }

      const { first, dayOpen } = navMarks(ledger, navUsd8, localDay())
      const sinceStart = movePct(first, navUsd8)
      const paused = scans.filter((v) => v.paused).length
      const foreign = scans.length - ours.length

      const top = [...bySym.entries()]
        .sort((a, b) => (b[1] > a[1] ? 1 : -1))
        .slice(0, 4)
        .map(([sym, usdv]) => `${sym} ${usd(usdv)}`)

      const lines: ReportLine[] = [
        {
          name: 'fleet',
          value:
            `${ours.length} managed of ${scans.length} minted, ${funded} funded` +
            (foreign > 0 ? `, ${foreign} foreign-key` : '') +
            (paused > 0 ? `, ${paused} paused` : ''),
          level: paused > 0 ? 'warn' : undefined
        },
        {
          name: 'value',
          value: `${usd(navUsd8)} | today ${signed(movePct(dayOpen, navUsd8))} | since start ${signed(sinceStart)}`,
          level: sinceStart !== null && sinceStart <= -20 ? 'warn' : undefined
        },
        { name: 'positions', value: top.length ? top.join(' + ') : 'all vaults empty' }
      ]

      if (job.maxDrawdownBps !== null) {
        const tripped = ledger.kvGet('brake.armed') === '1'
        const dropBps = navUsd8 >= first ? 0 : Number(((first - navUsd8) * 10_000n) / first)
        lines.push({
          name: 'drawdown brake',
          value: tripped
            ? `TRIPPED, no rotations leave: ${ledger.kvGet('brake.reason') ?? 'value below the line'}`
            : `${(dropBps / 100).toFixed(2)}% of the ${(job.maxDrawdownBps / 100).toFixed(2)}% allowance used`,
          level: tripped ? 'bad' : undefined
        })
      }

      if (from.toLowerCase() === STRANGER.toLowerCase()) {
        lines.push({ name: 'gas', value: 'unknown: this process has no operator key' })
      } else {
        const gasWei = await client.getBalance({ address: from })
        const life = ledger.totals(0)
        const left = tradesLeft(gasWei, life.gasWei, life.done)
        lines.push({
          name: 'gas',
          value: `${formatEther(gasWei)} ${cfg.network.nativeSymbol}${left === null ? '' : ` (~${left} rotations)`}`,
          level: left === null ? undefined : left < 5 ? 'bad' : left < 20 ? 'warn' : undefined
        })
      }
      if (cfg.execution.dryRun) {
        lines.push({ name: 'mode', value: 'DRY RUN, nothing is being signed', level: 'warn' })
      }
      const lastWork = ledger.recentEvents(40).find((e) => e.kind === 'work')
      lines.push({
        name: 'last rotation',
        value: lastWork ? `${lastWork.key} ${ago(Math.floor(Date.now() / 1000) - lastWork.at)}` : 'none yet'
      })
      return lines
    }

    const st = await nftState(client, cfg, job, ids[0]!)
    const sig = brain.SIGNALS[st.strategyId]

    /* fara politica citita, vechimea acceptata a oracolului ramane o ora: e
       doar pragul de la care raportul spune "pretul e vechi", nu o frana */
    let maxStaleSec = 3600
    try {
      const policy = await client.readContract({
        address: job.registry,
        abi: registryAbi,
        functionName: 'policyOf',
        args: [st.strategyId]
      })
      if (policy.exists) maxStaleSec = policy.maxStaleSec
    } catch (e) {
      log.debug({ err: (e as Error).message }, 'policy unreadable while reporting')
    }

    const nowSec = (await client.getBlock()).timestamp
    const { navUsd8, held, staleSym } = await vaultNav(client, job, cash, st.account, maxStaleSec, nowSec)

    const { first, dayOpen } = navMarks(ledger, navUsd8, localDay())
    const sinceStart = movePct(first, navUsd8)

    const lines: ReportLine[] = [
      { name: 'position', value: held.length ? held.join(' + ') : 'empty vault' },
      {
        name: 'value',
        value: `${usd(navUsd8)} | today ${signed(movePct(dayOpen, navUsd8))} | since start ${signed(sinceStart)}`,
        /* pierderea nu e o defectiune, dar de la un punct incolo vrei sa afli
           in aceeasi zi, nu la finalul lunii */
        level: sinceStart !== null && sinceStart <= -20 ? 'warn' : undefined
      },
      { name: 'strategy', value: sig ? `#${st.strategyId} ${sig.name}` : `#${st.strategyId} (no signal implementation)` }
    ]

    if (job.maxDrawdownBps !== null) {
      const tripped = ledger.kvGet('brake.armed') === '1'
      const dropBps = navUsd8 >= first ? 0 : Number(((first - navUsd8) * 10_000n) / first)
      lines.push({
        name: 'drawdown brake',
        value: tripped
          ? `TRIPPED, no rotations leave: ${ledger.kvGet('brake.reason') ?? 'value below the line'}`
          : `${(dropBps / 100).toFixed(2)}% of the ${(job.maxDrawdownBps / 100).toFixed(2)}% allowance used`,
        level: tripped ? 'bad' : undefined
      })
    }

    if (from.toLowerCase() === STRANGER.toLowerCase()) {
      /* proces fara cheie (un `report` de pe laptop): soldul unui strain nu e
         gazul agentului, si o cifra care pare a fi a noastra e mai rea decat
         niciuna */
      lines.push({ name: 'gas', value: 'unknown: this process has no operator key' })
    } else {
      const gasWei = await client.getBalance({ address: from })
      const life = ledger.totals(0)
      const left = tradesLeft(gasWei, life.gasWei, life.done)
      lines.push({
        name: 'gas',
        value: `${formatEther(gasWei)} ${cfg.network.nativeSymbol}${left === null ? '' : ` (~${left} rotations)`}`,
        level: left === null ? undefined : left < 5 ? 'bad' : left < 20 ? 'warn' : undefined
      })
    }

    if (st.paused || st.globallyPaused) {
      lines.push({
        name: 'halted',
        value: st.globallyPaused ? 'the registry is globally paused' : 'the owner paused this vault',
        level: 'bad'
      })
    }
    if (cfg.execution.dryRun) {
      /* un bot in proba arata identic cu unul care lucreaza, pana te uiti in
         portofel peste o luna */
      lines.push({ name: 'mode', value: 'DRY RUN, nothing is being signed', level: 'warn' })
    }
    if (staleSym) {
      /* in weekend piata e inchisa, deci oracolul vechi e normalitate, nu
         alarma; in cursul saptamanii e exact invers */
      const weekend = [0, 6].includes(new Date().getUTCDay())
      lines.push({
        name: 'oracle',
        value: `${staleSym} price is older than ${maxStaleSec}s${weekend ? ' (weekend, market closed)' : ''}`,
        level: weekend ? undefined : 'warn'
      })
    }

    const lastWork = ledger.recentEvents(40).find((e) => e.kind === 'work')
    lines.push({
      name: 'last rotation',
      value: lastWork ? `${lastWork.key} ${ago(Math.floor(Date.now() / 1000) - lastWork.at)}` : 'none yet'
    })

    return lines
  }
}
