// Migration: the second prestige. Once a galleon has found the far shore, and the line has flown
// and settled enough, the whole line can move across the water into the human town.
// Lineage and its perks start over (lineage reads state.migration.migrating in its keep()).
// Heritage is earned and buys permanent perks. Sets the flag legacy:migrated.
import type { GameSystem, Context } from '../../core/types';
import { el } from '../../core/ui';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { MIGRATION as M } from '../../data/town';

interface MigState { perks: Record<string, number>; migrations: number; total: number; flightsAt: number; migrating?: boolean; pending?: boolean }
const S = (ctx: Context) => ctx.state.migration as MigState;
const PERKS = fromBalance(M.perks);
const P = (ctx: Context, id: keyof typeof M.perks) => S(ctx).perks[id] ?? 0;
const flightsSince = (ctx: Context) => (ctx.state.lineage?.flights ?? 0) - S(ctx).flightsAt;
const founded = (ctx: Context) => ctx.state.waters?.founded ?? 0;

function checks(ctx: Context): [string, boolean][] {
  return [
    ['A galleon has reached the far shore', ctx.flags.has('legacy:farshore')],
    [`${M.needs.flights} flights since the last migration (${flightsSince(ctx)})`, flightsSince(ctx) >= M.needs.flights],
    [`${M.needs.settlements} settlements founded across the water, ever (${founded(ctx)})`, founded(ctx) >= M.needs.settlements],
  ];
}
function gain(ctx: Context) {
  const lineage = ctx.state.lineage?.total ?? 0;
  return Math.floor(Math.sqrt(lineage) + 2 * founded(ctx) + flightsSince(ctx));
}
function spent(ctx: Context) {
  let t = 0;
  for (const d of PERKS) for (let L = 0; L < (S(ctx).perks[d.id] ?? 0); L++) t += d.cost(L).heritage ?? 0;
  return t;
}

export const migration: GameSystem = {
  id: 'migration',

  init(ctx) {
    ctx.res.define({ id: 'heritage', name: 'Heritage', order: 1001, integer: true, group: 'Legacy' });
    ctx.state.migration = { perks: {}, migrations: 0, total: 0, flightsAt: 0 } satisfies MigState;
    ctx.bus.on('loaded', () => {
      const s = S(ctx);
      if (!s.pending) return;
      s.pending = false;
      ctx.res.set('heritage', s.total - spent(ctx));
      const founders = M.perks.founders.per * P(ctx, 'founders');
      if (founders) { ctx.res.setCapBonus('ant', 'founders', founders); ctx.res.add('ant', founders); }
    });
  },

  isUnlocked: (ctx) => ctx.flags.has('legacy:farshore') || ctx.flags.has('legacy:migrated'),

  keep(ctx) {
    const s = S(ctx);
    return { perks: s.perks, migrations: s.migrations, total: s.total, flightsAt: s.migrating ? (ctx.state.lineage?.flights ?? 0) : s.flightsAt, pending: true };
  },

  tick(ctx) {
    const per = (id: keyof typeof M.perks) => M.perks[id].per * P(ctx, id);
    ctx.mods.set('lineageGain', 'migration', per('roots'));
    ctx.mods.set('job:elder', 'migration', per('tongue'));
    ctx.mods.set('attention', 'migration', -per('quiet'));
    ctx.mods.set('voyageSpeed', 'migration', per('wrights'));
    ctx.mods.set('champAtk', 'migration', per('kin'));
    ctx.res.setCapBonus('ant', 'founders', M.perks.founders.per * P(ctx, 'founders'));
  },

  panel: (() => {
    let list: HTMLElement, go: HTMLButtonElement, note: HTMLElement, ledger: HTMLElement, perks: ReturnType<typeof upgradeList>;
    return {
      title: 'Migration',
      group: 'Lineage',
      mount(root, ctx) {
        list = el('div.ledger');
        ledger = el('div.ledger');
        note = el('p.muted');
        go = el('button.action', { type: 'button' }, 'Migrate to the town') as HTMLButtonElement;
        go.addEventListener('click', () => {
          if (go.disabled) return;
          if (!go.dataset.armed) {
            go.dataset.armed = '1'; go.textContent = 'Really? Lineage and its perks start over';
            setTimeout(() => { delete go.dataset.armed; go.textContent = 'Migrate to the town'; }, 4000);
            return;
          }
          const s = S(ctx);
          s.total += gain(ctx); s.migrations++; s.migrating = true;
          ctx.flags.add('legacy:migrated');
          ctx.rebirth();
        });
        perks = upgradeList(ctx, () => S(ctx).perks, PERKS);
        root.append(
          el('p.flavor', {}, 'Across the water the ground turns to stone, and the stone is warm, and it smells of bread.'),
          el('p.muted', {}, 'A migration moves your whole line into the human town. Lineage and its perks start over; you earn Heritage instead, and its perks last forever. Your map, champion, archive and genome come with you. Every colony after this starts in the town.'),
          el('h3', {}, 'Before the line can move'), list,
          ledger, el('div.row', {}, go), note,
          el('h3', {}, 'Heritage'), perks.root,
        );
      },
      update(_root, ctx) {
        const s = S(ctx);
        const c = checks(ctx);
        list.replaceChildren(...c.map(([k, ok]) => el('div', {}, el(ok ? 'span' : 'span.muted', {}, k), el('span', {}, ok ? 'done' : 'not yet'))));
        ledger.replaceChildren(...[
          ['Migrations so far', String(s.migrations)],
          ['Heritage a migration would earn now', `${gain(ctx)} (square root of lineage, +2 per settlement, +1 per flight since the last)`],
        ].map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        const ok = c.every(([, v]) => v);
        go.disabled = !ok;
        note.textContent = ok ? 'Everything is ready.' : 'Not ready yet.';
        perks.update(ctx);
      },
    };
  })(),
};
