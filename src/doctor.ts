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
    add('mod', true, 'VEGHE: scaneaza, tine indexul si anunta. Nu simuleaza, nu semneaza, nu livreaza.')
  }

  if (missingEnv.length > 0) {
    add('mediu', false, `variabile lipsa, campurile raman goale: ${missingEnv.join(', ')}`)
  }

  // ---- lantul
  try {
    const id = await client.getChainId()
    add('rpc', id === cfg.network.chainId, id === cfg.network.chainId ? `chainId ${id}` : `RPC raspunde cu ${id}, configurarea cere ${cfg.network.chainId}`, true)
    const block = await client.getBlockNumber()
    add('bloc', true, `la blocul ${block}`)
  } catch (e) {
    add('rpc', false, `RPC-ul nu raspunde: ${(e as Error).message}`, true)
    return checks
  }

  // ---- multicall
  if (cfg.network.multicall3) {
    const ok = await hasCode(client, cfg.network.multicall3)
    add('multicall3', ok, ok ? 'prezent, citirile intra intr-un singur apel' : 'configurat dar nedesfasurat, cad pe citiri individuale')
  } else {
    add('multicall3', true, 'neconfigurat, citirile merg individual dar grupate pe HTTP')
  }

  // ---- registrul 6551 si matematica adreselor
  const regOk = await hasCode(client, cfg.erc6551.registry)
  add('registru 6551', regOk, regOk ? cfg.erc6551.registry : `nu exista cod la ${cfg.erc6551.registry}`, true)
  if (regOk) {
    const check = await verifyTbaMath(client, cfg.erc6551.registry, cfg.erc6551.implementation, cfg.erc6551.salt, cfg.network.chainId, cfg.brokers.address)
    add('adrese 6551', check.ok, check.detail, true)
  }

  // ---- contractele
  const brokersOk = await hasCode(client, cfg.brokers.address)
  add('contract brokeri', brokersOk, brokersOk ? cfg.brokers.address : `fara cod la ${cfg.brokers.address}`, true)
  const dropsOk = await hasCode(client, cfg.drops.address)
  add('contract drop-uri', dropsOk, dropsOk ? cfg.drops.address : `fara cod la ${cfg.drops.address}`, true)

  if (cfg.execution.batchContract) {
    const b = await hasCode(client, cfg.execution.batchContract)
    add('contract de lot', b, b ? cfg.execution.batchContract : 'configurat dar nedesfasurat')
  } else {
    add('contract de lot', true, 'neconfigurat: livrarile pleaca una cate una, bacsisul nu poate fi masurat inainte')
  }

  if (!brokersOk || !dropsOk) return checks

  // ---- se poate citi colectia
  let ids: bigint[] = []
  try {
    ids = await discoverTokenIds(client, cfg)
    add('descoperire', ids.length > 0, `${ids.length} id-uri`, ids.length === 0)
  } catch (e) {
    add('descoperire', false, (e as Error).message, true)
    return checks
  }

  // ---- se poate citi ce e nerevendicat
  const sample = ids.slice(0, Math.min(ids.length, 50))
  try {
    const scan = await scanClaims(client, cfg, sample)
    add(
      'citire drop-uri',
      scan.failed === 0,
      scan.failed === 0
        ? `${scan.claims.length} din ${sample.length} au ceva, valoare ${formatEther(scan.totalValueWei)} ${cfg.network.nativeSymbol}`
        : `${scan.failed} citiri picate din ${sample.length}, verifica semnatura din drops.pending`
    )

    // ---- INTREBAREA
    if (scan.claims.length > 0) {
      const owners = await ownersOf(client, cfg, scan.claims.map((c) => c.tokenId))
      /* In modul de veghe intrebarea ramane interesanta, dar nu mai e fatala:
         un supraveghetor nu livreaza nimic, deci poate porni si daca functia e
         rezervata proprietarului. */
      const probe = await probeGating(client, cfg, scan.claims, STRANGER as Address, (id) => owners.get(id))
      add(
        'deliver() apelabila de un strain',
        probe.callableByStranger || cfg.watchtower,
        probe.callableByStranger
          ? `da, testat pe #${probe.testedTokenId}`
          : cfg.watchtower
            ? `NU (${probe.kind}), dar in modul de veghe nu conteaza: nu se livreaza nimic.`
            : `NU (${probe.kind}): ${probe.reason ?? 'motiv necunoscut'}. Fara asta Courier-ul nu poate livra pentru altii.`,
        !probe.callableByStranger && !cfg.watchtower
      )
    } else {
      add('deliver() apelabila de un strain', false, 'nu exista nimic nerevendicat de testat acum')
    }
  } catch (e) {
    add('citire drop-uri', false, (e as Error).message, true)
  }

  // ---- cate portofele 6551 sunt chiar desfasurate
  if (ids.length > 0) {
    const sampleIds = ids.slice(0, Math.min(ids.length, 25))
    const wallets = walletsOf(cfg, sampleIds)
    const deployed = await Promise.all([...wallets.values()].map((w) => hasCode(client, w)))
    const n = deployed.filter(Boolean).length
    add(
      'portofele 6551 desfasurate',
      true,
      `${n} din ${sampleIds.length} verificate au cod. Livrarea merge si catre unul nedesfasurat: adresa e determinista, ` +
        `banii stau acolo si devin accesibili cand contul e creat.`
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
        ? 'fara cheie, si asa trebuie: in modul de veghe nu se semneaza nimic'
        : 'fara cheie privata: se poate scana si simula, nu se poate livra'
    )
  }

  // ---- telegram
  if (ctx.tg.enabled) {
    const me = await (ctx.tg as unknown as { call: (m: string, b: object) => Promise<{ username?: string } | null> }).call(
      'getMe',
      {}
    )
    add('telegram', !!me, me?.username ? `@${me.username}` : 'jetonul nu a fost acceptat')
  } else {
    add('telegram', true, 'oprit')
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
        ? `calculul local bate cu registrul (${local})`
        : `NEPOTRIVIRE: local ${local}, registru ${onchain}. Verifica implementarea si saltul.`
    }
  } catch (e) {
    return { ok: false, detail: `registrul nu raspunde la account(): ${(e as Error).message}` }
  }
}
