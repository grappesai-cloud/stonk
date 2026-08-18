/**
 * Telegram: fata produsului.
 *
 * Doua canale, o singura regula de securitate care le acopera pe amandoua:
 * botul e DOAR citire. Nu cere conectare de portofel, nu cere semnaturi, nu
 * are nicio functie care semneaza ceva. Omul lipeste o adresa publica si
 * primeste evenimente pe care oricine le poate vedea pe explorer.
 *
 * Efectul secundar care conteaza: daca regula e publica si absoluta, atunci
 * orice bot clona care cere conectare se demasca singur.
 */
import { isAddress, getAddress, formatEther, type Address } from 'viem'
import type { Config } from '../config.js'
import type { Ledger } from '../ledger/db.js'
import { log } from '../log.js'

export interface DeliveryNews {
  tokenId: string
  wallet: Address
  owner: Address | null
  valueWei: bigint
  tipWei: bigint
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

  private async call<T>(method: string, body: Record<string, unknown>): Promise<T | null> {
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
        // 429: Telegram spune singur cat sa astepti
        const wait = json.parameters?.retry_after
        if (wait) {
          await sleep(wait * 1000 + 250)
          return this.call<T>(method, body)
        }
        log.warn({ method, err: json.description }, 'telegram a refuzat cererea')
        return null
      }
      return json.result ?? null
    } catch (e) {
      log.warn({ method, err: (e as Error).message }, 'telegram nu a raspuns')
      return null
    }
  }

  /** trimiterile se serializeaza cu o pauza intre ele, ca sa nu intram in limita */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn)
    this.queue = next.then(
      () => sleep(45),
      () => sleep(45)
    )
    return next as Promise<T>
  }

  async send(chatId: string, text: string, disablePreview = true): Promise<boolean> {
    if (!this.enabled) return false
    const r = await this.enqueue(() =>
      this.call<unknown>('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: disablePreview
      })
    )
    return r !== null
  }

  async toChannel(text: string): Promise<boolean> {
    const ch = this.cfg.alerts.telegram.channel
    if (!ch) return false
    return this.send(ch, text)
  }

  /**
   * Anuntul livrarilor. Pana la un prag se posteaza fiecare, peste prag se
   * posteaza un rezumat: un flux care da zeci de mesaje pe minut ajunge pe mut
   * intr-o saptamana, si atunci canalul nu mai exista.
   */
  async announce(items: DeliveryNews[]): Promise<void> {
    if (!this.enabled || items.length === 0) return
    const t = this.cfg.alerts.telegram
    const explorer = this.cfg.network.explorer

    if (items.length >= t.batchThreshold) {
      const total = items.reduce((s, i) => s + i.valueWei, 0n)
      const wallets = new Set(items.map((i) => i.wallet.toLowerCase())).size
      const tx = items.find((i) => i.txHash)?.txHash
      await this.toChannel(
        [
          `<b>COURIER · ${items.length} deliveries</b>`,
          `${fmt(total)} ${this.cfg.network.nativeSymbol} pushed into ${wallets} broker wallets.`,
          tx && explorer ? `<a href="${explorer}/tx/${tx}">transaction</a>` : ''
        ]
          .filter(Boolean)
          .join('\n')
      )
    } else {
      for (const i of items) {
        if (i.valueWei < t.perEventMinValueWei) continue
        await this.toChannel(
          [
            `<b>COURIER · delivered</b>`,
            `Broker #${esc(i.tokenId)} received ${fmt(i.valueWei)} ${this.cfg.network.nativeSymbol}.`,
            i.txHash && explorer ? `<a href="${explorer}/tx/${i.txHash}">transaction</a>` : ''
          ]
            .filter(Boolean)
            .join('\n')
        )
      }
    }

    // apoi fiecare om care urmareste o adresa implicata
    for (const i of items) {
      const targets = new Set<string>()
      for (const chat of this.ledger.watchersOf(i.wallet)) targets.add(chat)
      if (i.owner) for (const chat of this.ledger.watchersOf(i.owner)) targets.add(chat)
      for (const chat of targets) {
        await this.send(
          chat,
          [
            `<b>Delivered to you</b>`,
            `Broker #${esc(i.tokenId)} · ${fmt(i.valueWei)} ${this.cfg.network.nativeSymbol}`,
            i.txHash && explorer ? `<a href="${explorer}/tx/${i.txHash}">transaction</a>` : ''
          ]
            .filter(Boolean)
            .join('\n')
        )
      }
    }
  }

  async gasLow(balanceWei: bigint, address: Address): Promise<void> {
    const threshold = this.cfg.alerts.telegram.gasLowWei
    if (!this.enabled || threshold === 0n || balanceWei >= threshold) return
    const key = 'alert:gaslow'
    const last = Number(this.ledger.kvGet(key) ?? 0)
    const nowSec = Math.floor(Date.now() / 1000)
    if (nowSec - last < 6 * 3600) return // maxim o data la sase ore
    this.ledger.kvSet(key, String(nowSec))
    await this.toChannel(
      `<b>COURIER · low on gas</b>\nOperator ${esc(short(address))} is down to ${fmt(balanceWei)} ${this.cfg.network.nativeSymbol}. Deliveries stop when it hits zero.`
    )
  }

  /** rezumatul zilnic, o data pe zi la ora din configurare */
  async maybeDigest(): Promise<void> {
    const hour = this.cfg.alerts.telegram.digestHour
    if (!this.enabled || hour === null) return
    const d = new Date()
    if (d.getHours() !== hour) return
    const key = `digest:${d.toISOString().slice(0, 10)}`
    if (this.ledger.kvGet(key)) return
    this.ledger.kvSet(key, '1')

    const day = Math.floor(Date.now() / 1000) - 86400
    const t = this.ledger.totals(day)
    const wall = this.ledger.wallTotals()
    await this.toChannel(
      [
        `<b>COURIER · last 24h</b>`,
        `${t.deliveries} deliveries into ${t.wallets} wallets`,
        `${fmt(t.valueWei)} ${this.cfg.network.nativeSymbol} moved · ${fmt(t.tipsWei)} earned · ${fmt(t.gasWei)} gas`,
        `Still unclaimed: ${wall.count} wallets holding ${fmt(wall.valueWei)}, oldest sitting ${wall.oldestDays} days.`
      ].join('\n')
    )
  }

  /**
   * Comenzile botului privat. Nimic aici nu semneaza si nu scrie pe lant.
   */
  async poll(): Promise<void> {
    if (!this.enabled || !this.cfg.alerts.watchers.enabled) return
    const offset = Number(this.ledger.kvGet('tg:offset') ?? 0)
    const updates = await this.call<Array<Record<string, any>>>('getUpdates', {
      offset: offset + 1,
      timeout: 0,
      allowed_updates: ['message']
    })
    if (!updates || updates.length === 0) return

    for (const u of updates) {
      this.ledger.kvSet('tg:offset', String(u.update_id))
      const msg = u.message
      if (!msg?.text || !msg.chat?.id) continue
      const chatId = String(msg.chat.id)
      const [cmdRaw, ...rest] = String(msg.text).trim().split(/\s+/)
      const cmd = (cmdRaw ?? '').toLowerCase().split('@')[0]
      const arg = rest[0] ?? ''
      await this.handle(chatId, cmd ?? '', arg)
    }
  }

  private async handle(chatId: string, cmd: string, arg: string): Promise<void> {
    const sym = this.cfg.network.nativeSymbol
    switch (cmd) {
      case '/start':
      case '/help':
        await this.send(
          chatId,
          [
            `<b>Courier</b> watches broker wallets and tells you when something lands.`,
            ``,
            `/watch 0x...  follow an address`,
            `/unwatch 0x... or /unwatch all`,
            `/list  what you follow`,
            `/wall  what is still unclaimed`,
            `/stats  what the fleet did`,
            ``,
            `<b>We never ask you to connect a wallet.</b> This bot only reads what the chain already shows everyone. Any bot that asks you to connect or sign is not us.`
          ].join('\n')
        )
        return

      case '/watch': {
        if (!isAddress(arg)) {
          await this.send(chatId, 'Paste a valid address: <code>/watch 0x...</code>')
          return
        }
        const address = getAddress(arg)
        if (this.ledger.countAddressesOfChat(chatId) >= this.cfg.alerts.watchers.maxAddressesPerChat) {
          await this.send(chatId, 'You already follow the maximum number of addresses.')
          return
        }
        if (this.ledger.countWatchersOfAddress(address) >= this.cfg.alerts.watchers.maxChatsPerAddress) {
          await this.send(chatId, 'That address already has too many watchers.')
          return
        }
        this.ledger.addWatcher(chatId, address, null)
        await this.send(chatId, `Watching ${esc(short(address))}. Nothing was connected and nothing was signed.`)
        return
      }

      case '/unwatch': {
        const all = arg.toLowerCase() === 'all'
        const removed = this.ledger.removeWatcher(chatId, all ? null : isAddress(arg) ? getAddress(arg) : arg)
        await this.send(chatId, removed > 0 ? `Removed ${removed}.` : 'Nothing to remove.')
        return
      }

      case '/list': {
        const list = this.ledger.addressesOf(chatId)
        await this.send(
          chatId,
          list.length ? list.map((a) => `<code>${esc(a)}</code>`).join('\n') : 'You follow nothing yet.'
        )
        return
      }

      case '/wall': {
        const w = this.ledger.wallTotals()
        const top = this.ledger.wall(5)
        await this.send(
          chatId,
          [
            `<b>Unclaimed right now</b>`,
            `${w.count} wallets holding ${fmt(w.valueWei)} ${sym}, oldest sitting ${w.oldestDays} days.`,
            ``,
            ...top.map((r) => `#${esc(r.tokenId)} · ${fmt(r.valueWei)} ${sym} · ${r.ageDays}d`)
          ].join('\n')
        )
        return
      }

      case '/stats': {
        const t = this.ledger.totals(0)
        await this.send(
          chatId,
          [
            `<b>Courier, all time</b>`,
            `${t.deliveries} deliveries into ${t.wallets} wallets`,
            `${fmt(t.valueWei)} ${sym} delivered`,
            `${fmt(t.tipsWei)} earned · ${fmt(t.gasWei)} spent on gas`
          ].join('\n')
        )
        return
      }

      default:
        return
    }
  }
}

function fmt(wei: bigint): string {
  const s = formatEther(wei)
  const n = Number(s)
  if (n === 0) return '0'
  if (n < 0.0001) return n.toExponential(2)
  return n.toFixed(n < 1 ? 4 : 3)
}

function short(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
