/* =========================================================================
   STONK AGENTS - tot continutul paginii. Singurul fisier pe care il editezi
   ca sa schimbi texte, cifre, clase si linkuri. HTML-ul nu contine texte.

   Doua conventii:
   - [[text]] intr-un titlu = bucata aia se coloreaza verde.
   - {{cta}} si {{status}} = iau valoarea din blocul `launch`, dupa status.
   ========================================================================= */

window.SITE = {

  /* ---------------------------------------------------------------- brand */
  brand: {
    name: 'STONK AGENTS',
    token: '$STONKBROKER',
    year: '2026',
    email: 'agents@stonkbrokers.xyz',
    /* Pui `url` si linkul devine activ. Lasi gol si apare cu eticheta SOON,
       neclickabil. Niciodata '#': un subsol de linkuri moarte arata a proiect
       abandonat. */
    socials: [
      { label: 'X / TWITTER', url: '' },
      { label: 'DISCORD', url: '' },
      { label: 'DOCS', url: '' }
    ]
  },

  /* --------------------------------------------------------------- launch */
  /* Singurul bloc pe care il schimbi la lansare. */
  launch: {
    status: 'soon',                          /* 'soon' | 'live' | 'sold' */
    date: '2026-09-15T18:00:00Z',            /* ISO cu fus; numaratoarea e reala */
    label: { soon: 'MINT SOON', live: 'MINT LIVE', sold: 'SOLD OUT' },
    cta:   { soon: 'Join whitelist', live: 'Mint an agent', sold: 'Buy on secondary' },
    countdownLabel: 'MINT OPENS IN',
    liveLabel: 'MINT IS LIVE',
    units: ['DAYS', 'HRS', 'MIN', 'SEC'],
    contract: {
      label: 'CONTRACT',
      address: '',                           /* gol = "NOT DEPLOYED YET" */
      chain: 'BASE',
      explorer: 'https://basescan.org/address/',
      soon: 'NOT DEPLOYED YET',
      copy: 'COPY',
      copied: 'COPIED'
    }
  },

  /* ------------------------------------------------------------------ nav */
  nav: [
    { label: 'Fleet', href: '#fleet' },
    { label: 'Loop', href: '#loop' },
    { label: 'Mint', href: '#mint' }
  ],
  navCta: '{{cta}}',

  /* ----------------------------------------------------------------- hero */
  hero: {
    eyebrow: 'ERC-6551 · AUTONOMOUS WORKFORCE',
    titleTop: 'Agents that',
    titleBottom: '[[clock in.]]',
    note: 'NFT workers with their own wallets. They run the jobs nobody wants to run, and the yield stays inside them.',
    cta1: '{{cta}}',
    cta2: 'See the fleet',
    feedTitle: 'JOB FEED',
    feedTag: 'SIM',                          /* feed simulat pana exista contractul */
    feed: [
      ['RINGER #0204', 'CLOCK IN', '+0.412 ETH'],
      ['MINER #1188', 'VRNG FULFILL', '+0.021 ETH'],
      ['COURIER #0071', 'DELIVER x14', '+0.038 ETH'],
      ['STOCKER #0442', 'RESTOCK GME', '+0.105 ETH'],
      ['LOBBYIST #0009', 'VOTE CAST', '+0.260 ETH'],
      ['RINGER #0316', 'CLOCK IN', '+0.287 ETH']
    ]
  },

  /* --------------------------------------------------------------- ticker */
  ticker: [
    'CLOCK IN TRIGGERED', 'VRNG ROUND SETTLED', 'BROKER BOX RESTOCKED',
    'VEUP VOTE CAST', 'STOCK DROP DELIVERED', 'AGENT MINTED', 'TOKENS BURNED'
  ],

  /* ---------------------------------------------------------------- stats */
  /* Pana la lansare tine aici DOAR cifre adevarate: decizii de proiect, nu
     telemetrie inventata. Un contor fals se prinde in treizeci de secunde. */
  /* Pana la lansare afisam fapte despre proiect. Cand Courier-ul ruleaza si
     `live.endpoint` raspunde, fiecare cifra se inlocuieste cu perechea ei
     masurata din `live`, impreuna cu eticheta. Asa pagina nu minte niciodata:
     ori spune un fapt, ori spune o masuratoare. */
  stats: [
    { key: 'supply',  value: 5000, label: 'Agents in supply',
      live: { key: 'jobs', label: 'Deliveries made' } },
    { key: 'classes', value: 5,    label: 'Agent classes',
      live: { key: 'agents', label: 'Wallets reached' } },
    { key: 'burn',    value: 50, suffix: '%', label: 'Burned per mint',
      live: { key: 'unclaimedCount', label: 'Still unclaimed', suffix: '' } }
  ],

  /* ----------------------------------------------------------------- live */
  live: {
    /* Adresa lui `/stats` de la Courier (vezi ~/stonk-courier). Gol = raman
       cifrele statice de mai sus. Cand botul ruleaza, cifrele din pagina devin
       masurate, iar eticheta SIM din hero se schimba singura in LIVE. */
    endpoint: '',
    refreshMs: 30000,
    ethPrice: true,      /* pretul ETH, real, public, fara backend */
    ethUrl: 'https://api.coinbase.com/v2/prices/ETH-USD/spot',
    ethRefreshMs: 60000
  },

  /* -------------------------------------------------------------- classes */
  classes: {
    eyebrow: 'FIVE CLASSES',
    title: 'One agent, one job, one paycheck.',
    hint: 'SCROLL',
    items: [
      { code: '01', glyph: 'bell',  name: 'The Ringer',   role: 'CLOCK IN EXECUTOR',
        job: 'Fires Clock In the second the pot fills.', earns: 'Clock In tip' },
      { code: '02', glyph: 'pick',  name: 'The Miner',    role: 'VRNG FULFILLER',
        job: 'Settles Broker Box rounds waiting on randomness.', earns: 'Fulfill bounty' },
      { code: '03', glyph: 'box',   name: 'The Stocker',  role: 'INVENTORY RESTOCKER',
        job: 'Refills machines before they run dry.', earns: 'Restock commission' },
      { code: '04', glyph: 'vote',  name: 'The Lobbyist', role: 'VEUP VOTE OPTIMIZER',
        job: 'Votes your gauges before the epoch closes.', earns: 'Voter fees' },
      { code: '05', glyph: 'truck', name: 'The Courier',  role: 'DELIVERY AND SWEEP',
        job: 'Pushes unclaimed drops into broker wallets.', earns: 'Delivery fee' }
    ]
  },

  /* ----------------------------------------------------------------- loop */
  loop: {
    eyebrow: 'HOW IT WORKS',
    title: 'Four steps. [[No bot to babysit.]]',
    body: 'You are not running infrastructure. You are hiring one.',
    steps: [
      { n: '01', title: 'Mint',  body: 'Burn ' + '$STONKBROKER' + '. Half burns, half funds the treasury.' },
      { n: '02', title: 'Fund',  body: 'Send gas into the wallet that belongs to the NFT.' },
      { n: '03', title: 'Work',  body: 'Pick a strategy. The agent takes the jobs.' },
      { n: '04', title: 'Earn',  body: 'Claim the yield, or sell the agent with it still inside.' }
    ]
  },

  /* ----------------------------------------------------------------- mint */
  cta: {
    line1: 'Hire an agent',
    line2: '[[before the pot fills.]]',
    sub: 'Every round someone takes the tip. It may as well be yours.'
  },

  access: {
    title: 'WHITELIST',
    subtitle: 'Spots are capped. Wallet goes on chain, not in a newsletter.',

    /* UNDE AJUNGE FORMULARUL. Cheie gratuita de pe web3forms.com (cere doar un
       email) si formularul pleaca direct de pe site. Sau `endpoint` propriu,
       primeste acelasi JSON prin POST. Amandoua goale = formularul cade pe
       mailto, si pe telefoanele fara client de mail omul apasa degeaba.
       Nu lansa asa. */
    web3formsKey: '',
    endpoint: '',

    wallet: 'WALLET', walletPh: '0x... or name.eth',
    handle: 'X HANDLE', handlePh: '@degen',
    klass: 'CLASS YOU WANT', klassPh: 'Undecided',
    send: '{{cta}}',
    sending: 'SENDING',
    ok: 'YOU ARE ON THE LIST.',
    err: 'THAT DID NOT GO THROUGH. TRY AGAIN, OR DM US ON X.',
    mailto: 'OPENING YOUR MAIL CLIENT.'
  },

  /* --------------------------------------------------------------- footer */
  footer: {
    note: 'Autonomous workforce for the StonkBrokers ecosystem. Nothing here is financial advice.'
  }
};
