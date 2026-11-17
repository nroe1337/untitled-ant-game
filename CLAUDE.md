# Formicarium (ant colony incremental)

Standing instructions from Nate for anyone working on this game. Keep this file up to date: when Nate gives a
new standing rule in a thread, add it here in the same pull request.

## Working rules
- Propose design changes to Nate briefly before implementing them, unless he has already said what to build.
- Keep the in-game Guide (`src/data/guide.ts`, one page per age) in step with any change to an age's research,
  chambers or flow. It doesn't need to be detailed, but it must match the game.

## Research design
- Research should change how the colony works: new behaviours, choices, automation, rule changes, new
  interactions. Avoid research that only adds a flat percentage (+forage, +brood). A stat bump is fine only
  when paired with something interesting. Cut research that isn't needed; there is no target count per age.
- New research appears through hidden milestones (`RESEARCH.milestones` in `src/data/balance.ts`): it stays
  out of sight until the colony has done something (chambers dug, workers born, stores filled, expeditions
  run, tiles held, raids fought...). Use this for every age. Once seen, a research stays seen.
- Avoid micromanagement: automated systems (war, expeditions) stay automated. Don't force over-preparation.
- Prefer additive progress over forced choices (e.g. on the Map the player should be able to capture everything).
- Don't let research automate away a major milestone that is itself an automation reward (e.g. Trail memory).
- Expedition party size has a soft cap tied to a building: 20 plus 10 per Forager's rest. Past the cap workers still
  go but add only a third of the usual loot. Prefer tying size or count limits to buildings like this over hard caps.
- Start new bonuses small (e.g. 10% rather than 25% or 50%). It's easier to buff later than to nerf.
- Show Nate a mockup (an HTML page with a screenshot) of any new screen before coding it.
- Keep in-game text short and plain: say what it does, without flowery or wordy phrasing.
- Think outside the box: don't propose yet another way to make food easier or births faster. Upgrades that are
  just different routes to the same numbers make the game feel sloppy. A new mechanic should open a new decision
  or change how the colony behaves.
- Some variety should come from luck, not choice: the brood temperament is rolled for every colony (never the
  same twice running) and nudges the best worker mix. Run-to-run variance like this must stay mild and never brick a run.

## Code map
- `src/data/balance.ts`: all numbers, the core tech tree (`RESEARCH`) and milestones.
- `src/data/techs2.ts`: the wider tech tree, one row list per age.
- `src/systems/crowns`: the queen's eight crowns (Royal court). Crown data is `CROWNS` in balance.ts. They replaced the Royal care list.
- `src/systems/<name>/index.ts`: one system per tab or mechanic. `npm run build` type-checks and builds.

## Where things stand (Nov 14)
- Done and merged: research per age with hidden milestones, 64x64 map with outposts, the war batch and the rival
  queen boss, rumours and pack mules, tile wonders (PR #203), and the Swarm Spire batch (PR #204: stage gates,
  princess traits, scaffolding, pulley lines, weather watch, dowry, project bar). Spire choices were left out on purpose.
- Brood temperament (`BROOD.temperaments` in balance.ts): each colony rolls one at random. Keen job +15%, reluctant job -10%.
- Next up: **rethink wonders.** The current wonders (`src/systems/wonders`) are a stopgap. Nate wants a wonder to feel
  like a choice that changes how you play a colony, not another buff to check off, and getting the blueprint should
  feel like an achievement. The ideas so far are in the "Tile wonders: draft" doc
  (https://claude.ai/artifact/6ngZiwrfRrhgWYJam71nFJ), under "Rethink ideas":
  - Blueprints dropping from special places, with bad luck protection.
  - Building a wonder by doing its activity.
  - One wonder per colony.

  Nate hasn't picked a direction yet: ask him first.
- Later ideas Nate liked: building the placeholder screens that techs point at (`screen` tags in techs2.ts),
  a balance playtest pass, and colony curses.
