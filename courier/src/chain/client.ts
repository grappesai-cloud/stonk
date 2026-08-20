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
  const transports = cfg.network.rpc.map((url) =>
    http(url, { batch: { wait: 8, batchSize: 100 }, retryCount: 3, retryDelay: 250, timeout: 20_000 })
  )
  return createPublicClient({
    chain,
    transport: transports.length > 1 ? fallback(transports, { rank: false, retryCount: 2 }) : transports[0]!
  }) as PublicClient
}

export function accountOf(cfg: Config): Account | null {
  const key = cfg.execution.privateKey
  if (!key) return null
  const normalized = key.startsWith('0x') ? key : `0x${key}`
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error('cheia privata nu are forma asteptata (32 de octeti hex)')
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
