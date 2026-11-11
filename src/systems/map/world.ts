// The world above the garden. From the Age of Wings the Map zooms out: the garden is one cell of a
// WORLD.size x WORLD.size grid, and every cell is a whole local map of its own. Winged scouts fly sorties
// to reveal cells, bring back finds, and spot landmarks (lasting bonuses for the line) and kin colonies.
// Only the layout (biomes, landmarks, kin) is derived from the map seed; what has been seen is saved.
import type { Context } from '../../core/types';
import { PAL, rect } from '../../core/pixel';
import { MAP, WORLD } from '../../data/balance';
import { TOWN } from '../../data/town';
import type { Terrain, Tile } from './index';

export interface Sortie { cell: number; elapsed: number; duration: number; ants: number; risk: number; wind: Wind }
export interface Assault { cell: number; i: number; army: number; elapsed: number; duration: number }
export interface WorldState {
  seen: number[]; wind: number; windT: number; sortie: Sortie | null; found: string[]; kin: string[]; sorties: number; lost: number; intro?: boolean;
  /** Land held beyond the garden: cell -> tile indices. */
  held?: Record<number, number[]>;
  /** Hostile colonies that have fallen. */
  fallen?: string[];
  assault?: Assault | null;
}
type Wind = 'down' | 'up' | 'cross';

const N = WORLD.size;
export const HOME = WORLD.home[1] * N + WORLD.home[0];
export const cxy = (c: number) => [c % N, Math.floor(c / N)] as const;
export const ring = (c: number) => { const [x, y] = cxy(c); return Math.max(Math.abs(x - WORLD.home[0]), Math.abs(y - WORLD.home[1])); };
const SW = WORLD.sortie;
/** Captain's mark upgrades, read from mods once a tick (the sortie helpers below take no ctx). */
const SKY = { speed: 0, loot: 0, risk: 0 };

export function newWorld(): WorldState {
  return { seen: [HOME], wind: Math.floor(Math.random() * 4), windT: 0, sortie: null, found: [], kin: [], sorties: 0, lost: 0 };
}
export const W = (ctx: Context) => (ctx.state.map.world ??= newWorld()) as WorldState;
/** The World view: open with Sky scouts, and kept for good once the line has seen beyond the garden. */
export const skyOpen = (ctx: Context) => ctx.flags.has('tech:sky') || (ctx.state.map?.world?.seen?.length ?? 0) > 1 || ctx.flags.has('legacy:migrated');

// ---- layout: which biome each cell is, and where the landmarks and kin are ----
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export interface Cell { biome: string; landmark?: string; kin?: string; seed: number; kinAt?: [number, number]; foe?: string; foeAt?: [number, number] }
const layouts = new Map<number, Cell[]>();
export function layout(seed: number): Cell[] {
  const hit = layouts.get(seed); if (hit) return hit;
  const R = rng(seed ^ 0x5eed5);
  const kinds = Object.keys(WORLD.biomes);
  const cells: Cell[] = [];
  for (let c = 0; c < N * N; c++) {
    let biome = kinds[Math.floor(R() * kinds.length)];
    if (biome === 'pond' && R() < 0.5) biome = 'meadow'; // ponds are rarer
    cells.push({ biome: c === HOME ? 'garden' : biome, seed: Math.floor(R() * 1e9) });
  }
  const shuffled = (list: number[]) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const all = cells.map((_, c) => c).filter((c) => c !== HOME);
  // the first landmark is always next door, so the first sorties pay off
  const near = shuffled(all.filter((c) => ring(c) === 1)), far = shuffled(all.filter((c) => ring(c) >= 1 && ring(c) <= 3));
  const used = new Set<number>();
  WORLD.landmarks.forEach((l, i) => { const c = (i === 0 ? near : far).find((c) => !used.has(c) && cells[c].biome !== 'pond')!; used.add(c); cells[c].landmark = l.id; });
  const kinCells = shuffled(all.filter((c) => ring(c) >= 2 && !used.has(c) && cells[c].biome !== 'pond'));
  WORLD.kin.forEach((k, i) => { const c = kinCells[i]; cells[c].kin = k.id; cells[c].kinAt = [8 + Math.floor(R() * 24), 5 + Math.floor(R() * 14)]; });
  // hostile colonies, from their own stream so older layouts keep their landmarks and kin where they were
  const F = rng(seed ^ 0xf0e5);
  const free = (c: number) => c !== HOME && !cells[c].landmark && !cells[c].kin && cells[c].biome !== 'pond';
  const mix = (list: number[]) => list.map((c) => [F(), c] as const).sort((a, b) => a[0] - b[0]).map(([, c]) => c);
  const foeCells = [...mix(all.filter((c) => ring(c) === 1 && free(c))).slice(0, 1), ...mix(all.filter((c) => ring(c) >= 2 && free(c)))];
  WORLD.foes.forEach((f, i) => { const c = foeCells[i]; if (c == null) return; cells[c].foe = f.id; cells[c].foeAt = [8 + Math.floor(F() * 24), 5 + Math.floor(F() * 14)]; });
  layouts.set(seed, cells);
  return cells;
}

/** A cell's local map: the same 40x24 grid as the garden, shaped by its biome. */
const terrains = new Map<string, Terrain[]>();
export function cellTerrain(seed: number, c: number): Terrain[] {
  const key = seed + ':' + c; const hit = terrains.get(key); if (hit) return hit;
  const cell = layout(seed)[c], b = WORLD.biomes[cell.biome];
  const R = rng(cell.seed);
  const G: number[] = []; for (let i = 0; i < 64 * 64; i++) G.push(R());
  const g = (x: number, y: number) => G[(y & 63) * 64 + (x & 63)];
  const sm = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi); const a = g(xi, yi), bb = g(xi + 1, yi), cc = g(xi, yi + 1), d = g(xi + 1, yi + 1); return a + (bb - a) * xf + (cc - a) * yf + (a - bb - cc + d) * xf * yf; };
  const fbm = (x: number, y: number) => noise(x / 7, y / 7) * 0.6 + noise(x / 3, y / 3) * 0.3 + noise(x, y) * 0.1;
  const px = 6 + R() * 22, py = 4 + R() * 12, pw = 6 + R() * 8, ph = 4 + R() * 6;
  const out: Terrain[] = [];
  for (let y = 0; y < MAP.rows; y++) for (let x = 0; x < MAP.cols; x++) {
    const h = fbm(x, y), wet = fbm(x + 31, y + 17);
    let t: Terrain = wet < b.water * 1.2 ? 'water' : h > b.stone ? 'stone' : h < b.soil ? 'soil' : 'grass';
    if (b.paved && x >= px && x < px + pw && y >= py && y < py + ph) t = 'paved';
    if (cell.biome === 'field' && t === 'grass' && y % 3 === 0) t = 'soil'; // furrows
    out.push(t);
  }
  terrains.set(key, out);
  return out;
}

// ---- land beyond the garden ----
export type WOwner = 'you' | 'foe' | 'kin' | null;
export const foeOf = (id: string) => WORLD.foes.find((f) => f.id === id)!;
export const held = (w: WorldState, c: number) => w.held?.[c] ?? [];
const near = (i: number, at: [number, number] | undefined, r: number) => !!at && Math.hypot((i % MAP.cols) - at[0], (Math.floor(i / MAP.cols) - at[1]) * 1.1) < r;
/** Terrain of any cell beyond the garden: a world cell or a town cell. */
export const terrainAt = (seed: number, c: number) => (isTown(c) ? townTerrain(seed, c) : cellTerrain(seed, c));
/** Town sites pavement ants still hold (set each tick from the town state). */
let townHeld: string[] = [];
/** Who holds tile i of foreign cell c. */
export function ownerAt(seed: number, w: WorldState, c: number, i: number): WOwner {
  if (held(w, c).includes(i)) return 'you';
  if (isTown(c)) return townHeld.includes(townSite(c)) ? 'foe' : null;
  const cell = layout(seed)[c];
  if (cell.kin && near(i, cell.kinAt, 3)) return 'kin';
  if (cell.foe && !w.fallen?.includes(cell.foe) && near(i, cell.foeAt, WORLD.foeRadius) && cellTerrain(seed, c)[i] !== 'water') return 'foe';
  return null;
}
export const isFoeCore = (seed: number, c: number, i: number) => { if (isTown(c)) return false; const at = layout(seed)[c].foeAt; return !!at && i === at[1] * MAP.cols + at[0]; };
/** Do you hold the tile at global coordinates gx, gy (garden or beyond)? */
function youAt(seed: number, w: WorldState, home: Tile[], gx: number, gy: number) {
  if (gx < 0 || gy < 0 || gx >= WIDTH * MAP.cols || gy >= N * MAP.rows) return false;
  const c = gridCell(Math.floor(gx / MAP.cols), Math.floor(gy / MAP.rows)), i = (gy % MAP.rows) * MAP.cols + (gx % MAP.cols);
  if (c == null) return false;
  return c === HOME ? home[i]?.o === 'you' : held(w, c).includes(i);
}
/** Next to land you hold, counting across cell borders. */
export function besideYou(seed: number, w: WorldState, home: Tile[], c: number, i: number) {
  const [cx, cy] = gridXY(c), gx = cx * MAP.cols + (i % MAP.cols), gy = cy * MAP.rows + Math.floor(i / MAP.cols);
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => youAt(seed, w, home, gx + dx, gy + dy));
}
export const reachable = (ctx: Context, c: number) => isTown(c)
  ? townHome(ctx) && (!TOWN.sites[townSite(c)].needs || ctx.flags.has(TOWN.sites[townSite(c)].needs!))
  : ctx.flags.has('tech:bordernests') && c !== HOME && ring(c) <= WORLD.claim.ring && isSeen(W(ctx), c);
export function canClaimAt(ctx: Context, c: number, i: number) {
  const w = W(ctx), seed = ctx.state.map.seed;
  if (!reachable(ctx, c) || ownerAt(seed, w, c, i) !== null) return false;
  if (terrainAt(seed, c)[i] === 'water' && !ctx.flags.has('tech:rafts')) return false;
  return besideYou(seed, w, ctx.state.map.tiles, c, i);
}
export function canAssault(ctx: Context, c: number, i: number) {
  const w = W(ctx), seed = ctx.state.map.seed;
  return !isTown(c) && reachable(ctx, c) && ctx.flags.has('tech:campaigns') && ownerAt(seed, w, c, i) === 'foe' && besideYou(seed, w, ctx.state.map.tiles, c, i);
}
export const foeStrength = (seed: number, c: number, i: number) => foeOf(layout(seed)[c].foe!).power * (isFoeCore(seed, c, i) ? WORLD.coreMult : 1);
export function takeTile(ctx: Context, c: number, i: number) {
  const w = W(ctx);
  ((w.held ??= {})[c] ??= []).includes(i) || w.held[c].push(i);
}
/** Every tile held beyond the garden, with its terrain. */
export function heldTerrain(ctx: Context): Terrain[] {
  const w = W(ctx), seed = ctx.state.map.seed, out: Terrain[] = [];
  for (const [c, list] of Object.entries(w.held ?? {})) { const T = terrainAt(seed, +c); for (const i of list) out.push(T[i]); }
  return out;
}
const soldiers = (ctx: Context) => Math.floor(ctx.state.jobs?.assigned?.soldier ?? 0);
export const assaultArmy = soldiers;
export function sendAssault(ctx: Context, c: number, i: number) {
  W(ctx).assault = { cell: c, i, army: soldiers(ctx), elapsed: 0, duration: WORLD.assault.time };
}
function finishAssault(ctx: Context) {
  const w = W(ctx), a = w.assault!, seed = ctx.state.map.seed;
  w.assault = null;
  ctx.ping('map');
  if (ownerAt(seed, w, a.cell, a.i) !== 'foe') { ctx.log('The soldiers come home. Nobody is left to fight there.', 'info'); return; }
  const cell = layout(seed)[a.cell], foe = foeOf(cell.foe!), core = isFoeCore(seed, a.cell, a.i);
  const enemy = foeStrength(seed, a.cell, a.i);
  const ours = a.army * (1 + ctx.mods.get('soldierPower')) * (0.85 + Math.random() * 0.3);
  const win = ours >= enemy;
  const lost = Math.min(a.army, Math.ceil(a.army * WORLD.assault.loss * (win ? 1 : 2)));
  ctx.res.add('ant', -lost);
  const jobs = ctx.state.jobs?.assigned; if (jobs) jobs.soldier = Math.max(0, (jobs.soldier ?? 0) - lost);
  if (!win) {
    ctx.announce('Repulsed', `${foe.name} holds. ${lost} soldiers fell. They needed about ${Math.ceil(enemy)} strength; you brought ${Math.floor(ours)}.`, { small: true, kicker: 'Assault', loss: true });
    ctx.log(`The assault on ${foe.name} fails. ${lost} soldiers do not return.`, 'warn');
    return;
  }
  const got = Object.entries(foe.loot).filter(([r]) => ctx.res.has(r)).map(([r, [lo, hi]]) => { const n = Math.round((lo + Math.random() * (hi - lo)) * (core ? 4 : 1)); ctx.res.add(r, n); return `+${n} ${r}`; });
  const hon = core ? WORLD.assault.fallHonours : WORLD.assault.honours;
  if (ctx.res.has('honour')) { ctx.res.add('honour', hon); if (ctx.state.war) ctx.state.war.honoured = (ctx.state.war.honoured ?? 0) + hon; got.push(`+${hon} war honours`); }
  takeTile(ctx, a.cell, a.i);
  ctx.bus.emit('world:capture', { cell: a.cell, i: a.i });
  if (core) {
    (w.fallen ??= []).push(foe.id);
    ctx.announce(`${foe.name} falls`, `Their queen is dead and the ${foe.kind} scatter. Their land lies open to claim.`, { kicker: 'Conquest', lines: [...got, ...(lost ? [`${lost} soldiers fell`] : [])] });
    ctx.log(`${foe.name} falls. Their land lies open.`, 'story');
  } else {
    ctx.announce('Victory', `A tile taken from ${foe.name}.`, { small: true, kicker: 'Assault', lines: [...got, ...(lost ? [`${lost} soldiers fell`] : [])] });
    ctx.log(`Your soldiers take a tile from ${foe.name}. ${got.join(', ')}. ${lost} fell.`, 'info');
  }
}

// ---- wind and sorties ----
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const FROM = ['the south', 'the west', 'the north', 'the east']; // the wind blows *toward* DIRS[wind]
export const windName = (w: WorldState) => `Wind from ${FROM[w.wind]}`;
export function windFor(w: WorldState, c: number): Wind {
  const [x, y] = cxy(c), dx = x - WORLD.home[0], dy = y - WORLD.home[1];
  const [wx, wy] = DIRS[w.wind], dot = (dx * wx + dy * wy) / Math.hypot(dx, dy);
  return dot > 0.5 ? 'down' : dot < -0.5 ? 'up' : 'cross';
}
const windMul = (wind: Wind, k: 'time' | 'birds') => (wind === 'down' ? SW.downwind[k] : wind === 'up' ? SW.upwind[k] : 1);
export const sortieCost = (c: number) => Object.fromEntries(Object.entries(SW.cost).map(([k, v]) => [k, v * ring(c)]));
export const sortieAnts = (c: number) => SW.scouts + SW.scoutsPerRing * ring(c);
export const sortieTime = (w: WorldState, c: number) => Math.round((SW.time + SW.timePerRing * ring(c)) * windMul(windFor(w, c), 'time') / (1 + SKY.speed));
export const sortieRisk = (w: WorldState, c: number) => Math.min(0.6, SW.birds * ring(c) * windMul(windFor(w, c), 'birds') * Math.max(0, 1 + SKY.risk));
export const isSeen = (w: WorldState, c: number) => w.seen.includes(c);
/** Sorties fly to fogged cells next to (or diagonal to) a cell already seen. */
export function frontier(w: WorldState, c: number) {
  if (isSeen(w, c)) return false;
  const [x, y] = cxy(c);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const X = x + dx, Y = y + dy;
    if (X >= 0 && Y >= 0 && X < N && Y < N && isSeen(w, Y * N + X)) return true;
  }
  return false;
}
export function sendSortie(ctx: Context, c: number) {
  const w = W(ctx);
  w.sortie = { cell: c, elapsed: 0, duration: sortieTime(w, c), ants: sortieAnts(c), risk: sortieRisk(w, c), wind: windFor(w, c) };
}
export const lmName = (id: string) => WORLD.landmarks.find((l) => l.id === id)!;
export const kinOf = (id: string) => WORLD.kin.find((k) => k.id === id)!;
export const biomeName = (cell: Cell) => (cell.biome === 'garden' ? 'The garden' : WORLD.biomes[cell.biome].name);

export function finishSortie(ctx: Context) {
  const w = W(ctx), s = w.sortie!;
  w.sortie = null;
  ctx.ping('map');
  if (Math.random() < s.risk) {
    const lost = Math.ceil(s.ants / 2);
    ctx.res.add('ant', -lost);
    const jobs = ctx.state.jobs?.assigned; if (jobs) jobs.scout = Math.max(0, (jobs.scout ?? 0) - lost);
    w.lost += lost;
    ctx.log(`Birds. ${lost} winged scouts never come home, and the rest saw nothing worth telling.`, 'warn');
    return;
  }
  w.sorties++;
  if (!w.seen.includes(s.cell)) w.seen.push(s.cell);
  const cell = layout(ctx.state.map.seed)[s.cell], r = ring(s.cell);
  const got: string[] = [];
  for (const [k, v] of Object.entries(SW.find)) if (ctx.res.has(k) && ctx.res.get(k).seen) { const n = Math.round(v * r * (0.6 + Math.random() * 0.8) * (1 + SKY.loot)); ctx.res.add(k, n); got.push(`${n} ${ctx.res.get(k).name.toLowerCase()}`); }
  const marks = SW.marksPerRing * r;
  ctx.res.add('captmark', marks); got.push(`${marks} captain's marks`);
  ctx.log(`The sortie comes home from the ${biomeName(cell).toLowerCase()}` + (got.length ? ` with ${got.join(', ')}.` : '.'), 'info');
  if (cell.landmark && !w.found.includes(cell.landmark)) {
    w.found.push(cell.landmark);
    const l = lmName(cell.landmark);
    ctx.announce(l.name, l.desc.replace('{p}', Math.round(Math.abs(l.per) * 100) + '%'), { small: true, kicker: 'Landmark found' });
  }
  if (cell.kin && !w.kin.includes(cell.kin)) {
    w.kin.push(cell.kin);
    const k = kinOf(cell.kin);
    ctx.announce(k.name, `Another nest of our own kind. Their scent is close to ours, and they are ${k.temper}. They let the scouts land, and watch them leave.`, { small: true, kicker: 'Kin colony found' });
  }
}

export function tickWorld(ctx: Context, dt: number) {
  const w = W(ctx);
  SKY.speed = ctx.mods.get('sortieSpeed'); SKY.loot = ctx.mods.get('sortieLoot'); SKY.risk = ctx.mods.get('sortieRisk');
  if (!skyOpen(ctx)) return;
  if (!w.intro) {
    w.intro = true;
    ctx.announce('The sky', 'Winged scouts rise above the garden for the first time. It is one small patch of a world far bigger than the colony ever knew. Open the Map and look up.', { kicker: 'Age of Wings' });
  }
  if ((w.windT += dt) >= SW.windEvery) { w.windT = 0; w.wind = (w.wind + (Math.random() < 0.5 ? 1 : 3)) % 4; }
  if (w.sortie && (w.sortie.elapsed += dt) >= w.sortie.duration) finishSortie(ctx);
  if (w.assault && (w.assault.elapsed += dt) >= w.assault.duration) finishAssault(ctx);
  townHeld = TOWN_SITES.filter((id) => TOWN.sites[id].rival && !ctx.state.town?.cleared?.includes(id));
  // after a migration the new nest is dug into the warm walls: the first town tile is yours
  if (townHome(ctx) && !TOWN_SITES.some((_, k) => held(w, TOWN0 + k).length)) {
    const k = Math.max(0, TOWN_SITES.indexOf('walls'));
    takeTile(ctx, TOWN0 + k, Math.floor(MAP.rows / 2) * MAP.cols + Math.floor(MAP.cols / 2));
    ctx.log('The new nest is dug into the warm walls of the house. The garden is still ours, far across the water.', 'story');
  }
  // landmarks help every colony of the line
  const sum: Record<string, number> = {};
  for (const id of w.found) { const l = lmName(id); sum[l.mod] = (sum[l.mod] ?? 0) + l.per; }
  for (const l of WORLD.landmarks) ctx.mods.set(l.mod, 'landmarks', sum[l.mod] ?? 0);
}

// ---- the far shore: across a strip of sea east of the world, the human town ----
// Its cells are the town's sites. A galleon sees the shore (legacy:farshore); after a migration it is home.
export const TOWN_SITES = Object.keys(TOWN.sites);
const TCOLS = 3, TX = N + 1, TY = 2;
export const WIDTH = N + 1 + TCOLS;
export const TOWN0 = 100;
export const isTown = (c: number | null): c is number => c != null && c >= TOWN0;
export const townSite = (c: number) => TOWN_SITES[c - TOWN0];
const TROWS = Math.ceil(TOWN_SITES.length / TCOLS);
/** The cell under grid square x, y of the world view: a world cell, a town cell, or null (the sea). */
export function gridCell(x: number, y: number): number | null {
  if (x >= 0 && x < N && y >= 0 && y < N) return y * N + x;
  const k = (y - TY) * TCOLS + (x - TX);
  return x >= TX && x < WIDTH && y >= TY && y < TY + TROWS && k < TOWN_SITES.length ? TOWN0 + k : null;
}
const gridXY = (c: number) => (isTown(c) ? [TX + ((c - TOWN0) % TCOLS), TY + Math.floor((c - TOWN0) / TCOLS)] : cxy(c));
export const shoreSeen = (ctx: Context) => ctx.flags.has('legacy:farshore') || ctx.flags.has('legacy:migrated');
export const townHome = (ctx: Context) => ctx.flags.has('legacy:migrated');
/** Each site's ground, shaped by what it is. */
const TOWN_GROUND: Record<string, (x: number, y: number, r: number) => Terrain> = {
  compost: (x, y, r) => (r < 0.75 ? 'soil' : 'grass'),
  kitchen: (x, y, r) => ((x % 9 === 4 && y % 7 === 3) || r > 0.97 ? 'stone' : 'paved'),
  walls: (x, y, r) => (x % 10 < 2 || y % 8 < 1 ? 'stone' : r < 0.2 ? 'soil' : 'paved'),
  drain: (x, y, r) => (Math.abs(y - 12) < 2 ? 'water' : r < 0.5 ? 'stone' : 'soil'),
  office: (x, y, r) => ((x > 6 && x < 14 && y > 4 && y < 10) || (x > 24 && x < 34 && y > 13 && y < 20) || r > 0.96 ? 'stone' : 'paved'),
  shed: (x, y, r) => (r < 0.35 ? 'soil' : r > 0.9 ? 'stone' : 'paved'),
};
const townTerrains = new Map<string, Terrain[]>();
export function townTerrain(seed: number, c: number): Terrain[] {
  const key = seed + ':' + c; const hit = townTerrains.get(key); if (hit) return hit;
  const R = rng(seed ^ (c * 7919)), f = TOWN_GROUND[townSite(c)] ?? (() => 'paved' as Terrain);
  const out: Terrain[] = [];
  for (let y = 0; y < MAP.rows; y++) for (let x = 0; x < MAP.cols; x++) out.push(f(x, y, R()));
  townTerrains.set(key, out);
  return out;
}
/** What the town says about a site, for the map. Reads ctx.state.town. */
export function siteStatus(ctx: Context, c: number): string {
  const id = townSite(c), d = TOWN.sites[id], t = ctx.state.town;
  if (!townHome(ctx)) return 'Seen from the galleon. Migrate to live here.';
  if (d.needs && !ctx.flags.has(d.needs)) return 'Needs research before anyone can work it.';
  if (d.rival && !t?.cleared?.includes(id)) return 'Pavement ants hold it. Clear them from the Town tab.';
  if ((t?.sealed?.[id] ?? 0) > 0) return 'Sealed by the humans, for now.';
  return 'Open. Town foragers work it.';
}

// ---- drawing ----
const TC: Record<Terrain, string> = { grass: PAL.grass, soil: PAL.dirt, stone: PAL.stone, water: PAL.water, paved: PAL.paved };
const OC: Record<string, string> = { you: PAL.you, rival: PAL.rival, spider: PAL.spider, humans: PAL.humans };
const off = document.createElement('canvas');
off.width = WIDTH * MAP.cols; off.height = N * MAP.rows;
const FOG1 = '#100e0c', FOG2 = '#1c1814';

/** Paint the whole world at one pixel per local tile. */
function paintWorld(seed: number, w: WorldState, home: Tile[], shore: boolean) {
  const c = off.getContext('2d')!;
  const cells = layout(seed);
  // the sea, and the far shore across it
  rect(c, N * MAP.cols, 0, (WIDTH - N) * MAP.cols, N * MAP.rows, PAL.water);
  for (let k = 0; k < TOWN_SITES.length; k++) {
    const [gx, gy] = gridXY(TOWN0 + k), X0 = gx * MAP.cols, Y0 = gy * MAP.rows;
    if (!shore) { rect(c, X0, Y0, MAP.cols, MAP.rows, FOG1); continue; }
    townTerrain(seed, TOWN0 + k).forEach((t, i) => rect(c, X0 + (i % MAP.cols), Y0 + Math.floor(i / MAP.cols), 1, 1, TC[t]));
  }
  for (let cc = 0; cc < N * N; cc++) {
    const [gx, gy] = cxy(cc), X0 = gx * MAP.cols, Y0 = gy * MAP.rows;
    if (cc === HOME) {
      home.forEach((t, i) => { const x = i % MAP.cols, y = Math.floor(i / MAP.cols); rect(c, X0 + x, Y0 + y, 1, 1, !t.seen ? PAL.fog : t.o ? OC[t.o] : TC[t.t]); });
      continue;
    }
    if (!isSeen(w, cc)) {
      rect(c, X0, Y0, MAP.cols, MAP.rows, frontier(w, cc) ? FOG2 : FOG1);
      continue;
    }
    cellTerrain(seed, cc).forEach((t, i) => { const o = ownerAt(seed, w, cc, i); rect(c, X0 + (i % MAP.cols), Y0 + Math.floor(i / MAP.cols), 1, 1, o === 'you' ? PAL.you : o === 'foe' ? PAL.foe : TC[t]); });
    const cell = cells[cc];
    if (cell.kin && cell.kinAt) { const [kx, ky] = cell.kinAt; rect(c, X0 + kx - 2, Y0 + ky - 2, 5, 5, PAL.scent); rect(c, X0 + kx, Y0 + ky, 1, 1, PAL.hole); }
    if (cell.landmark) rect(c, X0 + 18, Y0 + 10, 4, 4, PAL.amber);
    if (cell.foe && cell.foeAt && !w.fallen?.includes(cell.foe)) { const [fx, fy] = cell.foeAt; rect(c, X0 + fx - 1, Y0 + fy - 1, 3, 3, PAL.hole); }
  }
}

/** Draw the world into cv, zoomed between the garden cell (z=0) and the whole grid (z=1). */
export function drawWorld(cv: HTMLCanvasElement, seed: number, w: WorldState, home: Tile[], z: number, hover: number | null, selected: number | null, shore = false, townIsHome = false, held: string[] = []) {
  paintWorld(seed, w, home, shore);
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  const e = z < 1 ? 1 - Math.pow(1 - z, 3) : 1; // ease out
  const [hx, hy] = WORLD.home, fw = MAP.cols, fh = MAP.rows;
  const sx = hx * fw * (1 - e), sy = hy * fh * (1 - e), sw = fw + (off.width - fw) * e, sh = fh + (off.height - fh) * e;
  c.drawImage(off, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
  if (z < 1) return;
  const CW = cv.width / WIDTH, CH = cv.height / N;
  for (let i = 1; i <= N; i++) rect(c, i * CW, 0, 1, cv.height, PAL.fog);
  for (let i = 1; i < N; i++) rect(c, 0, i * CH, N * CW, 1, PAL.fog);
  for (let i = N + 2; i < WIDTH; i++) rect(c, i * CW, TY * CH, 1, TROWS * CH, PAL.fog);
  for (let i = 0; i <= TROWS; i++) rect(c, TX * CW, (TY + i) * CH, TCOLS * CW, 1, PAL.fog);
  const box = (cc: number | null, col: string) => {
    if (cc == null) return;
    const [x, y] = gridXY(cc), X = x * CW, Y = y * CH;
    rect(c, X, Y, CW, 2, col); rect(c, X, Y + CH - 2, CW, 2, col); rect(c, X, Y, 2, CH, col); rect(c, X + CW - 2, Y, 2, CH, col);
  };
  box(HOME, PAL.you);
  if (townIsHome) for (let k = 0; k < TOWN_SITES.length; k++) box(TOWN0 + k, held.includes(TOWN_SITES[k]) ? PAL.foe : PAL.you);
  if (w.sortie && Math.floor(performance.now() / 400) % 2) box(w.sortie.cell, PAL.bone);
  box(hover, PAL.stone);
  box(selected, PAL.bone);
}

/** One town cell, close up. */
export function drawTownCell(cv: HTMLCanvasElement, seed: number, cc: number) {
  const c = cv.getContext('2d')!;
  townTerrain(seed, cc).forEach((t, i) => rect(c, (i % MAP.cols) * 8, Math.floor(i / MAP.cols) * 8, 8, 8, TC[t]));
}

/** One foreign cell, close up, at the garden's 8px scale, with borders like the garden map. */
export function drawCell(cv: HTMLCanvasElement, seed: number, w: WorldState, cc: number, hover: number | null, selected: number | null, busy: number | null) {
  const c = cv.getContext('2d')!;
  const T = 8, town = isTown(cc), cell: Cell = town ? { biome: 'town', seed: 0 } : layout(seed)[cc], terr = terrainAt(seed, cc);
  const own = terr.map((_, i) => ownerAt(seed, w, cc, i));
  const OCOL: Record<string, string> = { you: PAL.you, foe: PAL.foe, kin: PAL.scent };
  terr.forEach((t, i) => {
    const x = i % MAP.cols, y = Math.floor(i / MAP.cols), X = x * T, Y = y * T, o = own[i];
    rect(c, X, Y, T, T, TC[t]);
    if (!o) return;
    const col = OCOL[o];
    const n = (dx: number, dy: number) => { const xx = x + dx, yy = y + dy; return xx < 0 || yy < 0 || xx >= MAP.cols || yy >= MAP.rows ? null : own[yy * MAP.cols + xx]; };
    if (n(0, -1) !== o) rect(c, X, Y, T, 1, col);
    if (n(0, 1) !== o) rect(c, X, Y + T - 1, T, 1, col);
    if (n(-1, 0) !== o) rect(c, X, Y, 1, T, col);
    if (n(1, 0) !== o) rect(c, X + T - 1, Y, 1, T, col);
  });
  if (cell.kin && cell.kinAt) { const [kx, ky] = cell.kinAt; rect(c, kx * T + 2, ky * T + 2, 4, 4, PAL.scent); }
  if (cell.foe && cell.foeAt && !w.fallen?.includes(cell.foe)) { const [fx, fy] = cell.foeAt; rect(c, fx * T + 2, fy * T + 2, 4, 4, PAL.foe); }
  if (cell.landmark) rect(c, 18 * T + 1, 10 * T + 1, 2 * T - 2, 2 * T - 2, PAL.amber);
  const mark = (i: number | null, col: string) => {
    if (i == null) return;
    const X = (i % MAP.cols) * T, Y = Math.floor(i / MAP.cols) * T;
    rect(c, X, Y, T, 1, col); rect(c, X, Y + T - 1, T, 1, col); rect(c, X, Y, 1, T, col); rect(c, X + T - 1, Y, 1, T, col);
  };
  if (busy != null && Math.floor(performance.now() / 400) % 2) mark(busy, PAL.you);
  mark(hover, PAL.bone);
  mark(selected, PAL.bone);
}
