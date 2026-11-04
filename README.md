# Formicarium (working title)

A gritty, minimalist incremental game about an ant colony that grows from one queen into a world-spanning swarm.

## Run it

```
npm install
npm run dev      # play at http://localhost:5173 with live reload
npm run build    # production build into dist/
npm run single   # also writes dist/formicarium-single.html (one file, share anywhere)
```

The `x1` button in the top bar toggles x10 game speed for testing.
In the browser console, `game.ctx` gives you everything, e.g. `game.ctx.res.add('soil', 100)`.

## How the code is organised

```
src/
  core/            the small, stable engine
    game.ts        loop (10 ticks/s), layout, tabs, autosave
    resources.ts   resource registry, caps, costs
    events.ts      event bus
    save.ts        localStorage save, export/import text
    ui.ts          buttons, progress bars, DOM helper
    types.ts       the GameSystem contract
  data/balance.ts  every tuning number in one place
  systems/         one folder per game system (plug-ins)
    brood/         the queen, eggs, larvae
    jobs/          worker assignment and food upkeep
    nest/          chambers and the nest view
    expeditions/   surface trips, trail viewer, trail upgrades
    map/           the garden map: fog, outposts, territory income
    war/           rival colony, raids (entrance auto-battle), fortifications, campaigns
    research/      the tech tree; techs set "tech:<id>" flags that gate everything else
    garden/        fungus beds, mould, fungus-fed larvae
    castes/        royal jelly and new kinds of ant (each caste unlocks a job)
    waters/        boats, crews and Oregon Trail style voyages
    lineage/       the nuptial flight (first prestige) and permanent perks
    index.ts       the list of active systems
  core/upgrades.ts leveled upgrades built from balance tables
  core/mods.ts     shared bonuses ("job:forager", "defence", "upkeep"...) any system can publish or read
  core/pixel.ts    flat pixel drawing helpers and the palette (no shading, no canvas text)
```

## Prestige (rebirth)

`ctx.rebirth()` starts a new colony. Every system's state is wiped except what its optional
`keep(ctx)` returns, and only flags that start with `legacy:` survive. Lineage keeps its perks;
the map keeps its territory.

## The mechanics map

`docs/mechanics-map.html` is an interactive diagram of how every system feeds the others,
with proposed systems drawn dashed. Open it in a browser. Keep it in step with the code.

## Adding or removing a system

Every system exports a `GameSystem` object (`init`, `tick`, `isUnlocked`, `panel`).
Systems never import each other. They share only resources, flags, events and `ctx.busy`.

- **Remove one:** delete its line in `src/systems/index.ts` (and its folder).
- **Add one:** copy a folder, rename it, and add it to the list.
