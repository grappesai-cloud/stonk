/**
 * Peretele uitatilor, pe design-ul site-ului.
 *
 * Foloseste aceeasi tema ca ~/stonk-agents: aceleasi fonturi, aceiasi tokeni,
 * aceleasi butoane si aceleasi straturi de fundal. Daca site-ul si pagina asta
 * ar arata diferit, omul ar simti ca sunt doua produse, si peretele nu ar mai
 * parea al proiectului.
 *
 * Pagina e statica si isi ia datele singura din /wall, deci nu exista niciun
 * loc in care sa se lipeasca text din afara in HTML.
 */
import type { Config } from '../config.js'
import { THEME, LAYERS_HTML, BRAND_MARK } from '../ui/theme.js'

export function wallPage(cfg: Config): string {
  const sym = esc(cfg.network.nativeSymbol)
  const explorer = cfg.network.explorer ?? ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unclaimed · Stonk Agents</title>
<meta name="description" content="Live list of stock drops sitting unclaimed in broker wallets.">
<meta name="theme-color" content="#000000">
<style>
${THEME}
/* ---------- bara de sus, ca pe site ---------- */
.nav{position:fixed;top:0;left:0;right:0;height:var(--nav-h);z-index:50;
  display:flex;align-items:center;gap:16px;padding-inline:var(--pad);
  border-bottom:1px solid transparent;transition:background .3s,border-color .3s,backdrop-filter .3s}
.nav.stuck{background:rgba(0,0,0,.72);backdrop-filter:blur(14px);border-bottom-color:var(--line)}
.nav .chip{margin-left:auto}

/* ---------- hero ---------- */
.hero{padding:calc(var(--nav-h) + 72px) 0 44px;display:grid;gap:22px;justify-items:start}
/* hero-ul aliniaza continutul la stanga, deci copiii nu se intind singuri.
   Grila trebuie sa ocupe toata latimea, altfel se strange pe o coloana. */
.figures{margin-top:14px;width:100%;justify-self:stretch}
.tbl-head{display:flex;align-items:baseline;gap:14px;margin:52px 0 14px}
.tbl-head h2{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);
  font-family:var(--mono);font-weight:500}
.tbl-head span{font-family:var(--mono);font-size:10px;letter-spacing:.12em;color:rgba(255,255,255,.22)}

/* ---------- caseta de siguranta ---------- */
.note{margin-top:36px;padding:22px 24px;border:1px solid var(--line);border-radius:18px;
  color:var(--dim);font-size:15px;background:linear-gradient(180deg,var(--panel-2),var(--panel))}
.note b{color:var(--text)}
.foot{margin-top:28px;padding-bottom:80px;font-family:var(--mono);font-size:10px;
  letter-spacing:.12em;color:var(--faint);text-transform:uppercase}

@media (max-width:620px){
  /* patru cifre raman doua pe rand si pe telefon */
  .grid{grid-template-columns:1fr 1fr}
  .cell{padding:16px 14px}
  .cell b{font-size:23px}
  .hero{padding-top:calc(var(--nav-h) + 40px)}
  th,td{padding-left:10px;padding-right:10px}
  td{font-size:13px}
  /* adresa e un identificator, nu o propozitie: nu se rupe */
  td.m{white-space:nowrap;font-size:12px}
}
</style>
</head>
<body>
${LAYERS_HTML}
<div class="page">

  <header class="nav" id="nav">
    <span class="brand">${BRAND_MARK} STONK AGENTS</span>
    <span class="chip"><i class="dot" id="dot"></i><span id="status">READING THE CHAIN</span></span>
  </header>

  <main class="wrap">
    <section class="hero">
      <p class="eyebrow">COURIER · DELIVERY AGENT</p>
      <h1 class="h-display">Money nobody<br><span class="hl">came back for.</span></h1>
      <p class="lede">Stock drops that were sent but never claimed, sitting inside broker wallets right now. Courier finds them and delivers them.</p>

      <div class="grid figures">
        <div class="cell"><b id="f-value">0</b><span>${sym} unclaimed</span></div>
        <div class="cell"><b id="f-count">0</b><span>wallets waiting</span></div>
        <div class="cell"><b id="f-oldest">0</b><span>days, the oldest</span></div>
        <div class="cell"><b class="green" id="f-done">0</b><span>already delivered</span></div>
      </div>
    </section>

    <div class="tbl-head"><h2>Waiting right now</h2><span id="count-note"></span></div>
    <div class="panel">
      <table>
        <thead><tr><th>Broker</th><th>Wallet</th><th>Waiting</th><th>Value</th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
      <div class="empty" id="empty" hidden>NOTHING UNCLAIMED RIGHT NOW</div>
    </div>

    <div class="note">
      <b>We never ask you to connect a wallet.</b> This page only reads what the chain already shows everyone.
      Nothing here can move your funds, and any site or bot that asks you to connect or sign is not us.
    </div>

    <p class="foot" id="foot">COURIER · STONK AGENTS</p>
  </main>
</div>

<script>
const EXPLORER = ${JSON.stringify(explorer)};
const $ = id => document.getElementById(id);
const short = a => a.slice(0,6) + '\\u2026' + a.slice(-4);
const num = (n, d) => Number(n).toLocaleString('en-US', {minimumFractionDigits:d, maximumFractionDigits:d});
/* "0 days" pe o pagina publica arata a bug, nu a informatie */
const waited = d => d === 0 ? 'today' : d === 1 ? '1 day' : d + ' days';

addEventListener('scroll', () => $('nav').classList.toggle('stuck', scrollY > 12), {passive:true});

async function tick(){
  try{
    const [wall, stats] = await Promise.all([
      fetch('/wall?limit=25').then(r => r.json()),
      fetch('/stats').then(r => r.json())
    ]);
    $('f-value').textContent = num(wall.valueEth, 3);
    $('f-count').textContent = wall.count.toLocaleString('en-US');
    $('f-oldest').textContent = wall.oldestDays > 0 ? wall.oldestDays.toLocaleString('en-US') : '\\u2014';
    $('f-done').textContent = stats.stats.jobs.toLocaleString('en-US');
    $('count-note').textContent = wall.count > 25 ? 'TOP 25 OF ' + wall.count : '';

    const body = $('rows');
    body.replaceChildren();
    for(const r of wall.rows){
      const tr = document.createElement('tr');
      const id = document.createElement('td');
      id.className = 'm';
      id.textContent = '#' + r.tokenId;
      const w = document.createElement('td');
      w.className = 'm';
      if(EXPLORER){
        const a = document.createElement('a');
        a.href = EXPLORER + '/address/' + r.wallet;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = short(r.wallet);
        w.appendChild(a);
      } else { w.textContent = short(r.wallet); }
      const age = document.createElement('td');
      age.className = 'm';
      age.textContent = waited(r.ageDays);
      const v = document.createElement('td');
      v.className = 'g';
      v.textContent = num(r.valueEth, 4);
      tr.append(id, w, age, v);
      body.appendChild(tr);
    }
    $('empty').hidden = wall.rows.length > 0;
    $('status').textContent = 'LIVE';
    $('dot').className = 'dot';
    $('foot').textContent = 'COURIER · STONK AGENTS · UPDATED ' + new Date().toLocaleTimeString('en-GB');
  }catch(e){
    $('status').textContent = 'CHAIN UNREACHABLE';
    $('dot').className = 'dot off';
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
