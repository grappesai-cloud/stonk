# Stonk

Everything Stonk Agents in one place: the site, the keeper agents, and the NFT collection generator for the StonkBrokers ecosystem on Robinhood Chain (4663).

## Layout

| Folder | What it is |
| --- | --- |
| `site/` | Landing page at stonk.grappes.dev. Static site, no framework, no build step. Content lives in `js/content.js`. |
| `courier/` | Courier agent: finds unclaimed drops sitting in ERC-6551 broker wallets and delivers them. Never takes custody. TypeScript, viem, sqlite. |
| `fleet/` | Ringer, Miner, Stocker, Lobbyist and the batch Courier. One core, one module per job (`src/jobs`). TypeScript, viem, sqlite. |
| `nft/` | Collection generator. Pixel art drawn from code, no AI image generation, fully deterministic. Python. |

## History

This repo consolidates three former repos (`stonk-agents`, `stonk-courier`, `stonk-fleet`), merged with full history via `git subtree`; those repos are archived. The NFT generator joined git here for the first time. Generated outputs (rendered collections, galleries) are not tracked; they rebuild from code.

## Working on it

Each folder is self-contained and keeps its own README, tests and tooling. Run `npm test` inside `courier/` or `fleet/`, and `python3 v50/collection.py` inside `nft/`. Nothing at the root builds or deploys anything; deploys are per folder.
