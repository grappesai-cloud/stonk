import { describe, expect, it } from 'vitest'
import { ConfigSchema } from '../../src/core/config.js'
import { jobFor, miner, ringer } from '../../src/jobs/index.js'

const cfg = (over: Record<string, unknown> = {}) =>
  ConfigSchema.parse({
    agent: { kind: 'ringer' },
    network: { name: 'x', chainId: 1, rpc: ['http://a.test'] },
    target: { address: '0x0000000000000000000000000000000000000001', errorSignatures: ['error NotAuthorized()'] },
    ...over
  })

describe('meseriile', () => {
  it('Ringer cere cel putin apelul care apasa butonul', () => {
    expect(() => ringer.parse({})).toThrow(/job.action/)
  })

  it('Ringer duce erorile contractului in ABI-ul de simulare, ca reverturile sa aiba nume', () => {
    const job = ringer.parse({ action: { signature: 'function clockIn()' } })
    const t = ringer.target(cfg(), job)
    expect(t.functionName).toBe('clockIn')
    expect(t.abi.some((x) => x.type === 'error' && x.name === 'NotAuthorized')).toBe(true)
  })

  it('Ringer fara eveniment spune limpede ca nu poate tine caietul de curse', async () => {
    const job = ringer.parse({ action: { signature: 'function clockIn()' } })
    const checks = await ringer.checks!({ client: null as never, cfg: cfg(), job, ledger: null as never, from: '0x0' as never })
    const race = checks.find((c) => c.name === 'race book')
    expect(race!.ok).toBe(false)
    expect(race!.detail).toMatch(/lost race/)
  })

  it('Ringer in modul profit fara sursa de castig e o configurare care nu ar lucra niciodata', async () => {
    const job = ringer.parse({ action: { signature: 'function clockIn()' } })
    const checks = await ringer.checks!({ client: null as never, cfg: cfg(), job, ledger: null as never, from: '0x0' as never })
    const reward = checks.find((c) => c.name === 'reward')
    expect(reward!.ok).toBe(false)
    expect(reward!.fatal).toBe(true)
  })

  it('Miner recunoaste ca argumentele oracolului nu sunt ale noastre', async () => {
    const job = miner.parse({
      discovery: { mode: 'list', call: { signature: 'function pendingRounds() view returns (uint256[])' } },
      action: { signature: 'function fulfillRandomWords(uint256 id, uint256[] words)', args: ['$id', ['1']] },
      reward: { mode: 'const', wei: '1' }
    })
    const checks = await miner.checks!({
      client: null as never,
      cfg: cfg({ agent: { kind: 'miner' } }),
      job,
      ledger: null as never,
      from: '0x0' as never
    })
    const args = checks.find((c) => c.name === 'arguments are ours to produce')
    expect(args!.ok).toBe(false)
    expect(args!.detail).toMatch(/only the oracle/)
  })

  it('Miner cu argumente care se pot deduce nu se plange degeaba', async () => {
    const job = miner.parse({
      discovery: { mode: 'list', call: { signature: 'function pendingRounds() view returns (uint256[])' } },
      action: { signature: 'function settle(uint256 id)', args: ['$id'] },
      reward: { mode: 'const', wei: '1' }
    })
    const checks = await miner.checks!({
      client: null as never,
      cfg: cfg({ agent: { kind: 'miner' } }),
      job,
      ledger: null as never,
      from: '0x0' as never
    })
    expect(checks.find((c) => c.name === 'arguments are ours to produce')!.ok).toBe(true)
  })

  it('cheia de asteptare vine din meserie, nu din miez', () => {
    const job = ringer.parse({ action: { signature: 'function clockIn()' } })
    expect(jobFor('ringer').required(cfg(), job as never)[0]!.what).toMatch(/clock/)
    const mjob = miner.parse({
      discovery: { mode: 'list', call: { signature: 'function pendingRounds() view returns (uint256[])' } },
      action: { signature: 'function settle(uint256 id)', args: ['$id'] }
    })
    expect(jobFor('miner').required(cfg({ agent: { kind: 'miner' } }), mjob as never)[0]!.what).toMatch(/rounds/)
  })

  it('doar Ringer intra in cursa, deci doar el are caiet', () => {
    expect(typeof ringer.presses).toBe('function')
    expect(miner.presses).toBeUndefined()
  })
})
