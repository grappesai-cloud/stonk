import type { Account, PublicClient, WalletClient } from 'viem'
import { loadConfig, type Config } from './config.js'
import { accountOf, publicClientOf, walletClientOf } from './chain/client.js'
import { Ledger } from './ledger/db.js'
import { Telegram } from './alerts/telegram.js'

export interface Ctx {
  cfg: Config
  client: PublicClient
  account: Account | null
  wallet: WalletClient | null
  ledger: Ledger
  tg: Telegram
}

/** adresa folosita la simulari cand nu exista cheie: un strain oarecare */
export const STRANGER = '0x000000000000000000000000000000000000dEaD' as const

export function buildContext(configPath: string): Ctx {
  const cfg = loadConfig(configPath)
  const client = publicClientOf(cfg)
  const account = accountOf(cfg)
  const wallet = account ? walletClientOf(cfg, account) : null
  const ledger = new Ledger(cfg.storage.file)
  const tg = new Telegram(cfg, ledger)
  return { cfg, client, account, wallet, ledger, tg }
}
