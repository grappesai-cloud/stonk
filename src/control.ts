/**
 * Comanda buclei din afara ei.
 *
 * Fara asta, consola poate doar sa opreasca. Un operator vrea si sa porneasca
 * o rulare cand vrea el, si mai ales sa vada ce s-ar intampla daca ar rula
 * acum, fara sa cheltuie nimic. Aia e cea mai folosita apasare dintr-un panou.
 */
import type { RunOutcome } from './runner.js'

export class Controller {
  /** cererea in asteptare: rulare uscata sau adevarata */
  private pending: { dry: boolean } | null = null
  private wake: (() => void) | null = null

  /** exista o bucla care asculta? in `courier console` singur, nu exista */
  attached = false
  running = false
  nextRunAt: number | null = null
  /** de ce nu se lucreaza: lipsesc adresele contractelor. null = se lucreaza */
  standby: string | null = null
  lastOutcome: (RunOutcome & { dry: boolean; at: number }) | null = null

  request(dry: boolean): boolean {
    if (!this.attached) return false
    if (this.running) return false
    this.pending = { dry }
    this.wake?.()
    return true
  }

  /** bucla ia cererea, daca exista */
  take(): { dry: boolean } | null {
    const p = this.pending
    this.pending = null
    return p
  }

  /** somn care se rupe cand cineva apasa butonul */
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wake = null
        resolve()
      }, ms)
      this.wake = () => {
        clearTimeout(timer)
        this.wake = null
        resolve()
      }
    })
  }

  finished(o: RunOutcome, dry: boolean): void {
    this.lastOutcome = { ...o, dry, at: Math.floor(Date.now() / 1000) }
  }
}
