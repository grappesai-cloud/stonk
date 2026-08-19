/**
 * Peretele uitatilor, piele de terminal.
 *
 * Aceeasi forma ca in consola: panouri cu titlul pe muchie, totul monospace,
 * bare din blocuri. Diferenta e publicul: aici nu se comanda nimic, doar se
 * vede cati bani zac nerevendicati chiar acum.
 *
 * Pagina e statica si isi ia datele din /wall si /stats, deci nu exista niciun
 * loc in care sa se lipeasca text din afara in HTML.
 */
import type { Config } from '../config.js'
import { TERM, TERM_LAYERS, BLOCKS_JS } from '../ui/terminal.js'

export function wallPage(cfg: Config): string {
  const sym = esc(cfg.network.nativeSymbol)
  const explorer = cfg.network.explorer ?? ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UNCLAIMED // STONK AGENTS</title>
<meta name="description" content="Live list of stock drops sitting unclaimed in broker wallets.">
<meta name="theme-color" content="#000000">
<style>
${TERM}
header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:16px 0 14px;
  border-bottom:1px solid var(--line)}
.logo{font-size:13px;font-weight:700;letter-spacing:.24em}
.logo b{color:var(--green)}
.st{margin-left:auto;display:inline-flex;align-items:center;gap:7px;font-size:11px;
  letter-spacing:.16em;color:var(--dim)}

.hero{padding:54px 0 10px;max-width:900px}
.hero h1{margin:0;font-size:clamp(26px,4.6vw,52px);line-height:1.12;font-weight:700;
  letter-spacing:.02em;text-transform:uppercase}
.hero h1 em{font-style:normal;color:var(--green);text-shadow:0 0 28px rgba(0,200,5,.35)}
.hero p{margin:18px 0 0;color:var(--dim);font-size:13px;line-height:1.7;max-width:62ch}
.pre{color:var(--green);font-size:11px;letter-spacing:.24em;margin:0 0 18px}

.sum{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:16px;margin-top:26px}
.big{font-size:clamp(30px,4.4vw,52px);font-weight:700;color:var(--green);line-height:1;
  letter-spacing:-.01em;text-shadow:0 0 26px rgba(0,200,5,.3)}
.mid{font-size:clamp(22px,3vw,34px);font-weight:700;line-height:1;color:var(--text)}
.note{margin-top:22px;border:1px solid var(--line);background:var(--panel);padding:16px 18px;
  font-size:12px;line-height:1.7;color:var(--dim)}
.note b{color:var(--green)}
footer{margin-top:24px;font-size:10px;letter-spacing:.16em;color:var(--faint)}
@media (max-width:820px){ .sum{grid-template-columns:1fr} }
</style>
</head>
<body>
${TERM_LAYERS}
<div class="page">

  <header>
    <span class="logo">STONK AGENTS<b>//</b>COURIER</span>
    <span class="st"><i class="led" id="led"></i><span id="status">READING THE CHAIN</span><i class="cur"></i></span>
  </header>

  <section class="hero">
    <p class="pre">COURIER // DELIVERY AGENT</p>
    <h1>Money nobody<br><em>came back for.</em></h1>
    <p>Stock drops that were sent but never claimed, sitting inside broker wallets right now.
       Courier finds them and delivers them. This page reads the chain every 15 seconds.</p>
  </section>

  <section class="sum">
    <div class="box">
      <span class="t">unclaimed right now</span>
      <div class="box-b">
        <div class="big"><span id="f-value">0.000</span> <span class="k" style="font-size:14px;letter-spacing:.1em">${sym}</span></div>
        <div style="margin-top:12px" id="f-bar"></div>
        <p class="k" style="margin:10px 0 0" id="f-share">--</p>
      </div>
    </div>
    <div class="box">
      <span class="t">wallets waiting</span>
      <div class="box-b">
        <div class="mid" id="f-count">0</div>
        <p class="k" style="margin:12px 0 0">oldest <span class="v" id="f-oldest">--</span></p>
      </div>
    </div>
    <div class="box">
      <span class="t">already delivered</span>
      <div class="box-b">
        <div class="mid g" id="f-done">0</div>
        <p class="k" style="margin:12px 0 0">by the courier fleet</p>
      </div>
    </div>
  </section>

  <div class="box">
    <span class="t">waiting <i id="count-note"></i></span>
    <div class="tscroll">
      <table>
        <thead><tr><th>broker</th><th>wallet</th><th>waiting</th><th>value ${sym}</th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
    <div class="empty" id="empty" hidden>NOTHING UNCLAIMED RIGHT NOW</div>
  </div>

  <div class="note">
    <b>We never ask you to connect a wallet.</b> This page only reads what the chain already shows
    everyone. Nothing here can move your funds, and any site or bot that asks you to connect or sign
    is not us.
  </div>

  <footer id="foot">COURIER // STONK AGENTS</footer>
</div>

<script>
${BLOCKS_JS}
const EXPLORER = ${JSON.stringify(explorer)};
const $ = id => document.getElementById(id);
const short = a => a.slice(0,6) + '\\u2026' + a.slice(-4);
const num = (n, d) => Number(n).toLocaleString('en-US', {minimumFractionDigits:d, maximumFractionDigits:d});
/* "0 days" pe o pagina publica arata a bug, nu a informatie */
const waited = d => d === 0 ? 'today' : d === 1 ? '1 day' : d + ' days';

async function tick(){
  try{
    const [wall, stats] = await Promise.all([
      fetch('/wall?limit=25').then(r => r.json()),
      fetch('/stats').then(r => r.json())
    ]);
    $('f-value').textContent = num(wall.valueEth, 3);
    $('f-count').textContent = wall.count.toLocaleString('en-US');
    $('f-oldest').textContent = wall.oldestDays > 0 ? waited(wall.oldestDays) : 'today';
    $('f-done').textContent = stats.stats.jobs.toLocaleString('en-US');
    $('count-note').textContent = wall.count > 25 ? '\\u00b7 top 25 of ' + wall.count : '';

    const total = wall.count + stats.stats.jobs;
    const bar = $('f-bar'); bar.replaceChildren();
    bar.appendChild(blocks(total > 0 ? wall.count / total : 0, 28));
    $('f-share').textContent = total > 0
      ? Math.round((wall.count / total) * 100) + '% of all drops are still sitting'
      : '';

    const body = $('rows');
    body.replaceChildren();
    for(const r of wall.rows){
      const tr = document.createElement('tr');
      const td = (txt, cls) => { const n = document.createElement('td'); if (cls) n.className = cls; n.textContent = txt; return n; };
      const w = document.createElement('td'); w.className = 'dim';
      if(EXPLORER){
        const a = document.createElement('a');
        a.href = EXPLORER + '/address/' + r.wallet; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = short(r.wallet); w.appendChild(a);
      } else { w.textContent = short(r.wallet); }
      /* id-ul duce la pagina portofelului: aia e pagina care se da mai departe,
         nu peretele general */
      const idCell = document.createElement('td'); idCell.className = 'dim';
      const idLink = document.createElement('a');
      idLink.href = '/w/' + r.wallet;
      idLink.textContent = '#' + r.tokenId;
      idCell.appendChild(idLink);
      tr.append(idCell, w, td(waited(r.ageDays), 'dim'), td(num(r.valueEth, 4), 'g'));
      body.appendChild(tr);
    }
    $('empty').hidden = wall.rows.length > 0;
    $('status').textContent = 'LIVE';
    $('led').className = 'led';
    $('foot').textContent = 'COURIER // STONK AGENTS \\u00b7 UPDATED ' + new Date().toLocaleTimeString('en-GB');
  }catch(e){
    $('status').textContent = 'CHAIN UNREACHABLE';
    $('led').className = 'led off';
  }
}
tick();
setInterval(tick, 15000);
</script>
</body>
</html>`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
