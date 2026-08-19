/**
 * Pielea de terminal.
 *
 * Totul monospace, colturi drepte, linii de un pixel, panouri cu titlul asezat
 * pe muchia de sus. Nu e nostalgie: intr-o unealta de operare densitatea e
 * utilitate. Cu cat incap mai multe randuri pe ecran fara sa oboseasca ochiul,
 * cu atat afli mai repede ce se intampla.
 *
 * Aceleasi culori ca site-ul, ca sa ramana acelasi produs, dar forma e alta.
 */

export const TERM_FONTS = `
@font-face{font-family:'JetBrains Mono';font-style:normal;font-weight:400 700;font-display:swap;
  src:url('/fonts/jetbrains-mono-latin.woff2') format('woff2');
  unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
`

export const TERM = `
${TERM_FONTS}
:root{
  --bg:#000;
  --panel:#050505;
  --panel-2:#0a0a0a;
  --green:#00c805;
  --green-hot:#00ff2b;
  --amber:#ffb800;
  --red:#ff5000;
  --text:#e8f0e8;
  --dim:rgba(232,240,232,.55);
  --faint:rgba(232,240,232,.32);
  --line:rgba(0,200,5,.22);
  --line-2:rgba(232,240,232,.09);
  --mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
}
*{box-sizing:border-box}
/* Fara asta, orice element cu o clasa care are display ramane vizibil chiar
   daca ii pui atributul hidden: regula clasei bate regula implicita a
   browserului. Accentele grave sunt interzise aici, pagina e un literal. */
[hidden]{display:none !important}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);
  font:400 13px/1.5 var(--mono);letter-spacing:.02em;
  -webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit;text-decoration:none;border-bottom:1px solid rgba(0,200,5,.35)}
a:hover{color:var(--green-hot);border-color:var(--green-hot)}
button,input{font:inherit;color:inherit;letter-spacing:.1em}
::selection{background:var(--green);color:#000}
canvas{display:block}

/* ---------- straturi: grila, scanlines, vinieta ---------- */
.bg-grid,.scan,.vig{position:fixed;inset:0;pointer-events:none;z-index:0}
.bg-grid{
  background-image:linear-gradient(rgba(0,200,5,.05) 1px,transparent 1px),
    linear-gradient(90deg,rgba(0,200,5,.05) 1px,transparent 1px);
  background-size:28px 28px;
  mask-image:radial-gradient(ellipse 120% 80% at 50% 0%,#000 10%,transparent 75%);
  -webkit-mask-image:radial-gradient(ellipse 120% 80% at 50% 0%,#000 10%,transparent 75%);
}
.scan{z-index:4;opacity:.5;
  background:repeating-linear-gradient(rgba(255,255,255,.02) 0 1px,transparent 1px 3px)}
.vig{z-index:3;background:radial-gradient(ellipse 90% 70% at 50% 45%,transparent 55%,rgba(0,0,0,.55) 100%)}
.page{position:relative;z-index:1;max-width:1240px;margin:0 auto;padding:0 18px 90px}

/* ---------- panou cu titlul pe muchie ---------- */
.box{position:relative;border:1px solid var(--line);background:var(--panel);margin-top:22px}
.box>.t{position:absolute;top:-7px;left:12px;padding:0 8px;background:var(--bg);
  font-size:10px;letter-spacing:.2em;color:var(--green);text-transform:uppercase;white-space:nowrap}
.box>.t i{font-style:normal;color:var(--faint)}
.box-b{padding:16px 14px}
/* colturi marcate, ca pe un vizor */
.box::before,.box::after{content:'';position:absolute;width:7px;height:7px;pointer-events:none}
.box::before{top:-1px;right:-1px;border-top:1px solid var(--green);border-right:1px solid var(--green)}
.box::after{bottom:-1px;left:-1px;border-bottom:1px solid var(--green);border-left:1px solid var(--green)}

/* ---------- butoane in paranteze ---------- */
.b{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;
  border:1px solid var(--line);background:transparent;color:var(--dim);
  font-size:11px;text-transform:uppercase;cursor:pointer;white-space:nowrap;
  transition:background .12s,color .12s,border-color .12s}
.b::before{content:'[';color:var(--faint)}
.b::after{content:']';color:var(--faint)}
.b:hover{background:var(--green);border-color:var(--green);color:#000}
.b:hover::before,.b:hover::after{color:#000}
.b.hot{border-color:var(--green);color:var(--green)}
.b.danger{border-color:var(--red);color:var(--red)}
.b.danger:hover{background:var(--red);color:#000}
.b:disabled{opacity:.32;cursor:default}
.b:disabled:hover{background:transparent;color:var(--dim);border-color:var(--line)}

/* ---------- text ---------- */
.k{color:var(--faint);font-size:10px;letter-spacing:.18em;text-transform:uppercase}
.v{color:var(--text);font-weight:600}
.g{color:var(--green)}
.a{color:var(--amber)}
.r{color:var(--red)}
.dim{color:var(--dim)}

/* ---------- bara din blocuri ---------- */
.blocks{font-size:11px;letter-spacing:-.06em;white-space:nowrap}
.blocks .on{color:var(--green)}
.blocks .off{color:rgba(0,200,5,.16)}

/* ---------- cursor care clipeste ---------- */
.cur{display:inline-block;width:7px;height:13px;background:var(--green);
  vertical-align:-2px;animation:blink 1.1s step-end infinite}
@keyframes blink{50%{opacity:0}}
.led{display:inline-block;width:7px;height:7px;background:var(--green);
  box-shadow:0 0 8px var(--green);animation:pulse 2s ease-in-out infinite}
.led.off{background:var(--red);box-shadow:0 0 8px var(--red);animation:none}
.led.warn{background:var(--amber);box-shadow:0 0 8px var(--amber)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}

/* ---------- tabele ---------- */
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:8px 12px;border-bottom:1px solid var(--line-2);
  font-size:10px;letter-spacing:.16em;color:var(--faint);text-transform:uppercase;font-weight:400}
td{padding:7px 12px;border-bottom:1px solid rgba(232,240,232,.05);font-size:12px}
tr:last-child td{border-bottom:none}
tbody tr:hover{background:rgba(0,200,5,.06)}
th:last-child,td:last-child{text-align:right}
.tscroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.tscroll table{min-width:600px}
.empty{padding:26px 12px;text-align:center;color:var(--faint);font-size:11px;letter-spacing:.16em}

@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation:none !important;transition:none !important}
}
`

/** grila, scanlines, vinieta */
export const TERM_LAYERS = `<div class="bg-grid"></div><div class="scan"></div><div class="vig"></div>`

/** bara din blocuri, ca in terminal: plina si goala */
export const BLOCKS_JS = `
function blocks(ratio, width){
  const n = Math.max(0, Math.min(width, Math.round(ratio * width)));
  const on = document.createElement('span'); on.className = 'on'; on.textContent = '\\u2588'.repeat(n);
  const off = document.createElement('span'); off.className = 'off'; off.textContent = '\\u2591'.repeat(width - n);
  const wrap = document.createElement('span'); wrap.className = 'blocks';
  wrap.append(on, off);
  return wrap;
}
`
