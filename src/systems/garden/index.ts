// Fungus garden: leafcutters bring leaves, fungus beds turn them into fungus.
// Untended beds catch mould, and mould spreads. Weed by hand, or let gardeners (a caste) do it.
// Fungus feeds larvae (they grow faster) and pays for castes.
// Reads: ctx.state.nest.built.fungus (beds), ctx.state.jobs.assigned.gardener. Publishes mod 'larvaGrowth'.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, type ActionButton } from '../../core/ui';
import { fmt } from '../../core/resources';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { GARDEN } from '../../data/balance';
import { PAL, rect, setup } from '../../core/pixel';

interface GardenState { mould: number; ups: Record<string, number>; weeded: number; warned?: boolean }
const S = (ctx: Context) => ctx.state.garden as GardenState;
const lvl = (ctx: Context, id: keyof typeof GARDEN.upgrades) => S(ctx).ups[id] ?? 0;
const beds = (ctx: Context) => ctx.state.nest?.built?.fungus ?? 0;
const gardeners = (ctx: Context) => ctx.state.jobs?.assigned?.gardener ?? 0;
const tended = (ctx: Context) => Math.min(beds(ctx), gardeners(ctx) * GARDEN.bedsPerGardener);
const healthy = (ctx: Context) => Math.max(0, beds(ctx) - S(ctx).mould);
const bedRate = (ctx: Context) => GARDEN.fungusPerBed * (1 + GARDEN.upgrades.compost.per * lvl(ctx, 'compost'));
const UPS = fromBalance(GARDEN.upgrades, (ctx) => beds(ctx) > 0);

export const garden: GameSystem = {
  id: 'garden',

  init(ctx) {
    ctx.res.define({ id: 'leaf', name: 'Leaves', cap: GARDEN.leafCap, order: 15, group: 'Garden' });
    ctx.res.define({ id: 'fungus', name: 'Fungus', cap: GARDEN.fungusCap, order: 16, group: 'Garden' });
    ctx.state.garden = { mould: 0, ups: {}, weeded: 0 } satisfies GardenState;
  },

  isUnlocked: (ctx) => ctx.flags.has('tech:fungus'),

  tick(ctx, dt) {
    const s = S(ctx);
    const n = beds(ctx);
    s.mould = Math.min(s.mould, n);
    ctx.res.setCapBonus('leaf', 'garden', n * 10);

    // mould: untended healthy beds catch it, mouldy beds spread it to untended ones
    const exposed = Math.max(0, healthy(ctx) - tended(ctx));
    const shield = Math.max(0.2, 1 - GARDEN.upgrades.spores.per * lvl(ctx, 'spores'));
    if (exposed > 0) {
      const p = (exposed / GARDEN.mouldEvery + (s.mould * exposed) / Math.max(1, n) / GARDEN.spreadEvery) * shield * dt;
      if (Math.random() < p) {
        s.mould++;
        ctx.log(s.mould === 1 ? 'Grey fuzz creeps over a fungus bed. Mould. Weed it before it spreads.' : 'The mould spreads to another bed.', 'warn');
      }
    }
    // gardeners also clear mould they can reach, slowly
    if (s.mould > 0 && gardeners(ctx) > 0 && Math.random() < (gardeners(ctx) / 60) * dt) { s.mould--; s.weeded++; }

    // healthy beds turn leaves into fungus
    const h = healthy(ctx);
    if (h > 0) {
      const need = h * GARDEN.leafPerBed * dt;
      const share = Math.min(1, ctx.res.amt('leaf') / need);
      ctx.res.add('leaf', -need * share);
      ctx.res.add('fungus', h * bedRate(ctx) * share * dt);
    }

    // larvae that get fungus grow faster
    const larvae = ctx.res.amt('larva');
    const eat = larvae * GARDEN.larvaFungus * dt;
    const fed = larvae >= 1 && ctx.res.amt('fungus') - eat >= ctx.res.cap('fungus') * GARDEN.larvaReserve;
    if (fed) ctx.res.add('fungus', -eat);
    ctx.mods.set('larvaGrowth', 'garden', fed ? GARDEN.larvaBoost : 0);

    ctx.alert('mould', s.mould > 0 ? `${s.mould} fungus bed${s.mould > 1 ? 's have mould and make' : ' has mould and makes'} nothing. Weed them in the Garden tab.` : null);
  },

  panel: (() => {
    let weed: ActionButton, ledger: HTMLElement, cv: HTMLCanvasElement, ups: ReturnType<typeof upgradeList>;
    let frame = 0;
    return {
      title: 'Garden',
      group: 'Home',
      mount(root, ctx) {
        weed = actionButton({
          ctx, label: 'Weed a mouldy bed', cooldown: GARDEN.weedCooldown,
          desc: 'Scrape the mould off one bed by hand.',
          enabled: (c) => S(c).mould > 0,
          onBuy: (c) => { S(c).mould--; S(c).weeded++; },
        });
        ledger = el('div.ledger');
        cv = el('canvas.nestview', { width: 320, height: 48, 'aria-label': 'Your fungus beds' }) as HTMLCanvasElement;
        ups = upgradeList(ctx, () => S(ctx).ups, UPS);
        root.append(
          el('p.flavor', {}, 'Leaves go in. Fungus grows. The colony eats what it farms.'),
          el('p.muted', {}, 'Put workers on the Leafcutter job, then build Fungus gardens in the Nest. Each garden is one bed.'),
          cv,
          el('div.row', {}, weed.root),
          ledger,
          el('h3', {}, 'Garden upgrades'),
          ups.root,
        );
      },
      update(_root, ctx) {
        const s = S(ctx);
        weed.update(ctx);
        const n = beds(ctx);
        const fed = ctx.mods.get('larvaGrowth') > 0;
        const rows: [string, string][] = [
          ['Fungus beds', n ? `${healthy(ctx)} healthy, ${s.mould} mouldy` : 'None yet. Build a Fungus garden in the Nest.'],
          ['Leaves eaten', `${fmt(healthy(ctx) * GARDEN.leafPerBed)}/s`],
          ['Fungus grown', `${fmt(healthy(ctx) * bedRate(ctx))}/s`],
          ['Beds kept clean by gardeners', ctx.flags.has('caste:minim') ? `${tended(ctx)} of ${n}` : 'Needs the Minim caste'],
          ['Larvae', fed ? `eating fungus, growing ${Math.round(GARDEN.larvaBoost * 100)}% faster` : `fed fungus only once stores are over ${Math.round(GARDEN.larvaReserve * 100)}% full`],
        ];
        ledger.replaceChildren(...rows.map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        ups.update(ctx);
        // flat beds: green tufts when healthy, grey fuzz when mouldy
        const g = setup(cv);
        frame++;
        rect(g, 0, 0, cv.width, cv.height, PAL.soil);
        const per = Math.max(1, Math.min(16, n));
        const w = Math.floor((cv.width - 8) / Math.max(per, 6));
        for (let i = 0; i < per; i++) {
          const x = 4 + i * w;
          rect(g, x, 30, w - 4, 10, PAL.hole);
          const mouldy = i >= per - Math.min(per, s.mould);
          for (let k = 0; k < 4; k++) {
            const sway = mouldy ? 0 : ((frame >> 3) + k + i) % 2;
            rect(g, x + 2 + k * Math.floor((w - 8) / 4), 24 + sway, 3, 6, mouldy ? '#8a8a80' : PAL.food);
          }
        }
      },
    };
  })(),
};
