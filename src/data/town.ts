// Migration (the second prestige) and the town that follows it.
// The line leaves the garden for the human town across the water. Lineage and its perks reset;
// Heritage is earned instead and buys permanent perks. Every colony after that starts in the town.

export const MIGRATION = {
  needs: { flights: 3, settlements: 3 },   // flights since the last migration, settlements founded (lifetime)
  // heritage earned = sqrt(lineage earned since the last migration) + 2 per settlement + 1 per flight
  perks: {
    roots:    { name: 'Deep roots',     desc: 'Lineage from flights +{p} per level',  per: 0.1,  base: { heritage: 2 }, growth: 1.3, max: 20 },
    founders: { name: 'Town founders',  desc: 'Start each colony with {p} more workers per level', per: 3, base: { heritage: 3 }, growth: 1.4, max: 10, unit: 'flat' as const },
    tongue:   { name: 'Old tongue',     desc: 'Elders +{p} per level',                per: 0.05, base: { heritage: 2 }, growth: 1.3, max: 20 },
    quiet:    { name: 'Quiet line',     desc: 'Humans notice you {p} less per level', per: 0.04, base: { heritage: 3 }, growth: 1.35, max: 15 },
    wrights:  { name: 'Shipwrights',    desc: 'Voyages {p} faster per level',         per: 0.05, base: { heritage: 2 }, growth: 1.3, max: 20 },
    kin:      { name: 'Champion\'s kin', desc: 'Champion attack +{p} per level',     per: 0.05, base: { heritage: 2 }, growth: 1.3, max: 20 },
  },
};

export const TOWN = {
  dayLength: 1200,           // seconds for a full day and night
  attentionDecay: 0.02,      // attention lost per second
  attentionPerAnt: 0.0035,   // attention per town forager per second in daylight, times the sites' average weight
  thresholds: { bait: 40, spray: 70, seal: 90 },
  sealTime: 1800,            // a sealed site stays shut this long
  sprayKills: 0.15,          // share of town foragers lost to a spray (at most 8)
  taintShare: 0.15,          // share of bait-station food that is poisoned, while bait is out
  taintPerDeath: 6,          // taint that costs one worker
  tasterClean: 0.05,         // taint each taster removes per second
  purgeShare: 0.2,           // purging throws away this share of food and sugar
  night: 0.6,                // yield at night (dark and cold)
  both: 1.6,                 // yield working day and night (attention as day)
  perForager: 0.05,          // units per town forager per second, split over open sites
  caps: { crumbs: 120, sugar: 60, grease: 60, paper: 100, filings: 40 },  // grease and paper hold more than Iron dust (45) and Work ledgers (75) cost
  sites: {
    compost: { name: 'The compost heap', yields: { food: 2 },               weight: 0.3, rival: true,  desc: 'Rotting peel and coffee grounds. Pavement ants hold it.' },
    kitchen: { name: 'The kitchen floor', yields: { crumbs: 1.2, sugar: 0.4 }, weight: 1.5,            desc: 'Crumbs under the table, sugar by the kettle. Humans notice you here.' },
    walls:   { name: 'The warm walls',   yields: { paper: 0.3 },             weight: 0.4,             desc: 'Hollow walls, warm all winter. Paper backing to chew.' },
    drain:   { name: 'The drain',        yields: { grease: 0.5, food: 0.3 }, weight: 0.5,             desc: 'Grease and scraps. Damp, dark, and nobody looks down there.' },
    office:  { name: 'The study',        yields: { paper: 0.6, crumbs: 0.2 }, weight: 1, needs: 'tech:papercraft', desc: 'Stacks of paper and a biscuit tin.' },
    shed:    { name: 'The shed',         yields: { filings: 0.3, grease: 0.2 }, weight: 0.4, rival: true, needs: 'tech:metalwork', desc: 'Oil, iron dust and a sleeping cat. Pavement ants hold it.' },
  } as Record<string, { name: string; yields: Record<string, number>; weight: number; rival?: boolean; needs?: string; desc: string }>,
  rivalStrength: { compost: 25, shed: 80 },   // soldier strength needed to clear pavement ants
  satellites: {
    wall:  { name: 'Wall nest',  cost: { paper: 25, crumbs: 30 },  antCap: 10, brood: 0.04, max: 6, desc: '+10 living space, brood +4% (warm)' },
    drain: { name: 'Drain nest', cost: { grease: 15, crumbs: 20 }, antCap: 6, upkeep: 0.02, max: 4, desc: '+6 living space, upkeep −2% (scraps)' },
  } as Record<string, { name: string; cost: Record<string, number>; antCap: number; brood?: number; upkeep?: number; max: number; desc: string }>,
  upgrades: {
    feet:    { name: 'Quiet feet',    desc: 'Attention grows {p} slower per level', per: 0.03, base: { crumbs: 30, paper: 10 }, growth: 1.2, max: 20 },
    tooth:   { name: 'Sweet tooth',   desc: 'Town yields +{p} per level',          per: 0.03, base: { sugar: 15, crumbs: 20 }, growth: 1.2, max: 30 },
    syrup:   { name: 'Sugar syrup',   desc: 'Larvae grow {p} faster per level (sugar-fed)', per: 0.02, base: { sugar: 20 },   growth: 1.2, max: 25 },
    grease:  { name: 'Greased hulls', desc: 'Voyages {p} faster per level',        per: 0.03, base: { grease: 10, twig: 10 }, growth: 1.2, max: 20 },
    filings: { name: 'Iron mandibles', desc: 'Soldiers fight {p} harder per level', per: 0.03, base: { filings: 8, chitin: 5 }, growth: 1.2, max: 30 },
  },
};

/** The supercolony (third prestige): one people across a continent of regions. */
export const SUPER = {
  needs: { migrations: 1, sites: 6, satellites: 6, heritage: 25 },   // heritage earned over all time
  cols: 10, rows: 6,
  home: [1, 3] as [number, number],
  unityPerRegion: 0.01,
  claimCost: (owned: number) => ({ unity: Math.ceil(10 * Math.pow(1.35, owned - 1)) }),
  garrison: 10,             // front strength per garrison region
  soldierShare: 0.2,        // share of this colony's soldier strength that serves on the fronts
  push: 0.5,                // progress per second per point of strength over theirs (out of 100)
  raidUnity: 0.02,          // unity per second per raided front
  pressure: 0.3,            // their pressure per second per point of strength over yours
  nationGrowth: 0.004,      // nations grow this share per minute
  roles: {
    farm:     { name: 'Farm',     mod: 'job:forager',  per: 0.01, desc: 'foragers +1% everywhere' },
    forge:    { name: 'Forge',    mod: 'soldierPower', per: 0.01, desc: 'soldiers +1% everywhere' },
    nursery:  { name: 'Nursery',  mod: 'brood',        per: 0.01, desc: 'brood +1% everywhere' },
    garrison: { name: 'Garrison', mod: '',             per: 0,    desc: '+10 strength on every front' },
  } as Record<string, { name: string; mod: string; per: number; desc: string }>,
  nations: {
    army:     { name: 'Army ants',       color: '#b04a2a', strength: 60,  aggression: 1.2, terrain: 'forest' },
    fire:     { name: 'Fire ants',       color: '#d0602e', strength: 50,  aggression: 1,   terrain: 'meadow' },
    leaf:     { name: 'Leafcutters',     color: '#6f8a3a', strength: 40,  aggression: 0.4, terrain: 'meadow' },
    weaver:   { name: 'Weaver ants',     color: '#c9a03a', strength: 45,  aggression: 0.6, terrain: 'forest' },
    honeypot: { name: 'Honeypot ants',   color: '#d08a2e', strength: 30,  aggression: 0.3, terrain: 'desert' },
  } as Record<string, { name: string; color: string; strength: number; aggression: number; terrain: string }>,
  seeds: { army: [8, 1], fire: [6, 4], leaf: [4, 0], weaver: [8, 5], honeypot: [4, 5] } as Record<string, [number, number]>,
  terrains: { meadow: '#3d4a2a', forest: '#2e3a22', marsh: '#2b4556', desert: '#7a6a44', town: '#77746e' } as Record<string, string>,
  laws: {
    scent:    { name: 'Common scent',  desc: 'Foragers +{p} per level',      per: 0.03, base: { unity: 15 }, growth: 1.25, max: 30 },
    brood:    { name: 'One brood',     desc: 'Eggs and larvae +{p} per level', per: 0.03, base: { unity: 15 }, growth: 1.25, max: 30 },
    roads:    { name: 'Highways',      desc: 'Unity +{p} per level',         per: 0.05, base: { unity: 20 }, growth: 1.3,  max: 20 },
    army:     { name: 'Standing army', desc: 'Front strength +{p} per level', per: 0.05, base: { unity: 20 }, growth: 1.3, max: 20 },
    stores:   { name: 'Shared stores', desc: 'Upkeep −{p} per level',        per: 0.02, base: { unity: 25 }, growth: 1.3,  max: 15 },
  },
};
