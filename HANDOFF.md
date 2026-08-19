# COURIER // HANDOFF

Read this once and you know the whole machine: what it is, how it runs, what
it needs from you, and what must never be changed without a very good reason.

Written 2026-08-19. Honest state, not the pitch.

---

## 1. The one-liner

Every StonkBrokers NFT owns a wallet (ERC-6551). Value lands in those wallets
and sits there, because somebody has to press the button and most people never
do. Courier is a bot that finds every wallet holding something unclaimed,
proves the claim would succeed before touching the chain, delivers it to the
rightful owner, and publishes the receipt.

It never holds the money. It never takes custody. It never asks anybody to
connect a wallet. It gets paid only out of the protocol tip, never out of the
value it delivers.

That last sentence is the product. Everything else is plumbing.

## 2. Why this is worth anything

Unclaimed value is the most boring, most reliable inefficiency in crypto.
People mint, people forget, value accrues, nobody presses claim. The number
only goes up, and it is public, so we can show it on a wall before we are
allowed to touch a single wei of it.

The bot does not compete for it in an auction. It is not MEV. There is no race
to win, no bribe to pay, no latency edge to buy. It is janitorial work that
pays a fixed tip, and janitorial work scales with patience, not capital.

## 3. What it actually does, in order

Every cycle, roughly every five minutes:

    reconcile -> discover -> scan -> screen -> simulate -> execute -> record -> alert

1. **reconcile** picks up anything left in flight from the last run so a crash
   never creates a phantom delivery.
2. **discover** enumerates broker token IDs and computes each one's ERC-6551
   wallet address locally. No indexer, no subgraph, no third-party API. The
   address is pure math (CREATE2), and we verify our math against the on-chain
   registry on startup.
3. **scan** reads what is pending for every wallet, batched through Multicall3.
   Thousands of reads, a handful of RPC calls.
4. **screen** applies the policy: minimum value, cooldown, opt-in and deny
   lists, per-run caps. Everything rejected here is written down with the
   reason.
5. **simulate** runs every single call against the current chain state before
   anything is signed. If it would revert, it never gets sent, and the reason
   is decoded into a human name instead of a hex blob.
6. **execute** batches the survivors into one transaction and sends it, but
   only after every brake in section 5 has been passed.
7. **record** writes the delivery, the gas actually burned, and the tip
   actually earned into a local SQLite ledger, split per delivery.
8. **alert** posts to Telegram and updates the public pages.

## 4. Two modes, and the second one is the important one

**Watchtower.** Scan, index, alert, publish. No key, no signing, no delivery.
Zero risk, zero gas, and it needs permission from nobody. Watchtower can ship
the same week we get the contract addresses.

**Courier.** Everything above, plus actually delivering. Needs one thing to be
true on chain: that `deliver()` can be called by someone who is not the owner.

Read that split carefully, because it is the thing everyone gets wrong. If the
drops contract is owner-gated, delivery is impossible for anybody, forever, and
that is not our bug. But indexing still works. The wall of unclaimed value,
the per-wallet pages, the Telegram alerts, the leaderboard: all of it runs with
no key and no permission. So the project has a real, shippable product even in
the worst case.

The bot answers this question itself. `courier doctor` probes the contract as a
stranger and as the owner and tells you which world you are in, with proof.

## 5. The brakes

The executor refuses to send, in this order, and writes down which brake fired:

| Brake | Fires when |
|---|---|
| watchtower | mode is on. Nothing is ever signed, full stop. |
| kill switch | a file exists on disk. Checked again mid-run. |
| gas price | the chain is more expensive than the configured ceiling. |
| simulation | the batch would revert. Per-call reasons, decoded. |
| measured tips | we cannot prove what the tip is, so profit cannot be checked. |
| profit | value would not cover gas by the configured multiple. |
| daily budget | today's gas spend hit its cap. |
| dry run | the default. `--live` is typed by hand, every time. |
| key | no key loaded, so nothing can be signed. |
| balance | the operator wallet cannot cover the estimated gas. |

Default state of the whole system is: do nothing. You have to argue it into
sending a transaction.

## 6. What is already built and tested

132 tests, 13 files. Not a demo, not an MVP.

- **87 unit tests**: policy, ERC-6551 math, ledger accounting, config parsing,
  Telegram, console auth, ABI discovery, CLI args, contract math.
- **45 end-to-end tests** on a real chain (anvil), including:
  - a **fork of Robinhood Chain mainnet** running against the real ERC-6551
    registry deployed there,
  - an owner-gating probe against a **live third-party contract we do not
    control**, to prove the detection actually detects,
  - the full delivery loop with a real batch contract,
  - every brake, individually, proven to stop the thing.

Three real bugs were found by these tests and are written up in the README:
the registry address packing, tips never landing on delivery rows, and the
ledger reporting a whole group as delivered when only one delivery went out.
All three would have shipped silently without the e2e suite.

## 7. Commands

    courier init <dropsAddress>   read the verified ABI, propose signatures
    courier doctor                check everything that must be true, first
    courier scan                  who holds something unclaimed, and how much
    courier simulate              what would go out, at what gas and tip
    courier run                   one full pass (dry by default)
    courier run --live            one full pass, actually signing
    courier start                 loop forever, plus API, console, Telegram
    courier start --watchtower    loop forever, never sign anything
    courier wall                  the wall of the forgotten, in the terminal
    courier report                delivered, earned, burned on gas
    courier tba <tokenId>         the 6551 wallet of a broker, computed locally

`init` proposes, it never guesses. A function called `claim` can mean three
different things and picking the wrong one is how bots burn gas into a wall.
You choose, `doctor` tells you if you chose right.

## 8. What the public sees

A read-only API and three pages, all in the same trading-terminal skin as the
site. No write routes. No wallet connect button. There is nothing on those
pages that can cost a visitor anything, and that is stated on the page itself,
because the first clone of this will be a drainer.

- **the wall of the forgotten**: every wallet holding something unclaimed, how
  much, and how long it has been waiting
- **`/a/:id`**: an agent's public record. Everything it has ever delivered,
  what it earned, its on-chain wallet and role read straight from the contract
- **`/w/:address`**: a page a holder can share. Their unclaimed value, their
  delivery history

Endpoints: `/health`, `/stats`, `/wall`, `/feed`, `/report`, `/leaderboard`,
`/api/agent/:id`, `/api/wallet/:address`. Rate limited, CORS open, read only.

## 9. Telegram

Read only. The bot cannot sign anything, cannot move anything, cannot be
tricked into it, because the signing code is not reachable from it.

`/watch <address>` puts a holder on alert for their own wallet. `/wall`,
`/stats`, `/list`, `/unwatch`. Discoveries post to the channel, deliveries post
with the tx hash, and a daily digest goes out in the morning.

This is the growth loop: a stranger finds out they have money sitting in a
wallet they forgot about, from a bot that never asked them for anything.

## 10. The operator console

Separate port, bound to localhost, token from the environment, HttpOnly cookie,
constant-time compare. Three write routes and only three: pause, resume, run
once. Everything else is read.

It shows the live state, the last run, why the last run stopped, the ledger,
the feed, and the gas balance. The stop button is a two-step confirm inside the
button itself, because a browser dialog would block automation and because
stopping a bot should take one deliberate second.

## 11. The NFT contract

`StonkAgent.sol`. Written, tested with 14 on-chain tests, deploy script ready,
**not deployed**. Three decisions are encoded in it:

**One agent type with a role slot**, not five classes. The role is installed
and can be swapped when a new tool works. If we had sold five classes and only
one tool shipped, four fifths of the collection is dead weight on day one.
This way an agent bought today can be given a tool next quarter without a new
collection and without a promise.

**No yield logic at all.** The contract holds nothing, splits nothing, and has
no claim function. What an agent earns lands in its own 6551 wallet and travels
with the NFT when it sells. This is not a technical detail. A contract that
promises income from somebody else's labour is exactly the shape you do not
want on chain with your name on it.

**Mint burns and keeps nothing.** A fixed share to the dead address, the rest
to the treasury, percentages locked at deploy. A test asserts on chain that the
contract's own token balance stays zero after minting.

For buyers, `snapshot()` returns the owner, the wallet, the wallet balance, the
role, and a counter that increments on every transfer. Nothing on chain stops a
seller from emptying the wallet in the same block as the sale. What you can do
is give the buyer the means to check atomically in the same transaction, and
that is what the counter is for. Any marketplace built on this must verify
`snapshot()` and that counter in the same transaction. If it does not, it is a
scam magnet, which is exactly why the marketplace was not built yet.

The deploy script is dry run by default. It refuses to run if the RPC chain ID
does not match the config, or if any address it assumes exists has no code on
it. It leaves the mint closed.

## 12. What we measured, not guessed

Batching deliveries cuts the cost per delivery by about 79 percent, and the
curve flattens past a batch of 25, which is why the default batch size is what
it is. At Robinhood Chain gas prices a single delivery in a batch of 50 costs
roughly 0.00003 ETH, which makes a free pre-mint delivery campaign effectively
free to run.

Everything else about the economics is unknown, and pretending otherwise is how
these projects die. We do not know how much is sitting unclaimed, what the
protocol pays per delivery, or how many deliveries a month are possible. Stage
1 answers the first. Stage 2 answers the rest. Only then do supply and price
stop being vibes.

## 13. What is blocking

Two addresses. That is the entire blocker list.

1. the StonkBrokers collection address
2. the drops contract address, and its pending and deliver function signatures
   (or just a verified contract, and `courier init` reads them)

Plus a chain confirmation. Config is currently pointed at Robinhood Chain
(4663), where we verified that the canonical 6551 registry, the tokenbound
implementation and Multicall3 are all deployed.

Give the bot those two addresses and watchtower can be live the same week.

## 14. Deliberately not built

- **The marketplace**, until drain-on-transfer is solved atomically. See 11.
- **Stocker**, the agent that would hand protocol bankroll authority to a
  holder-configured process. That is a great way to lose other people's money.
- **The other three agents.** One tool that works beats four that are
  announced. The role slot means they can be added later without a new mint.
- **Opening the mint.** Supply and price should come from a month of measured
  revenue, not from a round number that looks good in a tweet.

## 15. Rules that do not get broken

- the operator key is created **on the server**, funded with a few days of gas,
  and never exists on a laptop
- secrets come from the environment, never from a config file
- Telegram stays read only, forever
- no wallet connect, anywhere, ever
- no APR, no yield projections, no "passive income" in any copy
- mint price is justified by the tool that already works, never by the roadmap
- `--live` is typed by hand every single time

## 16. Ship order

**Stage 1, watchtower.** Two addresses, `doctor` until it is green, `scan` for
the first real number, Telegram channel registered before anything is
announced, subdomain pointed at the box, `docker compose up -d`, then
`courier start --watchtower`. No key, no risk.

**Stage 2, courier.** Only after `doctor` says a stranger can call `deliver()`.
Fresh key on the server, simulate, dry run, read the ledger, deploy the batch
contract, go live on a handful of deliveries and publish the hashes. Then let
it run quietly for a month and collect the real numbers.

**Stage 3, the collection.** Deploy from measured numbers. Define the roles
that actually work. Mint the prototypes. Only then open the mint.

Agent #0000 is already wired: every delivery is attributed to it and `/a/0` is
its public page. Point it at the real contracts today and by mint day it has a
history instead of a promise.
