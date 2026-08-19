/**
 * Consola de operator, ca dashboard.
 *
 * Regula de compozitie: un singur numar erou, restul in jurul lui. Cand toate
 * cifrele au aceeasi marime, ochiul nu stie unde sa se uite si panoul devine
 * un tabel cu ambitii. Aici ordinea e: fac bani acum, e sanatos, cat mai am
 * de facut.
 *
 * Foloseste aceeasi tema ca site-ul si ca peretele public.
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
/* ---------- antet lipit ---------- */
header{position:sticky;top:0;z-index:40;display:flex;align-items:center;gap:12px;flex-wrap:wrap;
  padding:16px 0;margin-bottom:24px;border-bottom:1px solid var(--line);
  background:rgba(0,0,0,.8);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
.spacer{margin-left:auto}
header .btn{height:40px;padding:0 18px;font-size:14px}
.page{padding:0 0 90px}

/* ---------- randul erou ---------- */
.hero{display:grid;grid-template-columns:1.35fr 1fr;gap:18px;margin-bottom:18px}
.hero-card{position:relative;border:1px solid var(--line);border-radius:20px;overflow:hidden;
  background:linear-gradient(180deg,var(--panel-2),var(--panel))}
.net{padding:26px 26px 0;position:relative;z-index:1}
.net .eyebrow{margin-bottom:10px}
.net b{display:block;font-family:var(--mono);font-weight:700;letter-spacing:-.04em;
  font-size:clamp(46px,6.4vw,80px);line-height:1;color:var(--green);
  text-shadow:0 0 40px rgba(0,200,5,.35);transition:color .3s}
.net b.red{color:var(--red);text-shadow:0 0 40px rgba(255,80,0,.3)}
.net .under{margin-top:14px;display:flex;flex-wrap:wrap;gap:8px 20px;color:var(--dim);
  font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase}
.net .under i{font-style:normal;color:var(--text);font-weight:600}
.spark{display:block;width:100%;height:120px;margin-top:6px}

/* ---------- fluxul viu ---------- */
.feed{display:flex;flex-direction:column;min-height:260px}
.feed-top{display:flex;align-items:center;gap:10px;padding:20px 22px 12px;
  border-bottom:1px solid var(--line-2)}
.feed-rows{padding:8px 10px 12px;overflow:hidden;flex:1}
.frow{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:baseline;
  padding:9px 12px;border-radius:12px;font-family:var(--mono);font-size:12px}
.frow:nth-child(odd){background:rgba(255,255,255,.02)}
.frow b{color:var(--text);font-weight:600}
.frow span{color:var(--faint);font-size:11px}
.frow em{font-style:normal;color:var(--green);font-weight:700;text-align:right}
.frow.new{animation:pop .6s var(--ease)}
@keyframes pop{
  0%{opacity:0;transform:translateY(-8px);background:rgba(0,200,5,.22)}
  100%{opacity:1;transform:none}
}
.feed-empty{padding:36px 22px;color:var(--faint);font-family:var(--mono);font-size:11px;
  letter-spacing:.1em;text-align:center}

/* ---------- banda de sanatate ---------- */
.health{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:26px}
.hp{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border:1px solid var(--line);
  border-radius:999px;background:rgba(255,255,255,.02);font-family:var(--mono);font-size:11px;
  letter-spacing:.08em;color:var(--dim);white-space:nowrap}
.hp b{color:var(--text);font-weight:600}
.hp.warn{border-color:rgba(255,184,0,.5);color:#ffb800}
.hp.bad{border-color:var(--red);color:var(--red)}

/* ---------- restanta ---------- */
.two{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.card{border:1px solid var(--line);border-radius:20px;padding:24px;
  background:linear-gradient(180deg,var(--panel-2),var(--panel))}
.card h3{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--faint);font-weight:500;margin-bottom:16px}
.big-line{font-size:19px;line-height:1.4}
.big-line b{font-family:var(--mono);color:var(--green);font-weight:700}
.owners{margin-top:18px;display:grid;gap:10px}
.owner{display:grid;grid-template-columns:1fr auto;gap:12px;font-family:var(--mono);font-size:12px;
  color:var(--dim);padding-top:10px;border-top:1px solid var(--line-2)}
.owner b{color:var(--green);font-weight:600}

.bars{display:grid;gap:12px}
.bar{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;font-size:14px}
.bar i{display:block;height:4px;background:var(--green);border-radius:2px;opacity:.55;margin-top:7px}
.bar span{font-family:var(--mono);font-size:12px;color:var(--faint)}

h2{margin:34px 0 14px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--faint);font-family:var(--mono);font-weight:500}
.msg{margin:0 0 16px;min-height:16px;font-family:var(--mono);font-size:11px;
  letter-spacing:.1em;color:var(--faint)}
.msg.ok{color:var(--green)}
.msg.err{color:var(--red)}
footer{margin-top:40px;color:var(--faint);font-family:var(--mono);font-size:10px;letter-spacing:.12em}
/* tabelul lat isi deruleaza propriul container; pagina nu iese niciodata din ecran */
.tscroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.tscroll table{min-width:620px}

@media (max-width:900px){
  .hero,.two{grid-template-columns:1fr}
}
@media (max-width:620px){
  .grid{grid-template-columns:1fr 1fr}
  .cell:last-child:nth-child(odd){grid-column:1 / -1}
  .cell{padding:16px 14px}
  .spacer{display:none}
  /* Antetul NU mai e lipit pe telefon: cu trei butoane in el manca un sfert
     din ecran, permanent. In schimb oprirea devine buton plutitor, jos, in
     zona degetului mare, si e mereu la indemana fara sa ocupe nimic sus. */
  /* backdrop-filter creeaza bloc de contineare pentru copiii pozitionati fix,
     deci butonul plutitor ar ramane agatat de antet in loc sa stea jos pe
     ecran. Pe telefon antetul nu mai e lipit, deci nici blurul nu are rost. */
  header{position:static;gap:8px;padding:14px 0;
    background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none}
  header .btn{flex:1 1 auto;height:42px}
  header .btn.stop{position:fixed;left:14px;right:14px;bottom:14px;z-index:60;
    height:52px;flex:none;box-shadow:0 12px 34px rgba(0,0,0,.7);
    background:rgba(0,0,0,.86);backdrop-filter:blur(12px)}
  header .btn.stop.btn-danger:hover{background:var(--red)}
  .page{padding-bottom:96px}
  .net{padding:20px 18px 0}
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
    <span class="spacer"></span>
    <button class="btn" id="dry" disabled>Proba uscata</button>
    <button class="btn" id="now" disabled>Ruleaza acum</button>
    <button class="btn stop" id="toggle" disabled>--</button>
  </header>

  <p class="msg" id="msg"></p>

  <section class="hero">
    <div class="hero-card">
      <div class="net">
        <p class="eyebrow" id="net-label">Net astazi</p>
        <b id="net">0.0000</b>
        <div class="under">
          <span>incasat <i id="u-earned">0</i></span>
          <span>gaz <i id="u-gas">0</i></span>
          <span>livrari <i id="u-count">0</i></span>
          <span>valoare <i id="u-value">0</i></span>
        </div>
      </div>
      <canvas class="spark" id="spark"></canvas>
    </div>

    <div class="hero-card feed">
      <div class="feed-top"><i class="dot"></i><span class="mono faint">Livrari, in direct</span></div>
      <div class="feed-rows" id="feed"></div>
      <div class="feed-empty" id="feed-empty" hidden>NICIO LIVRARE INCA</div>
    </div>
  </section>

  <div class="health" id="health"></div>

  <div class="two">
    <div class="card">
      <h3>Restanta</h3>
      <p class="big-line" id="backlog">--</p>
      <div class="owners" id="owners"></div>
    </div>
    <div class="card">
      <h3>De ce nu s-a livrat</h3>
      <div class="bars" id="skips"></div>
      <p class="mono faint" id="skips-empty" hidden>NIMIC SARIT</p>
    </div>
  </div>

  <h2>Rulari</h2>
  <div class="panel">
    <div class="tscroll">
    <table>
      <thead><tr><th>Rulare</th><th>Mod</th><th>Scanat</th><th>Livrat</th><th>Gaz</th><th>Bacsis</th></tr></thead>
      <tbody id="runs"></tbody>
    </table>
    </div>
    <div class="empty" id="runs-empty" hidden>NICIO RULARE INCA</div>
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
const mmss = s => Math.floor(s/60) + ':' + String(Math.max(0, s % 60)).padStart(2, '0');

let paused = null, armed = false, armTimer = null, explorer = '', symbol = 'ETH';
let nextRunAt = null, seenFeed = new Set(), first = true, netShown = 0;

/* ---------- numarul erou, care se rostogoleste ---------- */
function setNet(v){
  const el = $('net');
  el.classList.toggle('red', v < 0);
  const from = netShown, to = v, t0 = performance.now(), dur = 700;
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    const val = from + (to - from) * e;
    el.textContent = (val >= 0 ? '+' : '') + num(val, 4);
    if (p < 1) requestAnimationFrame(step);
    else netShown = to;
  };
  if (document.hidden) { el.textContent = (to >= 0 ? '+' : '') + num(to, 4); netShown = to; }
  else requestAnimationFrame(step);
}

/* ---------- graficul celor sapte zile ---------- */
function drawSpark(series){
  const c = $('spark'), ctx = c.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return;
  c.width = w * dpr; c.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!series.length) return;

  const vals = series.map(s => s.netEth);
  const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
  /* cand toate zilele sunt zero, span 0 ar lipi linia de marginea de jos si ar
     arata a grafic stricat. Ii dam o inaltime falsa, ca linia sa stea la mijloc */
  const span = (max - min) || Math.abs(max) || 1;
  const pad = 14;
  const x = i => pad + (i * (w - pad * 2)) / Math.max(1, series.length - 1);
  const y = v => h - pad - ((v - min) / span) * (h - pad * 2);

  /* linia lui zero, ca sa se vada semnul */
  ctx.strokeStyle = 'rgba(255,255,255,.10)';
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(0, y(0)); ctx.lineTo(w, y(0)); ctx.stroke();
  ctx.setLineDash([]);

  const path = new Path2D();
  series.forEach((s, i) => i === 0 ? path.moveTo(x(i), y(s.netEth)) : path.lineTo(x(i), y(s.netEth)));

  const fill = new Path2D();
  fill.moveTo(x(0), y(0));
  series.forEach((s, i) => fill.lineTo(x(i), y(s.netEth)));
  fill.lineTo(x(series.length - 1), y(0));
  fill.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(0,200,5,.30)');
  g.addColorStop(1, 'rgba(0,200,5,0)');
  ctx.fillStyle = g; ctx.fill(fill);

  ctx.strokeStyle = '#00c805'; ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(0,200,5,.7)'; ctx.shadowBlur = 12;
  ctx.stroke(path);
  ctx.shadowBlur = 0;

  const last = series[series.length - 1];
  ctx.beginPath(); ctx.arc(x(series.length - 1), y(last.netEth), 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#00ff2b'; ctx.fill();
}

/* ---------- banda de sanatate ---------- */
function health(s){
  const box = $('health');
  box.replaceChildren();
  const pill = (label, value, tone) => {
    const n = document.createElement('span');
    n.className = 'hp' + (tone ? ' ' + tone : '');
    n.append(document.createTextNode(label + ' '));
    const b = document.createElement('b'); b.textContent = value;
    n.appendChild(b);
    box.appendChild(n);
  };
  pill('LANT', String(s.chainId) + (s.latencyMs != null ? ' · ' + s.latencyMs + 'ms' : ''),
    s.latencyMs == null ? 'bad' : s.latencyMs > 1500 ? 'warn' : '');
  pill('BLOC', s.block ?? '--', s.block ? '' : 'bad');
  pill('MOD', String(s.mode).toUpperCase() + (s.dryRun ? ' · USCAT' : ''), s.dryRun ? 'warn' : '');
  pill('OPERATOR', s.operator ? num(s.operatorBalanceEth, 4) + ' ' + s.symbol : 'fara cheie',
    s.operatorLow ? 'bad' : '');
  pill('ULTIMA RULARE', s.lastRunAt ? ago(s.lastRunAt) + ' in urma' : 'niciodata');
  const nextEl = document.createElement('span');
  nextEl.className = 'hp'; nextEl.id = 'next-pill';
  nextEl.append(document.createTextNode('URMATOAREA '));
  const nb = document.createElement('b'); nb.id = 'next-b';
  nb.textContent = s.running ? 'ACUM' : (s.nextRunAt ? mmss(s.nextRunAt - Math.floor(Date.now()/1000)) : '--');
  nextEl.appendChild(nb);
  box.appendChild(nextEl);
}

setInterval(() => {
  const b = document.getElementById('next-b');
  if (b && nextRunAt) {
    const left = nextRunAt - Math.floor(Date.now()/1000);
    b.textContent = left > 0 ? mmss(left) : 'ACUM';
  }
}, 1000);

/* ---------- fluxul ---------- */
function feed(rows){
  const box = $('feed');
  $('feed-empty').hidden = rows.length > 0;
  const keys = rows.map(r => r.tokenId + ':' + r.at);
  box.replaceChildren();
  rows.slice(0, 7).forEach((r, i) => {
    const key = keys[i];
    const row = document.createElement('div');
    row.className = 'frow' + (!first && !seenFeed.has(key) ? ' new' : '');
    const b = document.createElement('b'); b.textContent = '#' + r.tokenId;
    const s = document.createElement('span'); s.textContent = short(r.wallet) + ' · ' + ago(r.at);
    const em = document.createElement('em'); em.textContent = '+' + num(r.valueEth, 4);
    row.append(b, s, em);
    box.appendChild(row);
  });
  seenFeed = new Set(keys);
}

async function load(){
  let s;
  try{
    const r = await fetch('/api/state', {headers: {accept: 'application/json'}});
    if (r.status === 401) { location.href = '/login'; return; }
    s = await r.json();
  }catch{
    $('state').textContent = 'FARA LEGATURA';
    $('dot').className = 'dot off';
    return;
  }

  explorer = s.explorer || ''; symbol = s.symbol; paused = s.paused; nextRunAt = s.nextRunAt;

  $('state').textContent = s.running ? 'RULEAZA' : s.paused ? 'OPRIT' : (s.dryRun ? 'RULARE USCATA' : 'MERGE');
  $('dot').className = 'dot' + (s.paused ? ' off' : (s.dryRun ? ' warn' : ''));

  const t = $('toggle');
  t.disabled = false;
  if (!armed) {
    t.textContent = s.paused ? 'Porneste' : 'Opreste acum';
    t.className = 'btn stop ' + (s.paused ? 'btn-solid' : 'btn-danger');
  }
  $('dry').disabled = !s.canRun || s.running;
  $('now').disabled = !s.canRun || s.running || s.paused;

  setNet(s.day.netEth);
  $('u-earned').textContent = num(s.day.earnedEth) + ' ' + s.symbol;
  $('u-gas').textContent = num(s.day.gasEth) + ' ' + s.symbol;
  $('u-count').textContent = s.day.deliveries;
  $('u-value').textContent = num(s.day.deliveredEth, 3) + ' ' + s.symbol;
  drawSpark(s.series || []);
  health(s);
  feed(s.deliveries || []);

  const b = $('backlog');
  b.replaceChildren();
  if (s.wall.count > 0) {
    b.append(document.createTextNode(s.wall.count + ' portofele tin '));
    const v = document.createElement('b'); v.textContent = num(s.wall.valueEth, 3) + ' ' + s.symbol;
    b.appendChild(v);
    b.append(document.createTextNode('. Golirea lor costa aproximativ '));
    const c = document.createElement('b'); c.textContent = num(s.backlogCostEth, 5) + ' ' + s.symbol;
    b.appendChild(c);
    b.append(document.createTextNode('.'));
  } else {
    b.textContent = 'Nimic nerevendicat. Totul e livrat.';
  }

  const ow = $('owners');
  ow.replaceChildren();
  for (const o of s.topOwners || []) {
    const row = document.createElement('div'); row.className = 'owner';
    const left = document.createElement('span');
    left.textContent = short(o.owner) + ' · ' + o.wallets + (o.wallets === 1 ? ' broker' : ' brokeri');
    const right = document.createElement('b'); right.textContent = num(o.valueEth, 3);
    row.append(left, right); ow.appendChild(row);
  }

  const skips = $('skips');
  skips.replaceChildren();
  const max = Math.max(1, ...(s.skips || []).map(x => x.count));
  for (const k of s.skips || []) {
    const row = document.createElement('div'); row.className = 'bar';
    const left = document.createElement('div');
    const label = document.createElement('div'); label.textContent = k.reason;
    const bar = document.createElement('i'); bar.style.width = Math.round((k.count / max) * 100) + '%';
    left.append(label, bar);
    const n = document.createElement('span'); n.textContent = k.count;
    row.append(left, n); skips.appendChild(row);
  }
  $('skips-empty').hidden = (s.skips || []).length > 0;

  const body = $('runs');
  body.replaceChildren();
  for (const r of s.runs || []) {
    const tr = document.createElement('tr');
    const td = (txt, cls) => { const n = document.createElement('td'); if (cls) n.className = cls; n.textContent = txt; return n; };
    tr.append(
      td('#' + r.id + '  ' + ago(r.startedAt) + ' in urma', 'm'),
      td(r.dry ? r.mode + ' (uscat)' : r.mode, 'm'),
      td(r.scanned + ' → ' + r.candidates, 'm'),
      td(String(r.delivered), r.delivered > 0 ? 'g' : 'm'),
      td(num(r.gasEth), 'm'),
      td(num(r.tipsEth), 'g')
    );
    if (r.note) tr.title = r.note;
    body.appendChild(tr);
  }
  $('runs-empty').hidden = (s.runs || []).length > 0;

  if (s.lastOutcome) {
    const o = s.lastOutcome;
    $('net-label').textContent = o.dry
      ? 'Net astazi · ultima proba uscata: ' + o.delivered + ' din ' + o.candidates
      : 'Net astazi';
  }
  $('foot').textContent = 'COURIER CONSOLE · ACTUALIZAT ' + new Date().toLocaleTimeString('en-GB');
  first = false;
}

async function post(path, okText){
  const msg = $('msg');
  try{
    const r = await fetch(path, {method: 'POST'});
    const j = await r.json();
    msg.className = r.ok ? 'msg ok' : 'msg err';
    msg.textContent = r.ok ? okText : (j.error || 'NU A MERS').toUpperCase();
  }catch{
    msg.className = 'msg err'; msg.textContent = 'NU A MERS';
  }
  await load();
}

$('dry').addEventListener('click', () => post('/api/run?dry=1', 'PROBA USCATA CERUTA. NU PLEACA NICIO TRANZACTIE.'));
$('now').addEventListener('click', () => post('/api/run', 'RULARE CERUTA.'));

$('toggle').addEventListener('click', async () => {
  const btn = $('toggle');
  /* oprirea merge dintr-un clic: in incident nu vrei sa te intrebe nimic.
     pornirea cere doua, ca sa nu repornesti din greseala ceva oprit dintr-un
     motiv. Confirmarea sta in buton, nu intr-o fereastra de sistem. */
  if (paused && !armed) {
    armed = true;
    btn.textContent = 'Sigur? Apasa iar';
    clearTimeout(armTimer);
    armTimer = setTimeout(() => { armed = false; btn.textContent = 'Porneste'; }, 10000);
    return;
  }
  clearTimeout(armTimer); armed = false; btn.disabled = true;
  await post(paused ? '/api/resume' : '/api/pause', paused ? 'PORNIT.' : 'OPRIT. NU MAI PLEACA NICIO TRANZACTIE.');
});

addEventListener('resize', () => { const c = $('spark'); if (c) load(); });
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
