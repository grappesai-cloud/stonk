/**
 * Asteptarea.
 *
 * Botul e gata inainte sa avem adresele contractelor, si asta e o stare
 * normala, nu o eroare. Daca il pornesti asa fara nimic care sa il opreasca,
 * fiecare rulare crapa pe o adresa fara cod, dupa cateva rulari procesul iese,
 * containerul il reporneste, si obtii o bucla de caderi care arata ca un bug
 * si nu e.
 *
 * De aia exista starea de asteptare: serverul sta ridicat, paginile raspund,
 * jurnalul spune ce lipseste, si in momentul in care adresele apar in
 * configurare botul porneste singur la ciclul urmator. Nimeni nu trebuie sa
 * fie treaz la ora aia.
 */
import type { PublicClient } from 'viem'
import type { Config } from './config.js'
import { hasCode } from './chain/reader.js'

const ZERO = '0x0000000000000000000000000000000000000000'

/** care dintre adresele obligatorii sunt inca substituenti */
export function placeholders(cfg: Config): string[] {
  const out: string[] = []
  if (cfg.brokers.address.toLowerCase() === ZERO) out.push('brokers.address')
  if (cfg.drops.address.toLowerCase() === ZERO) out.push('drops.address')
  return out
}

/**
 * Motivul pentru care nu se poate lucra, sau null daca se poate. Verificarea
 * pe lant e ieftina (doua citiri) si prinde si cazul in care cineva a pus o
 * adresa care arata bine dar nu e un contract pe lantul asta.
 */
export async function standbyReason(client: PublicClient, cfg: Config): Promise<string | null> {
  const missing = placeholders(cfg)
  if (missing.length) {
    return `waiting for the real contract addresses (${missing.join(', ')} still zero)`
  }
  for (const [what, address] of [
    ['brokers collection', cfg.brokers.address],
    ['drops contract', cfg.drops.address]
  ] as const) {
    if (!(await hasCode(client, address as `0x${string}`))) {
      return `the ${what} ${address} has no code on chain ${cfg.network.chainId}`
    }
  }
  return null
}
