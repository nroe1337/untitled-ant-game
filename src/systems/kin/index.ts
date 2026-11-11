// Kin diplomacy. Kin colonies are found by winged sorties (see map/world). Each has a temper, a chain of
// four quests, a gift it likes, and a feud with another kin: finishing a quest for one cools its enemy.
// Trust opens tiers (allies share half their gift, sworn kin send food), and at full trust with every
// quest done the two colonies join as one: workers now, living space and their gift for the whole line.
// Relations are the line's: they are kept across flights.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, progressBar, type ActionButton } from '../../core/ui';
import { fmt } from '../../core/resources';
import { KIN, WORLD } from '../../data/balance';
import { W, layout, ring, cxy } from '../map/world';

interface Rel { trust: number; q: number; base?: number | null; giftCd: number; merged?: boolean }
interface KinState { rel: Record<string, Rel>; count: Record<string, number>; lastWinters?: number }
const S = (ctx: Context) => ctx.state.kin as KinState;
const rel = (ctx: Context, id: string) => (S(ctx).rel[id] ??= { trust: 0, q: 0, giftCd: 0 });
const kinDef = (id: string) => WORLD.kin.find((k) => k.id === id)!;
const temper = (id: string) => KIN.tempers[kinDef(id).temper];
const tierOf = (trust: number) => KIN.tiers.reduce((t, x, i) => (trust >= x.at ? i : t), 0);
const pct = (v: number) => Math.round(Math.abs(v) * 100) + '%';
const quest = (id: string, r: Rel) => KIN.quests[id]?.[r.q];
/** Gifts warm a colony only so far: each quest done lets trust climb another step. */
const giftCap = (r: Rel) => Math.min(100, KIN.tiers[1].at + KIN.questTrust * r.q);
const found = (ctx: Context) => W(ctx).kin;

/** Where a quest's counter stands now. Counted kinds are measured from when the quest was taken. */
function counter(ctx: Context, kind: string): number {
  const c = S(ctx).count;
  switch (kind) {
    case 'cells': return W(ctx).seen.length;
    case 'tiles': return ctx.mods.get('tiles');
    case 'landmarks': return W(ctx).found.length;
    case 'flights': return ctx.state.lineage?.flights ?? 0;
    default: return c[kind] ?? 0;
  }
}
const absolute = (kind: string) => kind === 'tiles' || kind === 'landmarks' || kind === 'flights';
function progress(ctx: Context, id: string, r: Rel): [number, number] {
  const q = quest(id, r);
  if (!q || q.kind === 'give') return [0, 1];
  const now = counter(ctx, q.kind);
  return [Math.max(0, absolute(q.kind) ? now : now - (r.base ?? now)), q.n ?? 1];
}

function complete(ctx: Context, id: string) {
  const r = rel(ctx, id), q = quest(id, r)!;
  r.q++; r.base = null;
  r.trust = Math.min(100, r.trust + KIN.questTrust);
  const k = kinDef(id);
  ctx.announce(q.name, `${k.name} is pleased. Trust: ${KIN.tiers[tierOf(r.trust)].name}.`, { small: true, kicker: 'Kin quest done' });
  ctx.log(`${k.name}: "${q.name}" is done. They trust you more.`, 'story');
  // their enemies hear of it
  for (const [a, b] of KIN.feuds) {
    const foe = a === id ? b : b === id ? a : null;
    if (!foe || !found(ctx).includes(foe) || rel(ctx, foe).merged) continue;
    const f = rel(ctx, foe);
    if (f.trust <= 0) continue;
    f.trust = Math.max(0, f.trust - KIN.feudCost);
    ctx.log(`${kinDef(foe).name} hears you helped ${k.name}, and cools toward you.`, 'warn');
  }
}

function merge(ctx: Context, id: string) {
  const r = rel(ctx, id);
  r.merged = true;
  ctx.res.add('ant', KIN.merge.workers);
  const t = temper(id);
  ctx.announce(`${kinDef(id).name} joins you`, `Two scents become one. ${KIN.merge.workers} workers walk in along the trail, and their queen's daughters will be yours. ${t.gift.text.replace('{p}', pct(t.gift.per))}, for good.`, { kicker: 'One colony' });
}

export const kin: GameSystem = {
  id: 'kin',

  init(ctx) {
    ctx.state.kin = { rel: {}, count: {} } satisfies KinState;
    const bump = (k: string) => () => { if (!ctx.state.kin) return; S(ctx).count[k] = (S(ctx).count[k] ?? 0) + 1; };
    ctx.bus.on('war:won', bump('raids'));
    ctx.bus.on('expedition:return', bump('exp'));
    ctx.bus.on('map:capture', bump('capture'));
  },

  isUnlocked: (ctx) => !!ctx.state.map && found(ctx).length > 0,

  keep(ctx) {
    const s = S(ctx);
    return { rel: s.rel, count: s.count, lastWinters: 0 };
  },

  tick(ctx, dt) {
    const s = S(ctx);
    // winters lived through, counted for the line (the season count starts over with each colony)
    const winters = ctx.state.seasons?.winters ?? 0;
    if (winters > (s.lastWinters ?? 0)) s.count.winters = (s.count.winters ?? 0) + winters - (s.lastWinters ?? 0);
    s.lastWinters = winters;
    const mods: Record<string, number> = {};
    let living = 0, trade = 0;
    for (const id of found(ctx)) {
      const r = rel(ctx, id), t = temper(id);
      r.giftCd = Math.max(0, r.giftCd - dt);
      if (r.merged) { mods[t.gift.mod] = (mods[t.gift.mod] ?? 0) + t.gift.per; living += KIN.merge.living; continue; }
      const tier = tierOf(r.trust);
      if (tier >= 2) mods[t.gift.mod] = (mods[t.gift.mod] ?? 0) + t.gift.per / 2;
      if (tier >= 3) trade += KIN.tradeFood;
      // quests open once they know you
      const q = quest(id, r);
      if (tier >= 1 && q && q.kind !== 'give') {
        if (r.base == null) r.base = counter(ctx, q.kind);
        const [have, need] = progress(ctx, id, r);
        if (have >= need) complete(ctx, id);
      }
    }
    for (const t of Object.values(KIN.tempers)) ctx.mods.set(t.gift.mod, 'kin', mods[t.gift.mod] ?? 0);
    ctx.res.setCapBonus('ant', 'kin', living);
    if (trade) { const prev = ctx.res.source; ctx.res.source = 'Kin trade'; ctx.res.add('food', trade * dt); ctx.res.source = prev; }
  },

  panel: (() => {
    interface Card { id: string; root: HTMLElement; bar: ReturnType<typeof progressBar>; trust: HTMLElement; tier: HTMLElement; quest: HTMLElement; prog: HTMLElement; perks: HTMLElement; buttons: ActionButton[] }
    let list: HTMLElement, cards: Card[] = [], sig = '';
    const card = (ctx: Context, id: string): Card => {
      const k = kinDef(id), t = temper(id), r = rel(ctx, id);
      const c = ctx.state.map ? layout(ctx.state.map.seed).findIndex((x) => x.kin === id) : -1;
      const bar = progressBar();
      const trust = el('span.mono'), tier = el('p.muted'), q = el('p'), prog = el('p.muted'), perks = el('div.ledger');
      const buttons: ActionButton[] = [];
      const row = el('div.row');
      if (!r.merged) {
        const gift = (res: string) => actionButton({
          ctx, label: `Gift of ${res === 'knowledge' ? 'lore' : res}`, costs: () => ({ [res]: KIN.giftSize[res] }),
          desc: () => res === t.likes ? 'They love this. Worth much more than food.' : 'A plain gift. Quests open trust further.',
          enabled: (cx) => rel(cx, id).giftCd <= 0 && rel(cx, id).trust < giftCap(rel(cx, id)),
          onBuy: (cx) => { const rr = rel(cx, id); rr.giftCd = KIN.gift.every; rr.trust = Math.min(giftCap(rr), rr.trust + KIN.gift.trust * (res === t.likes ? KIN.gift.liked : 1)); },
        });
        buttons.push(gift(t.likes));
        if (t.likes !== 'food') buttons.push(gift('food'));
        const qd = quest(id, r);
        if (qd?.kind === 'give') buttons.push(actionButton({
          ctx, label: qd.name, costs: () => qd.costs ?? {}, desc: qd.text,
          enabled: (cx) => tierOf(rel(cx, id).trust) >= 1, onBuy: (cx) => complete(cx, id),
        }));
        if (!qd && r.trust >= 100) buttons.push(actionButton({
          ctx, label: 'Join as one colony', desc: `${KIN.merge.workers} workers now, +${KIN.merge.living} living space and their gift for every colony of your line. Their land stays theirs to work.`,
          enabled: () => true, onBuy: (cx) => merge(cx, id),
        }));
        row.append(...buttons.map((b) => b.root));
      }
      const head = el('div.row', {}, el('h3', {}, k.name), el('span.muted', {}, `${k.temper}, ${c >= 0 ? `cell ${cxy(c).join(',')}, ${ring(c)} from the garden` : 'far away'}`));
      const root = el('div.kin', {}, head, el('div.row', {}, bar.root, trust), tier, q, prog, row, perks);
      return { id, root, bar, trust, tier, quest: q, prog, perks, buttons };
    };
    return {
      title: 'Kin',
      group: 'World',
      mount(root, ctx) {
        list = el('div.kins');
        root.append(
          el('p.flavor', {}, 'Other nests of your own kind. Their scent is close to yours, but not the same.'),
          el('details.info', {}, el('summary', {}, 'Information'),
            el('p.muted', {}, 'Gifts warm a colony a little, and liked gifts warm it more, but only quests earn real trust. Finishing a quest for one colony cools any colony that feuds with it. Allies share half their gift with you; sworn kin also send food. At full trust, with every quest done, they can join you for good. Kin remember your line across flights.')),
          list);
        void ctx;
      },
      update(_root, ctx) {
        const ids = found(ctx);
        const nsig = ids.map((id) => { const r = rel(ctx, id); return `${id}:${r.q}:${!!r.merged}:${r.trust >= 100}`; }).join('|');
        if (nsig !== sig) { sig = nsig; cards = ids.map((id) => card(ctx, id)); list.replaceChildren(...cards.map((c) => c.root)); }
        for (const c of cards) {
          const r = rel(ctx, c.id), t = temper(c.id), ti = tierOf(r.trust), next = KIN.tiers[ti + 1];
          c.bar.set(r.trust / 100);
          c.trust.textContent = ` ${Math.floor(r.trust)} / 100`;
          c.tier.textContent = r.merged ? 'Joined with your colony.' : `${KIN.tiers[ti].name}. ${KIN.tiers[ti].note.replace('{t}', fmt(KIN.tradeFood))}` + (next ? ` Next: ${next.name} at ${next.at}.` : '');
          const q = quest(c.id, r);
          c.quest.hidden = r.merged || !q;
          if (q) c.quest.textContent = `Quest ${r.q + 1} of 4, ${q.name}: ${q.text}`;
          const [have, need] = progress(ctx, c.id, r);
          c.prog.hidden = r.merged || !q;
          c.prog.textContent = !q ? '' : ti < 1 ? 'They will not ask anything of strangers. Win them over with gifts first.'
            : q.kind === 'give' ? 'Send it when you can.' : `${Math.min(have, need)} / ${need}` + (absolute(q.kind) ? '' : ', counted from when they asked');
          if (!r.merged && r.giftCd > 0) c.prog.textContent += ` Next gift in ${Math.ceil(r.giftCd / ctx.speed)}s.`;
          if (!r.merged && r.trust >= giftCap(r) && q) c.prog.textContent += ' Gifts can\'t win more trust until this quest is done.';
          const foes = KIN.feuds.filter(([a, b]) => a === c.id || b === c.id).map(([a, b]) => (a === c.id ? b : a));
          const rows: [string, string][] = [['Their gift', t.gift.text.replace('{p}', pct(t.gift.per)) + (r.merged ? '' : ti >= 2 ? ' (half, as allies)' : ', from Allies on')]];
          rows.push(['Likes', t.likes]);
          if (foes.length) rows.push(['Feuds with', foes.map((f) => kinDef(f).name + (found(ctx).includes(f) ? '' : ' (not yet found)')).join(', ')]);
          c.perks.replaceChildren(...rows.map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
          c.buttons.forEach((b) => b.update(ctx));
        }
      },
    };
  })(),
};
