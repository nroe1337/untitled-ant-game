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
- Expedition party size has a soft cap tied to a building: 5 plus 5 x the square root of Forager's rests,
  so each rest adds less (Nate, Nov 17: put it on a curve). Past the cap workers still
  go but add only a third of the usual loot. Prefer tying size or count limits to buildings like this over hard caps.
- Pacing (Nate, Nov 17): things should take longer but stay achievable. There is a lot of content, so prefer
  spreading it out (and locking some of it behind nuptial flights) over letting it all open in the first colony.
- Each early age converges on one gate research (`RESEARCH.gates`: Upward tunnels, Mapping, Royal court). Nothing of the
  next age shows until it is learned, so the player starts each age with its key feature open (Nate, Nov 17).
  Optional side research is fine. Milestones should count buildings or deeds, not full stores.
- Start new bonuses small (e.g. 10% rather than 25% or 50%). It's easier to buff later than to nerf.
- Show Nate a mockup (an HTML page with a screenshot) of any new screen before coding it.
- Effect and UI text (what a crown, chamber or button does) stays short and plain: say what it does.
- Flavour text (the Chronicle, italic tab lines, story logs) keeps the game's existing voice. Write new flavour in the
  same style so the game stays consistent; Nate will revise the wording himself later.
- Think outside the box: don't propose yet another way to make food easier or births faster. Upgrades that are
  just different routes to the same numbers make the game feel sloppy. A new mechanic should open a new decision
  or change how the colony behaves.
- Some variety should come from luck, not choice: the brood temperament is rolled for every colony after the first
  (never the same twice running) and nudges the best worker mix. Run-to-run variance like this must stay mild and never brick a run.
- Keep the first colony the same every time: run-to-run randomness (like temperament) starts after the first flight, so the
  early unfolding always feels good.

## Chamber reworks (Chamber craft)
- A rework is one-way and applies to every chamber of that type at once (ones dug later too). Never per chamber.
- Some reworks raise mould. The reworks of mould-fighting chambers (nurses' den, purification, midden, cistern...)
  must be strong enough to offset it when the player builds a balanced nest. Players design their own base, but
  can't ignore major mechanics like mould.
- Only chambers with a real idea get a rework; there is no target count. Data: `NEST.reworks` and `NEST.rw` in balance.ts.
- Reworks have three levels (I, II, III), gated by chambers of that type (3, 8, 15). Level I is the rule change; II and III
  are mostly rate bonuses on it, with a few of the coolest rule changes kept (Nate, Nov 17). II and III are paid in parts
  (3 and 8, each the size of level I's cost) so their totals can exceed storage caps (`NEST.rework.parts`).
- Each level must look clearly bigger and busier in the cross-section, like an RTS building upgrade: more colour,
  more detail, more animation at higher levels. Never a shared outline; each chamber type gets its own drawing.

## Castes
- Castes work by posts (`CASTES.posts`): a caste is a few scarce ants, and upgrades open new places for them to stand
  rather than making them stronger. New castes should follow this: a small pool, a home post, and posts in other tabs.
- Stay on theme: grounded ant-colony mechanics, not sci-fi oddities, until the far end of the game calls for them.

## Wonders
- A wonder is a choice that changes how a colony plays, not a buff to tick off: one per colony, with a price that never
  goes away. Getting a blueprint should feel like an achievement (a special place, with visible bad luck protection).
- Levels must be big steps (a new rule each), and hard to earn, so there is lots of colony replay value. Nate set the
  level goals at 3x the first draft; tone down only if he asks.
- Gate the next prestige layer behind long-term goals like a max-level wonder, and say so in the game: the Wonder tab,
  the Migration tab and the Guide all tell the player that levelling wonders matters.
- Keep the Guide easy to read. When an age page gets long, move the detail into a topic page and leave a pointer.

## Raids
- Raids are an ongoing system you manage, not a ladder you beat (Nate, Nov 17): no visible wave counter. Strength comes from
  threat (colony size plus a slow creep with time) x luck x bait (`WAR.threat`, `WAR.raidKinds`, `WAR.bait`). Raids come on
  their own (a column marches across the Map first) and never stop; after the rival queen falls, wandering colonies raid.
- Once the player has a defence set up they can mostly leave it, but raids pay chitin, honours and chests, so effort is
  rewarded (heavy bait). Some raids should be big swings (the great warband) that punish a nest that isn't well prepared,
  without bricking a run (losses stay capped).

## Strongholds
- Three fortress tiles on the Map (`WAR.strongholds`): each has its own catch when attacked, not just more strength, and
  each works only while 2 majors man it. New war objectives should follow this: a different way to take it, and a rule
  that scarce ants switch on, so the player can capture everything but chooses what is live.

## Code map
- `src/data/balance.ts`: all numbers, the core tech tree (`RESEARCH`) and milestones.
- `src/data/techs2.ts`: the wider tech tree, one row list per age.
- `src/systems/crowns`: the queen's eight crowns (Royal court). Crown data is `CROWNS` in balance.ts. They replaced the Royal care list.
- `src/systems/<name>/index.ts`: one system per tab or mechanic. `npm run build` type-checks and builds.

## Where things stand (Nov 14)
- Done and merged: research per age with hidden milestones, 64x64 map with outposts, the war batch and the rival
  queen boss, rumours and pack mules, tile wonders (PR #203), and the Swarm Spire batch (PR #204: stage gates,
  princess traits, scaffolding, pulley lines, weather watch, dowry, project bar). Spire choices were left out on purpose.
- Chamber reworks (Nov 17): Chamber craft is a Wings research shown at 90 chambers (moved from Conquest, Nate Nov 17). 10 reworks, 3 levels each (Infirmary,
  Draught shaft, Mould farm, Flood channel, Muster hall, Alarm scent, Gatehouse, Spoil walls, Seed bank, Hall of records).
- Brood temperament (`BROOD.temperaments` in balance.ts): each colony after the first rolls one at random. Keen job +15%,
  reluctant job -10%. Shown in a box on the Queen tab, a banner at the first worker, and tags on Jobs.
- Crowns (PR #208): Royal court opens the Crowns tab. The queen wears one of 8 crowns (chamber boosts, a rule, a drawback),
  levels 1-10 bought with jelly and kept through flights, 10 minute cooldown on changing. Placeholder art until Nate's sprites.
- Caste posts (PR #211) replaced the caste upgrade tracks. Still to do from that pitch: one new caste per later age
  (wire ants for Settlement, sun carriers for Industry, daughter queens for Network).
- Stronghold tiles: termite mound, wasp nest, antlion pits, with the majors' Garrison post. Tile art is 8x8, drawn in code (`SH_ART` in the map system).
- Map (Nov 17): 4 zoom levels (`MAP.zooms`, start 32x20) and a see-through minimap that folds away.
- Honey Vault (Nov 17): choosing it builds the vault; it rises by minutes living on vault food, not by idling with full stores.
- Wonders (Nov 17, `src/systems/wonders`, `WONDERS` in balance.ts): four ways of life (Thatch Mound, Bivouac, Honey Vault, Canopy).
  Blueprints come from the termite mound, the wasp nest (searched while manned), rumoured places and the rival queen.
  One wonder per colony, raised by its activity in three stages, 5 kept levels. The old tile wonders are gone; a few of
  their mod readers in war, nest, expeditions and brood are still in the code and read 0 (safe to delete).
- Migration now also needs one wonder at level 5, every blueprint and all three strongholds (`MIGRATION.needs`, migration system).
- The Guide has topic pages after the age pages (War, Castes, Wonders, Flights), opened by flags (`opens` in guide.ts).
- Cut for now (Nov 17): the Brood raiding and Nest guests research groups. They were flat bumps pointing at screens never built.
- Next up: Nate's week of playtesting, then the three new castes, the zoom-out steps, colony curses and the balance pass.
- Later ideas Nate liked: building the placeholder screens that techs point at (`screen` tags in techs2.ts),
  a balance playtest pass, and colony curses.
