import { describe, expect, it } from 'vitest'
import { cleanWallet, cleanText, makeLimiter } from '../../src/signup.js'

describe('inscrierea pe lista', () => {
  it('primeste o adresa sau un nume ENS, si respinge restul', () => {
    expect(cleanWallet('0x' + 'a'.repeat(40))).toBe('0x' + 'a'.repeat(40))
    expect(cleanWallet('Degen.eth')).toBe('degen.eth')
    expect(cleanWallet('0x123')).toBeNull()
    expect(cleanWallet('<script>alert(1)</script>')).toBeNull()
    expect(cleanWallet(42)).toBeNull()
  })

  it('taie textul si scoate caracterele de control', () => {
    expect(cleanText('  @degen  ', 40)).toBe('@degen')
    expect(cleanText('a'.repeat(100), 40).length).toBe(40)
    /* un octet de control in mijloc nu are ce cauta nici in baza, nici in log */
    expect(cleanText('bunrau', 40)).toBe('bunrau')
    expect(cleanText(null, 40)).toBe('')
  })

  it('limiteaza ritmul pe IP, si uita dupa o ora', () => {
    let now = 1_000_000
    const limited = makeLimiter(3, () => now)
    expect(limited('1.1.1.1')).toBe(false)
    expect(limited('1.1.1.1')).toBe(false)
    expect(limited('1.1.1.1')).toBe(false)
    /* al patrulea, in aceeasi ora, e refuzat */
    expect(limited('1.1.1.1')).toBe(true)
    /* alt IP nu are treaba cu asta */
    expect(limited('2.2.2.2')).toBe(false)
    /* peste o ora, iar se poate */
    now += 3_600_001
    expect(limited('1.1.1.1')).toBe(false)
  })
})
