/**
 * ntfy: alarma care ajunge pe telefon fara cont, fara bot si fara chei.
 *
 * De ce inca un canal, cand exista Telegram: Telegram e fata produsului, un
 * canal public unde agentul isi spune isprava. Asta e opusul, e soneria
 * operatorului. Uptime Kuma tipa deja aici cand un container cade, deci
 * agentul foloseste acelasi topic: o singura soneria de invatat.
 *
 * URL-ul topicului E secretul. Cine il stie, citeste tot ce trimitem si poate
 * scrie in el, deci sta in mediu ("env:NTFY_URL"), nu in fisierul de config,
 * care ajunge in git.
 *
 * Regula mostenita de la puls: o soneria stricata nu are voie sa doboare bucla.
 */
import { log } from '../log.js'

export interface NtfyCfg {
  enabled: boolean
  url: string | null
  digestHour: number | null
  timeoutMs: number
}

export interface Note {
  title: string
  text: string
  /** 1 = mut, 3 = normal, 5 = suna si vibreaza */
  priority?: number
  tags?: string[]
}

export function ntfyOn(cfg: NtfyCfg): boolean {
  return cfg.enabled && !!cfg.url
}

export async function notify(cfg: NtfyCfg, n: Note): Promise<boolean> {
  if (!ntfyOn(cfg)) return false
  try {
    const res = await fetch(cfg.url as string, {
      method: 'POST',
      headers: {
        /* titlul si etichetele merg in anteturi: corpul ramane textul curat,
           asa cum il vrea ntfy */
        Title: n.title,
        Priority: String(n.priority ?? 3),
        ...(n.tags?.length ? { Tags: n.tags.join(',') } : {})
      },
      body: n.text,
      signal: AbortSignal.timeout(cfg.timeoutMs)
    })
    if (!res.ok) {
      log.warn({ status: res.status }, 'ntfy refused the note')
      return false
    }
    return true
  } catch (e) {
    log.warn({ err: (e as Error).message }, 'ntfy did not answer')
    return false
  }
}
