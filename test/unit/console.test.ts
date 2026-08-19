/**
 * Consola. Ce se testeaza aici nu e aspectul, ci granitele:
 * cine intra, ce poate scrie, si ca nu poate scrie nimic altceva.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { buildContext, type Ctx } from '../../src/context.js'
import { createConsole } from '../../src/console/server.js'

const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'
const TOKEN = 'jeton-de-test-foarte-lung-123456'

let dir: string
let killFile: string
let ctx: Ctx
let server: Server
let base: string

function cfgFile(consoleToken: string | null): string {
  const file = join(dir, `cfg-${consoleToken ? 'tok' : 'notok'}.json`)
  writeFileSync(
    file,
    JSON.stringify({
      network: { name: 't', chainId: 4663, rpc: ['http://127.0.0.1:1/nope'], explorer: 'https://exp.test' },
      erc6551: { registry: A, implementation: B },
      brokers: { address: A },
      drops: {
        address: B,
        pending: { signature: 'function p(uint256 a) view returns (uint256 ethAmount)', nativeFields: ['ethAmount'] },
        deliverSignature: 'function deliver(uint256 a)'
      },
      execution: { killSwitchFile: killFile },
      console: { enabled: true, token: consoleToken },
      api: { enabled: false },
      storage: { file: ':memory:' }
    })
  )
  return file
}

async function listen(c: Ctx): Promise<{ server: Server; base: string }> {
  const s = createConsole(c)
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()))
  const addr = s.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  return { server: s, base: `http://127.0.0.1:${port}` }
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'courier-console-'))
  killFile = join(dir, 'STOP')
  ctx = buildContext(cfgFile(TOKEN))
  const r = await listen(ctx)
  server = r.server
  base = r.base
})

afterAll(() => {
  server?.close()
  ctx?.ledger.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('intrarea', () => {
  it('fara jeton primesti ecranul de intrare, nu consola', async () => {
    const r = await fetch(`${base}/`)
    expect(r.status).toBe(401)
    const body = await r.text()
    /* verificam ce e pagina, nu cum arata: campul de jeton exista, iar tabelele
       consolei nu. Altfel testul cade la fiecare schimbare de text. */
    expect(body).toContain('name="token"')
    expect(body).not.toContain('id="runs"')
    expect(body).not.toContain('id="deliveries"')
  })

  it('API-ul refuza fara jeton', async () => {
    const r = await fetch(`${base}/api/state`)
    expect(r.status).toBe(401)
  })

  it('un jeton gresit nu intra', async () => {
    const r = await fetch(`${base}/?token=altceva`, { redirect: 'manual' })
    expect(r.status).toBe(401)
  })

  it('jetonul bun pune cookie si scoate jetonul din adresa', async () => {
    const r = await fetch(`${base}/?token=${TOKEN}`, { redirect: 'manual' })
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe('/')
    const c = r.headers.get('set-cookie') ?? ''
    expect(c).toContain('HttpOnly')
    expect(c).toContain('SameSite=Strict')
  })

  it('cu jeton in antet intra', async () => {
    const r = await fetch(`${base}/`, { headers: { authorization: `Bearer ${TOKEN}` } })
    expect(r.status).toBe(200)
    const body = await r.text()
    expect(body).toContain('COURIER')
    expect(r.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(r.headers.get('x-robots-tag')).toContain('noindex')
  })

  it('fara jeton configurat nu se expune deloc', async () => {
    const c2 = buildContext(cfgFile(null))
    const { server: s2, base: b2 } = await listen(c2)
    const r = await fetch(`${b2}/`)
    expect(r.status).toBe(503)
    s2.close()
    c2.ledger.close()
  })
})

describe('starea', () => {
  const auth = { authorization: `Bearer ${TOKEN}` }

  it('raspunde chiar daca lantul nu raspunde', async () => {
    const r = await fetch(`${base}/api/state`, { headers: auth })
    expect(r.status).toBe(200)
    const s = (await r.json()) as Record<string, unknown>
    expect(s.chainId).toBe(4663)
    expect(s.block).toBe(null) // RPC-ul e mort in test, si asta nu darama consola
    expect(s.paused).toBe(false)
    expect(s.day).toBeTruthy()
    expect(Array.isArray(s.runs)).toBe(true)
  })
})

describe('cele doua actiuni care scriu', () => {
  const auth = { authorization: `Bearer ${TOKEN}` }

  it('oprirea creeaza fisierul si se vede in stare', async () => {
    const r = await fetch(`${base}/api/pause`, { method: 'POST', headers: auth })
    expect(r.status).toBe(200)
    expect(existsSync(killFile)).toBe(true)
    const s = (await (await fetch(`${base}/api/state`, { headers: auth })).json()) as { paused: boolean }
    expect(s.paused).toBe(true)
  })

  it('pornirea sterge fisierul', async () => {
    await fetch(`${base}/api/resume`, { method: 'POST', headers: auth })
    expect(existsSync(killFile)).toBe(false)
  })

  it('nu se poate opri fara jeton', async () => {
    const r = await fetch(`${base}/api/pause`, { method: 'POST' })
    expect(r.status).toBe(401)
    expect(existsSync(killFile)).toBe(false)
  })

  it('nu exista nicio alta ruta care scrie', async () => {
    for (const path of ['/api/config', '/api/key', '/api/mode', '/api/deliver', '/api/send']) {
      const r = await fetch(`${base}${path}`, { method: 'POST', headers: auth })
      expect(r.status).toBe(404)
    }
  })

  it('rutele de scriere nu raspund la GET', async () => {
    const r = await fetch(`${base}/api/pause`, { headers: auth })
    expect(r.status).toBe(404)
  })
})
