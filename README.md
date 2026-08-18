# Courier

Primul agent din flota Stonk Agents. Gaseste drop-urile nerevendicate care zac
in portofelele ERC-6551 ale brokerilor si le livreaza, incaseaza bacsisul si
scrie tot ce a facut intr-un registru din care iese, dupa o luna de rulare,
contul de profit si pierdere al unui agent.

Nu e un demo si nu e un MVP. Are simulare inainte de fiecare tranzactie, frane
de cheltuiala, reconciliere dupa cadere, alerte, API de citire si teste
cap-coada pe un lant real cu contracte reale.

## De ce Courier si nu altul

Dintre cele cinci clase, Courier e singura care poate rula **azi, fara
permisiunea nimanui, fara fonduri in risc si oricand**. Nu e o cursa de viteza
ca Ringer, nu atinge bankroll-ul protocolului ca Stocker, nu cere delegare de
vot ca Lobbyist. Se poate porni inainte de mint, pe banii vostri, iar rezultatul
lui e o cifra reala pe care o pui pe landing page in loc de o promisiune.

## Intrebarea de la pasul zero

Tot conceptul sta intr-o singura linie de contract: **`deliver()` merge apelata
de un strain?** Daca e rezervata proprietarului, Courier-ul nu poate livra
pentru nimeni si trebuie ori opt-in, ori o schimbare de contract.

Nu ghicesti raspunsul si nu il cauti in cod:

```bash
courier doctor
```

Ultima verificare din lista raspunde. Si nu raspunde din textul erorii, care
poate fi orice, ci prin dovada: simuleaza acelasi apel din contul unui strain si
din contul proprietarului. Daca proprietarului ii merge si strainului nu, functia
e rezervata, si asta e demonstrat, nu banuit.

## Ce iti trebuie ca sa pornesti

Trei adrese si doua semnaturi:

1. adresa colectiei StonkBrokers,
2. adresa contractului care tine drop-urile,
3. registrul ERC-6551 folosit, implementarea si saltul,
4. semnatura functiei care spune cat e nerevendicat,
5. semnatura functiei de livrare.

Contractul de drop-uri se descrie prin semnaturi in fisierul de configurare, nu
prin cod. Cand vin adresele reale, se editeaza `config/default.json`, nu sursele.

Verificat pe 19 august 2026: pe Robinhood Chain (4663) sunt deja desfasurate
registrul canonic ERC-6551, implementarea tokenbound si Multicall3. Adica
infrastructura pe care se sprijina Courier-ul exista deja acolo.

## Pornire

```bash
npm install
cp .env.example .env          # cheia sta aici, niciodata in config
cp config/robinhood.example.json config/default.json
# completezi cele doua adrese marcate TODO

npx tsx src/cli.ts doctor     # trece tot?
npx tsx src/cli.ts scan       # cine are ceva nerevendicat
npx tsx src/cli.ts simulate   # ce s-ar livra, cu ce gaz, si de ce nu restul
npx tsx src/cli.ts run        # rulare completa, USCATA
npx tsx src/cli.ts run --live # abia asta semneaza ceva
```

Implicit nu se trimite nimic. `--live` se scrie de mana de fiecare data.

## Comenzi

| comanda | ce face |
|---|---|
| `doctor` | verifica lantul, contractele, matematica adreselor si daca `deliver()` e apelabila de un strain |
| `scan` | cine are ceva nerevendicat si cat valoreaza |
| `wall` | peretele uitatilor, din ultima scanare |
| `simulate` | ce s-ar livra, cu ce gaz si ce bacsis, plus motivul fiecarei excluderi |
| `run` | o rulare completa (uscata daca nu pui `--live`) |
| `start` | bucla continua, plus API si botul de Telegram |
| `serve` | doar API-ul de citire |
| `report` | cat a livrat, cat a castigat, cat a ars pe gaz, pe 24h, 7 zile si total |
| `tba <id>` | adresa portofelului 6551 al unui broker, calculata local si verificata cu registrul |

Optiuni globale: `-c <config>`, `--live`, `--campaign`.

## Cum functioneaza o rulare

1. **Reconciliere.** Tranzactiile ramase in aer de la rularea trecuta se
   verifica intai. Fara asta, contul de gaz iese gresit si pauzele dintre
   livrari se calculeaza pe o minciuna.
2. **Descoperire.** Id-urile brokerilor, prin interval, prin `tokenByIndex` sau
   prin evenimente `Transfer`.
3. **Adresele portofelelor.** Calculate local, prin CREATE2, fara nicio citire.
   Cinci mii de adrese ies instant.
4. **Scanare.** Cat e nerevendicat, in loturi, printr-un singur apel daca exista
   Multicall3.
5. **Filtrare.** Prag de valoare, pauza intre livrari, liste de excludere,
   optin, plafon pe rulare. Cele mai grase primele, ca taierea sa cada pe coada.
6. **Simulare, de doua ori.** Intai fiecare livrare separat, ca sa afli motivul
   exact al fiecarui esec. Apoi lotul supravietuitorilor, o data, ca sa afli
   bacsisul masurat si gazul real.
7. **Livrare.** In loturi, cu tolerare de esec: o livrare care pica nu darama
   lotul.
8. **Anunt si registru.** Canalul de Telegram, urmaritorii, si fiecare rand
   scris cu motiv, inclusiv cele care nu s-au facut.

## Franele

In ordinea in care se aplica:

- **modul uscat**, implicit pornit,
- **fisier de oprire**: daca `data/STOP` exista, nu pleaca nimic, si se verifica
  si intre loturi, nu doar la inceput,
- **plafon de pret al gazului**,
- **buget zilnic de gaz**,
- **prag de rentabilitate**: bacsisul trebuie sa acopere gazul inmultit cu o
  marja, altfel lotul se sare,
- **verificare de sold** inainte de semnare,
- **oprire dupa N rulari picate la rand**.

In modul campanie se livreaza si in pierdere, pentru livrarile gratuite dinainte
de mint, dar bugetul zilnic ramane in picioare. Altfel campania inseamna un
portofel gol pana dimineata.

## Bani si custodie

Courier-ul **nu atinge niciodata fondurile nimanui**. Cheama o functie publica
pe contractul de drop-uri, care trimite banii in portofelul brokerului. Noi
incasam doar bacsisul pe care il plateste protocolul.

`CourierBatch.sol` grupeaza livrarile intr-o tranzactie si imparte bacsisul
atomic intre portofelul agentului si trezorerie. Nu tine fonduri intre
tranzactii, nu are proprietar si nu are functie de upgrade. Taxa se ia din
**bacsis**, niciodata din valoarea livrata: un procent din ce livrezi ar
insemna sa te atingi de banii oamenilor.

## Telegram

Doua canale, o singura regula care le acopera pe amandoua: **botul e doar
citire**. Nu cere conectare de portofel, nu cere semnaturi, nu are nicio functie
care semneaza ceva. Omul lipeste o adresa publica si primeste evenimente pe care
oricine le vede pe explorer.

Regula are un efect secundar care valoreaza mai mult decat mesajul: daca e
publica si absoluta, orice bot clona care cere conectare se demasca singur.

Comenzi: `/watch 0x...`, `/unwatch`, `/list`, `/wall`, `/stats`.
Canalul public primeste fiecare livrare, iar peste un prag primeste rezumat, ca
sa nu ajunga pe mut intr-o saptamana. Rezumat zilnic la ora din configurare.
Alerta de gaz scazut, cel mult o data la sase ore.

## API de citire

Fara autentificare, pentru ca nu are ce sa protejeze: totul de aici e deja
public pe lant. Nicio ruta nu scrie.

| ruta | ce da |
|---|---|
| `/health` | lant, bloc, mod |
| `/stats` | exact forma pe care o citeste landing page-ul: `{stats, feed, meta}` |
| `/wall` | peretele uitatilor, cu vechime |
| `/feed` | ultimele livrari, cu link spre explorer |
| `/report` | contul de profit si pierdere pe 24h, 7 zile si total |

Pe landing page se pune `SITE.live.endpoint` pe adresa lui `/stats` si cifrele
din hero devin reale.

## Registrul e produsul

Se scrie si ce **nu** s-a livrat, si de ce. Dupa o luna de rulare in umbra,
`courier report` da livrari, valoare livrata, bacsis incasat si gaz ars.

Cifra aia decide supply-ul colectiei si pretul de mint. E diferenta dintre a
vinde pe baza unei sperante si a vinde pe baza unui numar pe care il poti arata.

Sumele stau ca text in baza de date, niciodata ca intreg: weiul depaseste ce
poate tine un numar din JavaScript, si o rotunjire tacuta acolo ar strica toate
cifrele de mai tarziu.

## Teste

```bash
npm test        # unitare
npm run test:e2e  # cap-coada, porneste anvil si desfasoara contracte reale
npm run test:all
```

Cap-coada nu foloseste obiecte false: porneste un lant local, desfasoara
registrul 6551, colectia, distribuitorul si contractul de lot, si demonstreaza
in ordine ca adresa calculata local e aceeasi cu cea de pe lant, ca scanarea
gaseste exact ce a fost pus, ca rularea uscata nu cheltuie nimic, ca livrarea
muta banii in portofelul brokerului si nu in al nostru, ca bacsisul se imparte
corect, si ca atunci cand functia e rezervata proprietarului unealta o spune
si nu arde gaz pe o tranzactie care ar da revert.

Bug prins de teste, ca exemplu de ce exista: prima varianta a registrului lipea
adresa contractului NFT pe 20 de octeti in loc de 32, cum cere specificatia.
Ieseau alte adrese. Pe productie ar fi insemnat livrari catre portofele
inexistente.

## Desfasurare

```bash
docker compose up -d
```

Datele stau pe volum: registrul e produsul, nu se pierde la redeploy.
Portul e legat pe `127.0.0.1`, se pune un reverse proxy in fata daca trebuie
expus.

Cheia operatorului sta in `.env`, pe server. **Wallet nou, facut pe server, cu
gaz cat pentru cateva zile, fara legatura cu nimic altceva.** Daca e compromisa,
se pierde doar gazul de pe el.

## Ce nu face

- Nu tine fondurile nimanui si nu cere aprobari peste ele.
- Nu semneaza nimic din Telegram.
- Nu castiga curse de viteza. Pe un lant cu secventiator care ordoneaza dupa
  momentul sosirii, cine e mai aproape castiga, iar gazul in plus nu ajuta.
  Courier-ul nu e proiectat pentru curse, ci pentru munca pe care nu o face
  nimeni.
- Nu inventeaza cifre. Ce nu poate masura, declara ca nemasurat.
