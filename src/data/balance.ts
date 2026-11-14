// All tuning numbers live here. Change these to rebalance; no logic in this file.
// Pacing goal: a slow burn you check on every so often (Kittens Game / Evolve speed),
// with many small upgrade levels (+2-3% each) instead of a few big jumps.
import { MORE_TECHS, type TechDef } from './techs2';

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
  /** Mould, a bad resource (from Brood care on). Every chamber in the nest adds a little; the queen and
   *  nurses scrub it away. The queen keeps up with 8 chambers, each nurse with 8 more (12 after Grooming).
   *  Mould slows the brood: speed = 1 / (1 + mould / half). Worse past each threshold below. */
  mould: { perRoom: 0.1, queenClean: 0.8, nurseClean: 0.8, groomedClean: 1.2, cap: 1000, half: 250,
    rot: 500, rotEvery: 30,           // 500+: an egg rots every 30 s
    spoil: 500, spoilShare: 0.004,    // 500+: food stores spoil, up to 0.4%/s at 1000
    weak: 750, weakMax: 0.3,          // 750+: workers fall sick and work up to 30% slower at 1000
    sick: 900, sickEvery: 60,         // 900+: a sick worker dies every 60 s
    scrubClick: 10, scrubCooldown: 0.5 }, // the Queen tab's Scrub button: always a way back
  healCap: 0.5,             // most Wound care can cut expedition worker losses
  /** Brood rhythm research: the Queen tab's pace for the larvae. grow multiplies growth speed, eat multiplies food eaten. */
  rhythm: {
    steady: { name: 'Steady', grow: 1, eat: 1, desc: 'Larvae grow and eat as usual.' },
    quick: { name: 'Quick', grow: 1.4, eat: 1.5, desc: 'Larvae grow 40% faster but eat 50% more.' },
    lean: { name: 'Lean', grow: 0.7, eat: 0.6, desc: 'Larvae eat 40% less but grow 30% slower.' },
  } as Record<string, { name: string; grow: number; eat: number; desc: string }>,
  rhythmCooldown: 15,       // seconds before the pace can be changed again
  forageClick: 1,           // food per manual forage
  forageCooldown: 2,
  royal: {
    // Two upgrades speed the brood up; the rest each do something different.
    quicken:   { name: 'Warm brood',      desc: 'Eggs hatch and larvae grow {p} faster each level.', per: 0.02, base: { food: 25 }, growth: 1.18, max: 30 },
    longevity: { name: 'Royal rhythm',    desc: 'Each level, the queen lays {p} more eggs per second on her own, and nurses lay 2% faster.', per: 0.005, base: { food: 40, seed: 4 }, growth: 1.25, max: 25, unit: 'flat' as const, needs: 'surface' },
    clutch:    { name: 'Larger clutch',   desc: 'Each level adds {p} egg to every lay.', per: 1,   base: { food: 60 },           growth: 3,    max: 3, unit: 'flat' as const },
    twins:     { name: 'Twin eggs',       desc: 'Each egg laid has a {p} chance to be two, each level.', per: 0.04, base: { food: 120, jelly: 2 }, growth: 1.35, max: 10, needs: 'tech:castes' },
    hardy:     { name: 'Hardy brood',     desc: 'Starving larvae keep growing at {p} of full speed each level, living off their fat.', per: 0.1, base: { food: 150, resin: 4 }, growth: 1.4, max: 5 },
    plates:    { name: 'Chitin plates',   desc: 'Raider chitin armours the queen. When nobody is left at the entrance she fights the raiders herself, with {p} health each level.', per: 15, base: { chitin: 5 }, growth: 1.15, max: 50, unit: 'flat' as const, needs: 'rival' },
    wounds:    { name: 'Wound care',      desc: 'Each nurse lowers the chance of losing workers on expeditions by {p} per level, down to half the base chance at most. Wounded champions also heal faster.', per: 0.004, base: { food: 80, resin: 2 }, growth: 1.3, max: 10, needs: 'surface' },
  },
};

export const COLONY = {
  /** Specialist jobs are limited by rooms: [chamber, slots per chamber, slots with none]. Foragers and diggers have no limit. */
  jobSlots: {
    soldier:    ['barracks', 4, 2],
    nurse:      ['brood', 3, 0],
    elder:      ['library', 3, 3],
    scout:      ['gland', 3, 2],
    leafcutter: ['fungus', 2, 2],
    gardener:   ['fungus', 2, 0],
    weaver:     ['silkroom', 3, 2],
    herder:     ['stable', 2, 2],
  } as Record<string, [string, number, number]>,
  baseAntCap: 6,            // living space before tunnels
  /** The colony size the first nuptial flight aims for. Big research asks for a share of it (see RESEARCH pop). */
  targetColony: 300,
  antFoodPerSecond: 0.04,   // upkeep per adult ant (one forager feeds 3)
  starvingPenalty: 0.75,    // job output multiplier while food is 0
  starveFoodPerDeath: 4,    // unpaid food that costs one worker's life (very gradual)
  starveWarnSeconds: 90,    // warn when food will run out within this many seconds
  starveWarnEvery: 15,      // the Chronicle repeats that warning at most this often (seconds)
  starveWarnAfter: 8,       // food must stay low this long before the Chronicle warns (ignores blips)
  // Small on purpose (+1% a level): prestige and later systems multiply these up over time.
  techniques: {
    trails:   { name: 'Scent trails',        desc: 'Foragers gather {p} more food each level.',        per: 0.03,  base: { pheromone: 24 },          growth: 1.6, max: 13, needs: 'surface' },
    grit:     { name: 'Mandible grit',       desc: 'Diggers dig {p} more soil each level.',         per: 0.03,  base: { twig: 24 },               growth: 1.6, max: 13, needs: 'tech:sharedlabour' },
    stomach:  { name: 'Shared stomach',      desc: 'The colony eats {p} less food each level.',   per: -0.015, base: { seed: 24, food: 180 },     growth: 1.6, max: 10, needs: 'tech:sharedlabour' },
    marching: { name: 'Marching songs',      desc: 'Scouts make {p} more pheromone each level.',          per: 0.03,  base: { pheromone: 48, twig: 18 }, growth: 1.6, max: 10, needs: 'tech:worksongs' },
    lore:     { name: 'Oral tradition',      desc: 'Elders gather {p} more knowledge each level.',          per: 0.03,  base: { knowledge: 90, food: 60 }, growth: 1.6, max: 10 },
    craft:    { name: 'Tunnel craft',        desc: 'Chambers cost {p} less each level.', per: -0.03, base: { knowledge: 120, soil: 120 }, growth: 1.6, max: 8 },
    carrying: { name: 'Load bearing',        desc: 'Expeditions bring back {p} more loot each level.', per: 0.03,  base: { knowledge: 150, twig: 24 }, growth: 1.6, max: 10, needs: 'tech:worksongs' },
    drill:    { name: 'Drill and formation', desc: 'Soldiers fight {p} harder each level.', per: 0.03, base: { chitin: 12, food: 300 }, growth: 1.6, max: 13, needs: 'rival' },
  },
};

export const JOBS = {
  forager: { food: 0.12 },
  digger: { soil: 0.06 },
  /** With Deep diggers, each digger also brings up this much clay a second. */
  diggerClay: 0.012,
  /** Buried finds research: each digger strikes something about once per this many seconds (Deep finds: 3x as often). */
  findEvery: 1000, deepFindMult: 3,
  finds: [
    { weight: 5, res: 'food', amt: [12, 25], text: 'A digger strikes a fat root. The colony eats.' },
    { weight: 3, res: 'soil', amt: [20, 40], text: 'A tunnel wall gives way into a loose pocket of soil.' },
    { weight: 2, res: 'seed', amt: [1, 3], text: 'A digger turns up a buried seed.' },
    { weight: 4, res: 'clay', amt: [10, 25], deep: true, text: 'Deep down, a digger breaks into a seam of soft clay.' },
    { weight: 2, res: 'chitin', amt: [2, 5], deep: true, text: 'A digger uncovers the shell of a long-dead beetle.' },
  ] as { weight: number; res: string; amt: [number, number]; deep?: boolean; text: string }[],
  clayCap: 200,
  scout: { pheromone: 0.02 },
  elder: { knowledge: 0.03 },
  leafcutter: { leaf: 0.08 },
  weaver: { silk: 0.015 },
};

export const NEST = {
  costGrowth: 1.3,          // default; each chamber can set its own growth
  /** Techs that make storage chambers hold more (Evolve-style shelving): tech id -> chambers it boosts by +50%. */
  /** Each storage chamber holds this much more than the one before it, so late ones keep pace with their cost. */
  /** Chamber craft: upgrade a whole kind of chamber. Costs clay plus that chamber's own late resource. */
  upgrade: { per: 0.15, max: 5, growth: 1.45, clay: 30, lateMult: 3, fallback: { knowledge: 120 } as Record<string, number>, minBuilt: 3, skip: ['harbour'] as string[] },
  storeGrowth: 1.08,
  storeGrowthIds: ['store', 'storeroom', 'library', 'memory', 'twigloft', 'seedvault', 'resinvat', 'silkroom', 'gland', 'pantry', 'sporecellar'] as string[],
  storageTechs: { shelving: ['store', 'storeroom', 'silkroom'], songs: ['library'], lining: ['store', 'storeroom', 'silkroom', 'library'] } as Record<string, string[]>,
  storageBoost: 0.5,
  /** Research that adds a share to all living space from chambers (a colony of thousands needs these). */
  wideTunnels: 1,           // extra living space per tunnel once Wider tunnels is researched
  housingTechs: { deepgalleries: 0.25, vaults: 0.25, partitions: 0.5 } as Record<string, number>,
  surfaceAtChambers: 10,
  baseFoodCap: 40,
  baseSoilCap: 50,
  soilPerChamber: 4,        // every chamber stores a little soil; Soil pits hold far more
  /** Surface materials have small stores until you dig Twig lofts, Seed vaults and Resin vats. */
  baseMaterialCap: { twig: 40, seed: 25, resin: 40, silk: 20 } as Record<string, number>,
  chambers: {
    tunnel:   { name: 'Resting chamber', base: { soil: 10 }, growth: 1.25,                     desc: '+3 living space',                         antCap: 3, later: { at: 13, cost: { knowledge: 15 } } },
    brood:    { name: "Nurses' den",     base: { soil: 30, food: 15 }, growth: 1.32,           desc: '+1 living space. Each nurse looks after 1 more egg or larva. The first unlocks nurses', antCap: 1, mods: { nurseTends: 1 }, max: 16, later: { at: 5, cost: { amber: 1 } }, needs: 'tech:brood' },
    store:    { name: 'Food store',      base: { soil: 20 }, growth: 1.3,                     desc: '+30 food storage',                        foodCap: 30, needs: 'tech:storage' },
    storeroom:{ name: 'Soil pit',        base: { soil: 25, food: 10 }, growth: 1.3,           desc: '+40 soil storage', soilCap: 40, needs: 'tech:storage' },
    silkroom: { name: 'Silk loft',       base: { soil: 45, leaf: 10 }, growth: 1.3,           desc: '+30 silk storage',                        matCap: { silk: 30 }, needs: 'caste:weaver' },
    granary:  { name: 'Seed granary',    base: { soil: 40, seed: 6 }, growth: 1.3,            desc: '+0.05 food/s',       foodRate: 0.05, later: { at: 8, cost: { resin: 4 } }, needs: 'tech:seeds' },
    gallery:  { name: 'Resin gallery',   base: { soil: 60, resin: 4, twig: 8 }, growth: 1.3,  desc: '+8 living space, +60 food storage',       antCap: 8, foodCap: 60, later: { at: 8, cost: { pheromone: 20 } }, needs: 'tech:resin' },
    gland:    { name: 'Scent chamber',   base: { soil: 35, pheromone: 8 }, growth: 1.3,       desc: '+15 pheromone storage, scouts +5% speed',  pheroCap: 15, scout: 0.05, later: { at: 8, cost: { seed: 4 } }, needs: 'tech:scouting' },
    barracks: { name: 'Guard post',      base: { soil: 60, twig: 20 }, growth: 1.3,           desc: '+2 nest defence, +3 living space',        defence: 2, antCap: 3, later: { at: 8, cost: { chitin: 4 } }, needs: 'tech:martial' },
    husks:    { name: 'Hall of husks',   base: { soil: 50, chitin: 6 }, growth: 1.3,          desc: '+6 living space, +2 nest defence', antCap: 6, defence: 2, later: { at: 8, cost: { clay: 6 } }, needs: 'tech:husks' },
    library:  { name: 'Hall of elders',  base: { soil: 30, food: 20 }, growth: 1.32,           desc: '+40 knowledge storage', knowCap: 40, needs: 'tech:elders' },
    fungus:   { name: 'Fungus garden',   base: { soil: 40, leaf: 20 }, growth: 1.3,           desc: '+1 fungus bed, +20 fungus storage',      fungusCap: 20, needs: 'tech:fungus' },
    harbour:  { name: 'Harbour',         base: { soil: 80, twig: 20, resin: 6 }, growth: 1.6,  desc: '+1 boat at a time (max 3)', boats: 1, max: 3, needs: 'tech:rafts' },
    waxworks: { name: 'Wax store',       base: { soil: 40, wax: 5 }, growth: 1.3,             desc: '+40 wax storage',                         waxCap: 40, needs: 'tech:husbandry' },
    hall:     { name: 'Worker hall',     base: { soil: 120, twig: 30 }, growth: 1.3,           desc: '+12 living space',  antCap: 12, later: { at: 8, cost: { pheromone: 25 } }, needs: 'tech:halls' },
    midden:   { name: 'Midden',          base: { soil: 50, food: 30 }, growth: 1.3,           desc: '-2% food upkeep (max 15)',    upkeep: 0.02, max: 15, later: { at: 7, cost: { chitin: 3 } }, needs: 'tech:sanitation' },
    // ---- more chambers: each feeds one part of the game, and each unlocks with its research ----
    spoil:     { name: 'Digging gallery',  base: { soil: 25 }, growth: 1.3,                     desc: 'Diggers +4% soil', mods: { 'job:digger': 0.04 }, max: 15, later: { at: 7, cost: { pheromone: 6 } }, needs: 'tech:surface' },
    rest:      { name: "Forager's rest",   base: { soil: 30, food: 15 }, growth: 1.3,           desc: 'Foragers +4% food', mods: { 'job:forager': 0.04 }, max: 15, later: { at: 7, cost: { pheromone: 8 } }, needs: 'tech:surface' },
    airshaft:  { name: 'Purification chamber', base: { soil: 30, food: 10 }, growth: 1.36,           desc: 'Fresh air purifies 0.6 mould/s (6 chambers worth)', mods: { mouldClean: 0.6 }, max: 25, later: { at: 7, cost: { resin: 3 } }, needs: 'tech:ventilation' },
    vent:      { name: 'Deep vent',        base: { soil: 400, clay: 6 }, growth: 1.18,          desc: 'Purifies 4 mould/s (40 chambers worth)', mods: { mouldClean: 4 }, max: 20, needs: 'tech:deepvents' },
    warmth:    { name: 'Warming chamber',  base: { soil: 15, food: 10 }, growth: 1.28,          desc: '+4 brood space, brood grows 1% faster', broodCap: 4, mods: { brood: 0.01 }, later: { at: 16, cost: { jelly: 2 } }, needs: 'tech:brood' },
    cistern:   { name: 'Dew cistern',      base: { soil: 50, twig: 6 }, growth: 1.3,            desc: '+0.02 food/s', foodRate: 0.02, needs: 'tech:surface' },
    twigloft:  { name: 'Twig loft',        base: { soil: 50, twig: 5 }, growth: 1.3,            desc: '+20 twig storage', matCap: { twig: 20 }, needs: 'tech:surface' },
    seedvault: { name: 'Seed vault',       base: { soil: 45, seed: 5 }, growth: 1.3,            desc: '+15 seed storage', matCap: { seed: 15 }, needs: 'tech:seeds' },
    resinvat:  { name: 'Resin vat',        base: { soil: 55, resin: 4 }, growth: 1.3,           desc: '+10 resin storage', matCap: { resin: 10 }, needs: 'tech:resin' },
    memory:    { name: 'Memory vault',     base: { soil: 80, food: 40, resin: 4 }, growth: 1.32, desc: '+60 knowledge storage, elders +5% speed', knowCap: 60, mods: { 'job:elder': 0.05 }, later: { at: 10, cost: { clay: 5 } }, needs: 'tech:songs' },
    nursery:   { name: 'Royal nursery',    base: { soil: 60, food: 40 }, growth: 1.32,          desc: '+6 brood space, +10 royal jelly storage', broodCap: 6, jellyCap: 10, later: { at: 6, cost: { jelly: 3 } }, needs: 'tech:royal' },
    chartroom: { name: 'Chart room',       base: { soil: 60, pheromone: 15 }, growth: 1.32,     desc: 'Expeditions +3% loot', mods: { expLoot: 0.03 }, max: 15, later: { at: 7, cost: { knowledge: 40 } }, needs: 'tech:cartography' },
    training:  { name: 'Training ground',  base: { soil: 80, chitin: 4 }, growth: 1.32,         desc: 'Soldiers +3% strength', mods: { soldierPower: 0.03 }, max: 20, later: { at: 8, cost: { chitin: 5 } }, needs: 'tech:martial' },
    armory:    { name: 'Chitin armory',    base: { soil: 70, chitin: 8, twig: 15 }, growth: 1.32, desc: '+1 nest defence, soldiers +2% strength', defence: 1, mods: { soldierPower: 0.02 }, needs: 'tech:fortify' },
    sporecellar:{ name: 'Spore cellar',    base: { soil: 50, fungus: 15 }, growth: 1.3,         desc: '+30 fungus storage, brood grows 2% faster', fungusCap: 30, mods: { brood: 0.02 }, needs: 'tech:fungus' },
    stable:    { name: 'Aphid stable',     base: { soil: 60, food: 40 }, growth: 1.32,          desc: 'Herds +3% yield', mods: { herdYield: 0.03 }, max: 20, needs: 'tech:husbandry' },
    boatshed:  { name: 'Boat shed',        base: { soil: 70, twig: 20 }, growth: 1.35,          desc: 'Voyages +4% speed', mods: { voyageSpeed: 0.04 }, max: 10, needs: 'tech:rafts' },
    den:       { name: "Champion's den",   base: { soil: 60, chitin: 5 }, growth: 1.35,         desc: 'Champion +4% attack', mods: { champAtk: 0.04 }, max: 15, needs: 'tech:hunting' },
    pantry:    { name: 'Crumb pantry',     base: { soil: 80, crumbs: 10 }, growth: 1.3,         desc: '+80 food storage', foodCap: 80, later: { at: 8, cost: { clay: 8 } }, needs: 'tech:townlore' },
    paperhall: { name: 'Paper hall',       base: { soil: 150, paper: 10 }, growth: 1.32,        desc: '+10 living space', antCap: 10, later: { at: 6, cost: { clay: 10 } }, needs: 'tech:papercraft' },
    clayhall:  { name: 'Clay hall',        base: { soil: 200, clay: 8 }, growth: 1.32,          desc: '+16 living space. Clay walls hold a big chamber up', antCap: 16, needs: 'tech:deepdig' },
  },
};

export const EXPEDITIONS = {
  minParty: 3,
  lossShare: 0.3,           // a bad trip loses 1 up to this share of the party
  /** tile: where on the map this place is, as an offset from the nest.
   *  loss: chance a trip loses workers, 1 up to lossShare of the party (2.5x wipe near home, flattening to 80% at the hedge); wipe: chance it loses the whole party (before Homing instinct and Scouts ahead). */
  destinations: [
    { id: 'grass',  name: 'The near grass',         time: 90,   unlockMarks: 0,   tile: [2, -1], loss: 0.25, wipe: 0.1, loot: { food: [4, 8], twig: [1.3, 2.6] } },
    { id: 'leaf',   name: 'Under the old leaf',     time: 180,  unlockMarks: 5,   tile: [3, 3],  loss: 0.375, wipe: 0.15, loot: { food: [6, 12], seed: [1, 3], resin: [0, 1] } },
    { id: 'stump',  name: 'The rotten stump',       time: 360,  unlockMarks: 18,  tile: [6, -3], loss: 0.52, wipe: 0.22, loot: { twig: [3.9, 7.8], resin: [1, 2], seed: [1, 2] } },
    { id: 'stream', name: 'The stream bank',        time: 600,  unlockMarks: 50, tile: [10, 1], loss: 0.64, wipe: 0.3, loot: { seed: [2, 5], food: [10, 18], pheromone: [2, 4], chitin: [0.3, 0.8] } },
    { id: 'patio',  name: 'The edge of the stones', time: 900,  unlockMarks: 110, tile: [12, -2], loss: 0.73, wipe: 0.38, loot: { food: [20, 35], resin: [2, 4] } },
    { id: 'hedge',  name: 'Under the far hedge',    time: 1500, unlockMarks: 200, tile: [20, -6], loss: 0.8, wipe: 0.48, loot: { twig: [10.4, 18.2], seed: [5, 9], chitin: [2, 4] } },
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
  startTiles: 1,            // the colony starts holding only the nest tile
  claimParty: 2,            // scouts who go out to claim a tile next to the nest; they come home when it's done
  claimScoutsPerTile: 0.5,  // extra scouts per tile of distance from the nest
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
  // the entrance battle (an auto-battler): one stack per kind of ant on each side, every ant bites every second
  battle: {
    pace: 0.35,                      // all bites are scaled by this, so a fight lasts long enough to watch
    raider:   { hp: 3, atk: 0.8, chitin: 1 },
    brute:    { hp: 12, atk: 2, chitin: 4 },  // a big rival soldier, from wave 3
    // wave n brings raiders = base + n * perWave, and one brute every bruteEvery waves
    wave: { base: 2.5, perWave: 1.5, bruteEvery: 3, clearBonus: 1, toughness: 1.08 }, // toughness: raider hp and bite x1.08 per wave past the first (compounding), so no defence keeps up forever // clearBonus: chitin per wave number on a clean win
    soldier:  { hp: 5, atk: 1 },
    worker:   { hp: 2, atk: 0.4 },   // rallied workers
    defenceDps: 0.3,                 // damage per second per point of nest defence (guard posts, stones, husks)
    rallyCooldown: 30,
    rallyMax: 8,                     // most workers that answer one rally
    rescuePerWorker: 0.06,           // each rallied worker at the entrance: this chance that a fallen soldier is carried home alive
    rescueMax: 0.5,
    queenAtk: 3,                     // the armoured queen's bite, when she fights at the entrance (Chitin plates)
    slipEvery: 1.5,                  // with nobody left at the entrance, a raider slips in this often (seconds)
    chitinPerKill: 1,
    stealPerBreach: 0.04,            // fraction of food stolen per raider that gets in
    maxSteal: 0.2,                   // never more than this per raid
    offDuty: 0.5,                    // between fights, soldiers and majors hunt: this share of a forager's food each
    maxSoldierLoss: 0.25,            // never lose more than this share of soldiers per raid
  },
  fortifications: {
    thorns:  { name: 'Thorn barricade', desc: 'Raiders bite {p} less each level, snagged on thorns.', per: 0.03, base: { twig: 10 },             growth: 1.2,  max: 15 },
    spitters:{ name: 'Acid spitters',   desc: 'Guard posts deal {p} more damage each level.', per: 0.05, base: { chitin: 3, resin: 1 },  growth: 1.2,  max: 30 },
    carapace:{ name: 'Hardened carapace', desc: 'Soldiers have {p} more health each level.',  per: 0.04, base: { chitin: 4 },            growth: 1.2,  max: 30 },
    plug:    { name: 'Entrance plug',   desc: 'Raiders that get in steal {p} less food each level.', per: -0.04, base: { soil: 40, resin: 2 }, growth: 1.25, max: 15 },
    plating: { name: 'Chitin plating',  desc: 'Soldiers fight {p} harder each level.', per: 0.02, base: { chitin: 6 }, growth: 1.12, max: 100 },
    husktiles: { name: 'Husk tiles',    desc: 'Spare husks line new walls. Chambers cost {p} less each level.', per: -0.01, base: { chitin: 60 }, growth: 1.15, max: 20 },
    sickles:   { name: 'Husk sickles',  desc: 'Foragers cut with old mandibles. They gather {p} more food each level.', per: 0.02, base: { chitin: 80 }, growth: 1.15, max: 25 },
    alarm:   { name: 'Standing alarm',  desc: 'Workers rally by themselves when raiders come', per: 1, base: { chitin: 15, pheromone: 20 }, growth: 1, max: 1, unit: 'flat' as const },
  },
  // war honours: earned by clearing waves and winning campaigns, spent on the honour upgrades below
  honours: {
    perWave: 1,            // per clean wave, plus 1 more for every 5 waves of depth
    perFive: 1,
    campaign: 3,           // per enemy tile taken (x3 for a home tile)
  },
  /** One-off rewards for the deepest wave cleared this colony. Each is given the moment the wave falls. */
  milestones: [
    { wave: 3,  id: 'hunt',    name: 'First blood',     desc: 'Soldiers hunt twice as well between fights.' },
    { wave: 5,  id: 'drums',   name: 'War drums',       desc: 'Unlocks Auto-provoke: the rival is lured again the moment it can be.' },
    { wave: 8,  id: 'feared',  name: 'Feared',          desc: 'Rivals give your trails a wide berth. Expeditions lose 20% fewer workers.' },
    { wave: 10, id: 'scent',   name: 'Conquered scent', desc: 'Claiming map tiles costs 15% less.' },
    { wave: 13, id: 'spoils',  name: 'Spoils of war',   desc: 'Campaigns bring back twice the loot.' },
    { wave: 16, id: 'maps',    name: 'Captured maps',   desc: 'Prisoners give up their trails. The whole rival territory is revealed on the Map.' },
    { wave: 20, id: 'legend',  name: 'Legend of the line', desc: 'Lineage from flights +10%.' },
    { wave: 25, id: 'endless', name: 'Endless war',     desc: 'Every wave cleared gives double honours.' },
  ],
  honourUps: {
    standards: { name: 'Battle standards', desc: 'Soldiers fight {p} harder each level.', per: 0.04, base: { honour: 2 }, growth: 1.25, max: 25 },
    harvest:   { name: 'Husk harvest',     desc: 'Raiders leave {p} more chitin each level.', per: 0.1, base: { honour: 3 }, growth: 1.25, max: 20, needs: 'honour:5' },
    regroup:   { name: 'Quick regroup',    desc: 'The rival takes the bait again {p} sooner each level.', per: -0.08, base: { honour: 4 }, growth: 1.3, max: 8, needs: 'honour:10' },
    medics:    { name: 'Field medics',     desc: '{p} fewer soldiers die in each raid, each level.', per: -0.06, base: { honour: 6 }, growth: 1.3, max: 10, needs: 'honour:20' },
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
    storage:    { name: 'Storage chambers',      age: 'dirt', cost: { knowledge: 12, soil: 20 },          needs: ['digging'],             desc: 'Unlocks the Food store and the Soil pit.' },
    brood:      { name: 'Brood care',        age: 'dirt', cost: { knowledge: 15, food: 25 },          needs: ['digging'],             desc: 'Unlocks the Warming chamber, the Nurses\' den and Nurses. From now on every chamber gathers mould, and nurses scrub it away.' },
    royal:      { name: 'Royal court',       age: 'wings', cost: { knowledge: 300, food: 250 },       pop: 0.25, needs: ['husks', 'halls'],      desc: 'Unlocks Royal care upgrades for the queen. Worth it once the nest is big.' },
    elders:     { name: 'Elder memory',      age: 'dirt', cost: { knowledge: 25, soil: 35 },          needs: ['brood'],               desc: 'Unlocks the Hall of elders, which stores knowledge.' },
    surface:    { name: 'Upward tunnels',    age: 'dirt', cost: { knowledge: 70, soil: 90 },          needs: ['storage', 'elders'],    desc: 'Diggers may break through to the surface once the nest has 10 chambers.' },
    routine:    { name: 'Daily routine',     age: 'forage', cost: { knowledge: 80, food: 100 },          needs: ['surface'],             desc: 'Pick a default job on the Jobs tab: newly hatched workers go straight to it.' },
    widetunnels: { name: 'Wider tunnels',  age: 'forage', cost: { knowledge: 90, soil: 120 },         needs: ['surface'],             desc: 'Each Resting chamber gives +1 more living space.' },
    ventilation: { name: 'Ventilation',     age: 'forage', cost: { knowledge: 170, soil: 200 },        needs: ['routine', 'shelving'], desc: 'Unlocks the Purification chamber, which scrubs a slow trickle of mould.' },
    grooming:   { name: 'Grooming',          age: 'conquest', cost: { knowledge: 540, food: 450 },      needs: ['halls', 'ventilation'],             desc: 'Nurses learn to groom the walls: each scrubs 12 chambers\' worth of mould instead of 8.' },
    shelving:   { name: 'Packed walls',      age: 'forage', cost: { knowledge: 150, soil: 220 },        needs: ['widetunnels'],  desc: 'Food stores, Soil pits and Silk lofts hold 50% more.' },
    songs:      { name: 'Memory songs',      age: 'forage', cost: { knowledge: 160, food: 180 },         needs: ['elders', 'shelving'], desc: 'Halls of elders hold 50% more knowledge.' },
    lining:     { name: 'Resin lining',      age: 'conquest', cost: { knowledge: 340, resin: 30 },        needs: ['resin', 'shelving', 'songs'], desc: 'Food stores, Soil pits, Silk lofts and Halls of elders hold another 50% more.' },
    teaching:   { name: 'Teaching',          age: 'dirt', cost: { knowledge: 50 },                    needs: ['elders'], flag: 'legacy:flown', desc: 'Opens the Techniques tab.' },
    worksongs:  { name: 'Work songs',        age: 'forage', cost: { knowledge: 140, food: 120 },          needs: ['teaching', 'scouting'], flag: 'legacy:flown', desc: 'Unlocks the Marching songs and Load bearing techniques.' },
    sharedlabour: { name: 'Shared labour',   age: 'forage', cost: { knowledge: 180, twig: 20 },           needs: ['worksongs', 'shelving'], flag: 'legacy:flown', desc: 'Unlocks the Mandible grit and Shared stomach techniques.' },
    scouting:   { name: 'Trail scent',       age: 'forage', cost: { knowledge: 120, food: 120 },          pop: 0.06, needs: ['surface'],             desc: 'Unlocks Scouts, pheromone and the Scent chamber.' },
    seeds:      { name: 'Seed lore',         age: 'forage', cost: { knowledge: 180, seed: 12 },           pop: 0.1, needs: ['scouting'],             desc: 'Unlocks the Seed granary.' },
    resin:      { name: 'Resin working',     age: 'conquest', cost: { knowledge: 260, resin: 8 },          pop: 0.2, needs: ['cartography'],               desc: 'Unlocks the Resin gallery.' },
    deepgalleries: { name: 'Deep galleries', age: 'forage', cost: { knowledge: 280, soil: 240 },        pop: 0.2, needs: ['plans'],            desc: 'Chambers give 25% more living space.' },
    halls:      { name: 'Sleeping halls',    age: 'conquest', cost: { knowledge: 360, twig: 80 },          pop: 0.27, needs: ['resin', 'deepgalleries'], desc: 'Unlocks the Worker hall: +12 living space each.' },
    vaults:     { name: 'Vaulted roofs',     age: 'conquest', cost: { knowledge: 480, resin: 30, twig: 70 }, pop: 0.4, needs: ['halls', 'lining'],    desc: 'Chambers give 25% more living space.' },
    partitions: { name: 'Paper partitions',  age: 'settlement', cost: { knowledge: 500, paper: 45 },     pop: 1.0, needs: ['papercraft'],          desc: 'Chambers give 50% more living space.' },
    plans:      { name: 'Digging plans',     age: 'forage', cost: { knowledge: 240, soil: 200 },          needs: ['shelving'],             desc: 'A building queue with 2 slots. Queued chambers are dug as soon as you can afford them.' },
    studyplans: { name: 'Study plans',       age: 'forage', cost: { knowledge: 420, food: 300 },          needs: ['plans', 'songs'],      desc: 'A research queue with 2 slots. Queued research is learned as soon as you can afford it.' },
    ledgers:    { name: 'Work ledgers',      age: 'settlement', cost: { knowledge: 650, paper: 60 },    needs: ['papercraft', 'studyplans'], desc: 'An upgrade queue with 2 slots. Queued upgrades are bought as soon as you can afford them.' },
    frontier:   { name: 'Frontier sense',    age: 'conquest', cost: { knowledge: 650, pheromone: 200 },    pop: 0.4, needs: ['cartography'], desc: 'Adds an "Expand on its own" option to the Map: a party sets out to claim the nearest tile whenever it can.' },
    sanitation: { name: 'Sanitation',        age: 'forage', cost: { knowledge: 200, soil: 160 },          needs: ['seeds', 'shelving'],   desc: 'Unlocks the Midden.' },
    cartography:{ name: 'Mapping',           age: 'conquest', cost: { knowledge: 260, pheromone: 50 },    pop: 0.15, needs: ['seeds', 'plans'],            desc: 'Opens the Map. Send workers to claim land, and build outposts on it.' },
    martial:    { name: 'Mandible drill',    age: 'conquest', cost: { knowledge: 300, food: 220 },         pop: 0.13, needs: ['cartography'], flag: 'rival', desc: 'Unlocks Soldiers, the Guard post and the War tab.' },
    fortify:    { name: 'Fortification',     age: 'conquest', cost: { knowledge: 450, twig: 90 },         needs: ['martial'],             desc: 'Unlocks Fortifications.' },
    husks:      { name: 'Husk masonry',      age: 'conquest', cost: { knowledge: 480, chitin: 20 },        needs: ['fortify'],             desc: 'Unlocks the Hall of husks.' },
    fungus:     { name: 'Leaf culture',      age: 'forage', cost: { knowledge: 380, seed: 20 },           needs: ['seeds', 'sanitation'], flag: 'legacy:flown', desc: 'Unlocks Leafcutters, Fungus gardens and the Garden tab. Only a line that has flown knows how.' },
    sky:        { name: 'Sky scouts',        age: 'wings', cost: { knowledge: 380, pheromone: 150 },   pop: 0.3, needs: ['royal'],     desc: 'Winged scouts rise above the garden and see how far the world goes. Opens the World view of the Map.' },
    bordernests: { name: 'Border nests',     age: 'wings', cost: { knowledge: 650, pheromone: 300, twig: 120 }, pop: 0.4, needs: ['sky'], flag: 'legacy:flown', desc: 'Small nests on the garden\'s edge. Scouts can claim land in the eight cells around the garden, and soldiers can march on the colonies there. Only a line that has flown knows how.' },
    castes:     { name: 'Caste lore',        age: 'wings', cost: { knowledge: 520, food: 350 },        pop: 0.33, needs: ['royal'],     desc: 'Royal jelly shapes larvae into new kinds of ant. Opens the Castes tab.' },
    rafts:      { name: 'Leaf rafts',        age: 'conquest', cost: { knowledge: 520, leaf: 50, twig: 60 }, needs: ['fungus', 'cartography'],  desc: 'Opens the Waters tab: build boats and send them on voyages.' },
    flight:     { name: 'Winged queens',     age: 'wings', cost: { knowledge: 520, jelly: 18 },         pop: 0.5, needs: ['castes', 'campaigns'], desc: 'Young queens can grow wings. Opens the Legacy tab, where the colony builds the Swarm Spire for its flight. The flight ends this colony: the line is meant to fly several times, growing stronger each time.' },
    renovation: { name: 'Chamber craft',     age: 'wings', cost: { knowledge: 560, clay: 80 },       needs: ['deepdig'], desc: 'Old chambers can be rebuilt with clay. Opens chamber upgrades in the Nest: each level makes every chamber of that kind give 15% more. Upgrades add no mould.' },
    deepdig:    { name: 'Deep diggers',      age: 'wings', cost: { knowledge: 420, soil: 600 },        needs: ['royal'], desc: 'Diggers tunnel down past the soil into the clay. Each digger also brings up a little clay. Unlocks the Clay hall.' },
    hunting:    { name: 'The hunt',          age: 'forage', cost: { knowledge: 100, food: 120 },          needs: ['worksongs'], flag: 'legacy:flown', desc: 'Raise a champion to hunt the creatures of the surface. Opens the Hunts tab. Your champion is kept from colony to colony.' },
    galleons:   { name: 'Wax hulls',         age: 'conquest', cost: { knowledge: 650, wax: 60 },          needs: ['rafts', 'husbandry'], desc: 'Wax-sealed galleons that can cross open water. Unlocks the Wax galleon and new voyages.' },
    husbandry:  { name: 'Herding',           age: 'forage', cost: { knowledge: 350, food: 200 },         needs: ['fungus'], flag: 'legacy:flown', desc: 'Keep herds of aphids and other small insects. Opens the Herds tab and the Herder job.' },
    townlore:   { name: 'Town ways',         age: 'settlement', cost: { knowledge: 200, food: 180 },    pop: 0.8, needs: ['cartography', 'shelving'], flag: 'legacy:migrated', desc: 'Learn the town: kitchens, walls, drains. Opens the Town tab and the Town forager job.' },
    tasting:    { name: 'Tasting',           age: 'settlement', cost: { knowledge: 300, crumbs: 70 },  needs: ['townlore'],            desc: 'Some food is poisoned. Tasters find it. Unlocks the Taster job.' },
    nightwork:  { name: 'Night work',        age: 'settlement', cost: { knowledge: 340, sugar: 35 },   needs: ['tasting'],            desc: 'Forage in the dark while the humans sleep. Choose working hours in the Town tab.' },
    pavement:   { name: 'Street fighting',   age: 'settlement', cost: { knowledge: 380, crumbs: 90 },  needs: ['nightwork', 'martial'], desc: 'Soldiers can clear pavement ants from town sites.' },
    papercraft: { name: 'Paper nests',       age: 'settlement', cost: { knowledge: 450, paper: 45 },   needs: ['tasting'],            desc: 'Chewed paper makes walls. Opens the study and satellite nests.' },
    metalwork:  { name: 'Iron dust',         age: 'settlement', cost: { knowledge: 700, grease: 35 },  needs: ['papercraft', 'pavement'], desc: 'Opens the shed, where iron filings lie in the oil.' },
    campaigns:  { name: 'Campaigning',       age: 'conquest', cost: { knowledge: 700, chitin: 35 },       pop: 0.6, needs: ['husks', 'cartography'], desc: 'Soldiers can march on enemy tiles.' },
  } as Record<string, TechDef>,
  /** Ages organise the tech tree. Each prestige layer opens later ages. */
  ages: [
    { id: 'dirt', name: 'Age of Dirt', note: 'One queen in the dark soil, and her first brood.' },
    { id: 'forage', name: 'Age of Forage', note: 'Up into the daylight near the entrance: trails, seeds, and the first resin.' },
    { id: 'conquest', name: 'Age of Conquest', note: 'Maps, a rival mound, and the land between.' },
    { id: 'wings', name: 'Age of Wings', note: 'A royal court, new castes, and the first winged queens. A colony\'s road ends in a nuptial flight.' },
    { id: 'settlement', name: 'Age of Settlement', note: 'Across the water: houses, walls, and humans.' },
    { id: 'industry', name: 'Age of Industry', note: 'Water wheels, beetle rail and workshops.' },
    { id: 'network', name: 'Age of Network', note: 'One colony across a continent.' },
    { id: 'orbital', name: 'Age of Orbit', note: 'Up.' },
  ],
};

/**
 * Memory vaults raise the knowledge cap quickly in the middle of the Age of Forage, so the
 * research after them costs more knowledge to keep the cap meaningful.
 */
Object.assign(RESEARCH.techs, MORE_TECHS);

export const LATE_KNOWLEDGE = { from: 200, mult: 1.3 };
/** Knowledge costs climb with each age, on top of the figures written above. */
/** Each age's cheapest research is lifted toward this. */
export const AGE_KNOWLEDGE_FLOOR: Record<string, number> = { forage: 140, conquest: 560, wings: 800, settlement: 1000, industry: 1300, network: 1700, orbital: 2100 };
export const AGE_KNOWLEDGE: Record<string, number> = { dirt: 1, forage: 1.1, conquest: 1.25, wings: 1.45, settlement: 1.6, industry: 1.8, network: 2, orbital: 2.2 };
/** After the Age of Forage every research cost (knowledge and materials alike) is raised by this, so research is spread out more. */
export const AGE_COST: Record<string, number> = { conquest: 1.15, wings: 1.2, settlement: 1.25, industry: 1.3, network: 1.3, orbital: 1.3 };
for (const t of Object.values(RESEARCH.techs)) {
  const m = AGE_COST[t.age] ?? 1;
  if (m !== 1) for (const [r, v] of Object.entries(t.cost)) if (r !== 'knowledge' && v !== undefined) (t.cost as Record<string, number>)[r] = Math.round(v * m / 5) * 5 || 1;
  let k = t.cost.knowledge;
  if (k === undefined) continue;
  if (t.age !== 'dirt' && k >= LATE_KNOWLEDGE.from) k *= LATE_KNOWLEDGE.mult;
  k *= (AGE_KNOWLEDGE[t.age] ?? 1) * m;
  const floor = AGE_KNOWLEDGE_FLOOR[t.age] ?? 0;
  if (k < floor) k += (floor - k) * 0.75; // cheap research is pulled most of the way up to the floor, keeping its order
  t.cost.knowledge = t.age === 'dirt' ? Math.round(k) : Math.round(k / 10) * 10;
}

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
  // each replete banks up to `hold` food, filling at `fill`/s from surplus, and feeds it back when stores run dry;
  // once the reserve is full they turn surplus into a trickle of royal jelly (`food` per drop). At most `max` repletes.
  replete: { hold: 20, fill: 0.2, jelly: 0.004, food: 25, max: 8 },
  major: { hp: 3, atk: 3, perSoldiers: 5 }, // ...and the colony can field one major per perSoldiers soldiers  // a major has this many times a soldier's hp and bite
  types: {
    minim:   { name: 'Minims',   cost: { jelly: 3, fungus: 10 },  desc: 'Tiny gardeners. Unlocks the Gardener job, which keeps fungus beds free of mould.' },
    replete: { name: 'Repletes', cost: { jelly: 5, food: 40 },    desc: 'Living food jars. Unlocks the Replete job: they bank surplus food, feed it back when stores run dry, and turn spare food into a little jelly.' },
    major:   { name: 'Majors',   cost: { jelly: 8, chitin: 10 },  desc: 'Huge-headed fighters. Unlocks the Major job: each fights like 3 soldiers. One major per 5 soldiers.' },
    weaver:  { name: 'Weavers',  cost: { jelly: 6, leaf: 30 },    desc: 'Larvae spin silk while weavers hold them. Unlocks the Weaver job and Silk.' },
  } as Record<string, { name: string; cost: Record<string, number>; desc: string }>,
  /**
   * Caste tracks: a long path of upgrades for each caste, opened when that caste is bred.
   * Each stage opens once the stage before it is maxed. Stages with max 1 are turning points.
   * mod: the modifier each level adds `per` to (cap:ant adds living space instead).
   */
  tracks: {
    minim: [
      { id: 'mi1', name: 'Fine mandibles',  desc: 'Each gardener keeps {p} more beds clean each level.',             mod: 'job:gardener', per: 0.08, base: { jelly: 2, fungus: 30 },  growth: 1.3, max: 10 },
      { id: 'mi2', name: 'Spore sense',     desc: 'Leafcutters cut {p} more each level.',              mod: 'job:leafcutter', per: 0.05, base: { jelly: 3, leaf: 40 }, growth: 1.3, max: 10 },
      { id: 'mi3', name: 'Brood minders',   desc: 'Minims tend the eggs too. The brood grows {p} faster.', mod: 'brood', per: 0.1, base: { jelly: 30, fungus: 400 },    growth: 1, max: 1 },
      { id: 'mi4', name: 'Fungus lore',     desc: 'Each gardener keeps another {p} more beds clean each level.',     mod: 'job:gardener', per: 0.1, base: { jelly: 6, fungus: 120 },  growth: 1.35, max: 10 },
      { id: 'mi5', name: 'Nanitic foragers', desc: 'Minims ride out on foragers\' backs and guard them. Foragers bring {p} more.', mod: 'job:forager', per: 0.15, base: { jelly: 60, fungus: 900 }, growth: 1, max: 1 },
    ],
    replete: [
      { id: 're1', name: 'Wider crops',     desc: 'Each replete holds {p} more food each level.',      mod: 'repleteHold', per: 0.25, base: { jelly: 2, food: 120 },  growth: 1.3, max: 8 },
      { id: 're2', name: 'Quick swallow',   desc: 'Repletes fill {p} faster each level.',              mod: 'repleteFill', per: 0.2, base: { jelly: 3, food: 200 },   growth: 1.3, max: 8 },
      { id: 're3', name: 'Honeypot rows',   desc: 'A gallery of hanging repletes: +{p} more repletes can work.', mod: 'repleteMax', per: 4, base: { jelly: 25, food: 1500, soil: 400 }, growth: 1, max: 1, unit: 'flat' as const },
      { id: 're4', name: 'Sweet distillers', desc: 'Repletes make {p} more royal jelly each level.',    mod: 'repleteJelly', per: 0.25, base: { jelly: 5, food: 400 }, growth: 1.35, max: 10 },
      { id: 're5', name: 'Living larder',   desc: 'The whole colony draws on the repletes. Upkeep {p} lower.', mod: 'upkeep', per: -0.1, base: { jelly: 50, food: 4000 }, growth: 1, max: 1 },
    ],
    major: [
      { id: 'ma1', name: 'Heavy heads',     desc: 'Majors bite {p} harder each level.',                mod: 'majorAtk', per: 0.1, base: { jelly: 3, chitin: 15 },   growth: 1.3, max: 10 },
      { id: 'ma2', name: 'Plated backs',    desc: 'Majors take {p} more punishment each level.',       mod: 'majorHp', per: 0.1, base: { jelly: 3, chitin: 20 },    growth: 1.3, max: 10 },
      { id: 'ma3', name: 'Officer corps',   desc: 'One more major can serve per 5 soldiers: one per {p} fewer.', mod: 'majorRatio', per: 1, base: { jelly: 30, chitin: 150 }, growth: 1, max: 1, unit: 'flat' as const },
      { id: 'ma4', name: 'Siege drill',     desc: 'Majors drill the soldiers. All soldiers fight {p} harder each level.', mod: 'soldierPower', per: 0.03, base: { jelly: 6, chitin: 40 }, growth: 1.35, max: 10 },
      { id: 'ma5', name: 'Shock troops',    desc: 'Majors lead every charge: one per {p} fewer soldiers again.', mod: 'majorRatio', per: 1, base: { jelly: 60, chitin: 400 }, growth: 1, max: 1, unit: 'flat' as const },
    ],
    weaver: [
      { id: 'we1', name: 'Fine silk',       desc: 'Weavers spin {p} more each level.',                 mod: 'job:weaver', per: 0.08, base: { jelly: 2, leaf: 40 },  growth: 1.3, max: 10 },
      { id: 'we2', name: 'Silk ropes',      desc: 'Ropes for hauling. Expeditions bring back {p} more each level.', mod: 'expLoot', per: 0.03, base: { jelly: 3, silk: 8 }, growth: 1.3, max: 10 },
      { id: 'we3', name: 'Silk nets',       desc: 'Nets strung over the trails. Soldiers hunt {p} better.', mod: 'hunting', per: 0.3, base: { jelly: 25, silk: 60 },     growth: 1, max: 1 },
      { id: 'we4', name: 'Woven halls',     desc: 'Silk walls hang in every chamber: +{p} living space each level.', mod: 'cap:ant', per: 2, base: { jelly: 5, silk: 20 }, growth: 1.35, max: 10, unit: 'flat' as const },
      { id: 'we5', name: 'Silk sails',      desc: 'Expedition parties glide home on silk. They lose {p} fewer workers.', mod: 'expSafety', per: -0.1, base: { jelly: 50, silk: 150 }, growth: 1, max: 1 },
    ],
  } as Record<string, { id: string; name: string; desc: string; mod: string; per: number; base: Record<string, number>; growth: number; max: number; unit?: 'pct' | 'flat' }[]>,
  upgrades: {
    glands: { name: 'Jelly glands', desc: 'Each level, every nurse makes {p} royal jelly per second from fungus.', per: 0.001, base: { jelly: 4, fungus: 30 }, growth: 1.25, max: 20, unit: 'flat' as const },
  },
};

/** The nuptial flight: the first prestige. */
export const LINEAGE = {
  /**
   * The Swarm Spire: a wonder the colony builds before its flight (Civ style).
   * Each stage takes resources, carried in by hand or by Builders, then may need time to settle.
   * Costs and settling time were raised 4x on 2026-11-11 (Nate): the flight should be a real project.
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
      { id: 'footing',    name: 'Foundation',        cost: { soil: 1400 },                         time: 0,    desc: 'Pack a wide mound of soil above the nest.' },
      { id: 'galleries',  name: 'Galleries',         cost: { soil: 800, twig: 100, resin: 24 },   time: 0,    desc: 'Twig-ribbed galleries, sealed with resin, where the winged ones will wait.' },
      { id: 'nursery',    name: 'Royal nursery',     cost: { food: 2000, seed: 120, jelly: 60 },    time: 0,    desc: 'Warm cells for the larvae chosen to be queens.' },
      { id: 'princesses', name: 'Winged princesses', cost: { jelly: 100, food: 1200 },              time: 4800, desc: 'Royal jelly, and then time. The princesses grow and their wings harden.' },
      { id: 'spire',      name: 'Launch crown',      cost: { twig: 140, resin: 24, seed: 60 },    time: 0,    desc: 'A high crown at the top, where the winged ones climb out on the evening of the flight.' },
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
  /** Navigator's marks: a boat that comes home earns one per this many seconds of the voyage (at least 1). */
  navEvery: 120,
  /** Spent only on these, on the Waters tab. */
  navUps: {
    charts:    { name: 'Star charts',    desc: 'Voyages are {p} faster each level.',                  per: 0.06,  base: { navmark: 6 },  growth: 1.3,  max: 10 },
    holds:     { name: 'Deep holds',     desc: 'Boats bring back {p} more each level.',               per: 0.1,   base: { navmark: 8 },  growth: 1.3,  max: 10 },
    lifelines: { name: 'Lifelines',      desc: '{p} fewer crew are lost on the water each level.',     per: -0.15, base: { navmark: 10 }, growth: 1.35, max: 5 },
    slipway:   { name: 'Second slipway', desc: 'Each level lets {p} more boat sail at once.',          per: 1,     base: { navmark: 40 }, growth: 2.5,  max: 2, unit: 'flat' as const },
  },
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

/** What each resource is, for the hover text in the Stores pane. */
export const RES_DESC: Record<string, string> = {
  // Each line: where it comes from. What it is spent on. How to hold more, or what to watch for.
  mould: 'Gathers in every chamber of the nest. Slows the brood, and past 500 rots eggs, spoils food and sickens workers. The queen, nurses and Purification chambers scrub it away.',
  ant: 'Hatched from the brood. Each one eats food and can take a job. Resting chambers and halls give them room.',
  food: 'Brought in by foragers and your own clicks. Feeds every worker and larva, and pays for chambers. Food stores hold more.',
  reserve: 'Banked by repletes from spare food. Fed back to the colony when the stores run dry. Each replete holds 20.',
  soil: 'Dug out by diggers. Pays for every chamber. Soil pits hold more.',
  knowledge: 'Gathered by elders. Pays for research and techniques. Halls of elders and Memory vaults hold more.',
  pheromone: 'Laid by scouts. Marks trails, maps the garden and pays for many chambers. Scent chambers hold more.',
  egg: 'Laid by the queen and nurses. Hatch into larvae when there is brood space. Warming chambers make room.',
  larva: 'Hatched from eggs. Eat food and grow into workers. Nurses and Warming chambers speed them up. Nurses\' dens let each nurse look after more.',
  jelly: 'Chewed from food on the Castes tab, or made by repletes. Breeds new castes and royal upgrades. Holds 20, and each Royal nursery holds 10 more.',
  twig: 'Brought home by expeditions and from grass on the Map. Builds sturdier chambers, outposts and boats. Twig lofts hold more.',
  seed: 'Brought home by expeditions and from bare soil on the Map. Stocks granaries and pays for seed research. Seed vaults hold more.',
  navmark: 'Earned by boats that come home: one for every 2 minutes on the water. Buys navigation upgrades on the Waters tab. Kept until spent.',
  captmark: 'Earned by winged sorties that come home: more for farther cells. Buys flight upgrades in the World view of the Map. Kept until spent.',
  resin: 'Brought home by expeditions and from stones on the Map. Seals chambers, granaries and hulls. Resin vats hold more.',
  amber: 'A rare find on expeditions and voyages. Lines the later Nurses\' dens. Keen antennae make it turn up more often.',
  trailmark: 'Earned by every expedition that comes home. Buys trail upgrades and later Scent chambers. Has no limit.',
  silk: 'Spun by weavers. Builds barques, galleons and silk lines on the Map. Silk lofts hold more.',
  leaf: 'Cut by leafcutters. Feeds the fungus beds, builds rafts and pays for weavers. Each Fungus garden holds 10 more.',
  fungus: 'Grown in Fungus gardens. Pays for minims and garden upgrades. Fungus gardens and Spore cellars hold more.',
  honeydew: 'Milked from herds by herders. Buys new herds and herd upgrades. Every animal you keep holds 2 more.',
  clay: 'Brought up by diggers after Deep diggers. Builds Clay halls and props up big nests. Holds up to 200.',
  wax: 'Grown by scale insects and mealybugs in your herds. Builds Wax stores, galleons and island colonies. Wax stores hold more.',
  chitin: 'Left by fallen raiders and hunted creatures. Expeditions to the stream bank and the far hedge find old shells too. Builds fortifications, husk halls and majors. Husk harvest raises the drop.',
  honour: 'Earned by clearing raid waves and winning campaigns. Buys honour upgrades on the War tab. Kept until spent.',
  venom: 'Taken from spider raiders. Arms your champion. Kept until spent.',
  crumbs: 'Gathered by town foragers at the kitchen floor and the study. Builds satellite nests and pays for town research. Holds up to 120.',
  sugar: 'Gathered by town foragers at the kitchen floor. Feeds larvae through Sugar syrup and pays for town research. Holds up to 60.',
  paper: 'Chewed from the warm walls and the study. Builds Paper halls and wall nests. Holds up to 60.',
  grease: 'Scraped up in the drain and the shed. Builds drain nests and greases hulls. Holds up to 40.',
  filings: 'Picked from the oil in the shed. Gives soldiers iron mandibles. Holds up to 40.',
  lineage: 'Earned by a nuptial flight. Buys perks that are kept forever. Kept across colonies.',
  heritage: 'Earned by migrating. Buys migration perks. Kept across migrations.',
  memory: 'Earned from Archive milestones. Spent on accords. Kept across colonies.',
  unity: 'Earned from the regions your supercolony holds. Buys supercolony perks. Kept forever.',
};

/**
 * Seasons: from the Age of Wings on, the year turns. Each season lasts `length` seconds of game time.
 * mods: what each season publishes (the same mod names other systems already read).
 * Winter stops expeditions and sky sorties (mod 'winter'), and the nuptial flight waits for a warm
 * evening in spring or summer (mod 'cold'). Each winter the colony gets through without a death
 * from hunger adds `winterLineage` to the flight.
 */
export const SEASONS = {
  length: 360,
  list: [
    { id: 'spring', name: 'Spring', note: 'The soil softens. The brood quickens.', mods: { brood: 0.25 } },
    { id: 'summer', name: 'Summer', note: 'Long days and warm evenings. Foraging is rich.', mods: { 'job:forager': 0.25, expLoot: 0.1 } },
    { id: 'autumn', name: 'Autumn', note: 'Seeds fall and resin runs. Store what you can.', mods: { 'job:forager': 0.1, expLoot: 0.3, cold: 1 } },
    { id: 'winter', name: 'Winter', note: 'The surface freezes. The colony huddles on what it stored.', mods: { 'job:forager': -0.75, 'job:leafcutter': -0.5, brood: -0.5, upkeep: -0.5, winter: 1, cold: 1 } },
  ] as { id: string; name: string; note: string; mods: Record<string, number> }[],
  warnBefore: 60,           // seconds of warning before winter comes
  winterLineage: 3,         // lineage per winter survived with no one starving
};


/**
 * The world: from the Age of Wings the Map zooms out. The garden is one cell of a size x size grid,
 * and every cell is a whole local map of its own. Winged scouts fly sorties to reveal cells.
 * Claiming land in other cells comes with later research and prestige layers.
 */
export const WORLD = {
  size: 7,
  home: [3, 3] as [number, number],
  /** Terrain mix per biome: thresholds on a 0..1 noise for stone (above) and soil (below), and how wet it is. */
  biomes: {
    meadow: { name: 'Meadow', note: 'Tall grass to the horizon. Seeds everywhere.', stone: 0.75, soil: 0.3, water: 0.02 },
    woods:  { name: 'Woodland edge', note: 'Roots, bark and deep shade. Resin bleeds from the trunks.', stone: 0.6, soil: 0.4, water: 0.03 },
    pond:   { name: 'Pond', note: 'Open water ringed with reeds. Nothing crosses without a boat.', stone: 0.8, soil: 0.35, water: 0.45 },
    field:  { name: 'Ploughed field', note: 'Turned earth in long rows.', stone: 0.82, soil: 0.62, water: 0.01 },
    scree:  { name: 'Rock garden', note: 'Stones stacked by human hands. Warm in the sun.', stone: 0.45, soil: 0.3, water: 0.0 },
    yard:   { name: 'Yard', note: 'Slabs, a shed, and the smell of humans.', stone: 0.7, soil: 0.35, water: 0.0, paved: 0.4 },
  } as Record<string, { name: string; note: string; stone: number; soil: number; water: number; paved?: number }>,
  sortie: {
    scouts: 4, scoutsPerRing: 3,          // scouts in a sortie: base + per ring of distance from home
    cost: { food: 180, pheromone: 20 },   // per ring of distance
    time: 30, timePerRing: 25,            // seconds
    birds: 0.06,                          // chance per ring that birds take the sortie
    downwind: { time: 0.7, birds: 0.5 },  // flying with the wind
    upwind: { time: 1.5, birds: 1.6 },    // flying into it
    windEvery: 150,                       // seconds before the wind turns
    find: { food: 250, seed: 12, resin: 6, twig: 25 }, // what a sortie brings home, per ring
    marksPerRing: 3,                      // captain's marks for a sortie that comes home, per ring
  },
  /** Captain's marks: earned by sorties, spent only on these, in the World view of the Map. */
  skyUps: {
    tailwind: { name: 'Tailwinds',   desc: 'Sorties fly {p} faster each level.',            per: 0.08,  base: { captmark: 4 }, growth: 1.3, max: 8 },
    keen:     { name: 'Keen eyes',   desc: 'Sorties bring home {p} more each level.',       per: 0.15,  base: { captmark: 5 }, growth: 1.3, max: 8 },
    flock:    { name: 'Flock sense', desc: 'Birds take sorties {p} less often each level.', per: -0.08, base: { captmark: 6 }, growth: 1.3, max: 6 },
  },
  /** Landmarks: found once by a sortie, they help every colony of the line after that. */
  landmarks: [
    { id: 'oak',     name: 'The old oak',    desc: 'Aphids crowd its bark. Foragers bring home {p} more.', mod: 'job:forager', per: 0.1 },
    { id: 'compost', name: 'A compost heap', desc: 'Warm rot. The brood grows {p} faster.', mod: 'brood', per: 0.1 },
    { id: 'beetles', name: 'Beetle graves',  desc: 'Old husks to practise on. Soldiers hunt {p} better.', mod: 'hunting', per: 0.25 },
    { id: 'fruit',   name: 'A fallen pear',  desc: 'Sweet and rotting. Expeditions bring back {p} more.', mod: 'expLoot', per: 0.15 },
    { id: 'mound',   name: 'An empty mound', desc: 'Someone lived here once. Flights earn {p} more Lineage.', mod: 'lineageGain', per: 0.05 },
    { id: 'barrel',  name: 'The rain barrel', desc: 'Its shadow keeps the ground soft. Claims cost {p} less.', mod: 'claimCost', per: -0.1 },
  ],
  /** Land beyond the garden. ring: how far out claims reach (later layers push it further). */
  claim: { ring: 1, scouts: 6, time: 40 },
  /** Hostile colonies out in the world. power: the strength of each tile they hold (their core is coreMult x).
   *  Your soldiers march on a tile next to your land; win and it is yours. Take the core and the colony falls. */
  foes: [
    { id: 'redhill',  name: 'Red Hill',          kind: 'fire ants',      power: 40,  loot: { chitin: [4, 8], food: [40, 90] },   note: 'Fire ants. Small, many, and they sting.' },
    { id: 'carpent',  name: 'The Carpenters',    kind: 'carpenter ants', power: 70,  loot: { twig: [15, 30], resin: [3, 8] },   note: 'Huge ants that chew galleries into dead wood.' },
    { id: 'harvest',  name: 'Harvester Mound',   kind: 'harvester ants', power: 90,  loot: { seed: [10, 25], food: [60, 120] },  note: 'They strip the ground bare of seed for a stone\'s throw around.' },
    { id: 'legion',   name: 'The Pavement Legion', kind: 'pavement ants', power: 130, loot: { food: [100, 200], chitin: [6, 12] }, note: 'Endless lines between the slabs. They war with everything.' },
  ] as { id: string; name: string; kind: string; power: number; loot: Record<string, [number, number]>; note: string }[],
  foeRadius: 3.6,
  coreMult: 4,
  assault: { time: 60, loss: 0.15, honours: 2, fallHonours: 10 },
  /** Kin colonies: other nests of your own kind. Found by sorties; diplomacy opens later. */
  kin: [
    { id: 'reed',   name: 'The Reed Mound',   temper: 'wary' },
    { id: 'ember',  name: 'Ember Hollow',     temper: 'proud' },
    { id: 'moss',   name: 'The Moss Halls',   temper: 'timid' },
    { id: 'gilded', name: 'The Gilded Nest',  temper: 'greedy' },
    { id: 'root',   name: 'Old Root',         temper: 'ancient' },
  ],
};

/**
 * Kin diplomacy. Each kin colony found from the air has a temper, a chain of four quests, gifts it likes,
 * and a feud with one other kin: helping one cools the other. Trust opens tiers; at full trust with every
 * quest done, the two colonies can join as one for good.
 * Quest kinds: give (pay the costs), raids (win raids), exp (expeditions home), capture (enemy tiles taken),
 * cells (world cells seen from the air), winters (winters lived through) - all counted from when the quest
 * is taken - and tiles, landmarks, flights (totals reached).
 */
export interface KinQuest { kind: string; n?: number; costs?: Record<string, number>; name: string; text: string }
export const KIN = {
  questTrust: 20,                 // trust for each quest done
  feudCost: 8,                    // trust the feuding kin loses when you finish a quest for its enemy
  gift: { trust: 4, liked: 2.5, every: 90 }, // a plain gift; a liked one is worth x2.5; one gift per kin per 90s
  tiers: [
    { at: 0, name: 'Strangers', note: 'They let your scouts land, and nothing more.' },
    { at: 20, name: 'Acquainted', note: 'Scent is traded at the border. They will hear your requests.' },
    { at: 50, name: 'Allies', note: 'Half their gift is yours while the alliance holds.' },
    { at: 80, name: 'Sworn kin', note: 'They send food along the trail: {t} a second.' },
    { at: 100, name: 'One scent', note: 'Ready to join as one colony.' },
  ],
  tradeFood: 0.4,                 // food a second from each sworn kin
  merge: { workers: 30, living: 30 }, // what a merged kin brings: workers now, living space for every colony of the line
  tempers: {
    wary:    { likes: 'pheromone', gift: { mod: 'expSafety',   per: -0.2,  text: 'Expeditions lose {p} fewer workers' } },
    proud:   { likes: 'chitin',    gift: { mod: 'soldierPower', per: 0.15, text: 'Soldiers fight {p} harder' } },
    timid:   { likes: 'food',      gift: { mod: 'brood',       per: 0.12,  text: 'The brood grows {p} faster' } },
    greedy:  { likes: 'resin',     gift: { mod: 'expLoot',     per: 0.2,   text: 'Expeditions bring back {p} more' } },
    ancient: { likes: 'knowledge', gift: { mod: 'lineageGain', per: 0.08,  text: 'Flights earn {p} more Lineage' } },
  } as Record<string, { likes: string; gift: { mod: string; per: number; text: string } }>,
  giftSize: { pheromone: 60, chitin: 15, food: 300, resin: 12, knowledge: 120 } as Record<string, number>,
  feuds: [['ember', 'moss'], ['gilded', 'root'], ['reed', 'ember']] as [string, string][],
  /** Four steps per kin. Most steps offer two paths: either one finishes the step. */
  quests: {
    reed: [
      [{ kind: 'cells', n: 2, name: 'Eyes in the sky', text: 'They watch from the reeds. Show them you see as far as they do: reveal two more cells from the air.' },
       { kind: 'give', costs: { food: 300 }, name: 'Bread at the border', text: 'Or simply feed their scouts when they pass. Watchers get hungry.' }],
      [{ kind: 'give', costs: { pheromone: 150 }, name: 'Border scent', text: 'Trade scent marks, so neither colony mistakes the other in the dark.' },
       { kind: 'give', costs: { twig: 60 }, name: 'Boundary stakes', text: 'Mark the border with twigs instead. They trust what they can see.' }],
      [{ kind: 'exp', n: 6, name: 'Clear paths', text: 'Bring six expeditions home. Busy trails are safe trails.' },
       { kind: 'give', costs: { resin: 30 }, name: 'Sealed trails', text: 'Seal the trail walls with resin, so nothing nests in them.' }],
      [{ kind: 'winters', n: 1, name: 'A winter side by side', text: 'Live through a winter beside them. Only then will they believe you mean to stay.' },
       { kind: 'give', costs: { seed: 60 }, name: 'Winter seed', text: 'Fill their granary against the cold. That is a promise too.' }],
    ],
    ember: [
      [{ kind: 'raids', n: 3, name: 'Show your mandibles', text: 'They respect strength and nothing else. Win three raids.' },
       { kind: 'give', costs: { chitin: 30 }, name: 'Trophies', text: 'Or bring trophies from raids already won. They will count the husks.' }],
      [{ kind: 'give', costs: { chitin: 40 }, name: 'Husks as tribute', text: 'Send them husks of your enemies. A gift between equals.' },
       { kind: 'give', costs: { food: 600 }, name: 'A soldiers\' feast', text: 'Feed their soldiers before a battle. They will remember who did.' }],
      [{ kind: 'capture', n: 2, name: 'Take the field', text: 'Take two tiles from an enemy.' },
       { kind: 'give', costs: { resin: 40, twig: 40 }, name: 'Arms for the Hollow', text: 'Resin-hardened twig spikes for their gate.' }],
      [{ kind: 'raids', n: 5, name: 'A war worth singing of', text: 'Win five more raids. Their soldiers are watching.' },
       { kind: 'give', costs: { chitin: 80 }, name: 'A war chest', text: 'A hoard of husks, to arm the Hollow for a generation.' }],
    ],
    moss: [
      [{ kind: 'give', costs: { food: 400 }, name: 'A full stomach', text: 'They are hungry and afraid to forage. Send food.' },
       { kind: 'give', costs: { seed: 30 }, name: 'Seed for the halls', text: 'Seeds keep. Food does not. They would rather have seeds.' }],
      [{ kind: 'exp', n: 3, name: 'Escort', text: 'Bring three expeditions home, and let their foragers walk behind yours.' },
       { kind: 'give', costs: { pheromone: 120 }, name: 'Safe trails', text: 'Lay strong scent along their foraging trails, so they never get lost.' }],
      [{ kind: 'tiles', n: 20, name: 'A safe border', text: 'Hold twenty tiles of land, so nothing reaches them through you.' },
       { kind: 'give', costs: { twig: 80, soil: 150 }, name: 'A wall', text: 'Build a low wall of twig and soil between them and the world.' }],
      [{ kind: 'winters', n: 1, name: 'Huddle', text: 'Live through a winter. They will huddle in your shadow.' },
       { kind: 'give', costs: { food: 1200 }, name: 'Shared stores', text: 'Fill their stores to the roof before the cold.' }],
    ],
    gilded: [
      [{ kind: 'give', costs: { resin: 25 }, name: 'A taste of amber', text: 'Resin, to start. They will tell you what they want next.' },
       { kind: 'give', costs: { twig: 60 }, name: 'Straight twigs', text: 'They are building. Straight twigs fetch a fine price.' }],
      [{ kind: 'give', costs: { seed: 40 }, name: 'Seed money', text: 'Forty seeds, sound and dry.' },
       { kind: 'give', costs: { pheromone: 120 }, name: 'Scent to sell', text: 'They sell trail scent to lost foragers. Supply them.' }],
      [{ kind: 'landmarks', n: 2, name: 'Where the treasure is', text: 'Find two landmarks from the air. They want to know where the riches are.' },
       { kind: 'cells', n: 3, name: 'Prospecting', text: 'Reveal three more cells from the air, and tell them what you saw.' }],
      [{ kind: 'give', costs: { food: 1500, resin: 60 }, name: 'The great bargain', text: 'A fortune in food and resin. Then they are yours.' },
       { kind: 'give', costs: { chitin: 60, seed: 80 }, name: 'The other bargain', text: 'Husks and seed instead. They will haggle, then accept.' }],
    ],
    root: [
      [{ kind: 'winters', n: 1, name: 'Patience', text: 'They have seen a hundred winters. Live through one, and come back.' },
       { kind: 'give', costs: { knowledge: 200 }, name: 'A question worth asking', text: 'Bring them a good question. They have had the same answers for years.' }],
      [{ kind: 'give', costs: { knowledge: 300 }, name: 'What the elders know', text: 'Share what your elders have learned. They will judge it.' },
       { kind: 'give', costs: { jelly: 6 }, name: 'A taste of the queen', text: 'Royal jelly, so their old queen knows yours.' }],
      [{ kind: 'cells', n: 4, name: 'The old places', text: 'Reveal four more cells from the air. They remember the world before the garden.' },
       { kind: 'landmarks', n: 2, name: 'The old signs', text: 'Find two landmarks. They were waymarks once, when Old Root was young.' }],
      [{ kind: 'flights', n: 2, name: 'A line that has flown', text: 'Your line must have flown twice. They do not join with colonies, only with lines.' }],
    ],
  } as Record<string, KinQuest[][]>,
};
