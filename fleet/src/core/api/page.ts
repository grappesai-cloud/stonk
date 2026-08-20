/**
 * Pagina de stare. Una singura, in stilul site-ului: negru si un verde.
 *
 * Doua lucruri gasite apasand butoane, nu citind cod, la consola Courier-ului,
 * si care sunt reparate din start aici:
 *  - reimprospatarea periodica stergea confirmarea din buton, deci al doilea
 *    clic doar rearma si parea stricat. Acum reimprospatarea NU atinge un
 *    buton aflat in asteptare de confirmare.
 *  - fereastra de confirmare era prea scurta ca sa apuci sa te razgandesti.
 *
 * Si un al treilea lucru, propriu meseriei de Ringer: pagina arata cursele
 * pierdute la fel de mare ca pe cele castigate. Un panou care arata doar
 * reusite te lasa sa crezi ca merge, cand de fapt nu apuci niciodata butonul.
 */
import type { Ctx } from '../context.js'
import { races, stats } from './server.js'

export function statusPage(ctx: Ctx, mode: 'public' | 'console'): string {
  const s = stats(ctx)
  const r = races(ctx)
  const isRinger = ctx.cfg.agent.kind === 'ringer'
  const esc = (v: unknown) => String(v).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!)

  const state = s.standby ? 'STANDBY' : s.dryRun ? 'DRY' : s.mode === 'watchtower' ? 'WATCH' : 'LIVE'

  const rows = s.feed
    .map(
      (e) => `<tr class="${e.kind}"><td>${new Date(e.at * 1000).toISOString().slice(11, 19)}</td>
      <td>${e.kind}</td><td>${esc(e.label)}</td><td class="n">${esc(e.reward)}</td><td class="dim">${esc(e.reason ?? '')}</td></tr>`
    )
    .join('')

  const raceRows = r.recent
    .map(
      (x) => `<tr class="${x.winner === 'us' ? 'work' : 'fail'}"><td>${new Date(x.at * 1000).toISOString().slice(11, 19)}</td>
      <td>${x.winner === 'us' ? 'WON' : 'LOST'}</td><td>${esc(x.key)}</td>
      <td class="dim">${x.winner === 'us' ? '' : esc(x.winner.slice(0, 10))}</td>
      <td class="n">${gwei(x.winnerGasPrice)}</td><td class="n">${gwei(x.ourGasPrice)}</td>
      <td class="dim">${esc(x.note ?? '')}</td></tr>`
    )
    .join('')

  const skips = s.skips.map((k) => `<li><b>${k.count}</b> ${esc(k.reason)}</li>`).join('')

  const controls =
    mode === 'console'
      ? `<div class="ctl">
           <button id="stop" data-action="stop">STOP</button>
           <button id="go" data-action="go">RELEASE</button>
           <button id="dry" data-action="run?dry=1">RUN DRY</button>
           <span id="msg" class="dim"></span>
         </div>`
      : ''

  return `<!doctype html><meta charset="utf-8"><title>${esc(s.agent.name)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#000;--fg:#e8ffe8;--dim:#5c7a5c;--acc:#00c805;--bad:#ff4d4d}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;padding:24px}
h1{font-size:18px;letter-spacing:.14em;margin:0 0 4px}
.badge{display:inline-block;border:1px solid var(--acc);color:var(--acc);padding:1px 8px;margin-left:8px;font-size:12px}
.badge.warn{border-color:var(--bad);color:var(--bad)}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin:20px 0}
.card{border:1px solid #123512;padding:12px}
.card .k{color:var(--dim);font-size:11px;letter-spacing:.1em}
.card .v{font-size:22px;color:var(--acc)}
table{width:100%;border-collapse:collapse;margin:8px 0 24px}
td{padding:3px 8px 3px 0;border-bottom:1px solid #0d240d;white-space:nowrap}
.dim{color:var(--dim);white-space:normal}
.n{text-align:right}
tr.fail td:nth-child(2){color:var(--bad)}
tr.work td:nth-child(2){color:var(--acc)}
tr.head td{color:var(--dim);font-size:11px;letter-spacing:.08em;border-bottom:1px solid #1c4a1c}
h2{font-size:12px;letter-spacing:.14em;color:var(--dim);margin:24px 0 0}
button{background:transparent;border:1px solid var(--acc);color:var(--acc);padding:6px 14px;font:inherit;cursor:pointer;margin-right:8px}
button.armed{background:var(--bad);border-color:var(--bad);color:#000}
.ctl{margin:16px 0}
ul{margin:6px 0;padding-left:18px}
</style>
<h1>${esc(s.agent.name)} <span class="badge ${state === 'LIVE' ? '' : 'warn'}">${state}</span>
<span class="badge">${esc(s.agent.kind)}</span></h1>
<div class="dim">${esc(s.network.name)} (${s.network.chainId})${s.standby ? ' - ' + esc(s.standby) : ''}</div>
${controls}
<div class="grid">
  <div class="card"><div class="k">JOBS DONE</div><div class="v">${s.live.jobsDone}</div></div>
  <div class="card"><div class="k">EARNED</div><div class="v">${esc(s.live.earned)}</div></div>
  <div class="card"><div class="k">GAS BURNED</div><div class="v">${esc(s.live.burned)}</div></div>
  <div class="card"><div class="k">NET</div><div class="v">${esc(s.live.net)}</div></div>
  ${
    isRinger
      ? `<div class="card"><div class="k">RACES WON</div><div class="v">${r.all.won}/${r.all.total}</div></div>
         <div class="card"><div class="k">OTHER BOTS</div><div class="v">${r.all.competitors}</div></div>`
      : `<div class="card"><div class="k">OPEN NOW</div><div class="v">${s.live.openCount}</div></div>`
  }
</div>
${
  isRinger
    ? `<h2>RACE BOOK</h2><table>
       <tr class="head"><td>TIME</td><td>RESULT</td><td>JOB</td><td>WINNER</td>
       <td class="n">THEIR GWEI</td><td class="n">OUR GWEI</td><td>NOTE</td></tr>
       ${raceRows || '<tr><td class="dim">nothing recorded yet</td></tr>'}</table>`
    : ''
}
<h2>ACTIVITY</h2><table>${rows || '<tr><td class="dim">nothing yet</td></tr>'}</table>
<h2>WHY NOTHING HAPPENED (24H)</h2><ul>${skips || '<li class="dim">no skips recorded</li>'}</ul>
<script>
const token = new URLSearchParams(location.search).get('token')
let armed = null, armedTimer = null
const WINDOW = 12
function disarm(b) { if (!b) return; clearInterval(armedTimer); b.classList.remove('armed'); b.textContent = b.dataset.label; if (armed === b) armed = null }
document.querySelectorAll('button').forEach((b) => {
  b.addEventListener('click', async () => {
    if (armed !== b) {
      /* Fereastra de confirmare, cu numaratoare la vedere. Fara numaratoare,
         omul care citeste inainte sa apese gaseste butonul dezarmat si crede
         ca panoul e stricat: exact ce s-a intamplat la consola Courier-ului. */
      disarm(armed)
      armed = b; b.dataset.label = b.textContent; b.classList.add('armed')
      let left = WINDOW
      b.textContent = 'SURE? ' + left
      armedTimer = setInterval(() => {
        left -= 1
        if (left <= 0) return disarm(b)
        b.textContent = 'SURE? ' + left
      }, 1000)
      return
    }
    disarm(b)
    const res = await fetch('/' + b.dataset.action + (b.dataset.action.includes('?') ? '&' : '?') + 'token=' + token, { method: 'POST' })
    document.getElementById('msg').textContent = res.ok ? 'done' : 'refused (' + res.status + ')'
    setTimeout(() => location.reload(), 700)
  })
})
/* reimprospatarea NU are voie sa stearga un buton aflat in confirmare */
setInterval(() => { if (!armed) location.reload() }, 15000)
</script>`
}

function gwei(wei: string): string {
  const n = Number(wei) / 1e9
  return n === 0 ? '' : n.toFixed(2)
}
