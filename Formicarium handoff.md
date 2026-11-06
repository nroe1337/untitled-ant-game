# Formicarium handoff

Nov 6, 2026 · @Nate · Round 3 (polish and tuning). The earlier handoff, with the original design rules and Round 2 systems, is in [docs/handoff-round2.md](docs/handoff-round2.md).

## Where things live

Formicarium is an ant idle game in `nroe1337/untitled-ant-game`. Work happens on a feature branch, merged to `main` by squash PR after every change (PRs #41–#69 this round).

| What | Where |
| --- | --- |
| Live game | [Formicarium prototype](https://claude.ai/artifact/DtGASvxYZaMg8ax4KnRGMh) |
| Published build file | `/mnt/project-files/ant-game/formicarium-prototype.html` |
| Achievement ideas | [Achievement doc](https://claude.ai/artifact/CN8gGQwbxU5uKL8TjMqr8e) |
| This handoff as a doc | [Formicarium handoff](https://claude.ai/artifact/AgNXhpucVGHsYHDztcPJJS) |
| Tuning numbers | `src/data/balance.ts` |

Ship loop for every change:

1. `npx tsc --noEmit`, then `npm run single` (builds `dist/formicarium-single.html`).
2. Smoke test with Playwright: load the page, wait 1.5s, expect no page errors. Tests can reach the game through `window.game.ctx`.
3. Commit with `git -c user.name=Claude -c user.email=noreply@anthropic.com`, push, open a PR, squash-merge it.
4. Sync: `git fetch origin main && git merge origin/main -m "Sync main" && git push` (force-push and reset are blocked).
5. Copy `dist/formicarium-single.html` to the published build file and republish the artifact at the same path.

## How Nate works

Nate playtests the live artifact and sends short notes, often several in a row, sometimes with a screenshot. Build each change, merge it right away, and republish, so the next test run has it.

- Evolve-style UI: tiles with hover tooltips, compact lists, nothing explained twice.
- Slow-burn pacing; expansion is required for progress; late colonies around 300 workers.
- Short, plain in-game text. Tooltips say what something does in one sentence; no redundant level lines.
- Don't give the player too many options at once: unlock upgrades gradually.
- Expeditions should feel dangerous even when the penalty is small.
- The map is about conquering everything eventually, expanding outward from the nest.
- Ask only when a choice changes the design goal; otherwise pick the likely reading, build it, and say what you chose.

## What shipped this round

Everything below is merged to `main` and live. Newest first.

| PR | System | Change |
| --- | --- | --- |
| #69 | War, queues, map | Battle results as a small new-age-style banner. Evolve-style queue lists (name, time until bought, ▲ move up, ✕ remove, ×N for repeats). Techniques and trail upgrades go in the research queue. Map shows yield if held and with outpost; outposts triple yield. |
| #68 | Map | Claiming is a trip: 3 workers go out for 20s + 4s per tile of distance, then come home. Claim cost grows linearly (8% of base per tile held). Stream tiles open with Leaf rafts, patio with Street fighting. Outposts are buildings (400 soil, 60 twigs, 500 food, +35% each): +6 living space, +2 defence. Frontier sense research adds "Expand on its own". |
| #66, #67 | Tooltips, jobs | Plain-sentence upgrade descriptions; costs say "(you have X)" or "(you can only store X)"; stores rate tooltip has a Net line. Soldiers and majors hunt for half a forager's food between fights (`WAR.battle.offDuty`). |
| #65 | War | Raid status shows soldiers standing and rallied helpers. |
| #64 | Expeditions | Quiet trail shows the scenery of the last place a party came back from. |
| #63 | Brood | Grown larvae become pupae that wait for room and don't eat, so food use stays steady. |
| #62 | War | Fallen soldiers leave their job; "Refill from idle" checkbox beside Rally. |
| #61 | Research | Research queue (Study plans, 2 slots, +Master plans perk) and a late upgrade queue (Work ledgers) for other levelled upgrades. Shared logic in `core/queue.ts`. |
| #60 | Expeditions | A party's fate is rolled at departure; losses happen 25–75% along the trail. A wiped party still holds the column until its timer ends. |
| #57–#59 | Expeditions | Losses are 1 up to 30% of the party, with seven flavored causes; ledger row for workers lost on the trail. |
| #53–#56 | Stats, research | 43 new achievements; larger age banner; trail upgrades unlock at marks (7/7/10/17/17/69/115); techniques gated behind Work songs and Shared labour. |
| #45–#52 | Brood, map, UI | Nurses tend brood; Wound care upgrade; bigger colonies (Worker hall, living-space techs, research gated by colony size); cost hover highlights Stores rows; no-room banner shows for 20s only. |
| #41–#44, #49 | Jobs, expeditions | Reserve toggle; job rows show only the rate, math in the tooltip; "Next destination" marks; "Mark every trip" checkbox. |

## Code map and conventions

The game is TypeScript built with Vite into one HTML file. Each feature is a system in `src/systems/<name>/index.ts` with `init`, `tick`, `isUnlocked`, and a `panel` (mount + update).

| Path | Holds |
| --- | --- |
| `src/core/game.ts` | Main loop, tabs, Stores sidebar, alerts, `announce()` banner (big for new ages, `small` for battles) |
| `src/core/ui.ts` | `el()`, `actionButton`, `tileButton` (hover tooltip, `onQueue`), shared tooltip |
| `src/core/upgrades.ts` | `fromBalance` + `upgradeList` for levelled upgrades; upgrade registry and queues |
| `src/core/queue.ts` | `runQueue`, `queueStrip` (the Evolve-style list), `eta` |
| `src/core/resources.ts` | Resources, caps, `lump()` for one-off spends, rate measurement and per-source breakdown |
| `src/data/balance.ts` | Every tuning number, tech, upgrade and description |
| `src/systems/*` | brood, jobs, nest, research, expeditions, map, war, champion, castes, garden, husbandry, waters, town, lineage, migration, supercolony, stats, and more |

- Systems talk through `ctx.bus.emit/on` (e.g. `expedition:return`, `champion:kill`, `jobs:change`). Stats never imports other systems; it reads state and listens to events.
- Research sets flags `tech:<id>`; other systems gate on flags. Modifiers go through `ctx.mods.set(key, source, value)`; jobs read `job:<id>`.
- Workers away from jobs are counted in `ctx.busy` (expeditions, claiming, campaign); idle = total − assigned − busy.
- Saves merge per-system state over defaults. Add new fields as optional and migrate on the `loaded` event (see map `v2`).
- Don't name a CSS class `small`: it collides with the global `.small` button style.
- Commits end with the Co-Authored-By and Claude-Session trailers; PR bodies end with the Claude Code line. No model names in commits.

## Watch next

Nate is starting a fresh run to test the latest build. These numbers are first guesses and are most likely to need tuning:

| Number | Value | Where |
| --- | --- | --- |
| Claim trip time | 20s + 4s per tile of distance | `MAP.claimTime`, `claimTimePerTile` |
| Claim cost growth | +8% of base per tile held | `MAP.claimStep` |
| Outpost cost | 400 soil, 60 twigs, 500 food, +35% each | `MAP.outpost` |
| Study plans (research queue) | 420 knowledge, 300 food | `RESEARCH.techs.studyplans` |
| Work ledgers (upgrade queue) | 650 knowledge, 60 paper | `RESEARCH.techs.ledgers` |
| Off-duty soldier food | 0.5 × a forager | `WAR.battle.offDuty` |

Open ideas, not built:

- A way to abandon a tile or outpost.
- More than one claiming party at a time, maybe from a perk.
- An achievement for holding the whole map.
- Only one party can claim at a time and the map is 40 × 24 tiles, so a full conquest takes many hours of auto-expansion; check that it feels like progress.
