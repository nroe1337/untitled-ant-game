// The wider tech tree (Nov 12): about 160 techs that fill every age to Nate's targets
// (minor eras Dirt and Forage 10-15 techs, major eras 30+). Each gives a real effect through shared mods
// or a storage bonus, so the tree is worth climbing now. Techs tagged `screen` belong to a screen that
// isn't built yet (workshop, deepdig, broodraids, strains, scentlang, launch...): when that screen is
// built, find its tagged techs and rewire them to unlock its parts.
// Costs here are base costs; balance.ts scales them by age like every other tech.

export interface TechDef {
  name: string; age: string; cost: Record<string, number>; needs: string[]; flag?: string; pop?: number; desc: string;
  /** Shared mods this tech adds while learned (summed with every other source). */
  mods?: Record<string, number>;
  /** Flat storage added while learned. */
  caps?: Record<string, number>;
  /** A future screen this tech will open parts of. */
  screen?: string;
}

const PCT: Record<string, [string, boolean?]> = {
  'job:forager': ['Foragers'], 'job:digger': ['Diggers'], 'job:elder': ['Elders'], 'job:scout': ['Scouts'],
  'job:leafcutter': ['Leafcutters'], 'job:weaver': ['Weavers'], 'job:gardener': ['Gardeners'],
  brood: ['Brood grows'], expLoot: ['Expedition loot'], soldierPower: ['Soldiers fight'], sortieLoot: ['Sortie finds'],
  sortieSpeed: ['Sorties'], voyageSpeed: ['Voyages'], herdYield: ['Herds'], townYield: ['Town sites'],
  majorHp: ['Majors\' health'], majorAtk: ['Majors\' bite'], repleteJelly: ['Repletes make jelly'], hunting: ['Off-duty hunting'],
  livingSpace: ['Living space from chambers'], lineageGain: ['Lineage from flights'],
  upkeep: ['Food eaten', true], mouldMade: ['Mould gathered', true], chamberCost: ['Chamber costs', true],
  claimCost: ['Land claim costs', true], expSafety: ['Workers lost on expeditions', true], sortieRisk: ['Flyers lost on sorties', true],
  attention: ['Human attention', true], expSpeed: ['Expedition time', true],
};
const FLAT: Record<string, (n: number) => string> = {
  'slotsPer:soldier': (n) => `+${n} soldier per Guard post`, 'slotsPer:nurse': (n) => `+${n} nurse per Nurses' den`,
  'slots:nurse': (n) => `+${n} nurses`, majorRatio: () => 'One more major per soldier squad',
  repleteMax: (n) => `+${n} repletes`, nurseTends: (n) => `Each nurse tends ${n} more egg or larva`,
  queueSlots: (n) => `+${n} building and research queue slot`, upgradeSlots: (n) => `+${n} upgrade queue slot`,
  boatSlots: (n) => `+${n} boat at sea`, mouldClean: (n) => `Scrubs ${n} mould/s`,
};
const RES_NAME: Record<string, string> = { egg: 'brood', knowledge: 'knowledge', food: 'food', seed: 'seed', sugar: 'sugar', crumbs: 'crumb', grease: 'grease', paper: 'paper', clay: 'clay', jelly: 'royal jelly', wax: 'wax' };

/** Effects in the house style: terse, effect only ('Diggers +10%'). */
function effects(mods: Record<string, number> = {}, caps: Record<string, number> = {}) {
  const out: string[] = [];
  for (const [k, v] of Object.entries(mods)) {
    if (FLAT[k]) { out.push(FLAT[k](v)); continue; }
    const p = PCT[k]; if (!p) throw new Error('techs2: no label for mod ' + k);
    const pct = Math.round(Math.abs(v) * 100);
    out.push(`${p[0]} ${v < 0 ? '−' : '+'}${pct}%`);
  }
  for (const [r, n] of Object.entries(caps)) out.push(`+${n.toLocaleString('en-US')} ${RES_NAME[r] ?? r} storage`);
  return out.join(', ') + '.';
}

type Row = [id: string, name: string, needs: string[], cost: Record<string, number>, mods?: Record<string, number>, caps?: Record<string, number>, extra?: { screen?: string; flag?: string; lead?: string }];
const AGE_ROWS: Record<string, Row[]> = {
  dirt: [
    // Dirt research changes how the colony works rather than adding a few percent (Nate, Nov 14).
    ['buriedfinds', 'Buried finds', ['digging'], { knowledge: 15, soil: 25 }, {}, {}, { lead: 'Now and then a digger strikes something buried: a root to eat, a seed, or a loose pocket of soil.' }],
    ['broodrhythm', 'Brood rhythm', ['brood'], { knowledge: 30, food: 30 }, {}, {}, { lead: 'Set the brood\'s pace on the Queen tab: Quick larvae grow faster but eat more, Lean larvae eat less but grow slower.' }],
    ['faminelaw', 'Famine law', ['brood'], { knowledge: 20, food: 20 }, {}, {}, { lead: 'When the colony starves, nurses feed eggs and then larvae to the workers before any worker dies.' }],
  ],
  conquest: [
    // Outposts (Nov 14): they push the colony's reach out across the bigger garden, and these make them worth it.
    ['lookouts', 'Lookouts', ['cartography'], { knowledge: 340, pheromone: 40 }, {}, {}, { lead: 'Each outpost keeps a lookout who clears fog around it on its own, paid for with a resource you choose on the Map.' }],
    ['foragingcamps', 'Foraging camps', ['cartography'], { knowledge: 380, food: 250 }, {}, {}, { lead: 'Held tiles next to an outpost yield twice as much.' }],
    ['terrainworks', 'Terrain works', ['lookouts'], { knowledge: 420, twig: 40 }, {}, {}, { lead: 'Each outpost works its own ground: stone gives resin, grass twigs, bare soil seeds, streams pheromone, patio slabs food.' }],
    ['waystations', 'Waystations', ['terrainworks'], { knowledge: 480, soil: 300 }, {}, {}, { lead: 'Outposts become waystations: an outpost\'s own tile yields three times as much again.' }],
    ['linkedtrails', 'Linked trails', ['waystations'], { knowledge: 560, pheromone: 80 }, {}, {}, { lead: 'Outposts linked to the nest by a chain of outposts, each within reach of the last, share their trails: every linked outpost yields 10% more for each one in the chain.' }],
    ['alarmscent', 'Alarm scent', ['martial'], { knowledge: 320, pheromone: 30 }, { soldierPower: 0.05 }],
    ['outpostwalls', 'Outpost walls', ['fortify'], { knowledge: 420, twig: 35 }, { claimCost: -0.1 }],
    ['columnbreak', 'Column breaking', ['alarmscent', 'husks'], { knowledge: 520, chitin: 25 }, { soldierPower: 0.08 }],
    ['counterraid', 'Counter-raid', ['columnbreak'], { knowledge: 620, chitin: 30 }, { hunting: 0.25 }],
    ['broodraiding', 'Brood raiding', ['martial'], { knowledge: 400, food: 250 }, { brood: 0.05 }, {}, { screen: 'broodraids' }],
    ['captivecare', 'Captive care', ['broodraiding'], { knowledge: 480, food: 300 }, { 'job:digger': 0.05, 'job:forager': 0.05 }, {}, { screen: 'broodraids' }],
    ['mixednests', 'Mixed nests', ['captivecare', 'halls'], { knowledge: 580, soil: 400 }, { livingSpace: 0.05 }, {}, { screen: 'broodraids' }],
    ['quartermasters', 'Quartermasters', ['cartography'], { knowledge: 320, food: 220 }, { expLoot: 0.1 }],
    ['rendering', 'Husk rendering', ['husks'], { knowledge: 500, chitin: 20 }, { chamberCost: -0.03 }],
    ['fielddressing', 'Field dressing', ['martial'], { knowledge: 360, food: 200 }, { expSafety: -0.1 }],
    ['supplylines', 'Supply lines', ['frontier'], { knowledge: 560, pheromone: 30 }, { 'job:forager': 0.08 }],
    ['rivalscent', 'Rival scent', ['martial'], { knowledge: 340, pheromone: 25 }, { soldierPower: 0.05 }],
    ['widedoors', 'Wide doors', ['halls'], { knowledge: 420, soil: 300 }, { expSpeed: -0.1 }],
  ],
  wings: [
    ['deepfinds', 'Deep finds', ['deepdig'], { knowledge: 560, clay: 60 }, {}, {}, { lead: 'Diggers strike buried things three times as often, and down in the clay they turn up clay and old beetle shells (chitin).' }],
    ['deepvents', 'Deep vents', ['deepdig'], { knowledge: 500, clay: 40 }, { mouldMade: -0.05 }, {}, { lead: 'Unlocks the Deep vent, which scrubs mould for a big nest.' }],
    ['tunnelwatch', 'Tunnel watch', ['royal', 'fortify'], { knowledge: 500, chitin: 30 }, { soldierPower: 0.08 }],
    ['chokepoints', 'Choke points', ['tunnelwatch'], { knowledge: 560, clay: 40 }, { 'slotsPer:soldier': 1 }],
    ['acidglands', 'Acid glands', ['tunnelwatch', 'castes'], { knowledge: 620, chitin: 40 }, { majorAtk: 0.15 }],
    ['trapjaws', 'Trap jaws', ['acidglands'], { knowledge: 700, chitin: 50 }, { majorRatio: 1 }],
    ['resinsnares', 'Resin snares', ['chokepoints'], { knowledge: 600, resin: 30 }, { soldierPower: 0.06 }],
    ['deepdefence', 'Deep defence', ['trapjaws', 'resinsnares'], { knowledge: 800, clay: 80 }, { majorHp: 0.2 }],
    ['guestlore', 'Guest lore', ['royal'], { knowledge: 480, food: 400 }, { upkeep: -0.04 }, {}, { screen: 'guests' }],
    ['beetlelodgers', 'Beetle lodgers', ['guestlore'], { knowledge: 540, food: 450 }, { mouldMade: -0.1 }, {}, { screen: 'guests' }],
    ['crickets', 'Cricket singers', ['guestlore'], { knowledge: 540, food: 450 }, { brood: 0.05 }, {}, { screen: 'guests' }],
    ['parasitesense', 'Parasite sense', ['beetlelodgers', 'crickets'], { knowledge: 650, jelly: 12 }, { repleteJelly: 0.2 }, {}, { screen: 'guests' }],
    ['winterclusters', 'Winter clusters', ['royal'], { knowledge: 460, food: 500 }, { upkeep: -0.05 }],
    ['springswarm', 'Spring swarming', ['winterclusters'], { knowledge: 540, food: 500 }, { brood: 0.06 }],
    ['seedcaches', 'Seed caches', ['winterclusters'], { knowledge: 500, seed: 20 }, {}, { seed: 40 }],
    ['warmtunnels', 'Warm tunnels', ['springswarm', 'deepdig'], { knowledge: 640, clay: 60 }, { brood: 0.04 }],
    ['richjelly', 'Rich jelly', ['castes'], { knowledge: 600, food: 600 }, { repleteJelly: 0.25 }],
    ['royaltasters', 'Royal tasters', ['castes'], { knowledge: 560, jelly: 10 }, {}, { jelly: 10 }],
    ['casteschools', 'Caste schools', ['castes'], { knowledge: 640, jelly: 15 }, { 'job:weaver': 0.15 }],
    ['deeprepletes', 'Deep repletes', ['richjelly'], { knowledge: 700, food: 700 }, { repleteMax: 4 }],
    ['majordrills', 'Major drills', ['castes', 'campaigns'], { knowledge: 720, chitin: 50 }, { majorAtk: 0.1, majorHp: 0.1 }],
    ['thermals', 'Thermals', ['sky'], { knowledge: 520, pheromone: 40 }, { sortieSpeed: 0.1 }],
    ['wingmaps', 'Wing maps', ['thermals'], { knowledge: 600, pheromone: 50 }, { sortieLoot: 0.1 }],
    ['birdwatch', 'Bird watch', ['thermals'], { knowledge: 600, food: 500 }, { sortieRisk: -0.1 }],
    ['kinenvoys', 'Kin envoys', ['wingmaps', 'bordernests'], { knowledge: 760, amber: 6 }, { claimCost: -0.1 }],
  ],
  settlement: [
    ['humanhabits', 'Human habits', ['nightwork'], { knowledge: 420, crumbs: 60 }, { attention: -0.1 }, {}, { screen: 'nightstreets' }],
    ['catwatch', 'Cat watch', ['humanhabits'], { knowledge: 480, crumbs: 70 }, { townYield: 0.1 }, {}, { screen: 'nightstreets' }],
    ['softsteps', 'Soft steps', ['humanhabits'], { knowledge: 500, sugar: 30 }, { attention: -0.1 }, {}, { screen: 'nightstreets' }],
    ['baitreading', 'Bait reading', ['tasting'], { knowledge: 440, crumbs: 60 }, { attention: -0.08 }, {}, { screen: 'nightstreets' }],
    ['secondqueen', 'Second queen', ['papercraft'], { knowledge: 600, food: 800 }, { brood: 0.08 }, {}, { screen: 'queens' }],
    ['queennests', 'Queen nests', ['secondqueen'], { knowledge: 680, paper: 50 }, { 'slots:nurse': 6 }, {}, { screen: 'queens' }],
    ['genecourts', 'Gene courts', ['queennests'], { knowledge: 760, sugar: 40 }, { brood: 0.06, lineageGain: 0.05 }, {}, { screen: 'queens' }],
    ['royalrelay', 'Royal relay', ['genecourts'], { knowledge: 820, wax: 200 }, { nurseTends: 1 }, {}, { screen: 'queens' }],
    ['strainlore', 'Strain lore', ['tasting', 'fungus'], { knowledge: 450, leaf: 40 }, { 'job:gardener': 0.1 }, {}, { screen: 'strains' }],
    ['crossbreeding', 'Cross-breeding', ['strainlore'], { knowledge: 520, fungus: 12 }, { 'job:leafcutter': 0.1 }, {}, { screen: 'strains' }],
    ['mouldproof', 'Mould-proof strain', ['crossbreeding'], { knowledge: 600, fungus: 12 }, { mouldMade: -0.1 }, {}, { screen: 'strains' }],
    ['jellystrain', 'Jelly strain', ['crossbreeding'], { knowledge: 650, fungus: 12 }, { repleteJelly: 0.2 }, {}, { screen: 'strains' }],
    ['sugarstores', 'Sugar stores', ['nightwork'], { knowledge: 400, crumbs: 50 }, {}, { sugar: 40 }],
    ['greaselamps', 'Grease lamps', ['nightwork'], { knowledge: 500, grease: 30 }, { townYield: 0.15 }],
    ['paperlibraries', 'Paper libraries', ['papercraft'], { knowledge: 520, paper: 50 }, {}, { knowledge: 3000 }],
    ['wallcavities', 'Wall cavities', ['papercraft'], { knowledge: 560, paper: 50 }, { livingSpace: 0.08 }],
    ['drainroutes', 'Drain routes', ['pavement'], { knowledge: 540, grease: 30 }, {}, { grease: 40 }],
    ['crumbcaches', 'Crumb caches', ['tasting'], { knowledge: 420, crumbs: 60 }, {}, { crumbs: 100 }],
    ['townharbour', 'Town harbour', ['townlore', 'rafts'], { knowledge: 500, wax: 150 }, { voyageSpeed: 0.1 }],
    ['gutterboats', 'Gutter boats', ['townharbour'], { knowledge: 580, grease: 30 }, { boatSlots: 1 }],
    ['rainbarrels', 'Rain barrels', ['townlore'], { knowledge: 420, paper: 30 }, {}, { paper: 60 }],
    ['windowsill', 'Windowsill garden', ['strainlore'], { knowledge: 600, leaf: 40 }, { 'job:gardener': 0.1, 'job:leafcutter': 0.05 }],
  ],
  industry: [
    ['beetletaming', 'Beetle taming', ['metalwork'], { knowledge: 700, food: 1200 }, { 'job:forager': 0.08 }, {}, { screen: 'rail' }],
    ['raillines', 'Rail lines', ['beetletaming'], { knowledge: 760, filings: 20 }, { expSpeed: -0.1 }, {}, { screen: 'rail' }],
    ['points', 'Points and sidings', ['raillines'], { knowledge: 820, filings: 25 }, { claimCost: -0.1 }, {}, { screen: 'rail' }],
    ['nighttrains', 'Night trains', ['raillines'], { knowledge: 820, grease: 35 }, { townYield: 0.1 }, {}, { screen: 'rail' }],
    ['freightcars', 'Freight cars', ['points'], { knowledge: 900, filings: 25 }, { expLoot: 0.15 }, {}, { screen: 'rail' }],
    ['raildepots', 'Rail depots', ['freightcars', 'nighttrains'], { knowledge: 1000, clay: 100 }, {}, { food: 3000 }, { screen: 'rail' }],
    ['shafts', 'Shafts', ['metalwork', 'deepdig'], { knowledge: 720, clay: 80 }, { 'job:digger': 0.1 }, {}, { screen: 'deepdig' }],
    ['pitprops', 'Pit props', ['shafts'], { knowledge: 780, twig: 30 }, { livingSpace: 0.06 }, {}, { screen: 'deepdig' }],
    ['pumps', 'Pumps', ['pitprops'], { knowledge: 850, filings: 20 }, { mouldMade: -0.1 }, {}, { screen: 'deepdig' }],
    ['fossils', 'Fossil reading', ['shafts'], { knowledge: 820, clay: 80 }, { 'job:elder': 0.1 }, {}, { screen: 'deepdig' }],
    ['amberseams', 'Amber seams', ['pumps'], { knowledge: 900, amber: 20 }, { expLoot: 0.1 }, {}, { screen: 'deepdig' }],
    ['bedrock', 'Bedrock', ['amberseams', 'fossils'], { knowledge: 1050, clay: 120 }, {}, { clay: 200 }, { screen: 'deepdig' }],
    ['workbench', 'Workbench', ['metalwork'], { knowledge: 700, filings: 15 }, { chamberCost: -0.04 }, {}, { screen: 'workshop' }],
    ['irontips', 'Iron tips', ['workbench'], { knowledge: 780, filings: 25 }, { soldierPower: 0.1 }, {}, { screen: 'workshop' }],
    ['gears', 'Gears', ['workbench'], { knowledge: 800, filings: 25 }, { upgradeSlots: 1 }, {}, { screen: 'workshop' }],
    ['waterwheels', 'Water wheels', ['gears'], { knowledge: 880, wax: 300 }, { 'job:forager': 0.1 }, {}, { screen: 'workshop' }],
    ['broodheaters', 'Brood heaters', ['gears'], { knowledge: 880, grease: 35 }, { brood: 0.08 }, {}, { screen: 'workshop' }],
    ['toolracks', 'Tool racks', ['waterwheels'], { knowledge: 950, filings: 30 }, { 'job:forager': 0.05, 'job:digger': 0.05, 'job:elder': 0.05 }, {}, { screen: 'workshop' }],
    ['waxboilers', 'Wax boilers', ['broodheaters'], { knowledge: 950, wax: 400 }, { repleteJelly: 0.2 }, {}, { screen: 'workshop' }],
    ['paddlewheels', 'Paddle wheels', ['gears', 'townharbour'], { knowledge: 860, wax: 300 }, { voyageSpeed: 0.12 }],
    ['steamhulls', 'Steam hulls', ['paddlewheels'], { knowledge: 950, filings: 30 }, { voyageSpeed: 0.1 }],
    ['locks', 'Locks', ['steamhulls'], { knowledge: 1050, clay: 100 }, { boatSlots: 1 }],
    ['foremen', 'Foremen', ['ledgers'], { knowledge: 900, paper: 60 }, { upgradeSlots: 1 }],
    ['storeclerks', 'Store clerks', ['foremen'], { knowledge: 950, paper: 60 }, { queueSlots: 1 }],
    ['shiftbells', 'Shift bells', ['foremen'], { knowledge: 900, grease: 35 }, { townYield: 0.1 }],
    ['supplydepots', 'Supply depots', ['raillines'], { knowledge: 880, wax: 300 }, { upkeep: -0.05 }],
    ['standardparts', 'Standard parts', ['workbench'], { knowledge: 950, filings: 25 }, { chamberCost: -0.05 }],
    ['greenhouses', 'Greenhouses', ['windowsill', 'workbench'], { knowledge: 850, paper: 50 }, { 'job:gardener': 0.15 }],
    ['growlamps', 'Grow lamps', ['greenhouses'], { knowledge: 920, grease: 35 }, { 'job:leafcutter': 0.15 }],
    ['compostheat', 'Compost heat', ['greenhouses'], { knowledge: 920, leaf: 40 }, { herdYield: 0.15 }],
  ],
  network: [
    ['scentnotes', 'Scent notes', ['metalwork'], { knowledge: 1000, honeydew: 500 }, { 'job:scout': 0.15 }, {}, { screen: 'scentlang', flag: 'legacy:super' }],
    ['grammar', 'Signal grammar', ['scentnotes'], { knowledge: 1100, honeydew: 600 }, { 'job:elder': 0.1 }, {}, { screen: 'scentlang' }],
    ['standingorders', 'Standing orders', ['grammar'], { knowledge: 1200, wax: 400 }, { upgradeSlots: 1 }, {}, { screen: 'scentlang' }],
    ['relayants', 'Relay ants', ['grammar'], { knowledge: 1150, food: 2000 }, { expSpeed: -0.1 }, {}, { screen: 'scentlang' }],
    ['alarmnet', 'Alarm network', ['relayants'], { knowledge: 1250, chitin: 80 }, { soldierPower: 0.1 }, {}, { screen: 'scentlang' }],
    ['sharedmemory', 'Shared memory', ['standingorders'], { knowledge: 1300, amber: 30 }, {}, { knowledge: 6000 }, { screen: 'scentlang' }],
    ['barter', 'Barter', ['scentnotes'], { knowledge: 1050, honeydew: 600 }, { herdYield: 0.1 }, {}, { screen: 'market' }],
    ['caravans', 'Caravans', ['barter'], { knowledge: 1150, wax: 400 }, { expLoot: 0.1 }, {}, { screen: 'market' }],
    ['pricesense', 'Price sense', ['caravans'], { knowledge: 1200, amber: 30 }, { chamberCost: -0.04 }, {}, { screen: 'market' }],
    ['caravanguards', 'Caravan guards', ['caravans'], { knowledge: 1200, chitin: 80 }, { expSafety: -0.15 }, {}, { screen: 'market' }],
    ['tradeledgers', 'Trade ledgers', ['pricesense'], { knowledge: 1300, paper: 60 }, { claimCost: -0.1 }, {}, { screen: 'market' }],
    ['regionroles', 'Region roles', ['scentnotes'], { knowledge: 1050, food: 2500 }, { 'job:forager': 0.06 }],
    ['farmregions', 'Farm regions', ['regionroles'], { knowledge: 1150, food: 3000 }, { upkeep: -0.05 }],
    ['forgeregions', 'Forge regions', ['regionroles'], { knowledge: 1150, filings: 30 }, { 'job:digger': 0.08 }],
    ['nurseryregions', 'Nursery regions', ['regionroles'], { knowledge: 1150, jelly: 15 }, { brood: 0.06 }],
    ['garrisonregions', 'Garrison regions', ['regionroles'], { knowledge: 1150, chitin: 80 }, { majorHp: 0.1 }],
    ['regionroads', 'Region roads', ['farmregions', 'forgeregions'], { knowledge: 1300, clay: 120 }, { expSpeed: -0.08 }],
    ['borderwatch', 'Border watch', ['garrisonregions'], { knowledge: 1250, chitin: 100 }, { majorAtk: 0.1 }],
    ['livingfronts', 'Living fronts', ['borderwatch', 'nurseryregions'], { knowledge: 1400, food: 4000 }, { soldierPower: 0.1 }],
    ['standingexp', 'Standing expeditions', ['relayants'], { knowledge: 1200, food: 2500 }, { expLoot: 0.12 }],
    ['sharedroutes', 'Shared routes', ['standingexp'], { knowledge: 1250, honeydew: 700 }, { expSafety: -0.1 }],
    ['scoutingnet', 'Scouting net', ['sharedroutes'], { knowledge: 1300, pheromone: 60 }, { sortieLoot: 0.15 }],
    ['broodwhereneeded', 'Brood where needed', ['nurseryregions'], { knowledge: 1250, food: 3000 }, { nurseTends: 1 }],
    ['greatnurseries', 'Great nurseries', ['broodwhereneeded'], { knowledge: 1350, clay: 120 }, {}, { egg: 20 }],
    ['broodcouriers', 'Brood couriers', ['greatnurseries'], { knowledge: 1400, jelly: 15 }, { brood: 0.08 }],
    ['sealanes', 'Sea lanes', ['scentnotes', 'locks'], { knowledge: 1200, wax: 500 }, { voyageSpeed: 0.12 }],
    ['islandchains', 'Island chains', ['sealanes'], { knowledge: 1300, amber: 30 }, { voyageSpeed: 0.1 }],
    ['contarchive', 'Continental archive', ['sharedmemory'], { knowledge: 1400, amber: 40 }, { lineageGain: 0.1 }],
    ['unitycouncils', 'Unity councils', ['regionroles'], { knowledge: 1200, honeydew: 800 }, { livingSpace: 0.06 }],
    ['census', 'Census', ['regionroles'], { knowledge: 1100, paper: 60 }, { 'job:elder': 0.08 }],
  ],
  orbital: [
    ['rocketry', 'Rocketry', ['standingorders', 'toolracks'], { knowledge: 1500, filings: 30 }, { chamberCost: -0.04 }, {}, { screen: 'launch' }],
    ['sugarfuel', 'Sugar fuel', ['rocketry'], { knowledge: 1600, sugar: 40 }, { townYield: 0.1 }, {}, { screen: 'launch' }],
    ['stages', 'Stages', ['rocketry'], { knowledge: 1650, filings: 30 }, { queueSlots: 1 }, {}, { screen: 'launch' }],
    ['scentcompass', 'Scent compass', ['stages'], { knowledge: 1700, pheromone: 60 }, { sortieSpeed: 0.15 }, {}, { screen: 'launch' }],
    ['heatshields', 'Chitin heat shields', ['stages'], { knowledge: 1750, chitin: 150 }, { majorHp: 0.1 }, {}, { screen: 'launch' }],
    ['payloadbays', 'Payload bays', ['heatshields', 'scentcompass'], { knowledge: 1850, wax: 600 }, {}, { wax: 1000 }, { screen: 'launch' }],
    ['launchwindows', 'Launch windows', ['payloadbays'], { knowledge: 1900, amber: 40 }, { lineageGain: 0.1 }, {}, { screen: 'launch' }],
    ['recovery', 'Recovery', ['launchwindows'], { knowledge: 2000, filings: 30 }, { expSafety: -0.15 }, {}, { screen: 'launch' }],
    ['perimeter', 'Launch perimeter', ['rocketry'], { knowledge: 1600, chitin: 150 }, { soldierPower: 0.1 }],
    ['birdnets', 'Bird nets', ['perimeter'], { knowledge: 1700, silk: 15 }, { sortieRisk: -0.15 }],
    ['waspdecoys', 'Wasp decoys', ['perimeter'], { knowledge: 1700, wax: 500 }, { expSafety: -0.1 }],
    ['distraction', 'Human distraction', ['perimeter'], { knowledge: 1700, sugar: 40 }, { attention: -0.15 }],
    ['laststand', 'Last stand', ['birdnets', 'waspdecoys'], { knowledge: 1900, chitin: 200 }, { majorAtk: 0.15, majorHp: 0.15 }],
    ['wiredqueen', 'Wired queen', ['rocketry'], { knowledge: 1650, filings: 30 }, { brood: 0.08 }],
    ['eggvault', 'Egg vault', ['wiredqueen'], { knowledge: 1750, wax: 600 }, {}, { egg: 30 }],
    ['coldsleep', 'Cold sleep', ['eggvault'], { knowledge: 1850, honeydew: 1000 }, { upkeep: -0.06 }],
    ['queeninorbit', 'Queen in orbit', ['coldsleep', 'launchwindows'], { knowledge: 2100, amber: 50 }, { lineageGain: 0.15 }],
    ['satellites', 'Satellites', ['stages'], { knowledge: 1700, filings: 30 }, { claimCost: -0.15 }],
    ['orbitalmap', 'Orbital map', ['satellites'], { knowledge: 1800, paper: 60 }, { sortieLoot: 0.15 }],
    ['seedpods', 'Seed pods', ['orbitalmap'], { knowledge: 1850, seed: 20 }, { 'job:forager': 0.08 }],
    ['landinglegs', 'Landing legs', ['seedpods'], { knowledge: 1900, filings: 30 }, { expSpeed: -0.1 }],
    ['farcolonies', 'Far colonies', ['landinglegs'], { knowledge: 2000, food: 6000 }, { livingSpace: 0.08 }],
    ['starscents', 'Star scents', ['farcolonies'], { knowledge: 2100, pheromone: 80 }, { 'job:scout': 0.2 }],
    ['scrapruns', 'Scrap runs', ['rocketry'], { knowledge: 1600, food: 4000 }, { expLoot: 0.15 }],
    ['circuitboards', 'Circuit boards', ['scrapruns'], { knowledge: 1750, grease: 40 }, { 'job:elder': 0.1 }],
    ['siteclaims', 'Launch site claims', ['circuitboards'], { knowledge: 1850, clay: 150 }, { claimCost: -0.1 }],
    ['voyagefungus', 'Voyage fungus', ['rocketry', 'greenhouses'], { knowledge: 1650, fungus: 12 }, { 'job:gardener': 0.15 }],
    ['sealedgardens', 'Sealed gardens', ['voyagefungus'], { knowledge: 1800, wax: 600 }, { herdYield: 0.15 }],
    ['longsleep', 'The long sleep', ['queeninorbit'], { knowledge: 2200, honeydew: 1500 }, { lineageGain: 0.1 }],
    ['newworld', 'New world', ['longsleep', 'starscents'], { knowledge: 2400, amber: 60 }, { livingSpace: 0.1, brood: 0.1 }],
  ],
};

export const MORE_TECHS: Record<string, TechDef> = {};
for (const [age, rows] of Object.entries(AGE_ROWS)) for (const [id, name, needs, cost, mods = {}, caps = {}, extra = {}] of rows) {
  MORE_TECHS[id] = {
    name, age, cost, needs, mods, caps,
    ...(extra.flag ? { flag: extra.flag } : {}),
    ...(extra.screen ? { screen: extra.screen } : {}),
    desc: (extra.lead ? extra.lead + ' ' : '') + (Object.keys(mods).length || Object.keys(caps).length ? effects(mods, caps) : ''),
  };
}
