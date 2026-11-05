// Research: spend Knowledge (from Elders) to unlock technology, Evolve / Civ style.
// Each tech sets the flag "tech:<id>". Other systems gate jobs, chambers, upgrades and tabs on those flags.
import type { GameSystem, Context } from '../../core/types';
import { el, hoverTip, tileButton } from '../../core/ui';
import { RESEARCH } from '../../data/balance';

const TECHS = RESEARCH.techs;
const IDS = Object.keys(TECHS);

const done = (ctx: Context, id: string) => ctx.flags.has('tech:' + id);
const available = (ctx: Context, id: string) => {
  const t = TECHS[id];
  return !done(ctx, id) && t.needs.every((n) => done(ctx, n)) && (!t.flag || ctx.flags.has(t.flag));
};
export const research: GameSystem = {
  id: 'research',

  init(ctx) {
    ctx.res.define({ id: 'knowledge', name: 'Knowledge', cap: RESEARCH.knowledgeCap, order: 5 });
    ctx.state.research = {};
  },

  isUnlocked: (ctx) => ctx.flags.has('research') || Math.floor(ctx.res.amt('ant')) >= RESEARCH.appearAtWorkers,

  tick(ctx) {
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
    const rows = new Map<string, ReturnType<typeof tileButton>>();
    const groups = new Map<string, { head: HTMLElement; list: HTMLElement }>();
    let empty: HTMLElement, ageEl: HTMLElement;
    return {
      title: 'Research',
      group: 'Research',
      mount(root, ctx) {
        ageEl = el('p.age');
        root.append(
          el('p.flavor', {}, 'Elders remember. What one ant learns, the colony keeps.'),
          ageEl,
          el('p.muted', {}, 'Put workers on the Elder job to gather knowledge.'),
        );
        // one group per age, in order
        for (const age of RESEARCH.ages) {
          const head = el('h3', { hidden: true }, age.name);
          const list = el('div.tiles');
          groups.set(age.id, { head, list });
          root.append(head, list);
        }
        for (const id of IDS) {
          const t = TECHS[id];
          const btn = tileButton({
            ctx, label: t.name,
            effect: () => t.desc + ((t.cost.knowledge ?? 0) > ctx.res.cap('knowledge') ? ' Needs more knowledge storage: build Halls of elders.' : ''),
            costs: () => t.cost,
            enabled: (c) => available(c, id),
            onBuy: (c) => {
              c.flags.add('tech:' + id);
              c.log(`Researched ${t.name}. ${t.desc}`, 'info');
            },
          });
          btn.root.hidden = true;
          (groups.get(t.age) ?? groups.get('dirt')!).list.append(btn.root);
          rows.set(id, btn);
        }
        empty = el('p.muted', {}, 'Nothing to research right now. New ideas come as the colony grows.');
        root.append(empty);
      },
      update(_root, ctx) {
        let any = false;
        const shown = new Set<string>();
        for (const id of IDS) {
          const r = rows.get(id)!;
          const show = available(ctx, id);
          r.root.hidden = !show;
          if (!show) continue;
          any = true;
          shown.add(TECHS[id].age);
          r.update(ctx);
        }
        for (const [age, g] of groups) g.head.hidden = !shown.has(age);
        empty.hidden = any;
        const age = currentAge(ctx);
        ageEl.textContent = `${age.name}. ${age.note}`;
      },
    };
  })(),
};

/** Completed research gets its own sub-tab, grouped by age; hover a tile for what it did. */
export const researchDone: GameSystem = {
  id: 'researchDone',
  init() {},
  isUnlocked: (ctx) => IDS.some((id) => done(ctx, id)),
  panel: (() => {
    let box: HTMLElement;
    return {
      title: 'Completed',
      group: 'Research',
      quiet: true,
      mount(root) {
        box = el('div');
        root.append(el('p.flavor', {}, 'What the colony knows.'), box);
      },
      update(_root, ctx) {
        const known = IDS.filter((id) => done(ctx, id));
        if (box.dataset.n === String(known.length)) return;
        box.dataset.n = String(known.length);
        box.replaceChildren(...RESEARCH.ages.flatMap((age) => {
          const ids = known.filter((id) => TECHS[id].age === age.id);
          return ids.length ? [el('h3', {}, age.name), el('div.tiles', {}, ...ids.map((id) => { const t = el('div.tile.done', { tabindex: 0 }, TECHS[id].name); hoverTip(t, () => [el('div.teffect', {}, TECHS[id].desc)]); return t; }))] : [];
        }));
      },
    };
  })(),
};

/** The latest age the colony has reached: the newest age of any tech you know or can research. */
export function currentAge(ctx: Context) {
  let best = 0;
  for (const id of IDS) if (done(ctx, id) || available(ctx, id)) best = Math.max(best, RESEARCH.ages.findIndex((a) => a.id === TECHS[id].age));
  if (ctx.flags.has('legacy:migrated')) best = Math.max(best, 2);
  return RESEARCH.ages[best];
}
