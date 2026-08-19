/**
 * Paginile publice per agent si per portofel.
 *
 * Peretele general e frumos, dar nimeni nu il da mai departe. Pagina LUI, cu
 * banii LUI, da. De aia exista astea doua: una arata ce a facut un agent anume,
 * cealalta ce are de luat o adresa anume.
 *
 * Amandoua sunt statice si isi iau datele singure, dupa adresa din bara. Nu se
 * lipeste nimic din afara in HTML.
 */
import type { Config } from '../config.js'
import { TERM, TERM_LAYERS, BLOCKS_JS } from '../ui/terminal.js'

const head = (title: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="theme-color" content="#000000">
<style>
${TERM}
header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:16px 0 14px;
  border-bottom:1px solid var(--line)}
.logo{font-size:13px;font-weight:700;letter-spacing:.24em}
.logo b{color:var(--green)}
.st{margin-left:auto;display:inline-flex;align-items:center;gap:7px;font-size:11px;
  letter-spacing:.16em;color:var(--dim)}
.hero{padding:44px 0 8px}
.pre{color:var(--green);font-size:11px;letter-spacing:.24em;margin:0 0 14px}
.big{font-size:clamp(30px,4.6vw,56px);font-weight:700;color:var(--green);line-height:1;
  letter-spacing:-.01em;text-shadow:0 0 26px rgba(0,200,5,.3)}
.sub{margin:16px 0 0;color:var(--dim);font-size:13px;line-height:1.7;max-width:64ch}
.sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-top:24px}
.mid{font-size:26px;font-weight:700;line-height:1;color:var(--text)}
.note{margin-top:22px;border:1px solid var(--line);background:var(--panel);padding:16px 18px;
  font-size:12px;line-height:1.7;color:var(--dim)}
.note b{color:var(--green)}
footer{margin-top:24px;font-size:10px;letter-spacing:.16em;color:var(--faint)}
.miss{padding:44px 0;color:var(--faint);font-size:12px;letter-spacing:.14em}
</style>
</head>
<body>
${TERM_LAYERS}
<div class="page">`

const foot = (script: string) => `</div>
<script>
${BLOCKS_JS}
const $ = id => document.getElementById(id);
const num = (n, d) => Number(n).toLocaleString('en-US', {minimumFractionDigits:d, maximumFractionDigits:d});
const short = a => a ? a.slice(0,6) + '\\u2026' + a.slice(-4) : '--';
const waited = d => d === 0 ? 'today' : d === 1 ? '1 day' : d + ' days';
const when = t => t ? new Date(t * 1000).toLocaleDateString('en-GB') : '--';
${script}
</script>
</body>
</html>`

/** pagina unui agent: ce a livrat si ce a castigat bucata asta */
export function agentPage(cfg: Config): string {
  const sym = esc(cfg.network.nativeSymbol)
  const explorer = cfg.network.explorer ?? ''
  return (
    head('AGENT // STONK AGENTS') +
    `
  <header>
    <a class="logo" href="/">STONK AGENTS<b>//</b>COURIER</a>
    <span class="st"><i class="led"></i><span id="status">LOADING</span></span>
  </header>

  <section class="hero">
    <p class="pre" id="pre">COURIER AGENT</p>
    <h1 class="big"><span id="earned">0.0000</span> <span class="k" style="font-size:14px">${sym} EARNED</span></h1>
    <p class="sub" id="sub">This agent delivers stock drops that brokers never claimed. It keeps what the
       protocol pays for the work, and it never touches anyone funds.</p>
  </section>

  <div class="sum">
    <div class="box"><span class="t">deliveries</span><div class="box-b"><div class="mid" id="n">0</div></div></div>
    <div class="box"><span class="t">wallets reached</span><div class="box-b"><div class="mid" id="w">0</div></div></div>
    <div class="box"><span class="t">value delivered</span><div class="box-b"><div class="mid" id="v">0</div></div></div>
    <div class="box"><span class="t">working since</span><div class="box-b"><div class="mid" id="since">--</div></div></div>
  </div>

  <div class="box">
    <span class="t">recent work</span>
    <div class="tscroll">
      <table>
        <thead><tr><th>broker</th><th>when</th><th>delivered ${sym}</th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
    <div class="empty" id="empty" hidden>NO WORK RECORDED YET</div>
  </div>

  <div class="note">
    <b>Nothing here can move your funds.</b> This page only reads the chain and this agent public
    ledger. Any site or bot that asks you to connect or sign is not us.
  </div>
  <footer id="foot">COURIER // STONK AGENTS</footer>
` +
    foot(`
const EXPLORER = ${JSON.stringify(explorer)};
const id = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
async function tick(){
  try{
    const a = await fetch('/api/agent/' + encodeURIComponent(id)).then(r => r.json());
    if (a.error) { $('status').textContent = 'UNKNOWN AGENT'; return; }
    document.title = a.name + ' // STONK AGENTS';
    $('pre').textContent = a.name;
    $('earned').textContent = num(a.earnedEth, 4);
    $('n').textContent = a.deliveries.toLocaleString('en-US');
    $('w').textContent = a.wallets.toLocaleString('en-US');
    $('v').textContent = num(a.deliveredEth, 3);
    $('since').textContent = when(a.firstAt);
    const body = $('rows'); body.replaceChildren();
    for (const h of a.history) {
      const tr = document.createElement('tr');
      const td = (t, c) => { const n = document.createElement('td'); if (c) n.className = c; n.textContent = t; return n; };
      const first = td('#' + h.tokenId, 'dim');
      const w = document.createElement('td'); w.className = 'dim';
      if (EXPLORER && h.txHash) {
        const link = document.createElement('a');
        link.href = EXPLORER + '/tx/' + h.txHash; link.target = '_blank'; link.rel = 'noopener';
        link.textContent = when(h.at); w.appendChild(link);
      } else { w.textContent = when(h.at); }
      tr.append(first, w, td(num(h.valueEth, 4), 'g'));
      body.appendChild(tr);
    }
    $('empty').hidden = a.history.length > 0;
    $('status').textContent = 'LIVE';
    $('foot').textContent = 'COURIER // STONK AGENTS \\u00b7 ' + new Date().toLocaleTimeString('en-GB');
  }catch{ $('status').textContent = 'CHAIN UNREACHABLE'; }
}
tick(); setInterval(tick, 20000);
`)
  )
}

/** pagina unei adrese: ce i s-a livrat si ce ii mai sta nerevendicat */
export function walletPage(cfg: Config): string {
  const sym = esc(cfg.network.nativeSymbol)
  const explorer = cfg.network.explorer ?? ''
  return (
    head('WALLET // STONK AGENTS') +
    `
  <header>
    <a class="logo" href="/">STONK AGENTS<b>//</b>COURIER</a>
    <span class="st"><i class="led"></i><span id="status">LOADING</span></span>
  </header>

  <section class="hero">
    <p class="pre" id="addr">WALLET</p>
    <h1 class="big"><span id="pending">0.000</span> <span class="k" style="font-size:14px">${sym} WAITING FOR YOU</span></h1>
    <p class="sub">Stock drops that were sent to you and never claimed. Courier delivers them on its own.
       You do not have to do anything, and you never have to connect or sign.</p>
  </section>

  <div class="sum">
    <div class="box"><span class="t">wallets holding</span><div class="box-b"><div class="mid" id="n">0</div></div></div>
    <div class="box"><span class="t">already delivered</span><div class="box-b"><div class="mid g" id="d">0</div></div></div>
    <div class="box"><span class="t">delivered value</span><div class="box-b"><div class="mid" id="dv">0</div></div></div>
    <div class="box"><span class="t">last delivery</span><div class="box-b"><div class="mid" id="last">--</div></div></div>
  </div>

  <div class="box">
    <span class="t">waiting</span>
    <div class="tscroll">
      <table>
        <thead><tr><th>broker</th><th>wallet</th><th>waiting</th><th>value ${sym}</th></tr></thead>
        <tbody id="pend"></tbody>
      </table>
    </div>
    <div class="empty" id="pend-empty" hidden>NOTHING WAITING</div>
  </div>

  <div class="box">
    <span class="t">delivered to you</span>
    <div class="tscroll">
      <table>
        <thead><tr><th>broker</th><th>when</th><th>value ${sym}</th></tr></thead>
        <tbody id="hist"></tbody>
      </table>
    </div>
    <div class="empty" id="hist-empty" hidden>NOTHING DELIVERED YET</div>
  </div>

  <div class="note">
    <b>We never ask you to connect a wallet.</b> This page only reads what the chain already shows
    everyone. Nothing here can move your funds, and any site or bot that asks you to connect or sign
    is not us.
  </div>
  <footer id="foot">COURIER // STONK AGENTS</footer>
` +
    foot(`
const EXPLORER = ${JSON.stringify(explorer)};
const addr = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
async function tick(){
  try{
    const a = await fetch('/api/wallet/' + encodeURIComponent(addr)).then(r => r.json());
    if (a.error) { $('status').textContent = 'BAD ADDRESS'; return; }
    $('addr').textContent = 'WALLET ' + short(a.address);
    $('pending').textContent = num(a.pendingEth, 3);
    $('n').textContent = a.pending.length;
    $('d').textContent = a.delivered.count;
    $('dv').textContent = num(a.delivered.valueEth, 3);
    $('last').textContent = when(a.delivered.lastAt);

    const p = $('pend'); p.replaceChildren();
    for (const r of a.pending) {
      const tr = document.createElement('tr');
      const td = (t, c) => { const n = document.createElement('td'); if (c) n.className = c; n.textContent = t; return n; };
      const w = document.createElement('td'); w.className = 'dim';
      if (EXPLORER) {
        const link = document.createElement('a');
        link.href = EXPLORER + '/address/' + r.wallet; link.target = '_blank'; link.rel = 'noopener';
        link.textContent = short(r.wallet); w.appendChild(link);
      } else { w.textContent = short(r.wallet); }
      tr.append(td('#' + r.tokenId, 'dim'), w, td(waited(r.ageDays), 'dim'), td(num(r.valueEth, 4), 'g'));
      p.appendChild(tr);
    }
    $('pend-empty').hidden = a.pending.length > 0;

    const h = $('hist'); h.replaceChildren();
    for (const r of a.history) {
      const tr = document.createElement('tr');
      const td = (t, c) => { const n = document.createElement('td'); if (c) n.className = c; n.textContent = t; return n; };
      const w = document.createElement('td'); w.className = 'dim';
      if (EXPLORER && r.txHash) {
        const link = document.createElement('a');
        link.href = EXPLORER + '/tx/' + r.txHash; link.target = '_blank'; link.rel = 'noopener';
        link.textContent = when(r.at); w.appendChild(link);
      } else { w.textContent = when(r.at); }
      tr.append(td('#' + r.tokenId, 'dim'), w, td(num(r.valueEth, 4), 'g'));
      h.appendChild(tr);
    }
    $('hist-empty').hidden = a.history.length > 0;
    $('status').textContent = 'LIVE';
    $('foot').textContent = 'COURIER // STONK AGENTS \\u00b7 ' + new Date().toLocaleTimeString('en-GB');
  }catch{ $('status').textContent = 'CHAIN UNREACHABLE'; }
}
tick(); setInterval(tick, 20000);
`)
  )
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
