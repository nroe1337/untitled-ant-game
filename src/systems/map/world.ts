// The world above the garden. From the Age of Wings the Map zooms out: the garden is one cell of a
// WORLD.size x WORLD.size grid, and every cell is a whole local map of its own. Winged scouts fly sorties
// to reveal cells, bring back finds, and spot landmarks (lasting bonuses for the line) and kin colonies.
// Only the layout (biomes, landmarks, kin) is derived from the map seed; what has been seen is saved.
import type { Context } from '../../core/types';
import { PAL, rect } from '../../core/pixel';
import { MAP, WORLD } from '../../data/balance';
import type { Terrain, Tile } from './index';

export interface Sortie { cell: number; elapsed: number; duration: number; ants: number; risk: number; wind: Wind }
export interface WorldState { seen: number[]; wind: number; windT: number; sortie: Sortie | null; found: string[]; kin: string[]; sorties: number; lost: number; intro?: boolean }
type Wind = 'down' | 'up' | 'cross';

const N = WORLD.size;
export const HOME = WORLD.home[1] * N + WORLD.home[0];
export const cxy = (c: number) => [c % N, Math.floor(c / N)] as const;
export const ring = (c: number) => { const [x, y] = cxy(c); return Math.max(Math.abs(x - WORLD.home[0]), Math.abs(y - WORLD.home[1])); };
const SW = WORLD.sortie;

export function newWorld(): WorldState {
  return { seen: [HOME], wind: Math.floor(Math.random() * 4), windT: 0, sortie: null, found: [], kin: [], sorties: 0, lost: 0 };
}
export const W = (ctx: Context) => (ctx.state.map.world ??= newWorld()) as WorldState;
export const skyOpen = (ctx: Context) => ctx.flags.has('tech:sky');

// ---- layout: which biome each cell is, and where the landmarks and kin are ----
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export interface Cell { biome: string; landmark?: string; kin?: string; seed: number; kinAt?: [number, number] }
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
export const sortieTime = (w: WorldState, c: number) => Math.round((SW.time + SW.timePerRing * ring(c)) * windMul(windFor(w, c), 'time'));
export const sortieRisk = (w: WorldState, c: number) => Math.min(0.6, SW.birds * ring(c) * windMul(windFor(w, c), 'birds'));
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
  for (const [k, v] of Object.entries(SW.find)) if (ctx.res.has(k) && ctx.res.get(k).seen) { const n = Math.round(v * r * (0.6 + Math.random() * 0.8)); ctx.res.add(k, n); got.push(`${n} ${ctx.res.get(k).name.toLowerCase()}`); }
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
  if (!skyOpen(ctx)) return;
  if (!w.intro) {
    w.intro = true;
    ctx.announce('The sky', 'Winged scouts rise above the garden for the first time. It is one small patch of a world far bigger than the colony ever knew. Open the Map and look up.', { kicker: 'Age of Wings' });
  }
  if ((w.windT += dt) >= SW.windEvery) { w.windT = 0; w.wind = (w.wind + (Math.random() < 0.5 ? 1 : 3)) % 4; }
  if (w.sortie && (w.sortie.elapsed += dt) >= w.sortie.duration) finishSortie(ctx);
  // landmarks help every colony of the line
  const sum: Record<string, number> = {};
  for (const id of w.found) { const l = lmName(id); sum[l.mod] = (sum[l.mod] ?? 0) + l.per; }
  for (const l of WORLD.landmarks) ctx.mods.set(l.mod, 'landmarks', sum[l.mod] ?? 0);
}

// ---- drawing ----
const TC: Record<Terrain, string> = { grass: PAL.grass, soil: PAL.dirt, stone: PAL.stone, water: PAL.water, paved: PAL.paved };
const OC: Record<string, string> = { you: PAL.you, rival: PAL.rival, spider: PAL.spider, humans: PAL.humans };
const off = document.createElement('canvas');
off.width = N * MAP.cols; off.height = N * MAP.rows;
const FOG1 = '#100e0c', FOG2 = '#1c1814';

/** Paint the whole world at one pixel per local tile. */
function paintWorld(seed: number, w: WorldState, home: Tile[]) {
  const c = off.getContext('2d')!;
  const cells = layout(seed);
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
    cellTerrain(seed, cc).forEach((t, i) => rect(c, X0 + (i % MAP.cols), Y0 + Math.floor(i / MAP.cols), 1, 1, TC[t]));
    const cell = cells[cc];
    if (cell.kin && cell.kinAt) { const [kx, ky] = cell.kinAt; rect(c, X0 + kx - 2, Y0 + ky - 2, 5, 5, PAL.scent); rect(c, X0 + kx, Y0 + ky, 1, 1, PAL.hole); }
    if (cell.landmark) rect(c, X0 + 18, Y0 + 10, 4, 4, PAL.amber);
  }
}

/** Draw the world into cv, zoomed between the garden cell (z=0) and the whole grid (z=1). */
export function drawWorld(cv: HTMLCanvasElement, seed: number, w: WorldState, home: Tile[], z: number, hover: number | null, selected: number | null) {
  paintWorld(seed, w, home);
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  const e = z < 1 ? 1 - Math.pow(1 - z, 3) : 1; // ease out
  const [hx, hy] = WORLD.home, fw = MAP.cols, fh = MAP.rows;
  const sx = hx * fw * (1 - e), sy = hy * fh * (1 - e), sw = fw + (off.width - fw) * e, sh = fh + (off.height - fh) * e;
  c.drawImage(off, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
  if (z < 1) return;
  const CW = cv.width / N, CH = cv.height / N;
  for (let i = 1; i < N; i++) { rect(c, i * CW, 0, 1, cv.height, PAL.fog); rect(c, 0, i * CH, cv.width, 1, PAL.fog); }
  const box = (cc: number | null, col: string) => {
    if (cc == null) return;
    const [x, y] = cxy(cc), X = x * CW, Y = y * CH;
    rect(c, X, Y, CW, 2, col); rect(c, X, Y + CH - 2, CW, 2, col); rect(c, X, Y, 2, CH, col); rect(c, X + CW - 2, Y, 2, CH, col);
  };
  box(HOME, PAL.you);
  if (w.sortie && Math.floor(performance.now() / 400) % 2) box(w.sortie.cell, PAL.bone);
  box(hover, PAL.stone);
  box(selected, PAL.bone);
}

/** One foreign cell, close up, at the garden's 8px scale. */
export function drawCell(cv: HTMLCanvasElement, seed: number, cc: number) {
  const c = cv.getContext('2d')!;
  const T = 8, cell = layout(seed)[cc];
  cellTerrain(seed, cc).forEach((t, i) => rect(c, (i % MAP.cols) * T, Math.floor(i / MAP.cols) * T, T, T, TC[t]));
  if (cell.kin && cell.kinAt) { const [kx, ky] = cell.kinAt; rect(c, (kx - 2) * T, (ky - 2) * T, 5 * T, 5 * T, PAL.scent); rect(c, kx * T + 2, ky * T + 2, 4, 4, PAL.hole); }
  if (cell.landmark) rect(c, 18 * T, 10 * T, 4 * T, 4 * T, PAL.amber);
}
