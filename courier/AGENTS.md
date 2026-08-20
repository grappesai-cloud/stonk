# READ THIS FIRST

Courier is a bot that finds unclaimed drops sitting in ERC-6551 wallets owned by
NFTs, and delivers them to the rightful owners. It never takes custody and it
never asks anyone to connect a wallet.

This file exists so a person, or an AI being asked questions about this repo,
can get oriented in one minute.

## Where to start

| You want | Read |
|---|---|
| the plain version, no jargon | `EXPLAINER.md` (English) |
| the whole thing, technical | `HANDOFF.md` (English) |
| every detail, including traps | `README.md` (Romanian) |
| what ships when | `LAUNCH.md` (English) |

**Language note, so nothing looks broken:** `README.md` and the code comments
are in Romanian, on purpose. Everything user-facing (CLI output, web pages,
Telegram messages, API) is in English. `HANDOFF.md` and `EXPLAINER.md` are the
English documents.

## The spine of the code

One cycle runs every few minutes and is the whole product:

    reconcile -> discover -> scan -> screen -> simulate -> execute -> record -> alert

| Step | File |
|---|---|
| the loop itself, standby, watchdog, backups | `src/runner.ts` |
| enumerate broker token ids | `src/discover/brokers.ts` |
| compute each NFT's 6551 wallet address, locally | `src/erc6551/address.ts` |
| read what is unclaimed, batched | `src/scan/claims.ts` |
| policy: minimums, cooldowns, caps, allow and deny | `src/policy/rules.ts` |
| rehearse against the live chain before signing | `src/simulate/simulate.ts` |
| every brake, in order, then send | `src/execute/executor.ts` |
| who does the work and who gets paid | `src/fleet.ts` |
| the ledger, which is the actual product | `src/ledger/db.ts` |
| verified backups of that ledger | `src/ledger/backup.ts` |
| is it alive, or just answering | `src/health.ts`, `src/standby.ts` |
| public read-only API and pages | `src/api/` |
| operator console, three write routes | `src/console/` |
| batching plus the on-chain tip split | `contracts/src/CourierBatch.sol` |
| the agent NFT, one type with a role slot | `contracts/src/StonkAgent.sol` |

## Rules the code is built around

Break any of these and it stops being the same product.

1. **Default is: do nothing.** Dry run unless `--live` is typed by hand.
2. **Nothing is signed that was not simulated first**, against current chain state.
3. **Never take custody.** Delivered value goes from the protocol straight to the
   owner. The bot's income is the protocol tip, never a cut of what it delivers.
4. **No wallet connection, ever**, anywhere in the product. The public pages say
   so out loud because the first clone of this will be a drainer.
5. **The ledger records why nothing happened**, not only what happened. In
   production, "why did it not deliver" is the question you ask daily.
6. **Secrets come from the environment.** Config files hold `env:NAME`
   references, never values. The operator key is created on the server.
7. **The contract shape lives in config, not in code.** Function signatures and
   argument templates are configuration, so moving to another ecosystem is an
   afternoon, not a rewrite.

## State right now

Built, tested, running on a server in **standby**. It is waiting for two
addresses: the broker collection and the drops contract. Everything else is
finished. See the blocker table in `LAUNCH.md`.

## Tests

    npm test        # unit
    npm run test:e2e  # starts anvil, deploys real contracts, one run forks the live chain
    npm run test:all

166 tests. The e2e suite is the interesting one: it runs against a fork of the
real chain with the real ERC-6551 registry, and probes owner-gating against a
live third-party contract. Three real bugs were caught this way and they are
written up in `README.md`.
