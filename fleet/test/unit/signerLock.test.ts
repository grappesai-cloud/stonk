import { describe, expect, it } from 'vitest'
import { mkdtempSync, existsSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withSignerLock } from '../../src/core/signerLock.js'

const ADDR = '0xa7845B337D79368F5b21d0B4565C93DC960c71FA'
const dir = () => mkdtempSync(join(tmpdir(), 'signerlock-'))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('signer lock', () => {
  it('serialises two holders of the same key', async () => {
    const d = dir()
    /* Fara lacat, amandoua ar citi nonce-ul in acelasi moment. Marcam intrarea
       si iesirea si cerem ca intervalele sa NU se suprapuna. */
    const events: string[] = []
    const worker = (tag: string) =>
      withSignerLock(d, ADDR, async () => {
        events.push(`${tag}:in`)
        await sleep(40)
        events.push(`${tag}:out`)
      })

    await Promise.all([worker('a'), worker('b')])

    expect(events).toHaveLength(4)
    expect(events[1]).toBe(`${events[0]!.split(':')[0]}:out`)
    expect(events[3]).toBe(`${events[2]!.split(':')[0]}:out`)
  })

  it('lets different keys through at the same time', async () => {
    const d = dir()
    const order: string[] = []
    await Promise.all([
      withSignerLock(d, ADDR, async () => {
        order.push('slow:in')
        await sleep(50)
        order.push('slow:out')
      }),
      withSignerLock(d, '0x2797348f6F95C0C2d229127F4C79aB1E4d0fFAd1', async () => {
        await sleep(5)
        order.push('fast:done')
      })
    ])
    /* cheia rapida a terminat INAINTE ca cea lenta sa iasa: nu s-au asteptat */
    expect(order).toEqual(['slow:in', 'fast:done', 'slow:out'])
  })

  it('releases the lock even when the work throws', async () => {
    const d = dir()
    await expect(withSignerLock(d, ADDR, async () => { throw new Error('revert') })).rejects.toThrow('revert')
    expect(readdirSync(d).filter((f) => f.startsWith('.signer-'))).toHaveLength(0)
    await expect(withSignerLock(d, ADDR, async () => 'second run')).resolves.toBe('second run')
  })

  it('takes a lock left behind by a process that died holding it', async () => {
    const d = dir()
    const stale = join(d, `.signer-${ADDR.toLowerCase()}.lock`)
    writeFileSync(stale, JSON.stringify({ pid: 999999, at: Date.now() - 10 * 60_000 }))
    await expect(withSignerLock(d, ADDR, async () => 'through')).resolves.toBe('through')
    expect(existsSync(stale)).toBe(false)
  })

  it('takes a lock whose file is unreadable rather than waiting forever', async () => {
    const d = dir()
    writeFileSync(join(d, `.signer-${ADDR.toLowerCase()}.lock`), 'not json')
    await expect(withSignerLock(d, ADDR, async () => 'through')).resolves.toBe('through')
  })
})
