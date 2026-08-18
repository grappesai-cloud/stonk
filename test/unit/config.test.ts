import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from '../../src/config.js'

const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'

function write(obj: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'courier-'))
  const file = join(dir, 'c.json')
  writeFileSync(file, JSON.stringify(obj))
  return file
}

const minimal = {
  network: { name: 't', chainId: 4663, rpc: ['https://rpc.example.com'] },
  erc6551: { registry: A, implementation: B },
  brokers: { address: A },
  drops: {
    address: B,
    pending: { signature: 'function pendingOf(uint256 id) view returns (uint256 ethAmount)', nativeFields: ['ethAmount'] },
    deliverSignature: 'function deliver(uint256 id)'
  }
}

describe('configurarea', () => {
  it('merge cu minimul necesar si umple restul cu valori implicite sigure', () => {
    const cfg = loadConfig(write(minimal))
    expect(cfg.execution.dryRun).toBe(true) // implicit NU trimite
    expect(cfg.policy.mode).toBe('profit')
    expect(cfg.api.host).toBe('127.0.0.1') // nu expus in retea din greseala
    expect(cfg.alerts.telegram.enabled).toBe(false)
  })

  it('citeste secretele din mediu, nu din fisier', () => {
    process.env.TEST_COURIER_KEY = '0x' + 'ab'.repeat(32)
    const cfg = loadConfig(write({ ...minimal, execution: { privateKey: 'env:TEST_COURIER_KEY' } }))
    expect(cfg.execution.privateKey).toBe('0x' + 'ab'.repeat(32))
    delete process.env.TEST_COURIER_KEY
  })

  it('se opreste clar cand variabila de mediu lipseste', () => {
    expect(() => loadConfig(write({ ...minimal, execution: { privateKey: 'env:NU_EXISTA_ASA_CEVA' } }))).toThrow(
      /NU_EXISTA_ASA_CEVA/
    )
  })

  it('refuza o adresa stricata si spune unde', () => {
    expect(() => loadConfig(write({ ...minimal, brokers: { address: '0x123' } }))).toThrow(/brokers.address/)
  })

  it('normalizeaza adresele la forma cu majuscule de control', () => {
    const cfg = loadConfig(write({ ...minimal, brokers: { address: A.toLowerCase() } }))
    expect(cfg.brokers.address).toBe('0x1111111111111111111111111111111111111111')
  })

  it('accepta sumele mari ca text', () => {
    const cfg = loadConfig(write({ ...minimal, policy: { minValueWei: '12345678901234567890' } }))
    expect(cfg.policy.minValueWei).toBe(12345678901234567890n)
  })
})
