// Scent archive: what every colony of your line has done, remembered forever.
// Counters are read from other systems' state (never imported) and added up over all colonies.
// Tracks earn tiers on their own; each tier is a small bonus. Accords automate things you used to
// do by hand: each opens at a visible lifetime milestone, then is bought once with Memory.
// Memory is 1 per archive tier the line has earned, less what accords have cost.
// Publishes mods per track, the 'queenLay' mod, and 'accord:<id>' flags other systems read.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, progressBar, type ActionButton } from '../../core/ui';
import { fmt } from '../../core/resources';
import { ARCHIVE as A } from '../../data/balance';

interface ArchiveState { total: Record<string, number>; seen: Record<string, number>; tiers: Record<string, number>; pending?: boolean; bought?: string[]; spentMemory?: number }
const S = (ctx: Context) => ctx.state.archive as ArchiveState;
const IDS = Object.keys(A.tracks);
const need = (id: string, tier: number) => A.tracks[id].first * Math.pow(A.growth, tier);
const totalTiers = (ctx: Context) => IDS.reduce((t, id) => t + (S(ctx).tiers[id] ?? 0), 0);
type Accord = (typeof A.accords)[number];
const has = (ctx: Context, id: string) => (S(ctx).bought ?? []).includes(id);
/** Lifetime progress toward an accord's milestone (the line's flights for 'wings'). */
const progress = (ctx: Context, a: Accord) => S(ctx).total[a.track] ?? 0;
const reached = (ctx: Context, a: Accord) => ctx.flags.has('legacy:flown') && progress(ctx, a) >= a.n;

/** The live value of each counter in this colony. */
function current(ctx: Context): Record<string, number> {
  const st = ctx.state;
  return {
    brood: st.brood?.born ?? 0,
    earth: st.nest?.order?.length ?? 0,
    lore: [...ctx.flags].filter((f) => f.startsWith('tech:')).length,
    trails: st.expeditions?.runs ?? 0,
    iron: st.war?.won ?? 0,
    tide: st.waters?.voyages ?? 0,
    hunt: st.champion?.kills ?? 0,
    wings: st.lineage?.flights ?? 0,
    herd: st.husbandry?.milked ?? 0,
  };
}
const START_TECHS: Record<string, string[]> = {
  basics: ['digging', 'storage', 'brood'],
  elders: ['elders', 'royal', 'teaching'],
  surface: ['surface', 'scouting'],
  garden: ['seeds', 'fungus'],
};

export const archive: GameSystem = {
  id: 'archive',

  init(ctx) {
    ctx.state.archive = { total: {}, seen: {}, tiers: {}, bought: [], spentMemory: 0 } satisfies ArchiveState;
    ctx.res.define({ id: 'memory', name: 'Memory', order: 1002, integer: true, group: 'Legacy' });
    ctx.bus.on('loaded', () => {
      const s = S(ctx);
      // older saves: accords already granted by tiers count as bought, at no cost
      s.bought ??= A.accords.filter((a) => ctx.flags.has('accord:' + a.id)).map((a) => a.id);
      s.spentMemory ??= 0;
      if (!s.pending) return;
      s.pending = false;
      if (has(ctx, 'founders')) { ctx.res.set('food', ctx.res.cap('food')); ctx.res.add('soil', 30); }
    });
  },

  isUnlocked: (ctx) => ctx.flags.has('legacy:flown'),

  keep(ctx) {
    archive.tick!(ctx, 0); // count anything that happened since the last tick (the flight itself)
    const s = S(ctx);
    // the champion and the lineage keep their own counters, so carry those over as already seen
    const cur = current(ctx);
    return { total: s.total, tiers: s.tiers, seen: { hunt: cur.hunt, wings: cur.wings }, pending: true, bought: s.bought ?? [], spentMemory: s.spentMemory ?? 0 };
  },

  tick(ctx) {
    const s = S(ctx);
    const cur = current(ctx);
    for (const id of IDS) {
      const v = cur[id] ?? 0;
      const seen = s.seen[id] ?? 0;
      if (v > seen) s.total[id] = (s.total[id] ?? 0) + (v - seen);
      s.seen[id] = v;
      let t = s.tiers[id] ?? 0;
      while (t < A.maxTier && (s.total[id] ?? 0) >= need(id, t)) {
        t++;
        if (ctx.flags.has('legacy:flown')) ctx.log(`The archive remembers: ${A.tracks[id].name} reaches tier ${t}.`, 'info');
      }
      s.tiers[id] = t;
      // the first colony is counted, but nothing pays out until the line has flown once
      ctx.mods.set(A.tracks[id].mod, 'archive', ctx.flags.has('legacy:flown') ? A.tracks[id].per * t : 0);
    }
    if (!ctx.flags.has('legacy:flown')) return;
    ctx.res.set('memory', Math.max(0, totalTiers(ctx) - (s.spentMemory ?? 0)));
    for (const a of A.accords) {
      if (has(ctx, a.id)) ctx.flags.add('accord:' + a.id);
      else if (reached(ctx, a) && !ctx.flags.has('accord-open:' + a.id)) {
        ctx.flags.add('accord-open:' + a.id);
        ctx.log(`An accord can be made: ${a.name}. Buy it with Memory in the Archive tab.`, 'story');
      }
    }
    ctx.mods.set('queenLay', 'archive', has(ctx, 'habit') ? 0.05 : 0);
    for (const [acc, techs] of Object.entries(START_TECHS)) if (has(ctx, acc)) for (const t of techs) ctx.flags.add('tech:' + t);
  },

  panel: (() => {
    const rows = new Map<string, { tier: HTMLElement; bar: ReturnType<typeof progressBar>; note: HTMLElement; wrap: HTMLElement }>();
    const accRows = new Map<string, { wrap: HTMLElement; goal: HTMLElement; bar: ReturnType<typeof progressBar>; buy: ActionButton; done: HTMLElement }>();
    let summary: HTMLElement, accords: HTMLElement;
    return {
      title: 'Archive',
      group: 'Knowledge',
      mount(root, ctx) {
        const list = el('div.ledger');
        for (const id of IDS) {
          const tier = el('span');
          const note = el('span.muted');
          const bar = progressBar();
          const wrap = el('div.track', {}, el('span', {}, el('strong', {}, A.tracks[id].name), ' ', tier), el('span', {}, note, bar.root));
          rows.set(id, { tier, bar, note, wrap });
          list.append(wrap);
        }
        summary = el('p.muted');
        accords = el('div.accords');
        for (const a of A.accords) {
          const goal = el('span.muted');
          const bar = progressBar();
          const done = el('span.made', {}, 'Made: in effect');
          const buy = actionButton({
            ctx, label: 'Make this accord', costs: () => ({ memory: a.cost }),
            desc: a.desc,
            enabled: (c) => reached(c, a) && !has(c, a.id),
            onBuy: (c) => {
              const s = S(c);
              (s.bought ??= []).push(a.id);
              s.spentMemory = (s.spentMemory ?? 0) + a.cost;
              c.flags.add('accord:' + a.id);
              c.log(`A new accord: ${a.name}. ${a.desc}`, 'story');
              for (const t of START_TECHS[a.id] ?? []) c.flags.add('tech:' + t);
            },
          });
          const wrap = el('div.accord', {}, el('div', {}, el('strong', {}, a.name), ' ', el('span.muted', {}, a.desc)), el('div.row', {}, goal, bar.root), el('div.row', {}, buy.root, done));
          accRows.set(a.id, { wrap, goal, bar, buy, done });
          accords.append(wrap);
        }
        root.append(
          el('p.flavor', {}, 'Every colony leaves its scent in the old tunnels. The next queen remembers.'),
          el('p.muted', {}, 'Records from all your colonies add up here. Tiers come on their own, and every tier is a small bonus that lasts forever.'),
          list,
          el('h3', {}, 'Accords'),
          summary,
          accords,
        );
      },
      update(_root, ctx) {
        const s = S(ctx);
        for (const id of IDS) {
          const r = rows.get(id)!, d = A.tracks[id], t = s.tiers[id] ?? 0, tot = s.total[id] ?? 0;
          const lo = t ? need(id, t - 1) : 0, hi = need(id, t);
          r.wrap.hidden = tot === 0 && t === 0;
          r.tier.textContent = `tier ${t}`;
          const bonus = d.bonus.replace('{p}', `${d.per < 0 ? '−' : '+'}${+(Math.abs(d.per * t) * 100).toFixed(1)}%`);
          r.note.textContent = `${fmt(tot)} ${d.what}` + (t < A.maxTier ? `, next tier at ${fmt(hi)}. ` : '. ') + (t ? `Now: ${bonus}.` : '');
          r.bar.set(t >= A.maxTier ? 1 : (tot - lo) / (hi - lo));
        }
        const bought = A.accords.filter((a) => has(ctx, a.id)).length;
        summary.textContent = `${totalTiers(ctx)} tiers in all. ${bought} of ${A.accords.length} accords made. Each accord opens at a milestone, then costs Memory. You get 1 Memory for every archive tier.`;
        // show what is made, what can be bought, and the next three milestones; hide the rest
        let upcoming = 0;
        for (const a of A.accords) {
          const r = accRows.get(a.id)!;
          const own = has(ctx, a.id), ready = reached(ctx, a);
          const show = own || ready || upcoming < 3;
          if (!own && !ready && show) upcoming++;
          r.wrap.hidden = !show;
          if (!show) continue;
          const p = Math.min(progress(ctx, a), a.n);
          r.goal.textContent = `${Math.floor(p).toLocaleString("en-US")} / ${a.n.toLocaleString("en-US")} ${A.tracks[a.track].what}`;
          r.bar.set(p / a.n);
          r.buy.root.hidden = own || !ready;
          if (!own && ready) r.buy.update(ctx);
          r.done.hidden = !own;
          r.wrap.classList.toggle('ready', ready && !own);
        }
      },
    };
  })(),
};
