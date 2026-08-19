/**
 * Tema comuna: aceleasi fonturi, aceleasi variabile, aceleasi componente ca
 * pe site (~/stonk-agents, branch rh).
 *
 * Nu e o copie "aproximativ la fel". Daca site-ul si uneltele arata diferit,
 * omul simte ca sunt doua produse, si atunci peretele public nu mai pare
 * al proiectului. De aia tokenii, fonturile, butoanele si straturile de fundal
 * sunt aceleasi, servite din acelasi loc.
 *
 * Cand se schimba tema pe site, se schimba aici.
 */

/** @font-face pentru fonturile servite de noi din /fonts */
export const FONTS = `
@font-face{font-family:'Archivo';font-style:normal;font-weight:400 900;font-stretch:62.5% 125%;font-display:swap;
  src:url('/fonts/archivo-latin.woff2') format('woff2');
  unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:'Archivo';font-style:normal;font-weight:400 900;font-stretch:62.5% 125%;font-display:swap;
  src:url('/fonts/archivo-latin-ext.woff2') format('woff2');
  unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:'JetBrains Mono';font-style:normal;font-weight:400 700;font-display:swap;
  src:url('/fonts/jetbrains-mono-latin.woff2') format('woff2');
  unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
`

/** variabilele si baza, identice cu site-ul */
export const BASE = `
:root{
  --bg:#000;
  --panel:#0a0a0a;
  --panel-2:#101010;
  --green:#00c805;
  --green-hot:#00ff2b;
  --green-soft:rgba(0,200,5,.12);
  --red:#ff5000;
  --text:#fff;
  --dim:rgba(255,255,255,.58);
  --faint:rgba(255,255,255,.34);
  --line:rgba(255,255,255,.10);
  --line-2:rgba(255,255,255,.055);
  --sans:'Archivo',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  --mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
  --wrap:1180px;
  --pad:clamp(20px,4vw,40px);
  --nav-h:68px;
  --ease:cubic-bezier(.22,1,.36,1);
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);
  font:400 17px/1.55 var(--sans);font-stretch:100%;
  -webkit-font-smoothing:antialiased;overflow-x:hidden}
img,canvas{max-width:100%;display:block}
a{color:inherit;text-decoration:none}
button,input,select{font:inherit;color:inherit}
::selection{background:var(--green);color:#000}
.wrap{width:100%;max-width:var(--wrap);margin:0 auto;padding-inline:var(--pad)}
.mono{font-family:var(--mono);font-weight:500;letter-spacing:.1em;text-transform:uppercase;font-size:11px}
.faint{color:var(--faint)}
.hl{color:var(--green);font-style:normal}
h1,h2,h3{margin:0;font-weight:700;letter-spacing:-.035em;line-height:1.02;font-stretch:100%}
.h-display{font-size:clamp(38px,6.4vw,76px)}
.h-2{font-size:clamp(24px,3.2vw,38px);letter-spacing:-.03em;line-height:1.06}
.lede{margin:0;color:var(--dim);font-size:clamp(15px,1.4vw,18px);max-width:56ch}
.eyebrow{margin:0 0 14px;color:var(--faint);font-family:var(--mono);font-weight:500;
  letter-spacing:.14em;text-transform:uppercase;font-size:11px}
`

/** straturile de fundal ale site-ului: grila, aura verde, granulatie */
export const LAYERS = `
.bg-grid,.bg-aura,.grain{position:fixed;inset:0;pointer-events:none;z-index:0}
.bg-grid{
  background-image:linear-gradient(var(--line-2) 1px,transparent 1px),linear-gradient(90deg,var(--line-2) 1px,transparent 1px);
  background-size:72px 72px;
  mask-image:radial-gradient(ellipse 100% 70% at 50% 0%,#000 20%,transparent 78%);
  -webkit-mask-image:radial-gradient(ellipse 100% 70% at 50% 0%,#000 20%,transparent 78%);
}
.bg-aura{background:radial-gradient(ellipse 60% 45% at 50% -8%,rgba(0,200,5,.18),transparent 70%)}
.grain{opacity:.035;z-index:3;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E")}
main,.page{position:relative;z-index:1}
`

/** butoane, pastile, panouri: exact componentele de pe site */
export const COMPONENTS = `
.btn{
  position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;
  height:46px;padding:0 22px;border-radius:999px;border:1px solid var(--line);
  font-weight:600;font-size:15px;letter-spacing:-.01em;white-space:nowrap;
  background:transparent;cursor:pointer;overflow:hidden;
  transition:background .25s,color .25s,border-color .25s,transform .25s var(--ease);
}
.btn::after{content:'';position:absolute;inset:0;transform:translateX(-120%);
  background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent);
  transition:transform .7s var(--ease)}
.btn:hover::after{transform:translateX(120%)}
.btn:active{transform:scale(.98)}
.btn-solid{background:var(--green);border-color:var(--green);color:#000}
.btn-solid:hover{background:var(--green-hot);border-color:var(--green-hot)}
.btn-ghost:hover{border-color:rgba(255,255,255,.4);background:rgba(255,255,255,.04)}
.btn-danger{border-color:var(--red);color:var(--red)}
.btn-danger:hover{background:var(--red);color:#000}
.btn:disabled{opacity:.45;cursor:default}

.chip{display:inline-flex;align-items:center;gap:9px;padding:7px 14px 7px 11px;
  border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.02);
  font-family:var(--mono);font-weight:500;letter-spacing:.1em;text-transform:uppercase;font-size:11px}
.chip .dot{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 10px var(--green);
  animation:pulse 2.4s ease-in-out infinite}
.chip .dot.off{background:var(--red);box-shadow:0 0 10px var(--red);animation:none}
.chip .dot.warn{background:#ffb800;box-shadow:0 0 10px #ffb800}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}

.grid{display:grid;gap:1px;background:var(--line);border:1px solid var(--line);
  border-radius:18px;overflow:hidden;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
.cell{background:var(--panel);padding:26px 22px}
.cell b{display:block;font-family:var(--mono);font-size:clamp(24px,2.6vw,32px);font-weight:700;
  letter-spacing:-.03em;overflow-wrap:anywhere}
.cell b.green{color:var(--green)}
.cell b.red{color:var(--red)}
.cell b.soft{font-size:18px;color:var(--faint)}
.cell span{display:block;margin-top:9px;color:var(--faint);font-family:var(--mono);
  font-size:10px;letter-spacing:.12em;text-transform:uppercase}

.panel{border:1px solid var(--line);border-radius:18px;overflow:hidden;
  background:linear-gradient(180deg,var(--panel-2),var(--panel))}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th{text-align:left;padding:14px 18px;border-bottom:1px solid var(--line);
  font-family:var(--mono);font-size:10px;letter-spacing:.12em;color:var(--faint);
  text-transform:uppercase;font-weight:500}
td{padding:14px 18px;border-bottom:1px solid var(--line-2);font-size:14px}
tr:last-child td{border-bottom:none}
td.m{font-family:var(--mono);color:var(--dim);font-size:13px}
td.g{font-family:var(--mono);color:var(--green);font-size:13px;font-weight:600}
th:last-child,td:last-child{text-align:right}
tbody tr{transition:background .15s}
tbody tr:hover{background:rgba(0,200,5,.05)}
.panel a{border-bottom:1px solid rgba(255,255,255,.2);transition:border-color .2s}
.panel a:hover{border-color:var(--green)}
.empty{padding:34px 18px;text-align:center;color:var(--faint);font-family:var(--mono);
  font-size:12px;letter-spacing:.1em}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;
    transition-duration:.01ms !important}
}
`

/** marca, aceeasi ca in bara site-ului */
export const BRAND_MARK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 17.5 8 11l4 3.5L22 4"/><path d="M16 4h6v6"/></svg>`

export const BRAND_CSS = `
.brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.02em;
  font-size:15px;white-space:nowrap}
.brand svg{width:20px;height:20px;fill:none;stroke:var(--green);stroke-width:2.2;
  stroke-linecap:round;stroke-linejoin:round}
`

export const THEME = FONTS + BASE + LAYERS + COMPONENTS + BRAND_CSS

/** straturile de fundal, ca marcaj */
export const LAYERS_HTML = `<div class="bg-grid"></div><div class="bg-aura"></div><div class="grain"></div>`
