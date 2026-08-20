import { describe, expect, it } from 'vitest'
import { alarmsToSend, dayKey, digestDue, render, type Kv } from '../../src/core/alerts/digest.js'

function kvOf(seed: Record<string, string> = {}): Kv & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed))
  return {
    map,
    get: (k) => map.get(k) ?? null,
    set: (k, v) => {
      map.set(k, v)
    }
  }
}

const at = (h: number): Date => new Date(2026, 7, 20, h, 30, 0)

describe('rezumatul zilnic: cand pleaca', () => {
  it('nu pleaca inainte de ora ceruta', () => {
    expect(digestDue(kvOf(), 9, at(8))).toBe(false)
  })

  it('pleaca o singura data pe zi', () => {
    const kv = kvOf()
    expect(digestDue(kv, 9, at(9))).toBe(true)
    kv.set('digest.day', dayKey(at(9)))
    expect(digestDue(kv, 9, at(10))).toBe(false)
  })

  it('ora e "cel mai devreme", nu "fix atunci": un bot pornit la 11 tot raporteaza ziua', () => {
    expect(digestDue(kvOf(), 9, at(11))).toBe(true)
  })

  it('ziua urmatoare e alt rezumat', () => {
    const kv = kvOf({ 'digest.day': dayKey(at(9)) })
    const tomorrow = new Date(2026, 7, 21, 9, 30, 0)
    expect(digestDue(kv, 9, tomorrow)).toBe(true)
  })

  it('fara ora, nu exista rezumat zilnic', () => {
    expect(digestDue(kvOf(), null, at(23))).toBe(false)
  })
})

describe('alarmele pe loc', () => {
  const lines = [
    { name: 'value', value: 'ok' },
    { name: 'gas', value: 'almost out', level: 'bad' as const },
    { name: 'oracle', value: 'stale', level: 'warn' as const }
  ]

  it('suna doar randurile ingrijoratoare', () => {
    const hot = alarmsToSend(lines, kvOf(), 1000)
    expect(hot.map((l) => l.name)).toEqual(['gas', 'oracle'])
  })

  it('aceeasi problema nu suna la fiecare rulare: o alarma care suna mereu nu se mai citeste', () => {
    const kv = kvOf()
    expect(alarmsToSend(lines, kv, 1000)).toHaveLength(2)
    expect(alarmsToSend(lines, kv, 1000 + 600)).toHaveLength(0)
    expect(alarmsToSend(lines, kv, 1000 + 6 * 3600)).toHaveLength(2)
  })

  it('fiecare rand isi tine propria liniste: gazul tacut nu amuteste oracolul', () => {
    const kv = kvOf()
    alarmsToSend([lines[1]!], kv, 1000)
    const hot = alarmsToSend(lines, kv, 1200)
    expect(hot.map((l) => l.name)).toEqual(['oracle'])
  })
})

describe('cum arata mesajul', () => {
  it('randurile rele se vad din prima privire, restul raman curate', () => {
    const text = render([
      { name: 'position', value: '0.012906 PLTR' },
      { name: 'gas', value: 'low', level: 'warn' },
      { name: 'halted', value: 'paused', level: 'bad' }
    ])
    expect(text.split('\n')).toEqual(['position: 0.012906 PLTR', '~ gas: low', '! halted: paused'])
  })
})
