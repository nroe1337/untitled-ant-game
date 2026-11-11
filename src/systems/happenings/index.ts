// Happenings: small random moments in the Chronicle, every few minutes of play.
// Mostly flavour; a few leave a crumb of something behind. They never cost the player anything.
import type { GameSystem, Context } from '../../core/types';

interface Happening {
  text: string;
  /** Only when this is true (default: always). */
  when?: (ctx: Context) => boolean;
  /** A small gift of a common resource: [resource, share of its storage, minimum]. Rare (see GIFT_WEIGHT),
   *  and only once the player already has that resource, so it is never how they first find it. */
  give?: [GiftRes, number, number];
}

interface HState { next: number; recent: number[] }
const S = (ctx: Context) => ctx.state.happenings as HState;

const ants = (ctx: Context) => Math.floor(ctx.res.amt('ant'));
const has = (f: string) => (ctx: Context) => ctx.flags.has(f);
const job = (ctx: Context, id: string) => ((ctx.state.jobs?.assigned ?? {}) as Record<string, number>)[id] ?? 0;
const chambers = (ctx: Context) => ((ctx.state.nest?.order ?? []) as string[]).length;
type GiftRes = 'food' | 'soil' | 'knowledge' | 'twig' | 'seed';
/** A gift worth `share` of the resource's storage (at least `min`), never past the cap. */
const giveOut = (ctx: Context, [id, share, min]: [GiftRes, number, number]) => {
  const n = Math.floor(Math.min(Math.max(min, ctx.res.cap(id) * share), ctx.res.cap(id) - ctx.res.amt(id)));
  if (n <= 0) return '';
  ctx.res.lump(id, n);
  return `+${n} ${ctx.res.get(id).name.toLowerCase()}`;
};
/** Only for resources the player has already seen. */
const seen = (id: string) => (ctx: Context) => ctx.res.has(id) && ctx.res.get(id).seen;
const and = (...fs: ((ctx: Context) => boolean)[]) => (ctx: Context) => fs.every((f) => f(ctx));

const HAPPENINGS: Happening[] = [
  // underground, from the start
  { text: 'A worker spends the whole morning cleaning one antenna.' },
  { text: 'Somewhere above, rain. The tunnels smell of it for hours.' },
  { text: 'The queen shifts in her sleep. The whole nest goes quiet.' },
  { text: 'A root pushes through the ceiling of a tunnel. The diggers leave it be.', when: (c) => chambers(c) >= 2 },
  { text: 'Two workers meet in a narrow tunnel. Neither will back up.', when: (c) => ants(c) >= 5 },
  { text: 'A larva wriggles out of its pile and is carried back, twice.', when: (c) => c.res.amt('larva') >= 1 },
  { text: 'A digger strikes a pocket of soft earth and keeps going.', when: and(has('tech:digging'), seen('soil')), give: ['soil', 0.15, 8] },
  { text: 'A worker finds an old seed husk behind a wall and brings it to the stores.', when: (c) => chambers(c) >= 3, give: ['food', 0.1, 10] },
  { text: 'An elder taps out the same pattern on the wall for an hour. Others gather to feel it.', when: (c) => job(c, 'elder') >= 1 && seen('knowledge')(c), give: ['knowledge', 0.08, 5] },
  { text: 'One nurse refuses to leave the eggs, even to eat.', when: (c) => job(c, 'nurse') >= 1 },
  { text: 'A wall slumps in the night. By morning it has been carried out, grain by grain.', when: (c) => chambers(c) >= 6 },
  { text: 'A springtail wanders into the nest, looks around, and leaves.', when: (c) => chambers(c) >= 4 },
  { text: 'The colony grooms each other in a long slow line.', when: (c) => ants(c) >= 20 },
  { text: 'A worker gets lost in the new tunnels and turns up at the queen\'s cell.', when: (c) => chambers(c) >= 10 },
  // the surface
  { text: 'A forager comes home with a petal and no idea what to do with it.', when: has('surface') },
  { text: 'Heat shimmers over the mound. Nobody goes out until evening.', when: has('surface') },
  { text: 'A beetle falls into the entrance and has to be shoved back out.', when: has('surface') },
  { text: 'A forager drags back a dead fly twice her length.', when: has('surface'), give: ['food', 0.15, 15] },
  { text: 'A fallen leaf seals the entrance. The workers chew through it by noon.', when: has('surface') },
  { text: 'The morning dew is so heavy the foragers come back soaked.', when: (c) => c.flags.has('surface') && job(c, 'forager') >= 3 },
  { text: 'A spider watches the trail all afternoon. The foragers walk wide of it.', when: has('surface') },
  { text: 'A bird lands near the mound, pecks twice, and flies off. Everyone breathes again.', when: has('surface') },
  { text: 'A scout comes home on a different trail and three others follow her out of habit.', when: (c) => job(c, 'scout') >= 1 },
  { text: 'A twig is too long for the tunnel. Six workers try every angle.', when: and(has('surface'), seen('twig')), give: ['twig', 0.1, 2] },
  { text: 'A scout comes back dusted in pollen. The others lick her clean.', when: (c) => job(c, 'scout') >= 1 },
  { text: 'A forager finds a seed cache some other colony forgot.', when: seen('seed'), give: ['seed', 0.2, 3] },
  { text: 'A bead of sap hardens on a twig by the entrance. The workers leave it alone.', when: has('surface') },
  { text: 'A drop of water creeps down a tunnel wall. A small crowd forms to drink.', when: (c) => ants(c) >= 8 },
  { text: 'An egg hatches early. The nurses fuss over it.', when: (c) => c.res.amt('egg') >= 2 },
  { text: 'A worker carries a pebble from one end of the nest to the other, then back.', when: (c) => chambers(c) >= 2 },
  { text: 'The night is cold. The workers pile up around the brood.', when: (c) => c.res.amt('egg') + c.res.amt('larva') >= 3 },
  { text: 'A young worker tries to dig straight up and has to be stopped.', when: (c) => has('tech:digging')(c) && !c.flags.has('surface') },
  { text: 'Someone has stacked the food in a neat pyramid. Nobody admits to it.', when: (c) => chambers(c) >= 4 },
  { text: 'A digger finds the bones of a much older nest under this one.', when: (c) => chambers(c) >= 12 },
  { text: 'The queen eats, slowly, while three workers wait on her.' },
  { text: 'A worker falls asleep mid-step in the main shaft. Traffic flows around her.', when: (c) => ants(c) >= 15 },
  { text: 'Two diggers tunnel toward each other and meet almost exactly.', when: (c) => job(c, 'digger') >= 2 },
  { text: 'An old worker stops working. The young ones feed her anyway.', when: (c) => ants(c) >= 30 },
  { text: 'The soil pit smells of damp earth and dust.', when: (c) => (c.state.nest?.built?.storeroom ?? 0) >= 1 },
  { text: 'A mite rides in on a forager. The groomers make short work of it.', when: has('surface') },
  { text: 'An earthworm tunnel crosses one of yours. It smells strange for days.', when: (c) => chambers(c) >= 8 },
  { text: 'Thunder. The soil hums. The brood is moved deeper, just in case.', when: has('surface') },
  { text: 'A forager comes home empty and goes straight back out.', when: (c) => job(c, 'forager') >= 1 },
  { text: 'A caterpillar crawls across the trail. The foragers wait it out.', when: has('surface') },
  { text: 'A child\'s shadow falls over the mound and stays a long while.', when: has('surface') },
  { text: 'The first frost. The foragers come home early.', when: has('surface') },
  { text: 'Moonlight on the mound. A few workers sit out in it.', when: has('surface') },
  { text: 'A scout leaves a trail that goes nowhere. It fades by morning.', when: (c) => job(c, 'scout') >= 1 },
  { text: 'A grasshopper lands on the mound and the whole colony boils out at once.', when: (c) => c.flags.has('surface') && ants(c) >= 25 },
  { text: 'A forager trips on a seed and drags it home anyway.', when: (c) => has('surface')(c) && seen('seed')(c), give: ['seed', 0.1, 2] },
  { text: 'A digger turns up a lump of rich dark loam.', when: and(has('tech:digging'), seen('soil')), give: ['soil', 0.2, 10] },
  { text: 'Elders gather in the hall and go over the old trails until dawn.', when: (c) => (c.state.nest?.built?.library ?? 0) >= 1 && seen('knowledge')(c), give: ['knowledge', 0.1, 6] },
  { text: 'A forager finds a fallen berry, already split open.', when: has('surface'), give: ['food', 0.2, 20] },
  { text: 'A weaver spins a thread so long it crosses the whole chamber.', when: has('caste:weaver') },
  { text: 'A soldier and a forager bump heads. The soldier backs off first.', when: (c) => job(c, 'soldier') >= 1 },
  { text: 'Rival scent on the wind. The guards stand a little taller.', when: has('rival') },
  { text: 'A wounded soldier is carried home. She is back on watch by evening.', when: (c) => c.flags.has('rival') && job(c, 'soldier') >= 3 },
  { text: 'A leafcutter brings back a leaf bigger than the tunnel. It gets cut down to size.', when: (c) => job(c, 'leafcutter') >= 1 },
  { text: 'A beetle grub is found in the fungus garden and politely removed.', when: has('tech:fungus') },
  { text: 'The aphids are restless today. The herders stay close.', when: has('tech:husbandry') },
  { text: 'A ladybird circles the pasture. The herders bristle until it leaves.', when: has('tech:husbandry') },
  { text: 'A raft crew comes home and won\'t stop grooming the water off.', when: has('tech:rafts') },
  { text: 'A young queen tests her wings in the main shaft. The workers scatter.', when: has('tech:flight') },
  { text: 'A crumb the size of a boulder lies under the table. It takes forty workers.', when: has('tech:townlore') },
  { text: 'The humans leave the light on. The town foragers wait in the dark.', when: has('tech:townlore') },
  { text: 'A town forager comes back smelling of soap and is groomed for an hour.', when: has('tech:townlore') },
  // later
  { text: 'A rival scout is spotted at the edge of the trail. She is gone by the time the soldiers arrive.', when: has('rival') },
  { text: 'A soldier stands at the entrance all night for no reason anyone can tell.', when: (c) => job(c, 'soldier') >= 1 },
  { text: 'A fungus bed puts out a pale new tuft overnight.', when: has('tech:fungus') },
  { text: 'An aphid wanders off and is gently steered back.', when: has('tech:husbandry') },
  { text: 'A major blocks a whole tunnel just by standing in it.', when: has('caste:major') },
  { text: 'A boat comes back with a snail shell no one asked for.', when: has('tech:rafts') },
];

const MIN_GAP = 150, MAX_GAP = 330; // seconds of game time between happenings
const GIFT_WEIGHT = 0.3;             // a happening that gives something is this much less likely than plain flavour
const gap = () => MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP);

export const happenings: GameSystem = {
  id: 'happenings',
  init(ctx) {
    ctx.state.happenings = { next: 120, recent: [] } satisfies HState;
  },
  tick(ctx, dt) {
    if (!ctx.state.brood?.firstAnt) return; // quiet until the first worker is born
    const s = S(ctx);
    s.next -= dt;
    if (s.next > 0) return;
    s.next = gap();
    const ok = (h: Happening) => (!h.when || h.when(ctx)) && (!h.give || seen(h.give[0])(ctx));
    const pool = HAPPENINGS.map((_, i) => i).filter((i) => !s.recent.includes(i) && ok(HAPPENINGS[i]));
    if (!pool.length) return;
    const w = (i: number) => (HAPPENINGS[i].give ? GIFT_WEIGHT : 1);
    let r = Math.random() * pool.reduce((t, i) => t + w(i), 0);
    const i = pool.find((j) => (r -= w(j)) < 0) ?? pool[pool.length - 1];
    s.recent = [...s.recent, i].slice(-12);
    const g = HAPPENINGS[i].give, got = g ? giveOut(ctx, g) : '';
    ctx.log(HAPPENINGS[i].text + (got ? ` (${got})` : ''), 'story');
  },
};
