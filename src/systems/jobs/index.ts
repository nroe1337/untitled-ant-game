// Jobs: assign idle workers to tasks, Evolve-style. Also colony food upkeep and techniques.
import type { GameSystem, Context } from '../../core/types';
import { el } from '../../core/ui';
import { icon } from '../../core/sprites';
import { fmt } from '../../core/resources';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { COLONY, JOBS, NEST } from '../../data/balance';

interface JobDef {
  id: string;
  name: string;
  desc: string;
  /** Resource output per ant per second. */
  produces: Record<string, number>;
  /** Flag that must be set before the job appears. */
  requires?: string;
}

// Add a job here and it shows up automatically when its flag is set.
// Output is boosted by the shared modifier "job:<id>" (e.g. job:forager = +0.4 means +40%).
const JOB_DEFS: JobDef[] = [
  { id: 'forager', name: 'Forager', desc: 'Gathers food from the soil and roots.', produces: JOBS.forager },
  { id: 'elder', name: 'Elder', desc: 'Remembers and thinks. Makes knowledge for research.', produces: JOBS.elder, requires: 'research' },
  { id: 'digger', name: 'Digger', desc: 'Moves soil to make room for chambers.', produces: JOBS.digger, requires: 'tech:digging' },
  { id: 'nurse', name: 'Nurse', desc: 'Tends the queen. Lays eggs without your help.', produces: {}, requires: 'chamber:brood' },
  { id: 'scout', name: 'Scout', desc: 'Marks trails on the surface. Makes pheromone.', produces: JOBS.scout, requires: 'tech:scouting' },
  { id: 'soldier', name: 'Soldier', desc: 'Guards the nest and marches on campaigns.', produces: {}, requires: 'tech:martial' },
  { id: 'leafcutter', name: 'Leafcutter', desc: 'Cuts leaves for the fungus beds.', produces: JOBS.leafcutter, requires: 'tech:fungus' },
  { id: 'gardener', name: 'Gardener', desc: 'A minim. Keeps fungus beds free of mould (2 beds each).', produces: {}, requires: 'caste:minim' },
  { id: 'replete', name: 'Replete', desc: 'A living food jar. Each holds +12 food.', produces: {}, requires: 'caste:replete' },
  { id: 'major', name: 'Major', desc: 'A huge-headed fighter. Fights like 3 soldiers at the gate.', produces: {}, requires: 'caste:major' },
  { id: 'builder', name: 'Builder', desc: 'Carries soil, twigs and stores up to the Wedding Mound.', produces: {}, requires: 'tech:flight' },
  { id: 'weaver', name: 'Weaver', desc: 'Spins silk from larvae. Silk builds better boats.', produces: JOBS.weaver, requires: 'caste:weaver' },
];

const T = COLONY.techniques;
const TECHS = fromBalance(T, (ctx, needs) => ctx.flags.has('tech:teaching') && (!needs || ctx.flags.has(needs)));
/** Which shared modifier each technique feeds, and by how much per level. */
const TECH_MODS: Record<string, [string, number]> = {
  trails: ['job:forager', T.trails.per], grit: ['job:digger', T.grit.per], stomach: ['upkeep', T.stomach.per],
  marching: ['job:scout', T.marching.per], drill: ['soldierPower', T.drill.per],
  lore: ['job:elder', T.lore.per], craft: ['chamberCost', T.craft.per], carrying: ['expLoot', T.carrying.per],
};

interface JobsState { assigned: Record<string, number>; tech: Record<string, number>; hunger?: number; starved?: number; warned?: boolean; lowest?: number }
const S = (ctx: Context) => ctx.state.jobs as JobsState;

const totalAnts = (ctx: Context) => Math.floor(ctx.res.amt('ant'));
const assignedSum = (ctx: Context) => Object.values(S(ctx).assigned).reduce((a, b) => a + b, 0);
const busySum = (ctx: Context) => Object.values(ctx.busy).reduce((a, b) => a + b, 0);
export const idleAnts = (ctx: Context) => totalAnts(ctx) - assignedSum(ctx) - busySum(ctx);
const upkeepMult = (ctx: Context) => Math.max(0.2, 1 + ctx.mods.get('upkeep'));
const jobMult = (ctx: Context, id: string) => 1 + ctx.mods.get('job:' + id);

export const jobs: GameSystem = {
  id: 'jobs',

  init(ctx) {
    ctx.res.define({ id: 'food', name: 'Food', cap: NEST.baseFoodCap, order: 1 });
    ctx.res.define({ id: 'soil', name: 'Soil', cap: NEST.baseSoilCap, order: 2 });
    ctx.res.define({ id: 'pheromone', name: 'Pheromone', cap: 40, order: 3 });
    ctx.state.jobs = { assigned: Object.fromEntries(JOB_DEFS.map((j) => [j.id, 0])), tech: {} } satisfies JobsState;
  },

  isUnlocked: (ctx) => ctx.res.get('ant').seen,

  tick(ctx, dt) {
    const s = S(ctx);
    for (const j of JOB_DEFS) s.assigned[j.id] ??= 0;
    for (const [id, [key, per]] of Object.entries(TECH_MODS)) ctx.mods.set(key, 'tech:' + id, per * (s.tech[id] ?? 0));

    // if ants died or left, pull them off jobs (last job first)
    let over = -idleAnts(ctx);
    for (const j of [...JOB_DEFS].reverse()) {
      if (over <= 0) break;
      const take = Math.min(over, s.assigned[j.id] ?? 0);
      s.assigned[j.id] -= take; over -= take;
    }

    // upkeep. Whatever can't be paid builds up as hunger, and hunger slowly kills workers.
    // The queen never starves, so the colony can always rebuild from her.
    const need = totalAnts(ctx) * COLONY.antFoodPerSecond * upkeepMult(ctx) * dt;
    const have = ctx.res.amt('food');
    ctx.res.add('food', -need);
    const unpaid = Math.max(0, need - have);
    s.hunger = unpaid ? (s.hunger ?? 0) + unpaid : 0; // fed again: hunger is forgiven
    if (!unpaid) s.lowest = undefined; // a new famine reports from the start
    while (s.hunger >= COLONY.starveFoodPerDeath && totalAnts(ctx) > 0) {
      s.hunger -= COLONY.starveFoodPerDeath;
      ctx.res.add('ant', -1);
      s.starved = (s.starved ?? 0) + 1;
      const left = totalAnts(ctx);
      if (left === 0) ctx.log('The last worker dies of hunger. Only the queen remains, alone in the dark again.', 'warn');
      else if (s.starved === 1 || (s.lowest ?? Infinity) > left && left % 5 === 0) ctx.log(`A worker starves. ${left} remain.`, 'warn');
      s.lowest = Math.min(s.lowest ?? Infinity, left);
    }
    const starving = unpaid > 0 && totalAnts(ctx) > 0;
    const foodRate = ctx.res.get('food').rate;
    if (!s.warned && foodRate < 0 && have / -foodRate < COLONY.starveWarnSeconds && have > 0) {
      s.warned = true;
      ctx.log(`Food is running low. At this rate it is gone in about ${Math.ceil(have / -foodRate)}s, and then workers will starve.`, 'warn');
    }
    if (foodRate >= 0 && have > 0) s.warned = false;
    ctx.alert('starving', starving
      ? 'Your workers are starving. They will die one by one until food comes in. Put more workers on foraging.'
      : foodRate < 0 && have > 0 && have / -foodRate < COLONY.starveWarnSeconds
        ? `Food runs out in about ${Math.ceil(have / -foodRate)}s. Then workers start to starve.` : null);
    const mult = starving ? COLONY.starvingPenalty : 1;

    for (const j of JOB_DEFS) {
      const n = s.assigned[j.id] ?? 0;
      if (!n) continue;
      for (const [rid, per] of Object.entries(j.produces)) ctx.res.add(rid, per * n * mult * jobMult(ctx, j.id) * dt);
    }
  },

  panel: (() => {
    const rows = new Map<string, { row: HTMLElement; count: HTMLElement; out: HTMLElement }>();
    let idleEl: HTMLElement, list: HTMLElement, upkeepEl: HTMLElement, techHead: HTMLElement, census: HTMLElement;
    let techs: ReturnType<typeof upgradeList>;
    const change = (ctx: Context, id: string, d: number) => {
      const s = S(ctx);
      if (d > 0) d = Math.min(d, idleAnts(ctx));
      else d = -Math.min(-d, s.assigned[id]);
      s.assigned[id] += d;
    };
    return {
      title: 'Colony',
      mount(root, ctx) {
        idleEl = el('strong');
        upkeepEl = el('p.muted');
        census = el('div.ledger');
        list = el('div.jobs');
        techHead = el('h3', {}, 'Techniques');
        techs = upgradeList(ctx, () => S(ctx).tech, TECHS);
        root.append(
          el('p.flavor', {}, 'Every worker waits for a purpose. Idle ants still eat.'),
          el('p', {}, 'Idle workers: ', idleEl),
          list, upkeepEl, census, techHead, techs.root,
        );
        for (const j of JOB_DEFS) {
          const count = el('span.count'), out = el('span.muted');
          const btn = (label: string, d: number) => el('button.small', { type: 'button', title: 'Shift-click: 10, Ctrl-click: all', onclick: (e: MouseEvent) => change(ctx, j.id, e.ctrlKey || e.metaKey ? d * 9999 : e.shiftKey ? d * 10 : d) }, label);
          const row = el('div.job', { title: j.desc, hidden: true },
            el('span.jname', {}, icon(j.id), j.name), btn('−', -1), count, btn('+', 1), out);
          list.append(row);
          rows.set(j.id, { row, count, out });
        }
      },
      update(_root, ctx) {
        const s = S(ctx);
        idleEl.textContent = String(idleAnts(ctx));
        for (const j of JOB_DEFS) {
          const r = rows.get(j.id)!;
          r.row.hidden = !!j.requires && !ctx.flags.has(j.requires);
          r.count.textContent = String(s.assigned[j.id]);
          // Every worker on a job makes exactly the same amount, so the total is just "each x count".
          const each = Object.entries(j.produces).map(([rid, per]) => [ctx.res.get(rid).name.toLowerCase(), per * jobMult(ctx, j.id)] as const);
          const n = s.assigned[j.id];
          const parts = each.map(([name, per]) => n ? `+${fmt(per * n)} ${name}/s (${fmt(per)} each)` : `${fmt(per)} ${name}/s each`);
          r.row.title = j.desc + (each.length ? '\nEach ' + j.name.toLowerCase() + ' makes ' + each.map(([name, per]) => `+${fmt(per)} ${name}/s`).join(', ') + ', bonuses included. Every worker adds the same amount.' : '');
          if (j.id === 'nurse' && s.assigned.nurse) parts.push('laying eggs');
          if (j.id === 'soldier' && s.assigned.soldier) parts.push(`power ${fmt(s.assigned.soldier * (1 + ctx.mods.get('soldierPower')))}`);
          r.out.textContent = parts.join(', ');
        }
        const busy = busySum(ctx);
        const hungry = (s.hunger ?? 0) > 0 ? 'Workers are starving and will die one by one until food comes in.' : '';
        upkeepEl.textContent = hungry + ` The colony eats ${fmt(totalAnts(ctx) * COLONY.antFoodPerSecond * upkeepMult(ctx))} food/s.` +
          ' Shift-click moves 10, Ctrl-click moves all.';
        const away = Object.entries(ctx.busy).filter(([, n]) => n > 0).map(([k, n]) => [k === 'expeditions' ? 'On expeditions' : k === 'outposts' ? 'Holding outposts' : k === 'campaign' ? 'On campaign' : k, String(n)]);
        census.replaceChildren(...[['Total workers', String(totalAnts(ctx))], ...away].map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        census.hidden = !busy;
        techHead.hidden = !techs.update(ctx);
      },
    };
  })(),
};
