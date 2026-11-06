// Husbandry: herds of small insects kept for honeydew, wax and (rarely) royal jelly.
// Pasture herds need open ground (grass tiles you own on the Map); cellar herds live on roots underground.
// Herders tend the animals; untended ones give little. Predators sometimes find the pasture and eat
// a few animals until driven off (never more than a small share). Honeydew tides the colony over
// when food runs low. Reads ctx.state.map.tiles, ctx.state.nest.order, jobs.assigned.herder.
// Publishes milked (for the archive) and reads the 'herdYield' mod.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, tileButton, type ActionButton } from '../../core/ui';
import { fmt } from '../../core/resources';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { PAL, rect, setup } from '../../core/pixel';
import { HUSBANDRY as H } from '../../data/balance';

interface Predator { kind: number; eaten: number; t: number; limit: number }
interface HerdState { herds: Record<string, number>; milked: number; ups: Record<string, number>; pred: Predator | null; driven: number; lost: number }
const S = (ctx: Context) => ctx.state.husbandry as HerdState;
const SP = H.species;
const IDS = Object.keys(SP);
const UPS = fromBalance(H.upgrades);
const lvl = (ctx: Context, id: keyof typeof H.upgrades) => S(ctx).ups[id] ?? 0;
const herders = (ctx: Context) => ctx.state.jobs?.assigned?.herder ?? 0;
const grassTiles = (ctx: Context) => ((ctx.state.map?.tiles ?? []) as { t: string; o: string | null }[]).filter((t) => t.o === 'you' && (t.t === 'grass' || t.t === 'soil')).length;
const room = (ctx: Context, kind: 'pasture' | 'cellar') => kind === 'pasture'
  ? H.pastureBase + H.pasturePerTile * grassTiles(ctx)
  : H.cellarBase + Math.floor((ctx.state.nest?.order?.length ?? 0) / H.cellarPerChambers);
const used = (ctx: Context, kind: 'pasture' | 'cellar') => IDS.filter((id) => SP[id].room === kind).reduce((t, id) => t + (S(ctx).herds[id] ?? 0), 0);
const animals = (ctx: Context) => IDS.reduce((t, id) => t + (S(ctx).herds[id] ?? 0), 0);
const tendedShare = (ctx: Context) => { const n = animals(ctx); return n ? Math.min(1, (herders(ctx) * (H.herderTends + lvl(ctx, 'docile'))) / n) : 1; };
const unlocked = (ctx: Context, id: string) => S(ctx).milked >= SP[id].unlock;
const yieldMult = (ctx: Context) => 1 + H.upgrades.sweet.per * lvl(ctx, 'sweet') + ctx.mods.get('herdYield');

/** Output per second of each resource, given how well the herds are tended. */
function rates(ctx: Context) {
  const s = S(ctx), out: Record<string, number> = {};
  const tend = tendedShare(ctx);
  for (const id of IDS) {
    const n = Math.floor(s.herds[id] ?? 0);
    if (!n) continue;
    const eff = tend + (1 - tend) * (id === 'hopper' ? 0 : H.untended);
    for (const [r, v] of Object.entries(SP[id].yields)) out[r] = (out[r] ?? 0) + v * n * eff * yieldMult(ctx);
  }
  return out;
}

export const husbandry: GameSystem = {
  id: 'husbandry',

  init(ctx) {
    ctx.res.define({ id: 'honeydew', name: 'Honeydew', cap: H.honeydewCap, order: 35, group: 'Herds' });
    ctx.res.define({ id: 'wax', name: 'Wax', cap: H.waxCap, order: 36, group: 'Herds' });
    ctx.state.husbandry = { herds: {}, milked: 0, ups: {}, pred: null, driven: 0, lost: 0 } satisfies HerdState;
  },

  isUnlocked: (ctx) => ctx.flags.has('tech:husbandry'),

  tick(ctx, dt) {
    if (!ctx.flags.has('tech:husbandry')) return;
    const s = S(ctx);
    ctx.res.setCapBonus('honeydew', 'herds', animals(ctx) * 2);
    // produce
    for (const [r, v] of Object.entries(rates(ctx))) {
      if (!ctx.res.has(r)) continue;
      ctx.res.add(r, v * dt);
      if (r === 'honeydew') s.milked += v * dt;
    }
    // breed toward the room there is; untended treehoppers drift away
    const breed = H.breed * (1 + H.upgrades.litters.per * lvl(ctx, 'litters'));
    for (const id of IDS) {
      const n = s.herds[id] ?? 0;
      if (n <= 0) continue;
      const kind = SP[id].room, R = room(ctx, kind), U = used(ctx, kind);
      let grow = breed * n * (1 - U / R) * dt;
      if (id === 'hopper') grow -= (1 - tendedShare(ctx)) * n * 0.002 * dt;
      s.herds[id] = Math.max(0, Math.min(SP[id].max ?? Infinity, n + grow));
    }
    // a hungry colony drinks honeydew
    if (ctx.res.amt('food') < ctx.res.cap('food') * H.drinkBelow && ctx.res.amt('honeydew') > 0) {
      const sip = Math.min(ctx.res.amt('honeydew'), H.drinkRate * dt);
      ctx.res.add('honeydew', -sip);
      ctx.res.add('food', sip * H.drinkValue);
    }
    // predators
    const pasture = used(ctx, 'pasture');
    if (!s.pred && pasture >= 4 && Math.random() < (dt / H.predatorEvery) * Math.max(0.2, 1 - H.upgrades.fences.per * lvl(ctx, 'fences'))) {
      const kind = Math.floor(Math.random() * H.predators.length);
      s.pred = { kind, eaten: 0, t: 0, limit: Math.max(1, Math.floor(pasture * H.predatorMax)) };
      ctx.log(`${H.predators[kind].name} has found the pasture. ${H.predators[kind].note} (Herds tab)`, 'warn');
    }
    if (s.pred) {
      const p = s.pred;
      if (Math.random() < herders(ctx) * H.herderDrive * dt) { s.pred = null; s.driven++; ctx.log('The herders drive the predator off.', 'info'); }
      else {
        p.t += dt;
        if (p.t >= H.predatorBite) {
          p.t = 0;
          const prey = IDS.filter((id) => SP[id].room === 'pasture' && (s.herds[id] ?? 0) >= 1);
          if (prey.length) { const id = prey[Math.floor(Math.random() * prey.length)]; s.herds[id] -= 1; p.eaten++; s.lost++; }
          if (p.eaten >= p.limit || !prey.length) { s.pred = null; ctx.log(`The predator leaves, full. It took ${p.eaten} animals.`, 'warn'); }
        }
      }
    }
    ctx.alert('predator', s.pred ? `${H.predators[s.pred.kind].name} is eating your herd, one animal every ${H.predatorBite}s. Drive it off in the Herds tab, or put more workers on Herder.` : null);
  },

  panel: (() => {
    let milk: ActionButton, drive: ActionButton, ledger: HTMLElement, list: HTMLElement, cv: HTMLCanvasElement, ups: ReturnType<typeof upgradeList>;
    const caps: { id: string; btn: ReturnType<typeof tileButton> }[] = [];
    let frame = 0;
    return {
      title: 'Herds',
      group: 'Home',
      mount(root, ctx) {
        milk = actionButton({
          ctx, label: 'Stroke the herd', cooldown: H.milk.cooldown,
          desc: `Coax out ${H.milk.seconds} seconds' worth of honeydew and wax by hand.`,
          enabled: (c) => animals(c) >= 1,
          onBuy: (c) => { for (const [r, v] of Object.entries(rates(c))) if (c.res.has(r)) { c.res.lump(r, v * H.milk.seconds); if (r === 'honeydew') S(c).milked += v * H.milk.seconds; } },
        });
        drive = actionButton({
          ctx, label: 'Drive it off', cooldown: H.driveCooldown, desc: 'Rush the predator. It may not leave on the first try.',
          enabled: (c) => !!S(c).pred,
          onBuy: (c) => {
            const s = S(c);
            if (Math.random() < H.driveChance + (c.state.jobs?.assigned?.soldier ?? 0) * 0.02) { s.pred = null; s.driven++; c.log('Your workers drive the predator away from the herd.', 'info'); }
            else c.log('The predator shrugs them off. Try again.', 'info');
          },
        });
        cv = el('canvas.nestview', { width: 320, height: 40, 'aria-label': 'Your pasture' }) as HTMLCanvasElement;
        ledger = el('div.ledger');
        list = el('div.tiles');
        for (const id of IDS) {
          const d = SP[id];
          const btn = tileButton({
            ctx, label: `Bring in ${d.name.toLowerCase()}`, costs: () => d.capture,
            effect: () => unlocked(ctx, id) ? `${d.desc} Two at a time.` : `${d.desc} Opens at ${d.unlock} honeydew milked.`,
            count: () => `${Math.floor(S(ctx).herds[id] ?? 0)}${d.max ? '/' + d.max : ''}`,
            enabled: (c) => unlocked(c, id) && used(c, d.room) + 2 <= room(c, d.room) && (S(c).herds[id] ?? 0) + 2 <= (d.max ?? Infinity),
            onBuy: (c) => { const s = S(c); const first = !(s.herds[id] ?? 0); s.herds[id] = (s.herds[id] ?? 0) + 2; if (first) c.log(`Two ${d.name.toLowerCase()} join the herds.`, 'info'); },
          });
          caps.push({ id, btn });
          btn.root.dataset.sp = id;
          list.append(btn.root);
        }
        ups = upgradeList(ctx, () => S(ctx).ups, UPS);
        root.append(
          el('p.flavor', {}, 'Ants were farmers long before anyone else. Stroke an aphid with your antennae and it gives you a drop of sugar.'),
          el('p.muted', {}, 'Herds breed by themselves up to the room you have. Pasture grows with the grass and soil tiles you own on the Map; cellar room grows with your chambers. Herders keep animals productive and drive off predators.'),
          cv, el('div.row', {}, milk.root, drive.root), ledger,
          el('h3', {}, 'Species'), list,
          el('h3', {}, 'Breeding'), ups.root,
        );
      },
      update(_root, ctx) {
        const s = S(ctx);
        milk.update(ctx); drive.update(ctx); ups.update(ctx);
        drive.root.hidden = !s.pred;
        for (const c of caps) {
          c.btn.update(ctx);
          c.btn.root.hidden = !unlocked(ctx, c.id) && s.milked < SP[c.id].unlock * 0.5;
        }
        const r = rates(ctx);
        ledger.replaceChildren(...([
          ['Pasture', `${Math.floor(used(ctx, 'pasture'))} / ${room(ctx, 'pasture')} (${grassTiles(ctx)} grass and soil tiles owned)`],
          ['Cellar', `${Math.floor(used(ctx, 'cellar'))} / ${room(ctx, 'cellar')}`],
          ['Tended', `${Math.round(tendedShare(ctx) * 100)}% (${herders(ctx)} herders, ${H.herderTends + lvl(ctx, 'docile')} animals each)`],
          ['Yield', Object.entries(r).map(([k, v]) => `${fmt(v)} ${k}/s`).join(', ') || 'nothing yet'],
          ['Honeydew milked, all time', fmt(s.milked)],
          ['Predators', s.pred ? `${H.predators[s.pred.kind].name} is in the pasture` : `none now (${s.driven} driven off, ${s.lost} animals lost)`],
          ['Hungry times', `workers drink honeydew when food is under ${Math.round(H.drinkBelow * 100)}%`],
        ] as [string, string][]).map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        // pasture: green stems with tiny herd dots
        const g = setup(cv);
        frame++;
        rect(g, 0, 0, cv.width, cv.height, PAL.bg);
        rect(g, 0, 32, cv.width, 8, PAL.dirt);
        for (let i = 0; i < 16; i++) rect(g, 10 + i * 19, 8, 2, 24, PAL.grass);
        let k = 0;
        for (const id of IDS) {
          if (SP[id].room !== 'pasture') continue;
          const n = Math.min(40, Math.floor(s.herds[id] ?? 0));
          const col = id === 'aphid' ? PAL.food : id === 'scale' ? PAL.amber : id === 'mealy' ? PAL.bone : PAL.seed;
          for (let j = 0; j < n; j++, k++) rect(g, 12 + (k % 16) * 19 - ((frame >> 4) + j) % 2, 10 + Math.floor(k / 16) * 6, 2, 2, col);
        }
        if (s.pred) rect(g, 150 + Math.floor(frame / 4) % 40, 12, 6, 5, PAL.you);
      },
    };
  })(),
};
