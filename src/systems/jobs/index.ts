// Jobs: assign idle workers to tasks, Evolve-style. Also colony food upkeep and techniques.
import type { GameSystem, Context } from '../../core/types';
import { el } from '../../core/ui';
import { icon } from '../../core/sprites';
import { fmt } from '../../core/resources';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { BROOD, CASTES, COLONY, JOBS, NEST, WAR } from '../../data/balance';
import { drawReserve } from '../castes';
import { roomCount, nurseClean, mouldClean, mouldMade, mouldSpeed, mouldWork, broodFoodOutlook, nurseEggsEach, nurseTends } from '../brood';

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
  { id: 'nurse', name: 'Nurse', desc: 'Lays eggs, looks after the brood and scrubs away mould.', produces: {}, requires: 'chamber:brood' },
  { id: 'scout', name: 'Scout', desc: 'Marks trails on the surface. Makes pheromone.', produces: JOBS.scout, requires: 'tech:scouting' },
  { id: 'soldier', name: 'Soldier', desc: 'Guards the nest and marches on campaigns. Between fights, hunts near the nest for half as much food as a forager.', produces: {}, requires: 'tech:martial' },
  { id: 'leafcutter', name: 'Leafcutter', desc: 'Cuts leaves for the fungus beds.', produces: JOBS.leafcutter, requires: 'tech:fungus' },
  { id: 'gardener', name: 'Gardener', desc: 'A minim. Keeps fungus beds free of mould (2 beds each).', produces: {}, requires: 'caste:minim' },
  { id: 'replete', name: 'Replete', desc: 'Banks up to 20 surplus food and feeds it back when stores run dry. With the reserve full, makes a little royal jelly from spare food. At most 8.', produces: {}, requires: 'caste:replete' },
  { id: 'major', name: 'Major', desc: 'A huge-headed fighter. Fights like 3 soldiers. Between fights, hunts like a soldier. One major per 5 soldiers.', produces: {}, requires: 'caste:major' },
  { id: 'herder', name: 'Herder', desc: 'Tends the herds and drives off predators.', produces: {}, requires: 'tech:husbandry' },
  { id: 'townforager', name: 'Town forager', desc: 'Works the town sites in the Town tab.', produces: {}, requires: 'tech:townlore' },
  { id: 'taster', name: 'Taster', desc: 'Tastes stored food and throws out the poisoned share.', produces: {}, requires: 'tech:tasting' },
  { id: 'builder', name: 'Builder', desc: 'Carries soil, twigs and stores up to the Swarm Spire.', produces: {}, requires: 'tech:flight' },
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

interface JobsState {
  assigned: Record<string, number>; tech: Record<string, number>; hunger?: number; starved?: number; bench?: number; warned?: boolean; warnCd?: number; lowFor?: number; lowest?: number;
  /** The queen's decree (an archive accord): the worker mix new workers are sent to match. Kept across colonies. */
  decree?: Record<string, number>; decreeOn?: boolean;
  /** Daily routine: idle workers go to this job. Kept across colonies. */
  defaultJob?: string;
  /** Workers last tick: only a rise (new hatchlings) is sent to the default job. */
  routineHome?: number;
}
const S = (ctx: Context) => ctx.state.jobs as JobsState;
/** Per-worker rates get three significant figures, so 'each' times the count matches the total. */
const fmtEach = (n: number) => (Math.abs(n) < 1 && n !== 0 ? String(Number(n.toPrecision(3))) : fmt(n));

const totalAnts = (ctx: Context) => Math.floor(ctx.res.amt('ant'));
/** Most workers a job can take. */
const jobMax = (ctx: Context, id: string) => {
  if (id === 'replete') return CASTES.replete.max + ctx.mods.get('repleteMax');
  if (id === 'major') return Math.floor((S(ctx).assigned.soldier ?? 0) / Math.max(2, CASTES.major.perSoldiers - ctx.mods.get('majorRatio')));
  const slot = COLONY.jobSlots[id];
  if (!slot) return Infinity;
  const built = (ctx.state.nest as { built?: Record<string, number> } | undefined)?.built?.[slot[0]] ?? 0;
  return slot[2] + ctx.mods.get('slots:' + id) + (slot[1] + ctx.mods.get('slotsPer:' + id)) * built;
};
const assignedSum = (ctx: Context) => Object.values(S(ctx).assigned).reduce((a, b) => a + b, 0);
/** busy['job:<id>'] counts workers of that job who are away (they make nothing), not idle ones. */
const busySum = (ctx: Context) => Object.entries(ctx.busy).reduce((a, [k, b]) => (k.startsWith('job:') ? a : a + b), 0);
/** Soldiers and majors at home with no raid on: they hunt. A campaign takes all of them away. */
const offDutyFighters = (ctx: Context) => {
  const w = ctx.state.war as { battle?: unknown; campaign?: unknown } | undefined;
  if (w?.battle || w?.campaign) return 0;
  return (S(ctx).assigned.soldier ?? 0) + (S(ctx).assigned.major ?? 0);
};
export const idleAnts = (ctx: Context) => totalAnts(ctx) - assignedSum(ctx) - busySum(ctx);
const upkeepMult = (ctx: Context) => Math.max(0.2, 1 + ctx.mods.get('upkeep'));
const jobMult = (ctx: Context, id: string) => (1 + ctx.mods.get('job:' + id)) * mouldWork(ctx);
const jobOpen = (ctx: Context, j: JobDef) => !j.requires || ctx.flags.has(j.requires);

/** Daily routine: newly hatched workers go to the default job (after any decree). */
function followRoutine(ctx: Context) {
  const s = S(ctx), id = s.defaultJob;
  // Only newly hatched workers follow the routine, so workers you move by hand stay where you put them.
  const home = totalAnts(ctx), fresh = Math.max(0, home - (s.routineHome ?? home));
  s.routineHome = home;
  if (!id || !ctx.flags.has('tech:routine') || (s.decreeOn && ctx.flags.has('accord:decree'))) return;
  const j = JOB_DEFS.find((d) => d.id === id);
  if (!j || !jobOpen(ctx, j)) return;
  const e = ctx.state.expeditions as { reserve?: boolean; short?: number } | undefined;
  // the expedition reserve refills its losses before the default job gets anyone
  const free = idleAnts(ctx) - (e?.reserve ? e.short ?? 0 : 0); // workers already held in reserve count as busy
  const n = Math.min(fresh, free, jobMax(ctx, id) - (s.assigned[id] ?? 0));
  if (n > 0) s.assigned[id] = (s.assigned[id] ?? 0) + n;
}
/** Send idle workers to whichever decreed job is furthest below its share. Never moves anyone already working. */
function followDecree(ctx: Context) {
  const s = S(ctx);
  if (!s.decreeOn || !s.decree || !ctx.flags.has('accord:decree')) return;
  const open = JOB_DEFS.filter((j) => (s.decree![j.id] ?? 0) > 0 && jobOpen(ctx, j) && s.assigned[j.id] < jobMax(ctx, j.id));
  const weight = open.reduce((t, j) => t + s.decree![j.id], 0);
  if (!weight) return;
  for (let idle = idleAnts(ctx); idle > 0; idle--) {
    const staff = open.reduce((t, j) => t + s.assigned[j.id], 0) + 1;
    let best = open[0], gap = -Infinity;
    for (const j of open) {
      if (s.assigned[j.id] >= jobMax(ctx, j.id)) continue;
      const g = (s.decree![j.id] / weight) * staff - s.assigned[j.id];
      if (g > gap) { gap = g; best = j; }
    }
    if (s.assigned[best.id] >= jobMax(ctx, best.id)) break;
    s.assigned[best.id]++;
  }
}

/**
 * Seconds until food runs out, or Infinity. The shown rate counts larvae eating, but a larva only eats
 * until it pupates, so a short dip from a batch of larvae is weighed against the food in store:
 * the stores only need to cover what the brood here will still eat, plus the drain from eggs still being laid.
 */
function foodRunsOutIn(ctx: Context, have: number) {
  const food = ctx.res.get('food');
  // repletes' feeding props the rate up only while their reserve lasts, so count the reserve as stock instead
  const rate = food.rate - (food.sources.find(([k]) => k === 'Repletes feeding')?.[1] ?? 0);
  have += ctx.res.has('reserve') ? ctx.res.amt('reserve') : 0;
  const larvae = -(food.sources.find(([k]) => k === 'Larvae eating')?.[1] ?? 0);
  const { committed, ongoing } = broodFoodOutlook(ctx);
  if (larvae <= ongoing) return rate < 0 ? have / -rate : Infinity; // the brood drain is steady: take the rate as it is
  const until = committed / (larvae - ongoing); // when the brood here has eaten its fill
  if (rate < 0 && have / -rate <= until) return have / -rate;
  const left = have + rate * until;
  const after = rate + larvae - ongoing;
  return after < 0 ? until + left / -after : Infinity;
}

export const jobs: GameSystem = {
  id: 'jobs',

  init(ctx) {
    ctx.res.define({ id: 'food', name: 'Food', cap: NEST.baseFoodCap, order: 1 });
    ctx.res.define({ id: 'soil', name: 'Soil', cap: NEST.baseSoilCap, order: 2 });
    ctx.res.define({ id: 'pheromone', name: 'Pheromone', cap: 40, order: 4 });
    ctx.res.define({ id: 'clay', name: 'Clay', cap: JOBS.clayCap, order: 5, integer: true });
    ctx.state.jobs = { assigned: Object.fromEntries(JOB_DEFS.map((j) => [j.id, 0])), tech: {} } satisfies JobsState;
  },

  isUnlocked: (ctx) => ctx.res.get('ant').seen,

  keep(ctx) {
    const s = S(ctx);
    return { assigned: Object.fromEntries(JOB_DEFS.map((j) => [j.id, 0])), tech: {}, decree: s.decree, decreeOn: s.decreeOn, defaultJob: s.defaultJob } satisfies JobsState;
  },

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

    // over a job's limit (older saves, or majors after soldiers leave): step down. Majors wait on the bench
    // and step back up by themselves once there are soldiers enough again.
    for (const j of JOB_DEFS) {
      const over = s.assigned[j.id] - jobMax(ctx, j.id);
      if (over <= 0) continue;
      s.assigned[j.id] -= over;
      if (j.id === 'major') s.bench = (s.bench ?? 0) + over;
    }
    if (s.bench) {
      const back = Math.max(0, Math.min(s.bench, jobMax(ctx, 'major') - s.assigned.major, idleAnts(ctx)));
      s.assigned.major += back; s.bench -= back;
    }
    followDecree(ctx);
    followRoutine(ctx);

    // upkeep. Whatever can't be paid builds up as hunger, and hunger slowly kills workers.
    // The queen never starves, so the colony can always rebuild from her.
    const need = totalAnts(ctx) * COLONY.antFoodPerSecond * upkeepMult(ctx) * dt;
    if (need > ctx.res.amt('food')) drawReserve(ctx, need - ctx.res.amt('food'));
    const have = ctx.res.amt('food');
    ctx.res.source = 'Colony upkeep';
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
    const runsOut = foodRunsOutIn(ctx, have);
    const stock = have + (ctx.res.has('reserve') ? ctx.res.amt('reserve') : 0);
    // real danger only: larvae just stop growing when food is short, so a brood drain alone never starves anyone.
    // Warn when the workers' own upkeep outruns income.
    const food = ctx.res.get('food');
    const larvaeEat = -(food.sources.find(([k]) => k === 'Larvae eating')?.[1] ?? 0);
    const workersNet = food.rate - (food.sources.find(([k]) => k === 'Repletes feeding')?.[1] ?? 0) + larvaeEat;
    const danger = workersNet < 0 && stock / -workersNet < COLONY.starveWarnSeconds;
    const low = stock > 0 && totalAnts(ctx) > 0 && danger && runsOut < COLONY.starveWarnSeconds; // no workers yet: nobody can starve
    // the Chronicle only speaks up when food stays low for a while (not a passing blip),
    // and not again until food has truly recovered and a short cooldown has passed
    s.warnCd = Math.max(0, (s.warnCd ?? 0) - dt);
    s.lowFor = low ? (s.lowFor ?? 0) + dt : 0;
    if (!s.warned && s.lowFor >= COLONY.starveWarnAfter && s.warnCd <= 0) {
      s.warned = true;
      s.warnCd = COLONY.starveWarnEvery;
      ctx.log(`Food is running low. At this rate it is gone in about ${Math.ceil(runsOut)}s, and then workers will starve.`, 'warn');
    }
    if (stock > 0 && !low) s.warned = false;
    ctx.alert('starving', starving
      ? 'Your workers are starving. They will die one by one until food comes in. Put more workers on foraging.'
      : low ? `Food runs out in about ${Math.ceil(runsOut)}s. Then workers start to starve.` : null);
    const mult = starving ? COLONY.starvingPenalty : 1;

    for (const j of JOB_DEFS) {
      const n = Math.max(0, (s.assigned[j.id] ?? 0) - (ctx.busy['job:' + j.id] ?? 0));
      if (!n) continue;
      ctx.res.source = j.name + 's';
      for (const [rid, per] of Object.entries(j.produces)) ctx.res.add(rid, per * n * mult * jobMult(ctx, j.id) * dt);
      if (j.id === 'digger' && ctx.flags.has('tech:deepdig')) ctx.res.add('clay', JOBS.diggerClay * n * mult * jobMult(ctx, j.id) * dt);
    }
    // Off duty, soldiers and majors hunt near the nest, so they never sit idle between fights.
    const hunters = offDutyFighters(ctx);
    if (hunters) {
      ctx.res.source = 'Soldiers hunting';
      ctx.res.add('food', JOBS.forager.food * WAR.battle.offDuty * (1 + ctx.mods.get('hunting')) * hunters * mult * jobMult(ctx, 'forager') * dt);
    }
  },

  panel: (() => {
    const rows = new Map<string, { row: HTMLElement; count: HTMLElement; out: HTMLElement; star: HTMLButtonElement }>();
    let idleEl: HTMLElement, reservedEl: HTMLElement, list: HTMLElement, upkeepEl: HTMLElement, census: HTMLElement;
    let decreeBox: HTMLElement, decreeText: HTMLElement, decreeSet: HTMLButtonElement, decreeToggle: HTMLButtonElement;
    const change = (ctx: Context, id: string, d: number) => {
      const s = S(ctx);
      if (d > 0) d = Math.max(0, Math.min(d, idleAnts(ctx), jobMax(ctx, id) - s.assigned[id]));
      else { d = -Math.min(-d, s.assigned[id]); if (id === 'major') s.bench = 0; }
      s.assigned[id] += d;
      if (d) ctx.bus.emit('jobs:change');
    };
    return {
      title: 'Jobs',
      group: 'Colony',
      mount(root, ctx) {
        idleEl = el('strong');
        upkeepEl = el('p.muted');
        census = el('div.ledger');
        list = el('div.jobs');
        decreeText = el('span.muted');
        decreeSet = el('button.small', { type: 'button', title: 'Idle workers are sent to these jobs, keeping them in these proportions.', onclick: () => {
          const s = S(ctx);
          s.decree = Object.fromEntries(Object.entries(s.assigned).filter(([, n]) => n > 0));
          s.decreeOn = true;
          ctx.log('The queen decrees the colony\'s work. New workers will keep to it.', 'info');
        } }, 'Decree this mix') as HTMLButtonElement;
        decreeToggle = el('button.small', { type: 'button', onclick: () => { const s = S(ctx); s.decreeOn = !s.decreeOn; } }) as HTMLButtonElement;
        decreeBox = el('div.decree', { hidden: true }, el('strong', {}, 'The queen\'s decree'), decreeText, el('div.row', {}, decreeSet, decreeToggle));
        root.append(
          el('p.flavor', {}, 'Every worker waits for a purpose. Idle ants still eat.'),
          el('p', {}, 'Idle workers: ', idleEl, reservedEl = el('span.muted')),
          decreeBox,
          list, upkeepEl, el('p.controls', {}, 'Shift-click moves 10. Ctrl-click moves all.'), census,
        );
        for (const j of JOB_DEFS) {
          const count = el('span.count'), out = el('span.muted');
          const btn = (label: string, d: number) => el('button.small', { type: 'button', title: 'Shift-click to move 10 workers. Ctrl-click to move all of them.', onclick: (e: MouseEvent) => change(ctx, j.id, e.ctrlKey || e.metaKey ? d * 9999 : e.shiftKey ? d * 10 : d) }, label);
          const star = el('button.small.defjob', { type: 'button', title: '', onclick: () => { const s = S(ctx); s.defaultJob = s.defaultJob === j.id ? undefined : j.id; } }, '☆') as HTMLButtonElement;
          const row = el('div.job', { title: j.desc, hidden: true },
            el('span.jname', {}, icon(j.id), j.name), btn('−', -1), count, btn('+', 1), out, star);
          list.append(row);
          rows.set(j.id, { row, count, out, star });
        }
      },
      update(_root, ctx) {
        const s = S(ctx);
        idleEl.textContent = String(idleAnts(ctx));
        { const e = ctx.state.expeditions as { reserve?: boolean; reserved?: number } | undefined;
          reservedEl.textContent = e?.reserve ? `  ·  Reserved for expeditions: ${e.reserved ?? 0}` : ''; }
        decreeBox.hidden = !ctx.flags.has('accord:decree');
        if (!decreeBox.hidden) {
          const d = s.decree ?? {};
          const tot = Object.values(d).reduce((a, b) => a + b, 0);
          const mix = Object.entries(d).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
            .map(([id, n]) => `${Math.round((n / tot) * 100)}% ${(JOB_DEFS.find((j) => j.id === id)?.name ?? id).toLowerCase()}`).join(', ');
          decreeText.textContent = tot
            ? (s.decreeOn ? ` In force: ${mix}. Idle workers are sent to match it.` : ` Lifted. Last decree: ${mix}.`)
            : ' Assign workers the way you like, then decree it. New workers will keep the same mix.';
          decreeToggle.hidden = !tot;
          decreeToggle.textContent = s.decreeOn ? 'Lift the decree' : 'Restore the decree';
        }
        for (const j of JOB_DEFS) {
          const r = rows.get(j.id)!;
          r.row.hidden = !!j.requires && !ctx.flags.has(j.requires);
          r.star.hidden = !ctx.flags.has('tech:routine');
          r.star.textContent = s.defaultJob === j.id ? '★' : '☆';
          const tipText = s.defaultJob === j.id ? 'The default job: newly hatched workers go here.\nClick to clear.' : 'Newly hatched workers go to the default job.\nClick to make this the default.';
          if (r.star.dataset.tip !== tipText) r.star.dataset.tip = tipText;
          r.star.classList.toggle('on', s.defaultJob === j.id);
          r.count.textContent = isFinite(jobMax(ctx, j.id)) ? `${s.assigned[j.id]}/${jobMax(ctx, j.id)}` : String(s.assigned[j.id]);
          // The row shows only the rate; the tooltip shows the math once.
          const n = s.assigned[j.id];
          const mult = jobMult(ctx, j.id);
          const who = j.name.toLowerCase();
          const each = Object.entries(j.produces).map(([rid, base]) => ({ name: ctx.res.get(rid).name.toLowerCase(), base, per: base * mult }));
          const tot = (x: number) => (x ? fmt(x) : '0');
          const parts = each.map((e) => `+${tot(e.per * n)} ${e.name}/s`);
          const math = each.flatMap((e) => [
            `Each ${who}: ${fmtEach(e.base)} ${e.name}/s` + (Math.abs(mult - 1) > 1e-9 ? `, ${mult > 1 ? '+' : '−'}${Math.round(Math.abs(mult - 1) * 100)}% from bonuses = ${fmtEach(e.per)}` : ''),
            `${n} × ${fmtEach(e.per)} = ${tot(e.per * n)} ${e.name}/s`,
          ]);
          r.row.dataset.tip = j.desc + (math.length ? '\n' + math.join('\n') : '');
          if (j.id === 'nurse') {
            const egg = nurseEggsEach(ctx);
            const brood = Math.floor(ctx.res.amt('egg') + ctx.res.amt('larva'));
            const care = BROOD.queenTends + n * nurseTends(ctx);
            parts.push(`+${tot(egg * n)} eggs/s`);
            r.row.dataset.tip = j.desc +
              `\nEach nurse lays ${fmtEach(egg)} eggs/s and looks after ${BROOD.nurseTends} eggs or larvae. The queen looks after ${BROOD.queenTends}. The rest grow at half speed.` +
              `\nLooked after now: ${Math.min(brood, care)} of ${brood}.` +
              (ctx.flags.has('tech:brood')
                ? `\nMould: ${roomCount(ctx)} chambers make ${mouldMade(ctx).toFixed(1)}/s. The queen scrubs ${BROOD.mould.queenClean}/s and each nurse ${nurseClean(ctx)}/s${ctx.mods.get('mouldClean') ? `, purification ${ctx.mods.get('mouldClean').toFixed(1)}/s` : ''} (${mouldClean(ctx).toFixed(1)}/s now).` +
                  `\nBrood speed from mould: ${Math.round(mouldSpeed(ctx) * 100)}%.`
                : '');
          }
          if (j.id === 'replete' && n && ctx.res.has('reserve')) {
            parts.push(`reserve ${fmt(ctx.res.amt('reserve'))}/${fmt(ctx.res.cap('reserve'))}`);
            const jr = ctx.res.get('jelly').sources.find(([k]) => k === 'Repletes')?.[1] ?? 0;
            if (jr > 0) parts.push(`+${fmt(jr)} jelly/s`);
          }
          if (j.id === 'soldier' && s.assigned.soldier) {
            parts.push(`power ${fmt(s.assigned.soldier * (1 + ctx.mods.get('soldierPower')))}`);
            if (offDutyFighters(ctx)) parts.push(`+${tot(JOBS.forager.food * WAR.battle.offDuty * (1 + ctx.mods.get('hunting')) * s.assigned.soldier * jobMult(ctx, 'forager'))} food/s hunting`);
          }
          r.out.textContent = parts.join(', ');
          const slot = COLONY.jobSlots[j.id];
          if (slot) r.row.dataset.tip += `\nSlots: ${jobMax(ctx, j.id)}. Each ${(NEST.chambers as Record<string, { name: string }>)[slot[0]]?.name.toLowerCase() ?? slot[0]} adds ${slot[1]}.`;
        }
        const busy = busySum(ctx);
        const hungry = (s.hunger ?? 0) > 0 ? 'Workers are starving and will die one by one until food comes in.' : '';
        upkeepEl.textContent = (hungry ? hungry + ' ' : '') + `The colony eats ${fmt(totalAnts(ctx) * COLONY.antFoodPerSecond * upkeepMult(ctx))} food/s.`;
        const away = Object.entries(ctx.busy).filter(([, n]) => n > 0).map(([k, n]) => [k === 'expeditions' ? 'On expeditions' : k === 'job:scout' ? 'Scouts away' : k === 'campaign' ? 'On campaign' : k, String(n)]);
        census.replaceChildren(...[['Total workers', String(totalAnts(ctx))], ...away].map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        census.hidden = !busy;
      },
    };
  })(),
};

/** Colony techniques: their own sub-tab under Colony, opened by Teaching. */
export const techniques: GameSystem = {
  id: 'techniques',
  init() {},
  // Techniques come after the first flight, so a first colony has less to buy.
  isUnlocked: (ctx) => ctx.flags.has('tech:teaching') && ctx.flags.has('legacy:flown'),
  panel: (() => {
    let techs: ReturnType<typeof upgradeList>;
    return {
      title: 'Techniques',
      group: 'Colony',
      mount(root, ctx) {
        techs = upgradeList(ctx, () => S(ctx).tech, TECHS, { research: true });
        root.append(el('p.flavor', {}, 'What the elders teach, the colony keeps.'), techs.root);
      },
      update(_root, ctx) { techs.update(ctx); },
    };
  })(),
};
