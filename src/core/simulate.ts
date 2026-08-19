/**
 * Simularea. Regula casei: nicio tranzactie nu pleaca nesimulata.
 *
 * Si o regula in plus, care la Ringer si Miner conteaza mai mult decat la
 * Courier: cand toate simularile pica, nu ne multumim cu textul erorii. Cerem
 * dovada, simuland acelasi apel din contul celui care ARE voie. Diferenta
 * dintre cele doua raspunsuri e singurul lucru care demonstreaza ca functia e
 * rezervata. Textul unui revert e o parere; diferenta asta e o proba.
 */
import { encodeFunctionData, type Address, type Hex, type PublicClient } from 'viem'
import type { Config } from './config.js'
import { pool } from './chain/client.js'
import type { Target, WorkItem } from './work.js'

export type SimKind = 'ok' | 'authority-gated' | 'nothing-to-do' | 'reverted' | 'error'

export interface SingleSim {
  item: WorkItem
  ok: boolean
  gas: bigint
  reason: string | null
  kind: SimKind
}

export function calldataFor(target: Target, item: WorkItem): Hex {
  return encodeFunctionData({ abi: target.abi, functionName: target.functionName, args: item.args as never })
}

export function classify(message: string): SimKind {
  const m = message.toLowerCase()
  if (
    /only ?owner|onlyowner|only ?coordinator|onlycoordinator|only ?keeper|unauthorized|not authorized|not allowed|caller is not|forbidden|access ?denied|notauthorized|notoperator/.test(
      m
    )
  ) {
    return 'authority-gated'
  }
  if (
    /nothing|not ready|too early|toosoon|too soon|already|not pending|no pending|notdue|not due|cooldown|inactive|closed|settled|fulfilled/.test(
      m
    )
  ) {
    return 'nothing-to-do'
  }
  return 'reverted'
}

/** fiecare bucata separat: succes, gaz si motivul exact al esecului */
export async function simulateEach(
  client: PublicClient,
  target: Target,
  from: Address,
  items: WorkItem[],
  concurrency = 8
): Promise<SingleSim[]> {
  return pool(items, concurrency, async (item) => {
    try {
      await client.simulateContract({
        address: target.address,
        abi: target.abi,
        functionName: target.functionName,
        args: item.args as never,
        account: from
      })
      let gas = 0n
      try {
        gas = await client.estimateGas({ account: from, to: target.address, data: calldataFor(target, item) })
      } catch {
        gas = 0n
      }
      return { item, ok: true, gas, reason: null, kind: 'ok' as const }
    } catch (e) {
      const err = e as { shortMessage?: string; details?: string; message?: string; metaMessages?: string[] }
      const reason =
        [err.shortMessage, err.details, ...(err.metaMessages ?? [])].filter(Boolean).join(' | ') ||
        err.message ||
        'unknown revert'
      return { item, ok: false, gas: 0n, reason, kind: classify(reason) }
    }
  })
}

export interface GatingProbe {
  callableByStranger: boolean
  reason: string | null
  kind: SimKind
  testedKey: string | null
  /** cine poate, cand noi nu putem */
  authority: Address | null
}

/**
 * Intrebarea de la pasul zero, aceeasi pentru orice agent din flota:
 * functia care face treaba merge apelata de un strain?
 *
 * La Miner intrebarea asta poate omori meseria din start. Daca inchiderea
 * rundei cere dovada oracolului, nimeni din afara nu o poate apela, si atunci
 * agentul nu exista in forma asta. E mai bine sa afli dintr-un eth_call decat
 * dupa ce ai scris contracte si ai vandut o poveste.
 */
export async function probeGating(
  client: PublicClient,
  target: Target,
  items: WorkItem[],
  stranger: Address,
  authority: Address | null
): Promise<GatingProbe> {
  const candidate = items[0]
  if (!candidate) {
    return { callableByStranger: false, reason: 'nothing to try it on', kind: 'error', testedKey: null, authority }
  }
  const [asStranger] = await simulateEach(client, target, stranger, [candidate], 1)
  const testedKey = candidate.key

  if (asStranger!.ok) {
    return { callableByStranger: true, reason: null, kind: 'ok', testedKey, authority }
  }

  if (authority && authority.toLowerCase() !== stranger.toLowerCase()) {
    const [asAuthority] = await simulateEach(client, target, authority, [candidate], 1)
    if (asAuthority!.ok) {
      return {
        callableByStranger: false,
        reason: `callable by ${authority}, not by a stranger: ${asStranger!.reason ?? 'revert'}`,
        kind: 'authority-gated',
        testedKey,
        authority
      }
    }
  }

  return { callableByStranger: false, reason: asStranger!.reason, kind: asStranger!.kind, testedKey, authority }
}

export interface Quote {
  gasUnits: bigint
  gasPriceWei: bigint
  gasCostWei: bigint
}

/** cat costa o bucata, la pretul de acum */
export async function quote(client: PublicClient, sim: SingleSim, cfg: Config): Promise<Quote> {
  const gasPriceWei = await client.getGasPrice()
  const gasUnits = sim.gas > 0n ? sim.gas : cfg.policy.gasCapPerCall
  return { gasUnits, gasPriceWei, gasCostWei: gasUnits * gasPriceWei }
}
