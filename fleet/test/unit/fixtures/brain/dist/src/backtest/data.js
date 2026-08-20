/**
 * Date DE PROBA: citeste doar din cache, nu atinge nicio retea. Testele scriu
 * barele in directorul zilei exact cum le-ar lasa creierul adevarat.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export async function loadSeries(symbols, range, cacheDir) {
  const out = {}
  let days = []
  for (const sym of symbols) {
    const bars = JSON.parse(readFileSync(join(cacheDir, `${sym}.json`), 'utf8'))
    out[sym] = bars
    days = bars.map((b) => b.t)
  }
  out.USDG = days.map((t) => ({ t, c: 1 }))
  return out
}
