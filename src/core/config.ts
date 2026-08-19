/**
 * Configurarea, valabila pentru orice agent din flota.
 *
 * Doua reguli mostenite de la Courier si care nu se incalca:
 *  1. secretele NU stau in fisierul de configurare. Se scrie "env:NUME" si se
 *     citesc din mediu. Un fisier de config ajunge in git mai devreme sau mai
 *     tarziu; o cheie privata acolo inseamna fonduri pierdute.
 *  2. contractul se descrie prin semnaturi, nu prin cod. Cand vin adresele
 *     reale de la StonkBrokers, se schimba fisierul asta, nu sursele.
 *
 * Ce e nou fata de Courier: blocul `job`. Miezul nu il intelege si nici nu
 * incearca; il valideaza modulul meseriei. Asa se adauga Stocker si Lobbyist
 * fara sa se atinga schema de aici.
 */
import { readFileSync, existsSync } from 'node:fs'
import { getAddress, isAddress, parseAbi, type Abi, type Address, type Hex } from 'viem'
import { z } from 'zod'

export const zAddress = z
  .string()
  .refine((v) => isAddress(v), 'invalid EVM address')
  .transform((v) => getAddress(v) as Address)

export const zBig = z.union([z.string(), z.number(), z.bigint()]).transform((v, ctx) => {
  try {
    return BigInt(v as string)
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `invalid integer: ${String(v)}` })
    return BigInt(0)
  }
})

export const AGENT_KINDS = ['ringer', 'miner', 'stocker', 'lobbyist', 'courier'] as const
export type AgentKind = (typeof AGENT_KINDS)[number]

export const ConfigSchema = z.object({
  /**
   * Modul de veghe: citeste, tine indexul, anunta, dar NU semneaza nimic,
   * chiar daca exista o cheie in mediu.
   *
   * La Ringer are un rost in plus fata de Courier: in veghe masoara cursa.
   * Vezi cine apasa butonul inaintea noastra, cu cat gaz, si la cate blocuri
   * dupa ce oala s-a copt. Fara sa cheltui nimic afli daca meseria e libera
   * sau e deja luata.
   */
  watchtower: z.boolean().default(false),

  publicUrl: z.string().url().nullable().default(null),

  agent: z
    .object({
      kind: z.enum(AGENT_KINDS),
      id: z.number().int().min(0).nullable().default(null),
      collection: zAddress.nullable().default(null),
      name: z.string().default('AGENT #0000'),
      /** portofelul 6551 al agentului: acolo ajung castigurile */
      wallet: zAddress.nullable().default(null),
      owner: zAddress.nullable().default(null)
    }),

  network: z.object({
    name: z.string(),
    chainId: z.number().int().positive(),
    rpc: z.array(z.string().url()).min(1),
    explorer: z.string().url().optional(),
    nativeSymbol: z.string().default('ETH'),
    multicall3: zAddress.nullable().default(null),
    blockTimeMs: z.number().int().positive().default(2000)
  }),

  /** contractul pe care lucreaza agentul */
  target: z.object({
    address: zAddress,
    /** erorile proprii ale contractului, ca simularea sa dea nume, nu selectori hex */
    errorSignatures: z.array(z.string()).default([]),
    /** blocul de la care se cauta evenimente, cand meseria are nevoie */
    deployBlock: zBig.default(0n)
  }),

  /** blocul meseriei; il valideaza modulul, nu miezul */
  job: z.unknown().default({}),

  policy: z.object({
    /** 'profit' lucreaza doar ce se plateste singur, 'campaign' lucreaza si in pierdere */
    mode: z.enum(['profit', 'campaign']).default('profit'),
    /** castig >= gaz * multiplu, altfel treaba nu merita */
    profitMultiple: z.number().min(0).default(1.5),
    minRewardWei: zBig.default(0n),
    /** cat trebuie sa valoreze lucrul in sine (oala, runda) ca sa ne atingem de el */
    minStakeWei: zBig.default(0n),
    /**
     * In modul profit, refuza sa lucreze cand castigul nu poate fi masurat
     * inainte. Frana platita o data la Courier: una care exista in configurare
     * dar nu se aplica niciodata e mai rea decat una care lipseste.
     */
    requireMeasuredReward: z.boolean().default(true),
    /**
     * Aceeasi regula, pentru banii care IES. Un agent care cheltuie o suma pe
     * care nu a putut sa o citeasca inainte cheltuie orbeste, si asta se
     * refuza implicit.
     */
    requireMeasuredCost: z.boolean().default(true),
    /** cat are voie sa coste o singura bucata de munca, in afara de gaz */
    maxCostPerJobWei: zBig.nullable().default(null),
    /** cat are voie sa cheltuie pe zi, in afara de gaz */
    dailySpendBudgetWei: zBig.nullable().default(null),
    cooldownSec: z.number().int().min(0).default(0),
    maxJobsPerRun: z.number().int().positive().default(50),
    batchSize: z.number().int().positive().default(1),
    gasCapPerCall: zBig.default(400000n),
    maxGasPriceWei: zBig.nullable().default(null),
    dailyGasBudgetWei: zBig.nullable().default(null),
    denyKeys: z.array(z.string()).default([])
  }).default({}),

  execution: z.object({
    /** implicit NU trimite nimic. Se porneste explicit. */
    dryRun: z.boolean().default(true),
    privateKey: z.string().nullable().default(null),
    /** unde ajung castigurile daca contractul intreaba; implicit contul care semneaza */
    beneficiary: zAddress.nullable().default(null),
    confirmations: z.number().int().min(0).default(1),
    maxFeePerGasWei: zBig.nullable().default(null),
    maxPriorityFeePerGasWei: zBig.nullable().default(null),
    killSwitchFile: z.string().default('./data/STOP'),
    maxConsecutiveFailures: z.number().int().positive().default(5)
  }).default({}),

  runner: z.object({
    /**
     * 'interval' = ca la Courier, la fiecare cateva minute.
     * 'block'    = la fiecare bloc nou. Ringer are nevoie de asta: cine apasa
     *              butonul la trei minute dupa ce s-a copt oala nu apasa
     *              niciodata, fiindca a apasat altcineva.
     */
    mode: z.enum(['interval', 'block']).default('interval'),
    intervalSec: z.number().int().positive().default(300),
    jitterSec: z.number().int().min(0).default(20),
    /** in modul 'block': cat asteptam intre doua sondaje ale capului de lant */
    pollMs: z.number().int().positive().default(1000),
    staleAfterSec: z.number().int().positive().nullable().default(null),
    watchdogSec: z.number().int().min(0).nullable().default(null)
  }).default({}),

  alerts: z.object({
    telegram: z.object({
      enabled: z.boolean().default(false),
      token: z.string().nullable().default(null),
      channel: z.string().nullable().default(null),
      perEventMinRewardWei: zBig.default(0n),
      digestHour: z.number().int().min(0).max(23).nullable().default(9),
      gasLowWei: zBig.default(0n)
    }).default({}),
    heartbeat: z.object({
      url: z.string().nullable().default(null),
      failUrl: z.string().nullable().default(null),
      timeoutMs: z.number().int().positive().default(5000)
    }).default({})
  }).default({}),

  api: z.object({
    enabled: z.boolean().default(true),
    host: z.string().default('127.0.0.1'),
    port: z.number().int().positive().default(8790),
    cors: z.array(z.string()).default(['*']),
    rateLimitPerMinute: z.number().int().min(0).default(120)
  }).default({}),

  console: z.object({
    enabled: z.boolean().default(false),
    host: z.string().default('127.0.0.1'),
    port: z.number().int().positive().default(8791),
    token: z.string().nullable().default(null)
  }).default({}),

  storage: z.object({
    file: z.string().default('./data/fleet.db'),
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
 * O variabila lipsa devine null, nu eroare: asa `doctor` merge pe o masina
 * fara chei, adica exact situatia in care il folosesti cel mai des.
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

/** ABI-ul unei functii lipit de erorile contractului, pentru simulari citibile */
export function abiWithErrors(signature: string, errors: string[], what: string): Abi {
  const merged: unknown[] = [...(abiOf(signature, what) as unknown as unknown[])]
  for (const e of errors) merged.push(...(abiOf(e, `${what}.errorSignatures`) as unknown as unknown[]))
  return merged as Abi
}

export type { Hex }
