import { describe, expect, it } from 'vitest'
import { ConfigSchema } from '../../src/core/config.js'
import { jobFor, lobbyist, miner, ringer, stocker } from '../../src/jobs/index.js'

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

describe('meseriile care cheltuie', () => {
  const stockerJob = (over: Record<string, unknown> = {}) =>
    stocker.parse({
      discovery: { mode: 'list', call: { signature: 'function machines_() view returns (uint256[])' } },
      state: {
        call: { signature: 'function machineOf(uint256 id) view returns (uint8 status, uint256 stock, uint256 capacity)', args: ['$id'] },
        stockField: 'stock',
        capacityField: 'capacity'
      },
      action: { signature: 'function restock(uint256 id, uint256 units)', args: ['$id', '$amount'] },
      reward: { mode: 'field', field: 'commission' },
      unitCost: { mode: 'field', field: 'price' },
      payment: { mode: 'native' },
      maxUnitsPerJob: '100',
      ...over
    })

  const run = async (job: unknown, over: Record<string, unknown> = {}) =>
    stocker.checks!({
      client: null as never,
      cfg: cfg({ agent: { kind: 'stocker' }, ...over }),
      job: job as never,
      ledger: null as never,
      from: '0x0000000000000000000000000000000000000001' as never
    })

  it('cere un plafon pe cantitate, ca o capacitate gresita sa nu devina o suma gresita', async () => {
    const checks = await run(stockerJob({ maxUnitsPerJob: null }))
    expect(checks.find((c) => c.name === 'units cap')!.ok).toBe(false)
  })

  it('nu are voie sa umple pana la capacitate daca nu stie capacitatea', async () => {
    const job = stockerJob({
      state: {
        call: { signature: 'function machineOf(uint256 id) view returns (uint8 status, uint256 stock)', args: ['$id'] },
        stockField: 'stock',
        capacityField: null
      }
    })
    /* schema pastreaza capacityField null, deci verificarea trebuie sa cada */
    const checks = await run(job)
    const c = checks.find((x) => x.name === 'restock amount')
    expect(c?.fatal).toBe(true)
  })

  it('cere un buget zilnic de cheltuiala cand chiar plateste ceva', async () => {
    const checks = await run(stockerJob())
    expect(checks.find((c) => c.name === 'daily spend budget')!.ok).toBe(false)
  })

  it('cand marfa e gratis, nu mai cere buget de cheltuiala', async () => {
    const checks = await run(stockerJob({ payment: { mode: 'none' }, unitCost: { mode: 'none' } }))
    expect(checks.find((c) => c.name === 'daily spend budget')).toBeUndefined()
  })

  it('Lobbyist spune singur ca nu blocheaza jetoane, si o marcheaza ca regula', () => {
    expect(lobbyist.actsOnOwnPosition).toBe(true)
  })

  it('Lobbyist alege apelul dupa bucata: vot sau incasare', () => {
    const job = lobbyist.parse({
      position: { tokenId: '1', power: { signature: 'function balanceOfNFT(uint256 id) view returns (uint256)', args: ['$id'] } },
      epoch: { end: { signature: 'function epochEnd() view returns (uint256)' } },
      gauges: { mode: 'config', list: ['0x00000000000000000000000000000000000000a1'] },
      bribes: { signature: 'function bribesOf(address g) view returns (uint256)', args: ['$gauge'] },
      votes: { signature: 'function votesOf(address g) view returns (uint256)', args: ['$gauge'] },
      vote: { signature: 'function vote(uint256 id, address[] g, uint256[] w)', args: ['$id', '$gauges', '$weights'] },
      claim: {
        claimable: { signature: 'function claimable(uint256 id) view returns (uint256)', args: ['$id'] },
        action: { signature: 'function claim(uint256 id)', args: ['$id'] }
      }
    })
    const c = cfg({ agent: { kind: 'lobbyist' } })
    const item = (key: string) => ({ key }) as never
    expect(lobbyist.target(c, job, item('vote:100')).functionName).toBe('vote')
    expect(lobbyist.target(c, job, item('claim:100')).functionName).toBe('claim')
    /* fara bucata, tinta e apelul principal */
    expect(lobbyist.target(c, job).functionName).toBe('vote')
  })
})
