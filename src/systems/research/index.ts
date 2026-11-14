// Research: spend Knowledge (from Elders) to unlock technology, Evolve / Civ style.
// Each tech sets the flag "tech:<id>". Other systems gate jobs, chambers, upgrades and tabs on those flags.
import type { GameSystem, Context } from '../../core/types';
import { el, hoverTip, tileButton } from '../../core/ui';
import { COLONY, RESEARCH } from '../../data/balance';
import { dockQueue, fits, runQueue } from '../../core/queue';
import { runUpgradeQueue, upgradeItem, upgradeName } from '../../core/upgrades';

const TECHS = RESEARCH.techs;
const IDS = Object.keys(TECHS);

const done = (ctx: Context, id: string) => ctx.flags.has('tech:' + id);
const available = (ctx: Context, id: string) => {
  const t = TECHS[id];
  return !done(ctx, id) && t.needs.every((n) => done(ctx, n)) && (!t.flag || ctx.flags.has(t.flag)) && revealed(ctx, id);
};
/** Hidden milestones: some research stays out of sight until the colony has done something. */
const MS = RESEARCH.milestones;
const revealed = (ctx: Context, id: string) => !MS[id] || ctx.flags.has('idea:' + id);
function counter(ctx: Context, what: string) {
  const st = ctx.state as Record<string, any>;
  switch (what) {
    case 'runs': return st.expeditions?.runs ?? 0;
    case 'tiles': return (st.map?.tiles as { o: string | null }[] | undefined)?.filter((t) => t.o === 'you').length ?? 0;
    case 'raids': return st.war?.raids ?? 0;
    case 'wave': return st.war?.wave ?? 0;
    case 'peak': return peak(ctx);
    case 'born': return st.brood?.born ?? 0;
    case 'rooms': return Object.values((st.nest?.built ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
    case 'outposts': return (st.map?.tiles as { o: string | null; outpost?: boolean }[] | undefined)?.filter((t) => t.o === 'you' && t.outpost).length ?? 0;
    case 'starved': return st.jobs?.starved ?? 0;
    case 'techs': return IDS.filter((t) => done(ctx, t)).length;
    default:
      if (what.startsWith('full:')) { const r = what.slice(5); return ctx.res.has(r) && ctx.res.cap(r) > 0 ? ctx.res.amt(r) / ctx.res.cap(r) * 100 : 0; } return ctx.res.has(what) ? ctx.res.amt(what) : 0;
  }
}
/** Reveal research whose milestone has been reached (and whose other needs are met), with a Chronicle line. */
function checkMilestones(ctx: Context) {
  for (const [id, [what, at, who]] of Object.entries(MS)) {
    const t = TECHS[id];
    if (!t || ctx.flags.has('idea:' + id)) continue;
    if (done(ctx, id)) { ctx.flags.add('idea:' + id); continue; }
    if (!t.needs.every((n) => done(ctx, n)) || (t.flag && !ctx.flags.has(t.flag)) || counter(ctx, what) < at) continue;
    ctx.flags.add('idea:' + id);
    ctx.log(`${who} have a new idea: ${t.name} (Research).`, 'info');
  }
}
/** Big research needs a colony that has reached a size: a share of COLONY.targetColony, by peak workers this colony. */
const popNeed = (id: string) => Math.round((TECHS[id].pop ?? 0) * COLONY.targetColony);
const peak = (ctx: Context) => Math.max((ctx.state.stats as { colonyPeak?: number } | undefined)?.colonyPeak ?? 0, Math.floor(ctx.res.amt('ant')));
const bigEnough = (ctx: Context, id: string) => peak(ctx) >= popNeed(id);

/** Research queue: 2 slots from Study plans, more from the Master plans lineage perk. */
export const researchSlots = (ctx: Context) => (ctx.flags.has('tech:studyplans') ? 2 + ctx.mods.get('queueSlots') : 0);
const RQ = (ctx: Context) => { const s = ctx.state.research as { queue?: string[] }; return (s.queue ??= []); };
dockQueue('Research queue', 1, (strip, ctx) => strip.update(researchSlots(ctx), RQ(ctx), (id) => (id.startsWith('u:') ? upgradeName(id) : TECHS[id]?.name ?? id), undefined, ctx, (id) => (id.startsWith('u:') ? upgradeItem(ctx, id)?.cost() : TECHS[id]?.cost)));
function learn(ctx: Context, id: string) {
  ctx.flags.add('tech:' + id);
  ctx.log(`Researched ${TECHS[id].name}. ${TECHS[id].desc}`, 'info');
}

/** Learned techs publish their mods (source 'research') and storage bonuses. Keys are reset each tick so nothing lingers. */
const MOD_KEYS = [...new Set(IDS.flatMap((id) => Object.keys(TECHS[id].mods ?? {})))];
const CAP_KEYS = [...new Set(IDS.flatMap((id) => Object.keys(TECHS[id].caps ?? {})))];
function applyTechEffects(ctx: Context) {
  const mods: Record<string, number> = {}, caps: Record<string, number> = {};
  for (const id of IDS) {
    const t = TECHS[id];
    if ((!t.mods && !t.caps) || !done(ctx, id)) continue;
    for (const [k, v] of Object.entries(t.mods ?? {})) mods[k] = (mods[k] ?? 0) + v;
    for (const [k, v] of Object.entries(t.caps ?? {})) caps[k] = (caps[k] ?? 0) + v;
  }
  for (const k of MOD_KEYS) ctx.mods.set(k, 'research', mods[k] ?? 0);
  for (const k of CAP_KEYS) if (ctx.res.has(k)) ctx.res.setCapBonus(k, 'research', caps[k] ?? 0);
}

export const research: GameSystem = {
  id: 'research',

  init(ctx) {
    ctx.res.define({ id: 'knowledge', name: 'Knowledge', cap: RESEARCH.knowledgeCap, order: 3 });
    ctx.state.research = { queue: [], uq: [] };
  },

  isUnlocked: (ctx) => ctx.flags.has('research') || Math.floor(ctx.res.amt('ant')) >= RESEARCH.appearAtWorkers,

  tick(ctx) {
    // older saves: the Dirt stat techs became mechanics (Nov 14). Egg piles is gone and is not replaced.
    for (const [was, now] of [['soilsense', 'buriedfinds'], ['queenscent', 'broodrhythm'], ['sharedstomach', 'faminelaw'], ['eggpiles', '']]) {
      if (!ctx.flags.has('tech:' + was)) continue;
      ctx.flags.delete('tech:' + was);
      if (now) ctx.flags.add('tech:' + now);
    }
    applyTechEffects(ctx);
    checkMilestones(ctx);
    if (researchSlots(ctx)) runQueue(ctx, RQ(ctx), (id) => id.startsWith('u:') ? upgradeItem(ctx, id) : TECHS[id] && {
      name: TECHS[id].name, cost: () => TECHS[id].cost,
      ok: () => available(ctx, id), buy: () => learn(ctx, id),
    });
    runUpgradeQueue(ctx);
    // a calm fanfare when the colony enters a new age (not on load, and not for the first age)
    const st = ctx.state.research as { age?: string };
    const age = currentAge(ctx);
    if (st.age === undefined) st.age = age.id;
    else if (st.age !== age.id && RESEARCH.ages.findIndex((a) => a.id === age.id) > RESEARCH.ages.findIndex((a) => a.id === st.age)) {
      st.age = age.id;
      ctx.log(`The colony enters the ${age.name}. ${age.note}`, 'story');
      ctx.announce(age.name, age.note);
    }
    if (!ctx.flags.has('research') && Math.floor(ctx.res.amt('ant')) >= RESEARCH.appearAtWorkers) {
      ctx.flags.add('research');
      ctx.log('An old worker stops and taps the wall, thinking. The colony can learn. (Elders and Research unlocked)', 'info');
    }
  },

  panel: (() => {
    // One tab per age (Nate, Nov 14). Each shows what can be learned now and what has been learned.
    // An older age with research still waiting gets a dot; an age with nothing left fades and gets a tick.
    const rows = new Map<string, ReturnType<typeof tileButton>>();
    const pages = new Map<string, { tab: HTMLButtonElement; page: HTMLElement; list: HTMLElement; learned: HTMLElement; learnedHead: HTMLElement; status: HTMLElement; empty: HTMLElement }>();
    let picked: string | null = null, tabBar: HTMLElement;
    return {
      title: 'Research',
      group: 'Research',
      mount(root, ctx) {
        tabBar = el('div.tabs.agetabs');
        root.append(
          el('p.flavor', {}, 'Elders remember. What one ant learns, the colony keeps.'),
          el('p.muted', {}, 'Put workers on the Elder job to gather knowledge. New ideas appear as the colony grows and does new things.'),
          tabBar,
        );
        for (const age of RESEARCH.ages) {
          const tab = el('button.tab.agetab', { type: 'button', hidden: true }, age.name.replace(/^Age of /, '')) as HTMLButtonElement;
          tab.addEventListener('click', () => { picked = age.id; });
          tabBar.append(tab);
          const list = el('div.tiles'), learned = el('div.tiles.learned'), learnedHead = el('h3', {}, 'Learned');
          const status = el('p.muted'), empty = el('p.muted', {}, 'Nothing to research here right now.');
          const page = el('div.agepage', { hidden: true }, el('p.age', {}, `${age.name}. ${age.note}`), status, list, empty, learnedHead, learned);
          root.append(page);
          pages.set(age.id, { tab, page, list, learned, learnedHead, status, empty });
        }
        for (const id of IDS) {
          const t = TECHS[id];
          const btn = tileButton({
            ctx, label: t.name,
            effect: () => t.desc + ((t.cost.knowledge ?? 0) > ctx.res.cap('knowledge') ? ' Needs more knowledge storage: build Halls of elders.' : ''),
            warn: () => (bigEnough(ctx, id) ? '' : `Needs a colony of ${popNeed(id)} workers. Largest so far: ${peak(ctx)}.`),
            costs: () => t.cost,
            count: () => (RQ(ctx).includes(id) ? 'queued' : ''),
            enabled: (c) => available(c, id) && bigEnough(c, id),
            onBuy: (c) => learn(c, id),
            onQueue: (c) => {
              const q = RQ(c);
              if (q.length >= researchSlots(c) || q.includes(id) || !available(c, id) || !bigEnough(c, id) || !fits(c, t.cost)) return false;
              q.push(id);
              return true;
            },
          });
          btn.root.hidden = true;
          (pages.get(t.age) ?? pages.get('dirt')!).list.append(btn.root);
          rows.set(id, btn);
        }
      },
      update(_root, ctx) {
        const slots = researchSlots(ctx), q = RQ(ctx);
        const cur = RESEARCH.ages.findIndex((a) => a.id === currentAge(ctx).id);
        const open = new Map<string, number>(); // age -> research you can see and learn now
        for (const id of IDS) {
          const r = rows.get(id)!, show = available(ctx, id);
          r.root.hidden = !show;
          if (!show) continue;
          open.set(TECHS[id].age, (open.get(TECHS[id].age) ?? 0) + 1);
          r.root.classList.toggle('queues', slots > q.length && bigEnough(ctx, id) && !q.includes(id));
          r.update(ctx);
        }
        // tabs: every age up to the current one, plus any age with something open
        RESEARCH.ages.forEach((age, i) => {
          const pg = pages.get(age.id)!;
          pg.tab.hidden = !(i <= cur || open.has(age.id));
        });
        if (!picked || pages.get(picked)!.tab.hidden) picked = RESEARCH.ages[cur].id;
        RESEARCH.ages.forEach((age, i) => {
          const pg = pages.get(age.id)!;
          if (pg.tab.hidden) return;
          const ids = IDS.filter((id) => TECHS[id].age === age.id);
          const known = ids.filter((id) => done(ctx, id));
          // still to come: not learned, and not shut out by a flag this line hasn't earned
          const left = ids.filter((id) => !done(ctx, id) && (!TECHS[id].flag || ctx.flags.has(TECHS[id].flag!)));
          const waiting = open.get(age.id) ?? 0, hidden = left.length - waiting;
          const complete = left.length === 0;
          pg.tab.classList.toggle('on', picked === age.id);
          pg.tab.classList.toggle('complete', complete);
          pg.tab.classList.toggle('new', i < cur && waiting > 0 && picked !== age.id);
          pg.tab.title = complete ? 'Everything learned' : waiting ? `${waiting} to research` : 'Nothing to research yet';
          pg.page.hidden = picked !== age.id;
          if (pg.page.hidden) return;
          pg.empty.hidden = waiting > 0 || complete;
          pg.status.textContent = complete ? `Everything in this age is learned (${known.length}).`
            : `Learned ${known.length}. ` + (waiting ? `${waiting} to research now. ` : '') + (hidden > 0 ? 'More ideas will come as the colony grows.' : '');
          pg.learnedHead.hidden = !known.length;
          if (pg.learned.dataset.n !== String(known.length)) {
            pg.learned.dataset.n = String(known.length);
            pg.learned.replaceChildren(...known.map((id) => { const t = el('div.tile.done', { tabindex: 0 }, TECHS[id].name); hoverTip(t, () => [el('div.teffect', {}, TECHS[id].desc)]); return t; }));
          }
        });
      },
    };
  })(),
};

/** The latest age the colony has reached: the newest age of any tech you know or can research. */
export function currentAge(ctx: Context) {
  // Ages are walked in order: an age is reached once one of its techs is learned or open AND a tech of the
  // age before it is learned. So a town colony that can already see Settlement research still climbs
  // through Conquest and Wings first (Nate, Nov 12: after a migration the ages start over).
  const ages = RESEARCH.ages;
  const seen = (i: number) => IDS.some((id) => TECHS[id].age === ages[i].id && (done(ctx, id) || available(ctx, id)));
  const learned = (i: number) => IDS.some((id) => TECHS[id].age === ages[i].id && done(ctx, id));
  let best = 0;
  for (let i = 1; i < ages.length; i++) { if (seen(i) && learned(i - 1)) best = i; else break; }
  return ages[best];
}
