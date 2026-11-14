// The Guide: one page per age, opened the first time the line reaches that age. Step-by-step advice.
// Markup inside strings (rendered in colour by the Guide panel):
//   {Jobs}            a tab                     (blue)
//   [Daily routine]   research, chamber, button  (gold)
//   |food|            a resource                 (green)
//   !Careful!         a warning                  (red)

export interface GuideStep { head: string; do: string[]; tip?: string }
export interface GuidePage { age: string; goal: string; steps: GuideStep[]; next: string }

export const GUIDE: GuidePage[] = [
  {
    age: 'dirt',
    goal: 'Grow from one queen to a nest of 10 chambers, then break through to the surface.',
    steps: [
      { head: 'Get your first workers', do: [
        'The queen lays eggs on her own. Watch them hatch on the {Queen} tab.',
        'Click [Forage near the entrance] whenever it is ready. It gives |food|.',
      ], tip: 'Early on, your own clicks are most of your food. Keep clicking.' },
      { head: 'Start research', do: [
        'At 3 workers the {Research} tab opens.',
        'Learn [Tunnelling] first. It unlocks Diggers and the {Nest} tab.',
        'New research shows up as the colony does things: digs chambers, raises workers, fills its stores. Keep growing and check back.',
      ] },
      { head: 'Give everyone a job', do: [
        'Open the {Jobs} tab.',
        'Put about 2 workers on Forager for every 1 on Digger.',
        'Foragers bring |food|. Diggers bring |soil|.',
      ], tip: '!Every worker eats.! Hover |food| at the top to check it is going up, not down.' },
      { head: 'Dig chambers', do: [
        'On the {Nest} tab, dig [Resting chamber]s for living space.',
        'When living space is full, no new workers hatch. Dig ahead.',
      ] },
      { head: 'Research the basics', do: [
        'Learn [Storage chambers] (after 3 chambers), [Brood care] (after 5 workers) and [Elder memory] (when |knowledge| is nearly full).',
        'After [Brood care], every chamber slowly gathers |mould|. Put workers on Nurse to scrub it away.',
        'Dig a [Food store] or [Soil pit] whenever a resource sits at its cap.',
        'Put a few workers on Elder for |knowledge|.',
      ], tip: '!Keep |mould| low.! It slows the brood. At 500 eggs rot and food spoils; at 750 workers fall sick. The queen keeps up with 8 chambers, each nurse 8 more. Later, [Grooming] raises it to 12. Overgrown? [Scrub the mould] on the {Queen} tab.' },
      { head: 'Shape the colony', do: [
        '[Buried finds]: diggers now and then strike a root, a seed or a pocket of |soil|.',
        '[Brood rhythm]: set the larvae to Quick (faster, hungrier) or Lean (slower, thriftier) on the {Queen} tab.',
        '[Famine law] appears after a worker first starves. From then on, the nurses give up eggs and larvae before any worker dies.',
      ] },
    ],
    next: 'Learn [Upward tunnels] and reach 10 chambers. The Age of Forage begins.',
  },
  {
    age: 'forage',
    goal: 'Make the colony run itself, start expeditions, and lay the groundwork for mapping the garden.',
    steps: [
      { head: 'Automate jobs', do: [
        'Learn [Daily routine]. It appears once the colony reaches 25 workers.',
        'On the {Jobs} tab, click the ☆ next to Forager.',
        'New idle workers now go to Forager on their own.',
      ], tip: 'You can change the starred job any time.' },
      { head: 'Grow the stores', do: [
        '[Wider tunnels] appears at 12 chambers, and [Deep galleries] follows it for more living space.',
        '[Packed walls] appears when the |food| store is nearly full, [Memory songs] when |knowledge| is.',
      ] },
      { head: 'Clear the air', do: [
        'Learn [Ventilation] and dig [Purification chamber]s.',
        'Each one scrubs the |mould| of 6 chambers, with no workers.',
        'Dig one every few chambers so mould stays low as the nest grows.',
      ], tip: '!Purification chambers matter.! Without them you need more and more nurses as you dig, and every nurse is a worker taken off another job.' },
      { head: 'Explore the surface', do: [
        'Open the {Surface} tab and send expeditions.',
        'They bring back |twig| and |seed|, which are hard to get any other way.',
        'Spend the trail marks they earn on the {Surface} tab.',
      ], tip: 'After a few expeditions, a rival colony notices you. You will deal with it next age.' },
      { head: 'Make pheromone', do: [
        'After a few expeditions, learn [Trail scent]. Put a few workers on Scout.',
        'Scouts make |pheromone|. The Map costs a lot of it, so start early.',
      ] },
      { head: 'Set up queues', do: [
        'Learn [Digging plans] for a building queue.',
        'Learn [Study plans] for a research queue.',
        'Fill both before you step away from the game.',
      ] },
      { head: 'Free food', do: [
        'Once you hold a few |seed|s, learn [Seed lore] and dig [Seed granary]s. They make |food| with no workers.',
        'Learn [Sanitation] and dig a [Midden]. It lowers how much the colony eats.',
      ] },
    ],
    next: 'Learn [Seed lore] and [Digging plans]. [Mapping] becomes available and the Age of Conquest begins.',
  },
  {
    age: 'conquest',
    goal: 'Claim the garden, beat back the rival, and build room for a much bigger colony.',
    steps: [
      { head: 'Claim land', do: [
        'Learn [Mapping] first. It opens the {Map} tab.',
        'On the {Map} tab, drag to look around. Click a tile next to your land, then claim it.',
        'Scouts only reach 8 tiles from the nest (the dotted line). Build outposts to push that line further out.',
        'Outpost research appears as you build them: [Lookouts] clear fog on their own, [Terrain works] and [Waystations] make outposts pay, [Linked trails] rewards a chain of them.',
        'Each tile you hold gives resources. Build outposts on tiles for more.',
        'Claim toward what you are short on: woods for |twig| and |resin|, grass for |food|.',
        'Hold enough of one kind of ground and its research appears, each upgrading a chamber you already have: grass [Meadow granaries], soil [Soil masons], stone [Stone posts], streams [Dew wells], paved slabs [Warm slabs].',
      ], tip: 'Hold 6 tiles and [Frontier sense] appears: it turns on "Expand on its own". More research appears as your land grows.' },
      { head: 'Prepare for raids', do: [
        'Learn [Mandible drill]. It unlocks Soldiers, the [Guard post] and the {War} tab.',
        'Put workers on Soldier and dig Guard posts.',
      ], tip: '!Raids will come.! Have soldiers ready before the first wave.' },
      { head: 'Use the chitin', do: [
        'Dead raiders drop |chitin|.',
        '[Fortification] appears after the first raid. Spend |chitin| on fortifications on the {War} tab.',
        'With 15 |chitin| in store, learn [Husk masonry] and dig [Hall of husks] for room and defence.',
        'War research keeps appearing as you fight more raids.',
        'After [Husk masonry], build the [Husk barricade]: a wall that takes the first bites of every raid and regrows.',
        'Every wave cleared without losses leaves a chest. Open them all at once on the {War} tab.',
        'Hover any group on the battle screen to see its health, bite and what changes them.',
      ] },
      { head: 'Take the fight to them', do: [
        'Learn [Campaigning]. It appears once you reach wave 3.',
        'Pick an enemy tile on the {Map}, then launch from the {War} tab.',
        'Every tile you take makes the rival army smaller.',
        'Their home tile is a boss fight with the rival queen: she hatches guards, spits acid, turns your soldiers and goes berserk when hurt. Bring more strength than hers. Kill her and the raids stop for good.',
        'The first kill of each kind of foe gives a skull. Hang them in a [Hall of husks] for a bonus each.',
      ] },
      { head: 'Chase rumours', do: [
        'After 15 expeditions, returning parties sometimes bring a rumour of a special place. It shows on the {Surface} tab with its name in gold.',
        'Each rumour lasts a while and a few trips. Only these places give |sugar| and |ivory|.',
        'Hear 3 rumours and [Tall tales] appears: rumours come twice as often and hold one more trip.',
      ] },
      { head: 'Let the nest run itself', do: [
        'After 300 workers are born, [Night shift] appears: the queen lays on her own while food is over half full.',
        'With 40 chambers, [Midden compost] appears: Middens turn some of the scrubbed mould into |soil|.',
      ] },
      { head: 'Make room', do: [
        'Learn [Resin working], [Sleeping halls] and [Vaulted roofs].',
        'Dig [Worker hall]s. Living space is the main limit this age.',
        'More chambers means more |mould|. Learn [Grooming] so each nurse scrubs 12 chambers instead of 8.',
      ] },
      { head: 'Take to the water', do: [
        'Learn [Leaf rafts] to open the {Waters} tab.',
        'Send boats on voyages for loot. Some islands can be settled for steady income.',
      ] },
    ],
    next: 'Learn [Royal court]. The Age of Wings begins.',
  },
  {
    age: 'wings',
    goal: 'Breed new castes, explore the wider world, and send your first nuptial flight.',
    steps: [
      { head: 'Breed castes', do: [
        'Learn [Caste lore] to open the {Castes} tab.',
        'Use |jelly| to breed minims, repletes, majors or weavers.',
        'Each caste has a long road of 5 stages. Push one caste first.',
        'With majors and 80 expeditions behind you, [Pack mules] appears: up to 3 majors carry loot on each trip.',
      ] },
      { head: 'Dig into the clay', do: [
        'Learn [Deep diggers]. Your diggers now also bring up |clay|.',
        'Dig [Clay hall]s for lots of living space.',
        'Big nests need clay too: later Halls of husks, Memory vaults and Paper halls cost some.',
        'Learn [Chamber craft] to upgrade a kind of chamber you have 3 or more of. Upgrades add no mould, so they beat digging more.',
      ] },
      { head: 'Watch the seasons', do: [
        'From now on the year turns.',
        'Winter stops expeditions and sky sorties.',
      ], tip: '!Stock up on food in autumn.!' },
      { head: 'Look beyond the garden', do: [
        'Learn [Sky scouts] to open the World view on the {Map}.',
        'Send sorties to uncover nearby cells, landmarks and other colonies.',
        'Help friendly colonies on the {Kin} tab. Finish their quests to earn trust.',
      ] },
      { head: 'Build the Swarm Spire', do: [
        'Learn [Winged queens]. The {Lineage} tab opens.',
        'Build the Spire\'s 5 stages. Stores are held back for it on their own.',
        'The [Winged princesses] stage takes a long time. Keep playing while it grows.',
      ] },
      { head: 'Send the flight', do: [
        'Click [Send out the nuptial flight] on a warm evening.',
        'This colony ends. You earn |lineage|.',
        'Spend |lineage| on perks. Perks are kept forever.',
      ], tip: 'Good first perks: [Royal blood], [Old trails] and [Founding swarm].' },
      { head: 'After your first flight', do: [
        'New research appears: [Teaching], [Leaf culture], [Herding], [The hunt] and [Border nests].',
        'The {Archive} and {Records} tabs start filling up.',
        'Fly again. A second flight opens the {Genome} tab.',
      ] },
    ],
    next: 'Reach the far shore with a galleon, fly 3 times and settle 3 places across the water. Then you can migrate.',
  },
  {
    age: 'settlement',
    goal: 'Move your line into the human town, open all of it, and grow into a supercolony.',
    steps: [
      { head: 'Migrate', do: [
        'Open the {Migration} tab once a galleon reaches the far shore.',
        'Check that you have 3 flights since your last migration and 3 settlements across the water.',
        'Migrate. You earn |heritage| and buy perks with it.',
      ], tip: 'You keep |lineage|, its perks, your captured land, champion, Archive and Genome.' },
      { head: 'Work the town', do: [
        'Learn [Town ways] to open the {Town} tab.',
        'Put workers on Town forager. They work every open site.',
        'Choose working hours. Day is fast but risky. Night is safe but slow.',
      ] },
      { head: 'Stay safe', do: [
        'Learn [Tasting] and put workers on Taster.',
        'Tasters find poisoned food before it kills your foragers.',
      ], tip: '!Get Tasting before you send many foragers.!' },
      { head: 'Open every site', do: [
        'Learn [Street fighting] to clear pavement ants from sites.',
        'Learn [Paper nests] for the study and satellite nests.',
        'Learn [Iron dust] for the shed.',
      ] },
      { head: 'Keep flying', do: [
        'Flights still work here and still pay |lineage|.',
        'Fly a few times between migrations to grow faster.',
      ] },
    ],
    next: 'Open all 6 town sites, build 6 satellite nests and earn 25 |heritage| in all. Then become a supercolony on the {Continent} tab and earn |unity|.',
  },
];
