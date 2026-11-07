// All tuning numbers live here. Change these to rebalance; no logic in this file.
// Pacing goal: a slow burn you check on every so often (Kittens Game / Evolve speed),
// with many small upgrade levels (+2-3% each) instead of a few big jumps.

export const BROOD = {
  startFood: 0,             // the first colony starts with nothing: forage for the first eggs
  flightStartFood: 10,      // a colony founded by a nuptial flight lands with a little
  eggFoodCost: 2,           // food per egg the queen lays by hand
  layOpensAtFood: 4,        // Lay an egg appears once the stores first reach this (a few forages)
  layEggCooldown: 3,        // seconds between manual lays
  eggHatchTime: 30,         // seconds for an egg to become a larva
  larvaGrowTime: 40,        // seconds for a larva to become a worker
  larvaFoodPerSecond: 0.05, // each growing larva eats this much
  baseBroodCap: 4,          // max eggs + larvae before chambers
  nurseEggsPerSecond: 0.03, // each nurse lays this many eggs
  nurseTends: 3,            // eggs or larvae each nurse looks after
  queenTends: 4,            // the queen looks after this many herself
  untendedSpeed: 0.5,       // brood nobody looks after grows this fast
  healCap: 0.5,             // most Wound care can cut expedition worker losses
  forageClick: 1,           // food per manual forage
  forageCooldown: 2,
  royal: {
    // Small on purpose (+1% a level): prestige and later systems multiply these up over time.
    quicken:   { name: 'Warm brood',      desc: 'Eggs hatch {p} faster each level.',               per: 0.01, base: { food: 20 },           growth: 1.18, max: 25 },
    jelly:     { name: 'Rich feeding',    desc: 'Larvae grow {p} faster each level.',              per: 0.01, base: { food: 30 },           growth: 1.18, max: 25 },
    devotion:  { name: 'Devoted nurses',  desc: 'Nurses lay eggs {p} faster each level.',               per: 0.01, base: { food: 40, soil: 15 }, growth: 1.2,  max: 30, needs: 'chamber:brood' },
    clutch:    { name: 'Larger clutch',   desc: 'Each level adds {p} egg to every lay.', per: 1,   base: { food: 60 },           growth: 3,    max: 3, unit: 'flat' as const },
    plates:    { name: 'Chitin plates',   desc: 'Raider chitin armours the queen. Eggs hatch {p} faster each level.', per: 0.02, base: { chitin: 5 }, growth: 1.15, max: 50, needs: 'rival' },
    wounds:    { name: 'Wound care',      desc: 'Each nurse lowers the chance of losing workers on expeditions by {p} per level, down to half the base chance at most. Wounded champions also heal faster.', per: 0.004, base: { food: 80, resin: 2 }, growth: 1.3, max: 10, needs: 'surface' },
    longevity: { name: 'Royal rhythm',    desc: 'Each level, the queen lays {p} more eggs per second on her own.', per: 0.005, base: { seed: 6, resin: 1 }, growth: 1.3, max: 20, unit: 'flat' as const, needs: 'surface' },
  },
};

export const COLONY = {
  baseAntCap: 6,            // living space before tunnels
  /** The colony size the first nuptial flight aims for. Big research asks for a share of it (see RESEARCH pop). */
  targetColony: 300,
  antFoodPerSecond: 0.04,   // upkeep per adult ant (one forager feeds 3)
  starvingPenalty: 0.75,    // job output multiplier while food is 0
  starveFoodPerDeath: 4,    // unpaid food that costs one worker's life (very gradual)
  starveWarnSeconds: 90,    // warn when food will run out within this many seconds
  // Small on purpose (+1% a level): prestige and later systems multiply these up over time.
  techniques: {
    trails:   { name: 'Scent trails',        desc: 'Foragers gather {p} more food each level.',        per: 0.01,  base: { pheromone: 12 },          growth: 1.25, max: 40, needs: 'surface' },
    grit:     { name: 'Mandible grit',       desc: 'Diggers dig {p} more soil each level.',         per: 0.01,  base: { twig: 12 },               growth: 1.25, max: 40, needs: 'tech:sharedlabour' },
    stomach:  { name: 'Shared stomach',      desc: 'The colony eats {p} less food each level.',   per: -0.005, base: { seed: 12, food: 90 },     growth: 1.25, max: 30, needs: 'tech:sharedlabour' },
    marching: { name: 'Marching songs',      desc: 'Scouts make {p} more pheromone each level.',          per: 0.01,  base: { pheromone: 24, twig: 9 }, growth: 1.25, max: 30, needs: 'tech:worksongs' },
    lore:     { name: 'Oral tradition',      desc: 'Elders gather {p} more knowledge each level.',          per: 0.01,  base: { knowledge: 45, food: 30 }, growth: 1.25, max: 30 },
    craft:    { name: 'Tunnel craft',        desc: 'Chambers cost {p} less each level.', per: -0.01, base: { knowledge: 60, soil: 60 }, growth: 1.25, max: 25 },
    carrying: { name: 'Load bearing',        desc: 'Expeditions bring back {p} more loot each level.', per: 0.01,  base: { knowledge: 75, twig: 12 }, growth: 1.25, max: 30, needs: 'tech:worksongs' },
    drill:    { name: 'Drill and formation', desc: 'Soldiers fight {p} harder each level.', per: 0.01, base: { chitin: 6, food: 150 }, growth: 1.25, max: 40, needs: 'rival' },
  },
};

export const JOBS = {
  forager: { food: 0.12 },
  digger: { soil: 0.06 },
  scout: { pheromone: 0.02 },
  elder: { knowledge: 0.03 },
  leafcutter: { leaf: 0.08 },
  weaver: { silk: 0.015 },
};

export const NEST = {
  costGrowth: 1.3,          // default; each chamber can set its own growth
  /** Techs that make storage chambers hold more (Evolve-style shelving): tech id -> chambers it boosts by +50%. */
  storageTechs: { shelving: ['store', 'storeroom', 'silkroom'], songs: ['library'], lining: ['store', 'storeroom', 'silkroom', 'library'] } as Record<string, string[]>,
  storageBoost: 0.5,
  /** Research that adds a share to all living space from chambers (a colony of thousands needs these). */
  wideTunnels: 1,           // extra living space per tunnel once Wider tunnels is researched
  housingTechs: { deepgalleries: 0.25, vaults: 0.25, partitions: 0.5 } as Record<string, number>,
  surfaceAtChambers: 10,
  baseFoodCap: 40,
  baseSoilCap: 50,
  soilPerChamber: 4,        // every chamber stores a little soil; Storerooms hold far more
  /** Surface materials have small stores until you dig Storerooms (Evolve-style warehouses). */
  baseMaterialCap: { twig: 40, seed: 25, resin: 15, silk: 20 } as Record<string, number>,
  chambers: {
    tunnel:   { name: 'Tunnel',          base: { soil: 10 }, growth: 1.25,                     desc: '+3 living space',                         antCap: 3 },
    brood:    { name: 'Brood chamber',   base: { soil: 15, food: 10 }, growth: 1.28,           desc: '+4 brood space, +1 living space. Unlocks nurses', broodCap: 4, antCap: 1, needs: 'tech:brood' },
    store:    { name: 'Food store',      base: { soil: 20 }, growth: 1.3,                     desc: '+30 food storage',                        foodCap: 30, needs: 'tech:storage' },
    storeroom:{ name: 'Storeroom',       base: { soil: 25, food: 10 }, growth: 1.3,           desc: '+40 soil, +25 twig, +15 seed and +10 resin storage', soilCap: 40, matCap: { twig: 25, seed: 15, resin: 10 }, needs: 'tech:storage' },
    silkroom: { name: 'Silk loft',       base: { soil: 45, leaf: 10 }, growth: 1.3,           desc: '+30 silk storage',                        matCap: { silk: 30 }, needs: 'caste:weaver' },
    granary:  { name: 'Seed granary',    base: { soil: 40, seed: 6 }, growth: 1.3,            desc: '+0.05 food/s',       foodRate: 0.05, needs: 'tech:seeds' },
    gallery:  { name: 'Resin gallery',   base: { soil: 60, resin: 4, twig: 8 }, growth: 1.3,  desc: '+8 living space, +60 food storage',       antCap: 8, foodCap: 60, needs: 'tech:resin' },
    gland:    { name: 'Scent chamber',   base: { soil: 35, pheromone: 8 }, growth: 1.3,       desc: '+15 pheromone storage, scouts +5% speed',  pheroCap: 15, scout: 0.05, needs: 'tech:scouting' },
    barracks: { name: 'Guard post',      base: { soil: 60, twig: 10 }, growth: 1.3,           desc: '+2 nest defence, +3 living space',        defence: 2, antCap: 3, needs: 'tech:martial' },
    husks:    { name: 'Hall of husks',   base: { soil: 50, chitin: 6 }, growth: 1.3,          desc: '+6 living space, +2 nest defence', antCap: 6, defence: 2, needs: 'tech:husks' },
    library:  { name: 'Hall of elders',  base: { soil: 30, food: 20 }, growth: 1.32,           desc: '+40 knowledge storage, elders +5% speed', knowCap: 40, elder: 0.05, needs: 'tech:elders' },
    fungus:   { name: 'Fungus garden',   base: { soil: 40, leaf: 20 }, growth: 1.3,           desc: '+1 fungus bed, +20 fungus storage',      fungusCap: 20, needs: 'tech:fungus' },
    harbour:  { name: 'Harbour',         base: { soil: 80, twig: 20, resin: 6 }, growth: 1.6,  desc: '+1 boat at a time (max 3)', boats: 1, max: 3, needs: 'tech:rafts' },
    waxworks: { name: 'Wax store',       base: { soil: 40, wax: 5 }, growth: 1.3,             desc: '+40 wax storage',                         waxCap: 40, needs: 'tech:husbandry' },
    hall:     { name: 'Worker hall',     base: { soil: 120, twig: 15 }, growth: 1.3,           desc: '+12 living space',  antCap: 12, needs: 'tech:halls' },
    midden:   { name: 'Midden',          base: { soil: 50, food: 30 }, growth: 1.3,           desc: '-2% food upkeep (max 15)',    upkeep: 0.02, max: 15, needs: 'tech:sanitation' },
    // ---- more chambers: each feeds one part of the game, and each unlocks with its research ----
    spoil:     { name: 'Spoil heap',       base: { soil: 25 }, growth: 1.3,                     desc: 'Diggers +4% soil', mods: { 'job:digger': 0.04 }, max: 15, needs: 'chambers:5' },
    rest:      { name: "Forager's rest",   base: { soil: 30, food: 15 }, growth: 1.3,           desc: 'Foragers +4% food', mods: { 'job:forager': 0.04 }, max: 15, needs: 'chambers:6' },
    warmth:    { name: 'Warming chamber',  base: { soil: 40, food: 20 }, growth: 1.32,          desc: 'Brood grows 3% faster', mods: { brood: 0.03 }, max: 15, needs: 'tech:brood' },
    cistern:   { name: 'Dew cistern',      base: { soil: 50, twig: 6 }, growth: 1.3,            desc: '+0.02 food/s', foodRate: 0.02, needs: 'tech:surface' },
    twigloft:  { name: 'Twig loft',        base: { soil: 50, twig: 5 }, growth: 1.3,            desc: '+50 twig storage', matCap: { twig: 50 }, needs: 'tech:surface' },
    seedvault: { name: 'Seed vault',       base: { soil: 45, seed: 5 }, growth: 1.3,            desc: '+40 seed storage', matCap: { seed: 40 }, needs: 'tech:seeds' },
    resinvat:  { name: 'Resin vat',        base: { soil: 55, resin: 4 }, growth: 1.3,           desc: '+25 resin storage', matCap: { resin: 25 }, needs: 'tech:resin' },
    memory:    { name: 'Memory vault',     base: { soil: 80, food: 40, resin: 4 }, growth: 1.32, desc: '+80 knowledge storage, elders +3% speed', knowCap: 80, mods: { 'job:elder': 0.03 }, needs: 'tech:songs' },
    nursery:   { name: 'Royal nursery',    base: { soil: 60, food: 40 }, growth: 1.32,          desc: '+6 brood space', broodCap: 6, needs: 'tech:royal' },
    chartroom: { name: 'Chart room',       base: { soil: 60, pheromone: 15 }, growth: 1.32,     desc: 'Expeditions +3% loot', mods: { expLoot: 0.03 }, max: 15, needs: 'tech:cartography' },
    training:  { name: 'Training ground',  base: { soil: 80, chitin: 4 }, growth: 1.32,         desc: 'Soldiers +3% strength', mods: { soldierPower: 0.03 }, max: 20, needs: 'tech:martial' },
    armory:    { name: 'Chitin armory',    base: { soil: 70, chitin: 8, twig: 15 }, growth: 1.32, desc: '+1 nest defence, soldiers +2% strength', defence: 1, mods: { soldierPower: 0.02 }, needs: 'tech:fortify' },
    sporecellar:{ name: 'Spore cellar',    base: { soil: 50, fungus: 15 }, growth: 1.3,         desc: '+30 fungus storage, brood grows 2% faster', fungusCap: 30, mods: { brood: 0.02 }, needs: 'tech:fungus' },
    stable:    { name: 'Aphid stable',     base: { soil: 60, food: 40 }, growth: 1.32,          desc: 'Herds +3% yield', mods: { herdYield: 0.03 }, max: 20, needs: 'tech:husbandry' },
    boatshed:  { name: 'Boat shed',        base: { soil: 70, twig: 20 }, growth: 1.35,          desc: 'Voyages +4% speed', mods: { voyageSpeed: 0.04 }, max: 10, needs: 'tech:rafts' },
    den:       { name: "Champion's den",   base: { soil: 60, chitin: 5 }, growth: 1.35,         desc: 'Champion +4% attack', mods: { champAtk: 0.04 }, max: 15, needs: 'tech:hunting' },
    pantry:    { name: 'Crumb pantry',     base: { soil: 80, crumbs: 10 }, growth: 1.3,         desc: '+80 food storage', foodCap: 80, needs: 'tech:townlore' },
    paperhall: { name: 'Paper hall',       base: { soil: 150, paper: 10 }, growth: 1.32,        desc: '+10 living space', antCap: 10, needs: 'tech:papercraft' },
  },
};

export const EXPEDITIONS = {
  minParty: 3,
  lossShare: 0.3,           // a bad trip loses 1 up to this share of the party
  /** tile: where on the map this place is, as an offset from the nest.
   *  loss: chance a trip loses workers, 1 up to lossShare of the party (2.5x wipe near home, flattening to 80% at the hedge); wipe: chance it loses the whole party (before Homing instinct and Scouts ahead). */
  destinations: [
    { id: 'grass',  name: 'The near grass',         time: 90,   unlockMarks: 0,   tile: [2, -1], loss: 0.25, wipe: 0.1, loot: { food: [4, 8], twig: [1, 2] } },
    { id: 'leaf',   name: 'Under the old leaf',     time: 180,  unlockMarks: 5,   tile: [3, 3],  loss: 0.375, wipe: 0.15, loot: { food: [6, 12], seed: [1, 3], resin: [0, 1] } },
    { id: 'stump',  name: 'The rotten stump',       time: 360,  unlockMarks: 18,  tile: [6, -3], loss: 0.52, wipe: 0.22, loot: { twig: [3, 6], resin: [1, 2], seed: [1, 2] } },
    { id: 'stream', name: 'The stream bank',        time: 600,  unlockMarks: 50, tile: [10, 1], loss: 0.64, wipe: 0.3, loot: { seed: [2, 5], food: [10, 18], pheromone: [2, 4] } },
    { id: 'patio',  name: 'The edge of the stones', time: 900,  unlockMarks: 110, tile: [12, -2], loss: 0.73, wipe: 0.38, loot: { food: [20, 35], resin: [2, 4] } },
    { id: 'hedge',  name: 'Under the far hedge',    time: 1500, unlockMarks: 200, tile: [20, -6], loss: 0.8, wipe: 0.48, loot: { twig: [8, 14], seed: [5, 9] } },
  ],
  lootPerAnt: 0.15,         // loot multiplier per ant beyond the minimum party
  /** One trail mark per this many seconds of a place's base trip time, so long trips pay as well as short ones. */
  secondsPerMark: 90,
  rareChance: 0.05,         // chance of a rare find (amber)
  markTrailCost: { pheromone: 5 },  // spend to make the next trip 30% shorter
  markTrailCut: 0.3,
  revealRadius: 2,
  upgrades: {
    mandibles: { name: 'Stronger mandibles', desc: 'Expeditions bring back {p} more loot each level.',     per: 0.03,  base: { trailmark: 6 },  growth: 1.25, max: 40, needs: 'marks:7' },
    feet:      { name: 'Sure feet',          desc: 'Expeditions take {p} less time each level.',     per: -0.02, base: { trailmark: 9 },  growth: 1.25, max: 25, needs: 'marks:10' },
    instinct:  { name: 'Homing instinct',    desc: 'The chance of losing workers on a trip drops by {p} each level.', per: -0.03, base: { trailmark: 6 }, growth: 1.25, max: 20, needs: 'marks:7' },
    scouts:    { name: 'Scouts ahead',       desc: 'The chance of losing a whole party drops by {p} each level.', per: -0.0625, base: { trailmark: 15 }, growth: 1.3, max: 8, needs: 'marks:17' },
    eyes:      { name: 'Keen antennae',      desc: 'Rare finds are {p} more likely each level.', per: 0.05, base: { trailmark: 15 }, growth: 1.25, max: 20, needs: 'marks:17' },
    memory:    { name: 'Trail memory',       desc: 'Parties set out again by themselves', per: 1,     base: { trailmark: 75 }, growth: 1,    max: 1, unit: 'flat' as const, needs: 'marks:69' },
    columns:   { name: 'Second column',      desc: 'Each level lets {p} more party be out at the same time.',      per: 1,     base: { trailmark: 120 }, growth: 3,    max: 2, unit: 'flat' as const, needs: 'marks:115' },
  },
  rivalAfterRuns: 6,
};

export const MAP = {
  cols: 40,
  rows: 24,
  nest: [7, 13] as [number, number],
  rival: [32, 5] as [number, number],
  spider: [31, 19] as [number, number],
  startReveal: 2,
  claimCost: { food: 40, twig: 4 },
  claimStep: 0.08,          // each tile held past the start makes the next claim 8% of the base dearer (linear, so the whole map stays in reach)
  startTiles: 9,
  claimParty: 3,            // workers who go out to claim a tile; they come home when it's done
  claimTime: 20,            // seconds for a claiming trip, plus claimTimePerTile per tile of distance from the nest
  claimTimePerTile: 4,
  /** Outposts: built on a tile you hold, with resources only. Dear, and dearer each time. */
  outpost: { cost: { soil: 400, twig: 60, food: 500 }, step: 0.35, living: 6, defence: 2, yieldBoost: 2 },
  expandEvery: 4,           // seconds between claims when the colony expands on its own
  /** Outpost upgrades, bought per colony (they reset on a flight; the tiles don't). */
  upgrades: {
    lines: { name: 'Silk lines', desc: 'Silk lines and nets at every outpost. Outposts yield {p} more each level.', per: 0.05, base: { silk: 5 }, growth: 1.2, max: 20, needs: 'res:silk' },
  },
  /** Per-second output of each owned tile by terrain. */
  yield: {
    grass: { food: 0.03, twig: 0.0015 },   // fallen grass stems: a slow, steady trickle of twigs
    soil: { soil: 0.02, seed: 0.0008 },     // seeds blow in and lodge in bare ground
    stone: { resin: 0.001 },              // sap from the roots that run under the stones
    water: { pheromone: 0.008 },
    paved: { food: 0.08 },
  } as Record<string, Record<string, number>>,
  stoneDefence: 1,          // each stone tile adds this much nest defence
};

export const WAR = {
  // the rival colony
  rivalStartArmy: 25,
  rivalGrowthPerSecond: 0.01,
  rivalArmyPerTile: 6,      // rival max army = tiles * this
  // raids on your nest
  // raids only happen when the player provokes one
  provokeCooldown: 60,      // seconds to regroup before you can provoke again
  provokeCost: { pheromone: 6 },
  raidShare: 0.3,           // fraction of rival army that raids
  maxRaiders: 30,
  // the entrance battle (an auto-battler)
  battle: {
    laneLength: 300,
    raider:   { hp: 3, atk: 0.8, speed: 10, chitin: 1 },
    brute:    { hp: 12, atk: 2, speed: 6, chitin: 4 },  // a big rival soldier, from wave 3
    // wave n brings raiders = base + n * perWave, and one brute every bruteEvery waves
    wave: { base: 3, perWave: 1.5, bruteEvery: 3, clearBonus: 1, toughness: 1.08 }, // toughness: raider hp and bite x1.08 per wave past the first (compounding), so no defence keeps up forever // clearBonus: chitin per wave number on a clean win
    soldier:  { hp: 5, atk: 1 },
    worker:   { hp: 2, atk: 0.4 },   // rallied workers
    defenceDps: 0.3,                 // damage per second per point of nest defence (guard posts, stones, husks)
    guardRange: 120,
    rallyCooldown: 30,
    rallyMax: 8,                     // most workers that answer one rally
    chitinPerKill: 1,
    stealPerBreach: 0.04,            // fraction of food stolen per raider that gets in
    maxSteal: 0.2,                   // never more than this per raid
    offDuty: 0.5,                    // between fights, soldiers and majors hunt: this share of a forager's food each
    maxSoldierLoss: 0.25,            // never lose more than this share of soldiers per raid
  },
  fortifications: {
    thorns:  { name: 'Thorn barricade', desc: 'Raiders move {p} slower each level.',          per: 0.04, base: { twig: 10 },             growth: 1.2,  max: 15 },
    spitters:{ name: 'Acid spitters',   desc: 'Guard posts deal {p} more damage each level.', per: 0.05, base: { chitin: 3, resin: 1 },  growth: 1.2,  max: 30 },
    carapace:{ name: 'Hardened carapace', desc: 'Soldiers have {p} more health each level.',  per: 0.04, base: { chitin: 4 },            growth: 1.2,  max: 30 },
    plug:    { name: 'Entrance plug',   desc: 'Raiders that get in steal {p} less food each level.', per: -0.04, base: { soil: 40, resin: 2 }, growth: 1.25, max: 15 },
    plating: { name: 'Chitin plating',  desc: 'Soldiers fight {p} harder each level.', per: 0.02, base: { chitin: 6 }, growth: 1.12, max: 100 },
    alarm:   { name: 'Standing alarm',  desc: 'Workers rally by themselves when raiders come', per: 1, base: { chitin: 15, pheromone: 20 }, growth: 1, max: 1, unit: 'flat' as const },
  },
  // campaigns on the map
  campaignTime: 120,
  campaignLoss: 0.15,       // share of the army lost on a win (double on a loss)
  tileDefence: { rival: 1, spider: 1.6 } as Record<string, number>,
  spiderPower: 70,
  loot: {
    rival: { chitin: [2, 4], food: [10, 25] },
    spider: { venom: [1, 3], chitin: [3, 6] },
  } as Record<string, Record<string, [number, number]>>,
};

export const RESEARCH = {
  knowledgeCap: 30,
  elderKnowledge: 0.03,     // knowledge per elder per second
  appearAtWorkers: 3,       // the Research tab opens once you have this many workers
  /**
   * The tech tree. Each tech sets the flag "tech:<id>" when researched.
   * needs: other tech ids (all required). flag: an extra game flag required (e.g. "rival").
   * Other systems gate their jobs, chambers, upgrades and tabs on these flags.
   */
  techs: {
    digging:    { name: 'Tunnelling',        age: 'dirt', cost: { knowledge: 6 },                     needs: [],                      desc: 'Workers learn to dig. Unlocks Diggers and the Nest.' },
    storage:    { name: 'Storage chambers',      age: 'dirt', cost: { knowledge: 12, soil: 20 },          needs: ['digging'],             desc: 'Unlocks the Food store and the Storeroom.' },
    brood:      { name: 'Brood care',        age: 'dirt', cost: { knowledge: 15, food: 25 },          needs: ['digging'],             desc: 'Unlocks the Brood chamber and Nurses.' },
    royal:      { name: 'Royal court',       age: 'forage', cost: { knowledge: 300, food: 250 },       pop: 0.2, needs: ['seeds'],               desc: 'Unlocks Royal care upgrades for the queen. Worth it once the nest is big.' },
    elders:     { name: 'Elder memory',      age: 'dirt', cost: { knowledge: 25, soil: 35 },          needs: ['brood'],               desc: 'Unlocks the Hall of elders, which stores and speeds up knowledge.' },
    surface:    { name: 'Upward tunnels',    age: 'dirt', cost: { knowledge: 40, soil: 45 },          needs: ['storage', 'elders'],    desc: 'Diggers may break through to the surface once the nest has 10 chambers.' },
    widetunnels: { name: 'Wider tunnels',  age: 'forage', cost: { knowledge: 90, soil: 120 },         needs: ['surface'],             desc: 'Each Tunnel gives +1 more living space.' },
    shelving:   { name: 'Packed walls',      age: 'forage', cost: { knowledge: 150, soil: 220 },        needs: ['widetunnels'],  desc: 'Food stores, Storerooms and Silk lofts hold 50% more.' },
    songs:      { name: 'Memory songs',      age: 'forage', cost: { knowledge: 160, food: 180 },         needs: ['teaching', 'shelving'], desc: 'Halls of elders hold 50% more knowledge.' },
    lining:     { name: 'Resin lining',      age: 'forage', cost: { knowledge: 340, resin: 30 },        needs: ['resin', 'shelving', 'songs'], desc: 'Food stores, Storerooms, Silk lofts and Halls of elders hold another 50% more.' },
    teaching:   { name: 'Teaching',          age: 'dirt', cost: { knowledge: 50 },                    needs: ['elders'],              desc: 'Opens the Techniques tab.' },
    worksongs:  { name: 'Work songs',        age: 'forage', cost: { knowledge: 140, food: 120 },          needs: ['teaching', 'scouting'],  desc: 'Unlocks the Marching songs and Load bearing techniques.' },
    sharedlabour: { name: 'Shared labour',   age: 'forage', cost: { knowledge: 180, twig: 20 },           needs: ['worksongs', 'shelving'],  desc: 'Unlocks the Mandible grit and Shared stomach techniques.' },
    scouting:   { name: 'Trail scent',       age: 'forage', cost: { knowledge: 120, food: 120 },          pop: 0.06, needs: ['surface'],             desc: 'Unlocks Scouts, pheromone and the Scent chamber.' },
    seeds:      { name: 'Seed lore',         age: 'forage', cost: { knowledge: 180, seed: 12 },           needs: ['surface'],             desc: 'Unlocks the Seed granary.' },
    resin:      { name: 'Resin working',     age: 'forage', cost: { knowledge: 260, resin: 8 },          needs: ['seeds'],               desc: 'Unlocks the Resin gallery.' },
    deepgalleries: { name: 'Deep galleries', age: 'forage', cost: { knowledge: 280, soil: 240 },        pop: 0.2, needs: ['plans'],            desc: 'Chambers give 25% more living space.' },
    halls:      { name: 'Sleeping halls',    age: 'forage', cost: { knowledge: 360, twig: 40 },          pop: 0.27, needs: ['resin', 'deepgalleries'], desc: 'Unlocks the Worker hall: +12 living space each.' },
    vaults:     { name: 'Vaulted roofs',     age: 'forage', cost: { knowledge: 480, resin: 30, twig: 30 }, pop: 0.4, needs: ['halls', 'lining'],    desc: 'Chambers give 25% more living space.' },
    partitions: { name: 'Paper partitions',  age: 'settlement', cost: { knowledge: 500, paper: 45 },     pop: 1.0, needs: ['papercraft'],          desc: 'Chambers give 50% more living space.' },
    plans:      { name: 'Digging plans',     age: 'forage', cost: { knowledge: 240, soil: 200 },          needs: ['shelving'],             desc: 'A building queue with 2 slots. Queued chambers are dug as soon as you can afford them.' },
    studyplans: { name: 'Study plans',       age: 'forage', cost: { knowledge: 420, food: 300 },          needs: ['plans', 'songs'],      desc: 'A research queue with 2 slots. Queued research is learned as soon as you can afford it.' },
    ledgers:    { name: 'Work ledgers',      age: 'settlement', cost: { knowledge: 650, paper: 60 },    needs: ['papercraft', 'studyplans'], desc: 'An upgrade queue with 2 slots. Queued upgrades are bought as soon as you can afford them.' },
    frontier:   { name: 'Frontier sense',    age: 'forage', cost: { knowledge: 650, pheromone: 200 },    pop: 0.4, needs: ['cartography'], desc: 'Adds an "Expand on its own" option to the Map: a party sets out to claim the nearest tile whenever it can.' },
    sanitation: { name: 'Sanitation',        age: 'forage', cost: { knowledge: 200, soil: 160 },          needs: ['seeds', 'shelving'],   desc: 'Unlocks the Midden.' },
    cartography:{ name: 'Mapping',           age: 'forage', cost: { knowledge: 260, pheromone: 50 },    pop: 0.1, needs: ['worksongs'],            desc: 'Opens the Map. Send workers to claim land, and build outposts on it.' },
    martial:    { name: 'Mandible drill',    age: 'forage', cost: { knowledge: 300, food: 220 },         pop: 0.13, needs: ['surface'], flag: 'rival', desc: 'Unlocks Soldiers, the Guard post and the War tab.' },
    fortify:    { name: 'Fortification',     age: 'forage', cost: { knowledge: 450, twig: 45 },         needs: ['martial'],             desc: 'Unlocks Fortifications.' },
    husks:      { name: 'Husk masonry',      age: 'forage', cost: { knowledge: 480, chitin: 20 },        needs: ['fortify'],             desc: 'Unlocks the Hall of husks.' },
    fungus:     { name: 'Leaf culture',      age: 'forage', cost: { knowledge: 380, seed: 20 },           needs: ['seeds', 'sanitation'], flag: 'legacy:flown', desc: 'Unlocks Leafcutters, Fungus gardens and the Garden tab. Only a line that has flown knows how.' },
    castes:     { name: 'Caste lore',        age: 'forage', cost: { knowledge: 520, food: 350 },        pop: 0.33, needs: ['royal', 'seeds'],     desc: 'Royal jelly shapes larvae into new kinds of ant. Opens the Castes tab.' },
    rafts:      { name: 'Leaf rafts',        age: 'forage', cost: { knowledge: 520, leaf: 50, twig: 30 }, needs: ['fungus', 'cartography'],  desc: 'Opens the Waters tab: build boats and send them on voyages.' },
    flight:     { name: 'Winged queens',     age: 'forage', cost: { knowledge: 520, jelly: 18 },         pop: 0.5, needs: ['castes'],              desc: 'Young queens can grow wings. Opens the Lineage tab, where the colony builds the Swarm Spire for its first flight.' },
    hunting:    { name: 'The hunt',          age: 'forage', cost: { knowledge: 100, food: 120 },          needs: ['worksongs'], flag: 'legacy:flown', desc: 'Raise a champion to hunt the creatures of the surface. Opens the Hunts tab. Your champion is kept from colony to colony.' },
    galleons:   { name: 'Wax hulls',         age: 'forage', cost: { knowledge: 650, wax: 60 },          needs: ['rafts', 'husbandry'], desc: 'Wax-sealed galleons that can cross open water. Unlocks the Wax galleon and new voyages.' },
    husbandry:  { name: 'Herding',           age: 'forage', cost: { knowledge: 350, food: 200 },         needs: ['fungus'], flag: 'legacy:flown', desc: 'Keep herds of aphids and other small insects. Opens the Herds tab and the Herder job.' },
    townlore:   { name: 'Town ways',         age: 'settlement', cost: { knowledge: 200, food: 180 },    pop: 0.8, needs: ['cartography', 'shelving'], flag: 'legacy:migrated', desc: 'Learn the town: kitchens, walls, drains. Opens the Town tab and the Town forager job.' },
    tasting:    { name: 'Tasting',           age: 'settlement', cost: { knowledge: 300, crumbs: 70 },  needs: ['townlore'],            desc: 'Some food is poisoned. Tasters find it. Unlocks the Taster job.' },
    nightwork:  { name: 'Night work',        age: 'settlement', cost: { knowledge: 340, sugar: 35 },   needs: ['tasting'],            desc: 'Forage in the dark while the humans sleep. Choose working hours in the Town tab.' },
    pavement:   { name: 'Street fighting',   age: 'settlement', cost: { knowledge: 380, crumbs: 90 },  needs: ['nightwork', 'martial'], desc: 'Soldiers can clear pavement ants from town sites.' },
    papercraft: { name: 'Paper nests',       age: 'settlement', cost: { knowledge: 450, paper: 45 },   needs: ['tasting'],            desc: 'Chewed paper makes walls. Opens the study and satellite nests.' },
    metalwork:  { name: 'Iron dust',         age: 'settlement', cost: { knowledge: 700, grease: 35 },  needs: ['papercraft', 'pavement'], desc: 'Opens the shed, where iron filings lie in the oil.' },
    campaigns:  { name: 'Campaigning',       age: 'forage', cost: { knowledge: 700, chitin: 35 },       pop: 0.6, needs: ['husks', 'cartography'], desc: 'Soldiers can march on enemy tiles.' },
  } as Record<string, { name: string; age: string; cost: Record<string, number>; needs: string[]; flag?: string; pop?: number; desc: string }>,
  /** Ages organise the tech tree. Each prestige layer opens later ages. */
  ages: [
    { id: 'dirt', name: 'Age of Dirt', note: 'One queen in the dark soil, and her first brood.' },
    { id: 'forage', name: 'Age of Forage', note: 'The surface, the garden, and everything that lives in it.' },
    { id: 'settlement', name: 'Age of Settlement', note: 'Across the water: houses, walls, and humans.' },
    { id: 'industry', name: 'Age of Industry', note: 'Water wheels, beetle rail and workshops.' },
    { id: 'network', name: 'Age of Network', note: 'One colony across a continent.' },
    { id: 'orbital', name: 'Age of Orbit', note: 'Up.' },
  ],
};

/** Fungus farming. Beds come from the Fungus garden chamber. */
export const GARDEN = {
  leafCap: 60,
  fungusCap: 20,             // before chambers
  leafPerBed: 0.05,          // leaves each healthy bed eats per second
  fungusPerBed: 0.04,        // fungus each healthy bed makes per second
  mouldEvery: 1200,          // an untended bed catches mould about once per this many seconds
  spreadEvery: 400,          // a mouldy bed infects a neighbour about once per this many seconds
  bedsPerGardener: 2,        // each gardener keeps this many beds clean
  weedCooldown: 6,
  larvaFungus: 0.01,         // fungus each larva eats per second when there is fungus
  larvaReserve: 0.5,         // larvae only eat fungus above this share of fungus storage, so jelly can be saved for
  larvaBoost: 0.5,           // larvae fed fungus grow this much faster
  upgrades: {
    compost: { name: 'Leaf mulch',   desc: 'Fungus beds grow {p} more fungus each level.',  per: 0.03, base: { leaf: 30, fungus: 10 }, growth: 1.18, max: 30 },
    spores:  { name: 'Clean spores', desc: 'Mould strikes {p} less often each level.', per: 0.03, base: { fungus: 25, knowledge: 20 }, growth: 1.2, max: 25 },
  },
};

/** Castes: royal jelly turns larvae into new kinds of ant, each a new job. */
export const CASTES = {
  jellyCap: 20,
  chew: { cost: { food: 25 }, cooldown: 4 },  // manual: make 1 royal jelly from food (fungus-fed Jelly glands come with the Garden, after the first flight)
  replete: 12,               // food storage per replete
  major: { hp: 3, atk: 3 },  // a major has this many times a soldier's hp and bite
  types: {
    minim:   { name: 'Minims',   cost: { jelly: 3, fungus: 10 },  desc: 'Tiny gardeners. Unlocks the Gardener job, which keeps fungus beds free of mould.' },
    replete: { name: 'Repletes', cost: { jelly: 5, food: 40 },    desc: 'Living food jars. Unlocks the Replete job: each holds +12 food.' },
    major:   { name: 'Majors',   cost: { jelly: 8, chitin: 10 },  desc: 'Huge-headed fighters. Unlocks the Major job: each fights like 3 soldiers at the gate.' },
    weaver:  { name: 'Weavers',  cost: { jelly: 6, leaf: 30 },    desc: 'Larvae spin silk while weavers hold them. Unlocks the Weaver job and Silk.' },
  } as Record<string, { name: string; cost: Record<string, number>; desc: string }>,
  upgrades: {
    glands: { name: 'Jelly glands', desc: 'Each level, every nurse makes {p} royal jelly per second from fungus.', per: 0.001, base: { jelly: 4, fungus: 30 }, growth: 1.25, max: 20, unit: 'flat' as const },
  },
};

/** The nuptial flight: the first prestige. */
export const LINEAGE = {
  /**
   * The Swarm Spire: a wonder the colony builds before its flight (Civ style).
   * Each stage takes resources, carried in by hand or by Builders, then may need time to settle.
   * Sized for a colony of about 100-150 workers; the aim is a first flight at 6-8 hours.
   */
  wonder: {
    haul: 10,                // units carried per manual haul
    haulCooldown: 3,
    builderRate: 0.08,       // units each builder carries per second
    foodFloor: 0.4,          // builders never take food below this share of storage
    /** Where to find each held material, shown when the Spire is waiting on it. */
    sources: { twig: 'expeditions (the stump, the hedge) and grass tiles on the Map', resin: 'expeditions to the old leaf, the stump or the edge of the stones, and stone tiles on the Map', seed: 'Seed lore, expeditions and bare soil tiles on the Map', jelly: 'chewing it in the Castes tab' } as Record<string, string>,
    held: ['twig', 'resin', 'seed', 'silk', 'jelly'],  // what the Spire holds back from other purchases (see Lineage)
    stages: [
      { id: 'footing',    name: 'Foundation',        cost: { soil: 350 },                         time: 0,    desc: 'Pack a wide mound of soil above the nest.' },
      { id: 'galleries',  name: 'Galleries',         cost: { soil: 200, twig: 25, resin: 6 },   time: 0,    desc: 'Twig-ribbed galleries, sealed with resin, where the winged ones will wait.' },
      { id: 'nursery',    name: 'Royal nursery',     cost: { food: 500, seed: 30, jelly: 15 },    time: 0,    desc: 'Warm cells for the larvae chosen to be queens.' },
      { id: 'princesses', name: 'Winged princesses', cost: { jelly: 25, food: 300 },              time: 1200, desc: 'Royal jelly, and then time. The princesses grow and their wings harden.' },
      { id: 'spire',      name: 'Launch crown',      cost: { twig: 35, resin: 6, seed: 15 },    time: 0,    desc: 'A high crown at the top, where the winged ones climb out on the evening of the flight.' },
    ] as { id: string; name: string; cost: Record<string, number>; time: number; desc: string }[],
  },
  // lineage earned = sqrt(workers born) + techs researched + chambers / 10 + raid waves won / 2
  perks: {
    blood:   { name: 'Royal blood',    desc: 'Eggs hatch and larvae grow {p} faster each level.', per: 0.03, base: { lineage: 2 }, growth: 1.15, max: 50 },
    trails:  { name: 'Old trails',     desc: 'Foragers gather {p} more food each level.',     per: 0.03, base: { lineage: 2 }, growth: 1.15, max: 50 },
    memory:  { name: 'Deep memory',    desc: 'Elders gather {p} more knowledge each level.',       per: 0.03, base: { lineage: 3 }, growth: 1.15, max: 50 },
    digging: { name: 'Strong backs',   desc: 'Diggers dig {p} more soil each level.',      per: 0.03, base: { lineage: 2 }, growth: 1.15, max: 50 },
    line:    { name: 'Warrior line',   desc: 'Soldiers fight {p} harder each level.', per: 0.03, base: { lineage: 3 }, growth: 1.15, max: 50 },
    halls:   { name: 'Wide halls',     desc: 'Chambers give {p} more living space each level.', per: 0.04, base: { lineage: 3 }, growth: 1.2, max: 25 },
    plans:   { name: 'Master plans',   desc: 'Each level adds {p} slot to the building and research queues.', per: 1, base: { lineage: 4 }, growth: 1.35, max: 10, unit: 'flat' as const },
    swarm:   { name: 'Founding swarm', desc: 'Each new colony starts with {p} more workers per level.', per: 2, base: { lineage: 5 }, growth: 1.5, max: 10, unit: 'flat' as const },
  },
};

/** Boats and voyages. */
export const WATERS = {
  maxBoats: 3,
  boats: {
    raft:   { name: 'Leaf raft',  cost: { leaf: 20, twig: 6 },              crew: 3, hull: 3, speed: 1 },
    barque: { name: 'Bark boat',  cost: { twig: 25, resin: 8, silk: 10 },   crew: 5, hull: 6, speed: 1.5, needs: 'caste:weaver' },
    galleon:{ name: 'Wax galleon', cost: { twig: 50, resin: 15, silk: 25, wax: 30 }, crew: 8, hull: 10, speed: 2, needs: 'tech:galleons' },
  } as Record<string, { name: string; cost: Record<string, number>; crew: number; hull: number; speed: number; needs?: string }>,
  /** tile: where the voyage reveals the map, as an offset from the nest. */
  voyages: [
    { id: 'puddle', name: 'The puddle',      time: 90,  loot: { food: [10, 25], leaf: [5, 15] },               tile: [-3, 4] },
    { id: 'gutter', name: 'The gutter',      time: 240, loot: { twig: [3, 8], resin: [1, 3], food: [15, 30] }, tile: [-5, 7] },
    { id: 'stream', name: 'The stream',      time: 480, loot: { food: [30, 60], seed: [2, 5], amber: [0, 2] }, tile: [-6, 10], boat: 'barque' },
    { id: 'island', name: 'The pond island', time: 900, loot: { amber: [2, 5], resin: [4, 8], seed: [4, 8] },  tile: [10, 9], boat: 'barque',
      settle: { name: 'Island colony', yields: { resin: 0.01, seed: 0.01 } } },
    { id: 'reeds',  name: 'The far reeds',   time: 1200, loot: { leaf: [20, 40], twig: [6, 12] },             tile: [-6, 9], boat: 'barque',
      settle: { name: 'Reed colony', yields: { leaf: 0.06, twig: 0.01 } } },
    { id: 'lily',   name: 'The lily raft',   time: 1500, loot: { food: [40, 80], honeydew: [10, 20] },        tile: [16, 10], boat: 'galleon',
      settle: { name: 'Lily colony', yields: { food: 0.1, honeydew: 0.02 } } },
    { id: 'farshore', name: 'The far shore', time: 2400, loot: { food: [60, 120], amber: [4, 8] },          tile: [30, 4], boat: 'galleon', farshore: true },
  ] as { id: string; name: string; time: number; loot: Record<string, [number, number]>; tile: [number, number]; boat?: string; settle?: { name: string; yields: Record<string, number> }; farshore?: boolean }[],
  /** Founding a settlement across the water: the workers stay there for good. */
  settle: { cost: { food: 120, wax: 10 }, workers: 8 },
  eventChance: 0.7,          // chance a voyage meets one event on the way
};

/**
 * Scent archive: lifetime records across every colony. Each track earns tiers on its own as its
 * counter grows (thresholds double), and each tier is a small permanent bonus. No choices.
 * Accords automate something you did by hand: each opens at a milestone and is bought with Memory.
 */
export const ARCHIVE = {
  tracks: {
    brood:  { name: 'Brood',  what: 'workers born',          first: 50,  mod: 'brood',        per: 0.02,  bonus: 'eggs and larvae {p} faster' },
    earth:  { name: 'Earth',  what: 'chambers dug',          first: 20,  mod: 'chamberCost',  per: -0.01, bonus: 'chambers {p} cheaper' },
    lore:   { name: 'Lore',   what: 'techs learned',         first: 10,  mod: 'job:elder',    per: 0.02,  bonus: 'elders {p} better' },
    trails: { name: 'Trails', what: 'expeditions home',      first: 10,  mod: 'expLoot',      per: 0.02,  bonus: 'expedition loot {p}' },
    iron:   { name: 'Iron',   what: 'raid waves won',        first: 5,   mod: 'soldierPower', per: 0.02,  bonus: 'soldiers {p} harder' },
    tide:   { name: 'Tide',   what: 'voyages made',          first: 5,   mod: 'voyageSpeed',  per: 0.02,  bonus: 'voyages {p} faster' },
    hunt:   { name: 'Hunt',   what: 'champion kills',        first: 50,  mod: 'champAtk',     per: 0.02,  bonus: 'champion attack {p}' },
    wings:  { name: 'Wings',  what: 'nuptial flights',       first: 1,   mod: 'lineageGain',  per: 0.05,  bonus: 'lineage from flights {p}' },
    herd:   { name: 'Herd',   what: 'honeydew milked',       first: 100, mod: 'herdYield',    per: 0.02,  bonus: 'herds yield {p} more' },
  } as Record<string, { name: string; what: string; first: number; mod: string; per: number; bonus: string }>,
  growth: 2,       // each tier needs this many times the last
  maxTier: 20,
  /**
   * Accords: automations. Each one opens when a lifetime milestone is reached (shown with its progress),
   * then is bought once with Memory: 1 Memory for every archive tier your line has earned. Track ids are the ones above.
   */
  accords: [
    { id: 'habit',    track: 'wings',  n: 1,    cost: 2,  name: 'The queen\'s habit',  desc: 'The queen lays an egg on her own every 20 seconds.' },
    { id: 'basics',   track: 'earth',  n: 120,  cost: 3, name: 'Old knowledge',       desc: 'New colonies start knowing Tunnelling, Storage chambers and Brood care.' },
    { id: 'alarm',    track: 'iron',   n: 40,   cost: 3, name: 'Standing orders',     desc: 'Workers rally to the entrance by themselves during raids.' },
    { id: 'surface',  track: 'trails', n: 80,   cost: 4, name: 'Remembered sky',      desc: 'New colonies start knowing Upward tunnels and Trail scent.' },
    { id: 'decree',   track: 'brood',  n: 2500, cost: 3,  name: 'The queen\'s decree', desc: 'Set the colony\'s worker mix once in the Jobs tab, and new workers take jobs to match it.' },
    { id: 'plans',    track: 'wings',  n: 3,    cost: 4, name: 'Spire plans',         desc: 'The Swarm Spire\'s foundation is laid before you start.' },
    { id: 'elders',   track: 'lore',   n: 60,   cost: 5, name: 'Deep roots',          desc: 'New colonies also start knowing Elder memory, Royal court and Teaching.' },
    { id: 'call',     track: 'hunt',   n: 1500, cost: 5, name: 'The champion\'s call', desc: 'Your champion hunts much faster while you are away (+30% idle speed).' },
    { id: 'relaunch', track: 'tide',   n: 10,   cost: 5, name: 'Boats know the way',  desc: 'Boats set out again on their own when they come home.' },
    { id: 'garden',   track: 'wings',  n: 4,    cost: 5,  name: 'Old gardens',         desc: 'New colonies start knowing Leaf culture, with the Garden tab open from the first hour.' },
    { id: 'haul',     track: 'wings',  n: 5,    cost: 6, name: 'Many hands',          desc: 'Builders carry twice as much to the Swarm Spire.' },
    { id: 'founders', track: 'brood',  n: 8000, cost: 8, name: 'Seasoned founders',   desc: 'New colonies start with full food stores and three tunnels\' worth of soil.' },
  ],
};

/**
 * Genome: before each colony's queen settles, choose which genes she carries (one slot at first,
 * more as flights add up). A gene carried through a flight gains expression; at full expression it
 * becomes fixed in your line: always on, and its slot is free again. Every expression level also
 * gives a tenth of the gene's effect forever, so nothing carried is wasted.
 */
export const GENOME = {
  slotsAt: [0, 3, 6, 10],   // flights needed for slot 1, 2, 3, 4
  fixAt: 4,                 // expression needed to fix a gene
  partial: 0.1,             // share of the effect each expression level gives forever
  genes: {
    twins:   { name: 'Twin queens',    mod: 'brood',          value: 0.2,   desc: 'eggs and larvae +20%' },
    legs:    { name: 'Long legs',      mod: 'expLoot',        value: 0.15,  desc: 'expedition loot +15%' },
    acid:    { name: 'Formic acid',    mod: 'soldierPower',   value: 0.2,   desc: 'soldiers +20%' },
    eyes:    { name: 'Night eyes',     mod: 'job:forager',    value: 0.15,  desc: 'foragers +15%' },
    lean:    { name: 'Lean bodies',    mod: 'upkeep',         value: -0.08, desc: 'upkeep −8%' },
    heads:   { name: 'Broad heads',    mod: 'job:digger',     value: 0.15,  desc: 'diggers +15%' },
    memory:  { name: 'Old memory',     mod: 'job:elder',      value: 0.15,  desc: 'elders +15%' },
    fungal:  { name: 'Fungus-born',    mod: 'job:leafcutter', value: 0.2,   desc: 'leafcutters +20%' },
    sea:     { name: 'Sea legs',       mod: 'voyageSpeed',    value: 0.2,   desc: 'voyages +20% faster' },
    hunter:  { name: 'Hunter\'s blood', mod: 'champAtk',      value: 0.15,  desc: 'champion attack +15%' },
    shepherd:{ name: 'Shepherd\'s scent', mod: 'herdYield',   value: 0.15,  desc: 'herds yield +15%' },
    builder: { name: 'Mound-builders', mod: 'chamberCost',    value: -0.08, desc: 'chambers −8% cost' },
  } as Record<string, { name: string; mod: string; value: number; desc: string }>,
};

/** Husbandry: herds of small insects, kept for honeydew and wax. */
export const HUSBANDRY = {
  pastureBase: 8,           // room for pasture herds before you own grass tiles
  pasturePerTile: 4,        // each grass tile you own adds this much pasture
  cellarBase: 4,            // room for underground herds
  cellarPerChambers: 3,     // +1 cellar room per this many chambers
  honeydewCap: 80, waxCap: 40,
  herderTends: 6,           // animals each herder looks after
  untended: 0.3,            // untended animals give this share
  breed: 0.004,             // growth per animal per second when there's room
  drinkBelow: 0.3,          // workers drink honeydew when food falls below this share of storage
  drinkRate: 0.5,           // honeydew per second they drink at most
  drinkValue: 1.5,          // food per honeydew
  milk: { cooldown: 5, seconds: 20 },  // a manual milking collects this many seconds of yield
  predatorEvery: 1200,      // a predator finds the pasture about once per this many seconds
  predatorBite: 25,         // seconds between animals eaten
  predatorMax: 0.15,        // a predator leaves after eating this share of the pasture
  driveCooldown: 8, driveChance: 0.4, herderDrive: 0.004,
  predators: [
    { name: 'A ladybird', note: 'It works down the line of aphids, one after another.' },
    { name: 'A lacewing larva', note: 'It wears the empty skins of the aphids it has drained.' },
    { name: 'A wasp', note: 'It hovers, drops, and lifts away with something every time.' },
  ],
  species: {
    aphid:  { name: 'Green aphids',      room: 'pasture', capture: { food: 20 },                yields: { honeydew: 0.02 },                 unlock: 0,    desc: 'The first herd. Soft, slow, sweet.' },
    root:   { name: 'Root aphids',       room: 'cellar',  capture: { food: 30, soil: 20 },      yields: { honeydew: 0.012 },                unlock: 100,  desc: 'Kept underground on the roots. Predators never reach them.' },
    scale:  { name: 'Scale insects',     room: 'pasture', capture: { honeydew: 30 },            yields: { wax: 0.004 },                     unlock: 400,  desc: 'They barely move. They grow wax.' },
    mealy:  { name: 'Mealybugs',         room: 'pasture', capture: { honeydew: 60 },            yields: { honeydew: 0.01, wax: 0.003 },     unlock: 1000, desc: 'Fluffy with wax, and sweet as well.' },
    hopper: { name: 'Treehoppers',       room: 'pasture', capture: { honeydew: 80, fungus: 30 }, yields: { honeydew: 0.05 },                unlock: 2500, desc: 'Rich, but flighty: untended treehoppers give nothing and slowly wander off.' },
    blue:   { name: 'Blue caterpillars', room: 'cellar',  capture: { honeydew: 150, jelly: 10 }, yields: { jelly: 0.002 },                  unlock: 5000, desc: 'A butterfly caterpillar that sings like a queen. It makes a kind of royal jelly. At most 6.', max: 6 },
  } as Record<string, { name: string; room: 'pasture' | 'cellar'; capture: Record<string, number>; yields: Record<string, number>; unlock: number; desc: string; max?: number }>,
  upgrades: {
    sweet:  { name: 'Sweeter lines',  desc: 'Herds yield {p} more each level.',           per: 0.03,  base: { honeydew: 20, food: 20 },  growth: 1.2,  max: 30 },
    docile: { name: 'Docile lines',   desc: 'Each herder tends {p} more animals per level.', per: 1, base: { honeydew: 30, knowledge: 30 }, growth: 1.3, max: 10, unit: 'flat' as const },
    fences: { name: 'Thorn fences',   desc: 'Predators come {p} less often each level.',   per: 0.04,  base: { twig: 10, honeydew: 15 }, growth: 1.25, max: 15 },
    litters:{ name: 'Big litters',    desc: 'Herds breed {p} faster each level.',          per: 0.05,  base: { honeydew: 25 },           growth: 1.2,  max: 20 },
  },
};
