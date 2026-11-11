// The Queen: laying eggs, hatching larvae, raising workers. The very first system.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, progressBar, type ActionButton } from '../../core/ui';
import { icon } from '../../core/sprites';
import { fmt } from '../../core/resources';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { BROOD, COLONY, NEST } from '../../data/balance';

interface BroodState {
  eggProgress: number;
  larvaProgress: number;
  nurseProgress: number;
  queenProgress: number;
  firstLarva: boolean;
  firstAnt: boolean;
  starvingWarned: boolean;
  born: number;
  /** Larvae that finished growing and wait, as pupae, for living space. They no longer eat. */
  pupae?: number;
  /** Progress toward the next egg lost to heavy mould. */
  rot?: number;
  sick?: number;
  mouldWarned?: boolean;
  royal: Record<string, number>;
}

const S = (ctx: Context) => ctx.state.brood as BroodState;
const R = (ctx: Context, id: keyof typeof BROOD.royal) => S(ctx).royal[id] ?? 0;
const broodCap = (ctx: Context) => ctx.res.cap('egg');
const broodUsed = (ctx: Context) => ctx.res.amt('egg') + ctx.res.amt('larva');
const RB = BROOD.royal;
/** Larvae the nest has living space for: workers plus larvae (and pupae) may not outgrow it. */
const larvaRoom = (ctx: Context) => ctx.res.cap('ant') - Math.floor(ctx.res.amt('ant')) - Math.floor(ctx.res.amt('larva'));
// mods: 'brood' (lineage perks) speeds both; 'larvaGrowth' (fungus feeding) speeds larvae
const hatchTime = (ctx: Context) => BROOD.eggHatchTime / (1 + RB.quicken.per * R(ctx, 'quicken') + ctx.mods.get('brood'));
const growTime = (ctx: Context) => BROOD.larvaGrowTime / (1 + RB.quicken.per * R(ctx, 'quicken') + ctx.mods.get('brood') + ctx.mods.get('larvaGrowth'));
const larvaFood = (_ctx: Context) => BROOD.larvaFoodPerSecond;
/** Eggs and larvae the queen and nurses can keep clean. Brood beyond it may rot (from Brood care on). */
const MO = BROOD.mould;
/** Mould scrubbed away per second by the queen, nurses and Air shafts. */
export const mouldClean = (ctx: Context) => MO.queenClean + (ctx.state.jobs?.assigned?.nurse ?? 0) * MO.nurseClean + ctx.mods.get('mouldClean');
/** Mould added per second by the nest's chambers. */
/** Chambers in the nest: every one of them gathers a little mould. */
export const roomCount = (ctx: Context) => Object.values((ctx.state.nest?.built ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
export const mouldMade = (ctx: Context) => (ctx.flags.has('tech:brood') ? roomCount(ctx) * MO.perRoom : 0);
/** Share of full speed the brood grows at, given the mould. */
export const mouldSpeed = (ctx: Context) => 1 / (1 + ctx.res.amt('mould') / MO.half);
/** Share of full work speed: from `weak` up, sick workers slow every job. */
export const mouldWork = (ctx: Context) => { const m = ctx.res.amt('mould'); return m < MO.weak ? 1 : 1 - MO.weakMax * Math.min(1, (m - MO.weak) / (MO.cap - MO.weak)); };
const clutch = (ctx: Context) => 1 + RB.clutch.per * R(ctx, 'clutch');
export const nurseEggsEach = (ctx: Context) => BROOD.nurseEggsPerSecond * (1 + 0.02 * R(ctx, 'longevity'));
const nurseRate = (ctx: Context) => (ctx.state.jobs?.assigned?.nurse ?? 0) * nurseEggsEach(ctx);
/** Share of full speed the brood grows at: the queen and nurses each look after a few, the rest grow slowly. */
export const tendSpeed = (ctx: Context) => {
  const brood = ctx.res.amt('egg') + ctx.res.amt('larva');
  if (brood <= 0) return mouldSpeed(ctx);
  const tended = Math.min(brood, BROOD.queenTends + (ctx.state.jobs?.assigned?.nurse ?? 0) * BROOD.nurseTends);
  return (tended + (brood - tended) * BROOD.untendedSpeed) / brood * mouldSpeed(ctx);
};
const queenRate = (ctx: Context) => RB.longevity.per * R(ctx, 'longevity') + ctx.mods.get('queenLay');

/**
 * How much food the brood will still eat, for the food warning. Larvae eat for a while and then stop,
 * so their drain shouldn't be read as permanent. `committed` is what the eggs and growing larvae
 * already here will eat before they pupate; `ongoing` is the drain per second from eggs still being laid.
 */
export function broodFoodOutlook(ctx: Context) {
  const s = ctx.state.brood as BroodState | undefined;
  if (!s) return { committed: 0, ongoing: 0 };
  const perLarva = larvaFood(ctx) * growTime(ctx) / Math.max(0.05, tendSpeed(ctx));
  const growing = Math.max(0, Math.floor(ctx.res.amt('larva')) - (s.pupae ?? 0));
  const left = Math.max(0, growing - (growing >= 1 ? s.larvaProgress : 0)) + Math.min(Math.floor(ctx.res.amt('egg')), Math.max(0, larvaRoom(ctx)));
  const laying = broodUsed(ctx) < broodCap(ctx) ? nurseRate(ctx) + queenRate(ctx) : 0;
  return { committed: left * perLarva, ongoing: laying * perLarva };
}

const ROYAL = fromBalance(RB, (ctx, needs) => ctx.flags.has('tech:royal') && (!needs || ctx.flags.has(needs)));
/** The queen's health when she has to fight raiders herself (Chitin plates), read by war. */
export const queenGuard = (ctx: Context) => RB.plates.per * R(ctx, 'plates');

function addEggs(ctx: Context, n: number) {
  // Twin eggs: each egg may come as two
  const twin = RB.twins.per * R(ctx, 'twins');
  if (twin > 0) { let extra = 0; for (let i = 0; i < n; i++) if (Math.random() < twin) extra++; n += extra; }
  const room = broodCap(ctx) - broodUsed(ctx);
  ctx.res.add('egg', Math.max(0, Math.min(n, room)));
}

/** Seconds the 'no living space' banner stays up each time the nest fills. */
const NOROOM_SHOW = 20;
let noroomFor = 0;

export const brood: GameSystem = {
  id: 'brood',

  init(ctx) {
    ctx.res.define({ id: 'ant', name: 'Workers', cap: COLONY.baseAntCap, order: 0, integer: true, stepped: true });
    ctx.res.define({ id: 'food', name: 'Food', cap: NEST.baseFoodCap, order: 1 });
    ctx.res.define({ id: 'egg', name: 'Eggs', cap: BROOD.baseBroodCap, order: 10, integer: true, stepped: true, group: 'Brood' });
    ctx.res.define({ id: 'larva', name: 'Larvae', cap: BROOD.baseBroodCap, order: 11, integer: true, stepped: true, group: 'Brood' });
    ctx.res.define({ id: 'mould', name: 'Mould', cap: BROOD.mould.cap, order: 12, group: 'Brood' });
    // used by royal upgrades; other systems fill them
    ctx.res.define({ id: 'seed', name: 'Seeds', cap: NEST.baseMaterialCap.seed, order: 21, integer: true, group: 'Surface' });
    ctx.res.define({ id: 'resin', name: 'Resin', cap: NEST.baseMaterialCap.resin, order: 22, integer: true, group: 'Surface' });
    ctx.res.define({ id: 'soil', name: 'Soil', cap: NEST.baseSoilCap, order: 2 });
    ctx.state.brood = {
      eggProgress: 0, larvaProgress: 0, nurseProgress: 0, queenProgress: 0,
      firstLarva: false, firstAnt: false, starvingWarned: false, born: 0, royal: {},
    } satisfies BroodState;

    ctx.bus.on('newgame', () => {
      ctx.res.set('food', BROOD.startFood);
      ctx.log('Darkness. Damp soil on every side. The queen stirs, alone.');
    });
  },

  tick(ctx, dt) {
    const s = S(ctx);
    // older saves: Rich feeding folded into Warm brood, Devoted nurses into Royal rhythm
    if (s.royal.jelly || s.royal.devotion) {
      s.royal.quicken = Math.max(s.royal.quicken ?? 0, s.royal.jelly ?? 0);
      delete s.royal.jelly; delete s.royal.devotion;
    }
    // Wound care: nurses patch up the injured (read by expeditions and the champion)
    ctx.mods.set('nurseHeal', 'brood', Math.min(BROOD.healCap, (ctx.state.jobs?.assigned?.nurse ?? 0) * RB.wounds.per * R(ctx, 'wounds')));
    const { res } = ctx;
    res.setCapBonus('larva', 'brood', res.cap('egg') - BROOD.baseBroodCap);

    // nurses (published by the jobs system) and the queen's own rhythm lay eggs
    if (broodUsed(ctx) < broodCap(ctx)) {
      s.nurseProgress += (nurseRate(ctx) + queenRate(ctx)) * dt;
      if (s.nurseProgress >= 1) { const n = Math.floor(s.nurseProgress); addEggs(ctx, n); s.nurseProgress -= n; }
    }

    // eggs hatch into larvae, but only when every larva will have living space to grow into
    const eggs = res.amt('egg');
    if (eggs >= 1) {
      s.eggProgress += (dt / hatchTime(ctx)) * eggs * tendSpeed(ctx);
      if (larvaRoom(ctx) < 1) s.eggProgress = Math.min(s.eggProgress, 1); // a ready egg waits
      while (s.eggProgress >= 1 && res.amt('egg') >= 1 && larvaRoom(ctx) >= 1) {
        res.add('egg', -1); res.add('larva', 1); s.eggProgress -= 1;
        if (!s.firstLarva) { s.firstLarva = true; ctx.flags.add('hungry'); ctx.log('An egg splits. A pale larva wriggles, and it is hungry.'); }
      }
    } else s.eggProgress = 0;

    // Larvae eat and grow whether or not there is room. A grown larva becomes a pupa, stops eating,
    // and opens into a worker as soon as there is living space. This keeps food use steady: a death
    // doesn't wake every waiting larva at once, and a pupa fills the gap straight away.
    s.pupae = Math.min(s.pupae ?? 0, Math.floor(res.amt('larva')));
    const growing = Math.floor(res.amt('larva')) - s.pupae;
    if (growing >= 1) {
      const need = growing * larvaFood(ctx) * dt;
      if (res.amt('food') >= need) {
        res.source = 'Larvae eating';
        res.add('food', -need);
        res.source = 'Brood';
        s.larvaProgress += (dt / growTime(ctx)) * growing * tendSpeed(ctx);
        while (s.larvaProgress >= 1 && s.pupae < Math.floor(res.amt('larva'))) { s.pupae++; s.larvaProgress -= 1; }
        s.starvingWarned = false;
      } else {
        // Hardy brood: starving larvae still grow a little, living off their fat
        const hardy = RB.hardy.per * R(ctx, 'hardy');
        if (hardy > 0) {
          s.larvaProgress += (dt / growTime(ctx)) * growing * tendSpeed(ctx) * hardy;
          while (s.larvaProgress >= 1 && s.pupae < Math.floor(res.amt('larva'))) { s.pupae++; s.larvaProgress -= 1; }
        }
        if (!s.starvingWarned) {
          ctx.log(hardy > 0 ? `The larvae are starving. They grow at ${Math.round(hardy * 100)}% speed on their own fat.` : 'The larvae are starving. They will not grow without food.', 'warn');
          s.starvingWarned = true;
        }
      }
    } else s.larvaProgress = 0;
    while (s.pupae >= 1 && res.amt('ant') < res.cap('ant')) {
      res.add('larva', -1); res.add('ant', 1); s.pupae--; s.born += 1;
      ctx.bus.emit('ant:born');
      if (!s.firstAnt) { s.firstAnt = true; ctx.log('The first worker pulls free of its cocoon. The colony has begun.'); }
      if (s.born === 50) ctx.log('Fifty workers have been born under this queen.');
      if (s.born === 250) ctx.log('Two hundred and fifty. The queen\'s line is becoming a people.');
    }
    // Mould: chambers gather it, the queen and nurses scrub it. It slows all brood; heavy mould rots eggs.
    if (ctx.flags.has('tech:brood')) {
      const net = mouldMade(ctx) - mouldClean(ctx);
      res.source = 'Damp chambers'; if (net > 0) res.add('mould', net * dt);
      res.source = 'Nurses scrubbing'; if (net < 0) res.add('mould', net * dt);
      res.source = 'Brood';
      const m = res.amt('mould');
      if (m >= MO.rot && res.amt('egg') >= 1) {
        s.rot = (s.rot ?? 0) + dt / MO.rotEvery;
        if (s.rot >= 1) { s.rot -= 1; res.add('egg', -1); ctx.log('An egg rots under the mould.', 'warn'); }
      } else s.rot = 0;
      if (m >= MO.spoil && res.amt('food') > 0) {
        res.source = 'Spoiled by mould';
        res.add('food', -res.amt('food') * MO.spoilShare * Math.min(1, (m - MO.spoil) / (MO.cap - MO.spoil)) * dt);
        res.source = 'Brood';
      }
      if (m >= MO.sick && res.amt('ant') >= 2) {
        s.sick = (s.sick ?? 0) + dt / MO.sickEvery;
        if (s.sick >= 1) { s.sick -= 1; res.add('ant', -1); ctx.log('A worker sickens in the mould and dies.', 'warn'); }
      } else s.sick = 0;
      if (m >= MO.half && !s.mouldWarned) { s.mouldWarned = true; ctx.log('Mould is building up in the brood chamber. The brood grows slower. More nurses would scrub it away.', 'warn'); }
      if (m < MO.half / 2) s.mouldWarned = false;
      const hurts = [`brood grows at ${Math.round(mouldSpeed(ctx) * 100)}% speed`];
      if (m >= MO.rot) hurts.push('eggs rot', 'food spoils');
      if (m >= MO.weak) hurts.push(`workers work at ${Math.round(mouldWork(ctx) * 100)}%`);
      if (m >= MO.sick) hurts.push('workers are dying');
      ctx.alert('mould', m >= MO.half ? `Mould ${Math.floor(m)}: ${hurts.join(', ')}. Add nurses, or scrub it by hand on the Queen tab.` : null);
    }

    // Shown for a short while when the nest first fills, then left to the Stores count until it fills again.
    const full = s.pupae >= 1 && res.amt('ant') >= res.cap('ant');
    noroomFor = full ? noroomFor + dt : 0;
    ctx.alert('noroom', full && noroomFor < NOROOM_SHOW ? 'No living space. Pupae wait until you dig more tunnels.' : null);
  },

  panel: (() => {
    let lay: ActionButton, forage: ActionButton;
    const eggBar = progressBar(), larvaBar = progressBar();
    let eggTxt: HTMLElement, larvaTxt: HTMLElement, pupaTxt: HTMLElement, forageWrap: HTMLElement, layWrap: HTMLElement, hint: HTMLElement;
    let scrub: ActionButton, scrubWrap: HTMLElement;
    let ledger: HTMLElement, royalHead: HTMLElement;
    let royal: ReturnType<typeof upgradeList>;
    return {
      title: 'Queen',
      group: 'Colony',
      mount(root, ctx) {
        lay = actionButton({
          ctx, label: () => (clutch(ctx) > 1 ? `Lay ${clutch(ctx)} eggs` : 'Lay an egg'),
          cooldown: BROOD.layEggCooldown,
          costs: () => ({ food: BROOD.eggFoodCost * clutch(ctx) }),
          desc: 'The queen lays. Eggs hatch into larvae.',
          enabled: (c) => broodUsed(c) < broodCap(c),
          onBuy: (c) => { addEggs(c, clutch(c)); c.bus.emit('queen:lay'); },
        });
        forage = actionButton({
          ctx, label: 'Forage near the entrance', cooldown: BROOD.forageCooldown,
          desc: 'Scrape together a little food.',
          onBuy: (c) => c.res.lump('food', BROOD.forageClick),
        });
        scrub = actionButton({
          ctx, label: 'Scrub the mould', cooldown: MO.scrubCooldown,
          desc: `Scrape ${MO.scrubClick} mould off the walls by hand. A way back when the nest is overgrown.`,
          enabled: (c) => c.res.amt('mould') >= 1,
          onBuy: (c) => { c.res.source = 'Scrubbed by hand'; c.res.add('mould', -Math.min(MO.scrubClick, c.res.amt('mould'))); c.res.source = 'Brood'; },
        });
        scrubWrap = el('div', {}, scrub.root);
        eggTxt = el('span'); larvaTxt = el('span'); pupaTxt = el('span'); hint = el('p.muted');
        ledger = el('div.ledger');
        royalHead = el('h3', {}, 'Royal care');
        royal = upgradeList(ctx, () => S(ctx).royal, ROYAL);
        forageWrap = el('div', {}, forage.root);
        layWrap = el('div', {}, lay.root);
        root.append(
          el('div.queen', {}, icon('queen', 64), el('p.flavor', {}, 'The queen rests in a small earthen cell. Everything begins with her.')),
          el('div.row', {}, forageWrap, layWrap, scrubWrap),
          el('div.stat', {}, el('span.statlabel', {}, icon('egg', 24), eggTxt), eggBar.root),
          el('div.stat', {}, el('span.statlabel', {}, icon('larva', 24), larvaTxt), larvaBar.root),
          el('div.stat', {}, el('span.statlabel', {}, icon('pupa', 24), pupaTxt)),
          hint,
          ledger,
          royalHead, royal.root,
        );
      },
      update(_root, ctx) {
        const s = S(ctx);
        lay.update(ctx); forage.update(ctx); scrub.update(ctx);
        scrubWrap.hidden = !ctx.flags.has('tech:brood') || !ctx.res.get('mould').seen;
        // Lay opens after a few forages; it stays open after that
        if (!ctx.flags.has('queen:lays') && ctx.res.amt('food') >= BROOD.layOpensAtFood) { ctx.flags.add('queen:lays'); ctx.log('There is food enough now. The queen is ready to lay.'); }
        layWrap.hidden = !ctx.flags.has('queen:lays');
        eggTxt.textContent = ctx.res.amt('egg') >= 1 && larvaRoom(ctx) < 1 ? `Eggs waiting for room: ${Math.floor(ctx.res.amt('egg'))}` : `Eggs hatching: ${Math.floor(ctx.res.amt('egg'))}`;
        const pupae = s.pupae ?? 0, growingNow = Math.max(0, Math.floor(ctx.res.amt('larva')) - pupae);
        larvaTxt.textContent = `Larvae growing: ${growingNow}`;
        eggBar.set(ctx.res.amt('egg') >= 1 ? s.eggProgress % 1 : 0);
        larvaBar.set(growingNow >= 1 ? s.larvaProgress % 1 : 0);
        pupaTxt.textContent = pupae >= 1 ? `Pupae waiting for room: ${pupae}` : 'No pupae yet.';
        hint.textContent = broodUsed(ctx) >= broodCap(ctx)
          ? 'The brood cell is full. Research Brood care, then build a Brood chamber in the Nest.' : '';
        const lines = [
          ['Workers born', String(s.born)],
          ['Egg hatches in', `${fmt(hatchTime(ctx))}s`],
          ['Larva grows in', `${fmt(growTime(ctx))}s, eating ${larvaFood(ctx).toFixed(2)} food/s`],
        ];
        const brood = Math.floor(broodUsed(ctx));
        const care = BROOD.queenTends + (ctx.state.jobs?.assigned?.nurse ?? 0) * BROOD.nurseTends;
        if (brood > BROOD.queenTends || care > BROOD.queenTends) lines.push(['Brood looked after', `${Math.min(brood, care)} of ${brood}` + (brood > care ? ' (the rest grow at half speed)' : '')]);
        const auto = nurseRate(ctx) + queenRate(ctx);
        if (auto) lines.push(['Eggs laid without you', `${auto.toFixed(3)}/s`]);
        ledger.replaceChildren(...lines.map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        ledger.hidden = !s.firstAnt;
        royalHead.hidden = !royal.update(ctx);
      },
    };
  })(),
};
