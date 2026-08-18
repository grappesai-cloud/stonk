/**
 * Citiri in lot. Daca lantul are Multicall3, o mie de citiri intra intr-un
 * singur eth_call. Daca nu, cad pe apeluri individuale grupate de transport
 * intr-o singura cerere HTTP. Ambele drumuri intorc acelasi lucru, deci
 * restul codului nu stie si nu il intereseaza pe care e.
 */
import type { Abi, Address, PublicClient } from 'viem'
import { pool } from './client.js'

export interface Call {
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
}

export type ReadResult<T = unknown> =
  | { status: 'success'; result: T }
  | { status: 'failure'; error: Error }

export interface ReaderOptions {
  /** cate apeluri intr-un multicall */
  chunk?: number
  /** paralelism cand nu exista multicall */
  concurrency?: number
  useMulticall?: boolean
}

export async function hasCode(client: PublicClient, address: Address): Promise<boolean> {
  const code = await client.getCode({ address })
  return !!code && code !== '0x'
}

export async function multiRead<T = unknown>(
  client: PublicClient,
  calls: Call[],
  opts: ReaderOptions = {}
): Promise<ReadResult<T>[]> {
  if (calls.length === 0) return []
  const chunk = opts.chunk ?? 200
  const concurrency = opts.concurrency ?? 12
  const canMulticall = opts.useMulticall !== false && !!client.chain?.contracts?.multicall3?.address

  if (canMulticall) {
    const out: ReadResult<T>[] = []
    for (let i = 0; i < calls.length; i += chunk) {
      const slice = calls.slice(i, i + chunk)
      try {
        const res = (await client.multicall({ contracts: slice as never, allowFailure: true })) as unknown as Array<
          { status: 'success'; result: unknown } | { status: 'failure'; error: unknown }
        >
        for (const r of res) {
          out.push(
            r.status === 'success'
              ? { status: 'success', result: r.result as T }
              : { status: 'failure', error: r.error as Error }
          )
        }
        continue
      } catch {
        // un multicall picat nu trebuie sa opreasca rularea: cadem pe citiri simple
        const single = await readOneByOne<T>(client, slice, concurrency)
        out.push(...single)
      }
    }
    return out
  }

  return readOneByOne<T>(client, calls, concurrency)
}

async function readOneByOne<T>(client: PublicClient, calls: Call[], concurrency: number): Promise<ReadResult<T>[]> {
  return pool(calls, concurrency, async (c) => {
    try {
      const result = (await client.readContract({
        address: c.address,
        abi: c.abi,
        functionName: c.functionName,
        args: c.args as never
      })) as T
      return { status: 'success', result } as ReadResult<T>
    } catch (e) {
      return { status: 'failure', error: e as Error } as ReadResult<T>
    }
  })
}

/** indexul unui camp din iesirile unei functii, dupa nume */
export function outputIndex(abi: Abi, functionName: string, field: string): number {
  const fn = abi.find((x) => x.type === 'function' && x.name === functionName)
  if (!fn || fn.type !== 'function') throw new Error(`functia ${functionName} nu e in ABI`)
  const idx = fn.outputs.findIndex((o) => o.name === field)
  if (idx < 0) {
    const names = fn.outputs.map((o, i) => o.name || `#${i}`).join(', ')
    throw new Error(`campul "${field}" nu exista in raspunsul lui ${functionName}. Campuri: ${names}`)
  }
  return idx
}

export function outputCount(abi: Abi, functionName: string): number {
  const fn = abi.find((x) => x.type === 'function' && x.name === functionName)
  if (!fn || fn.type !== 'function') throw new Error(`functia ${functionName} nu e in ABI`)
  return fn.outputs.length
}

export function functionNameOf(abi: Abi): string {
  const fn = abi.find((x) => x.type === 'function')
  if (!fn || fn.type !== 'function') throw new Error('ABI-ul nu contine nicio functie')
  return fn.name
}
