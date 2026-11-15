// Lineage: the first prestige layer. A nuptial flight sends a young queen off to found a new colony.
// The old colony is left behind; you keep Lineage (spent on permanent perks), the map, and legacy flags.
// Reads other systems' state only to score the flight. Publishes mods for its perks.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, progressBar, type ActionButton } from '../../core/ui';
import { fmt } from '../../core/resources';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { dockProject } from '../../core/queue';
import { BROOD, LINEAGE, SEASONS, RESEARCH } from '../../data/balance';

/** next: what Scaffolding has already carried to the stage after this one. */
interface Wonder { stage: number; paid: Record<string, number>; settle: number; hold?: boolean; next?: Record<string, number> }
interface LineageState {
  perks: Record<string, number>; flights: number; best: number; total: number; pending?: boolean; wonder?: Wonder;
  /** Princess traits the line carries (kept for good), and whether this colony has picked its new one. */
  traits?: string[]; picked?: boolean;
  /** Fine evenings: seconds to the next evening, seconds left of the current one, and whether it is fine. */
  eveCd?: number; eveLeft?: number; fine?: boolean; autoFly?: boolean;
  /** Dowry carried from the last colony, still to be unpacked into stores as room allows. */
  dowry?: Record<string, number>;
}
const S = (ctx: Context) => ctx.state.lineage as LineageState;
const P = (ctx: Context, id: keyof typeof LINEAGE.perks) => S(ctx).perks[id] ?? 0;
const PERKS = fromBalance(LINEAGE.perks);

/** What a flight right now would earn, and why. */
function score(ctx: Context) {
  const born = ctx.state.brood?.born ?? 0;
  const techs = [...ctx.flags].filter((f) => f.startsWith('tech:')).length;
  const chambers = ctx.state.nest?.order?.length ?? 0;
  const waves = ctx.state.war?.won ?? 0;
  const parts = { born: Math.floor(Math.sqrt(born)), techs, chambers: Math.floor(chambers / 10), waves: Math.floor(waves / 2), winters: (ctx.state.seasons?.winters ?? 0) * SEASONS.winterLineage };
  const fine = fineNow(ctx) ? LINEAGE.evenings.bonus : 0;
  return { parts, fine, total: Math.floor((parts.born + parts.techs + parts.chambers + parts.waves + parts.winters) * (1 + ctx.mods.get('lineageGain') + fine)) };
}
const W = LINEAGE.wonder;
const wonder = (ctx: Context) => (S(ctx).wonder ??= { stage: 0, paid: {}, settle: 0 });
const moundDone = (ctx: Context) => wonder(ctx).stage >= W.stages.length;
/** A flight needs a warm evening: not in autumn or winter (once the year turns). */
const warm = (ctx: Context) => ctx.mods.get('cold') <= 0;
const canFly = (ctx: Context) => ctx.flags.has('tech:flight') && moundDone(ctx) && warm(ctx);
/** A fine evening is on now (Sky-reader makes every warm evening fine). */
function fineNow(ctx: Context) { const s = S(ctx); return warm(ctx) && (s.eveLeft ?? 0) > 0 && (!!s.fine || trait(ctx, 'sky')); }
/** Evenings come and go; some are fine. Only Weather watch shows them, but a lucky flight earns the bonus anyway. */
function evenings(ctx: Context, dt: number) {
  const s = S(ctx), E = LINEAGE.evenings;
  if ((s.eveLeft ?? 0) > 0) { s.eveLeft = Math.max(0, (s.eveLeft ?? 0) - dt); return; }
  s.eveCd = (s.eveCd ?? E.every) - dt;
  if (s.eveCd > 0) return;
  s.eveCd = E.every; s.eveLeft = E.last; s.fine = Math.random() < E.fineChance;
  if (fineNow(ctx) && ctx.flags.has('tech:weatherwatch') && !s.autoFly) ctx.log('A fine evening: still air and a warm sky. A flight now earns more lineage.', 'info');
}
/** Princess traits the line doesn't carry yet. */
const pickable = (ctx: Context) => Object.keys(LINEAGE.traits).filter((id) => !trait(ctx, id));
const canPick = (ctx: Context) => !S(ctx).picked && wonder(ctx).stage >= 3 && ctx.flags.has('tech:winglore') && pickable(ctx).length > 0;
function pickTrait(ctx: Context, id: string) {
  const s = S(ctx);
  if (!canPick(ctx) || trait(ctx, id)) return;
  (s.traits ??= []).push(id); s.picked = true;
  ctx.log(`The princesses are born ${LINEAGE.traits[id].name.toLowerCase()}. ${LINEAGE.traits[id].desc} Your line carries it from now on.`, 'story');
}
/** Send the flight: this colony ends and a new one begins. */
function fly(ctx: Context) {
  if (!canFly(ctx)) return;
  const s = S(ctx);
  const gain = score(ctx).total;
  s.flights++; s.total += gain; s.best = Math.max(s.best, gain);
  // the dowry: from the 3rd flight on, the queen carries a share of the food and soil
  s.dowry = s.flights >= LINEAGE.dowry.after ? Object.fromEntries(LINEAGE.dowry.ids.map((r) => [r, Math.floor(ctx.res.amt(r) * LINEAGE.dowry.share)])) : undefined;
  ctx.flags.add('legacy:flown');
  ctx.rebirth();
}

/** How much of resource r the current stage still needs. */
const owed = (ctx: Context, r: string) => {
  const w = wonder(ctx), st = W.stages[w.stage];
  return st ? Math.max(0, (st.cost[r] ?? 0) - (w.paid[r] ?? 0)) : 0;
};
const stagePaid = (ctx: Context) => { const st = W.stages[wonder(ctx).stage]; return !!st && Object.keys(st.cost).every((r) => owed(ctx, r) <= 0); };
/** Each stage needs its own research first (stage gates). */
const gateOpen = (ctx: Context, i: number) => { const st = W.stages[i]; return !!st && ctx.flags.has('tech:' + st.needs); };
const gateName = (i: number) => RESEARCH.techs[W.stages[i]?.needs]?.name ?? W.stages[i]?.needs;
/** Scaffolding: while a stage settles, carry to the next one. */
const scaffoldNext = (ctx: Context) => { const w = wonder(ctx); return ctx.flags.has('tech:scaffolding') && stagePaid(ctx) && W.stages[w.stage].time > 0 && gateOpen(ctx, w.stage + 1) ? w.stage + 1 : -1; };
const owedNext = (ctx: Context, r: string) => { const w = wonder(ctx), st = W.stages[w.stage + 1]; return st ? Math.max(0, (st.cost[r] ?? 0) - (w.next?.[r] ?? 0)) : 0; };
const trait = (ctx: Context, id: string) => (S(ctx).traits ?? []).includes(id);
/** How long the current stage settles (Early wings shortens the princesses). */
const settleTime = (ctx: Context, i: number) => W.stages[i].time * (W.stages[i].id === 'princesses' && trait(ctx, 'early') ? 1 - (LINEAGE.traits.early.per ?? 0) : 1);
/** What can be taken from stores right now (food keeps a floor so builders never cause a famine). */
const spare = (ctx: Context, r: string) => {
  if (!ctx.res.has(r)) return 0;
  const floor = r === 'food' ? ctx.res.cap('food') * W.foodFloor : 0;
  return Math.max(0, ctx.res.amt(r) - floor);
};
/** Carry up to `units` into the current stage, spread over whatever it still needs. Returns units moved. */
function carry(ctx: Context, units: number) {
  const w = wonder(ctx), st = W.stages[w.stage];
  if (st && stagePaid(ctx) && scaffoldNext(ctx) >= 0) return carryNext(ctx, units);
  if (!st || stagePaid(ctx) || !gateOpen(ctx, w.stage)) return 0;
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
function carryNext(ctx: Context, units: number) {
  const w = wonder(ctx), st = W.stages[w.stage + 1];
  const want = Object.keys(st.cost).filter((r) => owedNext(ctx, r) > 0 && spare(ctx, r) > 0);
  if (!want.length) return 0;
  let moved = 0;
  w.next ??= {};
  for (const r of want) {
    const n = Math.min(units / want.length, owedNext(ctx, r), spare(ctx, r));
    ctx.res.add(r, -n); w.next[r] = (w.next[r] ?? 0) + n; moved += n;
  }
  return moved;
}
function advance(ctx: Context) {
  const w = wonder(ctx), st = W.stages[w.stage];
  if (!st || !stagePaid(ctx)) return;
  if (w.settle < settleTime(ctx, w.stage)) return;
  ctx.log(st.id === 'spire' ? 'The Swarm Spire is finished. On the next warm evening, the winged ones can fly. (Legacy tab)' : `${st.name} is done. The Swarm Spire rises.`, 'story');
  w.stage++; w.paid = w.next ?? {}; w.next = undefined; w.settle = 0;
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
      if (trait(ctx, 'warborn')) ctx.flags.add('tech:martial');
      const dw = s.dowry && Object.values(s.dowry).some((n) => n > 0) ? ` She brings a dowry: ${Object.entries(s.dowry).map(([r, n]) => `${fmt(n)} ${r}`).join(' and ')}, unpacked as the stores make room.` : '';
      ctx.log(`The wedding flight is over. A young queen sheds her wings and digs into new earth. This is flight ${s.flights} of your line.` + (swarm ? ` ${swarm} workers came with her.` : '') + dw);
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
    evenings(ctx, dt);
    const s = S(ctx);
    if (s.autoFly && ctx.flags.has('tech:weatherwatch') && fineNow(ctx) && canFly(ctx)) { ctx.log('A fine evening. The winged ones climb out and take to the air.', 'story'); fly(ctx); return; }
    // the dowry unpacks as the stores make room
    if (s.dowry) {
      for (const [r, n] of Object.entries(s.dowry)) {
        if (n <= 0 || !ctx.res.has(r)) continue;
        const room = Math.max(0, ctx.res.cap(r) - ctx.res.amt(r)), k = Math.min(n, room);
        if (k > 0) { ctx.res.source = 'Dowry'; ctx.res.add(r, k); s.dowry[r] = n - k; }
      }
      if (Object.values(s.dowry).every((n) => n <= 0.5)) s.dowry = undefined;
    }
    // princess traits publish rule changes for the systems that read them
    ctx.mods.set('rumourRuns', 'traits', trait(ctx, 'sweet') ? 1 : 0);
    ctx.mods.set('fierceGuards', 'traits', trait(ctx, 'fierce') ? 1 : 0);
    ctx.mods.set('freeLookouts', 'traits', trait(ctx, 'keen') ? 1 : 0);
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
    // carry unspent lineage as part of total; perks stay bought. Deeper prestiges (migration, supercolony)
    // never wipe the line: they pay their own currencies, and flights can always be ground for more.
    return { perks: s.perks, flights: s.flights, best: s.best, total: s.total, pending: true, traits: s.traits ?? [], dowry: s.dowry, autoFly: s.autoFly };
  },

  panel: (() => {
    let ledger: HTMLElement, flyBtn: HTMLButtonElement, note: HTMLElement, perks: ReturnType<typeof upgradeList>;
    let mound: HTMLElement, moundHead: HTMLElement, moundInfo: HTMLElement, haul: ActionButton, holdBox: HTMLInputElement;
    let traitBox: HTMLElement, traitRow: HTMLElement, traitHave: HTMLElement, weather: HTMLElement, weatherText: HTMLElement, autoBox: HTMLInputElement;
    const traitBtns = new Map<string, HTMLButtonElement>();
    const moundBar = progressBar();
    return {
      title: 'Lineage',
      group: 'Legacy',
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
          fly(ctx);
        });
        perks = upgradeList(ctx, () => S(ctx).perks, PERKS);
        haul = actionButton({
          ctx, label: 'Haul a load', cooldown: W.haulCooldown, desc: `Carry ${W.haul} units of what the spire needs from your stores. Builders (Jobs tab) do this on their own.`,
          enabled: (c) => c.flags.has('tech:flight') && !moundDone(c) && ((!stagePaid(c) && gateOpen(c, wonder(c).stage)) || scaffoldNext(c) >= 0), onBuy: (c) => { carry(c, W.haul * (c.flags.has('tech:pulleys') ? W.pulley : 1)); advance(c); },
        });
        moundHead = el('h3');
        moundInfo = el('div.ledger');
        holdBox = el('input', { type: 'checkbox', id: 'spire-hold' }) as HTMLInputElement;
        holdBox.addEventListener('change', () => { wonder(ctx).hold = holdBox.checked; });
        traitRow = el('div.row.wrap');
        for (const [id, t] of Object.entries(LINEAGE.traits)) {
          const b = el('button.ghost', { type: 'button', title: t.desc }, t.name) as HTMLButtonElement;
          b.addEventListener('click', () => pickTrait(ctx, id));
          traitBtns.set(id, b); traitRow.append(b);
        }
        traitHave = el('p.muted');
        traitBox = el('div.section', { hidden: true }, el('h3', {}, 'Princess traits'),
          el('p.muted', {}, 'Each colony\'s princesses carry one new trait for your line. Pick one; the ones you picked before stay with you. Hover a trait for what it does.'),
          traitRow, traitHave);
        weatherText = el('span');
        autoBox = el('input', { type: 'checkbox', id: 'fly-auto' }) as HTMLInputElement;
        autoBox.addEventListener('change', () => { S(ctx).autoFly = autoBox.checked; });
        weather = el('div.section', { hidden: true }, el('h3', {}, 'Weather watch'), el('p', {}, weatherText),
          el('label.row', { for: 'fly-auto' }, autoBox, 'Fly on the next fine evening, once the Spire is done'));
        mound = el('div.section', {}, el('h3', {}, 'The Swarm Spire'),
          el('p.muted', {}, 'Before a flight the colony raises a great spire of soil. Build it stage by stage. Nothing is lost if you stop for a while.'),
          moundHead, moundInfo, moundBar.root, el('div.row', {}, haul.root),
          el('label.row', { for: 'spire-hold' }, holdBox, el('span', {}, 'Hold twigs, resin, seeds, silk and jelly for the Spire (other purchases can\'t spend what it still needs)')));
        root.append(
          el('p.flavor', {}, 'One warm evening the winged ones climb out and take to the air. Only a queen needs to land.'),
          el('p.muted', {}, 'A flight ends this colony and starts a new one. You keep Lineage, its perks, and the territory on your map. Everything else starts over.'),
          el('p.muted', {}, 'The Age of Wings is the end of a colony\'s road. Your line is meant to fly several times: each flight earns Lineage, and each colony after it grows faster and reaches further. Pushing on without flying works, but it drags. Once the line has flown 3 times and a galleon has found the far shore, it can migrate into the Age of Settlement.'),
          mound, traitBox, weather,
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
          ...(ctx.state.seasons?.started ? [['  from winters survived', `+${sc.parts.winters} (${SEASONS.winterLineage} each, if no one starved)`]] : []),
          ...(sc.fine ? [['  fine evening', `+${Math.round(sc.fine * 100)}%`]] : []),
          ...(s.flights + 1 >= LINEAGE.dowry.after ? [['Dowry', `${LINEAGE.dowry.ids.map((r) => `${fmt(ctx.res.amt(r) * LINEAGE.dowry.share)} ${r}`).join(' and ')} goes with the queen`]] : [['Dowry', `from flight ${LINEAGE.dowry.after}: ${Math.round(LINEAGE.dowry.share * 100)}% of food and soil goes with the queen`]]),
        ].map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        const ok = canFly(ctx);
        flyBtn.disabled = !ok;
        note.textContent = !ctx.flags.has('tech:flight') ? 'Research Winged queens to start the Swarm Spire.'
          : ok ? 'Perks are bought with Lineage and kept forever.' : moundDone(ctx) && !warm(ctx) ? 'The Spire is ready, but the evenings are cold. The flight waits for spring.' : 'Finish the Swarm Spire to send a flight.';
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
          if (!gateOpen(ctx, w.stage)) rows.push(['Needs research', `${gateName(w.stage)} (it shows on the Research tab as the Spire rises)`]);
          const nx = scaffoldNext(ctx); if (nx >= 0) rows.push(['Scaffolding', `while this settles, builders carry to the ${W.stages[nx].name}: ${Object.keys(W.stages[nx].cost).map((r) => `${fmt(w.next?.[r] ?? 0)}/${W.stages[nx].cost[r]} ${r}`).join(', ')}`]);
          for (const r of Object.keys(st.cost)) rows.push([ctx.res.has(r) ? ctx.res.get(r).name : r, `${fmt(w.paid[r] ?? 0)} / ${st.cost[r]}` + (owed(ctx, r) > 0 && spare(ctx, r) <= 0 ? ' (none spare in stores)' : '')]);
          const waiting = Object.keys(st.cost).filter((r) => owed(ctx, r) > 0 && spare(ctx, r) <= 0 && W.sources[r]);
          for (const r of waiting) rows.push([`Need ${ctx.res.has(r) ? ctx.res.get(r).name.toLowerCase() : r}?`, `Find it from ${W.sources[r]}.`]);
          if (st.time) rows.push(['Then', stagePaid(ctx) ? `settling, ${Math.ceil((settleTime(ctx, w.stage) - w.settle) / 60)} min left` : `${Math.round(settleTime(ctx, w.stage) / 60)} min to settle once paid`]);
          rows.push(['Builders', `${ctx.state.jobs?.assigned?.builder ?? 0}, carrying ${fmt((ctx.state.jobs?.assigned?.builder ?? 0) * W.builderRate)}/s`]);
          moundInfo.replaceChildren(...rows.map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
          moundBar.set(stagePaid(ctx) && st.time ? w.settle / settleTime(ctx, w.stage) : paid / total);
        }
        perks.update(ctx);
        // princess traits
        const owned = s.traits ?? [];
        traitBox.hidden = !ctx.flags.has('tech:winglore') && !owned.length;
        const can = canPick(ctx);
        for (const [id, b] of traitBtns) { b.hidden = !can || owned.includes(id); }
        traitRow.hidden = !can;
        traitHave.textContent = (owned.length ? `Your line carries: ${owned.map((id) => `${LINEAGE.traits[id].name} (${LINEAGE.traits[id].desc.replace(/\.$/, '')})`).join('; ')}.` : 'Your line carries no traits yet.')
          + (can ? '' : s.picked ? ' This colony\'s pick is made.' : !pickable(ctx).length ? '' : ' A new pick opens at the Winged princesses stage.');
        // weather watch
        weather.hidden = !ctx.flags.has('tech:weatherwatch');
        if (!weather.hidden) {
          const E = LINEAGE.evenings;
          weatherText.textContent = !warm(ctx) ? 'Cold evenings. No flight until spring.'
            : fineNow(ctx) ? `A fine evening now, ${Math.ceil(s.eveLeft ?? 0)}s left. A flight now earns +${Math.round(E.bonus * 100)}% lineage.`
            : (s.eveLeft ?? 0) > 0 ? `An evening, but not a fine one. The next comes in about ${Math.ceil((s.eveCd ?? E.every) / 60)} min.`
            : `The next evening comes in about ${Math.ceil((s.eveCd ?? E.every) / 60)} min. About ${Math.round(E.fineChance * 100)}% of evenings are fine.`;
          autoBox.checked = !!s.autoFly;
        }
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

// ---- the Swarm Spire on the project bar above the tabs ----
const spireBar = el('div.projectbar', { hidden: true });
dockProject(spireBar, (ctx) => {
  const s = ctx.state.lineage as LineageState | undefined;
  const on = !!s && ctx.flags.has('tech:flight') && !moundDone(ctx);
  spireBar.hidden = !on;
  if (!on) return;
  const w = wonder(ctx), st = W.stages[w.stage];
  const total = Object.values(st.cost).reduce((a, b) => a + b, 0) || 1;
  const paid = Object.keys(st.cost).reduce((a, r) => a + Math.min(st.cost[r], w.paid[r] ?? 0), 0);
  const part = stagePaid(ctx) && st.time ? 0.5 + 0.5 * Math.min(1, w.settle / settleTime(ctx, w.stage)) : (st.time ? 0.5 : 1) * paid / total;
  const p = (w.stage + part) / W.stages.length;
  const what = !gateOpen(ctx, w.stage) ? `needs ${gateName(w.stage)}` : stagePaid(ctx) && st.time ? 'settling' : st.name;
  const key = `${w.stage}|${what}|${Math.floor(p * 200)}`;
  if (spireBar.dataset.k === key) return;
  spireBar.dataset.k = key;
  const fill = el('span.fill'); fill.style.width = `${(p * 100).toFixed(1)}%`;
  spireBar.replaceChildren(el('div.project', { title: 'Legacy, Lineage' }, el('span.pname', {}, `The Swarm Spire: stage ${w.stage + 1} of ${W.stages.length}, ${what}`), el('span.bar', {}, fill), el('span.ppct', {}, `${Math.floor(p * 100)}%`)));
});
