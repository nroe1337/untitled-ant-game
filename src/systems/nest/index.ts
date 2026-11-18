// Nest building: spend resources on chambers that raise caps and add bonuses.
// Ten chambers break the surface. Each chamber type draws differently in the nest view.
import type { GameSystem, Context } from '../../core/types';
import { el, tileButton, actionButton } from '../../core/ui';
import { queueOrder } from '../../core/options';
import { dockQueue } from '../../core/queue';
import type { Costs } from '../../core/resources';
import { BROOD, COLONY, MAP, NEST, RESEARCH } from '../../data/balance';
import { PAL, blob, maskInto, rect, setup } from '../../core/pixel';
import { drawQueen, queenSize, type QueenLook } from '../../core/queen';

type ChamberId = keyof typeof NEST.chambers;
type ChamberDef = {
  name: string; base: Costs; desc: string; needs?: string; max?: number; growth?: number;
  antCap?: number; foodCap?: number; broodCap?: number; pheroCap?: number; jellyCap?: number;
  soilCap?: number; matCap?: Record<string, number>;
  foodRate?: number; defence?: number; upkeep?: number; scout?: number; knowCap?: number; elder?: number; fungusCap?: number; boats?: number; waxCap?: number;
  /** Any shared modifier, per chamber built (e.g. { 'job:forager': 0.04 }). */
  mods?: Record<string, number>;
  /** From the `at`-th chamber of this kind on, it also costs these (growing from there at the same rate). */
  later?: { at: number; cost: Costs };
};
const DEFS = NEST.chambers as Record<ChamberId, ChamberDef>;
/** How the chamber buttons are grouped on the Nest tab. Anything not listed goes in the last group. */
/** Walking ants: a soft amber-tan, so they read as ants instead of white specks. */
const ANT_TINT = '#d6b98c';
const SECTIONS: [string, string[]][] = [
  ['Living space', ['tunnel', 'hall', 'gallery', 'paperhall', 'clayhall']],
  ['Brood', ['warmth', 'nursery', 'brood']],
  ['Environment', ['airshaft', 'vent']],
  ['Stores', ['store', 'storeroom', 'twigloft', 'seedvault', 'resinvat', 'silkroom', 'waxworks', 'pantry']],
  ['Food', ['granary', 'cistern', 'rest', 'midden', 'fungus', 'sporecellar', 'stable']],
  ['Knowledge', ['library', 'memory']],
  ['Work', ['spoil', 'gland', 'chartroom', 'harbour', 'boatshed']],
  ['War', ['barracks', 'husks', 'training', 'armory', 'den']],
];
const IDS = Object.keys(DEFS) as ChamberId[];

interface NestState { built: Record<string, number>; order: ChamberId[]; queue?: ChamberId[]; swappedBrood?: boolean;
  /** Chamber craft levels from before Nov 17, refunded on load. */
  ups?: Record<string, number>;
  /** Chamber reworks: level 1-3 per chamber type (true in saves from before levels). */
  reworks?: Record<string, number | boolean>;
  /** Parts already paid toward each chamber type's next rework level (levels II and III are paid in parts). */
  reworkPaid?: Record<string, number>;
  /** Gatehouse: gates shut. Spoil walls: wall height. Alarm scent: mould line. Flood channel: cooldown. */
  gates?: boolean; walls?: number; alarmAt?: number; floodCd?: number }
const S = (ctx: Context) => ctx.state.nest as NestState;

const count = (ctx: Context, id: ChamberId) => S(ctx).built[id] ?? 0;
const costOf = (ctx: Context, id: ChamberId): Costs => {
  const cheaper = Math.max(0.5, 1 + ctx.mods.get('chamberCost'));
  const d = DEFS[id], g = d.growth ?? NEST.costGrowth, n = count(ctx, id);
  const out: Costs = Object.fromEntries(Object.entries(d.base).map(([r, v]) => [r, Math.ceil(v * Math.pow(g, n) * cheaper)]));
  if (d.later && n + 1 >= d.later.at) {
    for (const [r, v] of Object.entries(d.later.cost)) out[r] = (out[r] ?? 0) + Math.ceil((v ?? 0) * Math.pow(g, n + 1 - d.later.at) * cheaper);
  }
  // the Undercroft: Wide tunnels take less soil; Root props make the first few of each chamber free of soil
  if (out.soil) out.soil = n < ctx.mods.get('rootProps') ? 0 : Math.ceil(out.soil * (1 + ctx.mods.get('wonderSoil')));
  if (out.soil === 0) delete out.soil;
  return out;
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
    ctx.log('The first nurses\' den is dug. Some workers could become nurses.');
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

/** Chamber reworks (Chamber craft): one per chamber type, bought once, for every chamber of that type
 *  (also ones dug later), and never undone. Most make that type gather more mould. See NEST.reworks. */
const RW = NEST.rework, RX = NEST.rw;
type ReworkDef = { name: string; desc: string; mould: number; ii: string; iii: string };
const REWORKS = NEST.reworks as Partial<Record<ChamberId, ReworkDef>>;
const ROMAN = ['', 'I', 'II', 'III'];
/** A chamber type's rework level, 0 to 3 (saves from before levels stored true for level I). */
export const reworkLevel = (ctx: Context, id: string) => { const v = (ctx.state.nest as NestState | undefined)?.reworks?.[id]; return v === true ? 1 : Number(v) || 0; };
export const reworked = (ctx: Context, id: string) => reworkLevel(ctx, id) > 0;
/** A rework level costs knowledge plus a big batch of what one chamber of that type costs to dig; II and III cost more.
 *  II and III are paid in parts (RW.parts), so their totals can run past what the stores can hold. This is one part. */
const reworkCost = (id: ChamberId, L: number): Costs => {
  const m = RW.levelMult[Math.min(L, 2)] / partsFor(L);
  const out: Costs = { knowledge: Math.ceil(RW.knowledge * m) };
  for (const [r, v] of Object.entries(DEFS[id].base)) out[r] = (out[r] ?? 0) + Math.ceil((v ?? 0) * RW.baseMult * m);
  return out;
};
const partsFor = (L: number) => RW.parts[Math.min(L, 2)];
const partsPaid = (ctx: Context, id: string) => S(ctx).reworkPaid?.[id] ?? 0;
/** Pay one part toward the next level; the last part does the rework. */
function payRework(ctx: Context, id: ChamberId) {
  const n = partsFor(reworkLevel(ctx, id)), paid = partsPaid(ctx, id) + 1, all = (S(ctx).reworkPaid ??= {});
  if (paid < n) { all[id] = paid; ctx.log(`${REWORKS[id]!.name}: part ${paid} of ${n} paid.`, 'info'); return; }
  delete all[id];
  rework(ctx, id);
}
/** Chambers of the type needed for the next level (3, 8, 15). */
const nextNeeds = (ctx: Context, id: ChamberId) => RW.levelBuilt[Math.min(2, reworkLevel(ctx, id))];
const reworkReady = (ctx: Context, id: ChamberId) => ctx.flags.has('tech:renovation') && count(ctx, id) >= RW.levelBuilt[0];
const mouldNote = (m: number) => (m > 0 ? `Each one gathers mould like ${m + 1} chambers.` : m < 0 ? 'Gathers no mould.' : 'Gathers mould as before.');
/** Extra chambers' worth of mould from reworks (brood reads it through the mouldRooms mod). */
const reworkMould = (ctx: Context) => (Object.keys(REWORKS) as ChamberId[]).reduce((t, id) => t + (reworked(ctx, id) ? REWORKS[id]!.mould * count(ctx, id) : 0), 0);
/** Alarm scent: the mould line past which idle workers turn out as nurses. */
export const alarmLine = (ctx: Context) => S(ctx).alarmAt ?? RX.alarmLines[1];
/** The alarm is up while raiders are at the entrance or mould is past the line. */
const alarmUp = (ctx: Context) => !!(ctx.state.war as { battle?: unknown } | undefined)?.battle || (ctx.res.has('mould') && ctx.res.amt('mould') >= alarmLine(ctx));
/** Gatehouse: shut by the switch, or (level II) by itself while raiders are at the entrance. */
export const gatesShut = (ctx: Context) => reworked(ctx, 'barracks') && (!!S(ctx).gates || (reworkLevel(ctx, 'barracks') >= 2 && !!(ctx.state.war as { battle?: unknown } | undefined)?.battle));
/** An open, seen, dry tile next to land we hold (for the Draught shaft III and the Seed bank III). */
export function openNeighbour(ctx: Context, i?: number): number | null {
  const tiles = (ctx.state.map?.tiles ?? []) as { o: string | null; t: string; seen: boolean; w?: string }[], C = MAP.cols;
  const nextToUs = (j: number) => [j - 1, j + 1, j - C, j + C].some((n) => n >= 0 && n < tiles.length && Math.abs((n % C) - (j % C)) <= 1 && tiles[n].o === 'you');
  const ok = (j: number) => !!tiles[j] && tiles[j].seen && tiles[j].o === null && tiles[j].t !== 'water' && nextToUs(j);
  if (i != null) return ok(i) ? i : null;
  for (let j = 0; j < tiles.length; j++) if (ok(j)) return j;
  return null;
}
const heldTiles = (ctx: Context) => ((ctx.state.map?.tiles ?? []) as { o: string | null }[]).filter((t) => t.o === 'you').length;
/** Rework effects that run every tick: blown mould settling as soil, the mould farm, spoil walls. */
function tickReworks(ctx: Context, dt: number) {
  const s = S(ctx), res = ctx.res, mouldy = res.has('mould') && res.amt('mould') >= 1, prev = res.source;
  const LA = reworkLevel(ctx, 'airshaft'), LM = reworkLevel(ctx, 'midden');
  if (LA && mouldy) {
    const blown = (DEFS.airshaft.mods?.mouldClean ?? 0) * RX.draughtBy[LA] * count(ctx, 'airshaft');
    res.source = 'Blown mould settling'; res.add('soil', blown * Math.min(1, heldTiles(ctx) / RX.draughtTilesBy[LA]) * dt);
  }
  if (LM && mouldy && res.has('fungus')) { res.source = 'Mould farm'; res.add('fungus', RX.farmClean * RX.farmBy[LM] * count(ctx, 'midden') * RX.farmFungus * dt); }
  if (reworked(ctx, 'storeroom')) {
    const diggers = (ctx.state.jobs?.assigned?.digger ?? 0) as number;
    const full = res.amt('soil') >= res.cap('soil') - 0.5;
    s.walls = Math.max(0, (s.walls ?? 0) * (1 - RX.wallDecay * dt) + (full ? diggers * RX.wallPerDigger * RX.wallRateBy[reworkLevel(ctx, 'storeroom')] * dt : 0));
  }
  // Flood channel III: the channels open by themselves past the alarm line
  if (reworkLevel(ctx, 'cistern') >= 3 && !s.floodCd && res.has('mould') && res.amt('mould') >= alarmLine(ctx)) flood(ctx);
  if (s.floodCd) s.floodCd = Math.max(0, s.floodCd - dt);
  res.source = prev;
}
/** Flood channel: all mould washed out, the eggs drown, a share of the food is soaked. */
function flood(ctx: Context) {
  const r = ctx.res;
  r.lump('mould', -r.amt('mould'));
  const L = reworkLevel(ctx, 'cistern');
  if (r.amt('egg') >= 1) r.lump('egg', -Math.floor(r.amt('egg')));
  r.lump('food', -r.amt('food') * RX.floodFoodBy[L]);
  S(ctx).floodCd = RX.floodCooldown * RX.floodCdBy[L];
  ctx.log('The cisterns are opened. Water roars down the tunnels and carries the mould away, and the eggs with it.', 'warn');
}
function rework(ctx: Context, id: ChamberId) {
  const L = reworkLevel(ctx, id) + 1;
  (S(ctx).reworks ??= {})[id] = L;
  ctx.log(L === 1 ? `Every ${DEFS[id].name.toLowerCase()} is rebuilt: ${REWORKS[id]!.name}.` : `${REWORKS[id]!.name} ${ROMAN[L]}: ${L === 2 ? REWORKS[id]!.ii : REWORKS[id]!.iii}`, 'info');
  applyEffects(ctx);
}
/** Saves from before Nov 17 had Chamber craft levels (+15% each). Those are gone: give back what they cost. */
function refundOldLevels(ctx: Context) {
  const ups = S(ctx).ups;
  if (!ups) return;
  const O = RW.old, back: Costs = {};
  for (const [id, L] of Object.entries(ups)) {
    const late = DEFS[id as ChamberId]?.later?.cost ?? {};
    const [r, v] = Object.entries(late)[0] ?? [];
    const base: Costs = { clay: O.clay, ...(r ? { [r]: (v ?? 1) * O.lateMult } : O.fallback) };
    for (let l = 0; l < L; l++) for (const [k, n] of Object.entries(base)) back[k] = (back[k] ?? 0) + Math.ceil((n ?? 0) * Math.pow(O.growth, l));
  }
  delete S(ctx).ups;
  const got = Object.entries(back).filter(([k, n]) => n && ctx.res.has(k));
  for (const [k, n] of got) ctx.res.add(k, n!);
  if (got.length) ctx.log(`Chamber craft has changed: old upgrade levels are gone, and what they cost comes back (${got.map(([k, n]) => `${n} ${k}`).join(', ')}).`, 'info');
}
/** Storage chambers each hold NEST.storeGrowth times the one before, so N of them hold this many 'firsts'. */
const grows = (id: ChamberId) => NEST.storeGrowthIds.includes(id);
const stack = (ctx: Context, id: ChamberId) => { const n = count(ctx, id); return grows(id) ? (Math.pow(NEST.storeGrowth, n) - 1) / (NEST.storeGrowth - 1) : n; };
/** What the next one of a chamber adds, as a multiple of the first. */
const nextScale = (ctx: Context, id: ChamberId) => (grows(id) ? Math.pow(NEST.storeGrowth, count(ctx, id)) : 1);
/** Storage techs (Packed walls, Memory songs, Resin lining) multiply what some chambers store. */
const storeMult = (ctx: Context, id: ChamberId) => 1 + Object.entries(NEST.storageTechs)
  .reduce((t, [tech, ids]) => t + (ctx.flags.has('tech:' + tech) && ids.includes(id) ? NEST.storageBoostBy[tech] ?? NEST.storageBoost : 0), 0);
/** Housing techs multiply all living space from chambers. */
const roominess = (ctx: Context) => 1 + Object.entries(NEST.housingTechs).reduce((t, [tech, b]) => t + (ctx.flags.has('tech:' + tech) ? b : 0), 0) + ctx.mods.get('livingSpace');
const num = (n: number) => String(Number(n.toFixed(2)));
/** A chamber's tooltip with the numbers it really gives now, after techs. */
function liveDesc(ctx: Context, id: ChamberId) {
  const m = storeMult(ctx, id) * nextScale(ctx, id) * power(ctx, id);
  let d = DEFS[id].desc.replace(/\+(\d+) living space/, (_, n) =>
    `+${num((Number(n) + (id === 'tunnel' && ctx.flags.has('tech:widetunnels') ? NEST.wideTunnels : 0)) * roominess(ctx))} living space`);
  if (m !== 1) d = d.replace(/\+(\d+)(?![\d.]*%)(?! living)/g, (_, n) => `+${num(Number(n) * m)}`);
  // job slots this room gives (see COLONY.jobSlots)
  for (const [job, [room, per]] of Object.entries(COLONY.jobSlots)) if (room === id) d += `, +${per} ${job} slots`;
  const extra: Partial<Record<ChamberId, [string, string]>> = {
    granary: ['meadowgranary', `+${NEST.terrain.meadowgranary} seed/s (Meadow granaries)`],
    storeroom: ['soilmasons', `+${NEST.terrain.soilmasons} living space (Soil masons)`],
    barracks: ['stoneposts', 'defence doubled (Stone posts)'],
    cistern: ['dewwells', `scrubs ${NEST.terrain.dewwells} mould/s (Dew wells)`],
    warmth: ['warmslabs', `+${NEST.terrain.warmslabs} brood space (Warm slabs)`],
    midden: ['compost', `turns ${BROOD.compost.share * 100}% of scrubbed mould into soil (Midden compost)`],
  };
  const x = extra[id];
  if (x && ctx.flags.has('tech:' + x[0])) d += `, ${x[1]}`;
  return d;
}

/** A chamber's strength: crowns can boost or weaken a chamber type (`room:<id>` mods). */
const power = (ctx: Context, id: ChamberId) => Math.max(0.1, 1 + ctx.mods.get('room:' + id));
function applyEffects(ctx: Context) {
  const mult = (id: ChamberId) => storeMult(ctx, id);
  const sum = (k: keyof ChamberDef) => IDS.reduce((t, id) => t + ((DEFS[id][k] as number | undefined) ?? 0) * (k.endsWith('Cap') ? stack(ctx, id) * mult(id) : count(ctx, id)) * power(ctx, id), 0);
  const roomier = roominess(ctx);
  const wide = ctx.flags.has('tech:widetunnels') ? NEST.wideTunnels * count(ctx, 'tunnel') : 0;
  // terrain specialists: held ground upgrades chambers already dug
  const T = NEST.terrain, has = (t: string) => ctx.flags.has('tech:' + t);
  const masons = has('soilmasons') ? T.soilmasons * count(ctx, 'storeroom') : 0;
  ctx.res.setCapBonus('ant', 'nest', Math.floor((sum('antCap') + wide + masons) * roomier));
  ctx.res.setCapBonus('food', 'nest', sum('foodCap'));
  ctx.res.setCapBonus('egg', 'nest', sum('broodCap') + (has('warmslabs') ? T.warmslabs * count(ctx, 'warmth') : 0));
  ctx.res.setCapBonus('soil', 'nest', totalChambers(ctx) * NEST.soilPerChamber + sum('soilCap'));
  for (const r of Object.keys(NEST.baseMaterialCap)) {
    if (ctx.res.has(r)) ctx.res.setCapBonus(r, 'nest', IDS.reduce((t, id) => t + (DEFS[id].matCap?.[r] ?? 0) * stack(ctx, id) * mult(id) * power(ctx, id), 0));
  }
  if (ctx.res.has('pheromone')) ctx.res.setCapBonus('pheromone', 'nest', sum('pheroCap'));
  const defence = sum('defence') + (has('stoneposts') ? (DEFS.barracks.defence ?? 0) * count(ctx, 'barracks') : 0) + Math.floor(S(ctx).walls ?? 0);
  ctx.mods.set('defence', 'nest', defence);
  // Gatehouse: shut gates double the nest's own defence (chambers and walls); foragers and expeditions read gatesShut
  const shut = gatesShut(ctx);
  ctx.mods.set('gatesShut', 'nest', shut ? 1 : 0);
  ctx.mods.set('defence', 'gates', shut ? defence * (RX.gateMult[reworkLevel(ctx, 'barracks')] - 1) : 0);
  ctx.mods.set('mouldClean', 'farm', RX.farmClean * RX.farmBy[reworkLevel(ctx, 'midden')] * count(ctx, 'midden'));
  // Alarm scent II and III: while the alarm is up, soldiers fight harder and nurses scrub more
  const LG = reworkLevel(ctx, 'gland'), up = LG > 0 && alarmUp(ctx);
  ctx.mods.set('soldierPower', 'alarm', up && LG >= 2 ? RX.alarmSoldier : 0);
  ctx.mods.set('alarmNurse', 'alarm', up && LG >= 3 ? RX.alarmNurse : 0);
  ctx.mods.set('mouldClean', 'dewwells', has('dewwells') ? T.dewwells * count(ctx, 'cistern') : 0);
  ctx.mods.set('upkeep', 'nest', -sum('upkeep'));
  ctx.mods.set('mouldRooms', 'reworks', reworkMould(ctx));
  ctx.mods.set('job:scout', 'nest', sum('scout'));
  ctx.mods.set('job:elder', 'nest', sum('elder'));
  if (ctx.res.has('knowledge')) ctx.res.setCapBonus('knowledge', 'nest', sum('knowCap'));
  if (ctx.res.has('fungus')) ctx.res.setCapBonus('fungus', 'nest', sum('fungusCap'));
  if (ctx.res.has('wax')) ctx.res.setCapBonus('wax', 'nest', sum('waxCap'));
  if (ctx.res.has('jelly')) ctx.res.setCapBonus('jelly', 'nest', sum('jellyCap'));
  ctx.mods.set('boatSlots', 'nest', sum('boats'));
  const m: Record<string, number> = {};
  for (const id of IDS) for (const [k, v] of Object.entries(DEFS[id].mods ?? {})) m[k] = (m[k] ?? 0) + v * count(ctx, id) * power(ctx, id) * (id === 'airshaft' && reworked(ctx, id) ? RX.draughtBy[reworkLevel(ctx, id)] : 1);
  for (const id of IDS) for (const k of Object.keys(DEFS[id].mods ?? {})) ctx.mods.set(k, 'nest:mods', m[k] ?? 0);
}

export const nest: GameSystem = {
  id: 'nest',

  init(ctx) {
    ctx.res.define({ id: 'soil', name: 'Soil', cap: NEST.baseSoilCap, order: 2 });
    ctx.state.nest = { built: Object.fromEntries(IDS.map((i) => [i, 0])), order: [], queue: [] } satisfies NestState;
    ctx.bus.on('loaded', () => {
      // Nov 2026: brood space moved from the Brood chamber (now the Nurses' den) to the Warming chamber.
      // Older saves swap their counts once, so the colony keeps the brood space it had.
      const n = S(ctx);
      if (!n.swappedBrood) {
        [n.built.brood, n.built.warmth] = [n.built.warmth ?? 0, n.built.brood ?? 0];
        n.order = n.order.map((id) => (id === 'brood' ? 'warmth' : id === 'warmth' ? 'brood' : id));
        n.swappedBrood = true;
      }
      refundOldLevels(ctx);
      applyEffects(ctx);
    });
  },

  isUnlocked: (ctx) => ctx.flags.has('tech:digging'),

  tick(ctx, dt) {
    applyEffects(ctx);
    if (queueSlots(ctx)) runQueue(ctx);
    tickReworks(ctx, dt);
    const g = count(ctx, 'granary');
    if (g) ctx.res.add('food', g * (DEFS.granary.foodRate ?? 0) * dt);
    if (g && ctx.flags.has('tech:meadowgranary')) ctx.res.add('seed', g * NEST.terrain.meadowgranary * dt);
    if (!ctx.flags.has('surface') && ctx.flags.has('tech:surface') && totalChambers(ctx) >= NEST.surfaceAtChambers) {
      ctx.flags.add('surface');
      ctx.log('A digger pushes upward and the soil gives way. Light. Wind. The surface.');
      ctx.log('A new tab has opened: Surface.', 'info');
    }
  },

  panel: (() => {
    const buttons = new Map<ChamberId, ReturnType<typeof tileButton>>();
    let canvas: HTMLCanvasElement, progress: HTMLElement, grid: HTMLElement, upBox: HTMLElement, roomName: HTMLElement;
    let floodBtn: ReturnType<typeof actionButton>, floodWrap: HTMLElement, gateWrap: HTMLElement, gateBox: HTMLInputElement, alarmWrap: HTMLElement, alarmSel: HTMLSelectElement;
    const rwButtons = new Map<ChamberId, ReturnType<typeof tileButton>>();
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
          selected = i < 0 ? null : order[i]; // the name line shows the last chamber clicked
          if (i < 0 || i === picked) { picked = null; selected = null; return; } // clicking the picked chamber again (or empty ground) deselects
          if (picked === null) { picked = i; return; }
          [order[picked], order[i]] = [order[i], order[picked]]; // purely cosmetic: only the drawing reads the order
          picked = null; selected = null;
        });
        roomName = el('p.roomname', {}, ' ');
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
        const rwTiles = el('div.tiles');
        for (const id of Object.keys(REWORKS) as ChamberId[]) {
          const r = REWORKS[id]!;
          const btn = tileButton({
            ctx, label: r.name,
            effect: () => {
              const L = reworkLevel(ctx, id), lines = [r.desc, r.ii, r.iii];
              const have = lines.slice(0, L).map((d, i) => `${ROMAN[i + 1]}: ${d}`).join(' ');
              const n = partsFor(L), parts = n > 1 ? ` Paid in ${n} parts (${partsPaid(ctx, id)} paid); the cost shown is one part.` : '';
              const next = L < 3 ? `Next, ${r.name} ${ROMAN[L + 1]} (needs ${nextNeeds(ctx, id)} ${DEFS[id].name.toLowerCase()}s): ${lines[L]}${parts}` : '';
              return L ? `${have} ${mouldNote(r.mould)}${next ? ' ' + next : ''}`
                : `Rebuild every ${DEFS[id].name.toLowerCase()}, now and later, as a ${r.name.toLowerCase()}. ${r.desc} ${mouldNote(r.mould)} Can't be undone. Two more levels follow.`;
            },
            count: () => { const L = reworkLevel(ctx, id), p = partsPaid(ctx, id); return (ROMAN[L] || '') + (p ? ` ${p}/${partsFor(L)}` : ''); },
            costs: () => reworkCost(id, reworkLevel(ctx, id)),
            enabled: (c) => reworkLevel(c, id) < 3 && count(c, id) >= nextNeeds(c, id),
            onBuy: (c) => payRework(c, id),
          });
          btn.root.hidden = true;
          rwTiles.append(btn.root);
          rwButtons.set(id, btn);
        }
        // controls some reworks open: the flood, the gates, the alarm line
        floodBtn = actionButton({
          ctx, label: () => (S(ctx).floodCd ? `Flood the nest (${Math.ceil(S(ctx).floodCd!)}s)` : 'Flood the nest'),
          desc: () => `Wash all the mould out at once. Every egg drowns and ${Math.round(RX.floodFoodBy[reworkLevel(ctx, 'cistern')] * 100)}% of the food is soaked. Then the channels refill (${RX.floodCooldown * RX.floodCdBy[reworkLevel(ctx, 'cistern')]}s).`,
          enabled: (c) => !S(c).floodCd && c.res.has('mould') && c.res.amt('mould') >= 1,
          onBuy: (c) => flood(c),
        });
        floodWrap = el('div.row', { hidden: true }, floodBtn.root);
        gateBox = el('input', { type: 'checkbox' }) as HTMLInputElement;
        gateBox.addEventListener('change', () => { S(ctx).gates = gateBox.checked; applyEffects(ctx); ctx.log(gateBox.checked ? 'The gates are sealed. Nothing goes out.' : 'The gates open again.', 'info'); });
        gateWrap = el('div.row', { hidden: true }, el('label', {}, gateBox, ' Shut the gates (more defence; no foraging and no expeditions)'));
        alarmSel = el('select', {}, ...RX.alarmLines.map((n) => el('option', { value: String(n) }, String(n)))) as HTMLSelectElement;
        alarmSel.addEventListener('change', () => { S(ctx).alarmAt = Number(alarmSel.value); });
        alarmWrap = el('div.row', { hidden: true }, el('label', {}, 'Alarm scent: idle workers turn out as nurses when mould passes ', alarmSel));
        upBox = el('div.tilegroups.compact.chamberups', { hidden: true }, el('div.tilegroup', {}, el('div.tilehead', {}, 'Chamber reworks'), rwTiles));
        const rwCtl = el('div.reworkctl', {}, floodWrap, gateWrap, alarmWrap);
        root.classList.add('nestpanel');
        root.append(el('p.flavor', {}, 'Chambers carved from the dark. Each one makes room for more.'), progress, grid, upBox, rwCtl,
          el('div.row', {}, el('label.muted', {}, toggle, ' Draw entire nest'), roomName), scroller);
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
        let anyRw = false;
        for (const [id, b] of rwButtons) { b.root.hidden = !(reworked(ctx, id) || reworkReady(ctx, id)); anyRw ||= !b.root.hidden; b.update(ctx); }
        upBox.hidden = !anyRw;
        floodWrap.hidden = !reworked(ctx, 'cistern'); floodBtn.update(ctx);
        gateWrap.hidden = !reworked(ctx, 'barracks'); gateBox.checked = !!S(ctx).gates;
        alarmWrap.hidden = !reworked(ctx, 'gland'); alarmSel.value = String(alarmLine(ctx));
        grid.querySelectorAll<HTMLElement>('.tilegroup').forEach((g) => { g.hidden = !Array.from(g.querySelectorAll<HTMLElement>('.tilewrap')).some((t) => !t.hidden); });
        const n = totalChambers(ctx);
        const bits = [ctx.flags.has('surface') ? `${n} chambers`
          : ctx.flags.has('tech:surface') ? `${n} of ${NEST.surfaceAtChambers} chambers to the surface` : `${n} chambers. Research Upward tunnels to reach the surface`];
        const def = ctx.mods.get('defence'), up = -ctx.mods.get('upkeep');
        if (def) bits.push(`defence ${def}`);
        if (up) bits.push(`upkeep reduced ${Math.round(up * 100)}%`);
        if ((S(ctx).walls ?? 0) >= 1) bits.push(`spoil walls ${Math.floor(S(ctx).walls!)}`);
        if (gatesShut(ctx)) bits.push('gates shut');
        if (count(ctx, 'granary')) bits.push(`granaries +${(count(ctx, 'granary') * (DEFS.granary.foodRate ?? 0)).toFixed(2)} food/s`);
        progress.textContent = bits.join(' · ');
        drawNest(canvas, ctx);
        // name the chamber last clicked, with its rework and level
        roomName.textContent = selected ? roomLabel(ctx, selected) + (picked != null ? ' (click another chamber to swap)' : '') : 'Click a chamber to see what it is. Click two in turn to swap them.';
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
/** A domed chamber: a rounded cone of a roof from y-6, bulging out to a flat floor at y+5. */
function dome(c: CanvasRenderingContext2D, cx: number, y: number, hw: number, color: string) {
  for (let r = 0; r < 12; r++) { const f = (r + 1) / 12; const w = Math.max(2, Math.round(hw * (1 - (1 - f) ** 2.2))); rect(c, cx - w, y - 6 + r, w * 2, 1, color); }
}

function mix(a: string, b: string, f: number) {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * Math.max(0, Math.min(1, f))).toString(16).padStart(2, '0')).join('');
}
// colours for the later chambers, kept here so the shared palette stays small
const TWIG = '#7a5a38', RESIN_DARK = '#6b3f16', WARM_DIM = '#4a2a18', DEW = '#b8d4e0', MEMORY = '#8fb4c9', JELLY = '#e8d27a';
const DEEP = '#1f3442', CLAY = '#8a4f3a', LEAF = '#4f6a2e', LEAF_RIB = '#6f8a3a';
const LARVA = '#d9cfae', FOOD_DARK = '#6f8044', WASTE_DARK = '#3a332b', HUSK_DARK = '#5a4f9a';
const CHITIN = '#a8452e', CAP = '#8a6a5a', APHID = '#a8c060', CRUMB = '#c8a878', CRUST = '#9a6e40', PAPER = '#9e988c';
/** 0..1 and back, smoothly, over `period` seconds. */
const wave = (t: number, period: number, phase = 0) => 0.5 - 0.5 * Math.cos(((t + phase) / period) * Math.PI * 2);

let seenOnce = false;
let animT = 0, animLast = performance.now();
/** Where each chamber was last drawn (by build-order index), for clicking; and the one picked to swap. */
let hitSpots: { x: number; y: number }[] = [];
let picked: number | null = null;
let selected: ChamberId | null = null;
/** A chamber's name for the line under the nest view: its rework and level when it has one. */
function roomLabel(ctx: Context, id: ChamberId) {
  const L = reworkLevel(ctx, id), r = REWORKS[id];
  return r && L ? `${r.name} ${ROMAN[L]} (a reworked ${DEFS[id].name.toLowerCase()})` : DEFS[id].name;
}

/** How far the queen has come: she fattens as this colony grows, and changes for good with each
 *  flight and, from the Age of Settlement on, each new age (Orbit is the last form). */
const SETTLE = RESEARCH.ages.findIndex((a) => a.id === 'settlement');
function queenLook(ctx: Context): QueenLook {
  const flights = (ctx.state.lineage as { flights?: number } | undefined)?.flights ?? 0;
  const ageId = (ctx.state.research as { age?: string } | undefined)?.age;
  const ageIdx = Math.max(0, RESEARCH.ages.findIndex((a) => a.id === ageId));
  const tier = Math.min(6, Math.max(flights >= 3 ? 2 : flights >= 1 ? 1 : 0, ageIdx >= SETTLE ? ageIdx - SETTLE + 3 : 0));
  return { tier, fat: Math.min(1, ctx.res.amt('ant') / 120) };
}
const MOULD = '#8a8a80', MOULD_GREEN = '#7c8a5e', ALARM = '#d8613a', ALARM_HOT = '#f2a03a', HEAL = '#9fd69a';
const STONE = '#5d5b57', STONE_HI = '#7a7872', LAMP = '#f2c14e', GOLD = '#e8c45a', GLOW = '#6fe0c8';
/** The Gatehouse gate eases up and down instead of jumping (0 open, 1 shut). */
let gateDrop = 0;
/** A worker standing, facing right (dir 1) or left: 4x2 body with a head and two legs. */
function antAt(c: CanvasRenderingContext2D, x: number, y: number, col: string, dir = 1, step = 0) {
  rect(c, x, y, 4, 2, col); rect(c, dir > 0 ? x + 4 : x - 1, y - 1, 1, 2, col);
  rect(c, x + (step ? 0 : 1), y + 2, 1, 1, col); rect(c, x + (step ? 3 : 2), y + 2, 1, 1, col);
}
/** A pennant on a pole that flaps. */
function pennant(c: CanvasRenderingContext2D, x: number, y: number, col: string, t: number, ph = 0) {
  rect(c, x, y - 7, 1, 8, TWIG);
  const f = Math.floor(t * 3 + ph) % 2;
  rect(c, x + 1, y - 7, 3, 2, col); rect(c, x + 4, y - 7 + f, 1, 1, col);
}
/** Chamber reworks: a reworked chamber type is drawn whole. Each level (I, II, III) is bigger and busier
 *  than the last, the way an upgraded building grows in a strategy game: I rebuilds it, II fills it out,
 *  III adds a crown of colour and motion. */
function drawRework(c: CanvasRenderingContext2D, ctx: Context, id: string, cx: number, y: number, lane: number, k: number, t: number, L: number) {
  const side = lane > 0 ? -1 : 1; // -1: the shaft is on this chamber's left
  switch (id) {
    case 'brood': { // Infirmary: a lit ward of leaf cots; II adds cots, a nurse and dew; III a healing glow and a second nurse
      dome(c, cx, y, L >= 2 ? 21 : 17, PAL.hole);
      for (let r = 0; r < 3; r++) rect(c, cx - 16 + r * 2, y + 5 - r, 32 - r * 4, 1, mix(PAL.hole, L >= 3 ? HEAL : LAMP, (L >= 3 ? 0.25 : 0.15) - r * 0.05));
      const sick = (ctx.state.brood as { infirm?: number[] } | undefined)?.infirm?.length ?? 0, cots = L >= 2 ? 3 : 1;
      for (let e = 0; e < cots; e++) {
        const bx = cots === 1 ? cx - 4 : cx - 16 + e * 12;
        rect(c, bx, y + 3, 9, 2, LEAF); rect(c, bx + 1, y + 2, 7, 1, LEAF_RIB);
        if (e < Math.max(1, Math.min(cots, sick))) { rect(c, bx + 2, y + 1, 4, 1, MOULD); rect(c, bx + 6, y + 1, 1, 1, mix(MOULD, PAL.bone, 0.5)); }
        if (L >= 2) { const p = wave(t, 2.6, e * 0.8 + k); rect(c, bx + 4, y - 1 - Math.round(p * 4), 1, 1, mix(PAL.hole, HEAL, 1 - p)); }
      }
      if (L >= 2) { const nx = cx - 14 + Math.round(wave(t, 9, k * 0.5) * 26); antAt(c, nx, y - 3, ANT_TINT, Math.sin((t + k * 4.5) * Math.PI * 2 / 9) > 0 ? 1 : -1, Math.floor(t * 4) % 2); }
      if (L >= 3) {
        const nx = cx + 12 - Math.round(wave(t, 7, k * 0.5 + 2) * 24); antAt(c, nx, y - 3, mix(ANT_TINT, HEAL, 0.3), -1, Math.floor(t * 4 + 1) % 2);
        for (let e = 0; e < 7; e++) rect(c, cx - 14 + e * 4, y - 6 + (e % 2), 2, 1, mix(PAL.hole, HEAL, 0.25 + 0.4 * wave(t, 2, e * 0.4 + k))); // a shimmer of healing along the roof
      }
      rect(c, cx - 1, y - 6, 3, 2, mix(PAL.hole, LAMP, 0.45 + 0.3 * wave(t, 1.7, k) + (L >= 3 ? 0.2 : 0)));
      break;
    }
    case 'airshaft': { // Draught shaft: a chimney; II a spinning fan and mould spiralling up; III a stone-capped stack with a glowing filter
      dome(c, cx, y, L >= 2 ? 21 : 18, PAL.hole);
      const top = L >= 3 ? 16 : L >= 2 ? 14 : 11;
      rect(c, cx - 3, y - top, 6, top - 5, PAL.hole); rect(c, cx - 5, y - top - 1, 10, 2, PAL.hole);
      if (L >= 2) { rect(c, cx - 4, y - top + 1, 1, top - 6, STONE); rect(c, cx + 3, y - top + 1, 1, top - 6, STONE); }
      if (L >= 3) { rect(c, cx - 6, y - top - 2, 12, 1, STONE_HI); for (let e = 0; e < 3; e++) rect(c, cx - 3 + e * 2, y - top + 2, 1, 1, mix(PAL.hole, GLOW, 0.4 + 0.6 * wave(t, 1.2, e * 0.3 + k))); }
      if (L >= 2) {
        const f = Math.floor(t * (L >= 3 ? 14 : 8) + k) % 3;
        for (const [dx, dy] of [[[-4, 0], [3, 0]], [[-3, -2], [2, 2]], [[-3, 2], [2, -2]]][f]) rect(c, cx + dx, y - 5 + dy, 2, 1, TWIG);
        rect(c, cx - 1, y - 6, 2, 2, PAL.amber);
      }
      const specks = L >= 3 ? 12 : L >= 2 ? 8 : 4;
      for (let e = 0; e < specks; e++) {
        const r = (t * (L >= 3 ? 1.3 : 0.9) + e / specks + k * 0.23) % 1, sx = cx - 1 + (L >= 2 ? Math.round(Math.sin((r * 3 + e) * Math.PI) * 2) : 0);
        rect(c, sx, y - 4 - Math.floor(r * (top - 3)), 1, 1, mix(PAL.hole, e % 3 ? MOULD_GREEN : MOULD, 1 - r * 0.7));
      }
      if (L >= 2) for (let e = 0; e < (L >= 3 ? 6 : 4); e++) { const r = (t * 0.6 + e / 4 + k * 0.4) % 1, dx = Math.round((1 - r) * 18) * (e % 2 ? 1 : -1); rect(c, cx + dx, y + 3, 3, 1, mix(PAL.hole, DEW, 0.6 * (1 - r))); }
      break;
    }
    case 'midden': { // Mould farm: beds of mould; II terraces, mushrooms and a gardener; III glowing mushrooms and drifting spores
      dome(c, cx, y, L >= 2 ? 21 : 18, PAL.hole);
      for (let r = 0; r < (L >= 2 ? 3 : 1); r++) {
        const w = 30 - r * 9, yy = y + 4 - r * 3;
        rect(c, cx - w / 2, yy, w, 2, r % 2 ? WASTE_DARK : PAL.waste);
        for (let e = 0; e < w / 3; e++) rect(c, cx - w / 2 + e * 3, yy - 1, 2, 1, mix(MOULD_GREEN, PAL.food, 0.25 * wave(t, 2.2, e * 0.3 + r)));
      }
      const caps: [number, number, number][] = L >= 2 ? [[-10, 2, 0], [8, 3, 1.4], [1, 2, 2.3]] : [[6, 2, 0]];
      for (const [dx, sz, ph] of caps) {
        const g = Math.round(sz * (0.6 + 0.4 * wave(t, 6, ph + k))), mx = cx + dx;
        const cap = L >= 3 ? mix(CAP, GLOW, 0.3 + 0.5 * wave(t, 2.5, ph)) : CAP;
        rect(c, mx, y - 2 - g, 1, g + 1, PAL.bone); rect(c, mx - g, y - 3 - g, g * 2 + 1, 1, cap); rect(c, mx - g + 1, y - 4 - g, g * 2 - 1, 1, mix(cap, PAL.bone, 0.3));
      }
      if (L >= 2) antAt(c, cx + 12 - Math.round(wave(t, 7, k) * 6), y + 1, ANT_TINT, -1, Math.floor(t * 3) % 2);
      if (L >= 3) for (let e = 0; e < 6; e++) { const r = (t * 0.35 + e / 6 + k * 0.2) % 1; rect(c, cx - 10 + e * 4, y - 3 - Math.floor(r * 9), 1, 1, mix(PAL.hole, GLOW, 0.8 * (1 - r))); }
      break;
    }
    case 'cistern': { // Flood channel: a basin and sluice; II a stone basin and channel; III a waterwheel turning in the channel and mist
      blob(c, cx, y, L >= 2 ? 18 : 14, 7, PAL.hole);
      const hw = L >= 2 ? 14 : 10;
      if (L >= 2) { rect(c, cx - hw - 1, y - 1, hw * 2 + 2, 7, STONE); rect(c, cx - hw, y - 1, hw * 2, 6, PAL.hole); }
      const cd = S(ctx).floodCd ?? 0, full = 1 - Math.min(1, cd / (NEST.rw.floodCooldown * NEST.rw.floodCdBy[L])), lvl = Math.max(1, Math.round(5 * full));
      rect(c, cx - hw, y + 5 - lvl, hw * 2, lvl, PAL.water);
      for (let e = 0; e < 3; e++) rect(c, cx - hw + 2 + e * (hw - 2) + Math.round(wave(t, 2, e) * 3), y + 5 - lvl, 3, 1, mix(PAL.water, DEW, 0.5));
      const gx = side < 0 ? cx - hw - 2 : cx + hw + 1;
      rect(c, gx - 1, y - 6, 3, 1, TWIG); rect(c, gx - 1, y - 5, 1, 11, TWIG); rect(c, gx + 1, y - 5, 1, 11, TWIG);
      rect(c, gx, y - 5 + (cd ? 0 : 6), 1, 5, mix(TWIG, PAL.bone, 0.2));
      if (L >= 2) {
        const ex = side < 0 ? cx - 24 : cx + 16;
        rect(c, ex, y + 3, 8, 2, cd ? PAL.water : mix(PAL.hole, PAL.water, 0.4));
        if (cd) for (let e = 0; e < 3; e++) { const r = (t * 1.5 + e / 3) % 1; rect(c, ex + (side < 0 ? 7 - Math.floor(r * 8) : Math.floor(r * 8)), y + 3, 1, 1, DEW); }
        if (L >= 3) { // a little wheel in the channel, turning faster while the water runs
          const wx = ex + 3, f = Math.floor(t * (cd ? 10 : 2) + k) % 2;
          rect(c, wx, y - 1, 1, 7, TWIG); rect(c, wx - 3, y + 2, 7, 1, TWIG);
          if (f) { rect(c, wx - 2, y, 1, 1, TWIG); rect(c, wx + 2, y + 4, 1, 1, TWIG); } else { rect(c, wx + 2, y, 1, 1, TWIG); rect(c, wx - 2, y + 4, 1, 1, TWIG); }
          for (let e = 0; e < 4; e++) rect(c, cx - 10 + e * 6, y - 3 - (e % 2), 3, 1, mix(PAL.hole, DEW, 0.15 + 0.2 * wave(t, 3, e * 0.7 + k)));
        }
      }
      const p = (t * 0.3 + k * 0.41) % 1;
      rect(c, cx + 5, y - 6 + Math.floor(p * (11 - lvl)), 1, 1, mix(PAL.hole, DEW, 0.9 - p * 0.5));
      break;
    }
    case 'hall': { // Muster hall: a hall with banners; II full ranks and a drill leader; III a great standard, gold trim, a drum beat
      const hw = L >= 2 ? 22 : 18;
      rect(c, cx - hw, y - 5, hw * 2, 11, PAL.hole);
      rect(c, cx - hw, y - 6, hw * 2, 1, L >= 3 ? GOLD : PAL.dirt);
      for (const px of [cx - 12, cx + 11]) rect(c, px, y - 5, 2, 11, PAL.dirt);
      const banners = [PAL.food, PAL.seed, PAL.bone, PAL.you, PAL.scent, DEW].slice(0, L >= 2 ? 6 : 3);
      banners.forEach((col, i) => { const bx = cx - hw + 3 + i * 7, sw = Math.round(wave(t, 3, i * 0.5 + k)); rect(c, bx, y - 5, 3, 3, col); rect(c, bx + sw, y - 2, 2, 1, col); });
      const step = Math.floor(t * 2 + k) % 2;
      banners.forEach((col, i) => antAt(c, cx - hw + 3 + i * 7, y + 2, mix(ANT_TINT, col, 0.35), 1, (i + step) % 2));
      if (L >= 2) { const sx = cx - 18 + Math.round(wave(t, 8, k) * 34); antAt(c, sx, y - 1, mix(ANT_TINT, PAL.you, 0.6), Math.sin((t + k * 4) * Math.PI / 4) > 0 ? 1 : -1, step); }
      if (L >= 3) {
        pennant(c, cx + 18, y + 4, GOLD, t, k);
        const beat = wave(t, 0.8, k); rect(c, cx - 20, y + 2, 3, 3, mix(PAL.dirt, PAL.bone, 0.3 + 0.5 * beat)); // the drum
      }
      if (ctx.mods.get('winter') > 0) for (let e = 0; e < hw / 2; e++) rect(c, cx - hw + 1 + e * 4, y - 5, 2, 1, mix(PAL.hole, DEW, 0.7));
      break;
    }
    case 'gland': { // Alarm scent: a gland sac; II rings rolling out; III twin sacs and alarm trails glowing down the tunnel
      blob(c, cx, y, L >= 2 ? 18 : 15, 7, PAL.hole);
      const up = alarmUp(ctx);
      const per = up ? 0.7 : 2.6, beat = wave(t, per, k * 0.3);
      for (let ring = 0; ring < (L >= 2 ? 3 : 1); ring++) {
        const r = ((t / per) + ring / 3 + k * 0.1) % 1, rw = 3 + Math.round(r * 13), rh = 1 + Math.round(r * 4);
        const col = mix(PAL.hole, up ? ALARM : PAL.scent, 0.7 * (1 - r));
        rect(c, cx - rw, y - rh, rw * 2, 1, col); rect(c, cx - rw, y + rh, rw * 2, 1, col);
        rect(c, cx - rw, y - rh, 1, rh * 2, col); rect(c, cx + rw - 1, y - rh, 1, rh * 2, col);
      }
      const sacs = L >= 3 ? [-5, 4] : [0];
      for (const dx of sacs) { rect(c, cx + dx - 3, y - 2, 6, 4, mix(ALARM, ALARM_HOT, beat)); rect(c, cx + dx - 2, y - 3, 4, 1, mix(ALARM, ALARM_HOT, beat)); rect(c, cx + dx - 1, y - 1, 2, 1, mix(ALARM_HOT, PAL.bone, beat)); }
      if (up && L >= 2) for (let e = 0; e < 5; e++) { const r = (t * 1.6 + e / 5) % 1; rect(c, cx + side * Math.floor(r * 22), y - 2 + (e % 3) * 2, 1, 1, mix(ALARM_HOT, PAL.hole, r)); }
      if (L >= 3) for (let e = 0; e < 6; e++) rect(c, cx + side * (16 + e * 4), y, 2, 1, mix(PAL.hole, up ? ALARM : PAL.scent, 0.3 + 0.5 * wave(t, per, e * 0.15)));
      break;
    }
    case 'barracks': { // Gatehouse: a stone keep and gate; II battlements, ranks and a torch; III towers with pennants and gold
      const hw = L >= 2 ? 20 : 17;
      rect(c, cx - hw, y - 6, hw * 2, 12, PAL.hole);
      rect(c, cx - hw - 1, y - 8, hw * 2 + 2, 2, STONE); rect(c, cx - hw - 1, y + 6, hw * 2 + 2, 1, STONE);
      if (L >= 2) for (let e = 0; e < 7; e++) rect(c, cx - hw + e * 6, y - 10, 3, 2, L >= 3 && e % 3 === 0 ? GOLD : STONE_HI);
      const shut = gatesShut(ctx) ? 1 : 0;
      gateDrop += (shut - gateDrop) * 0.08;
      const gx = side < 0 ? cx - hw - 1 : cx + hw - 3, gh = Math.round(gateDrop * 11);
      rect(c, gx, y - 6, 4, 1, STONE_HI);
      for (let e = 0; e < 3; e++) rect(c, gx + e + (e ? 1 : 0), y - 6, 1, gh + 1, TWIG);
      for (let e = 0; e < Math.floor(gh / 3); e++) rect(c, gx, y - 5 + e * 3, 4, 1, TWIG);
      const soldiers = (ctx.state.jobs?.assigned?.soldier ?? 0) as number, most = L >= 2 ? 8 : 3;
      const n = Math.max(2, Math.min(most, Math.ceil(soldiers / Math.max(1, count(ctx, 'barracks')))));
      for (let e = 0; e < n; e++) { const row = L >= 2 ? e % 2 : 0, ex = cx - 13 + Math.floor(L >= 2 ? e / 2 : e) * 7 + row * 3; antAt(c, ex, y - 1 + row * 3, PAL.you, -side, shut && Math.floor(t * 1.5 + e) % 2 ? 1 : 0); }
      if (L >= 2) { const tx = side < 0 ? cx + hw - 4 : cx - hw + 3; rect(c, tx, y - 3, 1, 4, TWIG); rect(c, tx, y - 5, 1, 2, mix(PAL.amber, LAMP, wave(t, 0.4, k))); rect(c, tx - 1, y - 6, 3, 1, mix(PAL.hole, LAMP, 0.4 * wave(t, 0.55, k + 0.3))); }
      if (L >= 3) for (const tx of [cx - hw - 3, cx + hw + 1]) { rect(c, tx, y - 12, 3, 18, STONE); rect(c, tx, y - 13, 1, 1, STONE_HI); rect(c, tx + 2, y - 13, 1, 1, STONE_HI); pennant(c, tx + 1, y - 13, PAL.you, t, tx); }
      break;
    }
    case 'storeroom': { // Spoil walls: a pit and a clod ridge; II a hoist hauling baskets; III a taller ridge spiked with twig stakes
      rect(c, cx - 20, y - 5, 40, 11, PAL.hole);
      for (let e = 0; e < 4; e++) rect(c, cx - 18, y + 4 - e * 2, 16, 1, mix(PAL.dirt, PAL.soil, e % 2 ? 0.3 : 0));
      const most = L >= 3 ? 4 : L >= 2 ? 3 : 2, h = Math.min(most, 1 + Math.floor((S(ctx).walls ?? 0) / 4));
      for (let r = 0; r < h; r++) for (let e = 0; e < 6 - r; e++) rect(c, cx - 14 + r * 3 + e * 5, y - 7 - r * 2, 4, 2, mix(PAL.dirt, CRUST, ((e + r + k) % 3) * 0.2));
      if (L >= 3) for (let e = 0; e < 5; e++) { const sx = cx - 12 + e * 6, sy = y - 8 - (h - 1) * 2; rect(c, sx, sy - 3, 1, 3, TWIG); rect(c, sx, sy - 4, 1, 1, PAL.bone); }
      if (L >= 2) {
        rect(c, cx + 9, y - 5, 1, 10, TWIG); rect(c, cx + 4, y - 5, 10, 1, TWIG);
        const r = (t * 0.4 + k * 0.3) % 1, by = y + 3 - Math.floor((r < 0.5 ? r * 2 : 2 - r * 2) * 8);
        rect(c, cx + 5, y - 4, 1, by - y + 4, mix(PAL.hole, PAL.bone, 0.5)); rect(c, cx + 4, by, 3, 2, r < 0.5 ? PAL.dirt : TWIG);
      }
      antAt(c, cx - 1 + (L >= 2 ? 0 : Math.round(wave(t, 5, k) * 8)), y + 2, ANT_TINT, 1, Math.floor(t * 2) % 2);
      break;
    }
    case 'granary': { // Seed bank: shelves of resin-sealed pods; II three glowing shelves and a seedling; III a vault ring and a flower
      rect(c, cx - 20, y - 6, 40, 12, PAL.hole);
      rect(c, cx - 20, y - 7, 40, 1, L >= 3 ? GOLD : STONE);
      const shelves = L >= 2 ? 3 : 1;
      for (let r = 0; r < shelves; r++) {
        const sy = shelves === 1 ? y + 1 : y - 2 + r * 3;
        rect(c, cx - 19, sy, 26, 1, TWIG);
        for (let e = 0; e < 6; e++) {
          const px = cx - 18 + e * 4 + (r % 2) * 2, glow = L >= 2 ? wave(t, 3.5, (e + r * 2) * 0.45 + k) : 0;
          rect(c, px, sy - 2, 2, 2, PAL.seed); rect(c, px, sy - 3, 2, 1, mix(PAL.amber, LAMP, glow));
        }
      }
      if (L >= 2) {
        const sx = cx + 13, sw = wave(t, 2.5, k);
        rect(c, sx - 2, y + 3, 5, 3, CLAY); rect(c, sx, y - 1, 1, 4, PAL.food);
        rect(c, sx - 1, y - 2, 1, 1, mix(PAL.hole, PAL.food, 1 - sw)); rect(c, sx + 1, y - 2, 1, 1, mix(PAL.hole, PAL.food, sw));
        if (L >= 3) { rect(c, sx - 1, y - 4, 3, 1, mix(PAL.you, GOLD, wave(t, 3, k))); rect(c, sx, y - 5, 1, 1, GOLD); rect(c, sx, y - 3, 1, 1, LAMP); }
        else rect(c, sx, y - 3, 1, 1, LEAF_RIB);
      }
      if (L >= 3) { const r = (t * 0.2 + k * 0.3) % 1, gx = cx - 19 + Math.floor(r * 26); rect(c, gx, y - 6, 2, 1, mix(GOLD, PAL.bone, 0.5)); } // a glint running along the vault
      break;
    }
    case 'library': { // Hall of records: walls of glyphs and a tablet; II a sweeping light and elders; III a gold frame and rising motes
      rect(c, cx - 20, y - 8, 40, 14, PAL.hole);
      rect(c, cx - 20, y - 9, 40, 1, L >= 3 ? GOLD : mix(PAL.hole, PAL.dirt, 0.6));
      if (L >= 3) { rect(c, cx - 21, y - 9, 1, 15, GOLD); rect(c, cx + 20, y - 9, 1, 15, GOLD); }
      const sweep = (t * 0.25 + k * 0.17) % 1, sx = cx - 19 + Math.floor(sweep * 38);
      for (let r = 0; r < (L >= 2 ? 3 : 2); r++) for (let e = 0; e < 9; e++) {
        const gx = cx - 18 + e * 4 + (r % 2), near = L >= 2 ? Math.max(0, 1 - Math.abs(gx - sx) / 6) : 0;
        if ((e * 3 + r + k) % 4) rect(c, gx, y - 7 + r * 3, 2, 1, mix(r === 1 ? MEMORY : PAL.bone, LAMP, near * 0.8));
      }
      const kept = !!(ctx.state.lineage as { recorded?: string } | undefined)?.recorded, tg = kept ? 0.6 + 0.4 * wave(t, 2.5, k) : 0.35;
      rect(c, cx - 3, y - 1, 7, 4, mix(PAL.hole, JELLY, tg)); rect(c, cx - 2, y, 5, 1, mix(JELLY, PAL.bone, tg * 0.6)); rect(c, cx - 2, y + 2, 5, 1, mix(JELLY, PAL.amber, 0.5));
      if (L >= 2) for (const [ex, dir] of [[cx - 14, 1], [cx + 9, -1]] as [number, number][]) antAt(c, ex, y + 3, mix(ANT_TINT, PAL.bone, 0.3), dir, Math.floor(t * 0.7 + ex) % 2);
      if (L >= 3) for (let e = 0; e < 4; e++) { const r = (t * 0.4 + e / 4 + k * 0.1) % 1; rect(c, cx - 2 + e * 2, y - 2 - Math.floor(r * 6), 1, 1, mix(PAL.hole, GOLD, 1 - r)); }
      break;
    }
  }
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
  const mask = mouldMask(W, H);
  const top = surface ? 14 : 0;

  rect(c, 0, 0, W, H, PAL.soil);
  if (surface) {
    rect(c, 0, 0, W, 10, PAL.grass);
    rect(c, W / 2 - 10, 6, 20, 4, PAL.dirt); // entrance mound
  }

  const shaftX = W / 2;
  const bottom = 30 + rows * ROW_H + 8;
  maskInto(mask, PAL.hole); // every hollow drawn from here (shaft, tunnels, chambers), as it is this frame, is where mould can sit
  rect(c, shaftX - 3, surface ? 0 : 16, 6, bottom - (surface ? 0 : 16), PAL.hole);
  const qy = bottom + 2 + Math.ceil(qs.h / 2);
  blob(c, shaftX, qy, Math.max(18, Math.ceil(qs.w / 2) + 4), Math.max(6, Math.ceil(qs.h / 2) + 2), PAL.hole); // the queen's cell
  // the Undercroft: the deep reserve under the nest fills and drains; a daughter queen keeps her own cell
  const deepT = ctx.mods.get('storesTier');
  if (deepT) {
    const qx = shaftX + Math.max(18, Math.ceil(qs.w / 2) + 4) + 10, fill = Math.min(1, (ctx.state.wonders?.reserve ?? 0) / Math.max(1, ctx.res.cap('food')));
    const dw = 10 + deepT * 4;
    rect(c, qx, qy - 3, dw, 7, PAL.hole);
    if (fill > 0) rect(c, qx + 1, qy + 3 - Math.max(1, Math.round(fill * 5)), dw - 2, Math.max(1, Math.round(fill * 5)), fill >= 1 ? '#f2c14e' : PAL.amber);
  }
  if (ctx.mods.get('daughterQueen') > 0) {
    const dx = shaftX - Math.max(18, Math.ceil(qs.w / 2) + 4) - 16;
    blob(c, dx, qy, 9, 4, PAL.hole);
    rect(c, dx - 4, qy - 1, 7, 3, PAL.amber); rect(c, dx + 3, qy - 1, 2, 2, PAL.amber);
  }

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
  // the Undercroft: Wide tunnels are drawn wider, Root props brace them with roots
  const wideT = ctx.mods.get('tunnelsTier'), propT = ctx.mods.get('propsTier');
  placed.forEach((_, i) => {
    const { y, cx } = where(i), x0 = Math.min(shaftX, cx), len = Math.abs(cx - shaftX);
    rect(c, x0, y - 1 - Math.ceil(wideT / 2), len, 3 + wideT, PAL.hole);
    if (propT) for (let x = x0 + 4; x < x0 + len - 2; x += 7) {
      const top = y - 2 - Math.ceil(wideT / 2), bot = y + 2 + Math.floor(wideT / 2);
      rect(c, x, top - 1, 1, 2, '#6b4a2e');
      if (propT > 1) rect(c, x + 3, bot, 1, 2, '#6b4a2e');
      if (propT > 2) rect(c, x + 1, top - 2, 1, 1, '#8a6a3e');
    }
  });
  placed.forEach((id, i) => {
    const k = (counts[id] = (counts[id] ?? 0) + 1) - 1;
    const lane = LANES[i % LANES.length];
    const { y, cx } = where(i);
    spots.push({ x: cx, y });

    // a reworked chamber type is drawn whole by drawRework; the rest keep their plain look
    if (reworked(ctx, id) && REWORKS[id as ChamberId]) drawRework(c, ctx, id, cx, y, lane, k, t, reworkLevel(ctx, id));
    else switch (id) {
      case 'tunnel': { // a resting chamber: a low room with a few workers curled up asleep
        blob(c, cx, y, 15, 5, PAL.hole);
        for (let e = 0; e < 3; e++) { const sx = cx - 9 + e * 7 + ((k + e) % 2); rect(c, sx, y + 1, 3, 2, ANT_TINT); rect(c, sx + 3, y + 2, 1, 1, ANT_TINT); }
        break;
      }
      case 'brood': { // the brood chamber: eggs in a cluster, a curled larva or two, and a nurse leaning over them
        blob(c, cx, y, 16, 5, PAL.hole);
        const n = Math.min(10, Math.max(3, Math.ceil(broodCount / Math.max(1, count(ctx, 'warmth')))));
        for (let e = 0; e < n; e++) rect(c, cx - 11 + (e % 5) * 4, y + 1 - Math.floor(e / 5) * 2, 2, 2, e % 3 === 2 ? LARVA : PAL.bone);
        rect(c, cx + 9, y - 1, 3, 2, ANT_TINT); rect(c, cx + 8, y, 1, 1, ANT_TINT); rect(c, cx + 10, y + 1, 1, 2, ANT_TINT); // the nurse
        break;
      }
      case 'store': { // a food store: a heap that rises and falls with your stores, seeds and crumbs mixed in
        dome(c, cx, y, 18, PAL.hole);
        const h = Math.max(1, Math.round(fillFood * 5));
        for (let r = 0; r < h; r++) rect(c, cx - 11 + r, y + 4 - r - 1, 22 - r * 2, 1, r % 2 ? FOOD_DARK : PAL.food);
        if (h > 1) { rect(c, cx - 6, y + 3 - h + 1, 2, 1, PAL.seed); rect(c, cx + 3, y + 3 - Math.max(1, h - 1), 2, 1, CRUMB); }
        rect(c, cx - 15, y + 4, 2, 1, PAL.food); rect(c, cx + 13, y + 4, 1, 1, PAL.food); // a few spilled bits
        break;
      }
      case 'granary': { // seeds with sprouts that sway
        blob(c, cx, y, 15, 5, PAL.hole);
        for (let e = 0; e < 6; e++) rect(c, cx - 10 + e * 4, y + 2, 2, 2, PAL.seed);
        for (let e = 0; e < 3; e++) { const w = wave(t, 3, e * 0.9 + k); rect(c, cx - 8 + e * 8, y - 1, 1, 3, PAL.food); rect(c, cx - 8 + e * 8, y - 3, 1, 2, mix(PAL.hole, PAL.food, 1 - w)); rect(c, cx - 7 + e * 8, y - 3, 1, 2, mix(PAL.hole, PAL.food, w)); }
        break;
      }
      case 'gallery': { // a resin gallery: a big chamber sealed with an amber rim, a few drips hanging from the roof
        blob(c, cx, y, 22, 7, PAL.amber);
        blob(c, cx, y, 19, 5, PAL.hole);
        rect(c, cx - 11, y - 4, 22, 1, RESIN_DARK); // the roof's dark seam, inside the amber wall
        for (const [dx, h] of [[-11, 2], [-3, 3], [6, 1], [13, 2]] as const) { rect(c, cx + dx, y - 4, 1, h, PAL.amber); rect(c, cx + dx, y - 4 + h, 1, 1, mix(PAL.amber, PAL.hole, 0.5)); }
        rect(c, cx - 15, y + 3, 30, 1, mix(PAL.hole, PAL.amber, 0.25)); // the sealed floor
        break;
      }
      case 'gland': { // a scent chamber whose motes slowly glow and fade, out of step with each other
        blob(c, cx, y, 14, 5, PAL.hole);
        const glow = (phase: number) => mix(PAL.hole, PAL.scent, 0.2 + 0.5 * (0.5 - 0.5 * Math.cos((t * 0.8 + k * 0.37 + phase) * Math.PI * 2 / 2.4)));
        for (let e = 0; e < 7; e++) rect(c, cx - 12 + e * 4, y + 3 - (e % 2), 2, 1, mix(PAL.hole, PAL.scent, 0.3)); // a scent trail laid along the floor
        rect(c, cx - 1, y - 1, 2, 2, mix(PAL.hole, PAL.scent, 0.55 + 0.45 * Math.sin((t * 0.8 + k) * Math.PI * 2 / 3)));
        rect(c, cx - 7, y - 3, 2, 2, glow(0));
        rect(c, cx + 5, y + 1, 2, 2, glow(1.2));
        rect(c, cx + 9, y - 2, 1, 1, glow(0.6));
        rect(c, cx - 10, y + 1, 1, 1, glow(1.8));
        break;
      }
      case 'barracks': { // a guard post: a squared chamber, a row of sharpened twig stakes, and soldiers standing in line
        rect(c, cx - 16, y - 5, 32, 10, PAL.hole);
        rect(c, cx - 16, y - 6, 32, 1, PAL.dirt);
        const n = Math.max(2, Math.min(6, Math.ceil(soldiers / Math.max(1, count(ctx, 'barracks')))));
        for (let e = 0; e < n; e++) { rect(c, cx - 13 + e * 5, y - 2, 2, 4, PAL.you); rect(c, cx - 13 + e * 5, y - 3, 2, 1, mix(PAL.you, PAL.bone, 0.3)); }
        const sx = lane > 0 ? cx - 16 : cx + 14; // stakes on the side facing the shaft
        for (let e = 0; e < 3; e++) { rect(c, sx, y - 3 + e * 3, 2, 1, TWIG); rect(c, sx + (lane > 0 ? -1 : 2), y - 3 + e * 3, 1, 1, PAL.bone); }
        rect(c, cx - 14, y + 4, 28, 1, PAL.dirt);
        break;
      }
      case 'fungus': { // a fungus bed: green tufts on a mat of cut leaves, grey if mould has it
        blob(c, cx, y, 16, 5, PAL.hole);
        rect(c, cx - 12, y + 1, 24, 2, PAL.grass);
        const mouldy = k < (ctx.state.garden?.mould ?? 0);
        for (let e = 0; e < 5; e++) { const col = mouldy ? '#8a8a80' : PAL.food; rect(c, cx - 10 + e * 5, y - 2, 3, 3, col); rect(c, cx - 10 + e * 5, y - 3, 3, 1, mix(PAL.hole, col, mouldy ? 1 : 0.35 + 0.65 * wave(t, 4, e * 0.8 + k))); }
        break;
      }
      case 'midden': { // the midden: a layered heap of waste, husks and old food, kept well away from the brood
        dome(c, cx, y, 17, PAL.hole);
        for (let r = 0; r < 5; r++) rect(c, cx - 2 - r * 2, y - 2 + r, 4 + r * 4, 1, r % 2 ? WASTE_DARK : PAL.waste);
        rect(c, cx - 5, y + 1, 2, 1, FOOD_DARK); rect(c, cx + 4, y, 2, 1, CHITIN); rect(c, cx + 1, y + 2, 1, 1, PAL.bone);
        rect(c, cx - 11, y + 3, 1, 1, PAL.waste); rect(c, cx + 11, y + 3, 2, 1, PAL.waste);
        break;
      }
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
      case 'library': { // the hall of elders: scent marks along the walls, and two old workers reading them
        rect(c, cx - 17, y - 5, 34, 11, PAL.hole);
        rect(c, cx - 17, y - 6, 34, 1, mix(PAL.hole, PAL.dirt, 0.5));
        for (let r = 0; r < 2; r++) for (let e = 0; e < 6; e++) if ((e + r + k) % 3) rect(c, cx - 13 + e * 5, y - 4 + r * 3, 2 + ((e + r) % 2), 1, r ? MEMORY : PAL.bone);
        for (const ex of [cx - 6, cx + 5]) { rect(c, ex, y + 2, 3, 2, ANT_TINT); rect(c, ex + 3, y + 2, 1, 1, ANT_TINT); rect(c, ex + 3, y + 1, 1, 1, mix(PAL.hole, ANT_TINT, 0.6)); } // antennae raised to the wall
        break;
      }
      case 'husks': { // the hall of husks: walls shored up with curved raider shells, dark seams between them
        blob(c, cx, y, 17, 6, PAL.hole);
        for (let e = 0; e < 4; e++) {
          const x = cx - 15 + e * 8;
          rect(c, x + 1, y - 5, 5, 1, PAL.rival); rect(c, x, y - 4, 7, 1, PAL.rival); rect(c, x + 1, y - 3, 5, 1, HUSK_DARK);
          rect(c, x + 1, y + 4, 5, 1, PAL.rival); rect(c, x, y + 3, 7, 1, HUSK_DARK);
        }
        // the trophy wall: one skull for each kind of foe killed (or one old head, before any)
        const skulls = Math.max(1, Math.min(8, ctx.state.war?.skulls?.length ?? 0));
        for (let e = 0; e < skulls; e++) {
          const sx = cx - skulls * 2 + e * 4, sy = y - 1, bone = mix(PAL.rival, PAL.bone, 0.3 + 0.08 * (e % 3));
          rect(c, sx, sy - 1, 3, 2, bone); rect(c, sx + 1, sy + 1, 1, 1, bone); // dome, then the jaw
          rect(c, sx, sy, 1, 1, PAL.hole); rect(c, sx + 2, sy, 1, 1, PAL.hole); // eye holes
        }
        break;
      }
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
      case 'hall': { // a worker hall: a long low chamber held up by two pillars, workers asleep in a row
        rect(c, cx - 18, y - 3, 36, 7, PAL.hole);
        rect(c, cx - 18, y - 4, 36, 1, mix(PAL.hole, PAL.dirt, 0.5));
        for (const px of [cx - 7, cx + 6]) rect(c, px, y - 3, 2, 7, PAL.dirt);
        for (let i = 0; i < 6; i++) { const sx = cx - 16 + i * 6 + (i >= 2 ? 2 : 0) + (i >= 4 ? 2 : 0); rect(c, sx, y + 1, 3, 2, ANT_TINT); rect(c, sx + 3, y + 2, 1, 1, ANT_TINT); }
        break;
      }
      case 'waxworks': // a wax store: a honeycomb of yellow cells
        blob(c, cx, y, 15, 5, PAL.hole);
        for (let r = 0; r < 2; r++) for (let e = 0; e < 4; e++) rect(c, cx - 10 + e * 6 + r * 3, y - 3 + r * 4, 4, 3, PAL.seed);
        break;
      case 'spoil': { // a digging gallery: loose soil piled up the far wall, a few clods rolled down
        dome(c, cx, y, 18, PAL.hole);
        const mx = cx + (lane > 0 ? 5 : -5);
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
      case 'vent':
      case 'airshaft': { // a purification chamber: a wide cone drawing fresh air up a vent, motes rising from the floor
        dome(c, cx, y, 18, PAL.hole);
        rect(c, cx - 2, y - 11, 4, 6, PAL.hole); // the vent through the roof
        for (let e = 0; e < 5; e++) {
          const r = ((t * 0.5 + e / 5 + k * 0.37) % 1);
          const sx = cx + Math.round((e - 2) * 6 * (1 - r)); // motes start across the floor and gather toward the vent
          rect(c, sx, y + 4 - Math.floor(r * 15), 1, 1, mix(PAL.hole, PAL.bone, 0.65 * (1 - r)));
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
      case 'memory': { // a memory vault: tall columns of stored scent on stone footings, one slowly brightening at a time
        rect(c, cx - 16, y - 5, 32, 10, PAL.hole);
        rect(c, cx - 15, y + 4, 30, 1, PAL.stone);
        const lit = Math.floor(t / 4 + k) % 6, glow = 0.5 - 0.5 * Math.cos(((t / 4 + k) % 1) * Math.PI * 2);
        for (let e = 0; e < 6; e++) { const h = 4 + ((e * 3 + k) % 4); rect(c, cx - 14 + e * 5, y + 4 - h, 3, h, e === lit ? mix(MEMORY, PAL.bone, 0.35 * glow) : MEMORY); rect(c, cx - 14 + e * 5, y + 4 - h, 3, 1, mix(MEMORY, PAL.bone, 0.4)); }
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
      case 'clayhall': { // a clay hall: a tall vault lined with smooth red clay, ribbed with clay arches
        dome(c, cx, y, 19, CLAY);
        dome(c, cx, y + 1, 16, PAL.hole);
        for (const px of [cx - 9, cx, cx + 9]) rect(c, px, y - 3, 1, 8, CLAY);
        for (let i = 0; i < 4; i++) { const sx = cx - 13 + i * 7; rect(c, sx, y + 3, 3, 2, ANT_TINT); rect(c, sx + 3, y + 4, 1, 1, ANT_TINT); }
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
  maskInto(null);
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
  drawMould(c, ctx, rooms, shaftX, t);
}

const SPORES = ['#f08cc0', '#7cb4f0', '#8ee07a'];
/** The chambers' hollows (stamped while they are drawn) and a scratch layer the mould is painted on, then cut to them. */
let maskCv: HTMLCanvasElement | null = null, layerCv: HTMLCanvasElement | null = null;
function mouldMask(W: number, H: number) {
  for (const cv of [maskCv ??= document.createElement('canvas'), layerCv ??= document.createElement('canvas')]) {
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }
  const m = maskCv.getContext('2d')!;
  m.clearRect(0, 0, W, H);
  return m;
}
/** Mould as a see-through film over every room, with pink, blue and green spores that thicken as it grows.
 *  It is cut to the hollows (shaft, tunnels, chambers), so it matches each room's shape and size exactly. */
function drawMould(c: CanvasRenderingContext2D, ctx: Context, rooms: { x: number; y: number; w: number }[], shaftX: number, t: number) {
  if (!ctx.res.has('mould') || !maskCv || !layerCv) return;
  const f = Math.min(1, ctx.res.amt('mould') / BROOD.mould.weak);
  if (f < 0.02) return;
  const l = layerCv.getContext('2d')!;
  l.globalCompositeOperation = 'source-over';
  l.globalAlpha = 1;
  l.clearRect(0, 0, layerCv.width, layerCv.height);
  l.globalAlpha = 0.12 + 0.2 * f;
  rect(l, 0, 0, layerCv.width, layerCv.height, mix('#5e8a5a', '#9a5e88', 0.5 + 0.5 * Math.sin(t * 0.3)));
  // each chamber's tint reaches along its tunnel: to the shaft for the nearest lane, else halfway to the next chamber
  const box = (r: { x: number; y: number }, last: boolean) => {
    if (last) return [r.x - 60, r.y - 14, 120, 40]; // the queen's cell
    const d = Math.abs(r.x - shaftX), l = LANE_X.indexOf(d), s = Math.sign(r.x - shaftX);
    const inner = l <= 1 ? 3 : (LANE_X[l - 1] + d) / 2, outer = l >= LANE_X.length - 1 ? d + 30 : (d + LANE_X[l + 1]) / 2;
    const a = shaftX + s * inner, b = shaftX + s * outer;
    return [Math.min(a, b), r.y - 11, Math.abs(b - a), ROW_H];
  };
  rooms.forEach((r, i) => {
    const [bx, by, bw, bh] = box(r, i === rooms.length - 1);
    l.globalAlpha = 1;
    l.clearRect(bx, by, bw, bh);
    l.globalAlpha = 0.12 + 0.2 * f;
    rect(l, bx, by, bw, bh, mix('#5e8a5a', '#9a5e88', 0.5 + 0.5 * Math.sin(t * 0.3 + i)));
    const n = Math.ceil(f * 14);
    for (let e = 0; e < n; e++) {
      const h = Math.imul(i * 97 + e * 131 + 7, 2654435761) >>> 0;
      const dx = (h % (2 * r.w + 4)) - r.w - 2, dy = ((h >>> 8) % 9) - 4;
      const drift = Math.sin(t * 0.5 + e * 1.7 + i) * 1.5;
      l.globalAlpha = (0.35 + 0.45 * f) * (0.5 + 0.5 * wave(t, 3 + (e % 4), e * 0.9 + i));
      const sz = (h >>> 16) % 5 === 0 ? 2 : 1;
      rect(l, Math.round(r.x + dx + drift), Math.round(r.y + dy - (t * 0.6 + e) % 3), sz, sz, SPORES[(h >>> 4) % 3]);
    }
  });
  l.globalAlpha = 1;
  l.globalCompositeOperation = 'destination-in';
  l.drawImage(maskCv, 0, 0);
  c.drawImage(layerCv, 0, 0);
}
