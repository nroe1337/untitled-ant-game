// Lineage: the first prestige layer. A nuptial flight sends a young queen off to found a new colony.
// The old colony is left behind; you keep Lineage (spent on permanent perks), the map, and legacy flags.
// Reads other systems' state only to score the flight. Publishes mods for its perks.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, progressBar, type ActionButton } from '../../core/ui';
import { fmt } from '../../core/resources';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { BROOD, LINEAGE } from '../../data/balance';

interface Wonder { stage: number; paid: Record<string, number>; settle: number; hold?: boolean }
interface LineageState { perks: Record<string, number>; flights: number; best: number; total: number; pending?: boolean; wonder?: Wonder }
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
  return { parts, total: Math.floor((parts.born + parts.techs + parts.chambers + parts.waves) * (1 + ctx.mods.get('lineageGain'))) };
}
const W = LINEAGE.wonder;
const wonder = (ctx: Context) => (S(ctx).wonder ??= { stage: 0, paid: {}, settle: 0 });
const moundDone = (ctx: Context) => wonder(ctx).stage >= W.stages.length;
const canFly = (ctx: Context) => ctx.flags.has('tech:flight') && moundDone(ctx);

/** How much of resource r the current stage still needs. */
const owed = (ctx: Context, r: string) => {
  const w = wonder(ctx), st = W.stages[w.stage];
  return st ? Math.max(0, (st.cost[r] ?? 0) - (w.paid[r] ?? 0)) : 0;
};
const stagePaid = (ctx: Context) => { const st = W.stages[wonder(ctx).stage]; return !!st && Object.keys(st.cost).every((r) => owed(ctx, r) <= 0); };
/** What can be taken from stores right now (food keeps a floor so builders never cause a famine). */
const spare = (ctx: Context, r: string) => {
  if (!ctx.res.has(r)) return 0;
  const floor = r === 'food' ? ctx.res.cap('food') * W.foodFloor : 0;
  return Math.max(0, ctx.res.amt(r) - floor);
};
/** Carry up to `units` into the current stage, spread over whatever it still needs. Returns units moved. */
function carry(ctx: Context, units: number) {
  const w = wonder(ctx), st = W.stages[w.stage];
  if (!st || stagePaid(ctx)) return 0;
  const want = Object.keys(st.cost).filter((r) => owed(ctx, r) > 0 && spare(ctx, r) > 0);
  if (!want.length) return 0;
  let moved = 0;
  const each = units / want.length;
  for (const r of want) {
    const n = Math.min(each, owed(ctx, r), spare(ctx, r));
    ctx.res.add(r, -n);
    w.paid[r] = (w.paid[r] ?? 0) + n;
    moved += n;
  }
  return moved;
}
function advance(ctx: Context) {
  const w = wonder(ctx), st = W.stages[w.stage];
  if (!st || !stagePaid(ctx)) return;
  if (w.settle < st.time) return;
  ctx.log(st.id === 'spire' ? 'The Swarm Spire is finished. On the next warm evening, the winged ones can fly. (Lineage tab)' : `${st.name} is done. The Swarm Spire rises.`, 'story');
  w.stage++; w.paid = {}; w.settle = 0;
}

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
      ctx.res.set('food', BROOD.flightStartFood);
      const swarm = LINEAGE.perks.swarm.per * P(ctx, 'swarm');
      if (swarm) { ctx.res.setCapBonus('ant', 'swarm', swarm); ctx.res.set('ant', swarm); }
      ctx.log(`The wedding flight is over. A young queen sheds her wings and digs into new earth. This is flight ${s.flights} of your line.` + (swarm ? ` ${swarm} workers came with her.` : ''));
    });
  },

  isUnlocked: (ctx) => ctx.flags.has('tech:flight') || ctx.flags.has('legacy:flown'),

  tick(ctx, dt) {
    if (ctx.flags.has('tech:flight') && !moundDone(ctx)) {
      const w = wonder(ctx);
      const builders = ctx.state.jobs?.assigned?.builder ?? 0;
      if (builders) carry(ctx, builders * W.builderRate * (ctx.flags.has('accord:haul') ? 2 : 1) * dt);
      if (ctx.flags.has('accord:plans') && w.stage === 0) { w.stage = 1; w.paid = {}; }
      if (stagePaid(ctx)) w.settle += dt;
      advance(ctx);
    }
    // Hold scarce materials for the Spire, so other purchases can't spend what it still needs.
    // Soil and food are plentiful and never held. On by default; the player can turn it off.
    const holding = ctx.flags.has('tech:flight') && !moundDone(ctx) && wonder(ctx).hold !== false;
    for (const r of W.held) if (ctx.res.has(r)) ctx.res.hold(r, 'the Swarm Spire', holding ? owed(ctx, r) : 0);
    const per = (id: keyof typeof LINEAGE.perks) => LINEAGE.perks[id].per * P(ctx, id);
    ctx.mods.set('brood', 'lineage', per('blood'));
    ctx.mods.set('job:forager', 'lineage', per('trails'));
    ctx.mods.set('job:elder', 'lineage', per('memory'));
    ctx.mods.set('job:digger', 'lineage', per('digging'));
    ctx.mods.set('soldierPower', 'lineage', per('line'));
    ctx.mods.set('queueSlots', 'lineage', per('plans'));
    ctx.mods.set('livingSpace', 'lineage', per('halls'));
    ctx.res.setCapBonus('ant', 'swarm', LINEAGE.perks.swarm.per * P(ctx, 'swarm'));
  },

  keep(ctx) {
    const s = S(ctx);
    // carry unspent lineage as part of total; perks stay bought
    // a migration starts the line over: lineage and its perks are traded for heritage
    if (ctx.state.migration?.migrating) return { perks: {}, flights: s.flights, best: s.best, total: 0, pending: true };
    return { perks: s.perks, flights: s.flights, best: s.best, total: s.total, pending: true };
  },

  panel: (() => {
    let ledger: HTMLElement, flyBtn: HTMLButtonElement, note: HTMLElement, perks: ReturnType<typeof upgradeList>;
    let mound: HTMLElement, moundHead: HTMLElement, moundInfo: HTMLElement, haul: ActionButton, holdBox: HTMLInputElement;
    const moundBar = progressBar();
    return {
      title: 'Lineage',
      group: 'Lineage',
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
        haul = actionButton({
          ctx, label: 'Haul a load', cooldown: W.haulCooldown, desc: `Carry ${W.haul} units of what the spire needs from your stores. Builders (Colony tab) do this on their own.`,
          enabled: (c) => c.flags.has('tech:flight') && !moundDone(c) && !stagePaid(c), onBuy: (c) => { carry(c, W.haul); advance(c); },
        });
        moundHead = el('h3');
        moundInfo = el('div.ledger');
        holdBox = el('input', { type: 'checkbox', id: 'spire-hold' }) as HTMLInputElement;
        holdBox.addEventListener('change', () => { wonder(ctx).hold = holdBox.checked; });
        mound = el('div.section', {}, el('h3', {}, 'The Swarm Spire'),
          el('p.muted', {}, 'Before a flight the colony raises a great spire of soil. Build it stage by stage. Nothing is lost if you stop for a while.'),
          moundHead, moundInfo, moundBar.root, el('div.row', {}, haul.root),
          el('label.row', { for: 'spire-hold' }, holdBox, 'Hold twigs, resin, seeds, silk and jelly for the Spire (other purchases can\'t spend what it still needs)'));
        root.append(
          el('p.flavor', {}, 'One warm evening the winged ones climb out and take to the air. Only a queen needs to land.'),
          el('p.muted', {}, 'A flight ends this colony and starts a new one. You keep Lineage, its perks, and the territory on your map. Everything else starts over.'),
          mound,
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
        note.textContent = !ctx.flags.has('tech:flight') ? 'Research Winged queens to start the Swarm Spire.'
          : ok ? 'Perks are bought with Lineage and kept forever.' : 'Finish the Swarm Spire to send a flight.';
        mound.hidden = !ctx.flags.has('tech:flight');
        haul.update(ctx);
        holdBox.checked = wonder(ctx).hold !== false;
        const w = wonder(ctx), st = W.stages[w.stage];
        if (!st) { moundHead.textContent = 'Finished'; moundInfo.replaceChildren(); moundBar.set(1); haul.root.hidden = true; }
        else {
          haul.root.hidden = false;
          moundHead.textContent = `Stage ${w.stage + 1} of ${W.stages.length}: ${st.name}`;
          const total = Object.values(st.cost).reduce((a, b) => a + b, 0);
          const paid = Object.keys(st.cost).reduce((a, r) => a + (w.paid[r] ?? 0), 0);
          const rows: [string, string][] = [['', st.desc]];
          for (const r of Object.keys(st.cost)) rows.push([ctx.res.has(r) ? ctx.res.get(r).name : r, `${fmt(w.paid[r] ?? 0)} / ${st.cost[r]}` + (owed(ctx, r) > 0 && spare(ctx, r) <= 0 ? ' (none spare in stores)' : '')]);
          const waiting = Object.keys(st.cost).filter((r) => owed(ctx, r) > 0 && spare(ctx, r) <= 0 && W.sources[r]);
          for (const r of waiting) rows.push([`Need ${ctx.res.has(r) ? ctx.res.get(r).name.toLowerCase() : r}?`, `Find it from ${W.sources[r]}.`]);
          if (st.time) rows.push(['Then', stagePaid(ctx) ? `settling, ${Math.ceil((st.time - w.settle) / 60)} min left` : `${Math.round(st.time / 60)} min to settle once paid`]);
          rows.push(['Builders', `${ctx.state.jobs?.assigned?.builder ?? 0}, carrying ${fmt((ctx.state.jobs?.assigned?.builder ?? 0) * W.builderRate)}/s`]);
          moundInfo.replaceChildren(...rows.map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
          moundBar.set(stagePaid(ctx) && st.time ? w.settle / st.time : paid / total);
        }
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
