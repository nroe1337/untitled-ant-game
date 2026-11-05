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
  royal: Record<string, number>;
}

const S = (ctx: Context) => ctx.state.brood as BroodState;
const R = (ctx: Context, id: keyof typeof BROOD.royal) => S(ctx).royal[id] ?? 0;
const broodCap = (ctx: Context) => ctx.res.cap('egg');
const broodUsed = (ctx: Context) => ctx.res.amt('egg') + ctx.res.amt('larva');
const RB = BROOD.royal;
// mods: 'brood' (lineage perks) speeds both; 'larvaGrowth' (fungus feeding) speeds larvae
const hatchTime = (ctx: Context) => BROOD.eggHatchTime / (1 + RB.quicken.per * R(ctx, 'quicken') + RB.plates.per * R(ctx, 'plates') + ctx.mods.get('brood'));
const growTime = (ctx: Context) => BROOD.larvaGrowTime / (1 + RB.jelly.per * R(ctx, 'jelly') + ctx.mods.get('brood') + ctx.mods.get('larvaGrowth'));
const larvaFood = (_ctx: Context) => BROOD.larvaFoodPerSecond;
const clutch = (ctx: Context) => 1 + RB.clutch.per * R(ctx, 'clutch');
const nurseRate = (ctx: Context) => (ctx.state.jobs?.assigned?.nurse ?? 0) * BROOD.nurseEggsPerSecond * (1 + RB.devotion.per * R(ctx, 'devotion'));
const queenRate = (ctx: Context) => RB.longevity.per * R(ctx, 'longevity') + ctx.mods.get('queenLay');

const ROYAL = fromBalance(RB, (ctx, needs) => ctx.flags.has('tech:royal') && (!needs || ctx.flags.has(needs)));

function addEggs(ctx: Context, n: number) {
  const room = broodCap(ctx) - broodUsed(ctx);
  ctx.res.add('egg', Math.max(0, Math.min(n, room)));
}

export const brood: GameSystem = {
  id: 'brood',

  init(ctx) {
    ctx.res.define({ id: 'ant', name: 'Workers', cap: COLONY.baseAntCap, order: 0, integer: true });
    ctx.res.define({ id: 'food', name: 'Food', cap: NEST.baseFoodCap, order: 1 });
    ctx.res.define({ id: 'egg', name: 'Eggs', cap: BROOD.baseBroodCap, order: 10, integer: true, group: 'Brood' });
    ctx.res.define({ id: 'larva', name: 'Larvae', cap: BROOD.baseBroodCap, order: 11, integer: true, group: 'Brood' });
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
    const { res } = ctx;
    res.setCapBonus('larva', 'brood', res.cap('egg') - BROOD.baseBroodCap);

    // nurses (published by the jobs system) and the queen's own rhythm lay eggs
    if (broodUsed(ctx) < broodCap(ctx)) {
      s.nurseProgress += (nurseRate(ctx) + queenRate(ctx)) * dt;
      if (s.nurseProgress >= 1) { const n = Math.floor(s.nurseProgress); addEggs(ctx, n); s.nurseProgress -= n; }
    }

    // eggs hatch into larvae
    const eggs = res.amt('egg');
    if (eggs >= 1) {
      s.eggProgress += (dt / hatchTime(ctx)) * eggs;
      while (s.eggProgress >= 1 && res.amt('egg') >= 1) {
        res.add('egg', -1); res.add('larva', 1); s.eggProgress -= 1;
        if (!s.firstLarva) { s.firstLarva = true; ctx.flags.add('hungry'); ctx.log('An egg splits. A pale larva wriggles, and it is hungry.'); }
      }
    } else s.eggProgress = 0;

    // larvae eat and grow into workers, if there is food and room
    const larvae = res.amt('larva');
    ctx.alert('noroom', larvae >= 1 && res.amt('ant') >= res.cap('ant')
      ? 'No living space. Larvae wait until you dig more tunnels.' : null);
    if (larvae >= 1) {
      const room = res.amt('ant') < res.cap('ant');
      const need = larvae * larvaFood(ctx) * dt;
      if (room && res.amt('food') >= need) {
        res.add('food', -need);
        s.larvaProgress += (dt / growTime(ctx)) * larvae;
        while (s.larvaProgress >= 1 && res.amt('larva') >= 1) {
          res.add('larva', -1); res.add('ant', 1); s.larvaProgress -= 1; s.born += 1;
          ctx.bus.emit('ant:born');
          if (!s.firstAnt) { s.firstAnt = true; ctx.log('The first worker pulls free of its cocoon. The colony has begun.'); }
          if (s.born === 50) ctx.log('Fifty workers have been born under this queen.');
          if (s.born === 250) ctx.log('Two hundred and fifty. The queen\'s line is becoming a people.');
        }
        s.starvingWarned = false;
      } else if (!room) {
        // shown as a standing banner instead of a log line, so it doesn't repeat every time a worker dies and is replaced
      } else if (!s.starvingWarned) {
        ctx.log('The larvae are starving. They will not grow without food.', 'warn'); s.starvingWarned = true;
      }
    }
  },

  panel: (() => {
    let lay: ActionButton, forage: ActionButton;
    const eggBar = progressBar(), larvaBar = progressBar();
    let eggTxt: HTMLElement, larvaTxt: HTMLElement, pupaTxt: HTMLElement, forageWrap: HTMLElement, hint: HTMLElement;
    let ledger: HTMLElement, royalHead: HTMLElement;
    let royal: ReturnType<typeof upgradeList>;
    return {
      title: 'The Queen',
      group: 'Home',
      mount(root, ctx) {
        lay = actionButton({
          ctx, label: () => (clutch(ctx) > 1 ? `Lay ${clutch(ctx)} eggs` : 'Lay an egg'),
          cooldown: BROOD.layEggCooldown,
          desc: 'The queen lays. Eggs hatch into larvae.',
          enabled: (c) => broodUsed(c) < broodCap(c),
          onBuy: (c) => addEggs(c, clutch(c)),
        });
        forage = actionButton({
          ctx, label: 'Forage near the entrance', cooldown: BROOD.forageCooldown,
          desc: 'Scrape together a little food.',
          onBuy: (c) => c.res.lump('food', BROOD.forageClick),
        });
        eggTxt = el('span'); larvaTxt = el('span'); pupaTxt = el('span'); hint = el('p.muted');
        ledger = el('div.ledger');
        royalHead = el('h3', {}, 'Royal care');
        royal = upgradeList(ctx, () => S(ctx).royal, ROYAL);
        forageWrap = el('div', {}, forage.root);
        root.append(
          el('div.queen', {}, icon('queen', 64), el('p.flavor', {}, 'The queen rests in a small earthen cell. Everything begins with her.')),
          el('div.row', {}, lay.root, forageWrap),
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
        lay.update(ctx); forage.update(ctx);
        forageWrap.hidden = !ctx.flags.has('hungry');
        eggTxt.textContent = `Eggs hatching: ${Math.floor(ctx.res.amt('egg'))}`;
        larvaTxt.textContent = `Larvae growing: ${Math.floor(ctx.res.amt('larva'))}`;
        eggBar.set(ctx.res.amt('egg') >= 1 ? s.eggProgress % 1 : 0);
        larvaBar.set(ctx.res.amt('larva') >= 1 ? s.larvaProgress % 1 : 0);
        pupaTxt.textContent = s.larvaProgress % 1 > 0.6 && ctx.res.amt('larva') >= 1 ? 'A pupa is about to open.' : 'No pupae yet.';
        hint.textContent = broodUsed(ctx) >= broodCap(ctx)
          ? 'The brood cell is full. Research Brood care, then build a Brood chamber in the Nest.' : '';
        const lines = [
          ['Workers born', String(s.born)],
          ['Egg hatches in', `${fmt(hatchTime(ctx))}s`],
          ['Larva grows in', `${fmt(growTime(ctx))}s, eating ${larvaFood(ctx).toFixed(2)} food/s`],
        ];
        const auto = nurseRate(ctx) + queenRate(ctx);
        if (auto) lines.push(['Eggs laid without you', `${auto.toFixed(3)}/s`]);
        ledger.replaceChildren(...lines.map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        ledger.hidden = !s.firstAnt;
        royalHead.hidden = !royal.update(ctx);
      },
    };
  })(),
};
