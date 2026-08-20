# Courier launch plan

Written 2026-08-19. This is the honest state, not the pitch.

## Where we are

**The bot is finished and tested.** 144 tests, including a fork of Robinhood
Chain mainnet running against the real ERC-6551 registry deployed there, and an
owner-gating probe run against a live third-party contract we do not control.

**The container is proven.** The image builds, boots, scans, delivers a real
batch, writes verified backups to the volume, answers 503 when it goes stale,
and restarts itself when the watchdog bites. Verified against a running
container, not assumed from the Dockerfile.

**It has never touched production.** No transaction has ever been signed on a
real chain. Every delivery so far happened on a local chain or a fork.

## What blocks what

| Blocker | Blocks | Owner |
|---|---|---|
| StonkBrokers collection address | delivery **and** indexing | StonkBrokers team |
| Drops contract address + its `pending`/`deliver` signatures | delivery **and** indexing | StonkBrokers team |
| Is `deliver()` callable by a stranger? | **delivery only** | answered by `courier doctor` once we have the address |
| A funded operator wallet | delivery only | us |
| Telegram bot + channel handle | alerts | us |

Read the middle row twice. The gating question is the one everybody assumes is
fatal, and it is not: it blocks delivery, not the index. That is what stage 1
below is for.

## Stage 1 — Watchtower (can ship the week we get the addresses)

Scans, keeps the index, alerts, publishes. **No key, no signing, no delivery**,
so there is no risk, no gas, and no permission needed from anyone.

- [ ] get the two contract addresses and confirm the chain
- [ ] `courier init <drops>` to read the verified ABI, pick the signatures
- [ ] `courier doctor` until every line is OK (the gating line may say NO; fine here)
- [ ] `courier scan` and record the first real number: how much is sitting unclaimed
- [ ] register the Telegram channel and bot handle **before announcing anything**
- [ ] create the dead-man check (healthchecks.io or similar), put it in `HEARTBEAT_URL`
- [ ] point a subdomain at the box, deploy with `docker compose up -d`
- [ ] confirm `courier backup --list` shows copies after the first day
- [ ] set `publicUrl` so alerts link to the per-wallet pages
- [ ] `courier start --watchtower`

What the public gets on day one: the wall of the forgotten, a page per wallet
they can share, and a channel that posts every discovery.

## Stage 2 — Courier (delivery)

Only after `doctor` says `deliver()` is callable by a stranger.

- [ ] fresh operator wallet **created on the server**, funded with a few days of gas
- [ ] `courier simulate` to see what would go out and what it would cost
- [ ] `courier run` (dry) and read the ledger
- [ ] deploy `CourierBatch` (batching cuts the cost per delivery by ~79%)
- [ ] `courier run --live` on a handful of deliveries, publish the tx hashes
- [ ] switch on `campaign` mode for the free pre-mint delivery run
- [ ] let it run in the shadows for a month and collect the real P&L

At Robinhood Chain gas prices one delivery costs roughly 0.00003 ETH at a batch
of 50, so the free campaign is effectively free. Measured, not guessed.

## Stage 3 — The collection

The contract is written and tested. Do not deploy it before stage 2 has a month
of measured numbers, because those numbers set the supply and the price.

- [ ] decide supply from the measured monthly revenue, not from a nice round number
- [ ] fill `config/deploy.json`, run the deploy script **without** `--live` and read it
- [ ] deploy, then `defineRole` for every tool that actually works
- [ ] `mintReserved` the prototype agents, install their roles
- [ ] only then `setMintOpen(true)`
- [ ] a marketplace must verify `snapshot()` and the transfer counter in the same
      transaction, otherwise a seller can empty the wallet as the sale lands
- [ ] no APR, no yield projections, no "passive income" in any copy
- [ ] mint price must be justified by the tool that already works, never by the roadmap

## Numbers to collect before minting

The whole design hangs on these, and none of them are known yet:

1. total unclaimed value sitting right now, and how fast new value appears
2. what the protocol actually pays per delivery
3. how many deliveries per month are possible
4. net per agent per month, after gas

Stage 1 answers 1. Stage 2 answers 2 through 4. Then, and only then, supply and
price stop being guesses.

## Cut on purpose

- **Stocker** — hands protocol bankroll authority to a holder-configured process
- **Marketplace** — magnet for scams until drain-on-transfer is solved
- **The other three agents** — one that works beats four that are announced

## Agent #0000

The prototype agent is already wired: every delivery is attributed to it, and
`/a/0` is its public page. Point it at the real contracts today and by mint day
it has a real history instead of a promise.
