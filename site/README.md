# Stonk Agents

Landing page de o singura pagina pentru **Stonk Agents**, NFT-uri ERC-6551 care
executa joburile ecosistemului StonkBrokers si strang randamentul in propriul
portofel.

Negru absolut, un singur verde `#00c805`, tipografie mare si putin text. Fara
biblioteci: tot ce misca e scris de mana.

## Reguli de lucru

**Tot continutul sta in `js/content.js`.** HTML-ul nu contine niciun text, doar
carlige `data-t="cale.din.SITE"`. Ca sa schimbi ceva pe pagina, editezi acolo,
nu in HTML.

Doua conventii in texte:

- `[[bucata]]` intr-un titlu coloreaza bucata in verde.
- `{{cta}}` si `{{status}}` iau valoarea din blocul `launch`, dupa status.

## Blocul de lansare

`SITE.launch` e singurul loc pe care il schimbi cand se deschide mintul:
statusul (`soon` / `live` / `sold`), data, textul butoanelor si adresa
contractului. Numaratoarea e reala si trece singura pe "live" cand data expira.
Un contract fara adresa apare ca "NOT DEPLOYED YET", niciodata ca link mort.

La fel si in subsol: un canal fara `url` apare cu eticheta SOON si nu se poate
apasa. Niciodata `#`, pentru ca un subsol plin de linkuri moarte arata a proiect
abandonat.

## Cifre reale, de la Courier

Pana la lansare, pagina arata **fapte despre proiect**: supply, numarul de
clase, procentul ars la mint. Cand agentul Courier ruleaza (vezi
`~/stonk-courier`), pui adresa lui `/stats` in `SITE.live.endpoint` si fiecare
cifra se inlocuieste cu perechea ei **masurata**, impreuna cu eticheta:

| inainte | dupa |
|---|---|
| Agents in supply | Deliveries made |
| Agent classes | Wallets reached |
| Burned per mint | Still unclaimed |

In acelasi timp, feedul din hero trece de pe randurile de proba pe livrari
adevarate, iar eticheta `SIM` devine `LIVE` singura. Asa pagina nu minte
niciodata: ori spune un fapt, ori spune o masuratoare.

Pretul ETH din bara de sus e real si nu cere backend (Coinbase, public, cu
CORS). Daca nu raspunde, nu se afiseaza nimic. Mai bine gol decat gresit.

## Formularul

Trimite prin web3forms (cheie in `access.web3formsKey`) sau prin endpoint
propriu. Ecranul de reusita apare **doar** daca cererea a reusit.

Daca amandoua sunt goale, cade pe `mailto`, si asta nu e bun de lansare: pe
telefoanele fara client de mail configurat, omul apasa si nu se intampla nimic.

## Efecte

Toate scrise de mana, fara biblioteci:

- graficul din hero, o plimbare aleatoare cu samanta fixa, desenata pe canvas,
  cu umplere in degrade, urma luminoasa si bila care pulseaza in varf
- sina orizontala a claselor: sectiunea creste cat trackul, iar scrollul
  vertical il trage lateral. Pe telefon devine carusel cu prindere
- contoare care se rostogolesc, text care se descifreaza, banda continua
- cursor propriu, lumina care urmareste pointerul, butoane magnetice, carduri
  care se inclina spre cursor
- aparitie la scroll, bara de progres, numaratoare inversa

## Doua capcane deja rezolvate

**Contoarele intr-un tab de fundal.** `requestAnimationFrame` nu ruleaza acolo,
deci cine deschide linkul intr-un tab nou si revine peste un minut ar vedea trei
zerouri. Cand pagina e ascunsa, cifra se scrie direct si se animeaza doar cand
chiar se vede.

**Ancora din adresa.** Sectiunea flotei isi ia inaltimea din latimea trackului,
dupa ce se incarca fonturile. Daca browserul sare la `#mint` inainte, aterizezi
in alta parte a paginii. De aia ancora se rezolva din nou dupa asezare.

## Verificare

```bash
python3 -m http.server 4501
```

In browserul de automatizare, un tab care nu e in fata are `visibilityState`
ascuns, deci **tranzitiile CSS ingheata dupa un cadru** si tot ce apare la
scroll ramane la 9% opacitate. Nu e bug in site. Ca sa vezi starea finala,
injecteaza:

```js
document.head.insertAdjacentHTML('beforeend',
  '<style>[data-reveal],.step{opacity:1!important;transform:none!important;transition:none!important}</style>')
```

## Desfasurare

Site static pe nginx, prin Dockerfile. DNS-ul se adauga de mana in Cloudflare,
`grappes.dev` nu are wildcard.
