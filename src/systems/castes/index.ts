// Castes: chew food into royal jelly (or, with the Garden, let nurses make it from fungus), then spend jelly to breed new kinds of ant.
// Each caste sets the flag "caste:<id>", which unlocks its job on the Jobs tab.
// Also: repletes bank surplus food in a Reserve and feed it back in a famine (reads ctx.state.jobs.assigned.replete),
// and Jelly glands let nurses make jelly on their own (automation).
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, tileButton, type ActionButton } from '../../core/ui';
import { fmt } from '../../core/resources';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { CASTES, NEST } from '../../data/balance';

interface CasteState { ups: Record<string, number>; chewed: number }
const S = (ctx: Context) => ctx.state.castes as CasteState;
const IDS = Object.keys(CASTES.types);
const nurses = (ctx: Context) => ctx.state.jobs?.assigned?.nurse ?? 0;
const glandRate = (ctx: Context) => nurses(ctx) * CASTES.upgrades.glands.per * (S(ctx).ups.glands ?? 0);
const UPS = fromBalance(CASTES.upgrades, (ctx) => ctx.flags.has('tech:castes'));
/** Caste tracks: each stage opens when the one before it is maxed. */
const TRACKS = Object.fromEntries(Object.entries(CASTES.tracks).map(([caste, stages]) => [caste, fromBalance(
  Object.fromEntries(stages.map((st, k) => [st.id, { ...st, needs: k ? stages[k - 1].id : '' }])),
  (ctx, needs) => ctx.flags.has('caste:' + caste) && (!needs || (S(ctx).ups[needs] ?? 0) >= stages.find((x) => x.id === needs)!.max),
)]));
const stagesDone = (ctx: Context, caste: string) => CASTES.tracks[caste].filter((st) => (S(ctx).ups[st.id] ?? 0) >= st.max).length;

/** Repletes feed the colony from their reserve: returns how much food they gave. */
export function drawReserve(ctx: Context, want: number) {
  if (want <= 0 || !ctx.res.has('reserve')) return 0;
  const got = Math.min(want, ctx.res.amt('reserve'));
  if (got <= 0) return 0;
  ctx.res.source = 'Feeding the colony';
  ctx.res.add('reserve', -got);
  ctx.res.source = 'Repletes feeding';
  ctx.res.add('food', got);
  return got;
}

export const castes: GameSystem = {
  id: 'castes',

  init(ctx) {
    ctx.res.define({ id: 'jelly', name: 'Royal jelly', cap: CASTES.jellyCap, order: 12, group: 'Brood' });
    ctx.res.define({ id: 'reserve', name: 'Reserve', cap: 0, order: 1.5 });
    ctx.res.define({ id: 'silk', name: 'Silk', cap: NEST.baseMaterialCap.silk, order: 23, integer: true, group: 'Surface' });
    ctx.state.castes = { ups: {}, chewed: 0 } satisfies CasteState;
  },

  isUnlocked: (ctx) => ctx.flags.has('tech:castes'),

  tick(ctx, dt) {
    // repletes fill up from surplus food: only while the stores are more than half full
    const n = ctx.state.jobs?.assigned?.replete ?? 0;
    // caste tracks publish their modifiers
    let living = 0;
    for (const stages of Object.values(CASTES.tracks)) for (const st of stages) {
      const v = st.per * (S(ctx).ups[st.id] ?? 0);
      if (st.mod === 'cap:ant') living += v; else ctx.mods.set(st.mod, 'caste-' + st.id, v);
    }
    ctx.res.setCapBonus('ant', 'woven', living);
    ctx.res.setCapBonus('reserve', 'repletes', n * CASTES.replete.hold * (1 + ctx.mods.get('repleteHold')));
    const over = ctx.res.amt('reserve') - ctx.res.cap('reserve'); // repletes moved off the job hand their food back
    if (over > 0) { ctx.res.source = 'Repletes reassigned'; ctx.res.add('reserve', -over); ctx.res.add('food', over); }
    const spare = ctx.res.amt('food') - ctx.res.cap('food') * 0.5;
    const take = Math.min(n * CASTES.replete.fill * (1 + ctx.mods.get('repleteFill')) * dt, ctx.res.cap('reserve') - ctx.res.amt('reserve'), spare);
    if (take > 0) {
      ctx.res.source = 'Repletes filling';
      ctx.res.add('food', -take);
      ctx.res.source = 'Repletes filling';
      ctx.res.add('reserve', take);
    }
    // with the reserve full, spare food becomes a slow trickle of royal jelly
    const R = CASTES.replete;
    const jelly = Math.min(n * R.jelly * (1 + ctx.mods.get('repleteJelly')) * dt, ctx.res.cap('jelly') - ctx.res.amt('jelly'), Math.max(0, spare - Math.max(0, take)) / R.food);
    if (jelly > 0 && ctx.res.amt('reserve') >= ctx.res.cap('reserve') - 1e-6) {
      ctx.res.source = 'Repletes making jelly';
      ctx.res.add('food', -jelly * R.food);
      ctx.res.source = 'Repletes';
      ctx.res.add('jelly', jelly);
    }
    // nurses with jelly glands chew fungus into jelly by themselves
    const make = glandRate(ctx) * dt;
    if (make > 0 && ctx.res.amt('fungus') >= make * 8 && ctx.res.amt('jelly') < ctx.res.cap('jelly')) {
      ctx.res.add('fungus', -make * 8);
      ctx.res.add('jelly', make);
    }
  },

  panel: (() => {
    let chew: ActionButton, list: HTMLElement, ledger: HTMLElement, ups: ReturnType<typeof upgradeList>;
    const tracks: { caste: string; head: HTMLElement; note: HTMLElement; box: HTMLElement; list: ReturnType<typeof upgradeList> }[] = [];
    const rows = new Map<string, ReturnType<typeof tileButton>>();
    return {
      title: 'Castes',
      group: 'Colony',
      mount(root, ctx) {
        chew = actionButton({
          ctx, label: 'Chew royal jelly', costs: () => CASTES.chew.cost, cooldown: CASTES.chew.cooldown,
          desc: 'Nurses chew food into one drop of royal jelly.',
          onBuy: (c) => { c.res.lump('jelly', 1); S(c).chewed++; },
        });
        list = el('div.tiles');
        for (const id of IDS) {
          const t = CASTES.types[id];
          const btn = tileButton({
            ctx, label: `Breed ${t.name.toLowerCase()}`, effect: t.desc, costs: () => t.cost,
            count: () => (ctx.flags.has('caste:' + id) ? 'bred' : ''),
            enabled: (c) => !c.flags.has('caste:' + id),
            onBuy: (c) => { c.flags.add('caste:' + id); c.log(`The first ${t.name.toLowerCase()} crawl out of the brood chamber. ${t.desc}`, 'info'); },
          });
          list.append(btn.root);
          rows.set(id, btn);
        }
        ledger = el('div.ledger');
        ups = upgradeList(ctx, () => S(ctx).ups, UPS);
        root.append(
          el('p.flavor', {}, 'Every larva could become anything. Royal jelly decides what.'),
          el('div.row', {}, chew.root),
          ledger,
          el('h3', {}, 'Castes'),
          list,
          el('h3', {}, 'Royal kitchen'),
          ups.root,
        );
        for (const caste of Object.keys(CASTES.tracks)) {
          const L = upgradeList(ctx, () => S(ctx).ups, TRACKS[caste]);
          const head = el('h3', {}, `${CASTES.types[caste].name}: the long road`), note = el('p.muted');
          const box = el('div', {}, head, note, L.root);
          root.append(box);
          tracks.push({ caste, head, note, box, list: L });
        }
      },
      update(_root, ctx) {
        chew.update(ctx);
        for (const id of IDS) {
          rows.get(id)!.update(ctx);
        }
        const rate = glandRate(ctx);
        ledger.replaceChildren(...[
          ['Jelly from nurses', rate ? `${fmt(rate)}/s (uses ${fmt(rate * 8)} fungus/s)` : 'none yet: buy Jelly glands'],
          ['Castes bred', `${IDS.filter((id) => ctx.flags.has('caste:' + id)).length} of ${IDS.length}`],
        ].map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        ups.update(ctx);
        for (const t of tracks) {
          const bred = ctx.flags.has('caste:' + t.caste);
          t.box.hidden = !bred;
          if (!bred) continue;
          const done = stagesDone(ctx, t.caste), all = CASTES.tracks[t.caste].length;
          const st = CASTES.tracks[t.caste], after = st[done + 1];
          t.note.textContent = done >= all ? `All ${all} stages done.` : `Stage ${done + 1} of ${all}: ${st[done].name}.` + (after ? ` Max it to open ${after.name}${all - done - 2 > 0 ? `, then ${all - done - 2} more` : ''}.` : ' The last stage.');
          t.list.update(ctx);
        }
      },
    };
  })(),
};
