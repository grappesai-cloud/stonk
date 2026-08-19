/**
 * Executia. Aici se cheltuie bani, deci aici stau toate franele.
 *
 * Ordinea verificarilor nu e decorativa: intai lucrurile care opresc totul
 * (comutatorul de oprire, modul uscat), apoi cele care opresc lotul (pretul
 * gazului, bugetul zilnic, soldul), abia apoi se semneaza ceva. Orice iesire
 * din functie scrie in registru motivul, ca sa nu existe livrari disparute
 * fara explicatie.
 */
import { existsSync } from 'node:fs'
import {
  decodeEventLog,
  encodeFunctionData,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient
} from 'viem'
import type { Config } from '../config.js'
import type { Ledger } from '../ledger/db.js'
import type { Claim } from '../scan/claims.js'
import { BATCH_ABI, deliverCalldata, simulateBatch, type BatchSim } from '../simulate/simulate.js'
import { decideProfit, gasPriceAcceptable, withinDailyBudget, type Skipped } from '../policy/rules.js'
import { log } from '../log.js'

const BATCH_EVENT_ABI = [
  {
    type: 'event',
    name: 'BatchRun',
    inputs: [
      { name: 'target', type: 'address', indexed: true },
      { name: 'beneficiary', type: 'address', indexed: true },
      { name: 'total', type: 'uint256', indexed: false },
      { name: 'succeeded', type: 'uint256', indexed: false },
      { name: 'tips', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false }
    ]
  }
] as const

export interface DeliveredItem {
  claim: Claim
  txHash: Hex
  status: 'sent' | 'confirmed' | 'reverted'
}

export interface ExecuteResult {
  delivered: DeliveredItem[]
  skipped: Skipped[]
  txHashes: Hex[]
  gasWei: bigint
  tipsWei: bigint
  valueWei: bigint
  dry: boolean
  stoppedBy: string | null
}

export interface ExecuteInput {
  client: PublicClient
  wallet: WalletClient | null
  account: Account | null
  cfg: Config
  ledger: Ledger
  runId: number
  claims: Claim[]
  owners: Map<bigint, Address>
}

export async function execute(input: ExecuteInput): Promise<ExecuteResult> {
  const { client, wallet, account, cfg, ledger, runId, claims, owners } = input
  const out: ExecuteResult = {
    delivered: [],
    skipped: [],
    txHashes: [],
    gasWei: 0n,
    tipsWei: 0n,
    valueWei: 0n,
    dry: cfg.execution.dryRun,
    stoppedBy: null
  }
  if (claims.length === 0) return out

  /* 0. modul de veghe nu semneaza niciodata nimic. Verificarea sta aici, nu
     doar in bucla, ca sa nu existe niciun drum prin care sa se ajunga la
     semnare dintr-o configurare de veghe. */
  if (cfg.watchtower) {
    out.stoppedBy = 'watchtower mode: nothing is delivered'
    for (const c of claims) out.skipped.push({ tokenId: c.tokenId, reason: 'over-run-cap', detail: 'watchtower' })
    return out
  }

  // 1. comutatorul de oprire, inaintea oricarui calcul
  if (existsSync(cfg.execution.killSwitchFile)) {
    out.stoppedBy = `kill switch present: ${cfg.execution.killSwitchFile}`
    log.warn({ file: cfg.execution.killSwitchFile }, 'stopped by kill switch')
    return out
  }

  const from = account?.address ?? '0x0000000000000000000000000000000000000000'
  /* fiecare rand scris de aici poarta id-ul agentului in numele caruia s-a
     lucrat; fara el nu se poate dovedi niciodata ce a castigat o bucata anume */
  const agentId = cfg.agent.id

  // 2. pretul gazului
  const gasPriceWei = await client.getGasPrice()
  const priceVerdict = gasPriceAcceptable(gasPriceWei, cfg)
  if (!priceVerdict.go) {
    out.stoppedBy = `gas too expensive: ${priceVerdict.detail}`
    for (const c of claims) out.skipped.push({ tokenId: c.tokenId, reason: 'gas-price-cap' })
    return out
  }

  /**
   * Fara contract de lot, o tranzactie duce o singura livrare. Daca am grupa
   * oricum, am scrie in registru N livrari trimise pentru o tranzactie care a
   * facut una singura, si toata socoteala de mai tarziu ar fi falsa.
   */
  const perTx = cfg.execution.batchContract ? cfg.policy.batchSize : 1
  const chunks = chunk(claims, perTx)
  const dayStart = Math.floor(Date.now() / 1000) - 86400
  let spentToday = ledger.gasSpentSince(dayStart)

  for (const group of chunks) {
    if (existsSync(cfg.execution.killSwitchFile)) {
      out.stoppedBy = 'kill switch appeared mid-run'
      for (const c of group) out.skipped.push({ tokenId: c.tokenId, reason: 'over-run-cap' })
      break
    }

    let sim: BatchSim
    try {
      sim = await simulateBatch(client, cfg, account ?? from, group)
    } catch (e) {
      log.error({ err: (e as Error).message }, 'batch simulation failed, skipping the batch')
      for (const c of group) {
        ledger.recordDelivery(row(runId, c, owners, 'skipped', `simulation failed: ${(e as Error).message}`, agentId))
        out.skipped.push({ tokenId: c.tokenId, reason: 'unprofitable', detail: 'simulation failed' })
      }
      continue
    }

    // 3. rentabilitate, pe lot
    if (cfg.policy.mode === 'profit' && !sim.tipsMeasured && cfg.policy.requireMeasuredTips) {
      const detail =
        'profit mode needs a measured tip, but there is no batch contract. ' +
        'Deploy CourierBatch, switch to campaign mode, or set requireMeasuredTips to false and accept delivering blind.'
      out.stoppedBy = detail
      for (const c of group) {
        ledger.recordDelivery(row(runId, c, owners, 'skipped', detail, agentId))
        out.skipped.push({ tokenId: c.tokenId, reason: 'unprofitable', detail })
      }
      log.error(detail)
      break
    }

    const verdict = decideProfit({ tipWei: sim.tipsWei, gasCostWei: sim.gasCostWei, cfg })
    if (!verdict.go && sim.tipsMeasured) {
      for (const c of group) {
        ledger.recordDelivery(row(runId, c, owners, 'skipped', verdict.detail, agentId))
        out.skipped.push({ tokenId: c.tokenId, reason: 'unprofitable', detail: verdict.detail })
      }
      continue
    }

    // 4. bugetul zilnic
    const budget = withinDailyBudget({ spentTodayWei: spentToday, plannedWei: sim.gasCostWei, cfg })
    if (!budget.go) {
      out.stoppedBy = `daily budget spent: ${budget.detail}`
      for (const c of group) {
        ledger.recordDelivery(row(runId, c, owners, 'skipped', budget.detail, agentId))
        out.skipped.push({ tokenId: c.tokenId, reason: 'daily-budget', detail: budget.detail })
      }
      break
    }

    // 5. modul uscat: totul s-a calculat, nu se semneaza nimic
    if (cfg.execution.dryRun) {
      for (const c of group) {
        ledger.recordDelivery(row(runId, c, owners, 'dry', 'dry run', agentId))
      }
      out.tipsWei += sim.tipsWei
      out.gasWei += sim.gasCostWei
      out.valueWei += group.reduce((s, c) => s + c.valueWei, 0n)
      continue
    }

    if (!wallet || !account) {
      out.stoppedBy = 'no private key, nothing can be signed'
      break
    }

    // 6. soldul operatorului
    const balance = await client.getBalance({ address: account.address })
    if (balance < sim.gasCostWei) {
      out.stoppedBy = `balance too low: ${balance} under the estimated gas ${sim.gasCostWei}`
      for (const c of group) {
        ledger.recordDelivery(row(runId, c, owners, 'skipped', 'balance too low', agentId))
      }
      break
    }

    // 7. trimitere
    try {
      const hash = await send(wallet, account, cfg, sim, client)
      out.txHashes.push(hash)
      for (const c of group) {
        ledger.recordDelivery({
          ...row(runId, c, owners, 'sent', null, agentId),
          txHash: hash
        })
      }

      const receipt = await client.waitForTransactionReceipt({
        hash,
        confirmations: cfg.execution.confirmations
      })
      const gasWei = receipt.gasUsed * (receipt.effectiveGasPrice ?? sim.gasPriceWei)
      spentToday += gasWei
      out.gasWei += gasWei

      const tips = tipsFromReceipt(receipt.logs, cfg) ?? (sim.tipsMeasured ? sim.tipsWei : 0n)
      out.tipsWei += tips

      const okStatus = receipt.status === 'success'
      ledger.settleTx(hash, {
        gasWei,
        tipWei: okStatus ? tips : 0n,
        blockNumber: receipt.blockNumber,
        status: okStatus ? 'confirmed' : 'reverted'
      })

      for (const c of group) {
        if (okStatus) {
          out.delivered.push({ claim: c, txHash: hash, status: 'confirmed' })
          out.valueWei += c.valueWei
          ledger.clearClaim(c.tokenId.toString())
        }
      }
      log.info(
        { hash, delivered: okStatus ? group.length : 0, gasWei: gasWei.toString(), tips: tips.toString() },
        okStatus ? 'batch delivered' : 'batch reverted'
      )
    } catch (e) {
      const msg = (e as Error).message
      log.error({ err: msg }, 'sending the batch failed')
      for (const c of group) {
        ledger.recordDelivery(row(runId, c, owners, 'failed', msg, agentId))
      }
      out.stoppedBy = `send failed: ${msg}`
      break
    }
  }

  return out
}

async function send(
  wallet: WalletClient,
  account: Account,
  cfg: Config,
  sim: BatchSim,
  client: PublicClient
): Promise<Hex> {
  const beneficiary = cfg.execution.beneficiary ?? account.address
  const nonce = await client.getTransactionCount({ address: account.address, blockTag: 'pending' })
  const fees: { maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint } = {}
  if (cfg.execution.maxFeePerGasWei !== null) fees.maxFeePerGas = cfg.execution.maxFeePerGasWei
  if (cfg.execution.maxPriorityFeePerGasWei !== null) fees.maxPriorityFeePerGas = cfg.execution.maxPriorityFeePerGasWei

  if (cfg.execution.batchContract) {
    const data = encodeFunctionData({
      abi: BATCH_ABI,
      functionName: 'run',
      args: [cfg.drops.address, sim.calldata, cfg.policy.gasCapPerCall, beneficiary]
    })
    return wallet.sendTransaction({
      account,
      chain: wallet.chain,
      to: cfg.execution.batchContract,
      data,
      nonce,
      gas: sim.gasUnits > 0n ? (sim.gasUnits * 12n) / 10n : undefined,
      ...fees
    })
  }

  // fara contract de lot: exact o livrare, garantat, pentru ca lotul are unul
  const first = sim.claims[0]
  if (!first) throw new Error('empty batch')
  if (sim.claims.length > 1) throw new Error('without a batch contract, one transaction carries exactly one delivery')
  return wallet.sendTransaction({
    account,
    chain: wallet.chain,
    to: cfg.drops.address,
    data: deliverCalldata(cfg, first),
    nonce,
    ...fees
  })
}

export function tipsFromReceipt(logs: readonly { address: string; topics: readonly Hex[]; data: Hex }[], cfg: Config): bigint | null {
  const batch = cfg.execution.batchContract?.toLowerCase()
  if (!batch) return null
  for (const l of logs) {
    if (l.address.toLowerCase() !== batch) continue
    try {
      const decoded = decodeEventLog({
        abi: BATCH_EVENT_ABI,
        data: l.data,
        topics: l.topics as [Hex, ...Hex[]]
      })
      const args = decoded.args as unknown as { tips: bigint }
      return args.tips
    } catch {
      continue
    }
  }
  return null
}

function row(
  runId: number,
  c: Claim,
  owners: Map<bigint, Address>,
  status: 'sent' | 'skipped' | 'failed' | 'dry',
  reason: string | null,
  agentId: number | null = null
) {
  return {
    runId,
    agentId,
    tokenId: c.tokenId.toString(),
    wallet: c.wallet,
    owner: owners.get(c.tokenId) ?? null,
    valueWei: c.valueWei,
    nativeWei: c.native,
    tipWei: 0n,
    gasWei: 0n,
    txHash: null,
    blockNumber: null,
    status,
    reason
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
