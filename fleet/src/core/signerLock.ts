/**
 * Un lacat intre PROCESE, pe adresa care semneaza.
 *
 * De ce exista: pana acum fiecare meserie avea cheia ei, deci nonce-ul se
 * plimba pe un singur fir si nu se putea ciocni cu nimeni. Pe colectia v3
 * asta nu mai e adevarat: un seif are UN SINGUR `agentSigner`, deci
 * harvesterul si trader-ul care servesc aceeasi colectie semneaza cu ACEEASI
 * cheie, din doua containere diferite.
 *
 * Fereastra e mica dar reala: executorul citeste nonce-ul `pending` si abia
 * apoi trimite. Daca al doilea proces citeste in intervalul ala, ia acelasi
 * numar si a doua tranzactie e refuzata la difuzare. Nu se pierd bani (nu
 * ajunge pe lant), dar se pierde o trecere si jurnalul umple cu o eroare care
 * nu spune nimic despre piata.
 *
 * Lacatul acopera EXACT [citeste nonce, trimite], nu si asteptarea chitantei:
 * `sendTransaction` se intoarce dupa ce nodul a primit tranzactia, deci
 * nonce-ul `pending` e deja avansat cand celalalt proces intra. Tinut peste
 * chitanta, lacatul ar serializa doua meserii care n-au niciun motiv sa se
 * astepte.
 *
 * Fisierul traieste in ./data, care e montat de pe gazda in TOATE containerele
 * flotei (vezi docker-compose.yml), deci lacatul chiar traverseaza procesele.
 * `wx` e atomic si pe overlayfs; nu avem nevoie de nimic mai ceremonios.
 */
import { mkdirSync, openSync, closeSync, readFileSync, rmSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { log } from './log.js'

/** Cat poate tine un proces lacatul inainte sa fie declarat mort si dat la o parte. */
const STALE_MS = 60_000
/** Cat asteptam sa se elibereze inainte sa mergem mai departe fara el. */
const WAIT_MS = 15_000
const POLL_MS = 50

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function lockPath(dir: string, address: string): string {
  return join(dir, `.signer-${address.toLowerCase()}.lock`)
}

/** Cat de vechi e lacatul, in ms; `null` daca nu se poate citi (a disparut sub noi). */
function ageOf(path: string): number | null {
  try {
    const at = Number(JSON.parse(readFileSync(path, 'utf8')).at)
    return Number.isFinite(at) ? Date.now() - at : STALE_MS + 1
  } catch {
    return null
  }
}

/**
 * Ruleaza `fn` cu exclusivitate pe adresa data, intre procese.
 *
 * Nu esueaza NICIODATA din cauza lacatului: daca dupa WAIT_MS tot nu l-a
 * prins, trece mai departe si spune de ce. Un lacat care poate opri munca e
 * o frana pe care n-a cerut-o nimeni; aici scopul e doar sa nu se calce doua
 * procese pe nonce, iar cazul prost, o difuzare respinsa, era deja tolerabil.
 */
export async function withSignerLock<T>(dir: string, address: string, fn: () => Promise<T>): Promise<T> {
  const path = lockPath(dir, address)
  mkdirSync(dirname(path), { recursive: true })

  let fd: number | null = null
  const deadline = Date.now() + WAIT_MS
  while (fd === null) {
    try {
      fd = openSync(path, 'wx')
      writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      const age = ageOf(path)
      if (age === null || age > STALE_MS) {
        /* proprietarul a murit cu lacatul in mana (container ucis in mijlocul
           unei trimiteri). Il dam la o parte si reincercam; daca doua procese
           fac asta simultan, `wx` decide unul singur. */
        log.warn({ path, ageMs: age }, 'stale signer lock, taking it')
        try {
          rmSync(path, { force: true })
        } catch {
          /* l-a luat altul inaintea noastra: reincercam oricum */
        }
        continue
      }
      if (Date.now() > deadline) {
        log.warn({ address, waitedMs: WAIT_MS }, 'signer lock still held, signing without it')
        return await fn()
      }
      await sleep(POLL_MS)
    }
  }

  try {
    return await fn()
  } finally {
    try {
      closeSync(fd)
    } catch {
      /* deja inchis */
    }
    try {
      rmSync(path, { force: true })
    } catch {
      /* deja sters, de noi sau de cine ne-a declarat morti */
    }
  }
}

/** Doar pentru teste: cat de mult tolereaza inainte sa fure lacatul. */
export const SIGNER_LOCK_STALE_MS = STALE_MS
