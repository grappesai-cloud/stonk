/**
 * Creier DE PROBA pentru teste. Semnalele reale sunt private (financial-nfa);
 * asta e doar forma lor, cu o regula banala: cumpara NVDA pe momentum pozitiv
 * pe 2 bare, altfel stai in cash. Suficient ca sa probeze meseria, zero alpha.
 */
export const CASH = 'USDG'
export const ROTOR_UNI = ['NVDA']
export const OCTANE = ['NVDA']
export const ALL_SYMBOLS = ['NVDA']

/* manual mode, same shape as the real brain: the holder pins one symbol and
   the signal never reads the tape */
const pinned = (id, sym) => ({
  id,
  name: sym === CASH ? 'Cash Park' : `Hold ${sym}`,
  warmup: 0,
  target: () => sym
})

export const PINNED = { 100: 'USDG', 101: 'NVDA', 102: 'TSLA' }

export const SIGNALS = {
  6: {
    id: 6,
    name: 'Fixture Rotor',
    warmup: 2,
    target(s, i) {
      const b = s.NVDA
      return b[i].c / b[i - 2].c - 1 > 0 ? 'NVDA' : CASH
    }
  },
  100: pinned(100, 'USDG'),
  101: pinned(101, 'NVDA'),
  102: pinned(102, 'TSLA')
}
