import type { Account, PublicClient, WalletClient } from 'viem'
import { loadConfig, type Config } from './config.js'
import { accountOf, publicClientOf, walletClientOf } from './chain/client.js'
import { Ledger } from './ledger/db.js'
import { Telegram } from './alerts/telegram.js'
import { Controller } from './control.js'
import { jobFor } from '../jobs/index.js'
import type { Job } from './work.js'
export { STRANGER } from './work.js'

export interface Ctx {
  cfg: Config
  client: PublicClient
  account: Account | null
  wallet: WalletClient | null
  ledger: Ledger
  tg: Telegram
  control: Controller
  job: Job<never>
  /** blocul `job` din configurare, deja validat de modulul meseriei */
  jobCfg: never
}

export function buildContext(configPath: string): Ctx {
  const cfg = loadConfig(configPath)
  const client = publicClientOf(cfg)
  const account = accountOf(cfg)
  const wallet = account ? walletClientOf(cfg, account) : null
  const ledger = new Ledger(cfg.storage.file)
  const tg = new Telegram(cfg, ledger)
  const job = jobFor(cfg.agent.kind)
  const jobCfg = job.parse(cfg.job) as never
  return { cfg, client, account, wallet, ledger, tg, control: new Controller(), job, jobCfg }
}
