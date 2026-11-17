// The Guide: one page per age, opened the first time the line reaches that age. Step-by-step advice.
// Topic pages (War, Castes, Wonders, Flights) come after the ages: each has a title and opens when any of its
// `opens` flags is set. They hold the detail, so the age pages stay short.
// Markup inside strings (rendered in colour by the Guide panel):
//   {Jobs}            a tab                     (blue)
//   [Daily routine]   research, chamber, button  (gold)
//   |food|            a resource                 (green)
//   !Careful!         a warning                  (red)

export interface GuideStep { head: string; do: string[]; tip?: string }
export interface GuidePage { age: string; title?: string; opens?: string[]; goal: string; steps: GuideStep[]; next?: string }

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
        'Bigger parties bring more, up to the party cap: 20 workers, plus 10 for each [Forager\'s rest] dug.',
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
        'On the {Map} tab, drag to look around and scroll to zoom. The minimap in the corner jumps the view. Click a tile next to your land, then claim it.',
        'Scouts only reach 8 tiles from the nest (the dotted line). Build outposts to push that line further out.',
        'Outpost research appears as you build them: [Lookouts] clear fog on their own, [Terrain works] and [Waystations] make outposts pay, [Linked trails] rewards a chain of them.',
        'Each tile you hold gives resources. Build outposts on tiles for more.',
        'Claim toward what you are short on: woods for |twig| and |resin|, grass for |food|.',
        'Hold enough of one kind of ground and its research appears, each upgrading a chamber you already have: grass [Meadow granaries], soil [Soil masons], stone [Stone posts], streams [Dew wells], paved slabs [Warm slabs].',
      ], tip: 'Hold 6 tiles and [Frontier sense] appears: it turns on "Expand on its own". More research appears as your land grows.' },
      { head: 'Go to war', do: [
        'Learn [Mandible drill]. It unlocks Soldiers, the [Guard post] and the {War} tab.',
        'Put workers on Soldier and dig Guard posts: once the {War} tab opens, the rival raids every so often.',
        'Raids give |chitin| and war honours. Campaigns take enemy tiles, and three strongholds wait far out on the {Map}.',
      ], tip: 'A War page opens in this Guide (the tabs above). It covers raids, campaigns, the rival queen and the strongholds.' },
      { head: 'Chase rumours', do: [
        'After 15 expeditions, returning parties sometimes bring a rumour of a special place. It shows on the {Surface} tab with its name in gold.',
        'Each rumour lasts a while and a few trips. Only these places give |sugar| and |ivory|.',
        'Every rumoured place your parties pick clean is also a search for the Honey Vault blueprint (see the Wonders page).',
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
      { head: 'Rework your chambers', do: [
        'With 60 chambers, [Chamber craft] appears. Learn it to rework a chamber type you have 3 or more of, from the {Nest} tab.',
        'A rework changes every chamber of that type for good, ones dug later too. It cannot be undone.',
        'Each rework has three levels. Level II needs 8 of that chamber and level III needs 15, and they are paid in parts (3 for II, 8 for III), so you never need more than your stores hold. Each level makes the rework stronger, and a few add something new, like the Gatehouse shutting itself in a raid or the Seed bank claiming land. Each level also redraws the chamber bigger in the {Nest}.',
        'Most reworks make that chamber type gather more |mould|. The cleaners\' reworks (Infirmary, Draught shaft, Mould farm, Flood channel) fight it.',
        'Some reworks reach other tabs: the Muster hall (winter jobs), the Seed bank (sow tiles on the {Map}) and the Hall of records (keep a research through a flight).',
      ], tip: 'Rework a cleaner for every two or three other reworks, or the mould gets ahead of you.' },
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
      { head: 'Crown the queen', do: [
        '[Royal court] opens the {Crowns} tab. Pick one of eight crowns for the queen.',
        'Each crown boosts a few chambers, adds a rule and has a drawback. Pick the one that fits how you play.',
        'Spend |jelly| to level crowns up to 10. Levels stay through flights.',
      ], tip: 'After a change, the queen has to wait 10 minutes before she can change crowns again.' },
      { head: 'Breed castes', do: [
        'Learn [Caste lore] to open the {Castes} tab.',
        'Use |jelly| to breed minims, repletes, majors or weavers, then give them workers on the {Jobs} tab.',
        'A caste is a few scarce ants. On the {Castes} tab you choose where they stand.',
      ], tip: 'A Castes page opens in this Guide. It lists every post and what it does.' },
      { head: 'Dig into the clay', do: [
        'Learn [Deep diggers]. Your diggers now also bring up |clay|.',
        'Dig [Clay hall]s for lots of living space.',
        'Big nests need clay too: later Halls of husks, Memory vaults and Paper halls cost some.',
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
      { head: 'Choose a wonder', do: [
        'The {Wonder} tab (under Legacy) opens once you hold a stronghold, kill the rival queen or fly.',
        'A wonder is one way of life for a colony. Find its blueprint, choose it, and it rises as the colony plays.',
        'Each colony that crowns its wonder earns one level of it for good.',
      ], tip: '!Wonder levels matter more than anything else you carry over.! You cannot migrate until one wonder reaches level 5. The Wonders page in this Guide explains it all.' },
      { head: 'Build the Swarm Spire', do: [
        'Learn [Winged queens]. The {Lineage} tab opens.',
        'Build the Spire\'s 5 stages. Each stage needs its own research first ([Packed earth], [Resin vaulting], [Royal court], [Wing lore], [Evening winds]); each shows as the Spire rises.',
        'Stores are held back for it on their own. A bar above the tabs shows how far along it is.',
        'The [Winged princesses] stage takes a long time. [Scaffolding] lets builders carry to the next stage while it settles, and [Pulley lines] make hauling by hand three times bigger.',
        'At the Winged princesses stage, pick a princess trait. Your line keeps it, and each colony adds one more.',
      ] },
      { head: 'Send the flight', do: [
        'Click [Send out the nuptial flight] on a warm evening. A fine evening earns 10% more |lineage|. With [Weather watch] you can see them coming, and tick the box to fly on the next one by itself.',
        'From your third flight on, the queen takes a dowry: 10% of your |food| and |soil| goes with her.',
        'This colony ends. You earn |lineage|.',
        'Spend |lineage| on perks. Perks are kept forever.',
      ], tip: 'Good first perks: [Royal blood], [Old trails] and [Founding swarm].' },
      { head: 'After your first flight', do: [
        'New research appears: [Teaching], [Leaf culture], [Herding], [The hunt] and [Border nests].',
        'The {Archive} and {Records} tabs start filling up.',
        'Every new colony\'s brood now has a temperament, rolled at random and shown on the {Queen} tab. It is keen on one job (+15%) and reluctant at another (−10%), so shift your workers to suit it.',
        'Fly again. A second flight opens the {Genome} tab.',
      ] },
    ],
    next: 'Reach the far shore with a galleon, fly 3 times and settle 3 places across the water. You also need one wonder at level 5, all four blueprints and the three strongholds. Then you can migrate.',
  },
  {
    age: 'settlement',
    goal: 'Move your line into the human town, open all of it, and grow into a supercolony.',
    steps: [
      { head: 'Migrate', do: [
        'Open the {Migration} tab once a galleon reaches the far shore.',
        'Check that you have 3 flights since your last migration and 3 settlements across the water.',
        'You also need one wonder at level 5, every wonder blueprint, and all three strongholds held on the {Map}. The {Migration} tab lists what is still missing.',
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
  {
    age: 'war', title: 'War', opens: ['tech:martial'],
    goal: 'Win raids for chitin and honours, take the rival\'s land, and hold the three strongholds.',
    steps: [
      { head: 'Raids', do: [
        'The rival raids on its own every 10 to 15 minutes. Its column marches across the {Map} for 2 minutes first, then fights at the entrance like a provoked raid. Click [Provoke a raid] on the {War} tab to fight sooner. Have soldiers and Guard posts ready.',
        'Every ant fights at once. Raiders bite your majors first, then soldiers, then workers who rally.',
        'Clear a wave with nobody getting in and you earn war honours, a chest and the next, harder wave.',
        'If raiders get in they steal |food|, and the wave must be fought again.',
        'Waves never end: each is tougher than the last. Pick a cleared wave next to [Provoke a raid] to fight it again for a quarter of the spoils and no chest. Raids that come on their own bring the deepest wave you have cleared.',
        'Hover any group on the battle screen to see its health, bite and what changes them.',
      ], tip: '[War cry] makes every fighter bite harder for a few seconds. Save it for the brutes.' },
      { head: 'Chitin and honours', do: [
        'Dead raiders drop |chitin|. [Fortification] appears after the first raid: spend chitin on fortifications on the {War} tab.',
        'With 15 |chitin|, learn [Husk masonry]. Dig [Hall of husks] and build the [Husk barricade], a wall that takes the first bites and regrows.',
        'War honours buy honour upgrades. Deeper waves reach war milestones, each a lasting reward for this colony.',
      ] },
      { head: 'Campaigns', do: [
        'Learn [Campaigning]. It appears once you reach wave 3.',
        'Select an enemy tile next to your land on the {Map}, then launch from the {War} tab. All your soldiers march.',
        'Every tile you take makes the rival army smaller.',
      ] },
      { head: 'The rival queen', do: [
        'The rival\'s home tile is a boss fight. She hatches guards, spits acid, turns your soldiers and goes berserk when hurt.',
        'Bring more strength than hers. Kill her and the raids stop for good.',
        'Her chamber holds the Bivouac blueprint (see the Wonders page).',
        'The first kill of each kind of foe gives a skull. Hang them in a [Hall of husks] for a bonus each.',
      ] },
      { head: 'The strongholds', do: [
        'Three strongholds lie far out on the {Map}. Select one to see its catch.',
        'Termite mound: its walls fall to a siege of several campaigns. Each one cracks them further.',
        'Wasp nest: the wasps follow your army home after every assault. Keep fighters at the nest.',
        'Antlion pits: they swallow 6 soldiers on every assault, unless a living bridge (weavers) stands on the next tile.',
        'A stronghold you hold does nothing until 2 majors man it. Open the Garrison post on the {Castes} tab, then man it from the {Map}.',
        'Majors manning the termite mound or the wasp nest also search it every 10 minutes for a wonder blueprint.',
      ], tip: 'You can take all three, and you need all three to migrate. But majors are scarce: man the ones you need now.' },
    ],
  },
  {
    age: 'castes', title: 'Castes', opens: ['tech:castes'],
    goal: 'Breed a few special ants and decide where each of them stands.',
    steps: [
      { head: 'How posts work', do: [
        'Each caste is a job on the {Jobs} tab. The workers you give it are its pool.',
        'On the {Castes} tab, every caste has a home post, where its ants stand by default, and other posts you open once with |jelly|.',
        'Use − and + to move ants between posts. They walk for half a minute before the new post counts.',
        'You never have enough ants for every post. That is the point: choose what is live right now.',
      ] },
      { head: 'Minims', do: [
        'Home: the garden. Each keeps 2 fungus beds free of mould.',
        'Rival\'s walls: raids are smaller, so they also give less chitin.',
        'The trail: rumours come more often.',
      ] },
      { head: 'Repletes', do: [
        'Home: the larder, as living food stores.',
        'Jelly pots: more room for |jelly|.',
        'A gift: hang a replete in a kin colony on the {Kin} tab. Trust grows by itself, up to a limit, and that kin will not feud with you.',
      ] },
      { head: 'Majors', do: [
        'Home: the gate. They fight in every raid and march on campaigns.',
        'A boat\'s deck: a major guards a voyage on the {Waters} tab and can deal with what the crew meets.',
        'Garrison: 2 majors man a stronghold you hold (from the {Map}). Its rule works only while they stand there.',
        'With 80 expeditions behind you, [Pack mules] appears: up to 3 majors guard each trip and carry its rare finds.',
      ] },
      { head: 'Weavers', do: [
        'Home: the loom, making |silk|.',
        'Living bridge: 2 weavers hold a bridge on a stream tile next to your land (from the {Map}). Scouts and soldiers cross there, and claims reach out from it.',
        'Leaf nest: 3 weavers hold a nest over a grass tile you hold. +6 living space that adds no mould.',
      ] },
    ],
  },
  {
    age: 'wonders', title: 'Wonders', opens: ['wonders:open'],
    goal: 'Give every colony a wonder, crown it, and raise one wonder to level 5.',
    steps: [
      { head: 'Why wonders matter', do: [
        'A wonder is the biggest thing a colony hands on to the next. Every level changes a rule for good, for every colony after.',
        '!The line cannot migrate to the town until one wonder reaches level 5.! You also need all four blueprints.',
        'A wonder gains one level in each colony that crowns it, so a full wonder takes five colonies. Start early.',
      ], tip: 'Pick one wonder to push to level 5 first. Raise the others when their rules suit the colony you want to play.' },
      { head: 'Find the blueprints', do: [
        'The {Wonder} tab (under Legacy) shows where each blueprint is hidden.',
        'Thatch Mound: the termite mound. Canopy: the wasp nest. Take the stronghold and man it with 2 majors, and they search it every 10 minutes.',
        'Honey Vault: rumoured places. Every one your parties pick clean is a search.',
        'Bivouac: the rival queen\'s chamber. It is found when she falls.',
        'A search that fails gives a sign. After 4 signs the next search is sure to find it. Blueprints are kept for good.',
      ] },
      { head: 'Choose one for the colony', do: [
        'On the {Wonder} tab, select a wonder you have found and click [Choose for this colony].',
        'Each colony gets one wonder. It cannot be changed until the next flight.',
        'Every wonder has a price that never goes away, so choose the one whose price you can live with.',
      ], tip: 'Choose early. The wonder only counts what the colony does after you choose it.' },
      { head: 'Raise it', do: [
        'A wonder rises by doing its activity. A bar above the tabs shows how far along it is.',
        'Footings: the wonder switches on, at the levels your line already owns.',
        'Body: from here on its price is paid.',
        'Crown: the wonder gains a level for good. The new level works at once.',
      ], tip: 'The first time you raise a wonder your line owns no levels, so you pay its price for nothing until the Crown. After that every colony gets the levels from the Footings on.' },
      { head: 'The four wonders', do: [
        'Thatch Mound: rises by chambers dug (60, 120, 180). It takes the sting out of winter. Price: chambers gather half again as much |mould|.',
        'Bivouac: rises by fights won, raids and campaigns (6, 15, 27). A camp you move around the {Map} lets the army and scouts strike far from your land. Price: one worker in ten holds the camp and cannot take a job.',
        'Honey Vault: choosing it builds a vault with no limit. Overflow |food| goes in and feeds the colony when stores run low. It rises by minutes living on vault food (30, 90, 180): fill it, then move foragers to other work. Price: raids are a quarter bigger and steal twice as much.',
        'Canopy: rises by tiles claimed (45, 90, 150). The colony lives in the grass it holds. Price: chambers cost twice the |soil|.',
      ], tip: 'The {Wonder} tab lists all five levels of each wonder.' },
    ],
  },
  {
    age: 'flights', title: 'Flights', opens: ['legacy:flown'],
    goal: 'Know what a flight keeps, what it loses, and what to build up from colony to colony.',
    steps: [
      { head: 'What a flight keeps', do: [
        '|lineage| and its perks, wonder levels and blueprints, crown levels, princess traits, and every tile you hold on the {Map}.',
        'The {Archive}, {Records} and {Genome} keep filling from colony to colony.',
      ] },
      { head: 'What starts over', do: [
        'Workers, chambers, stores, research, castes and their posts, outposts, and the wonder you chose.',
        'Strongholds stay yours, but they need 2 majors again before their rules work.',
      ] },
      { head: 'Every new colony', do: [
        'Its brood has a temperament, rolled at random and shown on the {Queen} tab: keen on one job (+15%), reluctant at another (−10%). Shift your workers to suit it.',
        'Choose its wonder as soon as you can.',
        'Research that appeared before stays in sight, so the early ages go faster.',
      ] },
      { head: 'Toward the town', do: [
        'Migration is the next big step. It needs a galleon at the far shore, 3 flights, 3 settlements, one wonder at level 5, all four blueprints and the three strongholds.',
        'The {Migration} tab lists what is still missing.',
      ] },
    ],
  },
];
