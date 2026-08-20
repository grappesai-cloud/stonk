/**
 * Semnaturile de evenimente din configurari chiar decodeaza ce e pe lant?
 *
 * Verificarea exista fiindca greseala se ascunde perfect: `indexed` nu schimba
 * topicul, deci filtrul se potriveste si pare ca merge. Decodarea insa arunca,
 * iar caietul de curse ramane gol fara sa se planga nimeni.
 */
import { createPublicClient, http, parseAbi, toEventSelector, decodeEventLog, type Address } from 'viem'
import { readFileSync } from 'node:fs'
const RPC = 'https://rpc.mainnet.chain.robinhood.com'
const client = createPublicClient({ chain: { id: 4663, name: 'rh', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as never, transport: http(RPC) })
const head = await client.getBlockNumber()
for (const f of ['config/ringer.json', 'config/courier.json', 'config/crank.json']) {
  const c = JSON.parse(readFileSync(f, 'utf8'))
  const sig = c.job?.event?.signature
  if (!sig) { console.log(f, 'fara eveniment'); continue }
  const abi = parseAbi([sig])
  const topic = toEventSelector(abi[0] as never)
  let found = 0, ok = 0, failed = 0
  /* ferestre mici si multe: contractele astea emit mult, iar RPC-ul refuza
     intervalele mari. Un eveniment rar (o runda pe saptamana) cere si cautat
     mai in urma. */
  for (let back = 60_000n; back <= 3_000_000n && found === 0; back += 60_000n) {
    try {
      const logs = await client.getLogs({ address: c.target.address as Address, fromBlock: head - back, toBlock: head - back + 20_000n })
      for (const l of logs) {
        if (l.topics[0] !== topic) continue
        found++
        try { decodeEventLog({ abi, data: l.data, topics: l.topics as never }); ok++ } catch { /* nu decodeaza */ }
      }
    } catch {
      failed++
    }
  }
  const verdict = found === 0 ? 'niciun eveniment gasit inca (poate fi rar)' : ok === found ? 'TOATE decodeaza' : `${found - ok} NU decodeaza`
  console.log(`  ${f.padEnd(22)} ${String(found).padStart(4)} gasite | ${verdict}${failed ? ` (${failed} ferestre picate)` : ''}`)
}
