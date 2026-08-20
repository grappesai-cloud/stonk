/**
 * Darea de seama: ce s-a intamplat cu banii, o data pe zi, pe telefon.
 *
 * Monitorul de uptime raspunde la o singura intrebare — "raspunde procesul?".
 * Pentru un agent care apasa butoane, aia e aproape toata povestea. Pentru
 * Trader nu e: un bot care traieste, raspunde la /health si NU mai roteste de
 * o saptamana arata perfect sanatos si e, de fapt, oprit din piata. Tacerea
 * unui bot cu bani in mana e ambigua, si ambiguitatea se plateste.
 *
 * De aia soneria are doua feluri de sunet:
 *   - rezumatul zilnic, la ora din configurare: pozitie, valoare, gaz;
 *   - alarma pe loc, cand un rand al meseriei iese 'warn' sau 'bad'.
 *
 * Amandoua trec prin registru (kv), deci supravietuiesc unei reporniri: ora nu
 * se rateaza pentru ca s-a repornit containerul, si o alarma nu se repeta la
 * fiecare rulare pana ii sare siguranta celui care o citeste.
 */
import type { Ctx } from '../context.js'
import type { ReportLine } from '../work.js'
import { log } from '../log.js'
import { notify, ntfyOn } from './ntfy.js'
import { STRANGER } from '../context.js'

/** cat tace o alarma dupa ce a sunat o data, ca sa nu devina zgomot de fond */
export const ALARM_QUIET_SEC = 6 * 3600

export type Kv = { get(key: string): string | null; set(key: string, value: string): void }

/** ziua locala, in forma in care se tine minte ca rezumatul de azi s-a trimis */
export function dayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * E momentul rezumatului?
 *
 * Ora e "cel mai devreme", nu "fix atunci": daca botul a fost oprit la 9 si a
 * pornit la 11, rezumatul zilei tot pleaca. Un rezumat sarit e exact ziua
 * despre care ai fi vrut sa afli.
 */
export function digestDue(kv: Kv, hour: number | null, now: Date): boolean {
  if (hour === null) return false
  if (now.getHours() < hour) return false
  return kv.get('digest.day') !== dayKey(now)
}

/** care randuri ingrijoratoare au voie sa sune ACUM, si ce se scrie in registru */
export function alarmsToSend(
  lines: ReportLine[],
  kv: Kv,
  nowSec: number,
  quietSec = ALARM_QUIET_SEC
): ReportLine[] {
  const out: ReportLine[] = []
  for (const l of lines) {
    if (l.level !== 'warn' && l.level !== 'bad') continue
    const key = `alarm.${l.name}`
    const raw = kv.get(key)
    /* "n-a sunat niciodata" nu e "a sunat la secunda 0": fara distinctia asta,
       prima alarma a unui agent nou ar fi inghitita de fereastra de liniste */
    const last = raw === null ? null : Number(raw)
    /* aceeasi problema, alt text (gazul scade) nu e o alarma noua; problema
       stinsa si reaparuta dupa fereastra de liniste, da */
    if (last !== null && nowSec - last < quietSec) continue
    kv.set(key, String(nowSec))
    out.push(l)
  }
  return out
}

export function render(lines: ReportLine[]): string {
  const mark = (l: ReportLine): string => (l.level === 'bad' ? '! ' : l.level === 'warn' ? '~ ' : '')
  return lines.map((l) => `${mark(l)}${l.name}: ${l.value}`).join('\n')
}

/** trimite randurile ca rezumat, fara sa se uite la ora: pentru CLI si probe */
export async function pushDigest(ctx: Ctx, lines: ReportLine[]): Promise<boolean> {
  return notify(ctx.cfg.alerts.ntfy, {
    title: `${ctx.cfg.agent.name} - daily`,
    text: render(lines),
    priority: 3,
    tags: ['bar_chart']
  })
}

/** darea de seama a agentului: randurile meseriei plus cifrele registrului */
export async function reportLines(ctx: Ctx): Promise<ReportLine[]> {
  const lines: ReportLine[] = []
  if (ctx.job.report) {
    try {
      const from = ctx.account?.address ?? STRANGER
      lines.push(
        ...(await ctx.job.report({ client: ctx.client, cfg: ctx.cfg, job: ctx.jobCfg, ledger: ctx.ledger, from }))
      )
    } catch (e) {
      /* daca lantul nu raspunde, rezumatul spune ASTA, nu tace: un rezumat
         care lipseste se confunda cu un bot care n-a avut ce raporta */
      lines.push({ name: 'report', value: `could not be read: ${(e as Error).message}`, level: 'bad' })
    }
  }
  const since = Math.floor(Date.now() / 1000) - 86400
  const t = ctx.ledger.totals(since)
  lines.push({ name: 'last 24h', value: `${t.done} job(s) done` })
  return lines
}

/** rezumatul zilnic + alarmele pe loc; nu arunca niciodata in bucla */
export async function maybeDigest(ctx: Ctx): Promise<{ digest: boolean; alarms: number }> {
  const cfg = ctx.cfg.alerts.ntfy
  if (!ntfyOn(cfg)) return { digest: false, alarms: 0 }
  const kv: Kv = { get: (k) => ctx.ledger.kvGet(k), set: (k, v) => ctx.ledger.kvSet(k, v) }
  const now = new Date()
  const due = digestDue(kv, cfg.digestHour, now)

  let lines: ReportLine[] | null = null
  const load = async (): Promise<ReportLine[]> => (lines ??= await reportLines(ctx))

  let alarms = 0
  try {
    /* alarmele se uita la aceleasi randuri ca rezumatul, deci se citesc o
       singura data pe rulare, oricat de multe drumuri le-ar folosi */
    const hot = alarmsToSend(await load(), kv, Math.floor(now.getTime() / 1000))
    for (const l of hot) {
      const ok = await notify(cfg, {
        title: `${ctx.cfg.agent.name}: ${l.name}`,
        text: l.value,
        priority: l.level === 'bad' ? 5 : 4,
        tags: [l.level === 'bad' ? 'rotating_light' : 'warning']
      })
      if (ok) alarms++
    }
  } catch (e) {
    log.warn({ err: (e as Error).message }, 'alarm pass failed')
  }

  if (!due) return { digest: false, alarms }
  try {
    const sent = await pushDigest(ctx, await load())
    /* ziua se bifeaza doar daca mesajul a plecat: altfel o pana de retea de un
       minut ar inghiti rezumatul zilei intregi */
    if (sent) kv.set('digest.day', dayKey(now))
    return { digest: sent, alarms }
  } catch (e) {
    log.warn({ err: (e as Error).message }, 'digest failed')
    return { digest: false, alarms }
  }
}
