// Nest building: spend resources on chambers that raise caps and add bonuses.
// Ten chambers break the surface. Each chamber type draws differently in the nest view.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, type ActionButton } from '../../core/ui';
import type { Costs } from '../../core/resources';
import { NEST, RESEARCH } from '../../data/balance';
import { PAL, blob, rect, setup } from '../../core/pixel';
import { drawQueen, queenSize, type QueenLook } from '../../core/queen';

type ChamberId = keyof typeof NEST.chambers;
type ChamberDef = {
  name: string; base: Costs; desc: string; needs?: string; max?: number; growth?: number;
  antCap?: number; foodCap?: number; broodCap?: number; pheroCap?: number;
  soilCap?: number; matCap?: Record<string, number>;
  foodRate?: number; defence?: number; upkeep?: number; scout?: number; knowCap?: number; elder?: number; fungusCap?: number; boats?: number; waxCap?: number;
};
const DEFS = NEST.chambers as Record<ChamberId, ChamberDef>;
const IDS = Object.keys(DEFS) as ChamberId[];

interface NestState { built: Record<string, number>; order: ChamberId[] }
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

function applyEffects(ctx: Context) {
  const mult = (id: ChamberId) => 1 + Object.entries(NEST.storageTechs)
    .reduce((t, [tech, ids]) => t + (ctx.flags.has('tech:' + tech) && ids.includes(id) ? NEST.storageBoost : 0), 0);
  const sum = (k: keyof ChamberDef) => IDS.reduce((t, id) => t + ((DEFS[id][k] as number | undefined) ?? 0) * count(ctx, id) * (k.endsWith('Cap') ? mult(id) : 1), 0);
  ctx.res.setCapBonus('ant', 'nest', sum('antCap'));
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
}

export const nest: GameSystem = {
  id: 'nest',

  init(ctx) {
    ctx.res.define({ id: 'soil', name: 'Soil', cap: NEST.baseSoilCap, order: 2 });
    ctx.state.nest = { built: Object.fromEntries(IDS.map((i) => [i, 0])), order: [] } satisfies NestState;
    ctx.bus.on('loaded', () => applyEffects(ctx));
  },

  isUnlocked: (ctx) => ctx.flags.has('tech:digging'),

  tick(ctx, dt) {
    applyEffects(ctx);
    const g = count(ctx, 'granary');
    if (g) ctx.res.add('food', g * (DEFS.granary.foodRate ?? 0) * dt);
    if (!ctx.flags.has('surface') && ctx.flags.has('tech:surface') && totalChambers(ctx) >= NEST.surfaceAtChambers) {
      ctx.flags.add('surface');
      ctx.log('A digger pushes upward and the soil gives way. Light. Wind. The surface.');
      ctx.log('A new tab has opened: Surface.', 'info');
    }
  },

  panel: (() => {
    const buttons = new Map<ChamberId, { btn: ActionButton; wrap: HTMLElement; count: HTMLElement }>();
    let canvas: HTMLCanvasElement, progress: HTMLElement, extra: HTMLElement;
    return {
      title: 'Nest',
      group: 'Nest',
      mount(root, ctx) {
        canvas = el('canvas.nestview', { width: 320, height: 160, 'aria-label': 'Cross-section of your nest' }) as HTMLCanvasElement;
        progress = el('p.muted');
        extra = el('p.muted');
        const grid = el('div.build');
        for (const id of IDS) {
          const def = DEFS[id];
          const cnt = el('span.count');
          const btn = actionButton({
            ctx, label: def.name, desc: def.desc,
            costs: () => costOf(ctx, id),
            enabled: (c) => !def.max || count(c, id) < def.max,
            onBuy: (c) => {
              S(c).built[id] = count(c, id) + 1;
              S(c).order.push(id);
              if (id === 'brood' && !c.flags.has('chamber:brood')) {
                c.flags.add('chamber:brood');
                c.log('A warm brood chamber is finished. Some workers could become nurses.');
              }
              if (count(c, id) === 1 && id !== 'tunnel' && id !== 'brood') c.log(`The first ${def.name.toLowerCase()} is dug.`, 'info');
              applyEffects(c);
            },
          });
          const wrap = el('div.buildrow', { hidden: true }, btn.root, el('span.muted', {}, def.desc), cnt);
          grid.append(wrap);
          buttons.set(id, { btn, wrap, count: cnt });
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
        root.append(el('p.flavor', {}, 'Chambers carved from the dark. Each one makes room for more.'), el('p.muted', {}, 'Click a chamber, then another, to swap them. Layout is cosmetic only.'), el('div.nestscroll', { tabindex: '0', 'aria-label': 'Nest view, scrolls when the nest is deep' }, canvas), progress, extra, grid);
      },
      update(_root, ctx) {
        for (const id of IDS) {
          const b = buttons.get(id)!;
          b.wrap.hidden = !visible(ctx, id);
          b.btn.update(ctx);
          b.count.textContent = `×${count(ctx, id)}`;
        }
        const n = totalChambers(ctx);
        progress.textContent = ctx.flags.has('surface')
          ? `${n} chambers. The nest is open to the surface.`
          : ctx.flags.has('tech:surface') ? `${n} of ${NEST.surfaceAtChambers} chambers. Something waits above.` : `${n} chambers. Research Upward tunnels to dig toward the surface.`;
        const def = ctx.mods.get('defence'), up = -ctx.mods.get('upkeep');
        const bits = [];
        if (def) bits.push(`Nest defence ${def}`);
        if (up) bits.push(`upkeep reduced ${Math.round(up * 100)}%`);
        if (count(ctx, 'granary')) bits.push(`granaries +${(count(ctx, 'granary') * (DEFS.granary.foodRate ?? 0)).toFixed(2)} food/s`);
        extra.textContent = bits.join(', ');
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

  order.slice(0, rows * LANES.length).forEach((id, i) => {
    const k = (counts[id] = (counts[id] ?? 0) + 1) - 1;
    const lane = LANES[i % LANES.length];
    const y = top + 24 + Math.floor(i / LANES.length) * ROW_H + (i % 3);
    const cx = shaftX + Math.sign(lane) * LANE_X[Math.abs(lane)];
    rect(c, Math.min(shaftX, cx), y - 1, Math.abs(cx - shaftX), 3, PAL.hole); // connecting tunnel
    spots.push({ x: cx, y });

    switch (id) {
      case 'tunnel': // a side passage that keeps going
        rect(c, cx - 16, y - 1, 32, 3, PAL.hole);
        rect(c, cx + (lane > 0 ? 14 : -18), y - 4, 4, 7, PAL.hole);
        break;
      case 'brood': { // eggs in rows, more as the brood grows
        blob(c, cx, y, 16, 5, PAL.hole);
        const n = Math.min(10, Math.ceil(broodCount / Math.max(1, counts.brood)) || 1);
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
        for (let e = 0; e < 3; e++) rect(c, cx - 8 + e * 8 + (Math.sin(t * 2 + e + k) > 0 ? 1 : 0), y - 3, 1, 5, PAL.food);
        break;
      }
      case 'gallery': // a big chamber sealed with an amber resin rim
        blob(c, cx, y, 22, 7, PAL.amber);
        blob(c, cx, y, 19, 5, PAL.hole);
        break;
      case 'gland': { // a scent chamber that blinks purple
        blob(c, cx, y, 14, 5, PAL.hole);
        const on = Math.floor(t * 2 + k) % 2 === 0;
        rect(c, cx - 1, y - 1, 2, 2, PAL.scent);
        if (on) { rect(c, cx - 7, y - 3, 2, 2, PAL.scent); rect(c, cx + 5, y + 1, 2, 2, PAL.scent); }
        break;
      }
      case 'barracks': { // a guard post with soldiers standing in line
        rect(c, cx - 16, y - 5, 32, 10, PAL.hole);
        rect(c, cx - 16, y - 6, 32, 1, PAL.dirt);
        const n = Math.min(6, Math.ceil(soldiers / Math.max(1, counts.barracks)));
        for (let e = 0; e < n; e++) rect(c, cx - 13 + e * 5, y - 2, 2, 4, PAL.you);
        break;
      }
      case 'fungus': { // a fungus bed: green tufts on a mat of cut leaves, grey if mould has it
        blob(c, cx, y, 16, 5, PAL.hole);
        rect(c, cx - 12, y + 1, 24, 2, PAL.grass);
        const mouldy = k < (ctx.state.garden?.mould ?? 0);
        for (let e = 0; e < 5; e++) rect(c, cx - 10 + e * 5, y - 3 + (Math.sin(t + e + k) > 0.6 ? 1 : 0), 3, 4, mouldy ? '#8a8a80' : PAL.food);
        break;
      }
      case 'midden': // a growing heap of waste
        blob(c, cx, y, 15, 5, PAL.hole);
        for (let r = 0; r < 5; r++) rect(c, cx - 2 - r * 2, y - 2 + r, 4 + r * 4, 1, PAL.waste);
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
      case 'harbour': { // a little pool with a leaf raft that rocks
        blob(c, cx, y, 18, 6, PAL.hole);
        rect(c, cx - 14, y + 1, 28, 4, PAL.water);
        const rock = Math.sin(t * 1.5 + k) > 0 ? 1 : 0;
        rect(c, cx - 5, y - rock, 10, 2, PAL.grass);
        break;
      }
      case 'waxworks': // a wax store: a honeycomb of yellow cells
        blob(c, cx, y, 15, 5, PAL.hole);
        for (let r = 0; r < 2; r++) for (let e = 0; e < 4; e++) rect(c, cx - 10 + e * 6 + r * 3, y - 3 + r * 4, 4, 3, PAL.seed);
        break;
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

  // workers walk real paths: down the shaft, along a side tunnel to a chamber, and back
  const ants = Math.min(48, Math.floor(ctx.res.amt('ant')));
  const y0 = surface ? 2 : 18;
  const stops = [...spots, { x: shaftX, y: qy - Math.ceil(qs.h / 2) - 1 }]; // every chamber, plus a visit to the queen
  for (let i = 0; i < ants; i++) {
    const speed = 6 + (i % 5);
    const spot = stops[i % stops.length];
    const down = spot.y - y0, side = Math.abs(spot.x - shaftX);
    const len = down + side;
    let d = (i * 37 + t * speed) % (2 * len);
    if (d > len) d = 2 * len - d;                       // walking back
    const x = d <= down ? shaftX - 1 : shaftX - 1 + Math.sign(spot.x - shaftX) * (d - down);
    const y = d <= down ? y0 + d : spot.y - 1;
    rect(c, x, y, 2, 2, PAL.bone);
  }
}
