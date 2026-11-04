// Castes: chew fungus into royal jelly, then spend jelly to breed new kinds of ant.
// Each caste sets the flag "caste:<id>", which unlocks its job on the Colony tab.
// Also: repletes raise food storage (reads ctx.state.jobs.assigned.replete),
// and Jelly glands let nurses make jelly on their own (automation).
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, type ActionButton } from '../../core/ui';
import { fmt } from '../../core/resources';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { CASTES } from '../../data/balance';

interface CasteState { ups: Record<string, number>; chewed: number }
const S = (ctx: Context) => ctx.state.castes as CasteState;
const IDS = Object.keys(CASTES.types);
const nurses = (ctx: Context) => ctx.state.jobs?.assigned?.nurse ?? 0;
const glandRate = (ctx: Context) => nurses(ctx) * CASTES.upgrades.glands.per * (S(ctx).ups.glands ?? 0);
const UPS = fromBalance(CASTES.upgrades, (ctx) => ctx.flags.has('tech:castes'));

export const castes: GameSystem = {
  id: 'castes',

  init(ctx) {
    ctx.res.define({ id: 'jelly', name: 'Royal jelly', cap: CASTES.jellyCap, order: 12, group: 'Brood' });
    ctx.res.define({ id: 'silk', name: 'Silk', order: 24, group: 'Surface' });
    ctx.state.castes = { ups: {}, chewed: 0 } satisfies CasteState;
  },

  isUnlocked: (ctx) => ctx.flags.has('tech:castes'),

  tick(ctx, dt) {
    ctx.res.setCapBonus('food', 'repletes', (ctx.state.jobs?.assigned?.replete ?? 0) * CASTES.replete);
    // nurses with jelly glands chew fungus into jelly by themselves
    const make = glandRate(ctx) * dt;
    if (make > 0 && ctx.res.amt('fungus') >= make * 8 && ctx.res.amt('jelly') < ctx.res.cap('jelly')) {
      ctx.res.add('fungus', -make * 8);
      ctx.res.add('jelly', make);
    }
  },

  panel: (() => {
    let chew: ActionButton, list: HTMLElement, ledger: HTMLElement, ups: ReturnType<typeof upgradeList>;
    const rows = new Map<string, { wrap: HTMLElement; btn: ActionButton; state: HTMLElement }>();
    return {
      title: 'Castes',
      mount(root, ctx) {
        chew = actionButton({
          ctx, label: 'Chew royal jelly', costs: () => CASTES.chew.cost, cooldown: CASTES.chew.cooldown,
          desc: 'Nurses chew fungus and food into one drop of royal jelly.',
          onBuy: (c) => { c.res.add('jelly', 1); S(c).chewed++; },
        });
        list = el('div.build');
        for (const id of IDS) {
          const t = CASTES.types[id];
          const state = el('span.count');
          const btn = actionButton({
            ctx, label: `Breed ${t.name.toLowerCase()}`, desc: t.desc, costs: () => t.cost,
            enabled: (c) => !c.flags.has('caste:' + id),
            onBuy: (c) => { c.flags.add('caste:' + id); c.log(`The first ${t.name.toLowerCase()} crawl out of the brood chamber. ${t.desc}`, 'info'); },
          });
          const wrap = el('div.buildrow', {}, btn.root, el('span.muted', {}, t.desc), state);
          list.append(wrap);
          rows.set(id, { wrap, btn, state });
        }
        ledger = el('div.ledger');
        ups = upgradeList(ctx, () => S(ctx).ups, UPS);
        root.append(
          el('p.flavor', {}, 'Every larva could become anything. Royal jelly decides what.'),
          el('div.row', {}, chew.root),
          ledger,
          el('h3', {}, 'Castes'),
          list,
          el('h3', {}, 'Royal kitchen'),
          ups.root,
        );
      },
      update(_root, ctx) {
        chew.update(ctx);
        for (const id of IDS) {
          const r = rows.get(id)!;
          r.btn.update(ctx);
          r.state.textContent = ctx.flags.has('caste:' + id) ? 'bred' : '';
        }
        const rate = glandRate(ctx);
        ledger.replaceChildren(...[
          ['Jelly from nurses', rate ? `${fmt(rate)}/s (uses ${fmt(rate * 8)} fungus/s)` : 'none yet: buy Jelly glands'],
          ['Castes bred', `${IDS.filter((id) => ctx.flags.has('caste:' + id)).length} of ${IDS.length}`],
        ].map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        ups.update(ctx);
      },
    };
  })(),
};
