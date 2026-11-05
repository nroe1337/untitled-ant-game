# Formicarium handoff

Nov 4, 2026 · @Nate

## Where things stand

Formicarium is a browser incremental game: an ant colony that grows into world conquest. Everything from Round 2 is merged to `main`, and the prototype is playable in Claude.

| What | Where |
| --- | --- |
| Repo | [nroe1337/untitled-ant-game](https://github.com/nroe1337/untitled-ant-game), branch `main` (PRs #1, #2 and all of Round 2 merged; old branches deleted) |
| Playable prototype | [Formicarium artifact](https://claude.ai/artifact/DtGASvxYZaMg8ax4KnRGMh), built from `/mnt/project-files/ant-game/formicarium-prototype.html` |
| Mechanics map | [Mechanics map artifact](https://claude.ai/artifact/QJLLf6RSqAmvnRYMhbicy8), source `docs/mechanics-map.html` (copied to `/mnt/project-files/ant-game/mechanics-map.html`) |
| Earlier design docs | [Design doc](https://claude.ai/artifact/UJpwNF2EBe4rZfu9Ysv1uR), [New screens and mechanics](https://claude.ai/artifact/F1PDHiK1rZLsdKfmdpaC6v), [Map mockups](https://claude.ai/artifact/VohmRPqN1TqKCt9hmuMM3K) |
| Hosting | GitHub Pages wanted later, only once the game is much more complete |

Round 2 shipped every proposed system: the Swarm Spire wonder before the first flight, champion hunts, scent archive, genome, herds, the Waters expansion, migration with the town, and the supercolony continent. The last change in this thread makes home map tiles pay out only once the Map tab opens, so the start is fully manual. Players should hit Reset after updates that change state shapes.

## Nate's design rules

The aim is Celestial Incremental scale with an Evolve feel, drawn text-first and flat like Incremancer (solid colours, no shading). Claude writes most of the code. These rules come from Nate and hold unless he changes them:

- **Modular systems.** Every system can be lifted out on its own. Systems never import each other.
- **Slow burn.** Small upgrades (+2 to 3% per level, many levels). No snowballing.
- **Everything interlocks.** Every mechanic starts manual and gets automated later.
- **Nothing bad happens unnoticed.** Use alert banners, but keep the game from getting too active.
- **Problems hurt but don't ruin.** Raids are player-triggered and capped. Starvation is gradual. Predators and poison take a small share.
- **Research gates content,** Civ and Evolve style, grouped into ages.
- **The map is never lost** across prestiges.
- **Linear, not puzzly.** Prefer linear upgrade paths over many choices. "A little is fine but if it becomes micromanagey we've failed with that component."
- **Don't overwhelm.** Space new systems out; don't open several tabs at once.
- **Prestige scale.** The first nuptial flight should take 6 to 8 hours (Evolve's first MAD is 1 to 2 days). The colony should top out around 100 to 150 workers; managing 300 is too many (he dislikes that in Trimps). The flight is gated by a wonder, not a worker count.
- **Champion combat.** Very slow when idle, normal speed (about 5x) while actively using abilities. Loot should be interesting like NGU or WAMI, not just currencies.
- **Naming.** He rejected "Wedding Mound"; the wonder is the Swarm Spire. Avoid cartoony names ("boots and poison" was rejected).

## Architecture

TypeScript and Vite. Each system is a plug-in in `src/systems/<id>/index.ts`; `src/systems/index.ts` lists them, and that order is the tick and tab order. Systems talk only through the shared Context, never by importing each other.

| Piece | What it does |
| --- | --- |
| `GameSystem` (`src/core/types.ts`) | `{ id, init, tick, isUnlocked, panel { title, mount, update }, keep? }` |
| `ctx.res` (`core/resources.ts`) | Resources: define, amt, add, spend, cap, setCapBonus, rates |
| `ctx.flags` | Milestones such as `tech:<id>`, `caste:<id>`, `accord:<id>`, `surface`, `rival`. Only `legacy:*` flags survive a prestige |
| `ctx.mods` (`core/mods.ts`) | Shared bonuses by key and source, republished every tick. Keys in use: `job:<id>`, `upkeep`, `defence`, `soldierPower`, `chamberCost`, `expLoot`, `brood`, `larvaGrowth`, `queenLay`, `voyageSpeed`, `champAtk`, `lineageGain`, `herdYield`, `attention`, `boatSlots`, `tiles` |
| `ctx.busy` | Workers a system is using (expeditions, crews, outposts, champion); jobs subtracts them |
| `ctx.bus` | Events: `ant:born`, `expedition:return {dest, tile}`, `map:capture`, `champion:kill`, `loaded`, `newgame` |
| `ctx.alert(id, msg)` / `ctx.log` | Persistent banner for anything bad happening now / the chronicle |
| `ctx.rebirth()` | Prestige: each system's `keep()` decides what carries over, then the page reloads |
| `ctx.state[id]` | Each system's saved state |

Tuning numbers live in `src/data/balance.ts`, plus `src/data/champion.ts` and `src/data/town.ts`. Leveled upgrades come from `fromBalance()` and `upgradeList()` in `core/upgrades.ts`; buttons come from `actionButton()` in `core/ui.ts`; flat pixel canvases use `core/pixel.ts`. The `legacy:` flags are `legacy:flown`, `legacy:farshore`, `legacy:migrated` and `legacy:super`. A migration sets `state.migration.migrating`, which lineage's `keep()` reads to reset itself.

## Systems and when they open

Eighteen tabs, opened in this order. Times are from the bot on the first run (a person is slower).

| Tab (system id) | Opens | What it is |
| --- | --- | --- |
| The Queen (`brood`) | Start | Lay eggs, larvae, workers; forage button when hungry |
| Colony (`jobs`) | First worker | Jobs, upkeep, starvation, techniques (Teaching) |
| Research (`research`) | 3 workers | Tech tree grouped by age; current age banner |
| Nest (`nest`) | Tunnelling (\~4 min) | Chambers: caps, brood, defence, harbour, wax store |
| Surface (`expeditions`) | Upward tunnels + 10 chambers (\~30 min) | Parties to six destinations; trailmark upgrades |
| Map (`map`) | Mapping (\~2.5 h) | Tiles, outposts, territory yields (home tiles pay only from here) |
| War (`war`) | Mandible drill (\~2.5 to 3 h) | Provoked raid waves, fortifications, campaigns |
| Garden (`garden`) | Leaf culture | Fungus beds, mould, weeding, larva feeding |
| Castes (`castes`) | Caste lore | Royal jelly; minims, repletes, majors, weavers |
| Waters (`waters`) | Leaf rafts | Raft, bark boat, wax galleon; voyage events; settlements; the far shore |
| Lineage (`lineage`) | Winged queens | Swarm Spire wonder (5 stages, Builder job), nuptial flight, lineage perks |
| Herds (`husbandry`) | Herding, after first flight | 6 species, pasture from owned tiles, herders, predators |
| Hunts (`champion`) | The hunt, after first flight | Champion, 5 grounds, 30 gear pieces in 5 sets, trophies, training |
| Archive (`archive`) | After first flight | 9 lifetime tracks, 10 accords that automate chores (counts the first colony, pays out after) |
| Genome (`genome`) | 2 flights | Genes carried per colony; expression fixes them |
| Migration (`migration`) | Far shore reached | Prestige 2: needs 3 flights since last + 3 settlements; Heritage perks |
| Town (`town`) | Town ways, after migrating | Sites, day/night shifts, attention, bait and poison, tasters, pavement ants, satellite nests |
| Continent (`supercolony`) | Iron dust (town) | Prestige 3: regions with roles, fronts (hold/push/raid), unity, laws |

The champion, archive, genome, map and continent are kept across every prestige.

## Pacing

The first flight is still too slow in the bot: Winged queens landed at about 7.5 hours, before the Spire was even started. The target is 5 to 6 hours for the bot (6 to 8 for a person).

| Bot run | Fungus | Castes | Winged queens | Spire | Note |
| --- | --- | --- | --- | --- | --- |
| Run 3 (latest costs) | 6h25 | 6h32 | 7h39 | stuck on stage 2 (twig, resin) | bot spent seeds, twigs and resin greedily |
| Run 2 | 3h03 | 5h02 | never | not started | flight cost above knowledge cap; archive paid out in colony 1 (both fixed) |
| Run 1 | 5h46 | 6h02 | 7h04 | stuck on stage 2 | before cost trims |

What holds it back: seeds, twigs and resin come only from expeditions, and the bot spends them on everything. The knowledge cap (30 + 40 per Hall of elders) also caps tech costs, so Winged queens is now 380. A fourth run, with a bot that saves rare materials, reached Fungus at 3h05, Castes at 3h41 and Winged queens at 6h49, then still stalled on Spire stage 2 at 10 hours. So the fix is in the game, not the bot: a steadier twig and resin source or cheaper Spire stages, and a faster path from Caste lore to Winged queens (jelly is slow). Champion pacing is tuned separately: with active play, boss 1 falls at about 80 minutes and boss 2 at about 3.5 hours, and idle play is far slower.

Costs to adjust live in `RESEARCH.techs` and `LINEAGE.wonder.stages` in `balance.ts`.

## Workflow

1. Clone: `/home/claude/untitled-ant-game` (attach the repo with `add_repo` first). `npm install`, then `npx tsc --noEmit` to type-check and `npm run single` to build `dist/formicarium-single.html` (everything inlined).
2. Publish the prototype: copy the build to `/mnt/project-files/ant-game/formicarium-prototype.html` and publish to the existing artifact URL. If the publish says the file changed, publish straight from `dist/`.
3. Test tools are saved in `/mnt/project-files/ant-game/tools/`:
   - `bot-firstrun.js`: Playwright bot that plays the first run at x60 for about 10 game hours and prints flag times. Point its `goto` at a copy of the build, and run it in the background (takes about 15 minutes).
   - `champsim.ts` + `stub.js`: headless champion fight sim. Bundle with `node_modules/.bin/esbuild champsim.ts --bundle --platform=node --inject:stub.js --outfile=cs.js`, then `node cs.js active` or `idle`.
   - `late.js`: unlocks every late system, plays briefly, screenshots every tab, and checks a rebirth.
   - `mm.js`: screenshots the mechanics map.
   - Run scripts from the scratchpad, never from `/mnt/project-files`, or screenshots land there.
4. GitHub: `gh pr create` fails (GraphQL blocked). Open PRs with `gh api repos/nroe1337/untitled-ant-game/pulls -f title=… -f head=… -f base=main -F body=@file`, then subscribe to the PR. Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`, and end messages with the session's Co-Authored-By and Claude-Session lines. Push with `-u`.
5. When systems change, update `docs/mechanics-map.html` (nodes `N`, edges `E`), copy it to project files, and republish the map artifact.
6. Project memory is off, so this doc is the memory.

## Open items

- [ ] Tune the first flight to 5 to 6 bot hours. The fourth bot run still stalled on Spire stage 2, so cut Spire stage 2 and 5 costs or add a steadier twig and resin source, and speed up jelly before Winged queens.
- [ ] Check that tabs open spaced out in the first run, per the "don't overwhelm" rule.
- [ ] Nate's afternoon playtest: gather his notes on the early game and the Spire.
- [ ] Playtest past the first flight (champion, archive, herds) with a save or the `late.js` setup; balance champion gear drops and herd numbers.
- [ ] Town and continent numbers are first guesses: attention rate, poison, front strength and unity rates need a long run.
- [ ] The archive logs one line per tier, so the first flight can print a burst of lines; consider one summary line.
- [ ] Later ages (Industry, Network, Orbital) exist only as names; Nate likes the idea of space-faring ants eventually.
- [ ] GitHub Pages hosting once the game is much more complete.
