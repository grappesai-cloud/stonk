/**
 * Telegram: fata produsului.
 *
 * O singura regula de securitate, aceeasi ca la Courier: botul e DOAR citire.
 * Nu cere conectare de portofel, nu cere semnaturi, nu are nicio comanda care
 * semneaza ceva. Efectul secundar care conteaza: daca regula e publica si
 * absoluta, orice clona care cere conectare se demasca singura.
 */
import { formatEther } from 'viem'
import type { Config } from '../config.js'
import type { Ledger } from '../ledger/db.js'
import { log } from '../log.js'

export interface WorkNews {
  key: string
  label: string
  rewardWei: bigint
  gasWei: bigint
  txHash: string | null
}

interface TgResponse<T> {
  ok: boolean
  result?: T
  description?: string
  parameters?: { retry_after?: number }
}

export class Telegram {
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private cfg: Config,
    private ledger: Ledger
  ) {}

  get enabled(): boolean {
    return this.cfg.alerts.telegram.enabled && !!this.cfg.alerts.telegram.token
  }

  async call<T>(method: string, body: Record<string, unknown>): Promise<T | null> {
    const token = this.cfg.alerts.telegram.token
    if (!token) return null
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000)
      })
      const json = (await res.json()) as TgResponse<T>
      if (!json.ok) {
        const wait = json.parameters?.retry_after
        if (wait) {
          await sleep(wait * 1000 + 250)
          return this.call<T>(method, body)
        }
        log.warn({ method, err: json.description }, 'telegram refused the request')
        return null
      }
      return json.result ?? null
    } catch (e) {
      log.warn({ method, err: (e as Error).message }, 'telegram did not answer')
      return null
    }
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn)
    this.queue = next.then(
      () => sleep(45),
      () => sleep(45)
    )
    return next as Promise<T>
  }

  async send(chatId: string, text: string): Promise<boolean> {
    if (!this.enabled) return false
    const r = await this.enqueue(() =>
      this.call<unknown>('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    )
    return r !== null
  }

  async toChannel(text: string): Promise<boolean> {
    const ch = this.cfg.alerts.telegram.channel
    if (!ch) return false
    return this.send(ch, text)
  }

  async announce(items: WorkNews[]): Promise<void> {
    if (!this.enabled || items.length === 0) return
    const t = this.cfg.alerts.telegram
    const name = this.cfg.agent.name
    const worthy = items.filter((i) => i.rewardWei >= t.perEventMinRewardWei)
    if (worthy.length === 0) return
    if (worthy.length > 3) {
      const reward = worthy.reduce((s, i) => s + i.rewardWei, 0n)
      await this.toChannel(`<b>${name}</b> did ${worthy.length} jobs, earning ${eth(reward)} ${this.symbol}`)
      return
    }
    for (const i of worthy) {
      const link = this.link(i.txHash)
      await this.toChannel(`<b>${name}</b> ${i.label} -> ${eth(i.rewardWei)} ${this.symbol}${link}`)
    }
  }

  /**
   * Cursa pierduta. Merita un mesaj propriu, nu unul de eroare: nu e o
   * defectiune, e informatie despre piata. Cine citeste canalul trebuie sa
   * vada si cand agentul ajunge al doilea.
   */
  async lostRace(key: string, winner: string, winnerGasPriceWei: bigint, ourGasPriceWei: bigint): Promise<void> {
    if (!this.enabled) return
    await this.toChannel(
      `<b>${this.cfg.agent.name}</b> lost ${key} to <code>${winner}</code>` +
        ` (they paid ${gwei(winnerGasPriceWei)} gwei, we were at ${gwei(ourGasPriceWei)})`
    )
  }

  async gasLow(balanceWei: bigint, address: string): Promise<void> {
    const floor = this.cfg.alerts.telegram.gasLowWei
    if (!this.enabled || floor === 0n || balanceWei >= floor) return
    const last = Number(this.ledger.kvGet('alert.gasLow') ?? 0)
    const now = Math.floor(Date.now() / 1000)
    if (now - last < 6 * 3600) return
    this.ledger.kvSet('alert.gasLow', String(now))
    await this.toChannel(
      `<b>${this.cfg.agent.name}</b> is running out of gas: ${eth(balanceWei)} ${this.symbol} left at <code>${address}</code>`
    )
  }

  /** rezumatul zilnic, o data pe zi, la ora din configurare */
  async maybeDigest(): Promise<void> {
    const hour = this.cfg.alerts.telegram.digestHour
    if (!this.enabled || hour === null) return
    const now = new Date()
    if (now.getHours() !== hour) return
    const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
    if (this.ledger.kvGet('digest.day') === day) return
    this.ledger.kvSet('digest.day', day)

    const since = Math.floor(Date.now() / 1000) - 86400
    const t = this.ledger.totals(since)
    const races = this.ledger.raceStats(since)
    const open = this.ledger.openTotals()
    const lines = [
      `<b>${this.cfg.agent.name}</b> - last 24h`,
      `${t.done} jobs, earned ${eth(t.rewardWei)}, burned ${eth(t.gasWei)}, net ${eth(t.netWei)} ${this.symbol}`,
      races.total > 0
        ? `races: ${races.won}/${races.total} won (${Math.round(races.winRate * 100)}%), ${races.competitors} other bots seen`
        : 'races: none seen',
      `${open.count} open now`
    ]
    await this.toChannel(lines.join('\n'))
  }

  private get symbol(): string {
    return this.cfg.network.nativeSymbol
  }

  private link(txHash: string | null): string {
    if (!txHash || !this.cfg.network.explorer) return ''
    return `\n<a href="${this.cfg.network.explorer}/tx/${txHash}">tx</a>`
  }
}

function eth(wei: bigint): string {
  const s = formatEther(wei)
  const n = Number(s)
  return n === 0 ? '0' : n < 0.0001 ? s : n.toFixed(5)
}

function gwei(wei: bigint): string {
  return (Number(wei) / 1e9).toFixed(2)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
