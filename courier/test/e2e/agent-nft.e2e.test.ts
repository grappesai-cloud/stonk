/**
 * Contractul agentului, pe lant.
 *
 * Ce trebuie dovedit: ca arde cat spune, ca nu retine nimic pentru el, ca
 * rezerva nu poate fi depasita, ca rolul se poate schimba, ca portofelul
 * calculat e cel adevarat, si ca fotografia pentru cumparator se misca la
 * fiecare transfer.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPublicClient, createWalletClient, http, parseEther, getAddress, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { artifact, localChain, startAnvil, ANVIL_KEY, ANVIL_KEY_2, type Anvil } from './harness.js'
import { tbaAddress } from '../../src/erc6551/address.js'

const PORT = 8563
const SALT = ('0x' + '00'.repeat(32)) as Hex
const PRICE = parseEther('100') // 100 jetoane pe agent
const MAX = 20n
const RESERVE = 5n
const DEAD = '0x000000000000000000000000000000000000dEaD' as Address

let anvil: Anvil
let client: ReturnType<typeof createPublicClient>
let wallet: ReturnType<typeof createWalletClient>
let buyerWallet: ReturnType<typeof createWalletClient>
let deployer: Address
let buyer: Address
let treasury: Address
let token: Address
let registry: Address
let impl: Address
let agent: Address

const nftAbi = artifact('StonkAgent.sol', 'StonkAgent').abi
const erc20Abi = artifact('MockERC20.sol', 'MockERC20').abi

const read = (fn: string, args: readonly unknown[] = []) =>
  client.readContract({ address: agent, abi: nftAbi, functionName: fn, args: args as never })

async function send(w: typeof wallet, address: Address, abi: unknown, fn: string, args: readonly unknown[] = []) {
  const hash = await w.writeContract({
    address,
    abi: abi as never,
    functionName: fn,
    args: args as never,
    account: w.account!,
    chain: w.chain
  })
  return client.waitForTransactionReceipt({ hash })
}

beforeAll(async () => {
  anvil = await startAnvil(PORT)
  const chain = localChain(PORT)
  const acc = privateKeyToAccount(ANVIL_KEY)
  const buyerAcc = privateKeyToAccount(ANVIL_KEY_2)
  deployer = acc.address
  buyer = buyerAcc.address
  treasury = '0x00000000000000000000000000000000000000B1'
  client = createPublicClient({ chain, transport: http(anvil.url) })
  wallet = createWalletClient({ account: acc, chain, transport: http(anvil.url) })
  buyerWallet = createWalletClient({ account: buyerAcc, chain, transport: http(anvil.url) })

  const deploy = async (file: string, name: string, args: readonly unknown[] = []): Promise<Address> => {
    const a = artifact(file, name)
    const hash = await wallet.deployContract({
      abi: a.abi,
      bytecode: a.bytecode,
      args: args as never,
      account: acc,
      chain
    })
    const r = await client.waitForTransactionReceipt({ hash })
    return r.contractAddress!
  }

  token = await deploy('MockERC20.sol', 'MockERC20', ['Stonk Broker', 'STONKBROKER', 18])
  registry = await deploy('ERC6551Registry.sol', 'ERC6551Registry')
  impl = await deploy('ERC6551Account.sol', 'ERC6551Account')
  agent = await deploy('StonkAgent.sol', 'StonkAgent', [
    token, PRICE, 5000, MAX, RESERVE, treasury, registry, impl, SALT, 'https://stonk.grappes.dev/api/agent/'
  ])

  // cumparatorul are jetoane si aproba contractul
  await send(wallet, token, erc20Abi, 'mint', [buyer, parseEther('10000')])
  await send(buyerWallet, token, erc20Abi, 'approve', [agent, parseEther('10000')])
}, 120_000)

afterAll(() => anvil?.stop())

describe('mintul', () => {
  it('e inchis pana il deschide cineva', async () => {
    await expect(send(buyerWallet, agent, nftAbi, 'mint', [1n])).rejects.toThrow()
    expect(await read('totalSupply')).toBe(0n)
  })

  it('arde exact cat scrie si nu retine nimic pentru contract', async () => {
    await send(wallet, agent, nftAbi, 'setMintOpen', [true])
    await send(buyerWallet, agent, nftAbi, 'mint', [2n])

    const burned = (await client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [DEAD] })) as bigint
    const toTreasury = (await client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [treasury] })) as bigint
    const held = (await client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [agent] })) as bigint

    expect(burned).toBe(PRICE * 2n / 2n)
    expect(toTreasury).toBe(PRICE * 2n / 2n)
    expect(held).toBe(0n) // contractul nu tine niciodata jetoane
    expect(await read('totalSupply')).toBe(2n)
    expect(await read('ownerOf', [1n])).toBe(getAddress(buyer))
  })

  it('nu poate manca din rezerva casei', async () => {
    /* supply 20, rezerva 5, deci publicul are voie la 15. Doi sunt deja luati. */
    await send(buyerWallet, agent, nftAbi, 'mint', [13n])
    expect(await read('totalSupply')).toBe(15n)
    await expect(send(buyerWallet, agent, nftAbi, 'mint', [1n])).rejects.toThrow()
  })

  it('rezerva o poate scoate doar casa, si nu peste plafon', async () => {
    await expect(send(buyerWallet, agent, nftAbi, 'mintReserved', [buyer, 1n])).rejects.toThrow()
    await send(wallet, agent, nftAbi, 'mintReserved', [deployer, 5n])
    expect(await read('totalSupply')).toBe(20n)
    await expect(send(wallet, agent, nftAbi, 'mintReserved', [deployer, 1n])).rejects.toThrow()
  })
})

describe('rolul', () => {
  it('nu se poate instala un rol care nu exista', async () => {
    await expect(send(buyerWallet, agent, nftAbi, 'installRole', [1n, 1])).rejects.toThrow()
  })

  it('se instaleaza si se poate schimba cand apare o unealta noua', async () => {
    await send(wallet, agent, nftAbi, 'defineRole', [1, 'COURIER'])
    await send(wallet, agent, nftAbi, 'defineRole', [2, 'RINGER'])
    await send(buyerWallet, agent, nftAbi, 'installRole', [1n, 1])
    expect(await read('roleOf', [1n])).toBe(1)
    await send(buyerWallet, agent, nftAbi, 'installRole', [1n, 2])
    expect(await read('roleOf', [1n])).toBe(2)
  })

  it('doar proprietarul bucatii isi schimba rolul', async () => {
    await expect(send(wallet, agent, nftAbi, 'installRole', [1n, 1])).rejects.toThrow()
  })
})

describe('portofelul agentului', () => {
  it('adresa calculata local e cea pe care o da si contractul, si registrul', async () => {
    const onchain = (await read('walletOf', [1n])) as Address
    const local = tbaAddress({
      registry,
      implementation: impl,
      salt: SALT,
      chainId: 31337,
      tokenContract: agent,
      tokenId: 1n
    })
    expect(local.toLowerCase()).toBe(onchain.toLowerCase())
  })

  it('se poate desfasura, si primeste bani', async () => {
    const w = (await read('walletOf', [1n])) as Address
    expect((await client.getCode({ address: w }))?.length ?? 0).toBeLessThan(3)
    await send(buyerWallet, agent, nftAbi, 'createWallet', [1n])
    expect((await client.getCode({ address: w }))!.length).toBeGreaterThan(2)

    await client.waitForTransactionReceipt({
      hash: await wallet.sendTransaction({ account: wallet.account!, chain: wallet.chain, to: w, value: parseEther('0.4') })
    })
    expect(await client.getBalance({ address: w })).toBe(parseEther('0.4'))
  })
})

describe('fotografia pentru cumparator', () => {
  it('arata proprietarul, portofelul, soldul si contorul', async () => {
    const [tokenOwner, w, bal, role, nonce] = (await read('snapshot', [1n])) as [Address, Address, bigint, number, bigint]
    expect(tokenOwner).toBe(getAddress(buyer))
    expect(bal).toBe(parseEther('0.4'))
    expect(role).toBe(2)
    expect(nonce).toBe(0n)
    expect(w.toLowerCase()).toBe(((await read('walletOf', [1n])) as string).toLowerCase())
  })

  it('contorul se misca la fiecare transfer, deci nu poti primi alta marfa', async () => {
    await send(buyerWallet, agent, nftAbi, 'transferFrom', [buyer, deployer, 1n])
    const after = (await read('snapshot', [1n])) as [Address, Address, bigint, number, bigint]
    expect(after[0]).toBe(getAddress(deployer))
    expect(after[4]).toBe(1n)
    /* portofelul ramane acelasi, deci banii calatoresc cu bucata */
    expect(await client.getBalance({ address: after[1] })).toBe(parseEther('0.4'))
  })

  it('un strain nu poate muta bucata altuia', async () => {
    await expect(send(buyerWallet, agent, nftAbi, 'transferFrom', [deployer, buyer, 1n])).rejects.toThrow()
  })
})

describe('metadatele', () => {
  it('tokenURI se lipeste de baza si cere ca bucata sa existe', async () => {
    expect(await read('tokenURI', [1n])).toBe('https://stonk.grappes.dev/api/agent/1')
    await expect(read('tokenURI', [999n])).rejects.toThrow()
  })

  it('spune ca e ERC-721', async () => {
    expect(await read('supportsInterface', ['0x80ac58cd'])).toBe(true)
    expect(await read('supportsInterface', ['0xdeadbeef'])).toBe(false)
  })
})
