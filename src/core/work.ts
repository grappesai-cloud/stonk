/**
 * Ce inseamna "o bucata de munca" pentru un agent din flota.
 *
 * Courier livreaza drop-uri, Ringer apasa un buton, Miner inchide runde. Din
 * afara sunt trei meserii; inauntru sunt acelasi lucru: descopera ce e de
 * facut, verifica daca merita, simuleaza, trimite, scrie in registru.
 *
 * De aia miezul nu stie nimic despre meserii. Stie doar de WorkItem si de Job,
 * iar meseriile se adauga ca module, nu ca ramuri de if prin tot codul.
 */
import type { Abi, Address, PublicClient } from 'viem'
import type { Config } from './config.js'
import type { Ledger } from './ledger/db.js'

export interface WorkItem {
  /** identitate stabila intre rulari: cooldown, dedup si registrul se leaga de ea */
  key: string
  /** cum se numeste in jurnal si pe pagina */
  label: string
  /** argumentele apelului care face treaba, deja rezolvate */
  args: unknown[]
  /**
   * Cat ne asteptam sa castigam, in wei nativi.
   *
   * Zero inseamna "nu stim", nu "nimic". Diferenta conteaza: in modul profit
   * un castig necunoscut opreste trimiterea, altfel frana de rentabilitate ar
   * exista in configurare si nu s-ar aplica niciodata. Lectia asta a fost
   * platita o data, la Courier.
   */
  rewardWei: bigint
  /** true doar cand cifra a fost citita de pe lant, nu scrisa in configurare */
  rewardMeasured: boolean
  /** cat valoreaza lucrul asupra caruia se lucreaza (oala, runda), pentru afisare */
  stakeWei: bigint
  /** orice altceva merita tinut minte despre bucata asta */
  meta: Record<string, string>
}

/** unde se trimite apelul care face treaba */
export interface Target {
  address: Address
  /** ABI-ul functiei plus erorile proprii ale contractului */
  abi: Abi
  functionName: string
}

export interface JobCheck {
  name: string
  ok: boolean
  detail: string
  fatal?: boolean
}

export interface DiscoverInput {
  client: PublicClient
  cfg: Config
  job: unknown
  ledger: Ledger
  /** din ce cont se citeste cand contractul se uita la msg.sender */
  from: Address
}

/** o apasare vazuta pe lant: cine a facut treaba inaintea noastra */
export interface Press {
  /** cheia bucatii de munca, in formatul meseriei */
  key: string
  caller: Address
  rewardWei: bigint
  txHash: `0x${string}`
  blockNumber: bigint
  gasPriceWei: bigint
}

export interface Job<J = unknown> {
  kind: string
  /** citeste si valideaza blocul `job` din configurare */
  parse(raw: unknown): J
  /** ce adrese trebuie sa aiba cod pe lant inainte sa se poata lucra */
  required(cfg: Config, job: J): Array<{ what: string; address: Address }>
  /** ce e de facut acum */
  discover(input: DiscoverInput & { job: J }): Promise<WorkItem[]>
  /** unde se trimite apelul si cum se cheama */
  target(cfg: Config, job: J): Target
  /** cine ar avea voie sa apeleze, daca functia e rezervata; se cauta pe lant */
  authority?(client: PublicClient, cfg: Config, job: J): Promise<Address | null>
  /** verificari proprii meseriei, pe langa cele generice */
  checks?(input: DiscoverInput & { job: J }): Promise<JobCheck[]>
  /**
   * Cine a facut treaba in blocurile astea, si cu cat gaz a platit.
   *
   * O implementeaza doar meseriile in care se intra in cursa cu altii. Fara
   * ea nu exista caiet de curse: vezi doar ca oala s-a golit singura si nu
   * afli niciodata daca ai pierdut sau nu era nimic de luat.
   */
  presses?(
    client: PublicClient,
    cfg: Config,
    job: J,
    fromBlock: bigint,
    toBlock: bigint
  ): Promise<Press[]>
}
