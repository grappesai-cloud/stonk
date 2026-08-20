/**
 * Asteptarea.
 *
 * Botul e gata inainte sa avem adresele contractelor, si asta e o stare
 * normala, nu o eroare. Pornit asa fara nimic care sa il opreasca, fiecare
 * rulare crapa pe o adresa fara cod, dupa cateva rulari procesul iese,
 * containerul il reporneste, si obtii o bucla de caderi care arata a bug si
 * nu e.
 *
 * De aia exista starea de asteptare: serverul sta ridicat, paginile raspund,
 * jurnalul spune ce lipseste, si in momentul in care adresele apar in
 * configurare agentul porneste singur la ciclul urmator. Nimeni nu trebuie sa
 * fie treaz la ora aia.
 */
import type { PublicClient } from 'viem'
import type { Config } from './config.js'
import { hasCode } from './chain/reader.js'
import type { Job } from './work.js'

const ZERO = '0x0000000000000000000000000000000000000000'

export function placeholders(cfg: Config, job: Job<never>, parsed: never): string[] {
  return job
    .required(cfg, parsed)
    .filter((r) => r.address.toLowerCase() === ZERO)
    .map((r) => r.what)
}

export async function standbyReason(
  client: PublicClient,
  cfg: Config,
  job: Job<never>,
  parsed: never
): Promise<string | null> {
  const required = job.required(cfg, parsed)
  const missing = required.filter((r) => r.address.toLowerCase() === ZERO)
  if (missing.length) {
    return `waiting for the real contract addresses (${missing.map((m) => m.what).join(', ')} still zero)`
  }
  for (const r of required) {
    if (!(await hasCode(client, r.address))) {
      return `the ${r.what} ${r.address} has no code on chain ${cfg.network.chainId}`
    }
  }
  return null
}
