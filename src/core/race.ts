/**
 * Caietul de curse.
 *
 * Intrebarea la care raspunde: cand oala s-a golit si nu am fost noi, cine a
 * apasat, cu cat gaz, si eram macar treji in momentul ala?
 *
 * Fara evidenta asta, un Ringer care pierde toate cursele arata exact ca un
 * Ringer care nu are ce lucra: in ambele cazuri jurnalul spune "nimic de
 * facut". Diferenta dintre ele e diferenta dintre o meserie libera si una
 * deja luata, adica singurul lucru care conteaza inainte sa cheltui pe gaz.
 *
 * Merge si in veghe, fara cheie si fara sa trimita nimic. Asa se masoara
 * cursa inainte sa intri in ea.
 */
import type { Address, PublicClient } from 'viem'
import type { Config } from './config.js'
import type { Ledger } from './ledger/db.js'
import type { Job } from './work.js'
import { log } from './log.js'

interface Wanted {
  seenAtMs: number
  blockSeen: bigint
  sentTx: string | null
  ourGasPriceWei: bigint
  latencyMs: number | null
}

export class RaceBook {
  /** ce am vazut ca fiind de facut si inca nu s-a inchis */
  private wanted = new Map<string, Wanted>()
  private lastSwept: bigint | null = null

  constructor(
    private cfg: Config,
    private ledger: Ledger,
    private job: Job<never>,
    private jobCfg: never
  ) {}

  get active(): boolean {
    return typeof this.job.presses === 'function'
  }

  /** am vazut ca e de apasat */
  noteWanted(key: string, blockNumber: bigint, gasPriceWei: bigint): void {
    if (this.wanted.has(key)) return
    this.wanted.set(key, { seenAtMs: Date.now(), blockSeen: blockNumber, sentTx: null, ourGasPriceWei: gasPriceWei, latencyMs: null })
  }

  /** am si trimis */
  noteSent(key: string, txHash: string, gasPriceWei: bigint, latencyMs: number | null): void {
    const w = this.wanted.get(key) ?? {
      seenAtMs: Date.now(),
      blockSeen: 0n,
      sentTx: null,
      ourGasPriceWei: gasPriceWei,
      latencyMs
    }
    w.sentTx = txHash
    w.ourGasPriceWei = gasPriceWei
    w.latencyMs = latencyMs
    this.wanted.set(key, w)
  }

  /**
   * Citeste blocurile noi si scrie in caiet cine a apasat.
   *
   * `us` e adresa noastra; cand lipseste (veghe fara cheie) toate apasarile
   * sunt ale altcuiva, si asta e chiar masuratoarea care ne trebuie: cine
   * lucreaza pe lantul asta si cat plateste.
   */
  async sweep(client: PublicClient, us: Address | null, head: bigint): Promise<number> {
    if (!this.job.presses) return 0
    const from = this.lastSwept === null ? head : this.lastSwept + 1n
    if (from > head) return 0
    this.lastSwept = head
    let presses: Awaited<ReturnType<NonNullable<Job<never>['presses']>>> = []
    try {
      presses = await this.job.presses(client, this.cfg, this.jobCfg, from, head)
    } catch (e) {
      log.warn({ err: (e as Error).message, from: from.toString(), to: head.toString() }, 'race sweep failed')
      return 0
    }

    let recorded = 0
    for (const p of presses) {
      const mine = !!us && p.caller.toLowerCase() === us.toLowerCase()
      const key = p.key
      const w = this.wanted.get(key)
      this.ledger.recordRace({
        key,
        blockNumber: p.blockNumber,
        winner: mine ? 'us' : p.caller,
        wanted: !!w,
        sent: !!w?.sentTx,
        ourGasPriceWei: w?.ourGasPriceWei ?? 0n,
        winnerGasPriceWei: p.gasPriceWei,
        blocksLate: w ? Number(p.blockNumber - w.blockSeen) : null,
        latencyMs: w?.latencyMs ?? null,
        txHash: p.txHash,
        note: mine ? null : w?.sentTx ? 'we sent and still lost' : w ? 'we saw it and did not send' : 'we never saw it'
      })
      this.wanted.delete(key)
      recorded++
      if (!mine && w) {
        log.warn(
          { winner: p.caller, theirGas: p.gasPriceWei.toString(), ourGas: (w.ourGasPriceWei ?? 0n).toString() },
          'race lost'
        )
      }
    }
    return recorded
  }

  /** ocaziile pe care le-am vazut si care s-au invechit fara sa se inchida */
  forget(olderThanMs = 10 * 60_000): void {
    const now = Date.now()
    for (const [k, w] of this.wanted) if (now - w.seenAtMs > olderThanMs) this.wanted.delete(k)
  }
}
