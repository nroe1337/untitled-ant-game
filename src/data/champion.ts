// Champion hunts: tuning and content. One named ant fights its way through hunting grounds.
// Idle it fights very slowly; while you use its abilities it fights at full speed (about 5x).
// Loot is gear for the champion: every foe drops a piece of its ground's set. Duplicates level
// up the piece you already own (no inventory to manage), and rare rolls add a trait.

export type Slot = 'mandibles' | 'head' | 'carapace' | 'legs' | 'antennae' | 'gland' | 'charm';
export type Stat = 'atk' | 'hp' | 'def' | 'speed' | 'crit' | 'luck' | 'regen' | 'venom' | 'xp';

export const CHAMPION = {
  idleSpeed: 0.2,           // fight speed with nobody at the controls
  activeWindow: 15,         // seconds of full speed after you use an ability
  raiseCost: { food: 30 },
  names: ['Kesh', 'Ottilie', 'Bramble', 'Sefa', 'Rook', 'Ilsabet', 'Tamsin', 'Varro', 'Quill', 'Hesper'],

  base: { atk: 3, hp: 30, def: 0, swing: 2 },  // before level and gear
  perLevel: 0.04,           // atk and hp grow 4% per level, compounding
  xpBase: 12, xpGrowth: 1.2, // xp to reach the next level
  regen: 0.01,              // share of max hp regained per second (fight time)
  recoverTime: 60,          // seconds to get back up after a defeat
  retreatDepth: 3,          // (old saves) a defeat pushed you back this many foes
  /** The fight level: you pick it (or let Auto pick). Each ground spans levelsPerGround levels; every
   *  bossEvery levels a guardian (halfway) or the ground's boss (at the end) bars the way on. */
  levelsPerGround: 20, bossEvery: 10,
  auto: { climbAfter: 3, minHp: 0.5, dropOnLoss: 2, holdAfterLoss: 120 },
  gap: 2,                   // seconds between foes

  foe: { hp: 10, atk: 2, scale: 1.09, xp: 4, xpScale: 1.075, swing: 2.4 },
  boss: { hp: 5, atk: 1.6, extraLevels: 3 },
  guardian: { hp: 3, atk: 1.3, extraLevels: 1 },   // the halfway foe of a ground: an elder of one of its kinds
  foodPerKill: 0.6,         // meat brought home per kill, times (1 + level / 10)

  /** Abilities. Cooldowns are in game seconds and tick at the same rate whether you're watching or not. */
  abilities: {
    bite:  { name: 'Bite',   cd: 5,  lvl: 1, desc: 'A hard bite: 2.5x attack.' },
    sting: { name: 'Sting',  cd: 12, lvl: 1, desc: 'Poison: half your attack (plus venom) every second for 8 seconds.' },
    brace: { name: 'Brace',  cd: 15, lvl: 2, desc: 'Take a quarter of the damage for 4 seconds.' },
    groom: { name: 'Groom',  cd: 30, lvl: 4, desc: 'Heal 35% of your health.' },
    acid:  { name: 'Acid',   cd: 40, lvl: 8, desc: 'A spray of formic acid: 6x attack.' },
  } as Record<string, { name: string; cd: number; lvl: number; desc: string }>,

  /** Gear. Item level rises by one for each duplicate found, up to maxLevel. */
  gear: {
    maxLevel: 20,
    perLevel: 0.08,          // +8% of the item's stats per level above 1
    quality: [
      { name: 'Common', mult: 1, chance: 0.8 },
      { name: 'Fine', mult: 1.3, chance: 0.17 },
      { name: 'Rare', mult: 1.7, chance: 0.03 },   // rare also rolls a trait
    ],
    tier: 4,                 // each ground's items are this many times stronger than the last (flat stats)
    dropChance: 0.1,         // chance a normal foe drops its item
    rareFind: 0.004,         // chance any foe drops the ground's hidden charm
    deepQuality: 0.01,       // past the boss, each foe of depth adds this to Fine/Rare odds
    slots: ['mandibles', 'head', 'carapace', 'legs', 'antennae', 'gland', 'charm', 'charm'] as Slot[],
  },

  traits: {
    vampiric: { name: 'Vampiric', desc: 'heals 8% of damage dealt' },
    thorny:   { name: 'Thorny',   desc: 'reflects 15% of damage taken' },
    swift:    { name: 'Swift',    desc: 'swings 10% faster' },
    lucky:    { name: 'Lucky',    desc: '+15% drop chance' },
    hardy:    { name: 'Hardy',    desc: '+1% health regained per second' },
    keen:     { name: 'Keen',     desc: '+8% critical hits' },
  } as Record<string, { name: string; desc: string }>,

  /** Linear training, paid for by the colony. */
  training: {
    grip:    { name: 'Grip drills',    desc: 'Champion attack +{p} per level',   per: 0.03, base: { food: 40, chitin: 2 },   growth: 1.2,  max: 40 },
    shell:   { name: 'Shell hardening', desc: 'Champion health +{p} per level',  per: 0.03, base: { food: 40, soil: 30 },    growth: 1.2,  max: 40 },
    stamina: { name: 'Stamina',        desc: 'Fights {p} faster while you are away, per level', per: 0.01, base: { food: 80, fungus: 10 }, growth: 1.3, max: 10 },
    focus:   { name: 'Focus',          desc: 'Full speed lasts {p}s longer after an ability, per level', per: 2, base: { food: 60, pheromone: 10 }, growth: 1.25, max: 10, unit: 'flat' as const },
    wraps:   { name: 'Silk wraps',     desc: 'Champion health +{p} per level', per: 0.03, base: { silk: 3 }, growth: 1.18, max: 40 },
    nets:    { name: 'Hunting nets',   desc: 'Champion finds {p} more drops per level', per: 0.05, base: { silk: 4, food: 40 }, growth: 1.2, max: 20 },
    instinct:{ name: 'Hunting instinct', desc: 'The champion bites on its own when Bite is ready', per: 1, base: { chitin: 20, fungus: 40 }, growth: 1, max: 1, unit: 'flat' as const },
  },

  /** Colony bonuses per champion level (the hero inspires the workers). */
  colony: { soldierPower: 0.004, expLoot: 0.004 },

  /** Hunting grounds, in order. Beating a ground's boss opens the next. */
  grounds: [
    { id: 'litter', name: 'Leaf litter', level: 0, bossAt: 25, ground: '#4a3626', sky: '#2a2018',
      flavor: 'Damp, dark and crowded. Everything here is small, and everything here bites.',
      set: { name: 'Litter set', three: { hp: 0.15 }, six: { hp: 0.15, regen: 0.01 } },
      foes: [
        { id: 'springtail', name: 'Springtail', hp: 0.7, atk: 0.8, size: 3, color: '#9aa0a6', drop: 'springtail_feelers' },
        { id: 'mite', name: 'Mite', hp: 0.8, atk: 1, size: 2, color: '#c4532f', drop: 'mite_husk' },
        { id: 'woodlouse', name: 'Woodlouse', hp: 1.6, atk: 0.7, size: 5, color: '#5d5b57', drop: 'woodlouse_plate' },
        { id: 'earwig', name: 'Earwig', hp: 1.1, atk: 1.3, size: 5, color: '#7a4a2a', drop: 'earwig_pincers' },
      ],
      boss: { id: 'wolfspider', name: 'Wolf spider', size: 10, color: '#6b5a44', drop: 'wolf_eyes', trophy: 'wolf_fang' },
      rare: 'dew_lens' },
    { id: 'woodpile', name: 'The woodpile', level: 22, bossAt: 25, ground: '#5a4030', sky: '#1e1812',
      flavor: 'Rotten logs full of tunnels that are not yours.',
      set: { name: 'Woodpile set', three: { atk: 0.15 }, six: { atk: 0.2, crit: 0.05 } },
      foes: [
        { id: 'termite', name: 'Termite soldier', hp: 1, atk: 1.2, size: 4, color: '#d9c9a0', drop: 'termite_helm' },
        { id: 'grub', name: 'Beetle grub', hp: 1.8, atk: 0.5, size: 6, color: '#e6dfd3', drop: 'grub_fat' },
        { id: 'barkbeetle', name: 'Bark beetle', hp: 1.3, atk: 1, size: 4, color: '#3a2a20', drop: 'bark_shell' },
        { id: 'centipede', name: 'Centipede', hp: 1, atk: 1.5, size: 8, color: '#a0522d', drop: 'centipede_legs' },
      ],
      boss: { id: 'stag', name: 'Stag beetle', size: 12, color: '#2e1c14', drop: 'stag_antlers', trophy: 'stag_horn' },
      rare: 'heartwood_bead' },
    { id: 'flowerbed', name: 'The flowerbed', level: 44, bossAt: 25, ground: '#3d4a2a', sky: '#2b3a2a',
      flavor: 'Bright, loud, and full of things that fly. Watch the petals: some of them are hunting.',
      set: { name: 'Bloom set', three: { luck: 0.25 }, six: { luck: 0.25, xp: 0.2 } },
      foes: [
        { id: 'lacewing', name: 'Lacewing larva', hp: 1, atk: 1.3, size: 4, color: '#8fa35a', drop: 'lacewing_jaws' },
        { id: 'hoverfly', name: 'Hoverfly', hp: 0.8, atk: 0.9, size: 5, color: '#c9a03a', drop: 'hover_wings' },
        { id: 'bee', name: 'Mining bee', hp: 1.2, atk: 1.4, size: 6, color: '#d08a2e', drop: 'bee_sting' },
        { id: 'crabspider', name: 'Crab spider', hp: 1.3, atk: 1.2, size: 6, color: '#e6dfd3', drop: 'crab_mask' },
      ],
      boss: { id: 'mantis', name: 'Praying mantis', size: 16, color: '#6f8a3a', drop: 'mantis_claw', trophy: 'mantis_arm' },
      rare: 'pollen_charm' },
    { id: 'drain', name: 'The drain', level: 66, bossAt: 25, ground: '#2b4556', sky: '#141a1e',
      flavor: 'Cold, wet iron and the smell of the house. Things grow big down here.',
      set: { name: 'Drain set', three: { def: 0.25 }, six: { def: 0.25, hp: 0.2 } },
      foes: [
        { id: 'slug', name: 'Slug', hp: 2, atk: 0.8, size: 9, color: '#77746e', drop: 'slime_coat' },
        { id: 'silverfish', name: 'Silverfish', hp: 0.9, atk: 1.2, size: 5, color: '#9aa0a6', drop: 'silver_scales' },
        { id: 'mothfly', name: 'Drain fly', hp: 0.7, atk: 1, size: 3, color: '#5d5b57', drop: 'moth_plumes' },
        { id: 'leech', name: 'Leech', hp: 1.4, atk: 1.4, size: 6, color: '#3a2a2a', drop: 'leech_gland' },
      ],
      boss: { id: 'cricket', name: 'Cave cricket', size: 16, color: '#8a6a4a', drop: 'cricket_greaves', trophy: 'cricket_leg' },
      rare: 'iron_flake' },
    { id: 'border', name: 'The rival border', level: 88, bossAt: 30, ground: '#4a3626', sky: '#1e1830',
      flavor: 'Their scent is everywhere. Their best fighters guard the line.',
      set: { name: 'Border set', three: { xp: 0.15 }, six: { atk: 0.25, xp: 0.15 } },
      foes: [
        { id: 'rscout', name: 'Rival scout', hp: 0.9, atk: 1.1, size: 4, color: '#7b6fd0', drop: 'rival_antennae' },
        { id: 'rsoldier', name: 'Rival soldier', hp: 1.3, atk: 1.3, size: 5, color: '#7b6fd0', drop: 'rival_mandibles' },
        { id: 'rmajor', name: 'Rival major', hp: 2, atk: 1.6, size: 7, color: '#5a4fb0', drop: 'rival_plate' },
        { id: 'rspitter', name: 'Rival spitter', hp: 1, atk: 1.8, size: 5, color: '#9a8fe0', drop: 'rival_gland' },
      ],
      boss: { id: 'rchampion', name: 'Rival champion', size: 12, color: '#4a3fa0', drop: 'rival_crown', trophy: 'rival_crest' },
      rare: 'queens_tear' },
  ],

  /** Every item. Flat stats (atk, hp, def, venom) scale by gear.tier per ground; the rest don't. */
  items: {
    // leaf litter
    springtail_feelers: { name: 'Springtail feelers', slot: 'antennae', ground: 'litter', stats: { crit: 0.03, luck: 0.05 } },
    mite_husk:          { name: 'Mite husk',          slot: 'charm',    ground: 'litter', stats: { hp: 6, regen: 0.002 } },
    woodlouse_plate:    { name: 'Woodlouse plate',    slot: 'carapace', ground: 'litter', stats: { hp: 12, def: 0.4 } },
    earwig_pincers:     { name: 'Earwig pincers',     slot: 'mandibles', ground: 'litter', stats: { atk: 1.5 } },
    wolf_eyes:          { name: 'Wolf spider eyes',   slot: 'head',     ground: 'litter', stats: { atk: 1, crit: 0.04 } },
    dew_lens:           { name: 'Dewdrop lens',       slot: 'charm',    ground: 'litter', stats: { luck: 0.2, xp: 0.1 }, rare: true },
    // woodpile
    termite_helm:       { name: 'Termite helm',       slot: 'head',     ground: 'woodpile', stats: { atk: 0.8, def: 0.5 } },
    grub_fat:           { name: 'Grub fat',           slot: 'gland',    ground: 'woodpile', stats: { hp: 10, regen: 0.003 } },
    bark_shell:         { name: 'Bark shell',         slot: 'carapace', ground: 'woodpile', stats: { hp: 10, def: 0.6 } },
    centipede_legs:     { name: 'Centipede legs',     slot: 'legs',     ground: 'woodpile', stats: { speed: 0.08, hp: 4 } },
    stag_antlers:       { name: 'Stag antlers',       slot: 'mandibles', ground: 'woodpile', stats: { atk: 2, crit: 0.03 } },
    heartwood_bead:     { name: 'Heartwood bead',     slot: 'charm',    ground: 'woodpile', stats: { atk: 1, hp: 8 }, rare: true },
    // flowerbed
    lacewing_jaws:      { name: 'Lacewing jaws',      slot: 'mandibles', ground: 'flowerbed', stats: { atk: 1.6, venom: 0.3 } },
    hover_wings:        { name: 'Hoverfly wings',     slot: 'legs',     ground: 'flowerbed', stats: { speed: 0.1 } },
    bee_sting:          { name: 'Bee sting',          slot: 'gland',    ground: 'flowerbed', stats: { venom: 1 } },
    crab_mask:          { name: 'Crab spider mask',   slot: 'head',     ground: 'flowerbed', stats: { atk: 0.6, def: 0.4, luck: 0.08 } },
    mantis_claw:        { name: 'Mantis claw',        slot: 'charm',    ground: 'flowerbed', stats: { atk: 1.2, crit: 0.05 } },
    pollen_charm:       { name: 'Pollen charm',       slot: 'charm',    ground: 'flowerbed', stats: { luck: 0.3, regen: 0.004 }, rare: true },
    // drain
    slime_coat:         { name: 'Slime coat',         slot: 'carapace', ground: 'drain', stats: { hp: 16, regen: 0.003 } },
    silver_scales:      { name: 'Silverfish scales',  slot: 'legs',     ground: 'drain', stats: { speed: 0.07, def: 0.3 } },
    moth_plumes:        { name: 'Drain-fly plumes',   slot: 'antennae', ground: 'drain', stats: { luck: 0.1, crit: 0.03 } },
    leech_gland:        { name: 'Leech gland',        slot: 'gland',    ground: 'drain', stats: { venom: 0.8, regen: 0.003 } },
    cricket_greaves:    { name: 'Cricket greaves',    slot: 'legs',     ground: 'drain', stats: { speed: 0.12, hp: 6 } },
    iron_flake:         { name: 'Iron flake',         slot: 'charm',    ground: 'drain', stats: { def: 1, hp: 10 }, rare: true },
    // rival border
    rival_antennae:     { name: 'Rival antennae',     slot: 'antennae', ground: 'border', stats: { crit: 0.05, xp: 0.05 } },
    rival_mandibles:    { name: 'Rival mandibles',    slot: 'mandibles', ground: 'border', stats: { atk: 2.2 } },
    rival_plate:        { name: 'Major\'s plate',     slot: 'carapace', ground: 'border', stats: { hp: 14, def: 0.8 } },
    rival_gland:        { name: 'Spitter gland',      slot: 'gland',    ground: 'border', stats: { venom: 1.2 } },
    rival_crown:        { name: 'Champion\'s crest',  slot: 'head',     ground: 'border', stats: { atk: 1.2, def: 0.6, xp: 0.1 } },
    queens_tear:        { name: 'Queen\'s tear',      slot: 'charm',    ground: 'border', stats: { xp: 0.25, luck: 0.2 }, rare: true },
  } as Record<string, { name: string; slot: Slot; ground: string; stats: Partial<Record<Stat, number>>; rare?: boolean }>,

  /** Boss trophies: permanent colony bonuses (mods), kept across flights. */
  trophies: {
    wolf_fang:   { name: 'Wolf spider fang', desc: 'Expedition loot +5%', mod: 'expLoot', value: 0.05 },
    stag_horn:   { name: 'Stag beetle horn', desc: 'Diggers +5%', mod: 'job:digger', value: 0.05 },
    mantis_arm:  { name: 'Mantis forearm',   desc: 'Foragers +5%', mod: 'job:forager', value: 0.05 },
    cricket_leg: { name: 'Cricket leg',      desc: 'Soldiers fight 5% harder', mod: 'soldierPower', value: 0.05 },
    rival_crest: { name: 'Rival crest',      desc: 'Colony upkeep −3%', mod: 'upkeep', value: -0.03 },
  } as Record<string, { name: string; desc: string; mod: string; value: number }>,
};
