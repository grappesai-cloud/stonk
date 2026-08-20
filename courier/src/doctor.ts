/**
 * Diagnosticul. Se ruleaza inainte de orice si raspunde la intrebarile din
 * care afli daca proiectul are sens, nu doar daca ruleaza codul.
 *
 * Cea mai importanta e ultima: `deliver()` merge apelata de un strain? Daca
 * raspunsul e nu, Courier-ul nu exista, si e mai bine sa afli acum.
 */
import { formatEther, type Address, type PublicClient } from 'viem'
import type { Ctx } from './context.js'
import { STRANGER } from './context.js'
import { abiOf, missingEnv } from './config.js'
import { hasCode } from './chain/reader.js'
import { REGISTRY_ABI, tbaAddress } from './erc6551/address.js'
import { discoverTokenIds, ownersOf, walletsOf } from './discover/brokers.js'
import { scanClaims } from './scan/claims.js'
import { probeGating } from './simulate/simulate.js'

export interface Check {
  name: string
  ok: boolean
  detail: string
  fatal?: boolean
}

export async function doctor(ctx: Ctx): Promise<Check[]> {
  const { cfg, client } = ctx
  const checks: Check[] = []
  const add = (name: string, ok: boolean, detail: string, fatal = false) => checks.push({ name, ok, detail, fatal })

  if (cfg.watchtower) {
    add('mode', true, 'WATCHTOWER: scans, keeps the index, alerts. No simulation, no signing, no delivery.')
  }

  if (missingEnv.length > 0) {
    add('env', false, `missing variables, those fields stay empty: ${missingEnv.join(', ')}`)
  }

  // ---- lantul
  try {
    const id = await client.getChainId()
    add('rpc', id === cfg.network.chainId, id === cfg.network.chainId ? `chainId ${id}` : `RPC answers ${id}, config expects ${cfg.network.chainId}`, true)
    const block = await client.getBlockNumber()
    add('block', true, `at block ${block}`)
  } catch (e) {
    add('rpc', false, `RPC not responding: ${(e as Error).message}`, true)
    return checks
  }

  // ---- multicall
  if (cfg.network.multicall3) {
    const ok = await hasCode(client, cfg.network.multicall3)
    add('multicall3', ok, ok ? 'present, reads collapse into one call' : 'configured but not deployed, falling back to single reads')
  } else {
    add('multicall3', true, 'not configured, reads go one by one but batched over HTTP')
  }

  // ---- registrul 6551 si matematica adreselor
  const regOk = await hasCode(client, cfg.erc6551.registry)
  add('6551 registry', regOk, regOk ? cfg.erc6551.registry : `no code at ${cfg.erc6551.registry}`, true)
  if (regOk) {
    const check = await verifyTbaMath(client, cfg.erc6551.registry, cfg.erc6551.implementation, cfg.erc6551.salt, cfg.network.chainId, cfg.brokers.address)
    add('6551 addresses', check.ok, check.detail, true)
  }

  // ---- contractele
  const brokersOk = await hasCode(client, cfg.brokers.address)
  add('brokers contract', brokersOk, brokersOk ? cfg.brokers.address : `no code at ${cfg.brokers.address}`, true)
  const dropsOk = await hasCode(client, cfg.drops.address)
  add('drops contract', dropsOk, dropsOk ? cfg.drops.address : `no code at ${cfg.drops.address}`, true)

  if (cfg.execution.batchContract) {
    const b = await hasCode(client, cfg.execution.batchContract)
    add('batch contract', b, b ? cfg.execution.batchContract : 'configured but not deployed')
  } else {
    add('batch contract', true, 'not configured: deliveries go one by one and the tip cannot be measured up front')
  }

  if (!brokersOk || !dropsOk) return checks

  // ---- se poate citi colectia
  let ids: bigint[] = []
  try {
    ids = await discoverTokenIds(client, cfg)
    add('discovery', ids.length > 0, `${ids.length} ids`, ids.length === 0)
  } catch (e) {
    add('discovery', false, (e as Error).message, true)
    return checks
  }

  // ---- se poate citi ce e nerevendicat
  const sample = ids.slice(0, Math.min(ids.length, 50))
  try {
    const scan = await scanClaims(client, cfg, sample)
    add(
      'reading drops',
      scan.failed === 0,
      scan.failed === 0
        ? `${scan.claims.length} of ${sample.length} hold something, worth ${formatEther(scan.totalValueWei)} ${cfg.network.nativeSymbol}`
        : `${scan.failed} reads failed of ${sample.length}, check the drops.pending signature`
    )

    // ---- INTREBAREA
    if (scan.claims.length > 0) {
      const owners = await ownersOf(client, cfg, scan.claims.map((c) => c.tokenId))
      /* In modul de veghe intrebarea ramane interesanta, dar nu mai e fatala:
         un supraveghetor nu livreaza nimic, deci poate porni si daca functia e
         rezervata proprietarului. */
      const probe = await probeGating(client, cfg, scan.claims, STRANGER as Address, (id) => owners.get(id))
      add(
        'deliver() callable by a stranger',
        probe.callableByStranger || cfg.watchtower,
        probe.callableByStranger
          ? `yes, tested on #${probe.testedTokenId}`
          : cfg.watchtower
            ? `NO (${probe.kind}), but in watchtower mode it does not matter: nothing is delivered.`
            : `NO (${probe.kind}): ${probe.reason ?? 'unknown reason'}. Without this, Courier cannot deliver for others.`,
        !probe.callableByStranger && !cfg.watchtower
      )
    } else {
      add('deliver() callable by a stranger', false, 'nothing unclaimed to test against right now')
    }
  } catch (e) {
    add('reading drops', false, (e as Error).message, true)
  }

  // ---- cate portofele 6551 sunt chiar desfasurate
  if (ids.length > 0) {
    const sampleIds = ids.slice(0, Math.min(ids.length, 25))
    const wallets = walletsOf(cfg, sampleIds)
    const deployed = await Promise.all([...wallets.values()].map((w) => hasCode(client, w)))
    const n = deployed.filter(Boolean).length
    add(
      '6551 wallets deployed',
      true,
      `${n} of ${sampleIds.length} checked have code. Delivery works to an undeployed one too: the address is deterministic, ` +
        `the funds sit there and become reachable once the account is created.`
    )
  }

  // ---- operatorul
  if (ctx.account) {
    const bal = await client.getBalance({ address: ctx.account.address })
    add('operator', bal > 0n, `${ctx.account.address} cu ${formatEther(bal)} ${cfg.network.nativeSymbol}`)
  } else {
    add(
      'operator',
      true,
      cfg.watchtower
        ? 'no key, and that is correct: watchtower mode signs nothing'
        : 'no private key: scanning and simulation work, delivery does not'
    )
  }

  // ---- telegram
  if (ctx.tg.enabled) {
    const me = await (ctx.tg as unknown as { call: (m: string, b: object) => Promise<{ username?: string } | null> }).call(
      'getMe',
      {}
    )
    add('telegram', !!me, me?.username ? `@${me.username}` : 'token was rejected')
  } else {
    add('telegram', true, 'off')
  }

  return checks
}

export async function verifyTbaMath(
  client: PublicClient,
  registry: Address,
  implementation: Address,
  salt: `0x${string}`,
  chainId: number,
  tokenContract: Address
): Promise<{ ok: boolean; detail: string }> {
  const tokenId = 1n
  const local = tbaAddress({ registry, implementation, salt, chainId, tokenContract, tokenId })
  try {
    const onchain = (await client.readContract({
      address: registry,
      abi: REGISTRY_ABI,
      functionName: 'account',
      args: [implementation, salt, BigInt(chainId), tokenContract, tokenId]
    })) as Address
    const ok = onchain.toLowerCase() === local.toLowerCase()
    return {
      ok,
      detail: ok
        ? `local math matches the registry (${local})`
        : `MISMATCH: local ${local}, registry ${onchain}. Check the implementation and salt.`
    }
  } catch (e) {
    return { ok: false, detail: `registry does not answer account(): ${(e as Error).message}` }
  }
}
