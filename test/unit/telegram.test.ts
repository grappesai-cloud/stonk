/**
 * Telegram, cu reteaua inlocuita.
 *
 * Nu testez ca Telegram raspunde, aia e treaba lor. Testez ce trimit eu: ce
 * mesaj pleaca, cui, cand se grupeaza, si mai ales ca nu exista nicio comanda
 * care sa scrie pe lant sau sa ceara o semnatura.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseEther, type Address } from 'viem'
import { ConfigSchema, type Config } from '../../src/config.js'
import { Ledger } from '../../src/ledger/db.js'
import { Telegram } from '../../src/alerts/telegram.js'

const A = '0x1111111111111111111111111111111111111111' as Address
const W = '0x2222222222222222222222222222222222222222' as Address

interface Sent {
  method: string
  body: Record<string, unknown>
}

let sent: Sent[] = []

function cfg(over: Record<string, unknown> = {}): Config {
  return ConfigSchema.parse({
    network: { name: 't', chainId: 4663, rpc: ['http://x.test'], explorer: 'https://exp.test' },
    erc6551: { registry: A, implementation: W },
    brokers: { address: A },
    drops: {
      address: W,
      pending: { signature: 'function p(uint256 a) view returns (uint256 ethAmount)', nativeFields: ['ethAmount'] },
      deliverSignature: 'function deliver(uint256 a)'
    },
    alerts: { telegram: { enabled: true, token: 'test-token', channel: '@canal', batchThreshold: 3 } },
    ...over
  })
}

beforeEach(() => {
  sent = []
  vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
    sent.push({ method: url.split('/').pop()!, body: JSON.parse(init.body) })
    return { json: async () => ({ ok: true, result: [] }) } as unknown as Response
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function make(over: Record<string, unknown> = {}) {
  const ledger = new Ledger(':memory:')
  return { tg: new Telegram(cfg(over), ledger), ledger }
}

async function feed(tg: Telegram, ledger: Ledger, text: string, chat = '77'): Promise<void> {
  vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
    const method = url.split('/').pop()!
    sent.push({ method, body: JSON.parse(init.body) })
    if (method === 'getUpdates') {
      return {
        json: async () => ({ ok: true, result: [{ update_id: Date.now(), message: { text, chat: { id: chat } } }] })
      } as unknown as Response
    }
    return { json: async () => ({ ok: true, result: {} }) } as unknown as Response
  })
  await tg.poll()
}

const texts = () => sent.filter((s) => s.method === 'sendMessage').map((s) => String(s.body.text))

describe('urmaritorii', () => {
  it('accepta o adresa lipita si spune pe fata ca nu s-a conectat nimic', async () => {
    const { tg, ledger } = make()
    await feed(tg, ledger, `/watch ${W}`)
    expect(ledger.addressesOf('77')).toEqual([W.toLowerCase()])
    expect(texts().join(' ')).toMatch(/nothing was connected and nothing was signed/i)
    ledger.close()
  })

  it('refuza o adresa stricata fara sa o salveze', async () => {
    const { tg, ledger } = make()
    await feed(tg, ledger, '/watch 0xnuesteadresa')
    expect(ledger.addressesOf('77')).toEqual([])
    expect(texts().join(' ')).toMatch(/valid address/i)
    ledger.close()
  })

  it('opreste inscrierea peste limita, ca sa nu poata cineva urmari tot lantul', async () => {
    const { tg, ledger } = make({ alerts: { telegram: { enabled: true, token: 't', channel: '@c' }, watchers: { maxAddressesPerChat: 1 } } })
    await feed(tg, ledger, `/watch ${W}`)
    await feed(tg, ledger, `/watch ${A}`)
    expect(ledger.addressesOf('77').length).toBe(1)
    expect(texts().join(' ')).toMatch(/maximum number of addresses/i)
    ledger.close()
  })

  it('/unwatch all sterge tot ce urmarea acel chat', async () => {
    const { tg, ledger } = make()
    await feed(tg, ledger, `/watch ${W}`)
    await feed(tg, ledger, `/watch ${A}`)
    await feed(tg, ledger, '/unwatch all')
    expect(ledger.addressesOf('77')).toEqual([])
    ledger.close()
  })

  it('ajutorul spune regula de securitate, nu doar comenzile', async () => {
    const { tg, ledger } = make()
    await feed(tg, ledger, '/help')
    expect(texts().join(' ')).toMatch(/never ask you to connect a wallet/i)
    ledger.close()
  })

  it('nu exista nicio comanda care sa ceara semnatura sau cheie', async () => {
    const { tg, ledger } = make()
    for (const c of ['/start', '/help', '/list', '/wall', '/stats']) await feed(tg, ledger, c)
    const all = texts().join(' ').toLowerCase()
    expect(all).not.toMatch(/private key|seed phrase|connect wallet|sign this|approve/)
    ledger.close()
  })
})

describe('anuntul livrarilor', () => {
  const news = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      tokenId: String(i + 1),
      wallet: W,
      owner: A,
      valueWei: parseEther('0.25'),
      tipWei: parseEther('0.001'),
      txHash: '0xabc'
    }))

  it('sub prag posteaza fiecare livrare', async () => {
    const { tg, ledger } = make()
    await tg.announce(news(2))
    const toChannel = sent.filter((s) => s.body.chat_id === '@canal')
    expect(toChannel.length).toBe(2)
    ledger.close()
  })

  it('peste prag posteaza un singur rezumat, ca sa nu ajunga canalul pe mut', async () => {
    const { tg, ledger } = make()
    await tg.announce(news(9))
    const toChannel = sent.filter((s) => s.body.chat_id === '@canal')
    expect(toChannel.length).toBe(1)
    expect(String(toChannel[0]!.body.text)).toMatch(/9 deliveries/)
    ledger.close()
  })

  it('trimite si celui care urmarea adresa, o singura data', async () => {
    const { tg, ledger } = make()
    ledger.addWatcher('42', W, null)
    ledger.addWatcher('42', A, null) // urmareste si portofelul, si proprietarul
    await tg.announce(news(1))
    const mine = sent.filter((s) => s.body.chat_id === '42')
    expect(mine.length).toBe(1)
    expect(String(mine[0]!.body.text)).toMatch(/Delivered to you/)
    ledger.close()
  })

  it('pune link spre explorer cand exista', async () => {
    const { tg, ledger } = make()
    await tg.announce(news(1))
    expect(texts().join(' ')).toContain('https://exp.test/tx/0xabc')
    ledger.close()
  })
})

describe('alerta de gaz', () => {
  it('se aprinde sub prag si nu se repeta mai des de sase ore', async () => {
    const { tg, ledger } = make({
      alerts: { telegram: { enabled: true, token: 't', channel: '@canal', gasLowWei: parseEther('0.01').toString() } }
    })
    await tg.gasLow(parseEther('0.001'), A)
    await tg.gasLow(parseEther('0.001'), A)
    expect(sent.filter((s) => s.method === 'sendMessage').length).toBe(1)
    ledger.close()
  })

  it('tace cand soldul e peste prag', async () => {
    const { tg, ledger } = make({
      alerts: { telegram: { enabled: true, token: 't', channel: '@canal', gasLowWei: parseEther('0.01').toString() } }
    })
    await tg.gasLow(parseEther('1'), A)
    expect(sent.length).toBe(0)
    ledger.close()
  })
})

describe('cand e oprit', () => {
  it('nu iese nicio cerere din proces', async () => {
    const ledger = new Ledger(':memory:')
    const tg = new Telegram(ConfigSchema.parse({ ...cfg(), alerts: { telegram: { enabled: false } } }), ledger)
    await tg.announce([{ tokenId: '1', wallet: W, owner: A, valueWei: 1n, tipWei: 0n, txHash: null }])
    await tg.poll()
    expect(sent.length).toBe(0)
    ledger.close()
  })
})
