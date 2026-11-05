// Records: a stats page and achievements, in the spirit of Evolve and Kittens Game.
// Reads other systems' state (never imports them) and keeps its own lifetime tallies across
// every flight and migration. Achievements are feats, earned once and kept forever; they give
// no bonus, they are a record. Publishes nothing.
import type { GameSystem, Context } from '../../core/types';
import { el } from '../../core/ui';

interface Run { kind: 'flight' | 'migration'; time: number; peak: number }
interface StatsState {
  /** Game seconds, all colonies, and this colony. */
  played: number; colonyTime: number;
  /** Lifetime tallies folded in at each reset (this colony is added live). */
  starved: number; peakEver: number; colonyPeak: number;
  runs: Run[];
  /** Achievement id -> total game time when it was earned. */
  feats: Record<string, number>;
}
const S = (ctx: Context) => ctx.state.stats as StatsState;
const st = (ctx: Context) => ctx.state as Record<string, any>;

// older saves flew before this page existed, so fall back on the other systems' own counts
const flights = (ctx: Context) => Math.max(S(ctx).runs.filter((r) => r.kind === 'flight').length, st(ctx).lineage?.flights ?? 0);
const migrations = (ctx: Context) => Math.max(S(ctx).runs.filter((r) => r.kind === 'migration').length, st(ctx).migration?.migrations ?? 0);
const archiveTotal = (ctx: Context, k: string) => st(ctx).archive?.total?.[k] ?? 0;
const starvedNow = (ctx: Context) => st(ctx).jobs?.starved ?? 0;
const trophies = (ctx: Context): string[] => st(ctx).champion?.trophies ?? [];
const accords = (ctx: Context): string[] => st(ctx).archive?.bought ?? [];

/** Whole numbers with thousands separators: records are counts, never fractions. */
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');

function hms(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** Feats. `test` reads the game as it is now; once true, the feat is kept forever. */
const FEATS: { id: string; name: string; desc: string; test: (ctx: Context) => boolean }[] = [
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
];

export const stats: GameSystem = {
  id: 'stats',

  init(ctx) {
    ctx.state.stats = { played: 0, colonyTime: 0, starved: 0, peakEver: 0, colonyPeak: 0, runs: [], feats: {} } satisfies StatsState;
  },

  isUnlocked: (ctx) => Object.keys(S(ctx)?.feats ?? {}).length > 0,

  keep(ctx) {
    const s = S(ctx);
    const kind: Run['kind'] = st(ctx).migration?.migrating ? 'migration' : 'flight';
    const run: Run = { kind, time: s.colonyTime, peak: s.colonyPeak };
    const runs = [...s.runs, run];
    const feats = { ...s.feats };
    if (kind === 'flight' && starvedNow(ctx) === 0 && !feats.fed) feats.fed = s.played;
    return { ...s, runs, feats, starved: s.starved + starvedNow(ctx), colonyTime: 0, colonyPeak: 0 } satisfies StatsState;
  },

  tick(ctx, dt) {
    const s = S(ctx);
    s.played += dt; s.colonyTime += dt;
    const ants = Math.floor(ctx.res.amt('ant'));
    s.colonyPeak = Math.max(s.colonyPeak, ants);
    s.peakEver = Math.max(s.peakEver, ants);
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
      group: 'Lineage',
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
            return el(when !== undefined ? 'div.feat.got' : 'div.feat', { title: when !== undefined ? `Earned ${hms(when)} into your line.` : '' },
              el('strong', {}, when !== undefined ? f.name : '???'),
              el('span.muted', {}, f.desc));
          }));
        }
      },
    };
  })(),
};
