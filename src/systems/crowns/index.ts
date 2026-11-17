// Crowns: the Royal court gives the queen eight crowns. She wears one at a time. Each one boosts a few
// chambers, adds a rule and has a drawback. Levels are bought with royal jelly and kept through flights.
import type { GameSystem, Context } from '../../core/types';
import { el } from '../../core/ui';
import { CROWNS, NEST } from '../../data/balance';
import { drawCrown, drawFace } from './art';

type Crown = (typeof CROWNS.list)[number];
interface CrownState {
  worn: string | null;
  /** level of each crown, 1 to 10 (missing means 1) */
  lv: Record<string, number>;
  /** seconds until the queen can change crowns again */
  cd: number;
  /** flawless raids won while wearing the Chitin crown, this colony */
  trophies: number;
  /** the crown selected on the screen (not saved meaning, just remembered) */
  sel?: string;
}

const S = (ctx: Context) => ctx.state.crowns as CrownState;
const byId = (id: string | null) => CROWNS.list.find((c) => c.id === id);
export const crownLevel = (ctx: Context, id: string) => S(ctx).lv[id] ?? 1;
const boostAt = (L: number) => CROWNS.boost.at1 + (L - 1) * (CROWNS.boost.at10 - CROWNS.boost.at1) / (CROWNS.maxLevel - 1);
const tierAt = (L: number) => CROWNS.tiers.filter((t) => L >= t).length;
/** The rule's strength for a crown at its current level. */
const ruleV = (ctx: Context, c: Crown) => c.ruleV[tierAt(crownLevel(ctx, c.id))];
const worn = (ctx: Context, id: string) => S(ctx).worn === id;
const PCT = new Set(['chitin', 'petal', 'silk']);
const showV = (id: string, v: number) => (PCT.has(id) ? `${Math.round(v * 100)}%` : String(Number(v.toFixed(3))));
const ruleText = (c: Crown, v: number) => c.rule.replace('{v}', showV(c.id, v));
const roomName = (id: string) => (NEST.chambers as Record<string, { name: string }>)[id]?.name ?? id;
const upCost = (L: number) => ({ jelly: CROWNS.levelCost[L - 1] });
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Re-publish every crown mod: zero for crowns not worn, so a swap clears the old ones. */
function publish(ctx: Context) {
  const keys = new Set<string>();
  for (const c of CROWNS.list) { for (const r of c.rooms) keys.add('room:' + r); for (const k of Object.keys(c.badMods)) keys.add(k); }
  const m: Record<string, number> = Object.fromEntries([...keys].map((k) => [k, 0]));
  const c = byId(S(ctx).worn);
  if (c) {
    const b = boostAt(crownLevel(ctx, c.id));
    for (const r of c.rooms) m['room:' + r] += b;
    for (const [k, v] of Object.entries(c.badMods)) m[k] += v;
  }
  for (const [k, v] of Object.entries(m)) ctx.mods.set(k, 'crown', v);
  const s = S(ctx), cw = byId('chitin')!;
  ctx.mods.set('soldierPower', 'crown:trophies', worn(ctx, 'chitin') ? Math.min(0.2, s.trophies * ruleV(ctx, cw)) : 0);
  ctx.mods.set('narrowDoor', 'crown', worn(ctx, 'clay') ? ruleV(ctx, byId('clay')!) : 0);
  ctx.mods.set('nurseGuard', 'crown', worn(ctx, 'silk') ? ruleV(ctx, byId('silk')!) : 0);
}

/** Add workers, as many as there is living space for. Returns how many came. */
function addWorkers(ctx: Context, n: number) {
  const k = Math.max(0, Math.min(n, Math.floor(ctx.res.cap('ant') - ctx.res.amt('ant'))));
  if (k) ctx.res.add('ant', k);
  return k;
}
function remember(ctx: Context, n: number) {
  if (!worn(ctx, 'amber') || n <= 0 || !ctx.res.has('knowledge')) return;
  ctx.res.source = 'Amber crown';
  ctx.res.add('knowledge', n * ruleV(ctx, byId('amber')!));
}

export const crowns: GameSystem = {
  id: 'crowns',

  init(ctx) {
    ctx.state.crowns = { worn: null, lv: {}, cd: 0, trophies: 0 } satisfies CrownState;
    ctx.bus.on('war:won', (p: { wave: number }) => {
      const s = S(ctx);
      if (!s.worn) return;
      if (worn(ctx, 'chitin')) s.trophies++;
      if (worn(ctx, 'thorn')) {
        const got = addWorkers(ctx, Math.max(1, Math.floor((p?.wave ?? 1) / 5 * ruleV(ctx, byId('thorn')!))));
        if (got) ctx.log(`Your raiders carry home ${got} rival pupa${got > 1 ? 'e' : ''}. ${got > 1 ? 'They hatch' : 'It hatches'} as your workers.`, 'story');
      }
    });
    ctx.bus.on('expedition:return', (p: { ants?: number; lost?: number }) => {
      if (p?.ants === undefined) return; // a boat voyage
      remember(ctx, p.lost ?? 0);
      if (worn(ctx, 'petal') && p.ants - (p.lost ?? 0) > 0 && Math.random() < ruleV(ctx, byId('petal')!) && addWorkers(ctx, 1))
        ctx.log('A party comes home with a stray worker from another colony. She stays.', 'story');
    });
    ctx.bus.on('expedition:wipe', (p: { ants?: number }) => remember(ctx, p?.ants ?? 0));
    ctx.bus.on('war:fallen', (p: { n: number }) => remember(ctx, p?.n ?? 0));
  },

  isUnlocked: (ctx) => ctx.flags.has('tech:royal'),

  keep(ctx) {
    const s = S(ctx);
    return { worn: s.worn, lv: s.lv, cd: 0, trophies: 0, sel: s.sel } satisfies CrownState;
  },

  tick(ctx, dt) {
    const s = S(ctx);
    s.cd = Math.max(0, s.cd - dt);
    s.trophies ??= 0;
    publish(ctx);
    const c = byId(s.worn);
    if (!c) return;
    const v = ruleV(ctx, c);
    if (c.id === 'fungus' && ctx.res.has('fungus') && ctx.res.amt('mould') > 0 && ctx.res.amt('fungus') < ctx.res.cap('fungus')) {
      const n = Math.min(ctx.res.amt('mould'), v * dt);
      ctx.res.source = 'Fungus crown';
      ctx.res.add('mould', -n); ctx.res.add('fungus', n);
    }
    if (c.id === 'seed' && ctx.res.amt('jelly') < ctx.res.cap('jelly')) {
      const full = ['food', 'seed', 'twig', 'resin', 'crumbs'].filter((r) => ctx.res.has(r) && ctx.res.cap(r) > 0 && ctx.res.amt(r) >= ctx.res.cap(r) * 0.9).length;
      if (full) { ctx.res.source = 'Seed crown'; ctx.res.add('jelly', full * v * dt); }
    }
  },

  panel: (() => {
    let face: HTMLCanvasElement, who: HTMLElement, card: HTMLElement, wait: HTMLElement;
    const btns = new Map<string, { b: HTMLButtonElement; lv: HTMLElement }>();
    let key = '';
    let wearBtn: HTMLButtonElement, upBtn: HTMLButtonElement;
    const sel = (ctx: Context) => byId(S(ctx).sel ?? S(ctx).worn ?? 'chitin')!;
    return {
      title: 'Crowns',
      group: 'Colony',
      mount(root, ctx) {
        const ring = el('div.crownring');
        face = el('canvas.crownface', { width: 48, height: 48, 'aria-label': 'The queen' }) as HTMLCanvasElement;
        who = el('div.crownwho');
        ring.append(el('div.crownqueen', {}, face));
        CROWNS.list.forEach((c, i) => {
          const a = -Math.PI / 2 + i * Math.PI / 4;
          const cv = el('canvas', { width: 16, height: 16 }) as HTMLCanvasElement;
          drawCrown(cv, c.id);
          const lv = el('span.crownlv');
          const b = el('button.crownbtn', { type: 'button', 'aria-label': c.name, style: { left: `${50 + 37 * Math.cos(a)}%`, top: `${50 + 37 * Math.sin(a)}%` },
            onclick: () => { S(ctx).sel = c.id; key = ''; } }, cv, lv) as HTMLButtonElement;
          ring.append(b);
          btns.set(c.id, { b, lv });
        });
        card = el('div.crowncard');
        wait = el('p.muted');
        wearBtn = el('button.crownact.main', { type: 'button', onclick: () => {
          const s = S(ctx), c = sel(ctx);
          if (s.cd > 0 || s.worn === c.id) return;
          const first = !s.worn;
          s.worn = c.id; s.cd = first ? 0 : CROWNS.swapCooldown;
          if (!first) s.trophies = 0;
          publish(ctx);
          ctx.log(`The queen puts on the ${c.name.toLowerCase()}.`, 'story');
          key = '';
        } }) as HTMLButtonElement;
        upBtn = el('button.crownact', { type: 'button', onclick: () => {
          const s = S(ctx), c = sel(ctx), L = crownLevel(ctx, c.id);
          if (L >= CROWNS.maxLevel || !ctx.res.spend(upCost(L))) return;
          s.lv[c.id] = L + 1;
          publish(ctx);
          key = '';
        } }) as HTMLButtonElement;
        root.classList.add('crownpanel');
        root.append(
          el('p.flavor', {}, 'The queen wears one crown. Each one shapes the colony differently.'),
          el('div.crownscreen', {}, el('div', {}, ring, who), el('div', {}, card, wearBtn, upBtn, wait)),
        );
      },
      update(_root, ctx) {
        const s = S(ctx), c = sel(ctx), L = crownLevel(ctx, c.id);
        for (const x of CROWNS.list) {
          const { b, lv } = btns.get(x.id)!;
          b.classList.toggle('sel', x.id === c.id);
          b.classList.toggle('worn', x.id === s.worn);
          lv.textContent = 'L' + crownLevel(ctx, x.id);
        }
        // the card only changes when the selection, level or worn crown does
        const k = [c.id, L, s.worn].join('|');
        if (k !== key) {
          key = k;
          drawFace(face, s.worn);
          who.textContent = s.worn ? `Wearing the ${byId(s.worn)!.name.toLowerCase()}` : 'No crown yet';
          const t = tierAt(L), next = CROWNS.tiers[t];
          card.replaceChildren(
            el('h4', {}, c.name), el('div.crowntheme', {}, c.theme),
            el('div.crownpips', {}, ...Array.from({ length: CROWNS.maxLevel }, (_, i) => el(i < L ? 'i.on' : 'i'))),
            el('div.crownsec', {}, 'Chambers'),
            el('ul.good', {}, ...c.rooms.map((r) => el('li', {}, `${roomName(r)} +${Math.round(boostAt(L) * 100)}%`))),
            el('div.crownsec', {}, 'Rule'), el('div', {}, ruleText(c, c.ruleV[t])),
            el('div.muted.small', {}, next ? `Level ${next}: ${ruleText(c, c.ruleV[t + 1])}` : 'Rule at full strength.'),
            el('div.crownsec', {}, 'Drawback'), el('div.bad', {}, c.bad),
            ...(c.id === 'chitin' && worn(ctx, 'chitin') ? [el('div.muted.small', {}, `Soldiers now +${Math.round(Math.min(0.2, s.trophies * ruleV(ctx, c)) * 100)}%.`)] : []),
          );
        }
        const isWorn = s.worn === c.id;
        wearBtn.hidden = isWorn;
        wearBtn.disabled = s.cd > 0;
        wearBtn.textContent = s.cd > 0 ? `Wear this crown (ready in ${fmtTime(s.cd)})` : 'Wear this crown';
        upBtn.hidden = L >= CROWNS.maxLevel;
        if (L < CROWNS.maxLevel) {
          const cost = upCost(L).jelly;
          upBtn.textContent = `Upgrade to level ${L + 1} (${cost} jelly)`;
          upBtn.disabled = !ctx.res.canAfford(upCost(L));
        }
        wait.textContent = s.worn && s.cd > 0 ? `The queen can change crowns again in ${fmtTime(s.cd)}.` : s.worn ? 'Changing crowns starts a 10 minute wait before the next change.' : 'Pick her first crown. Every crown starts at level 1.';
      },
    };
  })(),
};
