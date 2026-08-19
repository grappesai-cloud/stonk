# stonk-fleet

**Ringer** and **Miner**, the second and third agents of the Stonk Agents fleet.
One core, one job module per agent. [Courier](../stonk-courier) stays where it
is; this repo is where the rest of the fleet lives.

Both agents are **written, tested, dockerised and standing by**. They cannot
earn anything yet, and the reason is not the code: we do not have the
StonkBrokers contract addresses. The day those arrive, both start working from
a config edit, with no redeploy.

```
fleet init <address>    read the verified ABI, propose the signatures
fleet doctor            is this agent even possible on that contract?
fleet scan              what is there to do right now
fleet simulate          what would happen, nothing sent
fleet run               one pass (dry unless --live)
fleet start             the loop, with the read-only API and the console
fleet watch             watchtower: measure the race, spend nothing
fleet races             the race book
fleet report            the profit and loss of this agent
fleet backup            a verified copy of the ledger
fleet stop / fleet go   the kill switch
```

Every command takes `-c <config>`; there is one config per agent.

---

## The two jobs

**RINGER** presses Clock In the second the pot fills, and takes a cut. It is
the only agent in the fleet where green tests do not mean money: it enters a
**race**. If someone presses one block earlier, our work is worth exactly zero
no matter how correct the code is.

**MINER** settles rounds that are waiting on randomness and collects the
bounty. The question that decides whether this agent exists at all is whether
a stranger may settle. There are two different worlds behind that one word:

1. the contract asks an oracle for randomness, and once it has arrived
   **anyone** can call `settle(id)`. Miner has a job here.
2. the function is the oracle's own `fulfillRandomWords(...)`, reserved to the
   coordinator and carrying a proof we cannot produce. Miner **does not exist**
   here, and no amount of code changes that.

`fleet doctor` answers by proof, not by reading the revert text: it simulates
the same call from a stranger's account and from the account that is allowed,
and reports the difference. It also checks something easy to miss: even if the
call were open, **the arguments have to be ours to produce**. A function anyone
may call with data only the oracle has is still closed.

---

## The race book

Ringer keeps a table the other agents do not have: every press it sees on
chain, who made it, what gas price they paid, and how many blocks after the pot
was ripe.

Without it, a Ringer that loses every race looks exactly like a Ringer with
nothing to do — in both cases the log says "nothing happened". The difference
between those two is the difference between a free job and one that is already
taken, which is the only thing worth knowing before spending on gas.

It works in **watchtower mode**, with no key and no transactions:

```
fleet watch -c config/ringer.json     # runs, measures, signs nothing
fleet races -c config/ringer.json     # what it learned
```

Run that for a few days on the real contract before ever going live. If the
median winning gas price is far above what the tip is worth, the honest answer
is that this agent should not be launched.

---

## What the tests prove, and what they do not

`npm test` (unit) and `npm run test:e2e` (anvil, real contracts) — **114 tests**.

The e2e suite deploys real contracts on a local chain and drives the agents
through the same code path production uses. The race test is the one that
matters: with mining paused, a rival bot and our Ringer put their transactions
in the same block, the node orders them by gas tip, and both outcomes are
proven — **we win when we pay more, and when the rival pays more we lose and
the loss is written in the book with their address and their price.** The
second half matters more than the first: a bot that wins is visible by itself;
one that loses quietly looks like one with no work.

`test/e2e/fork.e2e.test.ts` runs against a **fork of chain 4663 with production
state**. Authority detection is proven on the Uniswap V3 factory, a contract
with nothing to do with us: `setOwner()` is owner-gated, the owner is
discovered by reading the chain, the stranger is refused and the owner is not.
And the reverse, equally important: on Multicall3, which really is open, the
tool says yes. A tool that always answers "reserved" detects nothing.

**What no test can prove: that we arrive first in production.** That depends on
who else is on that chain and what they are willing to pay. It cannot be found
in a test — only measured, which is what the race book is for.

---

## Three things found by running it, not by reading it

**1. On chain 4663 the usual dev addresses carry EIP-7702 delegation code.**
A contract paying with `call{value:}` to such an address succeeds and the money
does not stay there. The transaction looks successful, the bot would report
earnings, and the balance would never move. `fleet doctor` now checks the
operator address for code and says so. **The agent's key must be a fresh
address that has never been delegated.**

**2. Setting a priority tip without a fee cap makes every send fail.** If you
give `maxPriorityFeePerGas` and let the library compute `maxFeePerGas`, the cap
is derived from the base fee alone, and any serious tip lands above your own
cap. Exactly when the race is tightest, nothing is sent — and the log says
"send failed", not "we lost the race". The executor computes the cap itself:
base fee doubled, plus the whole tip.

**3. A placeholder key crash-loops the container.** `KEY=0x` left over from
`.env.example` used to throw at every start; the container restarted forever
and the log talked about the key's shape rather than about it being missing.
Placeholders now mean "no key", which is a normal state. Anything else
malformed is still a loud error — a typo'd key silently ignored means a bot
that never sends and nobody knows why.

---

## Going from standby to live

1. `fleet init <address> -c config/ringer.json` — the explorer's ABI, with
   scored candidates for every field. Signatures are not written by hand.
2. Put the address and the chosen signatures in the config.
3. `fleet doctor` — it must pass. If it says the function is authority-gated,
   stop here: the agent cannot exist on that contract, and that is the answer,
   not a bug.
4. `fleet watch` for a few days. Read `fleet races`.
5. Only then: a fresh key in `.env`, `watchtower: false`, `dryRun: false`,
   `docker compose up -d`.

The brakes are on by default and every one of them is proven on chain in
`test/e2e/brakes.e2e.test.ts`: kill switch, dry run, gas price cap, daily gas
budget, profit margin, and the refusal to work when the reward cannot be
measured up front. That last one is a lesson Courier paid for once: a brake
that exists in the config and never applies is worse than one that is missing.

## Layout

```
src/core/     everything that is not a trade: config, chain, ledger, policy,
              simulation, executor, race book, API, console, doctor, runner
src/jobs/     one file per agent. A new agent is a file here plus a config,
              not an if branch through the core
contracts/    the mock contracts the e2e suite deploys
config/       one config per agent; *.example.json are the documented versions
```

Deployment mirrors Courier: `docker compose up -d`, ledger and backups bind
mounted on the host, both ports published on loopback only, console reachable
through an SSH tunnel.
