/**
 * Executia. Aici se cheltuie bani, deci aici stau toate franele.
 *
 * Ordinea verificarilor nu e decorativa: intai ce opreste totul (comutatorul
 * de oprire, veghea, modul uscat), apoi ce opreste bucata (pretul gazului,
 * rentabilitatea, bugetul zilnic, soldul), abia apoi se semneaza. Orice iesire
 * scrie in registru motivul, ca sa nu existe treaba disparuta fara explicatie.
 *
 * O garantie pe care nu o rup: o tranzactie duce exact o bucata de munca.
 * Cand contractul stie sa inghita mai multe deodata, gruparea se face in
 * modulul meseriei si iese tot o singura bucata, cu castigul ei masurat. Asa
 * nu se poate intampla ce s-a intamplat o data la Courier: o tranzactie
 * trimisa, un grup intreg trecut in registru ca facut.
 */
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { type Account, type Address, type Hex, type PublicClient, type WalletClient } from 'viem'
import type { Config } from './config.js'
import type { Ledger } from './ledger/db.js'
import type { Target, WorkItem } from './work.js'
import { calldataFor, quote, type SingleSim } from './simulate.js'
import { decideProfit, gasPriceAcceptable, withinDailyBudget, withinSpendBudget, type Skipped } from './policy/rules.js'
import { withSignerLock } from './signerLock.js'
import { log } from './log.js'

export interface DoneItem {
  item: WorkItem
  txHash: Hex
  status: 'sent' | 'confirmed' | 'reverted'
  gasWei: bigint
  rewardWei: bigint
  costWei: bigint
  /** cat a durat de la vederea ocaziei pana la semnatura */
  latencyMs: number | null
  gasPriceWei: bigint
}

export interface ExecuteResult {
  done: DoneItem[]
  skipped: Skipped[]
  txHashes: Hex[]
  gasWei: bigint
  rewardWei: bigint
  costWei: bigint
  dry: boolean
  stoppedBy: string | null
}

export interface FeeOverride {
  maxFeePerGasWei?: bigint
  maxPriorityFeePerGasWei?: bigint
}

export interface ExecuteInput {
  client: PublicClient
  wallet: WalletClient | null
  account: Account | null
  cfg: Config
  ledger: Ledger
  runId: number
  target: Target
  /** tinta pentru o bucata anume, cand meseria are mai multe apeluri */
  targetOf?: (item: WorkItem) => Target
  sims: SingleSim[]
  /** momentul in care am vazut ocazia, pentru masurarea intarzierii */
  seenAtMs?: number
  fees?: FeeOverride
}

export async function execute(input: ExecuteInput): Promise<ExecuteResult> {
  const { client, wallet, account, cfg, ledger, runId, target, sims } = input
  const out: ExecuteResult = {
    done: [],
    skipped: [],
    txHashes: [],
    gasWei: 0n,
    rewardWei: 0n,
    costWei: 0n,
    dry: cfg.execution.dryRun,
    stoppedBy: null
  }
  if (sims.length === 0) return out

  // 0. veghea nu semneaza niciodata nimic; verificarea sta aici, nu doar in bucla
  if (cfg.watchtower) {
    out.stoppedBy = 'watchtower mode: nothing is sent'
    for (const s of sims) {
      ledger.recordJob(row(runId, cfg, s.item, 'skipped', 'watchtower'))
      out.skipped.push({ key: s.item.key, reason: 'watchtower' })
    }
    return out
  }

  // 1. comutatorul de oprire, inaintea oricarui calcul
  if (existsSync(cfg.execution.killSwitchFile)) {
    out.stoppedBy = `kill switch present: ${cfg.execution.killSwitchFile}`
    log.warn({ file: cfg.execution.killSwitchFile }, 'stopped by kill switch')
    return out
  }

  // 2. pretul gazului, o data pentru toata rularea
  const gasPriceWei = await client.getGasPrice()
  const priceVerdict = gasPriceAcceptable(gasPriceWei, cfg)
  if (!priceVerdict.go) {
    out.stoppedBy = `gas too expensive: ${priceVerdict.detail}`
    for (const s of sims) {
      ledger.recordJob(row(runId, cfg, s.item, 'skipped', priceVerdict.detail))
      out.skipped.push({ key: s.item.key, reason: 'gas-price-cap', detail: priceVerdict.detail })
    }
    return out
  }

  const dayStart = Math.floor(Date.now() / 1000) - 86400
  let gasToday = ledger.gasSpentSince(dayStart)
  let spentToday = ledger.spentSince(dayStart)

  for (const sim of sims) {
    const item = sim.item
    const itemTarget = input.targetOf ? input.targetOf(item) : target
    if (existsSync(cfg.execution.killSwitchFile)) {
      out.stoppedBy = 'kill switch appeared mid-run'
      out.skipped.push({ key: item.key, reason: 'watchtower', detail: 'kill switch' })
      break
    }

    const q = await quote(client, sim, cfg)

    // 3. rentabilitate, cu ce dam din portofel scazut din ce incasam
    const verdict = decideProfit({
      rewardWei: item.rewardWei,
      rewardMeasured: item.rewardMeasured,
      costWei: item.costWei,
      costMeasured: item.costMeasured,
      gasCostWei: q.gasCostWei,
      cfg
    })
    if (!verdict.go) {
      ledger.recordJob(row(runId, cfg, item, 'skipped', verdict.detail))
      out.skipped.push({ key: item.key, reason: verdict.reason ?? 'unprofitable', detail: verdict.detail })
      if (verdict.reason === 'reward-not-measured' || verdict.reason === 'cost-not-measured') {
        out.stoppedBy = verdict.detail
        log.error(verdict.detail)
        break
      }
      continue
    }

    // 4. bugetele zilnice: gazul si cheltuiala sunt robinete diferite
    const budget = withinDailyBudget({ spentTodayWei: gasToday, plannedWei: q.gasCostWei, cfg })
    if (!budget.go) {
      out.stoppedBy = `daily gas budget spent: ${budget.detail}`
      ledger.recordJob(row(runId, cfg, item, 'skipped', budget.detail))
      out.skipped.push({ key: item.key, reason: 'daily-budget', detail: budget.detail })
      break
    }
    const spend = withinSpendBudget({ spentTodayWei: spentToday, plannedWei: item.costWei, cfg })
    if (!spend.go) {
      out.stoppedBy = `daily spend budget spent: ${spend.detail}`
      ledger.recordJob(row(runId, cfg, item, 'skipped', spend.detail))
      out.skipped.push({ key: item.key, reason: 'daily-spend-budget', detail: spend.detail })
      break
    }

    // 5. modul uscat: totul s-a calculat, nu se semneaza nimic
    if (cfg.execution.dryRun) {
      ledger.recordJob(row(runId, cfg, item, 'dry', 'dry run'))
      out.gasWei += q.gasCostWei
      out.rewardWei += item.rewardWei
      out.costWei += item.costWei
      continue
    }

    if (!wallet || !account) {
      out.stoppedBy = 'no private key, nothing can be signed'
      break
    }

    /* 6. soldul operatorului: gazul PLUS ce trimite odata cu apelul. Fara
       partea a doua, un agent care plateste marfa ar trimite o tranzactie care
       cade pe lant, adica ar plati gaz ca sa afle ca n-are bani. */
    const needed = q.gasCostWei + item.valueWei
    const balance = await client.getBalance({ address: account.address })
    if (balance < needed) {
      const detail = `balance ${balance} under the ${needed} needed (gas ${q.gasCostWei} + value ${item.valueWei})`
      out.stoppedBy = `balance too low: ${detail}`
      ledger.recordJob(row(runId, cfg, item, 'skipped', detail))
      out.skipped.push({ key: item.key, reason: 'no-funds', detail })
      break
    }

    // 7. trimitere
    try {
      const t0 = Date.now()
      /* Citirea nonce-ului si trimiterea sunt UNA SINGURA fata de alte procese
         care semneaza cu aceeasi cheie: pe colectia v3 un seif are un singur
         `agentSigner`, deci harvesterul si trader-ul impart cheia. Lacatul NU
         acopera si asteptarea chitantei, care n-are de ce sa blocheze pe nimeni. */
      const hash = await withSignerLock(dirname(cfg.storage.file), account.address, async () => {
        const nonce = await client.getTransactionCount({ address: account.address, blockTag: 'pending' })
        const fees = await feesOf(client, cfg, input.fees)
        return await wallet.sendTransaction({
          account,
          chain: wallet.chain,
          to: itemTarget.address,
          data: calldataFor(itemTarget, item),
          value: item.valueWei,
          nonce,
          gas: sim.gas > 0n ? (sim.gas * 12n) / 10n : cfg.policy.gasCapPerCall,
          ...fees
        })
      })
      const signedAtMs = Date.now()
      out.txHashes.push(hash)
      ledger.recordJob({ ...row(runId, cfg, item, 'sent', null), txHash: hash })

      const receipt = await client.waitForTransactionReceipt({ hash, confirmations: cfg.execution.confirmations })
      const effective = receipt.effectiveGasPrice ?? q.gasPriceWei
      const gasWei = receipt.gasUsed * effective
      gasToday += gasWei
      out.gasWei += gasWei

      const okStatus = receipt.status === 'success'
      const rewardWei = okStatus ? item.rewardWei : 0n
      /* o tranzactie cazuta nu a cheltuit marfa: ETH-ul trimis se intoarce,
         iar jetoanele nu au plecat. Doar gazul e pierdut. */
      const costWei = okStatus ? item.costWei : 0n
      spentToday += costWei
      ledger.settleTx(hash, {
        gasWei,
        rewardWei,
        costWei,
        blockNumber: receipt.blockNumber,
        status: okStatus ? 'confirmed' : 'reverted'
      })
      out.costWei += costWei
      if (okStatus) {
        out.rewardWei += rewardWei
        ledger.clearOpportunity(item.key)
      }
      out.done.push({
        item,
        txHash: hash,
        status: okStatus ? 'confirmed' : 'reverted',
        gasWei,
        rewardWei,
        costWei,
        latencyMs: input.seenAtMs ? signedAtMs - input.seenAtMs : signedAtMs - t0,
        gasPriceWei: effective
      })
      log.info({ hash, key: item.key, gasWei: gasWei.toString(), okStatus }, okStatus ? 'work done' : 'work reverted')
    } catch (e) {
      const msg = (e as Error).message
      log.error({ err: msg, key: item.key }, 'sending failed')
      ledger.recordJob(row(runId, cfg, item, 'failed', msg))
      out.stoppedBy = `send failed: ${msg}`
      break
    }
  }

  return out
}

/**
 * Taxele tranzactiei.
 *
 * Aici sta o capcana care ar fi omorat pe tacute tot Ringer-ul: daca dai doar
 * bacsisul (`maxPriorityFeePerGas`) si lasi plafonul (`maxFeePerGas`) pe seama
 * bibliotecii, plafonul se calculeaza DOAR din pretul de baza, fara bacsis.
 * Orice urcare serioasa iese peste plafonul propriu si tranzactia e respinsa
 * inainte sa plece. Adica exact cand cursa e mai stransa, botul nu mai trimite
 * nimic, si in jurnal apare "send failed", nu "am pierdut cursa".
 *
 * De aia plafonul se calculeaza aici: pretul de baza inmultit cu doi, ca sa
 * tina si daca urca in blocul urmator, plus bacsisul intreg.
 */
async function feesOf(
  client: PublicClient,
  cfg: Config,
  over: FeeOverride | undefined
): Promise<{ maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint }> {
  const maxPrio = over?.maxPriorityFeePerGasWei ?? cfg.execution.maxPriorityFeePerGasWei
  const maxFee = over?.maxFeePerGasWei ?? cfg.execution.maxFeePerGasWei
  if (maxPrio === null || maxPrio === undefined) {
    return maxFee === null || maxFee === undefined ? {} : { maxFeePerGas: maxFee }
  }
  if (maxFee !== null && maxFee !== undefined) {
    /* un plafon scris de mana sub bacsis e o configurare care nu poate pleca
       niciodata; il ridicam la minimul care are sens si mergem mai departe */
    return { maxPriorityFeePerGas: maxPrio, maxFeePerGas: maxFee < maxPrio ? maxPrio : maxFee }
  }
  let base = 0n
  try {
    const block = await client.getBlock({ blockTag: 'latest' })
    base = block.baseFeePerGas ?? 0n
  } catch {
    base = 0n
  }
  return { maxPriorityFeePerGas: maxPrio, maxFeePerGas: base * 2n + maxPrio }
}

function row(
  runId: number,
  cfg: Config,
  item: WorkItem,
  status: 'sent' | 'skipped' | 'failed' | 'dry',
  reason: string | null
) {
  return {
    runId,
    agentId: cfg.agent.id,
    key: item.key,
    label: item.label,
    stakeWei: item.stakeWei,
    rewardWei: 0n,
    costWei: 0n,
    gasWei: 0n,
    txHash: null as string | null,
    blockNumber: null as bigint | null,
    status,
    reason
  }
}
