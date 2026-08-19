/**
 * Peretele uitatilor, ca pagina publica.
 *
 * E artefactul care creeaza cerere inainte sa existe produsul: oricine poate
 * intra si vedea cati bani zac nerevendicati chiar acum. Doar citire, fara
 * conectare de portofel, fara nimic de semnat, si o spune pe fata.
 *
 * Pagina e statica si isi ia datele singura din /wall, deci nu exista niciun
 * loc in care sa se lipeasca text din afara in HTML.
 */
import type { Config } from '../config.js'

export function wallPage(cfg: Config): string {
  const sym = cfg.network.nativeSymbol
  const explorer = cfg.network.explorer ?? ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unclaimed · Courier</title>
<meta name="description" content="Live list of stock drops sitting unclaimed in broker wallets.">
<style>
  :root{
    --bg:#000; --panel:#0a0a0a; --line:rgba(255,255,255,.10);
    --text:#fff; --dim:rgba(255,255,255,.56); --faint:rgba(255,255,255,.32);
    --green:#00c805; --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);
    font:400 16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
    -webkit-font-smoothing:antialiased}
  .wrap{max-width:960px;margin:0 auto;padding:48px 24px 96px}
  .top{display:flex;align-items:center;gap:10px;font:600 12px/1 var(--mono);letter-spacing:.14em;color:var(--faint)}
  .dot{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 12px var(--green);
    animation:pulse 2.4s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
  h1{margin:28px 0 8px;font-size:clamp(34px,7vw,64px);letter-spacing:-.03em;line-height:1.02;font-weight:700}
  h1 em{font-style:normal;color:var(--green)}
  .lede{margin:0;color:var(--dim);max-width:52ch}
  .figures{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1px;
    background:var(--line);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin:40px 0 32px}
  .fig{background:var(--panel);padding:22px 20px}
  .fig b{display:block;font:600 30px/1 var(--mono);letter-spacing:-.02em}
  .fig span{display:block;margin-top:8px;font:500 11px/1 var(--mono);letter-spacing:.12em;color:var(--faint)}
  table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
  th{text-align:left;font:500 11px/1 var(--mono);letter-spacing:.12em;color:var(--faint);
    padding:0 12px 12px;border-bottom:1px solid var(--line)}
  th:last-child,td:last-child{text-align:right}
  td{padding:14px 12px;border-bottom:1px solid var(--line);font-size:14px}
  td.mono{font-family:var(--mono);color:var(--dim)}
  td.val{font-family:var(--mono);color:var(--green);font-weight:600}
  tbody tr{transition:background .15s}
  tbody tr:hover{background:rgba(0,200,5,.05)}
  a{color:inherit;text-decoration:none;border-bottom:1px solid rgba(255,255,255,.2)}
  a:hover{border-color:var(--green)}
  .note{margin-top:40px;padding:18px 20px;border:1px solid var(--line);border-radius:14px;
    color:var(--dim);font-size:14px;background:var(--panel)}
  .note b{color:var(--text)}
  .foot{margin-top:24px;font:500 11px/1.6 var(--mono);letter-spacing:.1em;color:var(--faint)}
  .empty{padding:48px 0;color:var(--faint);text-align:center;font-family:var(--mono);font-size:13px}
  @media (max-width:620px){
    /* patru cifre raman doua pe rand si pe telefon, nu una sub alta:
       altfel pagina se lungeste si se pierde ritmul */
    .figures{grid-template-columns:1fr 1fr}
    .fig{padding:16px 14px}
    .fig b{font-size:24px}
    .wrap{padding:32px 16px 64px}
    th,td{padding-left:8px;padding-right:8px}
    td{font-size:13px}
    /* adresa nu se rupe pe doua randuri; e un identificator, nu o propozitie */
    td.mono{white-space:nowrap}
  }
  @media (prefers-reduced-motion:reduce){.dot{animation:none}}
</style>
</head>
<body>
<div class="wrap">
  <p class="top"><i class="dot"></i><span id="status">READING THE CHAIN</span></p>

  <h1>Money nobody<br><em>came back for.</em></h1>
  <p class="lede">Stock drops that were sent but never claimed, sitting inside broker wallets right now. Courier delivers them.</p>

  <div class="figures">
    <div class="fig"><b id="f-value">0</b><span>${esc(sym)} UNCLAIMED</span></div>
    <div class="fig"><b id="f-count">0</b><span>WALLETS WAITING</span></div>
    <div class="fig"><b id="f-oldest">0</b><span>DAYS, THE OLDEST</span></div>
    <div class="fig"><b id="f-done">0</b><span>ALREADY DELIVERED</span></div>
  </div>

  <table>
    <thead><tr><th>BROKER</th><th>WALLET</th><th>WAITING</th><th>VALUE</th></tr></thead>
    <tbody id="rows"></tbody>
  </table>
  <div class="empty" id="empty" hidden>NOTHING UNCLAIMED RIGHT NOW</div>

  <div class="note">
    <b>We never ask you to connect a wallet.</b> This page only reads what the chain already shows everyone.
    Nothing here can move your funds, and any site or bot that asks you to connect or sign is not us.
  </div>
  <p class="foot">COURIER · STONK AGENTS · <span id="updated">--</span></p>
</div>

<script>
const EXPLORER = ${JSON.stringify(explorer)};
const short = a => a.slice(0,6) + '\\u2026' + a.slice(-4);
const num = (n, d) => n.toLocaleString('en-US', {minimumFractionDigits:d, maximumFractionDigits:d});
/* "0 days" pe o pagina publica arata a bug, nu a informatie */
const waited = d => d === 0 ? 'today' : d === 1 ? '1 day' : d + ' days';

async function tick(){
  try{
    const [wall, stats] = await Promise.all([
      fetch('/wall?limit=25').then(r => r.json()),
      fetch('/stats').then(r => r.json())
    ]);
    document.getElementById('f-value').textContent = num(wall.valueEth, 3);
    document.getElementById('f-count').textContent = wall.count.toLocaleString('en-US');
    document.getElementById('f-oldest').textContent = wall.oldestDays > 0 ? wall.oldestDays.toLocaleString('en-US') : '\u2014';
    document.getElementById('f-done').textContent = stats.stats.jobs.toLocaleString('en-US');

    const body = document.getElementById('rows');
    body.replaceChildren();
    for(const r of wall.rows){
      const tr = document.createElement('tr');
      const id = document.createElement('td');
      id.textContent = '#' + r.tokenId;
      const w = document.createElement('td');
      w.className = 'mono';
      if(EXPLORER){
        const a = document.createElement('a');
        a.href = EXPLORER + '/address/' + r.wallet;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = short(r.wallet);
        w.appendChild(a);
      } else { w.textContent = short(r.wallet); }
      const age = document.createElement('td');
      age.className = 'mono';
      age.textContent = waited(r.ageDays);
      const v = document.createElement('td');
      v.className = 'val';
      v.textContent = num(r.valueEth, 4);
      tr.append(id, w, age, v);
      body.appendChild(tr);
    }
    document.getElementById('empty').hidden = wall.rows.length > 0;
    document.getElementById('status').textContent = 'LIVE';
    document.getElementById('updated').textContent = 'UPDATED ' + new Date().toLocaleTimeString('en-GB');
  }catch(e){
    document.getElementById('status').textContent = 'CHAIN UNREACHABLE';
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
