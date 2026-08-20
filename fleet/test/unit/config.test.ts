import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { abiOf, abiWithErrors, loadConfig, missingEnv } from '../../src/core/config.js'
import { jobFor } from '../../src/jobs/index.js'

const DIR = './data/test-unit'
const FILE = `${DIR}/cfg.json`

const base = {
  agent: { kind: 'ringer' },
  network: { name: 'anvil', chainId: 31337, rpc: ['http://127.0.0.1:8545'] },
  target: { address: '0x0000000000000000000000000000000000000001' },
  job: { action: { signature: 'function clockIn()' } }
}

const write = (o: object) => {
  mkdirSync(DIR, { recursive: true })
  writeFileSync(FILE, JSON.stringify(o))
  return FILE
}

beforeEach(() => rmSync(DIR, { recursive: true, force: true }))
afterEach(() => rmSync(DIR, { recursive: true, force: true }))

describe('configurare', () => {
  it('umple valorile lipsa cu ce e sigur: uscat, fara trimitere', () => {
    const cfg = loadConfig(write(base))
    expect(cfg.execution.dryRun).toBe(true)
    expect(cfg.policy.mode).toBe('profit')
    expect(cfg.policy.requireMeasuredReward).toBe(true)
  })

  it('citeste secretele din mediu, nu din fisier', () => {
    process.env.TEST_KEY_XYZ = '0x' + '11'.repeat(32)
    const cfg = loadConfig(write({ ...base, execution: { privateKey: 'env:TEST_KEY_XYZ' } }))
    expect(cfg.execution.privateKey).toBe('0x' + '11'.repeat(32))
    delete process.env.TEST_KEY_XYZ
  })

  it('o variabila de mediu lipsa nu opreste pornirea, dar se retine care lipseste', () => {
    delete process.env.TEST_MISSING_XYZ
    const cfg = loadConfig(write({ ...base, execution: { privateKey: 'env:TEST_MISSING_XYZ' } }))
    expect(cfg.execution.privateKey).toBeNull()
    expect(missingEnv.join()).toMatch(/TEST_MISSING_XYZ/)
  })

  it('sumele mari raman intregi, nu trec prin numere cu virgula', () => {
    const huge = '123456789012345678901234567890'
    const cfg = loadConfig(write({ ...base, policy: { minRewardWei: huge } }))
    expect(cfg.policy.minRewardWei).toBe(BigInt(huge))
  })

  it('o adresa gresita e prinsa la pornire, cu numele campului', () => {
    expect(() => loadConfig(write({ ...base, target: { address: 'nu-e-adresa' } }))).toThrow(/target.address/)
  })

  it('o semnatura scrisa gresit da o eroare care spune care e', () => {
    expect(() => abiOf('functie clockIn(', 'job.action')).toThrow(/job.action/)
  })

  it('erorile contractului intra in acelasi ABI cu functia, ca simularea sa le poata numi', () => {
    const abi = abiWithErrors('function clockIn()', ['error NotAuthorized()'], 'x')
    expect(abi.filter((x) => x.type === 'error').length).toBe(1)
  })

  it('meseria isi valideaza singura blocul ei, cu mesaj propriu', () => {
    const cfg = loadConfig(write({ ...base, agent: { kind: 'miner' }, job: {} }))
    expect(() => jobFor(cfg.agent.kind).parse(cfg.job)).toThrow(/invalid miner job config/)
  })

  it('o meserie necunoscuta e respinsa la pornire', () => {
    expect(() => loadConfig(write({ ...base, agent: { kind: 'plumber' } }))).toThrow(/agent.kind/)
  })

  it('cele patru meserii sunt primite', () => {
    for (const kind of ['ringer', 'miner', 'stocker', 'lobbyist']) {
      expect(loadConfig(write({ ...base, agent: { kind } })).agent.kind).toBe(kind)
    }
  })
})

describe('cheia operatorului', () => {
  const withKey = (k: string | null) =>
    loadConfig(write({ ...base, execution: { privateKey: k } }))

  it('substituentul din .env.example inseamna cheie lipsa, nu cheie gresita', async () => {
    const { accountOf } = await import('../../src/core/chain/client.js')
    for (const p of ['0x', '0x0', '', ' 0X '])
      expect(accountOf(withKey(p))).toBeNull()
  })

  it('o cheie scrisa gresit ramane eroare zgomotoasa, nu e trecuta cu vederea', async () => {
    const { accountOf } = await import('../../src/core/chain/client.js')
    expect(() => accountOf(withKey('0xdeadbeef'))).toThrow(/malformed/)
  })

  it('o cheie buna e primita si fara prefix', async () => {
    const { accountOf } = await import('../../src/core/chain/client.js')
    expect(accountOf(withKey('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'))?.address).toBe(
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
    )
  })
})
