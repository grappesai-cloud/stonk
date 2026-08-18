/* =========================================================================
   STONK AGENTS - continutul landing page-ului.
   Singurul fisier pe care trebuie sa il modifici ca sa schimbi texte,
   cifre, clasele de agenti si linkurile.

   ATENTIE: toate cifrele din `stats` si din feed-uri sunt PLACEHOLDER.
   Le inlocuiesti cu date reale (sau le legi la un API) inainte de lansare.
   ========================================================================= */

window.SITE = {

  /* ---------------------------------------------------------------- brand */
  brand: {
    name: 'STONK',
    nameBold: 'AGENTS',
    token: '$STONKBROKER',
    year: '2026',
    email: 'agents@stonkbrokers.xyz',
    status: 'AGENT NETWORK ONLINE',
    hudLeft: 'STONK://AGENTS.V1',
    hudRight: 'ERC-6551 / WORKFORCE',
    socials: [
      { label: 'X / TWITTER', url: 'https://x.com/' },
      { label: 'DISCORD', url: 'https://discord.com/' },
      { label: 'DOCS', url: '#' },
      { label: 'CONTRACT', url: '#' }
    ]
  },

  /* ------------------------------------------------------------------ nav */
  nav: [
    { label: 'AGENTS', href: '#classes' },
    { label: 'TRAITS', href: '#traits' },
    { label: 'LOOP', href: '#loop' },
    { label: 'HOW', href: '#how' },
    { label: 'PLATFORM', href: '#platform' }
  ],
  navCta: 'MINT AGENT',

  /* ----------------------------------------------------------------- hero */
  hero: {
    eyebrow: 'ERC-6551 · AUTONOMOUS WORKFORCE',
    titleTop: 'AGENTS',
    titleBottom: 'THAT CLOCK IN',
    note: 'Mintable NFT workers with their own wallets. They run the jobs nobody wants to run, and the yield lands inside them.',
    cta1: 'MINT AGENT',
    cta2: 'VIEW FLEET',
    meta: 'POT 68% FULL · NEXT CLOCK IN ~14 MIN · 3 RINGERS ARMED',
    feedTitle: 'LIVE JOB FEED',
    feed: [
      'RINGER #0204 · CLOCK IN · +0.412 ETH',
      'MINER #1188 · VRNG FULFILL · ROUND 88213',
      'COURIER #0071 · DELIVER x14 · +0.038 ETH',
      'STOCKER #0442 · RESTOCK GME · 2.10 ETH',
      'LOBBYIST #0009 · VOTE CAST · EPOCH 41',
      'RINGER #0316 · CLOCK IN · +0.287 ETH',
      'MINER #0533 · VRNG FULFILL · ROUND 88214'
    ]
  },

  /* --------------------------------------------------------------- ticker */
  ticker: [
    'CLOCK IN TRIGGERED',
    'VRNG ROUND SETTLED',
    'BROKER BOX RESTOCKED',
    'VEUP VOTE CAST',
    'STOCK DROP DELIVERED',
    'AGENT MINTED',
    'TOKENS BURNED'
  ],

  /* ---------------------------------------------------------------- stats */
  /* `key` e numele campului cerut de la API (vezi SITE.live mai jos).
     Cat timp nu exista API, raman cifrele de aici. */
  stats: [
    { key: 'jobs', value: 128407, label: 'JOBS EXECUTED', drift: 3 },
    { key: 'paid', value: 1942.6, decimals: 1, suffix: ' ETH', label: 'PAID TO AGENTS', drift: 0.4 },
    { key: 'agents', value: 3184, label: 'AGENTS ONLINE', drift: 1 }
  ],

  /* ----------------------------------------------------------------- live */
  /* Legatura cu date reale. Vezi README, punctul 5. */
  live: {
    /* URL-ul care intoarce JSON-ul de mai jos. Gol = pagina ramane pe
       cifrele statice din `stats` si pe feed-ul din `hero.feed`.
       Raspuns asteptat:
       { "stats": { "jobs": 128407, "paid": 1942.6, "agents": 3184 },
         "feed":  ["RINGER #0204 · CLOCK IN · +0.412 ETH", ...],
         "meta":  "POT 68% FULL · NEXT CLOCK IN ~14 MIN" }
       Toate campurile sunt optionale; ce lipseste ramane cum e. */
    endpoint: '',
    refreshMs: 30000,

    /* pretul ETH e real si nu cere backend (Coinbase, public, fara cheie).
       Pune false ca sa nu mai iasa nicio cerere din pagina. */
    ethPrice: true,
    ethUrl: 'https://api.coinbase.com/v2/prices/ETH-USD/spot',
    ethRefreshMs: 60000
  },

  /* ---------------------------------------------------------------- intro */
  intro: {
    title: 'Brokers sit on the payroll. Agents do the work.',
    body: 'Every agent is an NFT with an ERC-6551 smart wallet. Fund it with gas, assign a strategy, let it run. The tips, bounties and commissions it earns stay inside the wallet, so the agent gets heavier the longer it works.',
    cta: 'READ THE DOCS'
  },

  /* -------------------------------------------------------------- classes */
  classes: {
    eyebrow: 'FIVE CLASSES',
    title: 'Every agent is built for one job and paid for that job.',
    hint: 'SCROLL',
    items: [
      {
        code: '01',
        glyph: 'ring',
        name: 'THE RINGER',
        role: 'CLOCK IN EXECUTOR',
        job: 'Watches the distribution pot. The second the ETH bar fills, it fires Clock In and triggers the swap plus the airdrop to every activated broker.',
        earns: 'Clock In tip. Fastest ringer takes the round.',
        config: 'Gas priority, minimum pot threshold'
      },
      {
        code: '02',
        glyph: 'pick',
        name: 'THE MINER',
        role: 'DERP VRNG FULFILLER',
        job: 'Listens for Broker Box rounds waiting on randomness. When the certified entropy lands, it calls fulfill(roundId) and settles the round.',
        earns: 'Fulfillment bounty per settled round.',
        config: 'Machines to watch, max gas per hour'
      },
      {
        code: '03',
        glyph: 'box',
        name: 'THE STOCKER',
        role: 'INVENTORY RESTOCKER',
        job: 'Tracks machine reserves. Below threshold it bridges bankroll ETH, swaps into stock tokens through the router and refills the machine.',
        earns: 'Commission on restocked value.',
        config: 'Target allocation, timing, slippage'
      },
      {
        code: '04',
        glyph: 'vote',
        name: 'THE LOBBYIST',
        role: 'VEUP VOTE OPTIMIZER',
        job: 'Reads every gauge each epoch, weighs volume against bribes and emissions, then casts your veUP allocation before the epoch closes.',
        earns: 'Swap fee rewards routed to voters.',
        config: 'Max bribes, max organic fees, balanced'
      },
      {
        code: '05',
        glyph: 'truck',
        name: 'THE COURIER',
        role: 'DELIVERY AND SWEEP',
        job: 'Scans activated broker NFTs for unclaimed drops, calls deliver() to push rewards through, or sweeps idle tokens into one destination.',
        earns: 'Delivery fee on delivered value.',
        config: 'Own fleet only, or public service'
      }
    ]
  },

  /* --------------------------------------------------------------- traits */
  traits: {
    eyebrow: 'TRAITS AND RARITY',
    title: 'Two agents of the same class are not the same worker.',
    body: 'Traits are rolled on chain at mint and never change. They decide who gets to the pot first, how much gas a job burns and how many machines one agent can cover.',
    rollCta: 'ROLL AGAIN',
    rollNote: 'Preview only. The real roll happens on chain at mint.',

    idLabel: 'AGENT',
    scoreLabel: 'SCORE',
    frameLabel: 'FRAME',
    tierLabel: 'RARITY',
    ladderTitle: 'SUPPLY BY RARITY',

    /* cele patru valori rolate; min/max sunt limitele rolarii */
    stats: [
      { key: 'SPEED', desc: 'Reaction time when the pot fills', min: 40, max: 99 },
      { key: 'EFFICIENCY', desc: 'Gas burned per completed job', min: 40, max: 99 },
      { key: 'UPTIME', desc: 'Rounds the agent actually shows up for', min: 40, max: 99 },
      { key: 'RANGE', desc: 'Machines or pools watched at once', min: 40, max: 99 }
    ],

    /* pragurile sunt pe suma celor patru valori (160 - 396) */
    tiers: [
      { name: 'MYTHIC', min: 372, share: 0.8 },
      { name: 'EPIC', min: 340, share: 4.2 },
      { name: 'RARE', min: 300, share: 11 },
      { name: 'UNCOMMON', min: 240, share: 26 },
      { name: 'COMMON', min: 0, share: 58 }
    ],

    /* trasatura cosmetica, cu sansele ei */
    frames: [
      { name: 'STEEL', weight: 55 },
      { name: 'CARBON', weight: 25 },
      { name: 'CHROME', weight: 13 },
      { name: 'GOLD FOIL', weight: 6 },
      { name: 'GLITCHED', weight: 1 }
    ]
  },

  /* ----------------------------------------------------------------- loop */
  loop: {
    eyebrow: 'THE ECONOMIC LOOP',
    title: 'Nothing here leaks. It circles.',
    body: 'Minting burns supply. Working prints yield. Yield makes agents worth holding, and a faster agent network means more drops for every broker in the ecosystem.',
    /* blocul din mijlocul cercului */
    coreTop: 'EVERY MINT',
    coreMid: '50% BURNED',
    coreBot: '50% TO TREASURY',
    nodes: [
      { n: '01', label: 'MINT', sub: 'burn supply' },
      { n: '02', label: 'WORK', sub: 'jobs execute' },
      { n: '03', label: 'EARN', sub: 'tips + bounties' },
      { n: '04', label: 'ACCRUE', sub: 'into 6551 wallet' },
      { n: '05', label: 'CLAIM OR TRADE', sub: 'wallet travels' },
      { n: '06', label: 'SCALE', sub: 'faster ecosystem' }
    ]
  },

  /* ------------------------------------------------------------------ how */
  how: {
    eyebrow: 'HOW IT WORKS',
    title: 'Four steps. No code, no bot to babysit.',
    body: 'You are not running infrastructure. You are hiring one.',
    cta: 'MINT YOUR FIRST AGENT',
    steps: [
      { title: 'MINT', body: 'Burn STONKBROKER to mint an agent. Half burns, half funds the treasury. Traits are rolled on chain.' },
      { title: 'FUND', body: 'Send gas ETH into the agent wallet. That wallet belongs to the NFT, not to you, so it moves when the NFT moves.' },
      { title: 'CONFIGURE', body: 'Pick a strategy. Gas budget, target machines, risk profile, auto compound. Change it whenever you want.' },
      { title: 'EARN', body: 'The agent works, the wallet fills. Claim the yield, or sell the agent with the yield still inside it.' }
    ]
  },

  /* ------------------------------------------------------------- platform */
  platform: {
    eyebrow: 'THE PLATFORM',
    title: 'Mint it. Watch it. Sell it.',
    cards: [
      {
        tag: '/mint',
        title: 'MINT',
        body: 'Pick a class, roll traits, burn supply.',
        lines: [
          '> select class: RINGER',
          '> rolling traits ......... OK',
          '> speed 92 · efficiency 87',
          '> burn 50% · treasury 50%',
          '> AGENT #0417 DEPLOYED'
        ]
      },
      {
        tag: '/dashboard',
        title: 'DASHBOARD',
        body: 'Live status, earnings, jobs completed.',
        lines: [
          'RINGER #0204   ONLINE   +2.14 ETH',
          'MINER  #1188   ONLINE   +0.88 ETH',
          'COURIER#0071   IDLE     +0.31 ETH',
          'STOCKER#0442   NO GAS   +1.02 ETH',
          'FLEET TOTAL             +4.35 ETH'
        ]
      },
      {
        tag: '/marketplace',
        title: 'MARKETPLACE',
        body: 'A loaded wallet sells for more than a fresh mint.',
        lines: [
          'AGENT #0088  wallet 2,140 USD',
          'AGENT #0311  wallet   980 USD',
          'AGENT #0902  wallet    12 USD',
          '> value = traits + wallet',
          '> wallet travels with the NFT'
        ]
      }
    ]
  },

  /* ------------------------------------------------------------------ cta */
  cta: {
    badge: 'MINT OPEN',
    line1: 'HIRE AN AGENT',
    line2: 'BEFORE THE',
    line3: 'POT FILLS',
    sub: 'Every round someone gets the tip. It may as well be yours.',
    button: 'MINT AGENT'
  },

  /* --------------------------------------------------------------- drawer */
  access: {
    title: 'EARLY ACCESS',
    subtitle: 'Get on the mint list.',
    name: 'HANDLE',
    namePh: 'degen.eth',
    email: 'EMAIL',
    emailPh: 'you@wallet.xyz',
    wallet: 'WALLET',
    walletPh: '0x...',
    klass: 'PREFERRED CLASS',
    klassPh: 'Select a class',
    klassOptions: ['The Ringer', 'The Miner', 'The Stocker', 'The Lobbyist', 'The Courier', 'Undecided'],
    message: 'NOTE',
    messagePh: 'I want a fleet of ringers and I want them yesterday...',
    send: 'REQUEST ACCESS',
    sent: 'REQUEST READY. OPENING YOUR MAIL CLIENT.'
  },

  /* --------------------------------------------------------------- footer */
  footer: {
    dropLine: 'TALK TO US',
    pages: 'NAVIGATE',
    socials: 'CHANNELS',
    by: 'STONK AGENTS',
    note: 'Autonomous workforce for the StonkBrokers ecosystem.'
  }
};
