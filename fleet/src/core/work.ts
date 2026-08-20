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

  /**
   * Cat ETH pleaca ODATA cu apelul. Executorul il trimite ca `value`.
   *
   * Ringer si Miner nu trimit nimic; Stocker plateste marfa. De aia campul e
   * separat de cost: sunt bani care trebuie sa fie in portofel ACUM, nu doar
   * o socoteala.
   */
  valueWei: bigint

  /**
   * Cat ne costa bucata asta in total, in afara de gaz: ETH-ul trimis plus
   * valoarea a ce dam din portofel (marfa, jetoane).
   *
   * Frana de rentabilitate lucreaza cu castigul MINUS costul, nu cu castigul.
   * Un agent care incaseaza mai putin decat a dat nu e profitabil pentru ca
   * are comision, e in pierdere cu pasi mai mari.
   */
  costWei: bigint
  /** true doar cand costul a fost citit de pe lant, nu scris in configurare */
  costMeasured: boolean
  /** ce jetoane pleaca din portofel, cand plata nu e in ETH */
  costToken: { token: Address; amount: bigint; symbol: string; decimals: number } | null
  /**
   * Bucata se face O SINGURA DATA, si cheia ei spune care anume.
   *
   * Votul unei epoci e asa: cheia contine sfarsitul epocii, deci un al doilea
   * vot cu aceeasi cheie nu e "inca o treaba", e aceeasi treaba facuta de doua
   * ori. Fara steagul asta, agentul voteaza la fiecare rulare pana se inchide
   * epoca: arde gaz si isi imparte singur puterea intre propriile voturi.
   *
   * Se sprijina pe registru, deci un registru pierdut inseamna cel mult inca o
   * repetare. De aia registrul are copii verificate.
   */
  once?: boolean

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
  /**
   * Unde se trimite apelul si cum se cheama.
   *
   * Primeste bucata, fiindca unele meserii au mai multe apeluri: Lobbyist
   * voteaza cu unul si isi incaseaza partea cu altul. Fara bucata, ar trebui
   * doua meserii pentru acelasi agent.
   */
  target(cfg: Config, job: J, item?: WorkItem): Target
  /** cine ar avea voie sa apeleze, daca functia e rezervata; se cauta pe lant */
  authority?(client: PublicClient, cfg: Config, job: J): Promise<Address | null>

  /**
   * Agentul lucreaza cu POZITIA LUI, nu in numele altora.
   *
   * Distinctia asta schimba intrebarea de la pasul zero. Pentru Ringer, Miner
   * si Stocker, intrebarea e "poate un strain sa apeleze?", si daca raspunsul
   * e nu, meseria nu exista. Pentru Lobbyist e pe dos: votul CU BLOCAREA
   * NOASTRA trebuie sa fie rezervat noua, altfel ar putea vota oricine cu ea.
   * Acolo intrebarea corecta e "putem NOI sa apelam?", iar un strain respins e
   * exact cum trebuie sa fie.
   *
   * Fara steagul asta, diagnosticul ar da alarma falsa la fiecare pornire, si
   * o alarma care suna mereu se opreste din a fi citita.
   */
  actsOnOwnPosition?: boolean
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
