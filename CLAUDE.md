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
- Start new bonuses small (e.g. 10% rather than 25% or 50%). It's easier to buff later than to nerf.
- No filler (Nate, Nov 16): don't pitch "X is 5% faster" upgrades, or several mechanics that do the same job (more ways
  to make food or births easier). Don't drift into off-theme sci-fi either. Pitch grounded ant-colony mechanics that give
  the player a choice they would want to make.
- Castes work by posts (`CASTES.posts`): a caste is a few scarce ants, and upgrades open new places for them to stand
  rather than making them stronger. New castes should follow this: a small pool, a home post, and posts in other tabs.

## Process
- Mock up any new screen (HTML in the project files under `ant-game/mockups`, plus a screenshot) and show Nate before coding it.
- Keep player-facing text short and plain.

## Code map
- `src/data/balance.ts`: all numbers, the core tech tree (`RESEARCH`) and milestones.
- `src/data/techs2.ts`: the wider tech tree, one row list per age.
- `src/systems/<name>/index.ts`: one system per tab or mechanic. `npm run build` type-checks and builds.

## Where things stand (Nov 14)
- Done and merged: research per age with hidden milestones, 64x64 map with outposts, the war batch and the rival
  queen boss, rumours and pack mules, tile wonders (PR #203), and the Swarm Spire batch (PR #204: stage gates,
  princess traits, scaffolding, pulley lines, weather watch, dowry, project bar). Spire choices were left out on purpose.
- In review: caste posts (replaces the caste upgrade tracks). Still to do from that pitch: one new caste per later age
  (wire ants for Settlement, sun carriers for Industry, daughter queens for Network) and a siege post for majors with stronghold tiles.
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
