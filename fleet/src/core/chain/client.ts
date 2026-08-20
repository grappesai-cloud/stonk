/**
 * Legatura cu lantul. Doua lucruri care lipsesc din exemplele de manual si
 * fara de care un bot nu tine o noapte:
 *  - mai multe RPC-uri cu trecere automata pe urmatorul,
 *  - gruparea apelurilor intr-o singura cerere HTTP.
 */
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  fallback,
  http,
  type Account,
  type Chain,
  type PublicClient,
  type WalletClient
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { Config } from '../config.js'

export function chainOf(cfg: Config): Chain {
  return defineChain({
    id: cfg.network.chainId,
    name: cfg.network.name,
    nativeCurrency: { name: cfg.network.nativeSymbol, symbol: cfg.network.nativeSymbol, decimals: 18 },
    rpcUrls: { default: { http: cfg.network.rpc } },
    blockExplorers: cfg.network.explorer
      ? { default: { name: 'explorer', url: cfg.network.explorer } }
      : undefined,
    contracts: cfg.network.multicall3 ? { multicall3: { address: cfg.network.multicall3 } } : undefined
  })
}

export function publicClientOf(cfg: Config): PublicClient {
  const chain = chainOf(cfg)
  /**
   * Reincercari rabdatoare, dinadins.
   *
   * RPC-ul lantului sta in spatele Cloudflare, care nu raspunde cu "prea multe
   * cereri", ci cu o pagina de provocare de bot. Reincercarile scurte o
   * inrautatesc: mai multe cereri, exact cand esti deja pe lista. De aia pauza
   * incepe de la o secunda si creste, si de aia lotul de cereri e mai mic:
   * un pachet gras arata mai mult a robot decat trei subtiri.
   */
  const transports = cfg.network.rpc.map((url) =>
    http(url, { batch: { wait: 16, batchSize: 40 }, retryCount: 5, retryDelay: 1_000, timeout: 30_000 })
  )
  return createPublicClient({
    chain,
    transport: transports.length > 1 ? fallback(transports, { rank: false, retryCount: 2 }) : transports[0]!
  }) as PublicClient
}

/** substituentii din .env.example: inseamna "nu e pusa", nu "e gresita" */
const KEY_PLACEHOLDERS = new Set(['', '0x', '0x0', '0x00'])

export function accountOf(cfg: Config): Account | null {
  const key = cfg.execution.privateKey
  if (!key) return null
  const trimmed = key.trim()
  /* Fara linia asta, un `KEY=0x` ramas din .env.example arunca la fiecare
     pornire, containerul se reporneste la nesfarsit si in jurnal scrie ceva
     despre forma cheii, nu despre faptul ca nu ai pus-o. Un substituent
     inseamna cheie lipsa, si cheia lipsa e o stare normala: agentul citeste,
     masoara si asteapta. */
  if (KEY_PLACEHOLDERS.has(trimmed.toLowerCase())) return null
  const normalized = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`
  /* orice altceva stricat ramane eroare zgomotoasa: o cheie scrisa gresit
     trecuta cu vederea inseamna un bot care nu trimite nimic si nimeni nu
     stie de ce */
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error(`private key is malformed (expected 32 hex bytes, got ${trimmed.length} chars)`)
  }
  return privateKeyToAccount(normalized as `0x${string}`)
}

export function walletClientOf(cfg: Config, account: Account): WalletClient {
  const chain = chainOf(cfg)
  return createWalletClient({
    account,
    chain,
    transport: http(cfg.network.rpc[0]!, { retryCount: 2, timeout: 30_000 })
  })
}

/** rulare cu limita de paralelism, fara dependinta externa */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return out
}
