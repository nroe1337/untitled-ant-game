// Lineage: the first prestige layer. A nuptial flight sends a young queen off to found a new colony.
// The old colony is left behind; you keep Lineage (spent on permanent perks), the map, and legacy flags.
// Reads other systems' state only to score the flight. Publishes mods for its perks.
import type { GameSystem, Context } from '../../core/types';
import { el } from '../../core/ui';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { BROOD, LINEAGE } from '../../data/balance';

interface LineageState { perks: Record<string, number>; flights: number; best: number; total: number; pending?: boolean }
const S = (ctx: Context) => ctx.state.lineage as LineageState;
const P = (ctx: Context, id: keyof typeof LINEAGE.perks) => S(ctx).perks[id] ?? 0;
const PERKS = fromBalance(LINEAGE.perks);

/** What a flight right now would earn, and why. */
function score(ctx: Context) {
  const born = ctx.state.brood?.born ?? 0;
  const techs = [...ctx.flags].filter((f) => f.startsWith('tech:')).length;
  const chambers = ctx.state.nest?.order?.length ?? 0;
  const waves = ctx.state.war?.won ?? 0;
  const parts = { born: Math.floor(Math.sqrt(born)), techs, chambers: Math.floor(chambers / 10), waves: Math.floor(waves / 2) };
  return { parts, total: parts.born + parts.techs + parts.chambers + parts.waves };
}
const canFly = (ctx: Context) => ctx.flags.has('tech:flight') && Math.floor(ctx.res.amt('ant')) >= LINEAGE.minWorkers;

export const lineage: GameSystem = {
  id: 'lineage',

  init(ctx) {
    ctx.res.define({ id: 'lineage', name: 'Lineage', order: 1000, integer: true, group: 'Legacy' });
    ctx.state.lineage = { perks: {}, flights: 0, best: 0, total: 0 } satisfies LineageState;
    ctx.bus.on('loaded', () => {
      const s = S(ctx);
      if (!s.pending) return;
      // first load after a flight: the new queen lands
      s.pending = false;
      ctx.res.set('lineage', s.total - spent(ctx));
      ctx.res.set('food', BROOD.startFood);
      const swarm = LINEAGE.perks.swarm.per * P(ctx, 'swarm');
      if (swarm) { ctx.res.setCapBonus('ant', 'swarm', swarm); ctx.res.set('ant', swarm); }
      ctx.log(`The wedding flight is over. A young queen sheds her wings and digs into new earth. This is flight ${s.flights} of your line.` + (swarm ? ` ${swarm} workers came with her.` : ''));
    });
  },

  isUnlocked: (ctx) => ctx.flags.has('tech:flight') || ctx.flags.has('legacy:flown'),

  tick(ctx) {
    const per = (id: keyof typeof LINEAGE.perks) => LINEAGE.perks[id].per * P(ctx, id);
    ctx.mods.set('brood', 'lineage', per('blood'));
    ctx.mods.set('job:forager', 'lineage', per('trails'));
    ctx.mods.set('job:elder', 'lineage', per('memory'));
    ctx.mods.set('job:digger', 'lineage', per('digging'));
    ctx.mods.set('soldierPower', 'lineage', per('line'));
    ctx.res.setCapBonus('ant', 'swarm', LINEAGE.perks.swarm.per * P(ctx, 'swarm'));
  },

  keep(ctx) {
    const s = S(ctx);
    // carry unspent lineage as part of total; perks stay bought
    return { perks: s.perks, flights: s.flights, best: s.best, total: s.total, pending: true };
  },

  panel: (() => {
    let ledger: HTMLElement, flyBtn: HTMLButtonElement, note: HTMLElement, perks: ReturnType<typeof upgradeList>;
    return {
      title: 'Lineage',
      mount(root, ctx) {
        ledger = el('div.ledger');
        note = el('p.muted');
        flyBtn = el('button.action', { type: 'button' }, 'Send out the nuptial flight') as HTMLButtonElement;
        flyBtn.addEventListener('click', () => {
          if (!canFly(ctx)) return;
          if (!flyBtn.dataset.armed) {
            flyBtn.dataset.armed = '1';
            flyBtn.textContent = 'Really leave this colony behind?';
            setTimeout(() => { delete flyBtn.dataset.armed; flyBtn.textContent = 'Send out the nuptial flight'; }, 4000);
            return;
          }
          const s = S(ctx);
          const gain = score(ctx).total;
          s.flights++; s.total += gain; s.best = Math.max(s.best, gain);
          ctx.flags.add('legacy:flown');
          ctx.rebirth();
        });
        perks = upgradeList(ctx, () => S(ctx).perks, PERKS);
        root.append(
          el('p.flavor', {}, 'One warm evening the winged ones climb out and take to the air. Only a queen needs to land.'),
          el('p.muted', {}, 'A flight ends this colony and starts a new one. You keep Lineage, its perks, and the territory on your map. Everything else starts over.'),
          ledger, el('div.row', {}, flyBtn), note,
          el('h3', {}, 'Perks of the line'),
          perks.root,
        );
      },
      update(_root, ctx) {
        const s = S(ctx);
        const sc = score(ctx);
        ledger.replaceChildren(...[
          ['Flights so far', String(s.flights)],
          ['A flight now would earn', `${sc.total} lineage`],
          ['  from workers born', `+${sc.parts.born} (square root of all born)`],
          ['  from techs known', `+${sc.parts.techs}`],
          ['  from chambers', `+${sc.parts.chambers} (one per 10)`],
          ['  from raid waves won', `+${sc.parts.waves} (one per 2)`],
        ].map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        const ok = canFly(ctx);
        flyBtn.disabled = !ok;
        note.textContent = !ctx.flags.has('tech:flight') ? 'Research Winged queens to send a flight.'
          : ok ? 'Perks are bought with Lineage and kept forever.' : `A flight needs at least ${LINEAGE.minWorkers} workers to see her off.`;
        perks.update(ctx);
      },
    };
  })(),
};

/** Lineage already spent on perks (so a new colony shows only what is left). */
function spent(ctx: Context) {
  let total = 0;
  for (const d of PERKS) for (let L = 0; L < (S(ctx).perks[d.id] ?? 0); L++) total += d.cost(L).lineage ?? 0;
  return total;
}
