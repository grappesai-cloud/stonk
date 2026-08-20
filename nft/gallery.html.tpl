<title>Stonk Agents Mint Sheet</title>
<style>
  @font-face{font-family:'Archivo';font-weight:400 900;font-stretch:62.5% 125%;font-display:block;
    src:url(data:font/woff2;base64,__ARCHIVO__) format('woff2')}
  @font-face{font-family:'JB Mono';font-weight:400 700;font-display:block;
    src:url(data:font/woff2;base64,__MONO__) format('woff2')}

  /* Un singur univers vizual, deliberat intunecat: piesele sunt pixel art pe
     fundal negru, iar o tema deschisa le-ar rupe. Toate culorile sunt scrise
     explicit, deci pagina nu imprumuta nimic de la gazda. */
  :root{
    --ground:#060806; --surface:#0d110d; --sunken:#040604;
    --edge:rgba(198,255,61,.20); --edge-soft:rgba(237,242,234,.09);
    --lime:#c6ff3d; --hot:#ff3d6e;
    --text:#edf2ea; --dim:rgba(237,242,234,.52); --faint:rgba(237,242,234,.30);
    --cut:14px;
    --ease:cubic-bezier(.16,1,.3,1);
  }
  *{box-sizing:border-box}
  body{
    margin:0; background:var(--ground); color:var(--text);
    font-family:'Archivo',system-ui,sans-serif; font-variation-settings:'wdth' 100;
    font-size:16px; line-height:1.55;
    -webkit-font-smoothing:antialiased;
  }
  .mono{font-family:'JB Mono',ui-monospace,monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase}
  h1,h2,h3{margin:0;font-weight:900;font-variation-settings:'wdth' 125;
    text-transform:uppercase;letter-spacing:-.03em;line-height:.94;text-wrap:balance}

  .wrap{max-width:1180px;margin:0 auto;padding:0 22px}

  /* ---- antet ---- */
  header{border-bottom:1px solid var(--edge-soft);padding:46px 0 30px;
    background:linear-gradient(180deg,rgba(198,255,61,.05),transparent)}
  .eyebrow{color:var(--lime);display:block;margin-bottom:14px}
  .eyebrow::before{content:'[ '}.eyebrow::after{content:' ]'}
  h1{font-size:clamp(30px,5.4vw,58px)}
  .lede{max-width:62ch;margin-top:16px;color:var(--dim)}
  .facts{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}
  .fact{display:flex;flex-direction:column;gap:3px;padding:11px 16px;
    background:var(--surface);border-left:2px solid var(--lime);min-width:132px}
  .fact b{font-family:'JB Mono',monospace;font-size:19px;font-weight:700;
    letter-spacing:-.02em;font-variant-numeric:tabular-nums}
  .fact span{color:var(--faint);font-size:9px}

  /* ---- filtre ---- */
  .rail{display:flex;flex-wrap:wrap;gap:7px;padding:24px 0 4px;
    position:sticky;top:0;background:var(--ground);z-index:5}
  .chip{border:1px solid var(--edge-soft);background:none;color:var(--dim);
    padding:8px 14px;cursor:pointer;font-family:'JB Mono',monospace;font-size:10px;
    letter-spacing:.16em;text-transform:uppercase;
    transition:border-color .25s var(--ease),color .25s var(--ease),background .25s var(--ease)}
  .chip:hover{color:var(--text);border-color:var(--edge)}
  .chip[aria-pressed="true"]{background:rgba(198,255,61,.12);border-color:var(--lime);color:var(--lime)}
  .chip:focus-visible{outline:2px solid var(--lime);outline-offset:2px}
  .count{margin-left:auto;align-self:center;color:var(--faint)}

  /* ---- plansa ---- */
  .sheet{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));
    gap:12px;padding:18px 0 60px}
  .cell{padding:0;border:0;background:var(--surface);cursor:pointer;text-align:left;
    color:inherit;display:flex;flex-direction:column;
    clip-path:polygon(var(--cut) 0,100% 0,100% calc(100% - var(--cut)),calc(100% - var(--cut)) 100%,0 100%,0 var(--cut));
    transition:transform .3s var(--ease),background .3s var(--ease);
    opacity:0;animation:in .5s var(--ease) forwards}
  @keyframes in{to{opacity:1}}
  .cell:hover{transform:translateY(-3px);background:rgba(198,255,61,.10)}
  .cell:focus-visible{outline:2px solid var(--lime);outline-offset:2px}
  .cell img{width:100%;display:block;image-rendering:pixelated}
  .cap{padding:9px 11px 11px;display:flex;flex-direction:column;gap:3px}
  .cap .id{font-family:'JB Mono',monospace;font-size:11px;font-weight:700;
    letter-spacing:.1em;color:var(--lime)}
  .cap .cls{font-size:12px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tier{align-self:flex-start;font-family:'JB Mono',monospace;font-size:8px;
    letter-spacing:.2em;padding:2px 6px;background:rgba(237,242,234,.10);color:var(--dim)}
  .tier[data-t="Rare"]{background:rgba(198,255,61,.16);color:var(--lime)}
  .tier[data-t="Epic"]{background:rgba(45,224,255,.16);color:#7ce9ff}
  .tier[data-t="Mythic"]{background:rgba(255,61,110,.18);color:var(--hot)}
  .tier[data-t="1 of 1"]{background:rgba(255,210,61,.20);color:#ffd23d}

  /* ---- raritati ---- */
  .rarity{border-top:1px solid var(--edge-soft);padding:44px 0 70px}
  .rarity h2{font-size:clamp(20px,2.6vw,30px);margin-bottom:8px}
  .rarity > .wrap > p{color:var(--dim);max-width:60ch;margin:0 0 30px}
  .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(258px,1fr));gap:26px}
  .grp h3{font-size:12px;font-weight:700;font-variation-settings:'wdth' 100;
    letter-spacing:.18em;color:var(--faint);margin-bottom:12px}
  .bar{display:grid;grid-template-columns:1fr 42px;gap:10px;align-items:center;padding:3px 0}
  .bar .nm{font-family:'JB Mono',monospace;font-size:10px;letter-spacing:.08em;
    color:var(--dim);position:relative;padding:4px 7px;overflow:hidden}
  .bar .nm i{position:absolute;inset:0;background:rgba(198,255,61,.14);
    transform-origin:left;z-index:0}
  .bar .nm span{position:relative;z-index:1}
  .bar .pc{font-family:'JB Mono',monospace;font-size:10px;color:var(--faint);
    text-align:right;font-variant-numeric:tabular-nums}

  /* ---- detaliu ---- */
  dialog{border:0;padding:0;background:transparent;max-width:none;max-height:none}
  dialog::backdrop{background:rgba(2,4,2,.86)}
  .card{width:min(520px,92vw);max-height:92vh;overflow:auto;background:var(--surface);border:1px solid var(--edge);
    clip-path:polygon(20px 0,100% 0,100% calc(100% - 20px),calc(100% - 20px) 100%,0 100%,0 20px)}
  .card img{width:100%;display:block;image-rendering:pixelated;background:var(--sunken)}
  .card .body{padding:20px 22px 24px}
  .card h3{font-size:24px;margin-bottom:4px}
  .traits{display:grid;grid-template-columns:1fr 1fr;gap:1px;margin-top:18px;
    background:var(--edge-soft)}
  .traits div{background:var(--surface);padding:9px 11px;display:flex;flex-direction:column;gap:2px}
  .traits dt{font-family:'JB Mono',monospace;font-size:8px;letter-spacing:.2em;
    text-transform:uppercase;color:var(--faint)}
  .traits dd{margin:0;font-family:'JB Mono',monospace;font-size:11px;letter-spacing:.05em}
  .close{margin-top:20px;width:100%;border:1px solid var(--edge);background:none;
    color:var(--lime);padding:11px;cursor:pointer;font-family:'JB Mono',monospace;
    font-size:10px;letter-spacing:.2em;text-transform:uppercase}
  .close:hover{background:rgba(198,255,61,.10)}

  footer{border-top:1px solid var(--edge-soft);padding:22px 0 40px;color:var(--faint)}

  @media (prefers-reduced-motion:reduce){
    *{animation-duration:.01ms !important;transition-duration:.01ms !important}
    .cell{opacity:1}
  }
</style>

<header>
  <div class="wrap">
    <span class="eyebrow mono">Collection preview</span>
    <h1>One hundred pieces,<br>from Vlad's own art</h1>
    <p class="lede">The character Vlad drew, rebuilt pixel by pixel in code, then given a job.
      Each piece belongs to one of eighteen archetypes, and an archetype ties the suit, the
      headgear, the thing in the hand, the markings and the place together, so a Pirate never
      ends up holding a flask in a server room. Nine of them also carry their own floating
      props: the hacker gets screens, the gamer gets hearts, the shaman gets crystals. What still rolls freely is the dome colour, the
      accent, the effect, and which of the archetype's own places it stands in.</p>
    <div class="facts">
      <div class="fact"><b id="f-shown">100</b><span class="mono">Made so far</span></div>
      <div class="fact"><b>9</b><span class="mono">Base variants</span></div>
      <div class="fact"><b>9</b><span class="mono">Drawn scenes</span></div>
      <div class="fact"><b>4.6 sec</b><span class="mono">To build all 100</span></div>
    </div>
  </div>
</header>

<main class="wrap">
  <div class="rail" id="rail"></div>
  <div class="sheet" id="sheet"></div>
</main>

<section class="rarity">
  <div class="wrap">
    <h2>How rare is rare</h2>
    <p>Distribution across the 100 pieces above. The base variant carries most of the weight
      in the ranking, because that is the part Vlad actually drew differently. Backgrounds
      count least, so one rare scene cannot decide the leaderboard on its own.</p>
    <div class="cols" id="cols"></div>
  </div>
</section>

<footer class="wrap mono">Stonk Agents &middot; mint sheet &middot; stonk.grappes.dev</footer>

<dialog id="dlg"><div class="card">
  <img id="d-img" alt="">
  <div class="body">
    <h3 id="d-name"></h3>
    <div class="mono" id="d-sub" style="color:var(--dim)"></div>
    <dl class="traits" id="d-traits"></dl>
    <button class="close" id="d-close">Close</button>
  </div>
</div></dialog>

<script>
const DATA = __DATA__;
const ORDER = ['Base','Tier','Suit','Dome','Background','Effect'];

const sheet = document.getElementById('sheet');
const rail  = document.getElementById('rail');
const dlg   = document.getElementById('dlg');

// filtrele se construiesc din ce exista chiar in esantion
const classes = [...new Set(DATA.items.map(i => i.attrs.Base))]
  .sort((a, b) => DATA.items.filter(i => i.attrs.Base === b).length -
                  DATA.items.filter(i => i.attrs.Base === a).length);
let active = 'ALL';

function chips(){
  rail.innerHTML = '';
  ['ALL', ...classes].forEach(c => {
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = c;
    b.setAttribute('aria-pressed', String(c === active));
    b.onclick = () => { active = c; chips(); draw(); };
    rail.appendChild(b);
  });
  const n = document.createElement('span');
  n.className = 'count mono';
  rail.appendChild(n);
}

function draw(){
  const list = DATA.items.filter(i => active === 'ALL' || i.attrs.Base === active);
  document.querySelector('.count').textContent = list.length + ' of ' + DATA.items.length;
  sheet.innerHTML = '';
  list.forEach((it, n) => {
    const b = document.createElement('button');
    b.className = 'cell';
    b.style.animationDelay = Math.min(n * 14, 700) + 'ms';
    b.innerHTML =
      '<img src="data:image/png;base64,' + it.img + '" alt="Stonk Agent #' + it.id + '">' +
      '<span class="cap"><span class="id">#' + String(it.id).padStart(4,'0') + '</span>' +
      '<span class="cls">' + it.attrs.Base + '</span>' +
      '<span class="tier mono" data-t="' + it.attrs.Tier + '">' + it.attrs.Tier + '</span></span>';
    b.onclick = () => open(it);
    sheet.appendChild(b);
  });
}

function open(it){
  document.getElementById('d-img').src = 'data:image/png;base64,' + it.img;
  document.getElementById('d-name').textContent = it.name || ('Stonk Diver #' + it.id);
  document.getElementById('d-sub').textContent = it.attrs.Suit + ' \u00B7 ' + it.attrs.Tier;
  document.getElementById('d-traits').innerHTML = ORDER.map(k =>
    '<div><dt>' + k + '</dt><dd>' + it.attrs[k] + '</dd></div>').join('');
  dlg.showModal();
}
document.getElementById('d-close').onclick = () => dlg.close();
dlg.onclick = e => { if (e.target === dlg) dlg.close(); };

// tabelul de raritati
const cols = document.getElementById('cols');
['Base','Suit','Dome','Background','Effect'].forEach(k => {
  const t = DATA.rarity.traits[k]; if (!t) return;
  const g = document.createElement('div'); g.className = 'grp';
  g.innerHTML = '<h3>' + k + '</h3>' + Object.entries(t).map(([name, v]) =>
    '<div class="bar"><span class="nm"><i style="transform:scaleX(' + (v.percent/100).toFixed(3) +
    ')"></i><span>' + name + '</span></span><span class="pc">' + v.percent + '%</span></div>'
  ).join('');
  cols.appendChild(g);
});

chips(); draw();
</script>
