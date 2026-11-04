// Research: spend Knowledge (from Elders) to unlock technology, Evolve / Civ style.
// Each tech sets the flag "tech:<id>". Other systems gate jobs, chambers, upgrades and tabs on those flags.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, type ActionButton } from '../../core/ui';
import { fmtCosts } from '../../core/resources';
import { RESEARCH } from '../../data/balance';

const TECHS = RESEARCH.techs;
const IDS = Object.keys(TECHS);

const done = (ctx: Context, id: string) => ctx.flags.has('tech:' + id);
const available = (ctx: Context, id: string) => {
  const t = TECHS[id];
  return !done(ctx, id) && t.needs.every((n) => done(ctx, n)) && (!t.flag || ctx.flags.has(t.flag));
};
/** Shown greyed out: one step away (only one prerequisite missing), so you can plan ahead. */
const upcoming = (ctx: Context, id: string) => {
  const t = TECHS[id];
  return !done(ctx, id) && !available(ctx, id) && t.needs.filter((n) => !done(ctx, n)).length <= 1 && t.needs.some((n) => done(ctx, n) || available(ctx, n));
};

export const research: GameSystem = {
  id: 'research',

  init(ctx) {
    ctx.res.define({ id: 'knowledge', name: 'Knowledge', cap: RESEARCH.knowledgeCap, order: 5 });
    ctx.state.research = {};
  },

  isUnlocked: (ctx) => ctx.flags.has('research') || Math.floor(ctx.res.amt('ant')) >= RESEARCH.appearAtWorkers,

  tick(ctx) {
    if (!ctx.flags.has('research') && Math.floor(ctx.res.amt('ant')) >= RESEARCH.appearAtWorkers) {
      ctx.flags.add('research');
      ctx.log('An old worker stops and taps the wall, thinking. The colony can learn. (Elders and Research unlocked)', 'info');
    }
  },

  panel: (() => {
    const rows = new Map<string, { wrap: HTMLElement; btn: ActionButton; note: HTMLElement }>();
    let doneList: HTMLElement, empty: HTMLElement, upcomingHead: HTMLElement, upcomingList: HTMLElement;
    return {
      title: 'Research',
      mount(root, ctx) {
        const list = el('div.build');
        for (const id of IDS) {
          const t = TECHS[id];
          const note = el('span.muted');
          const btn = actionButton({
            ctx, label: t.name, desc: t.desc,
            costs: () => t.cost,
            enabled: (c) => available(c, id),
            onBuy: (c) => {
              c.flags.add('tech:' + id);
              c.log(`Researched ${t.name}. ${t.desc}`, 'info');
            },
          });
          const wrap = el('div.buildrow', { hidden: true }, btn.root, note, el('span'));
          list.append(wrap);
          rows.set(id, { wrap, btn, note });
        }
        empty = el('p.muted', {}, 'Nothing to research right now. New ideas come as the colony grows.');
        upcomingHead = el('h3', {}, 'On the horizon');
        upcomingList = el('div.ledger');
        doneList = el('p.muted');
        root.append(
          el('p.flavor', {}, 'Elders remember. What one ant learns, the colony keeps.'),
          el('p.muted', {}, 'Put workers on the Elder job to gather knowledge.'),
          list, empty, upcomingHead, upcomingList, el('h3', {}, 'Known'), doneList,
        );
      },
      update(_root, ctx) {
        let any = false;
        for (const id of IDS) {
          const r = rows.get(id)!;
          const show = available(ctx, id);
          r.wrap.hidden = !show;
          if (!show) continue;
          any = true;
          r.btn.update(ctx);
          const k = TECHS[id].cost.knowledge ?? 0;
          r.note.textContent = TECHS[id].desc + (k > ctx.res.cap('knowledge') ? ` Needs ${k} knowledge storage: build a Hall of elders.` : '');
        }
        empty.hidden = any;
        const next = IDS.filter((id) => upcoming(ctx, id));
        upcomingHead.hidden = !next.length;
        upcomingList.replaceChildren(...next.map((id) => {
          const t = TECHS[id];
          const missing = t.needs.filter((n) => !done(ctx, n)).map((n) => TECHS[n].name);
          return el('div', {}, el('span.muted', {}, t.name), el('span.muted', {}, missing.length ? `after ${missing.join(', ')}` : t.flag ? 'when the time comes' : fmtCosts(t.cost, ctx.res)));
        }));
        const known = IDS.filter((id) => done(ctx, id)).map((id) => TECHS[id].name);
        doneList.textContent = known.length ? known.join(', ') : 'Nothing yet.';
      },
    };
  })(),
};
