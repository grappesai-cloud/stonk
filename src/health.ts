/**
 * Cat de viu e botul.
 *
 * Sunt doua feluri de mort si se rezolva diferit:
 *
 *   1. procesul a cazut       -> containerul il porneste inapoi, si pulsul
 *                                din afara observa gaura
 *   2. procesul traieste dar  -> nimeni nu il repornea, pentru ca "merge".
 *      nu mai termina o          De aia exista cainele de paza: daca nu s-a
 *      rulare                    mai terminat nicio rulare de prea mult timp,
 *                                iese singur cu cod 1 si il repune politica
 *                                de restart.
 *
 * Ferestrele se calculeaza din intervalul de rulare, ca sa nu ramana o cifra
 * fixa care minte cand schimbi intervalul.
 */
import type { Config } from './config.js'

/** peste cat timp fara o rulare terminata spunem ca starea e veche */
export function staleAfterSec(cfg: Config): number {
  return cfg.runner.staleAfterSec ?? cfg.runner.intervalSec * 3 + 120
}

/**
 * Peste cat timp fara o rulare terminata procesul se sinucide ca sa fie
 * repornit. In configurare: null inseamna calculat din interval, 0 inseamna
 * oprit dinadins.
 */
export function watchdogSec(cfg: Config): number | null {
  const v = cfg.runner.watchdogSec
  if (v === 0) return null
  return v ?? cfg.runner.intervalSec * 6 + 600
}

export interface Health {
  lastRunAt: number | null
  ageSec: number | null
  staleAfterSec: number
  stale: boolean
}

export function healthOf(lastFinishedAt: number | null, cfg: Config, nowSec = Math.floor(Date.now() / 1000)): Health {
  const limit = staleAfterSec(cfg)
  if (lastFinishedAt === null) {
    /* inainte de prima rulare nu e vechi, e doar nou pornit */
    return { lastRunAt: null, ageSec: null, staleAfterSec: limit, stale: false }
  }
  const age = nowSec - lastFinishedAt
  return { lastRunAt: lastFinishedAt, ageSec: age, staleAfterSec: limit, stale: age > limit }
}

/** decizia cainelui de paza, scoasa afara ca sa poata fi testata fara sa omoare testul */
export function isWedged(lastCompletedMs: number, nowMs: number, watchdog: number | null): boolean {
  if (watchdog === null) return false
  return nowMs - lastCompletedMs > watchdog * 1000
}
