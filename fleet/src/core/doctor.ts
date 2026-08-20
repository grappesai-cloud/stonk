/**
 * Diagnosticul. Se ruleaza inainte de orice si raspunde la intrebarile din
 * care afli daca agentul are sens, nu doar daca ruleaza codul.
 *
 * Cea mai importanta e tot ultima, ca la Courier: functia care face treaba
 * merge apelata de un strain? Daca raspunsul e nu, agentul nu exista, si e
 * mai bine sa afli acum, dintr-un eth_call.
 */
import { formatEther, type Address } from 'viem'
import type { Ctx } from './context.js'
import { STRANGER } from './context.js'
import { missingEnv } from './config.js'
import { hasCode } from './chain/reader.js'
import { probeGating, simulateEach } from './simulate.js'
import { standbyReason } from './standby.js'

export interface Check {
  name: string
  ok: boolean
  detail: string
  fatal?: boolean
}

export async function doctor(ctx: Ctx): Promise<Check[]> {
  const { cfg, client, job, jobCfg } = ctx
  const checks: Check[] = []
  const add = (name: string, ok: boolean, detail: string, fatal = false) => checks.push({ name, ok, detail, fatal })

  add('agent', true, `${cfg.agent.kind.toUpperCase()} "${cfg.agent.name}" on ${cfg.network.name} (${cfg.network.chainId})`)
  if (cfg.watchtower) {
    add(
      'mode',
      true,
      cfg.agent.kind === 'ringer'
        ? 'WATCHTOWER: measures the race without spending anything. Nothing is signed.'
        : 'WATCHTOWER: reads and keeps the index. Nothing is signed.'
    )
  }
  if (missingEnv.length > 0) {
    add('env', false, `missing variables, those fields stay empty: ${missingEnv.join(', ')}`)
  }

  // ---- lantul
  try {
    const id = await client.getChainId()
    add(
      'rpc',
      id === cfg.network.chainId,
      id === cfg.network.chainId ? `chainId ${id}` : `RPC answers ${id}, config expects ${cfg.network.chainId}`,
      true
    )
    add('block', true, `at block ${await client.getBlockNumber()}`)
  } catch (e) {
    add('rpc', false, `RPC not responding: ${(e as Error).message}`, true)
    return checks
  }

  if (cfg.network.multicall3) {
    const ok = await hasCode(client, cfg.network.multicall3)
    add('multicall3', ok, ok ? 'present, reads collapse into one call' : 'configured but not deployed, falling back to single reads')
  } else {
    add('multicall3', true, 'not configured, reads go one by one but batched over HTTP')
  }

  // ---- contractele cerute de meserie
  const waiting = await standbyReason(client, cfg, job, jobCfg)
  if (waiting) {
    add('contracts', false, `${waiting}. The agent will stand by until this is fixed, it will not crash-loop.`, true)
    return checks
  }
  for (const r of job.required(cfg, jobCfg)) add(r.what, true, r.address)

  // ---- verificarile meseriei
  const from = ctx.account?.address ?? (STRANGER as Address)
  if (job.checks) {
    for (const c of await job.checks({ client, cfg, job: jobCfg, ledger: ctx.ledger, from })) {
      add(c.name, c.ok, c.detail, c.fatal ?? false)
    }
  }

  // ---- se poate descoperi ce e de lucru
  let items: Awaited<ReturnType<typeof job.discover>> = []
  try {
    items = await job.discover({ client, cfg, job: jobCfg, ledger: ctx.ledger, from })
    add('discovery', true, items.length > 0 ? `${items.length} jobs available right now` : 'nothing to do right now')
  } catch (e) {
    add('discovery', false, (e as Error).message, true)
    return checks
  }

  // ---- INTREBAREA
  const target = job.target(cfg, jobCfg, items[0])
  if (items.length > 0 && job.actsOnOwnPosition) {
    /**
     * Agentul lucreaza cu pozitia lui, deci intrebarea nu e daca poate un
     * strain, ci daca putem NOI. Un strain respins aici e semnul ca protocolul
     * e in regula, nu ca agentul nu poate exista.
     */
    const [mine] = await simulateEach(client, target, from, [items[0]!], 1)
    add(
      `${target.functionName}() callable by us`,
      !!mine?.ok,
      mine?.ok
        ? `yes, tested on ${items[0]!.key} from ${from}`
        : `NO: ${mine?.reason ?? 'unknown'}. The position may not be ours, or the window may be closed.`,
      !mine?.ok
    )
    const [asStranger] = await simulateEach(client, target, STRANGER as Address, [items[0]!], 1)
    add(
      'a stranger cannot vote with our position',
      !asStranger?.ok,
      asStranger?.ok
        ? 'WARNING: a stranger can make this call too. Check what you are actually calling.'
        : 'correct: rejected for anyone else'
    )
  } else if (items.length > 0) {
    const authority = job.authority ? await job.authority(client, cfg, jobCfg) : null
    const probe = await probeGating(client, target, items, STRANGER as Address, authority)
    add(
      `${target.functionName}() callable by a stranger`,
      probe.callableByStranger || cfg.watchtower,
      probe.callableByStranger
        ? `yes, tested on ${probe.testedKey}`
        : probe.kind === 'authority-gated'
          ? `NO: proven on ${probe.testedKey}, only ${probe.authority} gets through. ${
              cfg.watchtower ? 'In watchtower mode it does not matter: nothing is sent.' : 'This agent cannot work for others.'
            }`
          : `could not prove it either way (${probe.kind}): ${probe.reason ?? 'unknown'}`,
      !probe.callableByStranger && !cfg.watchtower && probe.kind === 'authority-gated'
    )

    /* si cat costa, la pretul de acum */
    const [sim] = await simulateEach(client, target, from, [items[0]!], 1)
    if (sim?.ok && sim.gas > 0n) {
      const price = await client.getGasPrice()
      const cost = sim.gas * price
      const item = items[0]!
      add(
        'economics',
        item.rewardMeasured ? item.rewardWei > cost : true,
        item.rewardMeasured
          ? `reward ${formatEther(item.rewardWei)} vs gas ${formatEther(cost)} ${cfg.network.nativeSymbol}` +
            (item.rewardWei > cost ? ' -> pays for itself' : ' -> loses money at this price')
          : `gas ${formatEther(cost)} ${cfg.network.nativeSymbol} per job, reward not measurable up front (${item.meta.reward ?? 'no source'})`
      )
    }
  } else {
    add(
      `${target.functionName}() callable by a stranger`,
      false,
      'nothing to test it against right now. Run doctor again when there is work waiting.'
    )
  }

  // ---- cursa, daca meseria are una
  if (job.presses) {
    const races = ctx.ledger.raceStats()
    add(
      'race book',
      true,
      races.total === 0
        ? 'no races recorded yet. Run in watchtower mode for a while: it measures who presses first, without spending anything.'
        : `${races.won}/${races.total} won (${Math.round(races.winRate * 100)}%), ${races.competitors} other bots seen, ` +
          `they pay a median of ${formatEther(races.medianWinnerGasPriceWei)} per gas`
    )
  }

  // ---- operatorul
  if (ctx.account) {
    const bal = await client.getBalance({ address: ctx.account.address })
    add('operator', bal > 0n, `${ctx.account.address} with ${formatEther(bal)} ${cfg.network.nativeSymbol}`)

    /**
     * Portofelul care incaseaza chiar e un portofel simplu?
     *
     * Verificarea asta nu e teoretica: pe 4663 adresele obisnuite de test au
     * deja cod de delegare EIP-7702, iar un contract care plateste prin
     * `call{value}` catre o astfel de adresa reuseste apelul si banii NU raman
     * acolo. Botul ar raporta castig, lantul ar arata tranzactie reusita, si
     * suma nu ar fi nicaieri. Se vede doar daca te uiti.
     */
    const code = await client.getCode({ address: ctx.account.address })
    const delegated = !!code && code !== '0x'
    add(
      'operator is a plain wallet',
      !delegated,
      delegated
        ? code!.startsWith('0xef0100')
          ? `NO: ${ctx.account.address} is delegated (EIP-7702) to ${'0x' + code!.slice(8)}. ` +
            `A contract paying with call{value} succeeds and the money may not stay here. Use a fresh key that has never been delegated.`
          : `NO: there is contract code at ${ctx.account.address}. Earnings paid with call{value} may not stay here.`
        : 'yes, no code at the operator address'
    )
  } else {
    add(
      'operator',
      true,
      cfg.watchtower ? 'no key, and that is correct: watchtower mode signs nothing' : 'no private key: reading and simulation work, sending does not'
    )
  }

  if (ctx.tg.enabled) {
    const me = await ctx.tg.call<{ username?: string }>('getMe', {})
    add('telegram', !!me, me?.username ? `@${me.username}` : 'token was rejected')
  } else {
    add('telegram', true, 'off')
  }

  return checks
}
