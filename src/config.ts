/**
 * Configurarea Courier-ului, validata la pornire.
 *
 * Doua reguli care nu se incalca:
 *  1. secretele NU stau in fisierul de configurare. Se scrie "env:NUME" si se
 *     citesc din mediu. Un fisier de config ajunge in git mai devreme sau mai
 *     tarziu, o cheie privata acolo inseamna fonduri pierdute.
 *  2. contractul de drop-uri se descrie prin semnaturi, nu prin cod. Cand vin
 *     adresele reale de la StonkBrokers, se schimba acest fisier, nu sursele.
 */
import { readFileSync, existsSync } from 'node:fs'
import { getAddress, isAddress, parseAbi, type Abi, type Address, type Hex } from 'viem'
import { z } from 'zod'

const zAddress = z
  .string()
  .refine((v) => isAddress(v), 'adresa EVM invalida')
  .transform((v) => getAddress(v) as Address)

const zHex32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'trebuie sa fie 32 de octeti hex')
  .transform((v) => v as Hex)

const zBig = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((v, ctx) => {
    try {
      return BigInt(v as string)
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `numar intreg invalid: ${String(v)}` })
      return BigInt(0)
    }
  })

/** o functie de citire descrisa prin semnatura, plus ce campuri conteaza */
const zPendingCall = z.object({
  /** ex: "function pendingOf(uint256 tokenId) view returns (uint256 ethAmount, uint256 tokenAmount)" */
  signature: z.string().min(10),
  /** cu ce se cheama: id-ul NFT-ului sau adresa portofelului 6551 */
  arg: z.enum(['tokenId', 'wallet']).default('tokenId'),
  /** campurile din raspuns care sunt valoare nativa (ETH) */
  nativeFields: z.array(z.string()).default([]),
  /** campurile din raspuns care sunt cantitati de token, cu adresa tokenului */
  tokenFields: z
    .array(
      z.object({
        field: z.string(),
        token: zAddress,
        decimals: z.number().int().min(0).max(36).default(18),
        symbol: z.string().default('TOKEN'),
        /** pret in wei nativi pentru o unitate intreaga de token; 0 = necunoscut,
            deci nu il punem la socoteala cand decidem daca livrarea merita */
        weiPerToken: zBig.default(0n)
      })
    )
    .default([]),
  /** raspunsul poate fi si un singur uint fara nume */
  singleReturnIsNative: z.boolean().default(false)
})

export const ConfigSchema = z.object({
  network: z.object({
    name: z.string(),
    chainId: z.number().int().positive(),
    rpc: z.array(z.string().url()).min(1),
    explorer: z.string().url().optional(),
    nativeSymbol: z.string().default('ETH'),
    /** Multicall3 canonic daca exista pe lantul asta; null = folosim citirea deployless */
    multicall3: zAddress.nullable().default(null),
    blockTimeMs: z.number().int().positive().default(2000)
  }),

  erc6551: z.object({
    registry: zAddress,
    implementation: zAddress,
    salt: zHex32.default('0x0000000000000000000000000000000000000000000000000000000000000000' as Hex),
    /** verifica matematica locala fata de registrul de pe lant la fiecare pornire */
    verifyOnChain: z.boolean().default(true)
  }),

  brokers: z.object({
    address: zAddress,
    /** range = id-uri consecutive, enumerable = tokenByIndex, logs = scanare Transfer */
    idStrategy: z.enum(['range', 'enumerable', 'logs']).default('range'),
    firstId: z.number().int().min(0).default(1),
    maxId: z.number().int().positive().nullable().default(null),
    supplySignature: z.string().default('function totalSupply() view returns (uint256)'),
    ownerSignature: z.string().default('function ownerOf(uint256 tokenId) view returns (address)'),
    deployBlock: zBig.default(0n)
  }),

  drops: z.object({
    address: zAddress,
    pending: zPendingCall,
    /** ex: "function deliver(uint256 tokenId)" */
    deliverSignature: z.string().min(10),
    /** cu ce se cheama livrarea */
    deliverArg: z.enum(['tokenId', 'wallet']).default('tokenId'),
    /** optional, daca protocolul expune livrare in lot */
    deliverBatchSignature: z.string().nullable().default(null),
    /** optional: eveniment de livrare, pentru reconciliere */
    deliveredEventSignature: z.string().nullable().default(null),
    /** erorile proprii ale contractului, ca simularea sa spuna numele lor, nu un selector hex */
    errorSignatures: z.array(z.string()).default([]),
    /** cate id-uri intr-un singur apel de citire */
    readChunk: z.number().int().positive().default(200)
  }),

  policy: z.object({
    /** 'profit' livreaza doar ce se plateste singur, 'campaign' livreaza si in pierdere */
    mode: z.enum(['profit', 'campaign']).default('profit'),
    minValueWei: zBig.default(0n),
    minTipWei: zBig.default(0n),
    /** bacsis >= gaz * multiplu, altfel livrarea nu merita */
    profitMultiple: z.number().min(0).default(1.5),
    cooldownSec: z.number().int().min(0).default(3600),
    maxDeliveriesPerRun: z.number().int().positive().default(250),
    batchSize: z.number().int().positive().default(25),
    gasCapPerCall: zBig.default(400000n),
    maxGasPriceWei: zBig.nullable().default(null),
    dailyGasBudgetWei: zBig.nullable().default(null),
    /** cine primeste livrari: toti, sau doar lista */
    optIn: z
      .object({ mode: z.enum(['all', 'list']).default('all'), list: z.array(zAddress).default([]) })
      .default({ mode: 'all', list: [] }),
    /** proprietari care au cerut sa nu fie atinsi */
    denyOwners: z.array(zAddress).default([]),
    denyTokenIds: z.array(z.number().int()).default([])
  }).default({}),

  execution: z.object({
    /** implicit NU trimite nimic. Se porneste explicit. */
    dryRun: z.boolean().default(true),
    privateKey: z.string().nullable().default(null),
    batchContract: zAddress.nullable().default(null),
    /** unde ajung bacsisurile: portofelul 6551 al agentului */
    beneficiary: zAddress.nullable().default(null),
    confirmations: z.number().int().min(0).default(1),
    maxFeePerGasWei: zBig.nullable().default(null),
    maxPriorityFeePerGasWei: zBig.nullable().default(null),
    /** fisier care, daca exista, opreste orice trimitere */
    killSwitchFile: z.string().default('./data/STOP'),
    /** cate rulari la rand pot esua inainte sa se opreasca singur */
    maxConsecutiveFailures: z.number().int().positive().default(5)
  }).default({}),

  runner: z.object({
    intervalSec: z.number().int().positive().default(300),
    jitterSec: z.number().int().min(0).default(20)
  }).default({}),

  alerts: z.object({
    telegram: z.object({
      enabled: z.boolean().default(false),
      token: z.string().nullable().default(null),
      /** canalul public, ex: "@stonkagents" sau "-1001234567890" */
      channel: z.string().nullable().default(null),
      /** mesaj pe fiecare livrare peste pragul asta */
      perEventMinValueWei: zBig.default(0n),
      /** grupeaza mesajele cand un lot depaseste atatea livrari */
      batchThreshold: z.number().int().positive().default(4),
      /** rezumat zilnic, ora locala 0-23 */
      digestHour: z.number().int().min(0).max(23).nullable().default(9),
      /** avertisment cand portofelul operatorului scade sub prag */
      gasLowWei: zBig.default(0n)
    }).default({}),
    watchers: z.object({
      enabled: z.boolean().default(true),
      /** cati oameni pot urmari o singura adresa, anti spam */
      maxChatsPerAddress: z.number().int().positive().default(50),
      maxAddressesPerChat: z.number().int().positive().default(25)
    }).default({})
  }).default({}),

  api: z.object({
    enabled: z.boolean().default(true),
    host: z.string().default('127.0.0.1'),
    port: z.number().int().positive().default(8787),
    /** originile care au voie sa citeasca, pentru landing page */
    cors: z.array(z.string()).default(['*']),
    /** cereri pe minut de la o adresa IP; 0 = fara limita */
    rateLimitPerMinute: z.number().int().min(0).default(120)
  }).default({}),

  storage: z.object({
    file: z.string().default('./data/courier.db')
  }).default({})
})

export type Config = z.infer<typeof ConfigSchema>

/**
 * Inlocuieste recursiv valorile "env:NUME" cu variabila de mediu.
 *
 * O variabila lipsa devine null, nu eroare: asa `doctor`, `scan` si `simulate`
 * merg pe o masina fara chei, ceea ce e chiar situatia in care le folosesti cel
 * mai des. Daca lipseste ceva cu adevarat obligatoriu, schema se plange oricum,
 * si se plange cu numele campului.
 */
function resolveEnv(value: unknown, path = '', missing: string[] = []): unknown {
  if (typeof value === 'string' && value.startsWith('env:')) {
    const key = value.slice(4)
    const found = process.env[key]
    if (found === undefined || found === '') {
      missing.push(`${path} (${key})`)
      return null
    }
    return found
  }
  if (Array.isArray(value)) return value.map((v, i) => resolveEnv(v, `${path}[${i}]`, missing))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = resolveEnv(v, path ? `${path}.${k}` : k, missing)
    return out
  }
  return value
}

/** ce variabile de mediu lipseau la ultima incarcare, pentru diagnostic */
export let missingEnv: string[] = []

export function loadConfig(file: string): Config {
  if (!existsSync(file)) throw new Error(`fisierul de configurare lipseste: ${file}`)
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const missing: string[] = []
  const withEnv = resolveEnv(raw, '', missing)
  missingEnv = missing
  const parsed = ConfigSchema.safeParse(withEnv)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(radacina)'}: ${i.message}`)
    throw new Error(`configurare invalida in ${file}:\n${lines.join('\n')}`)
  }
  return parsed.data
}

/** semnatura umana -> ABI viem, cu eroare citibila cand e scrisa gresit */
export function abiOf(signature: string, what: string): Abi {
  try {
    return parseAbi([signature]) as Abi
  } catch (e) {
    throw new Error(`semnatura invalida pentru ${what}: ${signature}\n${(e as Error).message}`)
  }
}
