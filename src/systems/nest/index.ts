// Nest building: spend resources on chambers that raise caps and add bonuses.
// Ten chambers break the surface. Each chamber type draws differently in the nest view.
import type { GameSystem, Context } from '../../core/types';
import { el, tileButton } from '../../core/ui';
import { queueOrder } from '../../core/options';
import { dockQueue } from '../../core/queue';
import type { Costs } from '../../core/resources';
import { COLONY, NEST, RESEARCH } from '../../data/balance';
import { PAL, blob, rect, setup } from '../../core/pixel';
import { drawQueen, queenSize, type QueenLook } from '../../core/queen';

type ChamberId = keyof typeof NEST.chambers;
type ChamberDef = {
  name: string; base: Costs; desc: string; needs?: string; max?: number; growth?: number;
  antCap?: number; foodCap?: number; broodCap?: number; pheroCap?: number;
  soilCap?: number; matCap?: Record<string, number>;
  foodRate?: number; defence?: number; upkeep?: number; scout?: number; knowCap?: number; elder?: number; fungusCap?: number; boats?: number; waxCap?: number;
  /** Any shared modifier, per chamber built (e.g. { 'job:forager': 0.04 }). */
  mods?: Record<string, number>;
};
const DEFS = NEST.chambers as Record<ChamberId, ChamberDef>;
/** How the chamber buttons are grouped on the Nest tab. Anything not listed goes in the last group. */
/** Walking ants: a soft amber-tan, so they read as ants instead of white specks. */
const ANT_TINT = '#d6b98c';
const SECTIONS: [string, string[]][] = [
  ['Living space', ['tunnel', 'hall', 'gallery', 'paperhall']],
  ['Brood', ['brood', 'nursery', 'warmth']],
  ['Stores', ['store', 'storeroom', 'twigloft', 'seedvault', 'resinvat', 'silkroom', 'waxworks', 'pantry']],
  ['Food', ['granary', 'cistern', 'rest', 'midden', 'fungus', 'sporecellar', 'stable']],
  ['Knowledge', ['library', 'memory']],
  ['Work', ['spoil', 'gland', 'chartroom', 'harbour', 'boatshed']],
  ['War', ['barracks', 'husks', 'training', 'armory', 'den']],
];
const IDS = Object.keys(DEFS) as ChamberId[];

interface NestState { built: Record<string, number>; order: ChamberId[]; queue?: ChamberId[] }
const S = (ctx: Context) => ctx.state.nest as NestState;

const count = (ctx: Context, id: ChamberId) => S(ctx).built[id] ?? 0;
const costOf = (ctx: Context, id: ChamberId): Costs => {
  const cheaper = Math.max(0.5, 1 + ctx.mods.get('chamberCost'));
  return Object.fromEntries(Object.entries(DEFS[id].base).map(([r, v]) => [r, Math.ceil(v * Math.pow(DEFS[id].growth ?? NEST.costGrowth, count(ctx, id)) * cheaper)]));
};
const totalChambers = (ctx: Context) => Object.values(S(ctx).built).reduce((a, b) => a + b, 0);

/** needs: a flag, "res:<id>" (resource seen) or "chambers:<n>". */
function visible(ctx: Context, id: ChamberId) {
  const n = DEFS[id].needs;
  if (!n) return true;
  if (n.startsWith('res:')) { const r = n.slice(4); return ctx.res.has(r) && ctx.res.get(r).seen; }
  if (n.startsWith('chambers:')) return totalChambers(ctx) >= Number(n.slice(9));
  return ctx.flags.has(n);
}

/** Building queue slots: 2 from Digging plans, more from the Master plans lineage perk. */
export const queueSlots = (ctx: Context) => (ctx.flags.has('tech:plans') ? 2 + ctx.mods.get('queueSlots') : 0);
dockQueue('Building queue', 0, (strip, ctx) => strip.update(queueSlots(ctx), (S(ctx).queue ??= []), (id) => DEFS[id as ChamberId].name, undefined, ctx, (id) => costOf(ctx, id as ChamberId)));
const totalCost = (c: Costs) => Object.values(c).reduce((a, b) => a + b, 0);
const fits = (ctx: Context, c: Costs) => Object.entries(c).every(([r, n]) => ctx.res.has(r) && ctx.res.cap(r) >= n);
const canBuild = (ctx: Context, id: ChamberId) => visible(ctx, id) && (!DEFS[id].max || count(ctx, id) < DEFS[id].max!);

function build(ctx: Context, id: ChamberId) {
  const def = DEFS[id];
  S(ctx).built[id] = count(ctx, id) + 1;
  S(ctx).order.push(id);
  if (id === 'brood' && !ctx.flags.has('chamber:brood')) {
    ctx.flags.add('chamber:brood');
    ctx.log('A warm brood chamber is finished. Some workers could become nurses.');
  }
  if (count(ctx, id) === 1 && id !== 'tunnel' && id !== 'brood') ctx.log(`The first ${def.name.toLowerCase()} is dug.`, 'info');
  applyEffects(ctx);
}

/** Dig at most one queued chamber per tick: the first in line, or the cheapest affordable one. */
function runQueue(ctx: Context) {
  const q = S(ctx).queue;
  if (!q?.length) return;
  for (let i = q.length - 1; i >= 0; i--) if (!canBuild(ctx, q[i]) || !fits(ctx, costOf(ctx, q[i]))) q.splice(i, 1);
  if (!q.length) return;
  let pick = 0;
  if (queueOrder() === 'cheapest') {
    pick = -1;
    let best = Infinity;
    q.forEach((id, i) => { const c = costOf(ctx, id); if (ctx.res.canAfford(c) && totalCost(c) < best) { best = totalCost(c); pick = i; } });
    if (pick < 0) return;
  }
  const id = q[pick];
  if (!ctx.res.spend(costOf(ctx, id))) return;
  q.splice(pick, 1);
  build(ctx, id);
}

/** Storage techs (Packed walls, Memory songs, Resin lining) multiply what some chambers store. */
const storeMult = (ctx: Context, id: ChamberId) => 1 + Object.entries(NEST.storageTechs)
  .reduce((t, [tech, ids]) => t + (ctx.flags.has('tech:' + tech) && ids.includes(id) ? NEST.storageBoost : 0), 0);
/** Housing techs multiply all living space from chambers. */
const roominess = (ctx: Context) => 1 + Object.entries(NEST.housingTechs).reduce((t, [tech, b]) => t + (ctx.flags.has('tech:' + tech) ? b : 0), 0) + ctx.mods.get('livingSpace');
const num = (n: number) => String(Number(n.toFixed(2)));
/** A chamber's tooltip with the numbers it really gives now, after techs. */
function liveDesc(ctx: Context, id: ChamberId) {
  const m = storeMult(ctx, id);
  let d = DEFS[id].desc.replace(/\+(\d+) living space/, (_, n) =>
    `+${num((Number(n) + (id === 'tunnel' && ctx.flags.has('tech:widetunnels') ? NEST.wideTunnels : 0)) * roominess(ctx))} living space`);
  if (m !== 1) d = d.replace(/\+(\d+)(?![\d.]*%)(?! living)/g, (_, n) => `+${num(Number(n) * m)}`);
  // job slots this room gives (see COLONY.jobSlots)
  for (const [job, [room, per]] of Object.entries(COLONY.jobSlots)) if (room === id) d += `, +${per} ${job} slots`;
  return d;
}

function applyEffects(ctx: Context) {
  const mult = (id: ChamberId) => storeMult(ctx, id);
  const sum = (k: keyof ChamberDef) => IDS.reduce((t, id) => t + ((DEFS[id][k] as number | undefined) ?? 0) * count(ctx, id) * (k.endsWith('Cap') ? mult(id) : 1), 0);
  const roomier = roominess(ctx);
  const wide = ctx.flags.has('tech:widetunnels') ? NEST.wideTunnels * count(ctx, 'tunnel') : 0;
  ctx.res.setCapBonus('ant', 'nest', Math.floor((sum('antCap') + wide) * roomier));
  ctx.res.setCapBonus('food', 'nest', sum('foodCap'));
  ctx.res.setCapBonus('egg', 'nest', sum('broodCap'));
  ctx.res.setCapBonus('soil', 'nest', totalChambers(ctx) * NEST.soilPerChamber + sum('soilCap'));
  for (const r of Object.keys(NEST.baseMaterialCap)) {
    if (ctx.res.has(r)) ctx.res.setCapBonus(r, 'nest', IDS.reduce((t, id) => t + (DEFS[id].matCap?.[r] ?? 0) * count(ctx, id) * mult(id), 0));
  }
  if (ctx.res.has('pheromone')) ctx.res.setCapBonus('pheromone', 'nest', sum('pheroCap'));
  ctx.mods.set('defence', 'nest', sum('defence'));
  ctx.mods.set('upkeep', 'nest', -sum('upkeep'));
  ctx.mods.set('job:scout', 'nest', sum('scout'));
  ctx.mods.set('job:elder', 'nest', sum('elder'));
  if (ctx.res.has('knowledge')) ctx.res.setCapBonus('knowledge', 'nest', sum('knowCap'));
  if (ctx.res.has('fungus')) ctx.res.setCapBonus('fungus', 'nest', sum('fungusCap'));
  if (ctx.res.has('wax')) ctx.res.setCapBonus('wax', 'nest', sum('waxCap'));
  ctx.mods.set('boatSlots', 'nest', sum('boats'));
  const m: Record<string, number> = {};
  for (const id of IDS) for (const [k, v] of Object.entries(DEFS[id].mods ?? {})) m[k] = (m[k] ?? 0) + v * count(ctx, id);
  for (const id of IDS) for (const k of Object.keys(DEFS[id].mods ?? {})) ctx.mods.set(k, 'nest:mods', m[k] ?? 0);
}

export const nest: GameSystem = {
  id: 'nest',

  init(ctx) {
    ctx.res.define({ id: 'soil', name: 'Soil', cap: NEST.baseSoilCap, order: 2 });
    ctx.state.nest = { built: Object.fromEntries(IDS.map((i) => [i, 0])), order: [], queue: [] } satisfies NestState;
    ctx.bus.on('loaded', () => applyEffects(ctx));
  },

  isUnlocked: (ctx) => ctx.flags.has('tech:digging'),

  tick(ctx, dt) {
    applyEffects(ctx);
    if (queueSlots(ctx)) runQueue(ctx);
    const g = count(ctx, 'granary');
    if (g) ctx.res.add('food', g * (DEFS.granary.foodRate ?? 0) * dt);
    if (!ctx.flags.has('surface') && ctx.flags.has('tech:surface') && totalChambers(ctx) >= NEST.surfaceAtChambers) {
      ctx.flags.add('surface');
      ctx.log('A digger pushes upward and the soil gives way. Light. Wind. The surface.');
      ctx.log('A new tab has opened: Surface.', 'info');
    }
  },

  panel: (() => {
    const buttons = new Map<ChamberId, ReturnType<typeof tileButton>>();
    let canvas: HTMLCanvasElement, progress: HTMLElement, grid: HTMLElement;
    return {
      title: 'Nest',
      group: 'Nest',
      mount(root, ctx) {
        canvas = el('canvas.nestview', { width: 320, height: 160, 'aria-label': 'Cross-section of your nest' }) as HTMLCanvasElement;
        progress = el('p.muted.neststat');
        grid = el('div.tilegroups.compact');
        const sections = SECTIONS.map(([name, ids]) => {
          const tiles = el('div.tiles'), box = el('div.tilegroup', { hidden: true }, el('div.tilehead', {}, name), tiles);
          grid.append(box);
          return { box, tiles, ids };
        });
        for (const id of IDS) {
          const def = DEFS[id];
          const btn = tileButton({
            ctx, label: def.name, effect: () => liveDesc(ctx, id), count: () => count(ctx, id),
            costs: () => costOf(ctx, id),
            enabled: (c) => !def.max || count(c, id) < def.max,
            onBuy: (c) => build(c, id),
            onQueue: (c) => {
              const s = S(c);
              s.queue ??= [];
              if (!queueSlots(c) || s.queue.length >= queueSlots(c) || !canBuild(c, id) || !fits(c, costOf(c, id))) return false;
              s.queue.push(id);
              return true;
            },
          });
          btn.root.hidden = true;
          (sections.find((x) => x.ids.includes(id)) ?? sections[sections.length - 1]).tiles.append(btn.root);
          buttons.set(id, btn);
        }
        canvas.addEventListener('click', (ev) => {
          const r = canvas.getBoundingClientRect();
          const x = (ev.clientX - r.left) * (canvas.width / r.width), y = (ev.clientY - r.top) * (canvas.height / r.height);
          const i = hitSpots.findIndex((p) => Math.abs(p.x - x) <= 20 && Math.abs(p.y - y) <= 8);
          const order = S(ctx).order;
          if (i < 0 || i === picked) { picked = null; return; }
          if (picked === null) { picked = i; return; }
          [order[picked], order[i]] = [order[i], order[picked]]; // purely cosmetic: only the drawing reads the order
          picked = null;
        });
        const scroller = el('div.nestscroll', { tabindex: '0', 'aria-label': 'Nest view, scrolls when the nest is deep' }, canvas);
        let whole = false;
        try { whole = localStorage.getItem('formicarium-whole-nest') === '1'; } catch { /* storage blocked */ }
        scroller.classList.toggle('whole', whole);
        const toggle = el('input', { type: 'checkbox' }) as HTMLInputElement;
        toggle.checked = whole;
        toggle.addEventListener('change', () => {
          scroller.classList.toggle('whole', toggle.checked);
          try { localStorage.setItem('formicarium-whole-nest', toggle.checked ? '1' : '0'); } catch { /* storage blocked */ }
        });
        root.classList.add('nestpanel');
        root.append(el('p.flavor', {}, 'Chambers carved from the dark. Each one makes room for more.'), progress, grid,
          el('div.row', {}, el('label.muted', {}, toggle, ' Draw entire nest'), el('span.muted', {}, '|'), el('span.muted', {}, 'Click a chamber, then another, to swap them.')), scroller);
      },
      update(_root, ctx) {
        const slots = queueSlots(ctx);
        const q = S(ctx).queue ?? [];
        for (const id of IDS) {
          const b = buttons.get(id)!;
          b.root.classList.toggle('queues', slots > q.length);
          b.root.hidden = !visible(ctx, id);
          b.update(ctx);
        }
        grid.querySelectorAll<HTMLElement>('.tilegroup').forEach((g) => { g.hidden = !Array.from(g.querySelectorAll<HTMLElement>('.tilewrap')).some((t) => !t.hidden); });
        const n = totalChambers(ctx);
        const bits = [ctx.flags.has('surface') ? `${n} chambers`
          : ctx.flags.has('tech:surface') ? `${n} of ${NEST.surfaceAtChambers} chambers to the surface` : `${n} chambers. Research Upward tunnels to reach the surface`];
        const def = ctx.mods.get('defence'), up = -ctx.mods.get('upkeep');
        if (def) bits.push(`defence ${def}`);
        if (up) bits.push(`upkeep reduced ${Math.round(up * 100)}%`);
        if (count(ctx, 'granary')) bits.push(`granaries +${(count(ctx, 'granary') * (DEFS.granary.foodRate ?? 0)).toFixed(2)} food/s`);
        progress.textContent = bits.join(' · ');
        drawNest(canvas, ctx);
      },
    };
  })(),
};

// ---- the cross-section view: flat placeholder art drawn in code ----
const LANES = [-1, 1, -2, 2, -3, 3];  // three chambers each side, nearest first
const LANE_X = [0, 36, 86, 134];      // distance from the shaft for lanes 1..3
/** When each chamber (by build order) first appeared on screen, so new ones can fade in. */
const bornAt: number[] = [];
const FADE_MS = 1400;
/** 4x4 ordered-dither thresholds: a new chamber appears pixel by pixel out of the soil (no transparency). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const ROW_H = 22;
/** Blend two #rrggbb colours (f = 0 gives a, 1 gives b), for glows that fade without transparency. */
function mix(a: string, b: string, f: number) {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * Math.max(0, Math.min(1, f))).toString(16).padStart(2, '0')).join('');
}
// colours for the later chambers, kept here so the shared palette stays small
const TWIG = '#7a5a38', RESIN_DARK = '#6b3f16', WARM_DIM = '#4a2a18', DEW = '#b8d4e0', MEMORY = '#8fb4c9', JELLY = '#e8d27a';
const DEEP = '#1f3442', LEAF = '#4f6a2e', LEAF_RIB = '#6f8a3a';
const CHITIN = '#a8452e', CAP = '#8a6a5a', APHID = '#a8c060', CRUMB = '#c8a878', CRUST = '#9a6e40', PAPER = '#9e988c';
/** 0..1 and back, smoothly, over `period` seconds. */
const wave = (t: number, period: number, phase = 0) => 0.5 - 0.5 * Math.cos(((t + phase) / period) * Math.PI * 2);

let seenOnce = false;
let animT = 0, animLast = performance.now();
/** Where each chamber was last drawn (by build-order index), for clicking; and the one picked to swap. */
let hitSpots: { x: number; y: number }[] = [];
let picked: number | null = null;

/** How far the queen has come: she fattens as this colony grows, and changes for good with each
 *  flight and, from the Age of Settlement on, each new age (Orbit is the last form). */
function queenLook(ctx: Context): QueenLook {
  const flights = (ctx.state.lineage as { flights?: number } | undefined)?.flights ?? 0;
  const ageId = (ctx.state.research as { age?: string } | undefined)?.age;
  const ageIdx = Math.max(0, RESEARCH.ages.findIndex((a) => a.id === ageId));
  const tier = Math.min(6, Math.max(flights >= 3 ? 2 : flights >= 1 ? 1 : 0, ageIdx >= 2 ? ageIdx + 1 : 0));
  return { tier, fat: Math.min(1, ctx.res.amt('ant') / 120) };
}
function drawNest(cv: HTMLCanvasElement, ctx: Context) {
  const order = S(ctx).order;
  const rows = Math.ceil(order.length / LANES.length);
  const look = queenLook(ctx);
  const qs = queenSize(look);
  const H = Math.max(Math.min(720, 70 + rows * ROW_H), 30 + rows * ROW_H + 8 + 2 + qs.h + 6);
  if (cv.height !== H) cv.height = H;
  const c = setup(cv);
  const W = cv.width;
  // animation clock that stops while the game is paused
  const now0 = performance.now();
  if (!ctx.paused) animT += Math.min(0.25, (now0 - animLast) / 1000);
  animLast = now0;
  const t = animT;
  const surface = ctx.flags.has('surface');
  const top = surface ? 14 : 0;

  rect(c, 0, 0, W, H, PAL.soil);
  if (surface) {
    rect(c, 0, 0, W, 10, PAL.grass);
    rect(c, W / 2 - 10, 6, 20, 4, PAL.dirt); // entrance mound
  }

  const shaftX = W / 2;
  const bottom = 30 + rows * ROW_H + 8;
  rect(c, shaftX - 3, surface ? 0 : 16, 6, bottom - (surface ? 0 : 16), PAL.hole);
  const qy = bottom + 2 + Math.ceil(qs.h / 2);
  blob(c, shaftX, qy, Math.max(18, Math.ceil(qs.w / 2) + 4), Math.max(6, Math.ceil(qs.h / 2) + 2), PAL.hole); // the queen's cell

  const fillFood = ctx.res.amt('food') / Math.max(1, ctx.res.cap('food'));
  const broodCount = ctx.res.amt('egg') + ctx.res.amt('larva');
  const soldiers = ctx.state.jobs?.assigned?.soldier ?? 0;
  const counts: Record<string, number> = {};
  const spots: { x: number; y: number }[] = []; // where each chamber is, for the walking ants

  const placed = order.slice(0, rows * LANES.length);
  const where = (i: number) => ({
    y: top + 24 + Math.floor(i / LANES.length) * ROW_H,
    cx: shaftX + Math.sign(LANES[i % LANES.length]) * LANE_X[Math.abs(LANES[i % LANES.length])],
  });
  // every connecting tunnel first, so a far chamber's tunnel never paints over a near chamber
  placed.forEach((_, i) => { const { y, cx } = where(i); rect(c, Math.min(shaftX, cx), y - 1, Math.abs(cx - shaftX), 3, PAL.hole); });
  placed.forEach((id, i) => {
    const k = (counts[id] = (counts[id] ?? 0) + 1) - 1;
    const lane = LANES[i % LANES.length];
    const { y, cx } = where(i);
    spots.push({ x: cx, y });

    switch (id) {
      case 'tunnel': { // a resting chamber: a low room with a few workers curled up asleep
        blob(c, cx, y, 15, 5, PAL.hole);
        for (let e = 0; e < 3; e++) { const sx = cx - 9 + e * 7 + ((k + e) % 2); rect(c, sx, y + 1, 3, 2, ANT_TINT); rect(c, sx + 3, y + 2, 1, 1, ANT_TINT); }
        break;
      }
      case 'brood': { // eggs in rows, more as the brood grows
        blob(c, cx, y, 16, 5, PAL.hole);
        const n = Math.min(10, Math.ceil(broodCount / Math.max(1, count(ctx, 'brood'))) || 1);
        for (let e = 0; e < n; e++) rect(c, cx - 12 + (e % 5) * 5, y - 2 + Math.floor(e / 5) * 3, 2, 2, PAL.bone);
        break;
      }
      case 'store': { // a pile of food that rises and falls with your stores
        blob(c, cx, y, 16, 5, PAL.hole);
        const h = Math.max(1, Math.round(fillFood * 5));
        rect(c, cx - 10, y + 4 - h, 20, h, PAL.food);
        break;
      }
      case 'granary': { // seeds with sprouts that sway
        blob(c, cx, y, 15, 5, PAL.hole);
        for (let e = 0; e < 6; e++) rect(c, cx - 10 + e * 4, y + 2, 2, 2, PAL.seed);
        for (let e = 0; e < 3; e++) { const w = wave(t, 3, e * 0.9 + k); rect(c, cx - 8 + e * 8, y - 1, 1, 3, PAL.food); rect(c, cx - 8 + e * 8, y - 3, 1, 2, mix(PAL.hole, PAL.food, 1 - w)); rect(c, cx - 7 + e * 8, y - 3, 1, 2, mix(PAL.hole, PAL.food, w)); }
        break;
      }
      case 'gallery': // a big chamber sealed with an amber resin rim
        blob(c, cx, y, 22, 7, PAL.amber);
        blob(c, cx, y, 19, 5, PAL.hole);
        break;
      case 'gland': { // a scent chamber whose motes slowly glow and fade, out of step with each other
        blob(c, cx, y, 14, 5, PAL.hole);
        const glow = (phase: number) => mix(PAL.hole, PAL.scent, 0.5 - 0.5 * Math.cos((t * 0.8 + k * 0.37 + phase) * Math.PI * 2 / 2.4));
        rect(c, cx - 1, y - 1, 2, 2, mix(PAL.hole, PAL.scent, 0.55 + 0.45 * Math.sin((t * 0.8 + k) * Math.PI * 2 / 3)));
        rect(c, cx - 7, y - 3, 2, 2, glow(0));
        rect(c, cx + 5, y + 1, 2, 2, glow(1.2));
        rect(c, cx + 9, y - 2, 1, 1, glow(0.6));
        rect(c, cx - 10, y + 1, 1, 1, glow(1.8));
        break;
      }
      case 'barracks': { // a guard post with soldiers standing in line
        rect(c, cx - 16, y - 5, 32, 10, PAL.hole);
        rect(c, cx - 16, y - 6, 32, 1, PAL.dirt);
        const n = Math.min(6, Math.ceil(soldiers / Math.max(1, count(ctx, 'barracks'))));
        for (let e = 0; e < n; e++) rect(c, cx - 13 + e * 5, y - 2, 2, 4, PAL.you);
        break;
      }
      case 'fungus': { // a fungus bed: green tufts on a mat of cut leaves, grey if mould has it
        blob(c, cx, y, 16, 5, PAL.hole);
        rect(c, cx - 12, y + 1, 24, 2, PAL.grass);
        const mouldy = k < (ctx.state.garden?.mould ?? 0);
        for (let e = 0; e < 5; e++) { const col = mouldy ? '#8a8a80' : PAL.food; rect(c, cx - 10 + e * 5, y - 2, 3, 3, col); rect(c, cx - 10 + e * 5, y - 3, 3, 1, mix(PAL.hole, col, mouldy ? 1 : 0.35 + 0.65 * wave(t, 4, e * 0.8 + k))); }
        break;
      }
      case 'midden': // a growing heap of waste
        blob(c, cx, y, 15, 5, PAL.hole);
        for (let r = 0; r < 5; r++) rect(c, cx - 2 - r * 2, y - 2 + r, 4 + r * 4, 1, PAL.waste);
        break;
      case 'silkroom': // a silk loft: pale threads hung from the roof
        blob(c, cx, y, 15, 5, PAL.hole);
        for (let e = 0; e < 6; e++) { const h = 3 + ((e + k) % 3); rect(c, cx - 11 + e * 4, y - 4, 1, h, PAL.bone); rect(c, cx - 11 + e * 4, y - 4 + h, 1, 1, mix(PAL.hole, PAL.bone, wave(t, 5, e * 0.7))); }
        break;
      case 'storeroom': { // stacked stores: twig bundles, a seed heap and a bead of resin
        rect(c, cx - 17, y - 5, 34, 10, PAL.hole);
        for (let e = 0; e < 3; e++) rect(c, cx - 15, y + 2 - e * 2, 12, 1, PAL.dirt);
        for (let e = 0; e < 4; e++) rect(c, cx - 1 + (e % 2) * 3, y + 1 - Math.floor(e / 2) * 2, 2, 2, PAL.seed);
        rect(c, cx + 9, y, 4, 3, PAL.amber);
        break;
      }
      case 'library': // the hall of elders: rows of pale scent marks on the walls
        blob(c, cx, y, 17, 6, PAL.hole);
        for (let r = 0; r < 2; r++) for (let e = 0; e < 6; e++) if ((e + r + k) % 3) rect(c, cx - 12 + e * 5, y - 3 + r * 4, 3, 1, PAL.bone);
        break;
      case 'husks': // walls shored with raider shells
        blob(c, cx, y, 17, 6, PAL.hole);
        for (let e = 0; e < 4; e++) { rect(c, cx - 15 + e * 9, y - 5, 6, 2, PAL.rival); rect(c, cx - 14 + e * 9, y + 4, 5, 2, PAL.rival); }
        break;
      case 'harbour': { // a harbour: a still pool with a twig jetty, a leaf raft tied up, and ripples that come and go
        rect(c, cx - 18, y - 5, 36, 11, PAL.hole);
        rect(c, cx - 18, y + 1, 36, 5, PAL.water);
        rect(c, cx - 18, y + 4, 36, 2, DEEP);
        const side = lane > 0 ? -1 : 1, jx = cx + side * 12; // the jetty sits on the side nearest the shaft
        rect(c, side > 0 ? jx - 6 : jx, y, 7, 1, TWIG);
        for (const px of [jx - 5 * side, jx]) rect(c, px, y + 1, 1, 4, TWIG);
        const rx = cx - 4 - side * 3; // the raft: a leaf with a midrib and upturned tips
        rect(c, rx, y, 10, 1, PAL.grass);
        rect(c, rx - 1, y - 1, 1, 1, PAL.grass); rect(c, rx + 10, y - 1, 1, 1, PAL.grass);
        rect(c, rx + 1, y, 8, 1, LEAF);
        rect(c, rx + 2, y - 1, 6, 1, LEAF_RIB);
        for (let e = 0; e < 3; e++) rect(c, cx - 14 + e * 10, y + 2 + (e % 2), 4, 1, mix(PAL.water, DEW, 0.55 * wave(t, 5, e * 1.7 + k)));
        rect(c, rx + 1, y + 1, 8, 1, mix(PAL.water, DEEP, 0.6)); // the raft's shadow
        break;
      }
      case 'hall': { // a long sleeping hall: a wide low chamber with resting workers in a row
        rect(c, cx - 18, y - 3, 36, 7, PAL.hole);
        for (let i = 0; i < 6; i++) rect(c, cx - 15 + i * 6, y + 1, 3, 1, PAL.bone);
        break;
      }
      case 'waxworks': // a wax store: a honeycomb of yellow cells
        blob(c, cx, y, 15, 5, PAL.hole);
        for (let r = 0; r < 2; r++) for (let e = 0; e < 4; e++) rect(c, cx - 10 + e * 6 + r * 3, y - 3 + r * 4, 4, 3, PAL.seed);
        break;
      case 'spoil': { // a digging gallery: loose soil piled up the far wall, a few clods rolled down
        blob(c, cx, y, 15, 5, PAL.hole);
        const mx = cx + (lane > 0 ? 6 : -6);
        for (let r = 0; r < 5; r++) rect(c, mx - 1 - r, y - 3 + r, 2 + r * 2, 1, PAL.dirt);
        rect(c, cx - (lane > 0 ? 6 : -5), y + 3, 2, 1, PAL.dirt); rect(c, cx - (lane > 0 ? 10 : -10), y + 3, 1, 1, PAL.dirt);
        break;
      }
      case 'rest': { // a forager's rest: leaf mats with workers curled up on them
        blob(c, cx, y, 16, 5, PAL.hole);
        for (let e = 0; e < 3; e++) {
          rect(c, cx - 13 + e * 9, y + 2, 8, 2, PAL.grass);
          rect(c, cx - 11 + e * 9, y + 1, 4, 1, PAL.bone);
        }
        break;
      }
      case 'warmth': { // a warming chamber: warm stones that slowly glow and cool, with eggs set on top
        blob(c, cx, y, 15, 5, PAL.hole);
        for (let e = 0; e < 4; e++) {
          const w = 0.5 - 0.5 * Math.cos((t * 0.5 + e * 0.7 + k) * Math.PI * 2 / 4);
          rect(c, cx - 11 + e * 6, y + 2, 4, 2, mix(WARM_DIM, PAL.amber, 0.35 + 0.45 * w));
          rect(c, cx - 10 + e * 6, y, 2, 2, PAL.bone);
        }
        break;
      }
      case 'cistern': { // a dew cistern: a round pool, and a drop that swells on the roof and fades into the water
        blob(c, cx, y, 12, 6, PAL.hole);
        rect(c, cx - 9, y + 1, 18, 4, PAL.water);
        rect(c, cx - 7, y + 1, 5, 1, mix(PAL.water, PAL.bone, 0.35));
        const p = ((t * 0.3 + k * 0.41) % 1);
        const swell = p < 0.7 ? p / 0.7 : 1 - (p - 0.7) / 0.3;
        rect(c, cx + 3, y - 5, 1, 1, mix(PAL.hole, DEW, 0.3 + 0.6 * swell));
        rect(c, cx + 3, y - 4, 1, 1, mix(PAL.hole, DEW, Math.max(0, swell * 1.2 - 0.3)));
        const ring = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 0;
        rect(c, cx + 1, y + 1, 5, 1, mix(PAL.water, DEW, 0.6 * ring));
        break;
      }
      case 'twigloft': { // a twig loft: bundles of twigs stacked crosswise, tied in the middle
        rect(c, cx - 17, y - 5, 34, 10, PAL.hole);
        for (let r = 0; r < 4; r++) rect(c, cx - 15 + (r % 2) * 2, y + 3 - r * 2, 26, 1, TWIG);
        rect(c, cx - 4, y - 4, 1, 8, PAL.bone); rect(c, cx + 5, y - 4, 1, 8, PAL.bone);
        break;
      }
      case 'seedvault': { // a seed vault: a stone-lined cell holding a heap of seeds
        rect(c, cx - 15, y - 5, 30, 10, PAL.stone);
        rect(c, cx - 13, y - 4, 26, 8, PAL.hole);
        for (let r = 0; r < 3; r++) for (let e = 0; e <= r * 2; e++) rect(c, cx - 2 - r * 3 + e * 3, y - 2 + r * 2, 2, 2, PAL.seed);
        break;
      }
      case 'resinvat': { // a resin vat: a pot of resin whose surface catches the light now and then
        blob(c, cx, y, 14, 5, PAL.hole);
        rect(c, cx - 7, y - 3, 14, 7, RESIN_DARK);
        rect(c, cx - 8, y - 3, 16, 1, PAL.amber);
        const sheen = 0.5 - 0.5 * Math.cos((t * 0.35 + k * 0.5) * Math.PI * 2 / 3);
        rect(c, cx - 5, y - 1, 4, 1, mix(RESIN_DARK, PAL.amber, 0.25 + 0.6 * sheen));
        rect(c, cx + 2, y + 1, 3, 1, mix(RESIN_DARK, PAL.amber, 0.25 + 0.6 * (1 - sheen)));
        break;
      }
      case 'memory': { // a memory vault: tall columns of stored scent, pale blue
        rect(c, cx - 16, y - 5, 32, 10, PAL.hole);
        for (let e = 0; e < 6; e++) { const h = 4 + ((e * 3 + k) % 4); rect(c, cx - 14 + e * 5, y + 4 - h, 3, h, MEMORY); }
        break;
      }
      case 'nursery': { // the royal nursery: three alcoves, each with a big royal larva and a bead of jelly
        blob(c, cx, y, 18, 6, PAL.hole);
        for (let e = 0; e < 3; e++) {
          const x = cx - 13 + e * 10;
          rect(c, x, y - 1, 6, 4, PAL.bone); rect(c, x + 1, y - 2, 4, 1, PAL.bone);
          rect(c, x + 6, y + 2, 2, 1, JELLY);
        }
        break;
      }
      case 'chartroom': { // a chart room: a little map of the garden laid out in tiles on the floor
        rect(c, cx - 16, y - 5, 32, 10, PAL.hole);
        const tiles = [PAL.grass, PAL.dirt, PAL.stone, PAL.water, PAL.grass, PAL.grass, PAL.water, PAL.dirt, PAL.paved, PAL.grass];
        for (let r = 0; r < 2; r++) for (let e = 0; e < 5; e++) rect(c, cx - 12 + e * 5, y - 3 + r * 4, 4, 3, tiles[(r * 5 + e + k) % tiles.length]);
        rect(c, cx - 12 + 5 * ((k + 1) % 5), y - 3, 1, 1, PAL.you); // the nest, marked
        break;
      }
      case 'training': { // a training ground: two soldiers sparring over a packed floor, slowly stepping in and out
        rect(c, cx - 17, y - 5, 34, 10, PAL.hole);
        rect(c, cx - 15, y + 3, 30, 1, PAL.dirt);
        const s = 0.5 - 0.5 * Math.cos((t * 0.6 + k) * Math.PI * 2 / 2.5);
        // each soldier crossfades between a back step and a forward step
        for (const [x0, dirn] of [[cx - 7, 1], [cx + 5, -1]] as const) {
          rect(c, x0, y - 1, 2, 4, mix(PAL.hole, PAL.you, 1 - s));
          rect(c, x0 + dirn * 2, y - 1, 2, 4, mix(PAL.hole, PAL.you, s));
        }
        rect(c, cx + 12, y - 4, 1, 7, TWIG); rect(c, cx + 11, y - 2, 3, 1, TWIG); // a practice post
        break;
      }
      case 'armory': { // a chitin armory: red-brown plates hung on a rack
        rect(c, cx - 16, y - 5, 32, 10, PAL.hole);
        rect(c, cx - 14, y - 4, 28, 1, TWIG);
        for (let e = 0; e < 5; e++) { rect(c, cx - 13 + e * 6, y - 3, 4, 4, CHITIN); rect(c, cx - 12 + e * 6, y + 1, 2, 1, CHITIN); }
        break;
      }
      case 'sporecellar': { // a spore cellar: pale mushrooms in the dark, with spores drifting up and fading
        blob(c, cx, y, 15, 5, PAL.hole);
        const hs = [3, 5, 2, 4, 3];
        hs.forEach((h, e) => { const x = cx - 11 + e * 5; rect(c, x + 1, y + 4 - h, 1, h, PAL.bone); rect(c, x - 1, y + 3 - h, 5, 2, CAP); });
        for (let e = 0; e < 3; e++) {
          const p = (t * 0.15 + e / 3 + k * 0.29) % 1;
          rect(c, cx - 8 + e * 7, Math.round(y - 1 - p * 4), 1, 1, mix(PAL.hole, PAL.bone, 0.7 * Math.sin(p * Math.PI)));
        }
        break;
      }
      case 'stable': { // an aphid stable: a twig fence and green aphids grazing on a root
        blob(c, cx, y, 17, 6, PAL.hole);
        rect(c, cx - 14, y + 3, 28, 1, TWIG);
        for (let e = 0; e < 5; e++) rect(c, cx - 14 + e * 7, y + 1, 1, 3, TWIG);
        rect(c, cx - 12, y - 4, 24, 1, PAL.dirt); // the root along the roof
        for (let e = 0; e < 3; e++) { const x = cx - 9 + e * 7; rect(c, x, y - 2, 3, 2, APHID); rect(c, x + 1, y - 3, 1, 1, APHID); }
        break;
      }
      case 'boatshed': { // a boat shed: a bark hull resting upside down on two blocks
        rect(c, cx - 17, y - 5, 34, 10, PAL.hole);
        rect(c, cx - 12, y - 3, 24, 1, PAL.dirt);
        rect(c, cx - 11, y - 2, 22, 2, TWIG);
        rect(c, cx - 8, y, 16, 1, TWIG);
        rect(c, cx - 5, y + 1, 10, 1, TWIG);
        rect(c, cx - 9, y + 2, 3, 3, PAL.dirt); rect(c, cx + 6, y + 2, 3, 3, PAL.dirt);
        rect(c, cx, y - 5, 1, 2, TWIG); // a stub of mast, the sail folded beside it
        rect(c, cx + 2, y - 5, 5, 2, LEAF);
        break;
      }
      case 'den': { // the champion's den: one big ant, with a fang hung on the wall as a trophy
        blob(c, cx, y, 17, 6, PAL.hole);
        rect(c, cx - 8, y, 4, 3, PAL.you); rect(c, cx - 4, y + 1, 3, 2, PAL.you); rect(c, cx - 1, y, 4, 3, PAL.you); // abdomen, waist, head
        rect(c, cx + 3, y + 1, 2, 1, PAL.you); // mandibles
        for (let e = 0; e < 3; e++) rect(c, cx - 6 + e * 3, y + 3, 1, 2, PAL.you); // legs
        rect(c, cx + 9, y - 4, 1, 4, PAL.bone); rect(c, cx + 10, y - 4, 1, 2, PAL.bone);
        break;
      }
      case 'pantry': { // a crumb pantry: a heap of bread crumbs and a sugar cube
        rect(c, cx - 16, y - 5, 32, 10, PAL.hole);
        const sz = [3, 2, 4, 2, 3, 2, 3];
        sz.forEach((s, e) => rect(c, cx - 13 + e * 3, y + 4 - s - (e % 2), s, s, e % 3 ? CRUMB : CRUST));
        rect(c, cx + 9, y, 4, 4, PAL.bone);
        break;
      }
      case 'paperhall': { // a paper hall: chewed-paper walls dividing many small rooms
        rect(c, cx - 18, y - 6, 36, 12, PAPER);
        for (let r = 0; r < 2; r++) for (let e = 0; e < 5; e++) rect(c, cx - 16 + e * 7, y - 5 + r * 6, 6, 4, PAL.hole);
        break;
      }
      default:
        blob(c, cx, y, 12, 5, PAL.hole);
    }

    // a chamber dug in the last moment fades in out of the soil
    const now = performance.now();
    if (bornAt[i] === undefined) bornAt[i] = seenOnce ? now : 0;
    const age = (now - bornAt[i]) / FADE_MS;
    if (age < 1) {
      const lit = Math.floor(age * 16);
      c.fillStyle = PAL.soil;
      for (let py = y - 8; py <= y + 7; py++) for (let px = cx - 24; px <= cx + 23; px++) {
        if (BAYER[(py & 3) * 4 + (px & 3)] >= lit) c.fillRect(px, py, 1, 1);
      }
    }
  });
  seenOnce = true;
  hitSpots = spots;
  if (picked !== null && spots[picked]) { // a blinking frame round the chamber picked to swap
    const p = spots[picked], col = Math.floor(t * 3) % 2 ? PAL.seed : PAL.bone;
    rect(c, p.x - 22, p.y - 8, 44, 1, col); rect(c, p.x - 22, p.y + 7, 44, 1, col);
    rect(c, p.x - 22, p.y - 8, 1, 16, col); rect(c, p.x + 21, p.y - 8, 1, 16, col);
  } else picked = null;

  drawQueen(c, shaftX, qy, look, t);

  // Workers go about the nest: each one rests a while in a chamber, then walks the real tunnels
  // (out to the shaft, along it, into the next chamber). Only a few trips go to the entrance.
  const ants = Math.min(48, Math.floor(ctx.res.amt('ant')));
  const y0 = surface ? 2 : 18;
  const entrance = { x: shaftX, y: y0, w: 0 };
  const rooms = [...spots.map((p) => ({ x: p.x, y: p.y - 1, w: 14 })), { x: shaftX, y: qy - Math.ceil(qs.h / 2) - 1, w: 6 }];
  const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
  const stopFor = (i: number, k: number) => { const h = hash(i, k); return h % 8 === 0 || !rooms.length ? entrance : rooms[(h >>> 3) % rooms.length]; };
  for (let i = 0; i < ants; i++) {
    const leg = 50 + (i % 7) * 2;                       // seconds per leg: rest, then walk at a steady pace
    const tt = t + i * 7.3, k = Math.floor(tt / leg), sec = tt % leg;
    const A = stopFor(i, k), B = stopFor(i, k + 1);
    const a1 = Math.abs(A.x - shaftX), a2 = Math.abs(B.y - A.y), a3 = Math.abs(B.x - shaftX), len = a1 + a2 + a3;
    const walk = Math.min(len / (6 + (i % 4)), leg * 0.9); // 6-9 px a second, like the old walkers
    const rest = leg - walk;
    let x: number, y: number;
    if (sec < rest || len === 0) {                       // resting in a chamber, pottering about
      if (A === entrance) continue;                      // out on the surface: off screen until it comes back
      x = A.x - 1 + Math.round(Math.sin(t * 0.4 + i * 1.3) * A.w);
      y = A.y;
    } else {
      // walk: A -> shaft, shaft from A.y to B.y, shaft -> B
      let d = ((sec - rest) / walk) * len;
      if (d <= a1) { x = A.x + Math.sign(shaftX - A.x) * d - 1; y = A.y; }
      else if ((d -= a1) <= a2) { x = shaftX - 1; y = A.y + Math.sign(B.y - A.y) * d; }
      else { d -= a2; x = shaftX + Math.sign(B.x - shaftX) * d - 1; y = B.y; }
    }
    rect(c, x, y, 2, 2, ANT_TINT);
  }
}
