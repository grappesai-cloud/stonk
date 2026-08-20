# stonk-fleet

**Ringer, Miner, Stocker, Lobbyist and Trader** — the rest of the Stonk Agents
fleet. One core, one job module per agent. [Courier](../stonk-courier) stays
where it is; this repo is where the others live.

**Three of them are wired to the real StonkBrokers contracts and proven end to
end on a fork of the live chain.** They are not earning yet for one reason
only: the wallets have no gas. Two more are built and tested but have no
contract to work on — see *What actually exists on chain* below. **Trader** is
different again: it works our **own** Financial NFA contracts and stands by
until they are deployed on 4663.

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

## What actually exists on chain

The landing page describes five jobs. On chain, three exist, and none of them
pays the caller anything:

| job | contract | callable by anyone | pays the caller |
|---|---|---|---|
| `startRound(token)` | SafetyDepositClockInV3 | yes, proven | no |
| `clockIn(tokens[], ids[])` | SafetyDepositClockInV3 | yes, proven | no |
| `crank(max, deadline)` | DirectedClockInBooster | yes, proven | no |

**There is no VRNG round machine, no goods restocking, and no gauge voting.**
`StonkUpLockerCL` is a liquidity locker, not a voter; `StockBooster` is another
drop machine, not an inventory contract. So Miner, Stocker and Lobbyist are
finished agents with nowhere to work, and they say so instead of pretending.

Since nothing pays a keeper fee, the agents run in **campaign mode**: they work
at a loss on purpose. What they produce is not a fee, it is coverage and proof
— every delivery recorded, per broker. That is what a Stonk Agent sells.

## The job modules

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

**STOCKER** refills machines before they run dry and takes a commission. It is
the first agent in the fleet that **spends**. The others burn gas; this one
hands goods out of the wallet and waits for more to come back. That is a
difference in kind, not in size: an agent that gets gas wrong loses cents per
run, one that gets the goods maths wrong can empty a wallet overnight doing
exactly what you asked.

So its brakes are not the same ones:

- profitability is judged on reward **minus cost**, never on reward. A 5%
  commission on goods bought 10% over price is a loss that looks like a profit
  in any report that does not subtract the spend.
- an unmeasured cost is refused in profit mode, exactly like an unmeasured
  reward.
- there is a per-job ceiling and a **separate daily spend budget**. Gas and
  goods are two different taps: a day of expensive gas should not stop
  restocking, and a day of heavy restocking should not stop everything else.
- with token payment, the agent never grants itself an unlimited approval. The
  allowance is the real ceiling — and the real size of the loss if the protocol
  misbehaves — so it approves what a run needs, and only when told to.

**LOBBYIST** votes the gauges before the epoch closes and collects. Two things
set it apart.

First, a line it does not cross: **it never locks tokens and never extends a
lock.** The veUP position is a human decision, made once, with money that
cannot be recovered for months. The bot works with a position that already
exists. If there is none, it stands by and says so.

Second, its reward is not read from a field, it is **computed**:

```
our share = power / (existing votes + power) * bribes
```

which is why the agent exists at all: between a gauge paying a lot that is
already crowded and one paying less that is empty, the second is usually worth
more. In the e2e test a gauge with a 0.6 bribe and 10 votes beats one with a
1.0 bribe and 1000 votes, and the agent picks it. Every input is read from
chain, so the number is measured, but it stays an **estimate for the end of the
epoch**: a bigger voter arriving after us lowers our share, and no one can know
that in advance.

That also changes the question at step zero. For Ringer, Miner and Stocker it
is "can a stranger call this?", and a no means the agent cannot exist. For
Lobbyist it is the reverse: voting **with our lock** must be reserved to us, or
anyone could vote with it. So `doctor` asks "can *we* call it?" and separately
confirms that a stranger cannot. Without that distinction it would raise a
false alarm on every start, and an alarm that always sounds stops being read.

**TRADER** rotates a Financial NFA vault between tokenized stocks, following
the same signals the backtest ran. It is the only agent in the fleet working
on **our own contracts** — the NFT collection from the private financial-nfa
repo — and that changes both usual questions:

- the step-zero question flips, like Lobbyist's: `executeTrade` is reserved to
  the NFT's agent key, so "can *we* call it, and is a stranger refused" is the
  healthy state, not an alarm.
- the real brake lives **in the contract** (asset allowlist, USD caps,
  slippage-vs-oracle, cooldown, pause). What the fleet adds is what a contract
  cannot know: a ledger with every decision and its reason, the operator's
  daily budgets, the watchdog, and refusal by default when a number cannot be
  measured up front.

The brain is not in this repo, on purpose: this repo is public and the
strategies are exactly the part that must not be. The trader loads them at
start from a mounted checkout of the private financial-nfa repo, built
(`job.brain.dir`, `./brain/`, gitignored). No brain — the agent stands by and
says why. There is no vendored copy that could drift from the backtest or leak
alpha into git.

One trader = one NFT. Each process holds only that NFT's agent key, so a leak
compromises one vault, not the fleet. A second NFT is a second config file
with different ports, not new code.

The cost of a rotation is not the goods — they stay in the vault, swapped into
another asset. The cost is the **slippage allowance**: how far below the
oracle-fair amount the trade may fill, which is exactly the margin
`minAmountOut` tolerates. That number is measured before sending, written in
the ledger, and counted against the daily spend budget — the same two taps
Stocker uses, pointed at a different kind of spend.

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

`npm test` (unit) and `npm run test:e2e` (anvil, real contracts) — **143 tests**.

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

The Stocker suite is mostly about **refusal**, not about work: commission under
cost, per-job ceiling, daily spend budget, missing approval, unpriced token.
And one that matters more than it looks — a machine we cannot afford stays in
the list and is stopped by simulation, with the reason written down. If it
disappeared from the list instead, the log would say "nothing to do" when the
truth is "no money to do it with".

**What no test can prove: that we arrive first in production.** That depends on
who else is on that chain and what they are willing to pay. It cannot be found
in a test — only measured, which is what the race book is for.

---

## Six things found by running it, not by reading it

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

**4. Simulation has to carry the call's value.** A payable function simulated
without money fails on the payment check, so the stranger and the owner get the
same refusal and the authority probe answers "cannot tell" exactly where it
must answer. Worse, no paying agent would ever get past simulation. Simulation
now sends `value`, and the authority probe additionally **overrides the probe
accounts' balances** — there, a lack of funds must not be allowed to hide the
answer about permissions.

**5. A cost you cannot price computes to zero.** The guard was written as "if
the cost is above zero and unmeasured, refuse", which skipped precisely the
dangerous case: when the token has no price, the computed cost is 0 and the
check never fired. The condition is now simply "if we cannot value what we are
giving away, refuse". Agents that spend nothing mark their cost as measured, so
they are unaffected.

**6. A once-per-epoch job repeats until the epoch ends.** Nothing stopped
Lobbyist from voting again on every pass: it burned gas and split its own
voting power across its own votes, which quietly lowered its share. Work items
can now be marked `once`, keyed by the epoch, and the ledger is what remembers.
A lost ledger costs at most one repeat, which is one more reason the backups
are verified.

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
src/jobs/     one file per agent (ringer, miner, stocker, lobbyist). A new
              agent is a file here plus a config, not an if branch through the
              core
contracts/    the mock contracts the e2e suite deploys
config/       one config per agent; *.example.json are the documented versions
```

Deployment mirrors Courier: `docker compose up -d`, ledger and backups bind
mounted on the host, both ports published on loopback only, console reachable
through an SSH tunnel.
