import { afterAll, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import type { PublicClient } from 'viem'
import { buildContext } from '../../src/core/context.js'
import { startServer } from '../../src/core/api/server.js'
import { standbyReason } from '../../src/core/standby.js'
import { ringer } from '../../src/jobs/ringer.js'

const DIR = './data/test-unit'
const STOP = `${DIR}/STOP-server`
const cfgFile = `${DIR}/server.json`

mkdirSync(DIR, { recursive: true })
writeFileSync(
  cfgFile,
  JSON.stringify({
    agent: { kind: 'ringer', name: 'RINGER #0000' },
    network: { name: 'x', chainId: 1, rpc: ['http://127.0.0.1:1'] },
    target: { address: '0x0000000000000000000000000000000000000001' },
    job: { action: { signature: 'function clockIn()' } },
    execution: { killSwitchFile: STOP },
    api: { enabled: true, host: '127.0.0.1', port: 8811 },
    console: { enabled: true, host: '127.0.0.1', port: 8812, token: 'secret-token' },
    storage: { file: ':memory:', backup: { enabled: false } }
  })
)

const ctx = buildContext(cfgFile)
const pub = startServer(ctx, 'public')
const con = startServer(ctx, 'console')

afterAll(async () => {
  await pub?.close()
  await con?.close()
  ctx.ledger.close()
  rmSync(DIR, { recursive: true, force: true })
})

const get = (port: number, path: string) => fetch(`http://127.0.0.1:${port}${path}`)
const post = (port: number, path: string) => fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST' })

describe('serverul public', () => {
  it('raspunde la /health inainte de prima rulare, fara sa se planga', async () => {
    const r = await get(8811, '/health')
    expect(r.status).toBe(200)
    expect(((await r.json()) as { status: string }).status).toBe('ok')
  })

  it('spune ca sta in asteptare cand asta e starea, si tot cu 200', async () => {
    ctx.control.standby = 'waiting for the real contract addresses'
    const r = await get(8811, '/health')
    expect(r.status).toBe(200)
    expect(((await r.json()) as { status: string }).status).toBe('standby')
    ctx.control.standby = null
  })

  it('da cifrele pentru pagina de prezentare', async () => {
    const s = (await (await get(8811, '/stats')).json()) as { agent: { kind: string }; live: object; mode: string }
    expect(s.agent.kind).toBe('ringer')
    expect(s.live).toHaveProperty('jobsDone')
    expect(s.mode).toBe('profit')
  })

  it('NU are nicio cale prin care sa se scrie ceva', async () => {
    expect((await post(8811, '/stop')).status).toBe(404)
    expect((await post(8811, '/go')).status).toBe(404)
  })
})

describe('consola', () => {
  it('fara jeton nu raspunde nimic', async () => {
    expect((await get(8812, '/stats')).status).toBe(401)
  })

  it('cu jeton gresit nu raspunde nimic', async () => {
    expect((await get(8812, '/stats?token=altceva')).status).toBe(401)
  })

  it('opreste si elibereaza, si amandoua inseamna acelasi fisier', async () => {
    expect((await post(8812, '/stop?token=secret-token')).status).toBe(200)
    expect(existsSync(STOP)).toBe(true)
    expect((await post(8812, '/go?token=secret-token')).status).toBe(200)
    expect(existsSync(STOP)).toBe(false)
  })

  it('cererea de rulare e refuzata cand nu exista o bucla care sa o asculte', async () => {
    const r = await post(8812, '/run?token=secret-token&dry=1')
    expect(r.status).toBe(409)
  })

  it('refuza sa se deschida fara jeton in loc sa se deschida nepazita', () => {
    ctx.cfg.console.token = null
    ctx.cfg.console.port = 8813
    expect(startServer(ctx, 'console')).toBeNull()
    ctx.cfg.console.token = 'secret-token'
  })
})

describe('asteptarea', () => {
  const jobCfg = ringer.parse({ action: { signature: 'function clockIn()' } }) as never
  const clientOf = (code: string): PublicClient => ({ getCode: async () => code }) as unknown as PublicClient

  it('adresa zero inseamna asteptare, nu eroare', async () => {
    const cfg = { ...ctx.cfg, target: { ...ctx.cfg.target, address: '0x0000000000000000000000000000000000000000' as const } }
    const r = await standbyReason(clientOf('0x'), cfg, ringer as never, jobCfg)
    expect(r).toMatch(/waiting for the real contract addresses/)
  })

  it('o adresa care arata bine dar nu are cod pe lantul asta e tot asteptare', async () => {
    const r = await standbyReason(clientOf('0x'), ctx.cfg, ringer as never, jobCfg)
    expect(r).toMatch(/has no code on chain/)
  })

  it('cu cod pe lant, se trece la treaba', async () => {
    const r = await standbyReason(clientOf('0x6080'), ctx.cfg, ringer as never, jobCfg)
    expect(r).toBeNull()
  })
})
