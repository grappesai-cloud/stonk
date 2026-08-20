/**
 * Batched reads. One agent watching one contract can afford a read per call;
 * one agent watching 700 vaults cannot. When the chain has a Multicall3 and
 * the client knows how to use it, hundreds of reads collapse into a handful
 * of RPC round trips. When either is missing (unit tests, odd chains), the
 * same calls fall back to plain reads, so callers never branch.
 *
 * A failed call returns null instead of throwing: with hundreds of reads in
 * flight, one broken token must not take down the whole scan.
 */
import type { Abi, Address, PublicClient } from 'viem'

export interface BatchCall {
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
}

export async function batchRead(
  client: PublicClient,
  multicall3: Address | null,
  calls: BatchCall[],
  chunkSize = 300
): Promise<(unknown | null)[]> {
  if (calls.length === 0) return []

  const canMulticall = multicall3 !== null && typeof (client as { multicall?: unknown }).multicall === 'function'
  if (canMulticall) {
    const out: (unknown | null)[] = []
    for (let i = 0; i < calls.length; i += chunkSize) {
      const part = calls.slice(i, i + chunkSize)
      const res = (await client.multicall({
        contracts: part as never,
        multicallAddress: multicall3 as Address,
        allowFailure: true
      })) as { status: string; result?: unknown }[]
      for (const r of res) out.push(r.status === 'success' ? (r.result as unknown) : null)
    }
    return out
  }

  return Promise.all(
    calls.map((c) =>
      client
        .readContract({ address: c.address, abi: c.abi, functionName: c.functionName, args: c.args } as never)
        .then((r) => r as unknown)
        .catch(() => null)
    )
  )
}
