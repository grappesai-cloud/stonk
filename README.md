# Stonk Agents - landing page

Landing page de o singura pagina pentru Stonk Agents: NFT-uri ERC-6551 care
executa joburile din ecosistemul StonkBrokers si strang randamentul in
propriul portofel.

HTML, CSS si JavaScript scrise de mana. Fara framework, fara pas de build,
fara internet: fonturile stau in `assets/fonts/`.

---

## 1. Cum il deschizi

**Simplu:** dublu-click pe `index.html`.

**Ca pe un server real:**

```bash
cd stonk-agents
python3 -m http.server 4501
```

Apoi `http://localhost:4501`. Oprire cu `Ctrl+C`.

---

## 2. Unde schimbi textele

Tot continutul sta in **`js/content.js`**, intr-un singur obiect `window.SITE`.
HTML-ul nu contine texte: elementele sunt marcate cu `data-t="cale.din.continut"`
sau `data-list="nume"`, iar `js/render.js` le completeaza.

| Zona | Ce contine |
| --- | --- |
| `SITE.brand` | nume, token, email, retele (url gol = eticheta SOON) |
| `SITE.launch` | **statusul mintului, data numaratorii, textul butoanelor, contractul** |
| `SITE.nav` | linkurile din bara de sus si din subsol |
| `SITE.hero` | titlu, subtitlu, butoane, liniile din feed |
| `SITE.ticker` | textele care curg pe banda |
| `SITE.stats` | cifrele din banda |
| `SITE.classes.items` | cele 5 clase de agenti |
| `SITE.loop.nodes` | cele 6 noduri ale buclei economice |
| `SITE.how.steps` | cei 4 pasi |
| `SITE.platform.cards` | cele 3 terminale (`lines` = ce se scrie singur) |
| `SITE.cta`, `SITE.footer`, `SITE.access` | final, subsol, formular |

> `{{cta}}` si `{{status}}` din texte sunt inlocuite automat cu valorile din
> `SITE.launch`, ca sa nu schimbi acelasi buton in patru locuri. Vezi punctul 5.

---

## 3. Cum schimbi aspectul

Toata tema e in blocul `:root` din `css/style.css`:

```css
--bg:    #000000;   /* fundalul */
--lime:  #c6ff3d;   /* accentul, singura culoare tare din pagina */
--hot:   #ff3d6e;   /* doar pentru fantoma de la glitch */
--text:  #edf2ea;
--edge:  rgba(198,255,61,.22);  /* muchia panourilor */
--cut:   16px;      /* cat de mult se taie coltul panourilor */
--pad-x: 72px;      /* marginile laterale */
```

Regula de design: limeul apare pe cel mult 5% din ecran. Daca ajunge peste tot,
efectul moare.

Fonturi, toate locale in `assets/fonts/`:

- **Archivo** (variabil, latit la 125%) pentru titluri: majuscule, foarte
  apropiate, stil afis;
- **Space Grotesk** pentru text curent;
- **JetBrains Mono** pentru cifre, etichete si terminale.

**Panourile nu au chenar clasic.** Fiecare `.bracket` are coltul taiat: muchia e
fundalul elementului, iar interiorul e un `<i class="pane">` pus automat din
`motion.js`. Daca adaugi un panou nou, ii pui clasa `bracket` si atat. Aceeasi
taietura o au butoanele (`.btn`, prin `::before`) si pastila.

---

## 4. Efectele si de unde se regleaza

| Efect | Fisier | Ce reglezi |
| --- | --- | --- |
| holograma de puncte care isi schimba forma pe scroll | `js/motion.js` -> `STOPS` | `at` = pozitia pe pagina (0 sus, 1 jos), `shape`, `scale`, `x`/`y`, `opacity` |
| formele in sine (hexagon, cub, inel, fulger, lumanari, grila, litera) | `js/particles.js` -> `SHAPES` | desenele; `GRID` = cat de des sunt punctele |
| **valul care intuneca fundalul peste text** | `index.html` -> `data-veil` pe fiecare sectiune | 0 = holograma la maxim, 1 = negru complet |
| titluri care se descifreaza din caractere | `js/motion.js` -> `scramble` | pune clasa `scramble` pe orice element |
| titluri cu fantome decalate (glitch) | `css/style.css` -> `@keyframes glitchA/B` | cat de des clipesc |
| cursor propriu, butoane magnetice, scantei la click, carduri inclinate | `js/motion.js` -> `initCursor`, `initMagnet`, `initSpark`, `initTilt` | toate se opresc singure pe ecran tactil |
| raza care alearga pe muchia panoului la hover | `css/style.css` -> `@keyframes beam` | viteza si latimea |
| banda care curge | `css/style.css` -> `@keyframes tick` | viteza (`34s`) |
| contoare care se rostogolesc si continua sa urce | `js/motion.js` -> `Odo` | `drift` din `content.js` = cat creste la fiecare tick |
| feed live in hero | `js/motion.js` -> `initFeed` | intervalul de rotatie |
| terminale care se scriu singure | `js/motion.js` -> `typeTerminal` | viteza pe caracter |
| sina orizontala cu clasele | `js/motion.js` -> `initRail` | inaltimea sectiunii se calculeaza singura din latimea cardurilor |
| bucla animata | `index.html` (SVG) + `css/style.css` | `animateMotion dur="9s"` si `initLoopNodes` (1500ms per nod) |
| grila, scanlines, dunga de lumina, granulatie | `css/style.css` sectiunea 4 | opacitati si `@keyframes sweepDown` |

Sub 900px sina orizontala devine lista verticala, cercul buclei devine lista cu
bara pe stanga, iar cursorul propriu, inclinarea cardurilor si magnetismul
butoanelor se dezactiveaza. `prefers-reduced-motion` opreste tot ce misca.

---

## 5. Lansarea: ce schimbi si unde

Pagina e gandita pentru o lansare rapida de proiect web3, deci tot ce se
schimba la mint sta intr-un singur bloc: **`SITE.launch`** din `content.js`.

```js
launch: {
  status: 'soon',                       // 'soon' | 'live' | 'sold'
  date:   '2026-09-15T18:00:00Z',       // tinta numaratorii, ISO cu fus
  cta:    { soon: 'JOIN WHITELIST', live: 'MINT AGENT', ... },
  contract: { address: '', chain: 'BASE', explorer: '...' }
}
```

- **numaratoarea chiar merge**: ticaie din secunda in secunda in hero si, cand
  data trece, banda se schimba singura in `MINT IS LIVE`. Nu e un text fix.
- **`{{cta}}`** din restul fisierului ia automat textul potrivit statusului,
  deci butoanele din bara de sus, hero, "how" si finalul paginii se schimba
  toate dintr-un singur camp.
- **`contract.address`** gol afiseaza `NOT DEPLOYED YET` in subsol. Cand pui
  adresa, apare scurtata, cu link catre explorer si buton de copiat.

### Formularul de whitelist

Trimite datele pe bune, nu doar deschide clientul de mail. Trei variante, in
ordinea in care le incearca:

1. **`access.web3formsKey`** - iti faci cheie gratuita pe web3forms.com (cere
   doar un email, dureaza doua minute) si o pui acolo. Formularul pleaca direct
   de pe site, fara backend, si primesti mailul.
2. **`access.endpoint`** - daca ai backend propriu, primeste acelasi JSON prin
   POST (`handle`, `wallet`, `email`, `class`, `size`, `page`).
3. **mailto**, doar daca amandoua sunt goale. Merge, dar pe telefoanele fara
   client de mail configurat omul apasa si nu se intampla nimic. **Nu lansa
   asa.**

Butonul trece prin `SENDING`, iar ecranul de reusita apare **doar daca cererea
chiar a reusit**. Daca pica, ramane formularul completat si un mesaj de eroare.

### Cifrele

`js/live.js` e stratul de date, configurat in `SITE.live`:

- **`endpoint`**: un URL care intoarce
  `{ "stats": {...}, "feed": [...], "meta": "..." }`. Cheile din `stats` sunt
  `SITE.stats[].key`. Exemplu complet in `api/stats.sample.json`. Cat timp e
  gol, nu iese nicio cerere catre el.
- **`ethPrice`**: pretul ETH/USD de la Coinbase, public, fara cheie, cu CORS
  deschis. Merge dintr-un site static si e real.

**Inainte de lansare, in `stats` tii doar cifre adevarate**: supply, numarul de
clase, procentul ars. Un contor inventat care nu se misca se vede din prima si
darama increderea in toata pagina. Feed-ul din hero e marcat `SIM` exact din
acelasi motiv. Dupa lansare le inlocuiesti cu jobs / paid / agents si le legi
prin `key`.

### Linkuri

In `brand.socials`, un `url` gol afiseaza eticheta `SOON`, neclickabila. Nu
lasa niciodata `#`: un subsol plin de linkuri moarte arata a proiect abandonat,
si asta e exact impresia pe care nu ti-o permiti la un mint.

### Imaginea de share

`assets/og.jpg` (1200x630) se genereaza din **`og.html`**: deschizi fisierul in
browser, faci o captura a dreptunghiului de 1200x630 din coltul stanga-sus si o
salvezi peste `assets/og.jpg`. Meta-urile `og:` si `twitter:` sunt deja in
`index.html`. `og.html` da 404 in productie, deci nu e pagina publica.

### Ce mai lipseste

1. **Conectarea la wallet** si mintul propriu-zis: pagina e doar prezentare.
2. **Trasaturile** din sectiunea de raritate sunt rolate in browser, ca
   demonstratie. Cand exista contractul, `initRoller` citeste de acolo.
3. **Analytics**: nu e pus nimic.

## 6. Structura

```
stonk-agents/
├─ index.html          toata pagina
├─ css/style.css       tot designul
├─ js/
│  ├─ content.js       TEXTELE SI CIFRELE - fisierul pe care il modifici
│  ├─ render.js        pune continutul in pagina
│  ├─ particles.js     campul de particule
│  └─ motion.js        scroll, sina orizontala, contoare, terminale, sertar
└─ assets/
   ├─ fonts/           Space Grotesk + JetBrains Mono
   └─ favicon.svg
```

---

## 7. Publicare

LIVE pe **https://stonk.grappes.dev**, pe Coolify, ca site static servit de
nginx: `Dockerfile` copiaza folderul in imagine, `nginx.conf` pune gzip, cache
lung pe fonturi si imagini, cache scurt pe CSS si JS, zero cache pe HTML si
404 pe `og.html`. Build pack `dockerfile`, portul expus `80`.

Nu se compileaza nimic, deci merge la fel de bine oriunde: Cloudflare Pages,
GitHub Pages, orice gazduire clasica. Urci folderul asa cum e.

(Identificatorii aplicatiei si comanda de redeploy stau in notele interne, nu
in repo.)
