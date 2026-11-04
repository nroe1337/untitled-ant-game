// All tuning numbers live here. Change these to rebalance; no logic in this file.
// Pacing goal: a slow burn you check on every so often (Kittens Game / Evolve speed),
// with many small upgrade levels (+2-3% each) instead of a few big jumps.

export const BROOD = {
  startFood: 10,
  layEggCooldown: 3,        // seconds between manual lays
  eggHatchTime: 15,         // seconds for an egg to become a larva
  larvaGrowTime: 40,        // seconds for a larva to become a worker
  larvaFoodPerSecond: 0.05, // each growing larva eats this much
  baseBroodCap: 4,          // max eggs + larvae before chambers
  nurseEggsPerSecond: 0.03, // each nurse lays this many eggs
  forageClick: 1,           // food per manual forage
  forageCooldown: 2,
  royal: {
    quicken:   { name: 'Warm brood',      desc: 'Eggs hatch {p} faster per level',               per: 0.03, base: { food: 20 },           growth: 1.18, max: 25 },
    jelly:     { name: 'Rich feeding',    desc: 'Larvae grow {p} faster per level',              per: 0.03, base: { food: 30 },           growth: 1.18, max: 25 },
    devotion:  { name: 'Devoted nurses',  desc: 'Nurses lay {p} faster per level',               per: 0.03, base: { food: 40, soil: 15 }, growth: 1.2,  max: 30, needs: 'chamber:brood' },
    clutch:    { name: 'Larger clutch',   desc: 'The queen lays {p} more egg per lay, per level', per: 1,   base: { food: 60 },           growth: 3,    max: 3, unit: 'flat' as const },
    longevity: { name: 'Royal rhythm',    desc: 'The queen lays {p} eggs/s on her own, per level', per: 0.005, base: { seed: 6, resin: 1 }, growth: 1.3, max: 20, unit: 'flat' as const, needs: 'surface' },
  },
};

export const COLONY = {
  baseAntCap: 6,            // living space before tunnels
  antFoodPerSecond: 0.04,   // upkeep per adult ant (one forager feeds 3)
  starvingPenalty: 0.75,    // job output multiplier while food is 0
  starveFoodPerDeath: 4,    // unpaid food that costs one worker's life (very gradual)
  starveWarnSeconds: 90,    // warn when food will run out within this many seconds
  techniques: {
    trails:   { name: 'Scent trails',        desc: 'Foragers +{p} per level',        per: 0.02,  base: { pheromone: 4 },          growth: 1.16, max: 40, needs: 'surface' },
    grit:     { name: 'Mandible grit',       desc: 'Diggers +{p} per level',         per: 0.02,  base: { twig: 4 },               growth: 1.16, max: 40, needs: 'surface' },
    stomach:  { name: 'Shared stomach',      desc: 'Colony upkeep −{p} per level',   per: -0.01, base: { seed: 4, food: 30 },     growth: 1.18, max: 30, needs: 'surface' },
    marching: { name: 'Marching songs',      desc: 'Scouts +{p} per level',          per: 0.03,  base: { pheromone: 8, twig: 3 }, growth: 1.18, max: 30, needs: 'surface' },
    lore:     { name: 'Oral tradition',      desc: 'Elders +{p} per level',          per: 0.03,  base: { knowledge: 15, food: 10 }, growth: 1.18, max: 30 },
    craft:    { name: 'Tunnel craft',        desc: 'Chambers cost {p} less per level', per: -0.01, base: { knowledge: 20, soil: 20 }, growth: 1.2, max: 25 },
    carrying: { name: 'Load bearing',        desc: 'Expedition loot +{p} per level', per: 0.02,  base: { knowledge: 25, twig: 4 }, growth: 1.18, max: 30, needs: 'surface' },
    drill:    { name: 'Drill and formation', desc: 'Soldiers fight {p} harder per level', per: 0.02, base: { chitin: 2, food: 50 }, growth: 1.18, max: 40, needs: 'rival' },
  },
};

export const JOBS = {
  forager: { food: 0.12 },
  digger: { soil: 0.06 },
  scout: { pheromone: 0.02 },
  elder: { knowledge: 0.03 },
};

export const NEST = {
  costGrowth: 1.2,
  surfaceAtChambers: 10,
  baseFoodCap: 40,
  baseSoilCap: 50,
  chambers: {
    tunnel:   { name: 'Tunnel',          base: { soil: 10 },                     desc: '+3 living space',                         antCap: 3 },
    brood:    { name: 'Brood chamber',   base: { soil: 15, food: 10 },           desc: '+4 brood space. Unlocks nurses.',         broodCap: 4, needs: 'tech:brood' },
    store:    { name: 'Food store',      base: { soil: 20 },                     desc: '+30 food storage',                        foodCap: 30, needs: 'tech:storage' },
    granary:  { name: 'Seed granary',    base: { soil: 40, seed: 6 },            desc: 'Sprouting seeds give +0.05 food/s',       foodRate: 0.05, needs: 'tech:seeds' },
    gallery:  { name: 'Resin gallery',   base: { soil: 60, resin: 4, twig: 8 },  desc: '+8 living space, +60 food storage',       antCap: 8, foodCap: 60, needs: 'tech:resin' },
    gland:    { name: 'Scent chamber',   base: { soil: 35, pheromone: 8 },       desc: 'Scouts +5% each, +15 pheromone storage',  pheroCap: 15, scout: 0.05, needs: 'tech:scouting' },
    barracks: { name: 'Guard post',      base: { soil: 60, twig: 10 },           desc: '+2 nest defence, +3 living space',        defence: 2, antCap: 3, needs: 'tech:martial' },
    husks:    { name: 'Hall of husks',   base: { soil: 50, chitin: 6 },          desc: 'Raider shells shore up the walls: +6 living space, +2 defence', antCap: 6, defence: 2, needs: 'tech:husks' },
    library:  { name: 'Hall of elders',  base: { soil: 30, food: 20 },           desc: '+25 knowledge storage, elders +5% each', knowCap: 25, elder: 0.05, needs: 'tech:elders' },
    midden:   { name: 'Midden',          base: { soil: 50, food: 30 },           desc: 'Waste heap. Upkeep −2% each (max 15)',    upkeep: 0.02, max: 15, needs: 'tech:sanitation' },
  },
};

export const EXPEDITIONS = {
  minParty: 3,
  /** tile: where on the map this place is, as an offset from the nest. */
  destinations: [
    { id: 'grass',  name: 'The near grass',         time: 90,   unlockRuns: 0,  tile: [2, -1], loot: { food: [4, 8], twig: [1, 2] } },
    { id: 'leaf',   name: 'Under the old leaf',     time: 180,  unlockRuns: 3,  tile: [3, 3],  loot: { food: [6, 12], seed: [1, 3], resin: [0, 1] } },
    { id: 'stump',  name: 'The rotten stump',       time: 360,  unlockRuns: 8,  tile: [6, -3], loot: { twig: [3, 6], resin: [1, 2], seed: [1, 2] } },
    { id: 'stream', name: 'The stream bank',        time: 600,  unlockRuns: 15, tile: [10, 1], loot: { seed: [2, 5], food: [10, 18], pheromone: [2, 4] } },
    { id: 'patio',  name: 'The edge of the stones', time: 900,  unlockRuns: 25, tile: [12, -2], loot: { food: [20, 35], resin: [2, 4] } },
    { id: 'hedge',  name: 'Under the far hedge',    time: 1500, unlockRuns: 40, tile: [20, -6], loot: { twig: [8, 14], seed: [5, 9] } },
  ],
  lootPerAnt: 0.15,         // loot multiplier per ant beyond the minimum party
  trailMarksPerRun: 1,
  lossChance: 0.1,          // chance to lose one ant per run
  rareChance: 0.05,         // chance of a rare find (amber)
  markTrailCost: { pheromone: 5 },  // spend to make the next trip 30% shorter
  markTrailCut: 0.3,
  revealRadius: 2,
  upgrades: {
    mandibles: { name: 'Stronger mandibles', desc: 'Expedition loot +{p} per level',     per: 0.03,  base: { trailmark: 2 },  growth: 1.15, max: 40 },
    feet:      { name: 'Sure feet',          desc: 'Expedition time −{p} per level',     per: -0.02, base: { trailmark: 3 },  growth: 1.18, max: 25 },
    instinct:  { name: 'Homing instinct',    desc: 'Chance of losing a worker −{p} per level', per: -0.03, base: { trailmark: 3 }, growth: 1.18, max: 20 },
    eyes:      { name: 'Keen antennae',      desc: 'Rare finds +{p} more likely per level', per: 0.05, base: { trailmark: 5 }, growth: 1.2, max: 20 },
    memory:    { name: 'Trail memory',       desc: 'Parties set out again by themselves', per: 1,     base: { trailmark: 25 }, growth: 1,    max: 1, unit: 'flat' as const },
    columns:   { name: 'Second column',      desc: '{p} more expedition at a time',      per: 1,     base: { trailmark: 40 }, growth: 3,    max: 2, unit: 'flat' as const },
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
  claimGrowth: 1.35,
  claimWorkers: 2,          // workers who stay at each outpost
  /** Per-second output of each owned tile by terrain. */
  yield: {
    grass: { food: 0.03 },
    soil: { soil: 0.02 },
    stone: {},
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
    wave: { base: 3, perWave: 1.5, bruteEvery: 3, clearBonus: 2, toughness: 0.1 }, // toughness: raider hp and bite +10% per wave past the first, so waves keep getting harder after the raider cap // clearBonus: chitin per wave number on a clean win
    soldier:  { hp: 5, atk: 1 },
    worker:   { hp: 2, atk: 0.4 },   // rallied workers
    defenceDps: 0.3,                 // damage per second per point of nest defence (guard posts, stones, husks)
    guardRange: 120,
    rallyCooldown: 30,
    rallyMax: 8,                     // most workers that answer one rally
    chitinPerKill: 1,
    stealPerBreach: 0.04,            // fraction of food stolen per raider that gets in
    maxSteal: 0.2,                   // never more than this per raid
    maxSoldierLoss: 0.25,            // never lose more than this share of soldiers per raid
  },
  fortifications: {
    thorns:  { name: 'Thorn barricade', desc: 'Raiders move {p} slower per level',          per: 0.04, base: { twig: 10 },             growth: 1.2,  max: 15 },
    spitters:{ name: 'Acid spitters',   desc: 'Guard posts deal {p} more damage per level', per: 0.05, base: { chitin: 3, resin: 1 },  growth: 1.2,  max: 30 },
    carapace:{ name: 'Hardened carapace', desc: 'Soldiers have {p} more health per level',  per: 0.04, base: { chitin: 4 },            growth: 1.2,  max: 30 },
    plug:    { name: 'Entrance plug',   desc: 'Raiders that get in steal {p} less per level', per: -0.04, base: { soil: 40, resin: 2 }, growth: 1.25, max: 15 },
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
    digging:    { name: 'Tunnelling',        cost: { knowledge: 6 },                     needs: [],                      desc: 'Workers learn to dig. Unlocks Diggers and the Nest.' },
    storage:    { name: 'Food caching',      cost: { knowledge: 12, soil: 10 },          needs: ['digging'],             desc: 'Unlocks the Food store.' },
    brood:      { name: 'Brood care',        cost: { knowledge: 15, food: 15 },          needs: ['digging'],             desc: 'Unlocks the Brood chamber and Nurses.' },
    royal:      { name: 'Royal court',       cost: { knowledge: 25, food: 30 },          needs: ['brood'],               desc: 'Unlocks Royal care upgrades for the queen.' },
    elders:     { name: 'Elder memory',      cost: { knowledge: 25, soil: 20 },          needs: ['brood'],               desc: 'Unlocks the Hall of elders, which stores and speeds up knowledge.' },
    surface:    { name: 'Upward tunnels',    cost: { knowledge: 40, soil: 30 },          needs: ['storage', 'brood'],    desc: 'Diggers may break through to the surface once the nest has 10 chambers.' },
    teaching:   { name: 'Teaching',          cost: { knowledge: 50 },                    needs: ['elders'],              desc: 'Unlocks Colony techniques.' },
    scouting:   { name: 'Trail scent',       cost: { knowledge: 60, food: 40 },          needs: ['surface'],             desc: 'Unlocks Scouts, pheromone and the Scent chamber.' },
    seeds:      { name: 'Seed lore',         cost: { knowledge: 70, seed: 3 },           needs: ['surface'],             desc: 'Unlocks the Seed granary.' },
    resin:      { name: 'Resin working',     cost: { knowledge: 90, resin: 2 },          needs: ['seeds'],               desc: 'Unlocks the Resin gallery.' },
    sanitation: { name: 'Sanitation',        cost: { knowledge: 80, soil: 60 },          needs: ['elders', 'surface'],   desc: 'Unlocks the Midden.' },
    cartography:{ name: 'Mapping',           cost: { knowledge: 100, pheromone: 10 },    needs: ['scouting'],            desc: 'Opens the Map. Claim tiles as outposts.' },
    martial:    { name: 'Mandible drill',    cost: { knowledge: 100, food: 60 },         needs: ['surface'], flag: 'rival', desc: 'Unlocks Soldiers, the Guard post and the War tab.' },
    fortify:    { name: 'Fortification',     cost: { knowledge: 140, twig: 10 },         needs: ['martial'],             desc: 'Unlocks Fortifications.' },
    husks:      { name: 'Husk masonry',      cost: { knowledge: 160, chitin: 5 },        needs: ['martial'],             desc: 'Unlocks the Hall of husks.' },
    campaigns:  { name: 'Campaigning',       cost: { knowledge: 220, chitin: 10 },       needs: ['martial', 'cartography'], desc: 'Soldiers can march on enemy tiles.' },
  } as Record<string, { name: string; cost: Record<string, number>; needs: string[]; flag?: string; desc: string }>,
};
