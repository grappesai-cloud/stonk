/**
 * Reconcilierea, la fiecare pornire.
 *
 * Un proces poate muri intre trimiterea tranzactiei si citirea chitantei.
 * Daca nu verifici asta la pornire, randurile raman pe "trimis" pentru
 * totdeauna: contul de gaz iese gresit, iar cooldown-ul crede ca a livrat
 * cand poate a dat revert. Se rezolva o singura data, la inceput.
 */
import type { Ctx } from './context.js'
import { tipsFromReceipt } from './execute/executor.js'
import { log } from './log.js'

export interface Reconciled {
  checked: number
  confirmed: number
  reverted: number
  stillPending: number
}

export async function reconcile(ctx: Ctx): Promise<Reconciled> {
  const hashes = ctx.ledger.unconfirmedTxs()
  const out: Reconciled = { checked: hashes.length, confirmed: 0, reverted: 0, stillPending: 0 }

  for (const hash of hashes) {
    try {
      const receipt = await ctx.client.getTransactionReceipt({ hash: hash as `0x${string}` })
      const tokens = ctx.ledger.tokensOfTx(hash)
      const gasWei = receipt.gasUsed * (receipt.effectiveGasPrice ?? 0n)
      const ok = receipt.status === 'success'
      const tipWei = ok ? (tipsFromReceipt(receipt.logs, ctx.cfg) ?? 0n) : 0n
      ctx.ledger.settleTx(hash, { gasWei, tipWei, blockNumber: receipt.blockNumber, status: ok ? 'confirmed' : 'reverted' })
      if (ok) {
        out.confirmed++
        for (const t of tokens) ctx.ledger.clearClaim(t)
      } else {
        out.reverted++
      }
    } catch {
      // inca in mempool, sau inlocuita: o lasam pentru rularea urmatoare
      out.stillPending++
    }
  }

  if (out.checked > 0) log.info(out, 'reconciliere la pornire')
  return out
}
