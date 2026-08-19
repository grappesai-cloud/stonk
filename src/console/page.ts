/**
 * Consola de operator, pe design-ul site-ului.
 *
 * Foloseste exact aceeasi tema ca ~/stonk-agents si ca peretele public:
 * aceleasi fonturi, aceiasi tokeni, aceleasi componente si aceleasi straturi
 * de fundal.
 *
 * Pagina e statica si isi ia datele din /api/state, deci nu exista niciun loc
 * in care sa se lipeasca text din afara in HTML. Singurele doua actiuni care
 * scriu sunt butoanele de oprit si pornit.
 */
import { THEME, LAYERS_HTML, BRAND_MARK } from '../ui/theme.js'

export function consolePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Courier · Console</title>
<style>
${THEME}
/* ---------- doar ce e specific consolei ---------- */
.page{padding:0 0 80px}
/* antetul ramane lipit sus: butonul de oprit nu are voie sa dispara la
   derulare. Daca esti jos, in tabelul de livrari, si trebuie sa opresti, nu
   vrei sa cauti mai intai butonul. */
header{position:sticky;top:0;z-index:40;
  display:flex;align-items:center;gap:14px;flex-wrap:wrap;
  padding:18px 0 18px;border-bottom:1px solid var(--line);margin-bottom:26px;
  background:rgba(0,0,0,.78);backdrop-filter:blur(14px);
  -webkit-backdrop-filter:blur(14px)}
.spacer{margin-left:auto}
h2{margin:36px 0 14px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--faint);font-family:var(--mono);font-weight:500}
.msg{margin-top:14px;min-height:18px;font-family:var(--mono);font-size:11px;
  letter-spacing:.1em;color:var(--faint)}
.msg.ok{color:var(--green)}
.msg.err{color:var(--red)}
.bars{display:grid;gap:12px;padding:20px 18px}
.bar{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;font-size:14px}
.bar i{display:block;height:4px;background:var(--green);border-radius:2px;opacity:.55;margin-top:7px}
.bar span{font-family:var(--mono);font-size:12px;color:var(--faint)}
footer{margin-top:44px;color:var(--faint);font-family:var(--mono);font-size:10px;letter-spacing:.12em}

@media (max-width:620px){
  .grid{grid-template-columns:1fr 1fr}
  /* cand raman impare, ultima ocupa randul intreg: o jumatate goala arata a
     ceva neterminat, nu a spatiu */
  .cell:last-child:nth-child(odd){grid-column:1 / -1}
  .cell{padding:16px 14px}
  .cell b{font-size:22px}
  .spacer{display:none}
  /* butonul de oprit trece pe rand propriu, pe toata latimea: e cel mai
     important lucru de pe ecran si trebuie nimerit cu degetul */
  header .btn{width:100%;order:9;height:50px}
  th,td{padding-left:10px;padding-right:10px}
  td.m,td.g{font-size:12px;white-space:nowrap}
}
</style>
</head>
<body>
${LAYERS_HTML}
<div class="wrap page">
  <header>
    <span class="brand">${BRAND_MARK} COURIER</span>
    <span class="chip"><i class="dot" id="dot"></i><span id="state">CONNECTING</span></span>
    <span class="chip faint" id="mode">--</span>
    <span class="spacer"></span>
    <button class="btn" id="toggle" disabled>--</button>
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
    t.className = s.paused ? 'btn btn-solid' : 'btn btn-danger';
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
${THEME}
body{min-height:100vh;display:grid;place-items:center}
form{position:relative;z-index:1;display:grid;gap:16px;width:min(380px,90vw);padding:32px;
  border:1px solid var(--line);border-radius:20px;
  background:linear-gradient(180deg,var(--panel-2),var(--panel))}
.brand{margin-bottom:4px}
p{margin:0;color:var(--dim);font-size:14px}
input{height:46px;padding:0 14px;border:1px solid var(--line);border-radius:12px;
  background:rgba(0,0,0,.5);outline:none;transition:border-color .2s,background .2s}
input:focus{border-color:var(--green);background:rgba(0,200,5,.04)}
input::placeholder{color:rgba(255,255,255,.26)}
</style></head>
<body>
${LAYERS_HTML}
<form method="GET" action="/">
  <span class="brand">${BRAND_MARK} COURIER</span>
  <p>Jetonul de operator. Nu e un cont si nu deschide niciun portofel.</p>
  <input name="token" type="password" placeholder="token" autocomplete="off" autofocus>
  <button class="btn btn-solid" type="submit">Intra</button>
</form>
</body></html>`
}
