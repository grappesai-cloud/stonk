# COURIER, IN PLAIN ENGLISH

The short version, for anyone who is not going to read the code.

---

## The situation

Every broker NFT owns a wallet of its own.

Value lands in that wallet. Rewards, drops, whatever the protocol pays out.

Somebody has to press claim for it to move.

Most people never do. They minted months ago, they moved on, they forgot.

So the money sits there. Not lost, not stolen, just parked, in public, forever.

## What Courier does

**1. It works out where every wallet is.**
It does not search for them. The address of an NFT's wallet can be calculated
from the NFT itself, so Courier writes down all of them in under a second.
It never has to ask anyone, and it works even for wallets nobody has opened yet.

**2. It asks what is sitting in each one.**
One question, asked about thousands of wallets at once. This is a read. It
costs nothing and moves nothing.

**3. It checks the claim would actually work.**
Before touching anything, it runs the whole thing as a rehearsal against the
live chain. If it would fail, it never gets sent, and the reason gets written
down.

**4. It presses the button.**
The money goes from the protocol straight to the person who owns the NFT.
Courier never holds it, not even for a second. Then it publishes the receipt.

## What it never does

- It never holds your money.
- It never asks you to connect a wallet.
- It never asks you to sign anything.
- It never asks you for anything at all.

You do not have to know Courier exists. You do not have to do anything. One day
what was already yours is in your wallet.

**If anything ever asks you to connect a wallet in our name, it is not us.**

## How it gets paid

The protocol pays a small tip for the work of pressing the button.

Courier takes the tip. It never takes a cut of what it delivers. Those are
different pots, and keeping them separate is the whole design.

If the tip does not cover the cost, it does not deliver. It says so and moves on.

The work is shared out between the agents in turn, and each one is paid into its
own wallet in the same transaction that does the work. What your agent earned is
not a number in our database. It is a transfer on chain with its address on it,
and anyone can check it.

## Where it is right now

**Built and tested.** 166 tests, including runs against a copy of the real
chain, with real contracts.

**Running on a server.** Not on a laptop. It restarts itself, backs up its own
records, and reports when something is wrong.

**Waiting on two addresses.** The address of the broker collection, and the
address of the contract that holds the drops. Without those, there is nothing
to look at. Everything else is done.

## What happens the day we get them

**First, it watches.** It publishes the wall: every wallet holding something
unclaimed, how much, and how long it has been waiting. No key, no risk, nobody's
permission needed. People find out they have money they forgot about.

**Then, it delivers.** Once we confirm that anyone is allowed to press claim on
someone else's behalf, Courier starts giving it back, and every delivery is
public.

## Why this is worth doing

Forgotten money is the most boring, most reliable thing in crypto. People mint,
people forget, value builds up, nobody claims it. The number only goes up.

There is no race to win here and nobody to outbid. It is janitorial work that
pays a small fixed amount, which is exactly the kind of work a patient machine
should be doing instead of a person.

And the first thing the public sees is not a promise. It is a list of real
wallets with real money in them, that anyone can check.
