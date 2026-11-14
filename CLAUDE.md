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

## Code map
- `src/data/balance.ts`: all numbers, the core tech tree (`RESEARCH`) and milestones.
- `src/data/techs2.ts`: the wider tech tree, one row list per age.
- `src/systems/<name>/index.ts`: one system per tab or mechanic. `npm run build` type-checks and builds.
