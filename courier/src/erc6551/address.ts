/**
 * Adresa portofelului legat de token (ERC-6551), calculata offline.
 *
 * Asta e piesa pe care sta tot Courier-ul: nu trebuie sa asculti niciun
 * eveniment si nu trebuie ca portofelul sa fie desfasurat ca sa stii unde
 * aterizeaza o livrare. Codul contului e un proxy minimal cu 128 de octeti
 * lipiti la coada (salt, chainId, tokenContract, tokenId), deci adresa iese
 * dintr-un CREATE2 pe care il poti reface local pentru zeci de mii de NFT-uri
 * fara sa atingi lantul.
 */
import { concatHex, getCreate2Address, keccak256, numberToHex, pad, type Address, type Hex } from 'viem'

/** ERC-1167 cu lungimea runtime marita la 0x2d + 0x80 pentru datele lipite */
const PROXY_HEAD = '0x3d60ad80600a3d3981f3363d3d373d3d3d363d73' as const
const PROXY_TAIL = '0x5af43d82803e903d91602b57fd5bf3' as const

export interface TbaParams {
  registry: Address
  implementation: Address
  salt: Hex
  chainId: number | bigint
  tokenContract: Address
  tokenId: bigint
}

export function tbaCreationCode(p: Omit<TbaParams, 'registry'>): Hex {
  return concatHex([
    PROXY_HEAD,
    p.implementation,
    PROXY_TAIL,
    p.salt,
    pad(numberToHex(BigInt(p.chainId)), { size: 32 }),
    pad(p.tokenContract, { size: 32 }),
    pad(numberToHex(p.tokenId), { size: 32 })
  ])
}

export function tbaAddress(p: TbaParams): Address {
  return getCreate2Address({
    from: p.registry,
    salt: p.salt,
    bytecodeHash: keccak256(tbaCreationCode(p))
  })
}

/** varianta in lot, pentru toata colectia deodata */
export function tbaAddresses(base: Omit<TbaParams, 'tokenId'>, tokenIds: bigint[]): Map<bigint, Address> {
  const out = new Map<bigint, Address>()
  for (const id of tokenIds) out.set(id, tbaAddress({ ...base, tokenId: id }))
  return out
}

export const REGISTRY_ABI = [
  {
    type: 'function',
    name: 'account',
    stateMutability: 'view',
    inputs: [
      { name: 'implementation', type: 'address' },
      { name: 'salt', type: 'bytes32' },
      { name: 'chainId', type: 'uint256' },
      { name: 'tokenContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'address' }]
  }
] as const
