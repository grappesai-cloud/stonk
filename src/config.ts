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
  .refine((v) => isAddress(v), 'invalid EVM address')
  .transform((v) => getAddress(v) as Address)

const zHex32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'must be 32 hex bytes')
  .transform((v) => v as Hex)

const zBig = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((v, ctx) => {
    try {
      return BigInt(v as string)
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `invalid integer: ${String(v)}` })
      return BigInt(0)
    }
  })

/** o functie de citire descrisa prin semnatura, plus ce campuri conteaza */
const zPendingCall = z.object({
  /** ex: "function pendingOf(uint256 tokenId) view returns (uint256 ethAmount, uint256 tokenAmount)" */
  signature: z.string().min(10),
  /** forma scurta: cu ce se cheama, id-ul NFT-ului sau adresa portofelului */
  arg: z.enum(['tokenId', 'wallet']).default('tokenId'),
  /** forma completa: sablon de argumente, pentru contracte cu structuri sau mai multe argumente */
  args: z.array(z.unknown()).nullable().default(null),
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
  /**
   * Modul de veghe: scaneaza, tine indexul si anunta, dar NU livreaza si nu
   * semneaza nimic, chiar daca exista o cheie in mediu.
   *
   * E modul cu care se poate lansa inainte sa fie limpede daca `deliver()`
   * merge apelata de un strain: intrebarea aia blocheaza livrarea, nu si
   * publicarea indexului. Un supraveghetor e util din prima zi si nu cere
   * voie nimanui.
   */
  watchtower: z.boolean().default(false),

  /** adresa publica la care raspunde API-ul; din ea se compun linkurile din alerte */
  publicUrl: z.string().url().nullable().default(null),

  /**
   * Agentul in numele caruia lucreaza procesul asta.
   *
   * Fara el, Courier e "botul nostru" si nimic mai mult: registrul stie ce s-a
   * livrat, dar nu cine a livrat. Or toata povestea colectiei sta pe fraza
   * "agentul TAU munceste", iar aia nu se poate dovedi fara atribuire.
   *
   * Se pune de la inceput, chiar inainte sa existe mintul: agentul #0000 e
   * prototipul casei, iar in ziua lansarii are deja istoric adevarat in loc de
   * promisiuni.
   */
  agent: z.object({
    id: z.number().int().min(0).nullable().default(null),
    /** contractul colectiei de agenti; gol pana e desfasurat */
    collection: zAddress.nullable().default(null),
    name: z.string().default('COURIER #0000'),
    /** portofelul 6551 al agentului; acolo ajung bacsisurile */
    wallet: zAddress.nullable().default(null),
    /** proprietarul agentului, doar pentru afisare */
    owner: zAddress.nullable().default(null)
  }).default({}),

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
    /** cu ce se cheama livrarea, forma scurta */
    deliverArg: z.enum(['tokenId', 'wallet']).default('tokenId'),
    /** sablon de argumente pentru livrare, ex: [{ tokenId: "$tokenId", recipient: "$wallet" }] */
    deliverArgs: z.array(z.unknown()).nullable().default(null),
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
    /**
     * In modul profit, refuza sa livreze cand bacsisul nu poate fi masurat
     * inainte (adica fara contract de lot). Altfel frana de rentabilitate ar
     * exista in configurare dar nu s-ar aplica niciodata, ceea ce e mai rau
     * decat sa nu existe.
     */
    requireMeasuredTips: z.boolean().default(true),
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
    jitterSec: z.number().int().min(0).default(20),
    /** peste cat timp fara o rulare terminata /health raspunde 503; null = calculat din interval */
    staleAfterSec: z.number().int().positive().nullable().default(null),
    /** cainele de paza: null = calculat din interval, 0 = oprit dinadins */
    watchdogSec: z.number().int().min(0).nullable().default(null)
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
      gasLowWei: zBig.default(0n),
      /** in modul de veghe: anunta doar descoperirile peste pragul asta */
      foundMinValueWei: zBig.default(0n)
    }).default({}),
    /* Pulsul catre un ciocanitor din afara. Un proces mort nu poate raporta ca
       a murit, deci raportarea se face invers: cine nu mai primeste, tipa. */
    heartbeat: z.object({
      url: z.string().nullable().default(null),
      failUrl: z.string().nullable().default(null),
      timeoutMs: z.number().int().positive().default(5000)
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

  /**
   * Consola de operator. Sta pe alt port decat API-ul public si are exact doua
   * actiuni care scriu: opreste si porneste. Nu atinge chei, nu semneaza nimic,
   * nu schimba politici. Asa API-ul public ramane strict citire, si daca ajunge
   * cineva la el nu are ce face cu el.
   */
  console: z.object({
    enabled: z.boolean().default(false),
    host: z.string().default('127.0.0.1'),
    port: z.number().int().positive().default(8788),
    /** jeton obligatoriu; se citeste din mediu, ca orice secret */
    token: z.string().nullable().default(null)
  }).default({}),

  storage: z.object({
    file: z.string().default('./data/courier.db'),
    /* Registrul e produsul. Copia se face din procesul care scrie, cu VACUUM
       INTO, si se verifica imediat dupa ce a fost scrisa. */
    backup: z.object({
      enabled: z.boolean().default(true),
      dir: z.string().default('./data/backups'),
      everyHours: z.number().positive().default(6),
      keep: z.number().int().positive().default(28)
    }).default({})
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
  if (!existsSync(file)) throw new Error(`config file missing: ${file}`)
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const missing: string[] = []
  const withEnv = resolveEnv(raw, '', missing)
  missingEnv = missing
  const parsed = ConfigSchema.safeParse(withEnv)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new Error(`invalid config in ${file}:\n${lines.join('\n')}`)
  }
  return parsed.data
}

/** semnatura umana -> ABI viem, cu eroare citibila cand e scrisa gresit */
export function abiOf(signature: string, what: string): Abi {
  try {
    return parseAbi([signature]) as Abi
  } catch (e) {
    throw new Error(`invalid signature for ${what}: ${signature}\n${(e as Error).message}`)
  }
}
