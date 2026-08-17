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
| `SITE.brand` | nume, token, email, retele, textul de status |
| `SITE.nav` | linkurile din bara de sus si din subsol |
| `SITE.hero` | titlu, subtitlu, butoane, liniile din feed-ul live |
| `SITE.ticker` | textele care curg pe banda |
| `SITE.stats` | **cifrele contoarelor** |
| `SITE.classes.items` | cele 5 clase de agenti |
| `SITE.loop.nodes` | cele 6 noduri ale buclei economice |
| `SITE.how.steps` | cei 4 pasi |
| `SITE.platform.cards` | cele 3 terminale (`lines` = ce se scrie singur) |
| `SITE.cta`, `SITE.footer`, `SITE.access` | final, subsol, formular |

> **Cifrele sunt inventate.** `stats`, feed-ul din hero si liniile din terminale
> sunt continut de prezentare. Inainte de lansare le inlocuiesti cu date reale
> sau le legi la un API (vezi punctul 5).

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

## 5. Date reale, imagine de share, ce mai lipseste

### Cifrele

`js/live.js` e stratul de date. Se configureaza in `content.js` -> `SITE.live`:

- **`endpoint`**: pui acolo un URL care intoarce JSON-ul de mai jos si cifrele
  din banda, feed-ul din hero si randul de sub hero se iau de acolo, la fiecare
  `refreshMs`. Cat timp e gol (implicit) nu iese nicio cerere si raman cifrele
  scrise in `content.js`.

  ```json
  {
    "stats": { "jobs": 204118, "paid": 3311.4, "agents": 4907 },
    "feed":  ["RINGER #0204 · CLOCK IN · +0.412 ETH"],
    "meta":  "POT 91% FULL · NEXT CLOCK IN ~3 MIN"
  }
  ```

  Cheile din `stats` sunt `SITE.stats[].key`. Orice camp lipsa e ignorat, deci
  poti intoarce doar ce ai. Exemplu complet in `api/stats.sample.json`; ca sa
  vezi ca merge, pui `endpoint: 'api/stats.sample.json'` si reincarci.

- **`ethPrice`**: pretul ETH/USD de la Coinbase, public, fara cheie, cu CORS
  deschis, deci merge dintr-un site static. E **singura cifra reala** din
  pagina acum. Punctul de langa el se face verde cand pretul urca si rosu cand
  scade. Daca cererea pica, chipul dispare si nimic nu se strica.

Restul cifrelor (jobs, ETH platit, agenti online, feed, terminale, `POT 68%`)
sunt inventate pana pui `endpoint`.

### Imaginea de share

`assets/og.jpg` (1200x630) e generata din **`og.html`**. Ca sa o refaci:
deschizi `og.html` in browser, faci o captura a dreptunghiului de 1200x630 din
coltul stanga-sus si o salvezi peste `assets/og.jpg`. Meta-urile `og:` si
`twitter:` sunt deja in `index.html` si pointeaza catre
`https://stonk.grappes.dev/assets/og.jpg`. `og.html` e blocat cu 404 in
`nginx.conf`, deci nu ajunge pagina publica.

### Ce mai lipseste

1. **Formularul** din sertarul "Early access" nu are server: pregateste un email
   si deschide clientul de mail. Pentru trimitere reala ai nevoie de Formspree,
   Web3Forms sau un backend propriu.
2. **Linkuri**: docs, contract, X, Discord sunt `#` in `content.js`.
3. **Conectarea la wallet** si mintul propriu-zis: pagina e doar prezentare.
4. **Trasaturile** din sectiunea de raritate sunt rolate in browser, doar ca
   demonstratie. Cand exista contractul, `initRoller` citeste de acolo.

---

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

LIVE pe **https://stonk.grappes.dev**, pe Coolify (Netcup), ca site static
servit de nginx.

| | |
| --- | --- |
| repo | `git@github.com:grappesai-cloud/stonk-agents.git`, ramura `main` |
| proiect Coolify | Stonk Agents, `h13n1pb2h5cslwi6vilj455v` |
| aplicatie | `l8zhwpnb6qknb82sn667pvdy`, build pack `dockerfile`, port expus `80` |
| cheie de deploy | `stonk-agents-deploy` in Coolify, publica adaugata pe repo |
| DNS | `stonk` A -> `159.195.82.196` in Cloudflare (adaugat de mana, grappes.dev nu are wildcard si nu exista token API) |

Deploy dupa un push (de pe server, tokenul e in `/root/.coolify-cli-token`):

```bash
ssh root@100.70.161.75 'T=$(cat /root/.coolify-cli-token); \
  curl -s -H "Authorization: Bearer $T" \
  "http://localhost:8000/api/v1/deploy?uuid=l8zhwpnb6qknb82sn667pvdy"'
```

Fiind static, merge la fel de bine si pe Cloudflare Pages sau GitHub Pages:
urci folderul asa cum e.
