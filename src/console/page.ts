/**
 * Consola de operator. Acelasi limbaj vizual ca site-ul: negru, un singur
 * verde, tipografie mare, cifre monospace.
 *
 * Pagina e statica si isi ia datele din /api/state, deci nu exista niciun loc
 * in care sa se lipeasca text din afara in HTML. Singurele doua actiuni care
 * scriu sunt butoanele de oprit si pornit.
 */
export function consolePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Courier · Console</title>
<style>
  :root{
    --bg:#000; --panel:#0a0a0a; --panel-2:#101010;
    --line:rgba(255,255,255,.10); --line-2:rgba(255,255,255,.055);
    --text:#fff; --dim:rgba(255,255,255,.58); --faint:rgba(255,255,255,.34);
    --green:#00c805; --green-hot:#00ff2b; --green-soft:rgba(0,200,5,.12);
    --red:#ff5000;
    --mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
    --sans:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,system-ui,sans-serif;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font:400 16px/1.55 var(--sans);
    -webkit-font-smoothing:antialiased}
  .wrap{max-width:1120px;margin:0 auto;padding:28px 24px 80px}
  .mono{font-family:var(--mono);font-weight:500;letter-spacing:.1em;text-transform:uppercase;font-size:11px}
  .faint{color:var(--faint)}

  header{display:flex;align-items:center;gap:16px;flex-wrap:wrap;
    padding-bottom:22px;border-bottom:1px solid var(--line);margin-bottom:28px}
  .brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.02em;font-size:16px;white-space:nowrap}
  .brand svg{width:20px;height:20px;fill:none;stroke:var(--green);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
  .chip{display:inline-flex;align-items:center;gap:9px;padding:7px 14px 7px 11px;
    border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.02)}
  .dot{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 10px var(--green);
    animation:pulse 2.4s ease-in-out infinite}
  .dot.off{background:var(--red);box-shadow:0 0 10px var(--red);animation:none}
  .dot.warn{background:#ffb800;box-shadow:0 0 10px #ffb800}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
  .spacer{margin-left:auto}

  button{font:inherit;color:inherit;cursor:pointer;border-radius:999px;border:1px solid var(--line);
    background:transparent;height:44px;padding:0 22px;font-weight:600;font-size:15px;
    transition:background .2s,border-color .2s,color .2s,transform .2s}
  button:hover{border-color:rgba(255,255,255,.4);background:rgba(255,255,255,.04)}
  button:active{transform:scale(.98)}
  button.stop{border-color:var(--red);color:var(--red)}
  button.stop:hover{background:var(--red);color:#000}
  button.go{background:var(--green);border-color:var(--green);color:#000}
  button.go:hover{background:var(--green-hot);border-color:var(--green-hot)}
  button:disabled{opacity:.45;cursor:default}

  h2{margin:36px 0 14px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;
    color:var(--faint);font-family:var(--mono);font-weight:500}
  .grid{display:grid;gap:1px;background:var(--line);border:1px solid var(--line);
    border-radius:16px;overflow:hidden;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
  .cell{background:var(--panel);padding:22px 20px}
  .cell b{display:block;font-family:var(--mono);font-size:28px;font-weight:700;letter-spacing:-.02em;
    overflow-wrap:anywhere}
  .cell b.soft{font-size:18px;color:var(--faint)}
  .cell b.green{color:var(--green)}
  .cell b.red{color:var(--red)}
  .cell span{display:block;margin-top:8px;color:var(--faint);font-family:var(--mono);
    font-size:10px;letter-spacing:.12em;text-transform:uppercase}

  .panel{border:1px solid var(--line);border-radius:16px;background:var(--panel);overflow:hidden}
  table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
  th{text-align:left;padding:14px 16px;border-bottom:1px solid var(--line);
    font-family:var(--mono);font-size:10px;letter-spacing:.12em;color:var(--faint);text-transform:uppercase;font-weight:500}
  td{padding:13px 16px;border-bottom:1px solid var(--line-2);font-size:14px}
  tr:last-child td{border-bottom:none}
  td.m{font-family:var(--mono);color:var(--dim);font-size:13px}
  td.g{font-family:var(--mono);color:var(--green);font-size:13px}
  td.r{color:var(--red)}
  th:last-child,td:last-child{text-align:right}
  tbody tr:hover{background:rgba(0,200,5,.04)}
  a{color:inherit;border-bottom:1px solid rgba(255,255,255,.2);text-decoration:none}
  a:hover{border-color:var(--green)}
  .empty{padding:30px 16px;text-align:center;color:var(--faint);font-family:var(--mono);font-size:12px}
  .bars{display:grid;gap:10px;padding:18px 16px}
  .bar{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;font-size:13px}
  .bar i{display:block;height:4px;background:var(--green);border-radius:2px;opacity:.5;margin-top:6px}
  .bar span{font-family:var(--mono);font-size:12px;color:var(--faint)}
  .msg{margin-top:14px;min-height:18px;font-family:var(--mono);font-size:11px;letter-spacing:.1em;color:var(--faint)}
  .msg.ok{color:var(--green)}
  .msg.err{color:var(--red)}
  footer{margin-top:44px;color:var(--faint);font-family:var(--mono);font-size:10px;letter-spacing:.12em}
  @media (max-width:620px){ .spacer{margin-left:0;width:100%} header{gap:12px} }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <span class="brand">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 17.5 8 11l4 3.5L22 4"/><path d="M16 4h6v6"/></svg>
      COURIER
    </span>
    <span class="chip"><i class="dot" id="dot"></i><span class="mono" id="state">CONNECTING</span></span>
    <span class="chip mono faint" id="mode">--</span>
    <span class="spacer"></span>
    <button id="toggle" disabled>--</button>
  </header>

  <p class="msg" id="msg"></p>

  <h2>Ultimele 24 de ore</h2>
  <div class="grid" id="day"></div>

  <h2>De la inceput</h2>
  <div class="grid" id="all"></div>

  <h2>Lantul si operatorul</h2>
  <div class="grid" id="chain"></div>

  <h2>Rulari</h2>
  <div class="panel">
    <table>
      <thead><tr><th>Rulare</th><th>Mod</th><th>Scanat</th><th>Livrat</th><th>Gaz</th><th>Bacsis</th></tr></thead>
      <tbody id="runs"></tbody>
    </table>
    <div class="empty" id="runs-empty" hidden>NICIO RULARE INCA</div>
  </div>

  <h2>De ce nu s-a livrat</h2>
  <div class="panel"><div class="bars" id="skips"></div><div class="empty" id="skips-empty" hidden>NIMIC SARIT</div></div>

  <h2>Ultimele livrari</h2>
  <div class="panel">
    <table>
      <thead><tr><th>Broker</th><th>Portofel</th><th>Cand</th><th>Valoare</th></tr></thead>
      <tbody id="deliveries"></tbody>
    </table>
    <div class="empty" id="deliveries-empty" hidden>NICIO LIVRARE INCA</div>
  </div>

  <footer id="foot">COURIER CONSOLE</footer>
</div>

<script>
const $ = id => document.getElementById(id);
const num = (n, d = 4) => Number(n).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const short = a => a ? a.slice(0,6) + '\\u2026' + a.slice(-4) : '--';
const ago = t => {
  const s = Math.max(0, Math.floor(Date.now()/1000) - t);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s/60) + 'm';
  if (s < 86400) return Math.floor(s/3600) + 'h';
  return Math.floor(s/86400) + 'd';
};
let paused = null;
let explorer = '';
let armed = false;
let armTimer = null;

function tiles(node, items) {
  node.replaceChildren();
  for (const it of items) {
    const c = document.createElement('div'); c.className = 'cell';
    const b = document.createElement('b'); b.textContent = it.value;
    if (it.tone) b.className = it.tone;
    const s = document.createElement('span'); s.textContent = it.label;
    c.append(b, s); node.appendChild(c);
  }
}

function rows(tbody, emptyEl, list, build) {
  tbody.replaceChildren();
  for (const item of list) tbody.appendChild(build(item));
  emptyEl.hidden = list.length > 0;
}

function td(text, cls) { const n = document.createElement('td'); if (cls) n.className = cls; n.textContent = text; return n; }

async function load() {
  let s;
  try {
    const r = await fetch('/api/state', {headers: {accept: 'application/json'}});
    if (r.status === 401) { location.href = '/login'; return; }
    s = await r.json();
  } catch {
    $('state').textContent = 'FARA LEGATURA';
    $('dot').className = 'dot off';
    return;
  }

  explorer = s.explorer || '';
  paused = s.paused;
  $('state').textContent = s.paused ? 'OPRIT' : (s.dryRun ? 'RULARE USCATA' : 'MERGE');
  $('dot').className = 'dot' + (s.paused ? ' off' : (s.dryRun ? ' warn' : ''));
  $('mode').textContent = 'MOD ' + String(s.mode).toUpperCase();
  const t = $('toggle');
  t.disabled = false;
  /* Cat timp butonul asteapta confirmarea, reimprospatarea NU are voie sa il
     atinga: altfel scrie peste "Sigur? Apasa iar", omul crede ca primul clic
     nu a intrat, si al doilea lui clic ajunge sa confirme fara sa mai fi vazut
     intrebarea. */
  if (!armed) {
    t.textContent = s.paused ? 'Porneste' : 'Opreste acum';
    t.className = s.paused ? 'go' : 'stop';
  }

  tiles($('day'), [
    {value: String(s.day.deliveries), label: 'livrari'},
    {value: num(s.day.deliveredEth, 3), label: 'valoare livrata ' + s.symbol},
    {value: num(s.day.earnedEth), label: 'bacsis incasat', tone: 'green'},
    {value: num(s.day.gasEth), label: 'gaz ars'},
    {value: num(s.day.netEth), label: 'net', tone: s.day.netEth < 0 ? 'red' : 'green'}
  ]);
  tiles($('all'), [
    {value: String(s.all.deliveries), label: 'livrari'},
    {value: String(s.all.wallets), label: 'portofele atinse'},
    {value: num(s.all.deliveredEth, 3), label: 'valoare livrata'},
    {value: num(s.all.netEth), label: 'net', tone: s.all.netEth < 0 ? 'red' : 'green'},
    {value: String(s.wall.count), label: 'inca nerevendicate'}
  ]);
  tiles($('chain'), [
    {value: String(s.chainId), label: 'lant'},
    {value: s.block ? String(s.block) : '--', label: 'bloc'},
    {value: s.operator ? num(s.operatorBalanceEth, 4) : 'fara cheie', label: 'sold operator ' + s.symbol,
     tone: s.operatorLow ? 'red' : (s.operator ? '' : 'soft')},
    {value: s.operator ? short(s.operator) : 'doar citire', label: 'operator',
     tone: s.operator ? '' : 'soft'},
    {value: num(s.wall.valueEth, 3), label: 'valoare nerevendicata'}
  ]);

  rows($('runs'), $('runs-empty'), s.runs, r => {
    const tr = document.createElement('tr');
    tr.append(
      td('#' + r.id + '  ' + ago(r.startedAt) + ' in urma', 'm'),
      td(r.dry ? r.mode + ' (uscat)' : r.mode, 'm'),
      td(r.scanned + ' → ' + r.candidates, 'm'),
      td(String(r.delivered), r.delivered > 0 ? 'g' : 'm'),
      td(num(r.gasEth), 'm'),
      td(num(r.tipsEth), 'g')
    );
    if (r.note) tr.title = r.note;
    return tr;
  });

  const skips = $('skips');
  skips.replaceChildren();
  const max = Math.max(1, ...s.skips.map(x => x.count));
  for (const k of s.skips) {
    const row = document.createElement('div'); row.className = 'bar';
    const left = document.createElement('div');
    const label = document.createElement('div'); label.textContent = k.reason;
    const bar = document.createElement('i'); bar.style.width = Math.round((k.count / max) * 100) + '%';
    left.append(label, bar);
    const n = document.createElement('span'); n.textContent = k.count;
    row.append(left, n); skips.appendChild(row);
  }
  $('skips-empty').hidden = s.skips.length > 0;

  rows($('deliveries'), $('deliveries-empty'), s.deliveries, d => {
    const tr = document.createElement('tr');
    const w = document.createElement('td'); w.className = 'm';
    if (explorer) {
      const a = document.createElement('a');
      a.href = explorer + '/address/' + d.wallet; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = short(d.wallet); w.appendChild(a);
    } else w.textContent = short(d.wallet);
    tr.append(td('#' + d.tokenId, 'm'), w, td(ago(d.at) + ' in urma', 'm'), td(num(d.valueEth), 'g'));
    return tr;
  });

  $('foot').textContent = 'COURIER CONSOLE · ACTUALIZAT ' + new Date().toLocaleTimeString('en-GB');
}

$('toggle').addEventListener('click', async () => {
  const msg = $('msg');
  const btn = $('toggle');
  /* Oprirea merge dintr-un singur clic: in incident nu vrei sa te intrebe
     nimic. Pornirea cere doua clicuri, ca sa nu repornesti din greseala ceva
     ce a fost oprit dintr-un motiv. Confirmarea sta in buton, nu intr-o
     fereastra de sistem: aia blocheaza pagina si nu se poate stiliza. */
  if (paused && !armed) {
    armed = true;
    btn.textContent = 'Sigur? Apasa iar';
    clearTimeout(armTimer);
    /* zece secunde, nu patru: cat sa citesti si sa te razgandesti. Prea scurt
       si omul apasa, ezita, apasa iar, iar al doilea clic doar rearmeaza. Pare
       buton stricat. */
    armTimer = setTimeout(() => { armed = false; btn.textContent = 'Porneste'; }, 10000);
    return;
  }
  clearTimeout(armTimer);
  armed = false;
  btn.disabled = true;
  try {
    const r = await fetch(paused ? '/api/resume' : '/api/pause', {method: 'POST'});
    const j = await r.json();
    msg.className = r.ok ? 'msg ok' : 'msg err';
    msg.textContent = r.ok ? (j.paused ? 'OPRIT. NU MAI PLEACA NICIO TRANZACTIE.' : 'PORNIT.') : (j.error || 'NU A MERS');
  } catch {
    msg.className = 'msg err'; msg.textContent = 'NU A MERS';
  }
  await load();
});

load();
setInterval(load, 5000);
</script>
</body>
</html>`
}

export function loginPage(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Courier · Console</title>
<style>
 body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#fff;
   font:400 16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif}
 form{display:grid;gap:14px;width:min(360px,90vw);padding:30px;border:1px solid rgba(255,255,255,.1);
   border-radius:18px;background:#0a0a0a}
 h1{margin:0;font-size:20px;letter-spacing:-.02em}
 p{margin:0;color:rgba(255,255,255,.55);font-size:14px}
 input{height:46px;padding:0 14px;border:1px solid rgba(255,255,255,.1);border-radius:12px;
   background:rgba(0,0,0,.6);color:#fff;outline:none;font:inherit}
 input:focus{border-color:#00c805}
 button{height:46px;border:none;border-radius:999px;background:#00c805;color:#000;font-weight:600;
   font-size:15px;cursor:pointer}
</style></head>
<body>
<form method="GET" action="/">
  <h1>Courier console</h1>
  <p>Jetonul de operator. Nu e un cont si nu deschide niciun portofel.</p>
  <input name="token" type="password" placeholder="token" autocomplete="off" autofocus>
  <button type="submit">Intra</button>
</form>
</body></html>`
}
