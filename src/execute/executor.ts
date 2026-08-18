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

  // 1. comutatorul de oprire, inaintea oricarui calcul
  if (existsSync(cfg.execution.killSwitchFile)) {
    out.stoppedBy = `comutator de oprire prezent: ${cfg.execution.killSwitchFile}`
    log.warn({ file: cfg.execution.killSwitchFile }, 'oprit de comutator')
    return out
  }

  const from = account?.address ?? '0x0000000000000000000000000000000000000000'

  // 2. pretul gazului
  const gasPriceWei = await client.getGasPrice()
  const priceVerdict = gasPriceAcceptable(gasPriceWei, cfg)
  if (!priceVerdict.go) {
    out.stoppedBy = `gaz prea scump: ${priceVerdict.detail}`
    for (const c of claims) out.skipped.push({ tokenId: c.tokenId, reason: 'gas-price-cap' })
    return out
  }

  const chunks = chunk(claims, cfg.policy.batchSize)
  const dayStart = Math.floor(Date.now() / 1000) - 86400
  let spentToday = ledger.gasSpentSince(dayStart)

  for (const group of chunks) {
    if (existsSync(cfg.execution.killSwitchFile)) {
      out.stoppedBy = 'comutator de oprire aparut in timpul rularii'
      for (const c of group) out.skipped.push({ tokenId: c.tokenId, reason: 'over-run-cap' })
      break
    }

    let sim: BatchSim
    try {
      sim = await simulateBatch(client, cfg, account ?? from, group)
    } catch (e) {
      log.error({ err: (e as Error).message }, 'simularea lotului a picat, lotul se sare')
      for (const c of group) {
        ledger.recordDelivery(row(runId, c, owners, 'skipped', `simulare picata: ${(e as Error).message}`))
        out.skipped.push({ tokenId: c.tokenId, reason: 'unprofitable', detail: 'simulare picata' })
      }
      continue
    }

    // 3. rentabilitate, pe lot
    const verdict = decideProfit({ tipWei: sim.tipsWei, gasCostWei: sim.gasCostWei, cfg })
    if (!verdict.go && sim.tipsMeasured) {
      for (const c of group) {
        ledger.recordDelivery(row(runId, c, owners, 'skipped', verdict.detail))
        out.skipped.push({ tokenId: c.tokenId, reason: 'unprofitable', detail: verdict.detail })
      }
      continue
    }

    // 4. bugetul zilnic
    const budget = withinDailyBudget({ spentTodayWei: spentToday, plannedWei: sim.gasCostWei, cfg })
    if (!budget.go) {
      out.stoppedBy = `buget zilnic epuizat: ${budget.detail}`
      for (const c of group) {
        ledger.recordDelivery(row(runId, c, owners, 'skipped', budget.detail))
        out.skipped.push({ tokenId: c.tokenId, reason: 'daily-budget', detail: budget.detail })
      }
      break
    }

    // 5. modul uscat: totul s-a calculat, nu se semneaza nimic
    if (cfg.execution.dryRun) {
      for (const c of group) {
        ledger.recordDelivery(row(runId, c, owners, 'dry', 'rulare uscata'))
      }
      out.tipsWei += sim.tipsWei
      out.gasWei += sim.gasCostWei
      out.valueWei += group.reduce((s, c) => s + c.valueWei, 0n)
      continue
    }

    if (!wallet || !account) {
      out.stoppedBy = 'lipseste cheia privata, nu se poate semna'
      break
    }

    // 6. soldul operatorului
    const balance = await client.getBalance({ address: account.address })
    if (balance < sim.gasCostWei) {
      out.stoppedBy = `sold insuficient: ${balance} sub gazul estimat ${sim.gasCostWei}`
      for (const c of group) {
        ledger.recordDelivery(row(runId, c, owners, 'skipped', 'sold insuficient'))
      }
      break
    }

    // 7. trimitere
    try {
      const hash = await send(wallet, account, cfg, sim, client)
      out.txHashes.push(hash)
      for (const c of group) {
        ledger.recordDelivery({
          ...row(runId, c, owners, 'sent', null),
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
      ledger.markDeliveryConfirmed(hash, gasWei / BigInt(Math.max(group.length, 1)), receipt.blockNumber, okStatus ? 'confirmed' : 'reverted')

      for (const c of group) {
        if (okStatus) {
          out.delivered.push({ claim: c, txHash: hash, status: 'confirmed' })
          out.valueWei += c.valueWei
          ledger.clearClaim(c.tokenId.toString())
        }
      }
      log.info(
        { hash, delivered: okStatus ? group.length : 0, gasWei: gasWei.toString(), tips: tips.toString() },
        okStatus ? 'lot livrat' : 'lot dat revert'
      )
    } catch (e) {
      const msg = (e as Error).message
      log.error({ err: msg }, 'trimiterea lotului a picat')
      for (const c of group) {
        ledger.recordDelivery(row(runId, c, owners, 'failed', msg))
      }
      out.stoppedBy = `trimitere picata: ${msg}`
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

  // fara contract de lot: o singura livrare pe tranzactie
  const first = sim.claims[0]
  if (!first) throw new Error('lot gol')
  return wallet.sendTransaction({
    account,
    chain: wallet.chain,
    to: cfg.drops.address,
    data: deliverCalldata(cfg, first),
    nonce,
    ...fees
  })
}

function tipsFromReceipt(logs: readonly { address: string; topics: readonly Hex[]; data: Hex }[], cfg: Config): bigint | null {
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
  reason: string | null
) {
  return {
    runId,
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
