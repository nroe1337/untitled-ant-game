// The world map: a flat-colour tile grid. Expeditions reveal fog; adjacent tiles can be
// claimed as outposts that produce by terrain. Other systems change ownership via events:
//   emit 'map:capture' { x, y }   -> tile becomes yours
// and read ctx.state.map (tiles, selected) to know what is where.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, type ActionButton } from '../../core/ui';
import { fmt, type Costs } from '../../core/resources';
import { PAL, rect, setup } from '../../core/pixel';
import { MAP } from '../../data/balance';

export type Terrain = 'grass' | 'soil' | 'stone' | 'water' | 'paved';
export type Owner = 'you' | 'rival' | 'spider' | 'humans' | null;
export interface Tile { t: Terrain; o: Owner; seen: boolean; outpost?: boolean; core?: boolean }
interface MapState { seed: number; tiles: Tile[]; selected: number | null; claims: number }

const S = (ctx: Context) => ctx.state.map as MapState;
const idx = (x: number, y: number) => y * MAP.cols + x;
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP.cols && y < MAP.rows;
const xy = (i: number) => [i % MAP.cols, Math.floor(i / MAP.cols)] as const;

const TERRAIN_NAME: Record<Terrain, string> = { grass: 'Grass', soil: 'Bare soil', stone: 'Stones', water: 'Stream', paved: 'Patio slabs' };
const OWNER_NAME: Record<string, string> = { you: 'Your colony', rival: 'The rival mound', spider: 'A spider', humans: 'Humans', null: 'Unclaimed' };
const TERRAIN_COLOR: Record<Terrain, string> = { grass: PAL.grass, soil: PAL.dirt, stone: PAL.stone, water: PAL.water, paved: PAL.paved };
const OWNER_COLOR: Record<string, string> = { you: PAL.you, rival: PAL.rival, spider: PAL.spider, humans: PAL.humans };

// ---- world generation (deterministic from a seed) ----
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function generate(seed: number): Tile[] {
  const R = rng(seed);
  const G: number[] = []; for (let i = 0; i < 64 * 64; i++) G.push(R());
  const g = (x: number, y: number) => G[(y & 63) * 64 + (x & 63)];
  const sm = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi); const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1); return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; };
  const fbm = (x: number, y: number) => noise(x / 7, y / 7) * 0.6 + noise(x / 3, y / 3) * 0.3 + noise(x, y) * 0.1;
  const [nx, ny] = MAP.nest, [rx, ry] = MAP.rival, [sx, sy] = MAP.spider;
  const tiles: Tile[] = [];
  const bend = R() * 6;
  for (let y = 0; y < MAP.rows; y++) for (let x = 0; x < MAP.cols; x++) {
    const h = fbm(x, y);
    const river = Math.abs(x - (18 + Math.sin(y / 3 + bend) * 2.5));
    let t: Terrain = river < 1.1 ? 'water' : h > 0.68 ? 'stone' : h < 0.38 ? 'soil' : 'grass';
    if (x >= 21 && x <= 26 && y >= 9 && y <= 14) t = 'paved';
    tiles.push({ t, o: null, seen: false });
  }
  const d = (x: number, y: number, px: number, py: number) => Math.hypot(x - px, (y - py) * 1.1);
  tiles.forEach((tile, i) => {
    const [x, y] = xy(i);
    if (tile.t === 'paved') tile.o = 'humans';
    if (d(x, y, nx, ny) < 1.6 && tile.t !== 'water') tile.o = 'you';
    if (d(x, y, rx, ry) < 4.2 && tile.t !== 'water') tile.o = 'rival';
    if (d(x, y, sx, sy) < 2.2) tile.o = 'spider';
    if (d(x, y, nx, ny) < MAP.startReveal + 0.5) tile.seen = true;
  });
  const set = (x: number, y: number, o: Owner) => { const t = tiles[idx(x, y)]; t.o = o; t.core = true; if (t.t === 'water') t.t = 'soil'; };
  set(nx, ny, 'you'); set(rx, ry, 'rival'); set(sx, sy, 'spider');
  return tiles;
}

function reveal(ctx: Context, cx: number, cy: number, r: number) {
  const s = S(ctx);
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (!inside(x, y) || Math.hypot(x - cx, y - cy) > r + 0.5) continue;
    const t = s.tiles[idx(x, y)];
    if (!t.seen) {
      t.seen = true;
      if (t.o === 'rival' && t.core) ctx.log('Scouts map the rival mound itself. It bristles with guards.', 'warn');
      if (t.o === 'spider' && t.core) ctx.log('A web the size of a field. Something waits at its heart.', 'warn');
    }
  }
}

const adjacentToYou = (ctx: Context, i: number) => {
  const [x, y] = xy(i);
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inside(x + dx, y + dy) && S(ctx).tiles[idx(x + dx, y + dy)].o === 'you');
};
/** Priced by the outposts you hold right now, so the 10th outpost costs the same in every colony. */
const heldOutposts = (ctx: Context) => S(ctx).tiles.filter((t) => t.o === 'you' && t.outpost).length;
const claimCost = (ctx: Context): Costs =>
  Object.fromEntries(Object.entries(MAP.claimCost).map(([k, v]) => [k, Math.ceil(v * Math.pow(MAP.claimGrowth, heldOutposts(ctx)))]));
export const canClaim = (ctx: Context, i: number | null) => {
  if (i == null) return false;
  const t = S(ctx).tiles[i];
  return t.seen && t.o === null && t.t !== 'water' && adjacentToYou(ctx, i);
};
const owned = (ctx: Context) => S(ctx).tiles.filter((t) => t.o === 'you');
const freeWorkers = (ctx: Context) => {
  const assigned = Object.values((ctx.state.jobs?.assigned ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
  const busy = Object.entries(ctx.busy).filter(([k]) => k !== 'outposts').reduce((a, [, b]) => a + b, 0);
  return Math.floor(ctx.res.amt('ant')) - assigned - busy - (ctx.busy.outposts ?? 0);
};

export const map: GameSystem = {
  id: 'map',

  init(ctx) {
    const seed = Math.floor(Math.random() * 1e9);
    ctx.state.map = { seed, tiles: generate(seed), selected: null, claims: 0 } satisfies MapState;
    ctx.bus.on('loaded', () => { if (!S(ctx).tiles?.length) S(ctx).tiles = generate(S(ctx).seed); });
    ctx.bus.on('expedition:return', ({ tile }: { tile: [number, number] }) => {
      const [nx, ny] = MAP.nest;
      // reveal the destination and a corridor toward it
      const tx = nx + tile[0], ty = ny + tile[1];
      const steps = Math.max(Math.abs(tile[0]), Math.abs(tile[1]));
      for (let i = 0; i <= steps; i++) reveal(ctx, Math.round(nx + (tile[0] * i) / steps), Math.round(ny + (tile[1] * i) / steps), 1);
      reveal(ctx, tx, ty, 2);
      // keep pushing the fog back a little further each trip
      const fx = tx + Math.round(Math.random() * 6 - 1), fy = ty + Math.round(Math.random() * 6 - 3);
      if (inside(fx, fy)) reveal(ctx, fx, fy, 1);
    });
    ctx.bus.on('map:capture', ({ x, y }: { x: number; y: number }) => {
      const t = S(ctx).tiles[idx(x, y)];
      t.o = 'you'; t.seen = true; t.outpost = false;
      reveal(ctx, x, y, 1);
    });
  },

  isUnlocked: (ctx) => ctx.flags.has('tech:cartography'),

  // the map is never lost: a new colony keeps every tile you owned and everything you saw,
  // but outposts stand empty until you claim workers for them again
  keep(ctx) {
    const s = S(ctx);
    return { ...s, selected: null, tiles: s.tiles.map((t) => ({ ...t, outpost: false })) };
  },

  tick(ctx, dt) {
    const mine = owned(ctx);
    const outposts = mine.filter((t) => t.outpost).length;
    ctx.busy.outposts = outposts * MAP.claimWorkers;
    // territory pays only once the colony has mapped it; the start is fully manual
    if (ctx.flags.has('tech:cartography')) for (const t of mine) for (const [rid, per] of Object.entries(MAP.yield[t.t] ?? {})) ctx.res.add(rid, per * dt);
    ctx.mods.set('defence', 'map', mine.filter((t) => t.t === 'stone').length * MAP.stoneDefence);
    ctx.mods.set('tiles', 'map', mine.length);
  },

  panel: (() => {
    let cv: HTMLCanvasElement, info: HTMLElement, hover: HTMLElement, claim: ActionButton, claimWrap: HTMLElement, summary: HTMLElement;
    let hoverI: number | null = null;
    return {
      title: 'Map',
      group: 'World',
      mount(root, ctx) {
        cv = el('canvas.map', { width: MAP.cols * 8, height: MAP.rows * 8, 'aria-label': 'Map of the garden' }) as HTMLCanvasElement;
        const pick = (e: MouseEvent) => {
          const r = cv.getBoundingClientRect();
          const x = Math.floor(((e.clientX - r.left) / r.width) * MAP.cols), y = Math.floor(((e.clientY - r.top) / r.height) * MAP.rows);
          return inside(x, y) ? idx(x, y) : null;
        };
        cv.addEventListener('mousemove', (e) => { hoverI = pick(e); });
        cv.addEventListener('mouseleave', () => { hoverI = null; });
        cv.addEventListener('click', (e) => { S(ctx).selected = pick(e); });
        hover = el('p.muted.mono');
        info = el('div.ledger');
        summary = el('p.muted');
        claim = actionButton({
          ctx, label: 'Claim as outpost', costs: () => claimCost(ctx),
          desc: `${MAP.claimWorkers} workers move out to hold the tile. It produces by terrain.`,
          enabled: (c) => canClaim(c, S(c).selected) && freeWorkers(c) >= MAP.claimWorkers,
          onBuy: (c) => {
            const s = S(c), t = s.tiles[s.selected!];
            t.o = 'you'; t.outpost = true; s.claims += 1;
            const [x, y] = xy(s.selected!); reveal(c, x, y, 1);
            c.log(`Workers settle a ${TERRAIN_NAME[t.t].toLowerCase()} tile and mark it as ours.`);
          },
        });
        claimWrap = el('div.row', {}, claim.root);
        root.append(
          el('p.flavor', {}, 'The garden, as far as your scouts have seen. Click a tile to inspect it.'),
          cv, hover, summary,
          el('h3', {}, 'Selected tile'), info, claimWrap,
        );
      },
      update(_root, ctx) {
        const s = S(ctx);
        drawMap(cv, s, hoverI);
        const describe = (i: number | null) => {
          if (i == null) return '';
          const [x, y] = xy(i); const t = s.tiles[i];
          return t.seen ? `${x},${y}  ${TERRAIN_NAME[t.t]}, ${OWNER_NAME[String(t.o)]}${t.core ? ' (home)' : ''}` : `${x},${y}  Unexplored`;
        };
        hover.textContent = describe(hoverI) || 'Hover a tile.';
        const mine = owned(ctx);
        const income: Record<string, number> = {};
        for (const t of mine) for (const [r, v] of Object.entries(MAP.yield[t.t] ?? {})) income[r] = (income[r] ?? 0) + v;
        summary.textContent = `You hold ${mine.length} tiles. ` +
          (Object.keys(income).length ? 'Territory gives ' + Object.entries(income).map(([r, v]) => `+${v.toFixed(2)} ${ctx.res.get(r).name.toLowerCase()}/s`).join(', ') + '.' : '');
        const i = s.selected;
        if (i == null) { info.replaceChildren(el('span.muted', {}, 'No tile selected.')); claimWrap.hidden = true; return; }
        const t = s.tiles[i];
        const y = MAP.yield[t.t] ?? {};
        const rows: [string, string][] = [['Tile', describe(i)]];
        if (t.seen) {
          rows.push(['Yields if held', Object.keys(y).length ? Object.entries(y).map(([r, v]) => `+${v} ${r}/s`).join(', ') : t.t === 'stone' ? `+${MAP.stoneDefence} nest defence` : 'nothing']);
          if (t.o === null && t.t !== 'water') rows.push(['Can claim?', canClaim(ctx, i) ? (freeWorkers(ctx) >= MAP.claimWorkers ? 'Yes' : `Needs ${MAP.claimWorkers} idle workers`) : 'Only tiles next to your territory']);
          if (t.o === 'rival' || t.o === 'spider') rows.push(['Enemy ground', 'Take it with a campaign from the War tab']);
          if (t.o === 'humans') rows.push(['Humans', 'Too big to fight. For now.']);
        }
        info.replaceChildren(...rows.map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        claimWrap.hidden = !(t.seen && t.o === null && t.t !== 'water');
        claim.update(ctx);
        void fmt;
      },
    };
  })(),
};

// ---- drawing: flat colours, 8px tiles, no shading ----
function drawMap(cv: HTMLCanvasElement, s: MapState, hoverI: number | null) {
  const c = setup(cv);
  const T = 8;
  s.tiles.forEach((tile, i) => {
    const [x, y] = xy(i);
    const X = x * T, Y = y * T;
    if (!tile.seen) { rect(c, X, Y, T, T, PAL.fog); return; }
    rect(c, X, Y, T, T, TERRAIN_COLOR[tile.t]);
    if (tile.o) {
      const col = OWNER_COLOR[tile.o];
      const n = (dx: number, dy: number) => (inside(x + dx, y + dy) ? s.tiles[idx(x + dx, y + dy)].o : null);
      if (n(0, -1) !== tile.o) rect(c, X, Y, T, 1, col);
      if (n(0, 1) !== tile.o) rect(c, X, Y + T - 1, T, 1, col);
      if (n(-1, 0) !== tile.o) rect(c, X, Y, 1, T, col);
      if (n(1, 0) !== tile.o) rect(c, X + T - 1, Y, 1, T, col);
      if (tile.core) rect(c, X + 2, Y + 2, 4, 4, col);
      else if (tile.outpost) rect(c, X + 3, Y + 3, 2, 2, col);
    }
  });
  const mark = (i: number | null, col: string) => {
    if (i == null) return;
    const [x, y] = xy(i);
    rect(c, x * T, y * T, T, 1, col); rect(c, x * T, y * T + T - 1, T, 1, col);
    rect(c, x * T, y * T, 1, T, col); rect(c, x * T + T - 1, y * T, 1, T, col);
  };
  mark(hoverI, PAL.bone);
  mark(s.selected, PAL.bone);
}
