// Records: a stats page and achievements, in the spirit of Evolve and Kittens Game.
// Reads other systems' state (never imports them) and keeps its own lifetime tallies across
// every flight and migration. Achievements are feats, earned once and kept forever; they give
// no bonus, they are a record. Publishes nothing.
import type { GameSystem, Context } from '../../core/types';
import { el, hoverTip } from '../../core/ui';
import { BROOD, COLONY, EXPEDITIONS, RESEARCH } from '../../data/balance';

interface Run { kind: 'flight' | 'migration'; time: number; peak: number; techs?: string[] }
interface StatsState {
  /** Game seconds, all colonies, and this colony. */
  played: number; colonyTime: number;
  /** Lifetime tallies folded in at each reset (this colony is added live). */
  starved: number; peakEver: number; colonyPeak: number;
  runs: Run[];
  /** Achievement id -> total game time when it was earned. */
  feats: Record<string, number>;
  /** Running tallies some feats need. Lifetime ones carry across colonies; the rest start over (see keep). */
  t?: Track;
}
interface Track {
  safeTrips: number; wipesInRow: number; marks: number;
  dests: string[]; reserveTrips: number; laid: number; jobChanges: number; tended: number;
  lean: number | null; dry?: number; raids: number; won: number; cleanInRow: number; quiet: number;
  /** False until raids/won are read from the war state once, so an old save doesn't count its past waves. */
  synced: boolean;
}
const freshTrack = (keep?: Track): Track => ({
  safeTrips: keep?.safeTrips ?? 0, wipesInRow: keep?.wipesInRow ?? 0, marks: keep?.marks ?? 0,
  dests: [], reserveTrips: 0, laid: 0, jobChanges: 0, tended: 0, lean: null, raids: 0, won: 0, cleanInRow: 0, quiet: 0, synced: false,
});
const T = (ctx: Context) => (S(ctx).t ??= freshTrack());
const S = (ctx: Context) => ctx.state.stats as StatsState;
const st = (ctx: Context) => ctx.state as Record<string, any>;

// older saves flew before this page existed, so fall back on the other systems' own counts
const flights = (ctx: Context) => Math.max(S(ctx).runs.filter((r) => r.kind === 'flight').length, st(ctx).lineage?.flights ?? 0);
const migrations = (ctx: Context) => Math.max(S(ctx).runs.filter((r) => r.kind === 'migration').length, st(ctx).migration?.migrations ?? 0);
const archiveTotal = (ctx: Context, k: string) => st(ctx).archive?.total?.[k] ?? 0;
const starvedNow = (ctx: Context) => st(ctx).jobs?.starved ?? 0;
const trophies = (ctx: Context): string[] => st(ctx).champion?.trophies ?? [];
const accords = (ctx: Context): string[] => st(ctx).archive?.bought ?? [];
const job = (ctx: Context, id: string): number => st(ctx).jobs?.assigned?.[id] ?? 0;
const chambers = (ctx: Context, id: string) => ((st(ctx).nest?.order ?? []) as string[]).filter((x) => x === id).length;
const techs = (ctx: Context) => [...ctx.flags].filter((f) => f.startsWith('tech:')).map((f) => f.slice(5));
type TechDef = { cost: Record<string, number>; needs: string[]; pop?: number };
const TECHS = RESEARCH.techs as unknown as Record<string, TechDef>;
const ageAt = (ctx: Context) => RESEARCH.ages.findIndex((a) => a.id === st(ctx).research?.age);
/** Research the colony can pay for and has the knowledge for, but is still too small to start. */
const tooSmall = (ctx: Context) => Object.entries(TECHS).filter(([id, t]) =>
  !ctx.flags.has('tech:' + id) && (t.pop ?? 0) * COLONY.targetColony > S(ctx).colonyPeak &&
  t.needs.every((n) => ctx.flags.has('tech:' + n)) &&
  Object.entries(t.cost).every(([r, n]) => ctx.res.has(r) && ctx.res.amt(r) >= n)).length;

/** Whole numbers with thousands separators: records are counts, never fractions. */
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');

function hms(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** Feats. `test` reads the game as it is now; once true, the feat is kept forever. */
/** Which flag opens each job (mirrors the jobs system's table; forager and elder are open from the start). */
const JOB_NEEDS: Record<string, string> = {
  elder: 'research', digger: 'tech:digging', nurse: 'chamber:brood', scout: 'tech:scouting', soldier: 'tech:martial',
  leafcutter: 'tech:fungus', gardener: 'caste:minim', replete: 'caste:replete', major: 'caste:major', herder: 'tech:husbandry',
  townforager: 'tech:townlore', taster: 'tech:tasting', builder: 'tech:flight', weaver: 'caste:weaver',
};

const FEATS: { id: string; name: string; desc: string; hidden?: boolean; test: (ctx: Context) => boolean }[] = [
  { id: 'first', name: 'A hole in the ground', desc: 'Raise your first worker.', test: (c) => c.res.amt('ant') >= 1 },
  { id: 'twenty', name: 'A proper colony', desc: 'Have 25 workers at once.', test: (c) => c.res.amt('ant') >= 25 },
  { id: 'hundred', name: 'Teeming', desc: 'Have 100 workers at once.', test: (c) => c.res.amt('ant') >= 100 },
  { id: 'full', name: 'Not an inch to spare', desc: 'Have 150 workers at once.', test: (c) => c.res.amt('ant') >= 150 },
  { id: 'sky', name: 'Daylight', desc: 'Break through to the surface.', test: (c) => c.flags.has('surface') },
  { id: 'rival', name: 'Neighbours', desc: 'Find the rival colony.', test: (c) => c.flags.has('rival') },
  { id: 'deep', name: 'Deep digging', desc: 'Dig 50 chambers in one colony.', test: (c) => (st(c).nest?.order?.length ?? 0) >= 50 },
  { id: 'wave25', name: 'Holding the line', desc: 'Win 25 raid waves, across all colonies.', test: (c) => archiveTotal(c, 'iron') >= 25 },
  { id: 'flight1', name: 'The wedding flight', desc: 'Make your first nuptial flight.', test: (c) => flights(c) >= 1 },
  { id: 'flight5', name: 'An old line', desc: 'Make 5 nuptial flights.', test: (c) => flights(c) >= 5 },
  { id: 'flight10', name: 'A dynasty', desc: 'Make 10 nuptial flights.', test: (c) => flights(c) >= 10 },
  { id: 'swift', name: 'Swift wings', desc: 'Fly within 5 hours of founding a colony.', test: (c) => S(c).runs.some((r) => r.kind === 'flight' && r.time <= 5 * 3600) },
  { id: 'fed', name: 'Nobody goes hungry', desc: 'Fly from a colony where no worker starved.', test: () => false },
  { id: 'garden', name: 'Green fingers', desc: 'Grow your first fungus garden.', test: (c) => c.flags.has('tech:fungus') },
  { id: 'champ', name: 'Something that bites back', desc: 'Raise a champion.', test: (c) => !!st(c).champion?.name },
  { id: 'trophy1', name: 'First trophy', desc: 'Kill a hunting ground\'s boss.', test: (c) => trophies(c).length >= 1 },
  { id: 'trophy5', name: 'A full wall', desc: 'Bring home all five trophies.', test: (c) => trophies(c).length >= 5 },
  { id: 'lvl50', name: 'Veteran', desc: 'Raise the champion to level 50.', test: (c) => (st(c).champion?.level ?? 0) >= 50 },
  { id: 'accord3', name: 'Old habits', desc: 'Make 3 accords.', test: (c) => accords(c).length >= 3 },
  { id: 'decree', name: 'By royal decree', desc: 'Issue the queen\'s decree.', test: (c) => !!st(c).jobs?.decree },
  { id: 'sail', name: 'Afloat', desc: 'Send a boat on a voyage.', test: (c) => archiveTotal(c, 'tide') >= 1 },
  { id: 'shore', name: 'The far shore', desc: 'Reach the far shore.', test: (c) => c.flags.has('legacy:farshore') },
  { id: 'migrate', name: 'Into the town', desc: 'Migrate your line into the town.', test: (c) => migrations(c) >= 1 || c.flags.has('legacy:migrated') },
  // Colony and brood
  { id: 'tended', name: 'Every egg accounted for', desc: 'Keep every egg and larva looked after for 10 minutes, with room for 20 or more brood.', test: (c) => T(c).tended >= 600 },
  { id: 'lean', name: 'The lean season', desc: 'Go 30 seconds with empty food stores, then fill them back to half without losing a worker.', test: () => false },
  { id: 'oneeach', name: 'One of each', desc: 'Have a worker in every job you have, at once (at least 6 jobs).', test: (c) => {
    const open = Object.keys(st(c).jobs?.assigned ?? {}).filter((id) => c.flags.has(JOB_NEEDS[id] ?? '') || !JOB_NEEDS[id]);
    return open.length >= 6 && open.every((id) => job(c, id) > 0);
  } },
  { id: 'allhands', name: 'All hands', desc: 'Have no idle workers while 100 or more have jobs.', test: (c) => {
    const assigned = Object.values((st(c).jobs?.assigned ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
    const busy = Object.entries(c.busy).reduce((a, [k, b]) => (k.startsWith('job:') ? a : a + b), 0);
    return assigned >= 100 && Math.floor(c.res.amt('ant')) - assigned - busy <= 0;
  } },
  { id: 'council', name: "Elders' council", desc: 'Have more elders than foragers, with at least 10 elders.', test: (c) => job(c, 'elder') >= 10 && job(c, 'elder') > job(c, 'forager') },
  { id: 'nursery', name: 'Nursery colony', desc: 'Have 20 nurses at once.', test: (c) => job(c, 'nurse') >= 20 },
  { id: 'proud', name: 'Hungry but proud', desc: 'Reach 50 workers in a colony where workers have starved.', test: (c) => starvedNow(c) > 0 && c.res.amt('ant') >= 50 },
  { id: 'queuefull', name: "Builder's queue", desc: 'Fill every slot of the building queue.', test: (c) => {
    const q = (st(c).nest?.queue ?? []).length, slots = c.flags.has('tech:plans') ? 2 + c.mods.get('queueSlots') : 0;
    return slots > 0 && q >= slots;
  } },
  { id: 'longhall', name: 'The long hall', desc: 'Build 10 Worker halls in one colony.', test: (c) => chambers(c, 'hall') >= 10 },
  { id: 'packed', name: 'Packed tight', desc: 'Have living space for 300 workers.', test: (c) => c.res.cap('ant') >= 300 },
  // Expeditions and surface
  { id: 'luckyfew', name: 'Lucky few', desc: 'Only one worker makes it home from the far hedge.', test: () => false },
  { id: 'safe10', name: 'Not one lost', desc: 'Make 10 trips in a row without losing a worker.', test: (c) => T(c).safeTrips >= 10 },
  { id: 'wipe1', name: 'Gone without a trace', desc: 'Lose a whole party.', hidden: true, test: () => false },
  { id: 'wipe3', name: 'Bad luck comes in threes', desc: 'Lose three whole parties in a row.', hidden: true, test: (c) => T(c).wipesInRow >= 3 },
  { id: 'oldhands', name: 'Old hands', desc: 'Keep workers in reserve for 20 trips in a row.', test: (c) => T(c).reserveTrips >= 20 },
  { id: 'marks50', name: 'Well-worn path', desc: 'Mark the trail 50 times.', test: (c) => T(c).marks >= 50 },
  { id: 'everywhere', name: 'Every corner of the garden', desc: 'Visit every destination in one colony.', test: (c) => T(c).dests.length >= EXPEDITIONS.destinations.length },
  { id: 'amber10', name: 'Bug in amber', desc: 'Find 10 pieces of amber in one colony.', test: (c) => (st(c).expeditions?.rare ?? 0) >= 10 },
  { id: 'scenic', name: 'The scenic route', desc: 'Send a party to the far hedge without marking the trail.', test: () => false },
  { id: 'marks90', name: 'Ninety marks', desc: 'Earn enough trail marks to find the far hedge.', test: (c) => (st(c).expeditions?.earned ?? 0) >= 90 },
  // Champion, rivals and war
  { id: 'goliath', name: 'David and Goliath', desc: 'The champion beats a foe 10 or more levels above its own.', test: () => false },
  { id: 'feet', name: 'Back on its feet', desc: 'The champion is beaten 10 times and keeps hunting.', test: (c) => (st(c).champion?.defeats ?? 0) >= 10 },
  { id: 'patched', name: 'Patched up', desc: 'The champion recovers with Wound care doing all it can.', test: (c) => (st(c).champion?.recover ?? 0) > 0 && c.mods.get('nurseHeal') >= BROOD.healCap - 1e-6 },
  { id: 'nottoday', name: 'Not today', desc: 'Win a raid wave with 5 or fewer soldiers.', test: () => false },
  { id: 'flawless', name: 'Flawless', desc: 'Win 10 raid waves in a row without losses.', test: (c) => T(c).cleanInRow >= 10 },
  { id: 'husks', name: 'Shell collector', desc: 'Build a Hall of husks from raider chitin.', test: (c) => chambers(c, 'husks') >= 1 },
  { id: 'nowalls', name: 'No walls needed', desc: 'Win a raid wave with no nest defence.', hidden: true, test: () => false },
  { id: 'peace', name: 'Peace in our time', desc: 'Go 30 minutes without a raid after finding the rival.', test: (c) => T(c).quiet >= 1800 },
  { id: 'streak10', name: 'Ten in a row', desc: 'The champion wins 10 fights in a row.', test: (c) => (st(c).champion?.streak ?? 0) >= 10 },
  // Research, lineage and the wider world
  { id: 'bigenough', name: 'Big enough', desc: 'Learn a research that needed a large colony.', test: (c) => techs(c).some((id) => (TECHS[id]?.pop ?? 0) > 0) },
  { id: 'waiting', name: 'Waiting on the colony', desc: 'Afford 3 researches the colony is still too small for.', test: (c) => tooSmall(c) >= 3 },
  { id: 'newtricks', name: 'Same queen, new tricks', desc: 'Learn a research no earlier colony learned.', test: (c) => {
    const past = S(c).runs.filter((r) => r.techs);
    return past.length > 0 && techs(c).some((id) => past.every((r) => !r.techs!.includes(id)));
  } },
  { id: 'shortreign', name: 'Short reign', desc: 'Make a nuptial flight before learning Royal court.', test: () => false },
  { id: 'longreign', name: 'Long reign', desc: 'Keep one colony going for 10 hours before flying.', test: () => false },
  { id: 'settled', name: 'Every age', desc: 'Reach the Age of Settlement.', test: (c) => ageAt(c) >= RESEARCH.ages.findIndex((a) => a.id === 'settlement') },
  { id: 'shepherds', name: 'Shepherds', desc: 'Keep 50 herd animals at once.', test: (c) => Object.values((st(c).husbandry?.herds ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0) >= 50 },
  { id: 'seaworthy', name: 'Seaworthy', desc: 'Send boats on 10 voyages.', test: (c) => archiveTotal(c, 'tide') >= 10 },
  { id: 'crumbs', name: 'Crumbs from the table', desc: 'Bring home your first town crumb.', test: (c) => c.res.has('crumbs') && c.res.amt('crumbs') >= 1 },
  { id: 'sweet', name: 'Sweet tooth', desc: 'Fill your sugar stores.', test: (c) => c.res.has('sugar') && c.res.amt('sugar') >= c.res.cap('sugar') },
  { id: 'nation', name: 'A nation of ants', desc: 'Hold 10 regions of the continent.', test: (c) => ((st(c).supercolony?.regions ?? []) as { owner?: string }[]).filter((r) => r.owner === 'you').length >= 10 },
  // Odd and playful
  { id: 'antfarm', name: 'Ant farm', desc: 'Leave the colony paused for 10 minutes.', hidden: true, test: () => false },
  { id: 'patient', name: 'The patient queen', desc: 'Fly from a colony where the queen never laid by hand.', test: () => false },
  { id: 'fiddly', name: 'Overthinking it', desc: 'Move workers between jobs 500 times in one colony.', test: (c) => T(c).jobChanges >= 500 },
  // Stores, building and research
  { id: 'pantry', name: 'A full pantry', desc: 'Have 3,000 food at once.', test: (c) => c.res.amt('food') >= 3000 },
  { id: 'dirtpile', name: 'Mountain of dirt', desc: 'Have 2,000 soil at once.', test: (c) => c.res.amt('soil') >= 2000 },
  { id: 'wellread', name: 'Well read', desc: 'Have 3,000 knowledge at once.', test: (c) => c.res.amt('knowledge') >= 3000 },
  { id: 'sticks', name: 'Bundle of sticks', desc: 'Have 300 twigs at once.', test: (c) => c.res.has('twig') && c.res.amt('twig') >= 300 },
  { id: 'city', name: 'A city underground', desc: 'Dig 200 chambers in one colony.', test: (c) => (st(c).nest?.order?.length ?? 0) >= 200 },
  { id: 'warren', name: 'A warren', desc: 'Dig 100 chambers in one colony.', test: (c) => (st(c).nest?.order?.length ?? 0) >= 100 },
  { id: 'studious', name: 'Studious', desc: 'Learn 20 researches in one colony.', test: (c) => techs(c).length >= 20 },
  { id: 'scholars', name: 'A colony of scholars', desc: 'Learn 40 researches in one colony.', test: (c) => techs(c).length >= 40 },
  { id: 'jelly10', name: 'Royal treatment', desc: 'Have 50 royal jelly at once.', test: (c) => c.res.has('jelly') && c.res.amt('jelly') >= 50 },
  { id: 'spun', name: 'Spinners', desc: 'Have 100 silk at once.', test: (c) => c.res.has('silk') && c.res.amt('silk') >= 100 },
  // Jobs and castes
  { id: 'eyes', name: 'Eyes everywhere', desc: 'Have 25 scouts at once.', test: (c) => job(c, 'scout') >= 25 },
  { id: 'army', name: 'A standing army', desc: 'Have 100 soldiers at once.', test: (c) => job(c, 'soldier') >= 100 },
  { id: 'bigheads', name: 'Big heads', desc: 'Have 15 majors at once.', test: (c) => job(c, 'major') >= 15 },
  { id: 'larder', name: 'Living larder', desc: 'Have every replete slot filled.', test: (c) => job(c, 'replete') >= 8 },
  // Surface, map and hunts
  { id: 'claim5', name: 'Staking a claim', desc: 'Hold 10 tiles on the map.', test: (c) => ((st(c).map?.tiles ?? []) as { o?: string }[]).filter((t) => t.o === 'you').length >= 10 },
  { id: 'claim25', name: 'Landholders', desc: 'Hold 40 tiles on the map.', test: (c) => ((st(c).map?.tiles ?? []) as { o?: string }[]).filter((t) => t.o === 'you').length >= 40 },
  { id: 'outpost', name: 'The frontier', desc: 'Have 5 outposts at once.', test: (c) => ((st(c).map?.tiles ?? []) as { outpost?: boolean }[]).filter((t) => t.outpost).length >= 5 },
  { id: 'trips25', name: 'Seasoned trail', desc: 'Send 100 expeditions in one colony.', test: (c) => (st(c).expeditions?.runs ?? 0) >= 100 },
  { id: 'toll', name: 'The trail takes its toll', desc: 'Lose 100 workers on the trail in one colony.', test: (c) => (st(c).expeditions?.perished ?? 0) >= 100 },
  { id: 'lvl100', name: 'Living legend', desc: 'Raise the champion to level 100.', test: (c) => (st(c).champion?.level ?? 0) >= 100 },
  // Numbers
  { id: 'nice', name: 'Nice', desc: 'Have exactly 69 workers in one job.', hidden: true, test: (c) => Object.values((st(c).jobs?.assigned ?? {}) as Record<string, number>).some((n) => n === 69) },
  { id: 'blaze', name: 'Blaze it', desc: 'Have exactly 420 twigs.', hidden: true, test: (c) => c.res.has('twig') && Math.floor(c.res.amt('twig')) === 420 },
  { id: 'jackpot', name: 'Jackpot', desc: 'Have exactly 777 soil.', hidden: true, test: (c) => Math.floor(c.res.amt('soil')) === 777 },
  { id: 'leet', name: 'Leet', desc: 'Have exactly 1,337 knowledge.', hidden: true, test: (c) => Math.floor(c.res.amt('knowledge')) === 1337 },
  { id: 'answer', name: 'The answer', desc: 'Have exactly 42 Resting chambers.', hidden: true, test: (c) => chambers(c, 'tunnel') === 42 },
];

function earn(ctx: Context, id: string) {
  const s = S(ctx), f = FEATS.find((x) => x.id === id);
  if (!f || s.feats[id] !== undefined) return;
  s.feats[id] = s.played;
  ctx.log(`Achievement: ${f.name}. ${f.desc}`, 'story');
}

/** Feats that hang on a moment, not a state the game keeps: counted here from other systems' events. */
function listen(ctx: Context) {
  ctx.bus.on('expedition:return', (e: { dest: string; ants?: number; lost?: number }) => {
    if (e.dest.startsWith('voyage:')) return;
    const t = T(ctx);
    if (!t.dests.includes(e.dest)) t.dests.push(e.dest);
    t.safeTrips = e.lost ? 0 : t.safeTrips + 1;
    t.wipesInRow = 0;
    if (st(ctx).expeditions?.reserve) t.reserveTrips++;
    if (e.dest === 'hedge' && e.ants !== undefined && e.ants - (e.lost ?? 0) === 1) earn(ctx, 'luckyfew');
  });
  ctx.bus.on('expedition:wipe', () => {
    const t = T(ctx);
    t.safeTrips = 0; t.wipesInRow++;
    if (st(ctx).expeditions?.reserve) t.reserveTrips++;
    earn(ctx, 'wipe1');
  });
  ctx.bus.on('expedition:send', (e: { dest: string; marked: boolean }) => {
    if (e.marked) T(ctx).marks++;
    else if (e.dest === 'hedge') earn(ctx, 'scenic');
  });
  ctx.bus.on('champion:kill', (e: { lvl?: number; level?: number }) => {
    if (e.lvl !== undefined && e.level !== undefined && e.lvl >= e.level + 10) earn(ctx, 'goliath');
  });
  ctx.bus.on('queen:lay', () => { T(ctx).laid++; });
  ctx.bus.on('jobs:change', () => { T(ctx).jobChanges++; });
  // Real time, since the game clock stops while paused.
  if (typeof window !== 'undefined') {
    let paused = 0;
    window.setInterval(() => {
      paused = ctx.paused ? paused + 1 : 0;
      if (paused >= 600) earn(ctx, 'antfarm');
    }, 1000);
  }
}

/** Per-tick bookkeeping for the running tallies. */
function track(ctx: Context, dt: number) {
  const t = T(ctx), a = st(ctx);
  if (!a.expeditions?.reserve) t.reserveTrips = 0;
  // brood: the queen and nurses look after a few each
  const brood = ctx.res.amt('egg') + ctx.res.amt('larva');
  const care = BROOD.queenTends + job(ctx, 'nurse') * BROOD.nurseTends;
  t.tended = ctx.res.cap('egg') >= 20 && care >= brood ? t.tended + dt : 0;
  // the lean season: from empty stores back to plenty with nobody starving on the way
  const food = ctx.res.amt('food');
  // spending the stores down to nothing is not a famine: they have to stay empty for a while
  t.dry = food < 1 ? (t.dry ?? 0) + dt : 0;
  if (t.dry >= 30 && t.lean === null) t.lean = starvedNow(ctx);
  else if (t.lean !== null && food >= Math.max(50, ctx.res.cap('food') * 0.5)) { if (starvedNow(ctx) === t.lean) earn(ctx, 'lean'); t.lean = null; }
  // raid waves
  const war = a.war as { raids?: number; won?: number } | undefined;
  if (war) {
    const raids = war.raids ?? 0, won = war.won ?? 0;
    if (!t.synced) { t.raids = raids; t.won = won; t.synced = true; }
    if (raids > t.raids) {
      t.quiet = 0;
      if (won > t.won) {
        t.cleanInRow += won - t.won;
        if (job(ctx, 'soldier') <= 5) earn(ctx, 'nottoday');
        if (ctx.mods.get('defence') <= 0) earn(ctx, 'nowalls');
      } else t.cleanInRow = 0;
    }
    t.raids = raids; t.won = won;
  }
  if (ctx.flags.has('rival')) t.quiet += dt;
}

export const stats: GameSystem = {
  id: 'stats',

  init(ctx) {
    ctx.state.stats = { played: 0, colonyTime: 0, starved: 0, peakEver: 0, colonyPeak: 0, runs: [], feats: {}, t: freshTrack() } satisfies StatsState;
    listen(ctx);
  },


  keep(ctx) {
    const s = S(ctx);
    const kind: Run['kind'] = st(ctx).migration?.migrating ? 'migration' : 'flight';
    const run: Run = { kind, time: s.colonyTime, peak: s.colonyPeak, techs: techs(ctx) };
    const runs = [...s.runs, run];
    const feats = { ...s.feats };
    if (kind === 'flight' && starvedNow(ctx) === 0 && !feats.fed) feats.fed = s.played;
    const t = T(ctx);
    if (kind === 'flight') {
      if (!ctx.flags.has('tech:royal') && feats.shortreign === undefined) feats.shortreign = s.played;
      if (s.colonyTime >= 10 * 3600 && feats.longreign === undefined) feats.longreign = s.played;
      if (t.laid === 0 && feats.patient === undefined) feats.patient = s.played;
    }
    return { ...s, runs, feats, t: freshTrack(t), starved: s.starved + starvedNow(ctx), colonyTime: 0, colonyPeak: 0 } satisfies StatsState;
  },

  tick(ctx, dt) {
    const s = S(ctx);
    s.played += dt; s.colonyTime += dt;
    const ants = Math.floor(ctx.res.amt('ant'));
    s.colonyPeak = Math.max(s.colonyPeak, ants);
    s.peakEver = Math.max(s.peakEver, ants);
    track(ctx, dt);
    for (const f of FEATS) {
      if (s.feats[f.id] !== undefined || !f.test(ctx)) continue;
      s.feats[f.id] = s.played;
      ctx.log(`Achievement: ${f.name}. ${f.desc}`, 'story');
    }
  },

  panel: (() => {
    let overall: HTMLElement, colony: HTMLElement, featHead: HTMLElement, featList: HTMLElement, runsBox: HTMLElement;
    const rows = (box: HTMLElement, list: [string, string][]) =>
      box.replaceChildren(...list.map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
    return {
      title: 'Records',
      group: 'Legacy',
      mount(root) {
        overall = el('div.ledger.stats');
        colony = el('div.ledger.stats');
        runsBox = el('div.ledger.stats');
        featHead = el('h3');
        featList = el('div.feats');
        root.append(
          el('p.flavor', {}, 'What your line has done, scratched into the oldest wall of the nest.'),
          el('h3', {}, 'Your line'), overall,
          el('h3', {}, 'This colony'), colony,
          el('h3', {}, 'Past colonies'), runsBox,
          featHead, featList,
        );
      },
      update(_root, ctx) {
        const s = S(ctx), a = st(ctx);
        const fl = flights(ctx), mg = migrations(ctx);
        const best = s.runs.filter((r) => r.kind === 'flight').reduce((m, r) => Math.min(m, r.time), Infinity);
        const opt = (cond: boolean, row: [string, string]) => (cond ? [row] : []);
        rows(overall, [
          ['Time played', hms(s.played)],
          ['Colonies founded', String(Math.max(s.runs.length, fl + mg) + 1)],
          ...opt(fl > 0, ['Nuptial flights', String(fl)]),
          ...opt(best < Infinity, ['Fastest flight', hms(best)]),
          ...opt(mg > 0, ['Migrations', String(mg)]),
          ...opt(!!a.lineage?.total, ['Lineage earned', fmt(a.lineage?.total ?? 0)]),
          ...opt(!!a.lineage?.best, ['Most Lineage from one flight', fmt(a.lineage?.best ?? 0)]),
          ...opt(!!a.migration?.total, ['Heritage earned', fmt(a.migration?.total ?? 0)]),
          ...opt(!!a.archive, ['Memory earned', fmt(Object.values((a.archive?.tiers ?? {}) as Record<string, number>).reduce((t, n) => t + n, 0))]),
          ...opt(archiveTotal(ctx, 'brood') > 0, ['Workers born', fmt(archiveTotal(ctx, 'brood'))]),
          ['Workers starved', fmt(s.starved + starvedNow(ctx))],
          ['Largest colony', `${s.peakEver} workers`],
          ...opt(archiveTotal(ctx, 'earth') > 0, ['Chambers dug', fmt(archiveTotal(ctx, 'earth'))]),
          ...opt(archiveTotal(ctx, 'lore') > 0, ['Techs learned', fmt(archiveTotal(ctx, 'lore'))]),
          ...opt(archiveTotal(ctx, 'trails') > 0, ['Expeditions home', fmt(archiveTotal(ctx, 'trails'))]),
          ...opt(archiveTotal(ctx, 'iron') > 0, ['Raid waves won', fmt(archiveTotal(ctx, 'iron'))]),
          ...opt(archiveTotal(ctx, 'tide') > 0, ['Voyages', fmt(archiveTotal(ctx, 'tide'))]),
          ...opt(archiveTotal(ctx, 'hunt') > 0, ['Champion kills', fmt(archiveTotal(ctx, 'hunt'))]),
          ...opt(!!a.champion?.name, ['Champion', `${a.champion?.name}, level ${a.champion?.level}, fights up to level ${(a.champion?.top ?? 0) + 10}`]),
          ...opt(trophies(ctx).length > 0, ['Trophies', `${trophies(ctx).length} of 5`]),
          ...opt(accords(ctx).length > 0, ['Accords made', String(accords(ctx).length)]),
        ]);
        rows(colony, [
          ['Time in this colony', hms(s.colonyTime)],
          ['Workers', `${Math.floor(ctx.res.amt('ant'))} now, ${s.colonyPeak} at most`],
          ['Chambers', String(a.nest?.order?.length ?? 0)],
          ['Techs known', String([...ctx.flags].filter((f) => f.startsWith('tech:')).length)],
          ...opt((a.brood?.born ?? 0) > 0, ['Workers born', fmt(a.brood?.born ?? 0)]),
          ['Workers starved', String(starvedNow(ctx))],
          ...opt((a.expeditions?.runs ?? 0) > 0, ['Expeditions', String(a.expeditions?.runs ?? 0)]),
          ...opt((a.war?.won ?? 0) > 0, ['Raid waves won', String(a.war?.won ?? 0)]),
        ]);
        (runsBox.previousElementSibling as HTMLElement).hidden = !s.runs.length;
        runsBox.hidden = !s.runs.length;
        rows(runsBox, s.runs.slice(-10).map((r, i, arr) => [
          `Colony ${s.runs.length - arr.length + i + 1}`,
          `${r.kind === 'flight' ? 'flew' : 'migrated'} after ${hms(r.time)}, ${r.peak} workers at most`,
        ] as [string, string]).reverse());
        const got = FEATS.filter((f) => s.feats[f.id] !== undefined).length;
        featHead.textContent = `Achievements: ${got} of ${FEATS.length}`;
        const sig = Object.keys(s.feats).join(',');
        if (featList.dataset.sig !== sig) {
          featList.dataset.sig = sig;
          featList.replaceChildren(...FEATS.map((f) => {
            const when = s.feats[f.id];
            const secret = f.hidden && when === undefined;
            const card = el(when !== undefined ? 'div.feat.got' : 'div.feat', { tabindex: 0 },
              el('strong', {}, when !== undefined ? f.name : '???'),
              el('span.muted', {}, secret ? 'A hidden achievement.' : f.desc));
            hoverTip(card, () => when !== undefined
              ? [el('div', {}, f.desc), el('div.teffect', {}, `Earned ${hms(when)} into your line.`)]
              : [el('div', {}, 'Not earned yet.')]);
            return card;
          }));
        }
      },
    };
  })(),
};
