/**
 * Pulsul catre exterior.
 *
 * Un proces mort nu poate sa anunte ca a murit. Singurul lucru care poate,
 * e cineva din afara care observa ca nu a mai primit nimic. De aia botul
 * ciocaneste la un URL dupa fiecare rulare reusita, iar serviciul din afara
 * (healthchecks.io, Uptime Kuma, BetterStack, orice ciocanitor) tipa cand
 * ciocanitul nu mai vine.
 *
 * Regula: pulsul nu are voie sa doboare bucla. Daca ciocanitul nu iese,
 * se scrie in log si se merge mai departe. Un monitor cazut nu opreste
 * livrarile.
 */
import { log } from '../log.js'

export interface HeartbeatCfg {
  url: string | null
  failUrl: string | null
  timeoutMs: number
}

async function knock(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) {
      log.warn({ status: res.status }, 'heartbeat rejected')
      return false
    }
    return true
  } catch (e) {
    log.warn({ err: (e as Error).message }, 'heartbeat failed')
    return false
  }
}

/** dupa o rulare reusita */
export async function beat(cfg: HeartbeatCfg): Promise<boolean> {
  if (!cfg.url) return false
  return knock(cfg.url, cfg.timeoutMs)
}

/** dupa o rulare cazuta, ca monitorul sa afle acum, nu peste o fereastra intreaga */
export async function beatFailure(cfg: HeartbeatCfg): Promise<boolean> {
  if (!cfg.failUrl) return false
  return knock(cfg.failUrl, cfg.timeoutMs)
}
