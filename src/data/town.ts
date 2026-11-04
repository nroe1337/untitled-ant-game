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
  caps: { crumbs: 120, sugar: 60, grease: 40, paper: 60, filings: 40 },
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
