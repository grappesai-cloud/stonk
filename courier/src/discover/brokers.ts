/**
 * Descoperirea brokerilor si a portofelelor lor.
 *
 * Trei strategii, pentru ca nu orice colectie e la fel:
 *  - range: id-uri consecutive, se citeste doar totalSupply (cel mai ieftin)
 *  - enumerable: tokenByIndex, cand id-urile au goluri
 *  - logs: scanare de evenimente Transfer, cand nu exista niciuna din cele doua
 */
import type { Address, PublicClient } from 'viem'
import { parseAbiItem } from 'viem'
import { abiOf, type Config } from '../config.js'
import { multiRead, type Call } from '../chain/reader.js'
import { tbaAddresses } from '../erc6551/address.js'
import { log } from '../log.js'

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)')

export async function discoverTokenIds(client: PublicClient, cfg: Config): Promise<bigint[]> {
  const { idStrategy, firstId, maxId } = cfg.brokers

  if (idStrategy === 'logs') return discoverByLogs(client, cfg)

  const supplyAbi = abiOf(cfg.brokers.supplySignature, 'brokers.supplySignature')
  const supply = (await client.readContract({
    address: cfg.brokers.address,
    abi: supplyAbi,
    functionName: 'totalSupply'
  })) as bigint

  if (idStrategy === 'range') {
    const ids: bigint[] = []
    const last = maxId ? BigInt(maxId) : BigInt(firstId) + supply - 1n
    for (let id = BigInt(firstId); id <= last; id++) ids.push(id)
    return ids
  }

  // enumerable
  const enumAbi = abiOf('function tokenByIndex(uint256 index) view returns (uint256)', 'tokenByIndex')
  const calls: Call[] = []
  for (let i = 0n; i < supply; i++) {
    calls.push({ address: cfg.brokers.address, abi: enumAbi, functionName: 'tokenByIndex', args: [i] })
  }
  const res = await multiRead<bigint>(client, calls, { chunk: 400 })
  const ids: bigint[] = []
  for (const r of res) if (r.status === 'success') ids.push(r.result)
  return ids
}

async function discoverByLogs(client: PublicClient, cfg: Config): Promise<bigint[]> {
  const latest = await client.getBlockNumber()
  const from = cfg.brokers.deployBlock
  const step = 9_000n
  const ids = new Set<bigint>()

  for (let start = from; start <= latest; start += step) {
    const end = start + step - 1n > latest ? latest : start + step - 1n
    const logs = await client.getLogs({ address: cfg.brokers.address, event: TRANSFER, fromBlock: start, toBlock: end })
    for (const l of logs) {
      const id = l.args?.tokenId
      if (typeof id === 'bigint') ids.add(id)
    }
    if (end === latest) break
  }
  log.debug({ found: ids.size }, 'id-uri gasite din evenimente')
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** portofelele 6551, calculate local, fara nicio citire */
export function walletsOf(cfg: Config, tokenIds: bigint[]): Map<bigint, Address> {
  return tbaAddresses(
    {
      registry: cfg.erc6551.registry,
      implementation: cfg.erc6551.implementation,
      salt: cfg.erc6551.salt,
      chainId: cfg.network.chainId,
      tokenContract: cfg.brokers.address
    },
    tokenIds
  )
}

export async function ownersOf(client: PublicClient, cfg: Config, tokenIds: bigint[]): Promise<Map<bigint, Address>> {
  const abi = abiOf(cfg.brokers.ownerSignature, 'brokers.ownerSignature')
  const calls: Call[] = tokenIds.map((id) => ({
    address: cfg.brokers.address,
    abi,
    functionName: 'ownerOf',
    args: [id]
  }))
  const res = await multiRead<Address>(client, calls, { chunk: 300 })
  const out = new Map<bigint, Address>()
  res.forEach((r, i) => {
    if (r.status === 'success') out.set(tokenIds[i]!, r.result)
  })
  return out
}
