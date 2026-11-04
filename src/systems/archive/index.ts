// Scent archive: what every colony of your line has done, remembered forever.
// Counters are read from other systems' state (never imported) and added up over all colonies.
// Tracks earn tiers on their own; each tier is a small bonus. Accords open in a fixed order as
// total tiers grow and automate things you used to do by hand. Nothing to choose, nothing to miss.
// Publishes mods per track, the 'queenLay' mod, and 'accord:<id>' flags other systems read.
import type { GameSystem, Context } from '../../core/types';
import { el, progressBar } from '../../core/ui';
import { fmt } from '../../core/resources';
import { ARCHIVE as A } from '../../data/balance';

interface ArchiveState { total: Record<string, number>; seen: Record<string, number>; tiers: Record<string, number>; pending?: boolean }
const S = (ctx: Context) => ctx.state.archive as ArchiveState;
const IDS = Object.keys(A.tracks);
const need = (id: string, tier: number) => A.tracks[id].first * Math.pow(A.growth, tier);
const totalTiers = (ctx: Context) => IDS.reduce((t, id) => t + (S(ctx).tiers[id] ?? 0), 0);
const has = (ctx: Context, id: string) => totalTiers(ctx) >= (A.accords.find((a) => a.id === id)?.at ?? Infinity);

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
};

export const archive: GameSystem = {
  id: 'archive',

  init(ctx) {
    ctx.state.archive = { total: {}, seen: {}, tiers: {} } satisfies ArchiveState;
    ctx.bus.on('loaded', () => {
      const s = S(ctx);
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
    return { total: s.total, tiers: s.tiers, seen: { hunt: cur.hunt, wings: cur.wings }, pending: true };
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
    const tiers = totalTiers(ctx);
    for (const a of A.accords) {
      if (tiers < a.at || ctx.flags.has('accord:' + a.id)) continue;
      ctx.flags.add('accord:' + a.id);
      ctx.log(`A new accord: ${a.name}. ${a.desc}`, 'story');
    }
    ctx.mods.set('queenLay', 'archive', has(ctx, 'habit') ? 0.05 : 0);
    for (const [acc, techs] of Object.entries(START_TECHS)) if (has(ctx, acc)) for (const t of techs) ctx.flags.add('tech:' + t);
  },

  panel: (() => {
    const rows = new Map<string, { tier: HTMLElement; bar: ReturnType<typeof progressBar>; note: HTMLElement; wrap: HTMLElement }>();
    let summary: HTMLElement, accords: HTMLElement;
    return {
      title: 'Archive',
      group: 'Knowledge',
      mount(root) {
        const list = el('div.ledger');
        for (const id of IDS) {
          const tier = el('span');
          const note = el('span.muted');
          const bar = progressBar();
          const wrap = el('div.track', {}, el('span', {}, el('strong', {}, A.tracks[id].name), ' ', tier), el('span', {}, note, bar.root));
          rows.set(id, { tier, bar, note, wrap });
          list.append(wrap);
        }
        summary = el('p');
        accords = el('div.ledger');
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
        const tiers = totalTiers(ctx);
        const next = A.accords.find((a) => tiers < a.at);
        summary.textContent = `${tiers} tiers in all.` + (next ? ` The next accord opens at ${next.at}.` : ' Every accord is open.');
        accords.replaceChildren(...A.accords.map((a) => {
          const open = tiers >= a.at;
          return el('div', {}, el(open ? 'span' : 'span.muted', {}, open ? a.name : `${a.name} (at ${a.at} tiers)`), el('span.muted', {}, a.desc));
        }));
      },
    };
  })(),
};
