/**
 * Consola de operator, piele de terminal.
 *
 * Densitatea e utilitate, nu nostalgie: cu cat incap mai multe randuri fara sa
 * oboseasca ochiul, cu atat afli mai repede ce se intampla. Ordinea ramane
 * aceeasi: fac bani acum, e sanatos, cat mai am de facut.
 *
 * Pagina e statica si isi ia datele din /api/state. Singurele actiuni care
 * scriu sunt cele trei butoane din antet.
 */
import { TERM, TERM_LAYERS, BLOCKS_JS } from '../ui/terminal.js'

export function consolePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>COURIER // CONSOLE</title>
<style>
${TERM}
/* ---------- antet ---------- */
header{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:12px;flex-wrap:wrap;
  padding:14px 0 12px;border-bottom:1px solid var(--line);
  background:#000}
.logo{font-size:13px;font-weight:700;letter-spacing:.24em;color:var(--text)}
.logo b{color:var(--green)}
.st{display:inline-flex;align-items:center;gap:7px;font-size:11px;letter-spacing:.16em;color:var(--dim)}
.sp{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
.msg{min-height:15px;padding:8px 0 0;font-size:10px;letter-spacing:.16em;color:var(--faint)}
.msg.ok{color:var(--green)}
.msg.err{color:var(--red)}

/* ---------- randul erou ---------- */
.top{display:grid;grid-template-columns:1.15fr 1fr;gap:16px}
.net{font-size:clamp(38px,5.6vw,68px);font-weight:700;line-height:1;letter-spacing:-.02em;
  color:var(--green);text-shadow:0 0 26px rgba(0,200,5,.4);margin:2px 0 12px}
.net.neg{color:var(--red);text-shadow:0 0 26px rgba(255,80,0,.35)}
.under{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:11px;color:var(--faint);letter-spacing:.12em}
.under b{color:var(--text);font-weight:600}
.spark{width:100%;height:86px;margin-top:14px}

/* ---------- log ---------- */
.log{padding:10px 12px;display:flex;flex-direction:column;gap:2px;max-height:264px;overflow:hidden}
.ln{display:grid;grid-template-columns:auto auto 1fr auto;gap:10px;align-items:baseline;
  font-size:11.5px;padding:3px 4px;white-space:nowrap}
.ln:hover{background:rgba(0,200,5,.07)}
.ln .ts{color:var(--faint)}
.ln .op{color:var(--green);font-weight:600}
.ln .op.skip{color:var(--amber)}
.ln .op.fail{color:var(--red)}
.ln .op.dry{color:var(--faint)}
.ln .id{color:var(--dim);overflow:hidden;text-overflow:ellipsis}
.ln .am{color:var(--green);font-weight:600}
.ln .am.none{color:var(--faint);font-weight:400}
.ln.fresh{animation:slide .5s ease-out}
@keyframes slide{from{opacity:0;transform:translateX(-8px);background:rgba(0,200,5,.2)}to{opacity:1}}

/* ---------- banda de stare ---------- */
.strip{display:flex;flex-wrap:wrap;gap:0;margin-top:22px;border:1px solid var(--line);background:var(--panel)}
.st-i{padding:10px 14px;font-size:11px;letter-spacing:.1em;color:var(--faint);
  border-right:1px solid var(--line-2);white-space:nowrap;flex:1 1 auto}
.st-i:last-child{border-right:none}
.st-i b{color:var(--text);font-weight:600;letter-spacing:.04em}
.st-i.warn b{color:var(--amber)}
.st-i.bad b{color:var(--red)}

/* ---------- doua panouri ---------- */
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.big{font-size:22px;font-weight:700;color:var(--green);letter-spacing:-.01em}
.rowline{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;
  padding:7px 0;border-bottom:1px solid rgba(232,240,232,.05);font-size:11.5px;color:var(--dim)}
.rowline:last-child{border-bottom:none}
.rowline b{color:var(--green);font-weight:600}
.skip-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:6px 0;font-size:11.5px}
.skip-row .lbl{color:var(--dim)}
.skip-row .n{color:var(--faint)}

@media (max-width:900px){ .top,.two{grid-template-columns:1fr} }
@media (max-width:620px){
  header{position:static;background:transparent}
  .sp{width:100%;margin-left:0}
  .sp .b{flex:1 1 auto;justify-content:center}
  .b.stop{position:fixed;left:12px;right:12px;bottom:12px;z-index:60;height:46px;
    background:#000;box-shadow:0 8px 30px rgba(0,0,0,.8)}
  .page{padding-bottom:86px}
  .st-i{flex:1 1 45%;border-right:none;border-bottom:1px solid var(--line-2)}
}
</style>
</head>
<body>
${TERM_LAYERS}
<div class="page">

  <header>
    <span class="logo">COURIER<b>//</b>CONSOLE</span>
    <span class="st"><i class="led" id="led"></i><span id="state">CONNECTING</span><i class="cur"></i></span>
    <span class="sp">
      <button class="b" id="dry" disabled>proba uscata</button>
      <button class="b" id="now" disabled>ruleaza acum</button>
      <button class="b danger stop" id="toggle" disabled>--</button>
    </span>
  </header>
  <p class="msg" id="msg"></p>

  <section class="top">
    <div class="box">
      <span class="t">net / 24h <i id="net-note"></i></span>
      <div class="box-b">
        <div class="net" id="net">+0.0000</div>
        <div class="under">
          <span>incasat <b id="u-earned">0</b></span>
          <span>gaz <b id="u-gas">0</b></span>
          <span>livrari <b id="u-count">0</b></span>
          <span>valoare <b id="u-value">0</b></span>
        </div>
        <canvas class="spark" id="spark"></canvas>
      </div>
    </div>

    <div class="box">
      <span class="t">log</span>
      <div class="log" id="log"></div>
      <div class="empty" id="log-empty" hidden>NICIUN EVENIMENT INCA</div>
    </div>
  </section>

  <div class="strip" id="strip"></div>

  <section class="two">
    <div class="box">
      <span class="t">restanta</span>
      <div class="box-b">
        <div class="big" id="backlog-val">--</div>
        <div class="under" style="margin-top:8px">
          <span>portofele <b id="backlog-n">0</b></span>
          <span>cost golire <b id="backlog-cost">0</b></span>
        </div>
        <div style="margin-top:12px" id="backlog-bar"></div>
        <div style="margin-top:14px" id="owners"></div>
      </div>
    </div>

    <div class="box">
      <span class="t">de ce nu s-a livrat</span>
      <div class="box-b" id="skips"></div>
      <div class="empty" id="skips-empty" hidden>NIMIC SARIT</div>
    </div>
  </section>

  <div class="box">
    <span class="t">rulari</span>
    <div class="tscroll">
      <table>
        <thead><tr><th>#</th><th>mod</th><th>scanat</th><th>livrat</th><th>gaz</th><th>bacsis</th></tr></thead>
        <tbody id="runs"></tbody>
      </table>
    </div>
    <div class="empty" id="runs-empty" hidden>NICIO RULARE INCA</div>
  </div>

  <p class="msg" id="foot" style="margin-top:20px">COURIER CONSOLE</p>
</div>

<script>
${BLOCKS_JS}
const $ = id => document.getElementById(id);
const num = (n, d = 4) => Number(n).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const short = a => a ? a.slice(0,6) + '\\u2026' + a.slice(-4) : '--';
const hhmmss = t => new Date(t * 1000).toLocaleTimeString('en-GB');
const ago = t => {
  const s = Math.max(0, Math.floor(Date.now()/1000) - t);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s/60) + 'm';
  if (s < 86400) return Math.floor(s/3600) + 'h';
  return Math.floor(s/86400) + 'd';
};
const mmss = s => Math.floor(Math.max(0,s)/60) + ':' + String(Math.max(0, s % 60)).padStart(2,'0');

let paused = null, armed = false, armTimer = null, nextRunAt = null;
let seen = new Set(), first = true, netShown = 0;

function setNet(v){
  const el = $('net');
  el.classList.toggle('neg', v < 0);
  const from = netShown, to = v, t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / 600);
    const val = from + (to - from) * (1 - Math.pow(1 - p, 3));
    el.textContent = (val >= 0 ? '+' : '') + num(val, 4);
    if (p < 1) requestAnimationFrame(step); else netShown = to;
  };
  if (document.hidden) { el.textContent = (to >= 0 ? '+' : '') + num(to, 4); netShown = to; }
  else requestAnimationFrame(step);
}

/* graficul, ca bare cu muchii drepte: acelasi limbaj cu restul paginii */
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
  const span = (max - min) || Math.abs(max) || 1;
  const zero = h - 14 - ((0 - min) / span) * (h - 28);
  const gap = 6;
  const bw = (w - gap * (series.length - 1)) / series.length;

  ctx.strokeStyle = 'rgba(232,240,232,.12)';
  ctx.setLineDash([2, 4]);
  ctx.beginPath(); ctx.moveTo(0, zero); ctx.lineTo(w, zero); ctx.stroke();
  ctx.setLineDash([]);

  series.forEach((s, i) => {
    const x = i * (bw + gap);
    const y = h - 14 - ((s.netEth - min) / span) * (h - 28);
    const up = s.netEth >= 0;
    ctx.fillStyle = up ? 'rgba(0,200,5,.75)' : 'rgba(255,80,0,.75)';
    const top = Math.min(y, zero), height = Math.max(1.5, Math.abs(zero - y));
    ctx.fillRect(x, top, bw, height);
    ctx.fillStyle = up ? '#00ff2b' : '#ff5000';
    ctx.fillRect(x, up ? top : top + height - 2, bw, 2);
  });
}

function strip(s){
  const box = $('strip');
  box.replaceChildren();
  const item = (label, value, tone) => {
    const n = document.createElement('span');
    n.className = 'st-i' + (tone ? ' ' + tone : '');
    n.append(document.createTextNode(label + ' '));
    const b = document.createElement('b'); b.textContent = value;
    n.appendChild(b);
    box.appendChild(n);
    return b;
  };
  item('CHAIN', s.chainId + (s.latencyMs != null ? ' \\u00b7 ' + s.latencyMs + 'ms' : ''),
    s.latencyMs == null ? 'bad' : s.latencyMs > 1500 ? 'warn' : '');
  item('BLK', s.block ?? '--', s.block ? '' : 'bad');
  item('MOD', String(s.mode).toUpperCase() + (s.dryRun ? ' \\u00b7 USCAT' : ''), s.dryRun ? 'warn' : '');
  item('OPERATOR', s.operator ? num(s.operatorBalanceEth, 4) + ' ' + s.symbol : 'fara cheie', s.operatorLow ? 'bad' : '');
  item('LAST', s.lastRunAt ? ago(s.lastRunAt) : '--');
  const nb = item('NEXT', s.running ? 'ACUM' : (s.nextRunAt ? mmss(s.nextRunAt - Math.floor(Date.now()/1000)) : '--'));
  nb.id = 'next-b';
}
setInterval(() => {
  const b = $('next-b');
  if (b && nextRunAt) { const l = nextRunAt - Math.floor(Date.now()/1000); b.textContent = l > 0 ? mmss(l) : 'ACUM'; }
}, 1000);

const OPS = {deliver: 'DELIVER', skip: 'SKIP   ', fail: 'FAIL   ', dry: 'DRY    '};
function log(events){
  const box = $('log');
  $('log-empty').hidden = events.length > 0;
  const keys = events.map(e => e.kind + e.tokenId + e.at);
  box.replaceChildren();
  events.forEach((e, i) => {
    const ln = document.createElement('div');
    ln.className = 'ln' + (!first && !seen.has(keys[i]) ? ' fresh' : '');
    const ts = document.createElement('span'); ts.className = 'ts'; ts.textContent = hhmmss(e.at);
    const op = document.createElement('span'); op.className = 'op ' + e.kind; op.textContent = OPS[e.kind] || e.kind;
    const id = document.createElement('span'); id.className = 'id';
    id.textContent = '#' + e.tokenId + (e.kind === 'deliver' ? ' \\u2192 ' + short(e.wallet) : (e.reason ? ' ' + e.reason : ''));
    const am = document.createElement('span');
    am.className = 'am' + (e.kind === 'deliver' ? '' : ' none');
    am.textContent = e.kind === 'deliver' ? '+' + num(e.valueEth, 4) : '\\u2014';
    ln.append(ts, op, id, am);
    box.appendChild(ln);
  });
  seen = new Set(keys);
}

async function load(){
  let s;
  try{
    const r = await fetch('/api/state', {headers:{accept:'application/json'}});
    if (r.status === 401) { location.href = '/login'; return; }
    s = await r.json();
  }catch{
    $('state').textContent = 'FARA LEGATURA'; $('led').className = 'led off'; return;
  }
  paused = s.paused; nextRunAt = s.nextRunAt;

  $('state').textContent = s.running ? 'RULEAZA' : s.paused ? 'OPRIT' : (s.dryRun ? 'USCAT' : 'ONLINE');
  $('led').className = 'led' + (s.paused ? ' off' : (s.dryRun ? ' warn' : ''));

  const t = $('toggle');
  t.disabled = false;
  if (!armed) {
    t.textContent = s.paused ? 'porneste' : 'opreste';
    t.className = 'b stop ' + (s.paused ? 'hot' : 'danger');
  }
  $('dry').disabled = !s.canRun || s.running;
  $('now').disabled = !s.canRun || s.running || s.paused;

  setNet(s.day.netEth);
  $('u-earned').textContent = num(s.day.earnedEth) + ' ' + s.symbol;
  $('u-gas').textContent = num(s.day.gasEth) + ' ' + s.symbol;
  $('u-count').textContent = s.day.deliveries;
  $('u-value').textContent = num(s.day.deliveredEth, 3) + ' ' + s.symbol;
  $('net-note').textContent = s.lastOutcome && s.lastOutcome.dry
    ? '\\u00b7 ultima proba uscata ' + s.lastOutcome.delivered + '/' + s.lastOutcome.candidates : '';
  drawSpark(s.series || []);
  strip(s);
  log(s.events || []);

  $('backlog-val').textContent = num(s.wall.valueEth, 3) + ' ' + s.symbol;
  $('backlog-n').textContent = s.wall.count;
  $('backlog-cost').textContent = num(s.backlogCostEth, 5) + ' ' + s.symbol;
  const bar = $('backlog-bar');
  bar.replaceChildren();
  const all = s.wall.count + s.all.deliveries;
  bar.appendChild(blocks(all > 0 ? s.wall.count / all : 0, 26));
  const pct = document.createElement('span');
  pct.className = 'k'; pct.style.marginLeft = '10px';
  pct.textContent = all > 0 ? Math.round((s.wall.count / all) * 100) + '% inca de livrat' : '';
  bar.appendChild(pct);

  const ow = $('owners');
  ow.replaceChildren();
  for (const o of s.topOwners || []) {
    const row = document.createElement('div'); row.className = 'rowline';
    const l = document.createElement('span');
    l.textContent = short(o.owner) + ' \\u00b7 ' + o.wallets + (o.wallets === 1 ? ' broker' : ' brokeri');
    const b = document.createElement('b'); b.textContent = num(o.valueEth, 3);
    row.append(l, b); ow.appendChild(row);
  }

  const sk = $('skips');
  sk.replaceChildren();
  const max = Math.max(1, ...(s.skips || []).map(x => x.count));
  for (const k of s.skips || []) {
    const row = document.createElement('div'); row.className = 'skip-row';
    const left = document.createElement('div');
    const lbl = document.createElement('div'); lbl.className = 'lbl'; lbl.textContent = k.reason;
    const bars = blocks(k.count / max, 22);
    bars.style.display = 'block'; bars.style.marginTop = '3px';
    left.append(lbl, bars);
    const n = document.createElement('span'); n.className = 'n'; n.textContent = k.count;
    row.append(left, n); sk.appendChild(row);
  }
  $('skips-empty').hidden = (s.skips || []).length > 0;

  const body = $('runs');
  body.replaceChildren();
  for (const r of s.runs || []) {
    const tr = document.createElement('tr');
    const td = (txt, cls) => { const n = document.createElement('td'); if (cls) n.className = cls; n.textContent = txt; return n; };
    tr.append(
      td('#' + r.id + ' \\u00b7 ' + ago(r.startedAt), 'dim'),
      td(r.dry ? r.mode + '/dry' : r.mode, 'dim'),
      td(r.scanned + ' \\u2192 ' + r.candidates, 'dim'),
      td(String(r.delivered), r.delivered > 0 ? 'g' : 'dim'),
      td(num(r.gasEth), 'dim'),
      td(num(r.tipsEth), 'g')
    );
    if (r.note) tr.title = r.note;
    body.appendChild(tr);
  }
  $('runs-empty').hidden = (s.runs || []).length > 0;
  $('foot').textContent = 'COURIER CONSOLE \\u00b7 ' + new Date().toLocaleTimeString('en-GB');
  first = false;
}

async function post(path, okText){
  const msg = $('msg');
  try{
    const r = await fetch(path, {method:'POST'});
    const j = await r.json();
    msg.className = r.ok ? 'msg ok' : 'msg err';
    msg.textContent = r.ok ? okText : String(j.error || 'NU A MERS').toUpperCase();
  }catch{ msg.className = 'msg err'; msg.textContent = 'NU A MERS'; }
  await load();
}

$('dry').addEventListener('click', () => post('/api/run?dry=1', 'PROBA USCATA CERUTA \\u00b7 NU PLEACA NICIO TRANZACTIE'));
$('now').addEventListener('click', () => post('/api/run', 'RULARE CERUTA'));
$('toggle').addEventListener('click', async () => {
  const btn = $('toggle');
  /* oprirea dintr-un clic; pornirea cere doua, ca sa nu repornesti din greseala
     ceva oprit dintr-un motiv. Confirmarea sta in buton, nu intr-o fereastra. */
  if (paused && !armed) {
    armed = true; btn.textContent = 'sigur? apasa iar';
    clearTimeout(armTimer);
    armTimer = setTimeout(() => { armed = false; btn.textContent = 'porneste'; }, 10000);
    return;
  }
  clearTimeout(armTimer); armed = false; btn.disabled = true;
  await post(paused ? '/api/resume' : '/api/pause', paused ? 'PORNIT' : 'OPRIT \\u00b7 NU MAI PLEACA NICIO TRANZACTIE');
});

addEventListener('resize', () => load());
load();
setInterval(load, 5000);
</script>
</body>
</html>`
}

export function loginPage(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>COURIER // CONSOLE</title>
<style>
${TERM}
body{min-height:100vh;display:grid;place-items:center}
form{position:relative;z-index:1;width:min(400px,92vw);border:1px solid var(--line);
  background:var(--panel);padding:26px 22px;display:grid;gap:14px}
.logo{font-size:13px;font-weight:700;letter-spacing:.24em}
.logo b{color:var(--green)}
p{margin:0;color:var(--dim);font-size:11.5px;line-height:1.6}
input{height:38px;padding:0 12px;border:1px solid var(--line);background:#000;outline:none;
  font-size:12px;letter-spacing:.1em}
input:focus{border-color:var(--green)}
input::placeholder{color:var(--faint);letter-spacing:.16em}
</style></head>
<body>
${TERM_LAYERS}
<form method="GET" action="/">
  <span class="logo">COURIER<b>//</b>CONSOLE</span>
  <p>Jetonul de operator. Nu e un cont si nu deschide niciun portofel.</p>
  <input name="token" type="password" placeholder="token" autocomplete="off" autofocus>
  <button class="b hot" type="submit">intra</button>
</form>
</body></html>`
}
