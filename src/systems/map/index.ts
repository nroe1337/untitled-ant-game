// The world map: a flat-colour tile grid. Expeditions reveal fog; adjacent tiles can be
// claimed by a party of workers who go out, take it, and come home. Held tiles produce by terrain,
// and an outpost can be built on one (resources only) for living space, defence and triple yield. Other systems change ownership via events:
//   emit 'map:capture' { x, y }   -> tile becomes yours
// and read ctx.state.map (tiles, selected) to know what is where.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, progressBar, type ActionButton } from '../../core/ui';
import { fmt, type Costs } from '../../core/resources';
import { PAL, rect, setup } from '../../core/pixel';
import { MAP } from '../../data/balance';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { terrainAt, gridCell, isTown, townSite, shoreSeen, townHome, siteStatus, WIDTH, ownerAt, isFoeCore, foeOf, canClaimAt, canAssault, foeStrength, takeTile, heldTerrain, assaultArmy, sendAssault, reachable, held, W, HOME, layout, ring, cxy, isSeen, frontier, sortieCost, sortieAnts, sortieTime, sortieRisk, sendSortie, tickWorld, drawWorld, drawCell, windName, windFor, biomeName, lmName, kinOf, skyOpen, type WorldState } from './world';
import { WORLD } from '../../data/balance';
import { TOWN } from '../../data/town';
const TOWN_SITE_IDS = Object.keys(TOWN.sites);

export type Terrain = 'grass' | 'soil' | 'stone' | 'water' | 'paved';
export type Owner = 'you' | 'rival' | 'spider' | 'humans' | null;
export interface Tile { t: Terrain; o: Owner; seen: boolean; outpost?: boolean; core?: boolean }
interface Claim { i: number; elapsed: number; duration: number; ants: number; cell?: number }
interface MapState { seed: number; tiles: Tile[]; selected: number | null; claims: number; ups?: Record<string, number>; auto?: boolean; autoCd?: number; claiming?: Claim | null; v2?: boolean; world?: WorldState }
const UPS = fromBalance(MAP.upgrades, (ctx, needs) => !needs || !needs.startsWith('res:') || (ctx.res.has(needs.slice(4)) && ctx.res.get(needs.slice(4)).seen));
const yieldMult = (ctx: Context) => 1 + MAP.upgrades.lines.per * (S(ctx).ups?.lines ?? 0);

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
const outposts = (ctx: Context) => S(ctx).tiles.filter((t) => t.o === 'you' && t.outpost).length;
/** Claims get dearer in a straight line with the land you hold, so the whole map is reachable in the end. */
const claimCost = (ctx: Context): Costs => {
  const extra = Math.max(0, owned(ctx).length + heldTerrain(ctx).length - MAP.startTiles);
  return Object.fromEntries(Object.entries(MAP.claimCost).map(([k, v]) => [k, Math.ceil(v * (1 + MAP.claimStep * extra) * Math.max(0.2, 1 + ctx.mods.get('claimCost')))]));
};
const outpostCost = (ctx: Context): Costs =>
  Object.fromEntries(Object.entries(MAP.outpost.cost).map(([k, v]) => [k, Math.ceil(v * (1 + MAP.outpost.step * outposts(ctx)))]));
const claimTime = (i: number) => { const [x, y] = xy(i), [nx, ny] = MAP.nest; return Math.round(MAP.claimTime + MAP.claimTimePerTile * Math.hypot(x - nx, y - ny)); };
/** Stream tiles open with Leaf rafts; patio slabs once soldiers can clear the pavement ants (Street fighting). */
const openGround = (ctx: Context, t: Tile) =>
  t.o === null ? t.t !== 'water' || ctx.flags.has('tech:rafts') : t.o === 'humans' && !t.core && ctx.flags.has('tech:pavement');
export const canClaim = (ctx: Context, i: number | null) => {
  if (i == null) return false;
  const t = S(ctx).tiles[i];
  return t.seen && openGround(ctx, t) && adjacentToYou(ctx, i);
};
/** Scouts a claiming party needs: more for tiles farther from the nest. */
const claimScouts = (i: number) => { const [x, y] = xy(i), [nx, ny] = MAP.nest; return MAP.claimParty + Math.floor(MAP.claimScoutsPerTile * Math.hypot(x - nx, y - ny)); };
const scoutsAll = (ctx: Context) => Math.floor((ctx.state.jobs?.assigned?.scout ?? 0) as number);
/** Scouts at home: not out on a winged sortie. */
const scouts = (ctx: Context) => scoutsAll(ctx) - (S(ctx).world?.sortie?.ants ?? 0);
const scoutsFree = (ctx: Context) => scouts(ctx) - (S(ctx).claiming?.ants ?? 0);
const canSend = (ctx: Context, i: number | null) => !S(ctx).claiming && i !== null && scouts(ctx) >= claimScouts(i);
function sendClaim(ctx: Context, i: number) {
  S(ctx).claiming = { i, elapsed: 0, duration: claimTime(i), ants: claimScouts(i) };
}
function finishClaim(ctx: Context) {
  const s = S(ctx), c = s.claiming!;
  s.claiming = null;
  ctx.ping('map');
  if (c.cell != null) {
    if (!canClaimAt(ctx, c.cell, c.i)) { ctx.log('The claiming party comes home. That ground is held now, or out of reach.', 'warn'); return; }
    takeTile(ctx, c.cell, c.i); s.claims += 1;
    ctx.log(`Beyond the garden, the party marks a ${TERRAIN_NAME[terrainAt(s.seed, c.cell)[c.i]].toLowerCase()} tile as ours.`, 'info');
    return;
  }
  const t = s.tiles[c.i];
  if (!canClaim(ctx, c.i)) { ctx.log('The claiming party comes home. Someone else holds that ground now.', 'warn'); return; }
  t.o = 'you'; s.claims += 1;
  const [x, y] = xy(c.i); reveal(ctx, x, y, 1);
  if (!s.auto) ctx.log(`The party marks a ${TERRAIN_NAME[t.t].toLowerCase()} tile as ours and comes home.`, 'info');
}
/** Expand on its own: send a party to the claimable tile nearest the nest, when workers and food allow. */
function autoExpand(ctx: Context) {
  const s = S(ctx);
  if (S(ctx).claiming || !ctx.res.canAfford(claimCost(ctx))) return;
  const [nx, ny] = MAP.nest;
  let best = -1, dist = Infinity;
  s.tiles.forEach((_, i) => { if (!canClaim(ctx, i) || !canSend(ctx, i)) return; const [x, y] = xy(i); const d = Math.hypot(x - nx, y - ny); if (d < dist) { dist = d; best = i; } });
  if (best < 0 || !ctx.res.spend(claimCost(ctx))) return;
  sendClaim(ctx, best);
}
const owned = (ctx: Context) => S(ctx).tiles.filter((t) => t.o === 'you');

export const map: GameSystem = {
  id: 'map',

  init(ctx) {
    const seed = Math.floor(Math.random() * 1e9);
    ctx.state.map = { seed, tiles: generate(seed), selected: null, claims: 0, v2: true } satisfies MapState;
    ctx.bus.on('loaded', () => {
      const s = S(ctx);
      if (!s.tiles?.length) s.tiles = generate(s.seed);
      // older saves: "outposts" were staffed claims. Outposts are buildings now, so those tiles are plain territory.
      if (!s.v2) { s.tiles.forEach((t) => { t.outpost = false; }); s.v2 = true; }
    });
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
  // but outposts are left behind and must be built again
  keep(ctx) {
    const s = S(ctx);
    return { ...s, selected: null, ups: {}, claiming: null, world: s.world ? { ...s.world, sortie: null } : undefined, tiles: s.tiles.map((t) => ({ ...t, outpost: false })) };
  },

  tick(ctx, dt) {
    const mine = owned(ctx);
    const s = S(ctx);
    delete ctx.busy.outposts;
    delete ctx.busy.claiming;
    ctx.busy['job:scout'] = (s.claiming?.ants ?? 0) + (s.world?.sortie?.ants ?? 0); // scouts out claiming or flying don't make pheromone
    tickWorld(ctx, dt);
    if (s.claiming && (s.claiming.elapsed += dt) >= s.claiming.duration) finishClaim(ctx);
    if (s.auto && ctx.flags.has('tech:frontier')) {
      s.autoCd = (s.autoCd ?? 0) - dt;
      if (s.autoCd <= 0) { s.autoCd = MAP.expandEvery; autoExpand(ctx); }
    }
    // territory pays only once the colony has mapped it; an outpost triples its tile
    const O = MAP.outpost, n = outposts(ctx);
    if (ctx.flags.has('tech:cartography')) for (const t of mine) for (const [rid, per] of Object.entries(MAP.yield[t.t] ?? {})) ctx.res.add(rid, per * yieldMult(ctx) * (t.outpost ? 1 + O.yieldBoost : 1) * dt);
    // land beyond the garden yields by terrain too
    const far = heldTerrain(ctx);
    for (const t of far) for (const [rid, per] of Object.entries(MAP.yield[t] ?? {})) if (ctx.res.has(rid)) ctx.res.add(rid, per * yieldMult(ctx) * dt);
    ctx.mods.set('defence', 'map', mine.filter((t) => t.t === 'stone').length * MAP.stoneDefence + n * O.defence);
    ctx.res.setCapBonus('ant', 'outposts', n * O.living);
    ctx.mods.set('tiles', 'map', mine.length + far.length);
  },

  panel: (() => {
    let autoBox: HTMLInputElement, autoWrap: HTMLElement;
    let cv: HTMLCanvasElement, info: HTMLElement, hover: HTMLElement, claim: ActionButton, build: ActionButton, claimWrap: HTMLElement, buildWrap: HTMLElement, summary: HTMLElement;
    let ups: ReturnType<typeof upgradeList>, upsHead: HTMLElement;
    let hoverI: number | null = null;
    const bar = progressBar();
    let claimLine: HTMLElement, claimText: HTMLElement;
    // the world view (Age of Wings): a Garden/World toggle, the zoomed-out grid, and one foreign cell close up
    type View = 'garden' | 'world' | 'cell';
    let view: View = 'garden', zoomAt = 0, zoomLen = 700, firstZoom = true;
    let toggle: HTMLElement, gBtn: HTMLButtonElement, wBtn: HTMLButtonElement, gardenBox: HTMLElement, worldBox: HTMLElement, cellBox: HTMLElement;
    let wcv: HTMLCanvasElement, ccv: HTMLCanvasElement, wHover: HTMLElement, wSummary: HTMLElement, wInfo: HTMLElement, cInfo: HTMLElement, cTitle: HTMLElement, lmHead: HTMLElement, lmList: HTMLElement;
    let sortie: ActionButton, sortieWrap: HTMLElement, lookWrap: HTMLElement, sortieLine: HTMLElement, sortieText: HTMLElement;
    let wHoverC: number | null = null, wSel: number | null = null, looking = HOME;
    let cHover: number | null = null, cSel: number | null = null, cHoverLine: HTMLElement, cTile: HTMLElement, fClaim: ActionButton, fAssault: ActionButton, fClaimWrap: HTMLElement, fAssaultWrap: HTMLElement, aLine: HTMLElement, aText: HTMLElement;
    const abar = progressBar();
    const sbar = progressBar();
    const winter = (ctx: Context) => ctx.mods.get('winter') > 0;
    const canFly = (ctx: Context, c: number | null) => c != null && frontier(W(ctx), c) && !W(ctx).sortie && !winter(ctx) && scoutsFree(ctx) >= sortieAnts(c);
    const windText = { down: 'with the wind', up: 'into the wind', cross: 'across the wind' };
    const P = {
      title: 'Map',
      group: 'World',
      mount(root: HTMLElement, ctx: Context) {
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
        claimText = el('span');
        claimLine = el('div.caption', { hidden: true }, claimText, bar.root);
        claim = actionButton({
          ctx, label: 'Send scouts to claim', costs: () => claimCost(ctx),
          desc: `Scouts go out, mark the tile as ours, and come home. Farther tiles need more scouts and take longer. Scouts make no pheromone while away.`,
          enabled: (c) => canClaim(c, S(c).selected) && canSend(c, S(c).selected),
          onBuy: (c) => sendClaim(c, S(c).selected!),
        });
        build = actionButton({
          ctx, label: 'Build an outpost', costs: () => outpostCost(ctx),
          desc: `+${MAP.outpost.living} living space, +${MAP.outpost.defence} nest defence, tile yields x3`,
          enabled: (c) => { const i = S(c).selected; const t = i == null ? null : S(c).tiles[i]; return !!t && t.o === 'you' && !t.core && !t.outpost; },
          onBuy: (c) => { const t = S(c).tiles[S(c).selected!]; t.outpost = true; c.log(`An outpost rises on the ${TERRAIN_NAME[t.t].toLowerCase()}.`, 'info'); },
        });
        buildWrap = el('div.row', {}, build.root);
        autoBox = el('input', { type: 'checkbox', id: 'map-auto' }) as HTMLInputElement;
        autoBox.addEventListener('change', () => { S(ctx).auto = autoBox.checked; });
        autoWrap = el('label', { for: 'map-auto', style: 'white-space: nowrap', title: 'Send a party to claim the tile nearest the nest whenever no party is out and there are scouts and food for it.' }, autoBox, ' Expand on its own');
        claimWrap = el('div.row', {}, claim.root);
        upsHead = el('h3', {}, 'Outposts');
        ups = upgradeList(ctx, () => (S(ctx).ups ??= {}), UPS);
        gardenBox = el('div.mapview', {},
          el('p.flavor', {}, 'The garden, as far as your scouts have seen. Click a tile to inspect it.'),
          cv, hover, summary, claimLine, el('div.row', {}, autoWrap),
          el('h3', {}, 'Selected tile'), info, claimWrap, buildWrap,
          upsHead, ups.root,
        );
        // ---- the world ----
        gBtn = el('button.tab', { type: 'button' }, 'Garden') as HTMLButtonElement;
        wBtn = el('button.tab', { type: 'button' }, 'World') as HTMLButtonElement;
        gBtn.addEventListener('click', () => { view = 'garden'; });
        wBtn.addEventListener('click', () => {
          if (view === 'world') return;
          if (view === 'garden') { zoomAt = performance.now(); zoomLen = firstZoom ? 2400 : 700; firstZoom = false; }
          view = 'world';
        });
        toggle = el('div.tabs.maptoggle', {}, gBtn, wBtn);
        const N = WORLD.size;
        wcv = el('canvas.map.world', { width: WIDTH * 80, height: N * 48, 'aria-label': 'Map of the world' }) as HTMLCanvasElement;
        const wpick = (e: MouseEvent) => {
          const r = wcv.getBoundingClientRect();
          const x = Math.floor(((e.clientX - r.left) / r.width) * WIDTH), y = Math.floor(((e.clientY - r.top) / r.height) * N);
          return gridCell(x, y);
        };
        wcv.addEventListener('mousemove', (e) => { wHoverC = wpick(e); });
        wcv.addEventListener('mouseleave', () => { wHoverC = null; });
        wcv.addEventListener('click', (e) => { wSel = wpick(e); });
        wcv.addEventListener('dblclick', (e) => { const c = wpick(e); if (c === HOME) view = 'garden'; else if (c != null && (isTown(c) ? shoreSeen(ctx) : isSeen(W(ctx), c))) { looking = c; cSel = null; view = 'cell'; } });
        wHover = el('p.muted.mono'); wSummary = el('p.muted'); wInfo = el('div.ledger');
        sortieText = el('span');
        sortieLine = el('div.caption', { hidden: true }, sortieText, sbar.root);
        sortie = actionButton({
          ctx, label: 'Send a winged sortie', costs: () => (wSel == null ? {} : sortieCost(wSel)),
          desc: 'Winged scouts fly out over the cell, look, and come home with what they find. Farther cells need more scouts. Flying into the wind is slower, and birds hunt the slow.',
          enabled: (c) => canFly(c, wSel),
          onBuy: (c) => sendSortie(c, wSel!),
        });
        sortieWrap = el('div.row', {}, sortie.root);
        const look = el('button.action', { type: 'button' }, el('span.label', {}, 'Look closer'));
        look.addEventListener('click', () => { if (wSel === HOME) view = 'garden'; else if (wSel != null) { looking = wSel; cSel = null; view = 'cell'; } });
        lookWrap = el('div.row', {}, look);
        lmHead = el('h3', {}, 'Landmarks'); lmList = el('div.ledger');
        worldBox = el('div.mapview', {},
          el('p.flavor', {}, 'From the air the garden is a single patch of a much larger world. Click a cell to inspect it; double-click to look closer.'),
          wcv, wHover, wSummary, sortieLine,
          el('h3', {}, 'Selected cell'), wInfo, sortieWrap, lookWrap, lmHead, lmList,
        );
        ccv = el('canvas.map', { width: MAP.cols * 8, height: MAP.rows * 8, 'aria-label': 'A cell of the world, close up' }) as HTMLCanvasElement;
        const back = el('button.action', { type: 'button' }, el('span.label', {}, 'Back to the world'));
        back.addEventListener('click', () => { view = 'world'; });
        cTitle = el('p.flavor'); cInfo = el('div.ledger');
        const cpick = (e: MouseEvent) => {
          const r = ccv.getBoundingClientRect();
          const x = Math.floor(((e.clientX - r.left) / r.width) * MAP.cols), y = Math.floor(((e.clientY - r.top) / r.height) * MAP.rows);
          return inside(x, y) ? idx(x, y) : null;
        };
        ccv.addEventListener('mousemove', (e) => { cHover = cpick(e); });
        ccv.addEventListener('mouseleave', () => { cHover = null; });
        ccv.addEventListener('click', (e) => { cSel = cpick(e); });
        cHoverLine = el('p.muted.mono'); cTile = el('div.ledger');
        aText = el('span'); aLine = el('div.caption', { hidden: true }, aText, abar.root);
        fClaim = actionButton({
          ctx, label: 'Send scouts to claim', costs: () => claimCost(ctx),
          desc: `${WORLD.claim.scouts} scouts go out from the border nests, mark the tile as ours, and come home.`,
          enabled: (c) => cSel != null && canClaimAt(c, looking, cSel) && !S(c).claiming && scoutsFree(c) >= WORLD.claim.scouts,
          onBuy: (c) => { S(c).claiming = { i: cSel!, cell: looking, elapsed: 0, duration: WORLD.claim.time, ants: WORLD.claim.scouts }; },
        });
        fAssault = actionButton({
          ctx, label: 'March on this tile', desc: 'All soldiers march on the tile. Win and it is ours, with loot and war honours. Take their core and the colony falls.',
          enabled: (c) => cSel != null && canAssault(c, looking, cSel) && !W(c).assault && assaultArmy(c) >= 3,
          onBuy: (c) => sendAssault(c, looking, cSel!),
        });
        fClaimWrap = el('div.row', {}, fClaim.root); fAssaultWrap = el('div.row', {}, fAssault.root);
        cellBox = el('div.mapview', {}, cTitle, ccv, cHoverLine, aLine, cInfo, el('h3', {}, 'Selected tile'), cTile, fClaimWrap, fAssaultWrap, el('div.row', {}, back));
        root.append(toggle, gardenBox, worldBox, cellBox);
      },
      update(_root: HTMLElement, ctx: Context) {
        const s = S(ctx);
        const sky = skyOpen(ctx);
        if (!sky) view = 'garden';
        toggle.hidden = !sky;
        gBtn.classList.toggle('on', view === 'garden'); wBtn.classList.toggle('on', view !== 'garden');
        gardenBox.hidden = view !== 'garden'; worldBox.hidden = view !== 'world'; cellBox.hidden = view !== 'cell';
        if (view === 'world') P.world(ctx);
        if (view === 'cell') P.cell(ctx);
        if (view !== 'garden') return;
        drawMap(cv, s, hoverI);
        autoWrap.hidden = !ctx.flags.has('tech:frontier');
        autoBox.checked = !!s.auto;
        const describe = (i: number | null) => {
          if (i == null) return '';
          const [x, y] = xy(i); const t = s.tiles[i];
          return t.seen ? `${x},${y}  ${TERRAIN_NAME[t.t]}, ${OWNER_NAME[String(t.o)]}${t.core ? ' (home)' : ''}` : `${x},${y}  Unexplored`;
        };
        hover.textContent = describe(hoverI) || 'Hover a tile.';
        upsHead.hidden = !ups.update(ctx);
        const mine = owned(ctx);
        const income: Record<string, number> = {};
        for (const t of mine) for (const [r, v] of Object.entries(MAP.yield[t.t] ?? {})) income[r] = (income[r] ?? 0) + v * yieldMult(ctx);
        const c = s.claiming;
        summary.textContent = `You hold ${mine.length} tiles` + (outposts(ctx) ? `, with ${outposts(ctx)} outpost${outposts(ctx) > 1 ? 's' : ''}` : '') + '. ' +
          (Object.keys(income).length ? 'Territory gives ' + Object.entries(income).map(([r, v]) => `+${fmt(v)} ${ctx.res.get(r).name.toLowerCase()}/s`).join(', ') + '.' : '');
        claimLine.hidden = !c;
        if (c) { claimText.textContent = `${c.ants} scouts claiming ${c.cell != null ? 'beyond the garden' : xy(c.i).join(',')}. ${Math.ceil((c.duration - c.elapsed) / ctx.speed)}s left.`; bar.set(c.elapsed / c.duration); }
        const i = s.selected;
        if (i == null) { info.replaceChildren(el('span.muted', {}, 'No tile selected.')); claimWrap.hidden = true; buildWrap.hidden = true; return; }
        const t = s.tiles[i];
        const y = MAP.yield[t.t] ?? {};
        const rows: [string, string][] = [['Tile', describe(i)]];
        if (t.seen) {
          const yl = (m: number) => Object.entries(y).map(([r, v]) => `+${fmt(v * m * yieldMult(ctx))} ${r}/s`).join(', ');
          const boost = 1 + MAP.outpost.yieldBoost;
          rows.push(['Yield if held', Object.keys(y).length ? yl(1) : t.t === 'stone' ? `+${MAP.stoneDefence} nest defence` : 'nothing']);
          if (!t.core && (t.o === null || t.o === 'you' || t.o === 'humans')) rows.push(['Yield with outpost', (Object.keys(y).length ? yl(boost) + ', ' : '') + `+${MAP.outpost.living} living space, +${MAP.outpost.defence} defence`]);
          if (t.o === null || t.o === 'humans') rows.push(['Can claim?', canClaim(ctx, i)
            ? (s.claiming ? 'A party is already out claiming' : scouts(ctx) >= claimScouts(i) ? `Yes. ${claimScouts(i)} scouts, about ${claimTime(i)}s.` : `Needs ${claimScouts(i)} scouts (you have ${scouts(ctx)})`)
            : !openGround(ctx, t) ? (t.t === 'water' ? 'Needs Leaf rafts' : t.o === 'humans' ? 'Needs Street fighting' : 'No') : 'Only tiles next to your territory']);
          if (t.o === 'you' && t.outpost) rows.push(['Outpost', 'Built']);
          if (t.o === 'rival' || t.o === 'spider') rows.push(['Enemy ground', 'Take it with a campaign from the War tab']);
          if (t.o === 'humans' && !ctx.flags.has('tech:pavement')) rows.push(['Humans', 'Too big to fight. For now.']);
        }
        info.replaceChildren(...rows.map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        claimWrap.hidden = !(t.seen && (t.o === null || t.o === 'humans') && openGround(ctx, t));
        buildWrap.hidden = !(t.o === 'you' && !t.core && !t.outpost && ctx.flags.has('tech:cartography'));
        claim.update(ctx); build.update(ctx);
        void fmt;
      },
      world(ctx: Context) {
        const s = S(ctx), w = W(ctx), cells = layout(s.seed);
        const z = Math.min(1, (performance.now() - zoomAt) / zoomLen);
        const townHeld = TOWN_SITE_IDS.filter((id) => TOWN.sites[id].rival && !ctx.state.town?.cleared?.includes(id));
        drawWorld(wcv, s.seed, w, s.tiles, z, z < 1 ? null : wHoverC, z < 1 ? null : wSel, shoreSeen(ctx), townHome(ctx), townHome(ctx) ? townHeld : []);
        const name = (c: number) => isTown(c) ? (shoreSeen(ctx) ? TOWN.sites[townSite(c)].name : 'The far shore') : isSeen(w, c) ? biomeName(cells[c]) : 'Unexplored';
        wHover.textContent = wHoverC == null ? 'Hover a cell.' : isTown(wHoverC) ? `Across the water  ${name(wHoverC)}` : `${cxy(wHoverC).join(',')}  ${name(wHoverC)}`;
        const winterNote = winter(ctx) ? ' Winter: the scouts\' wings stay folded until spring.' : '';
        wSummary.textContent = `${windName(w)}.${winterNote} ${w.seen.length - 1} cells seen from the air, ${w.found.length} of ${WORLD.landmarks.length} landmarks found` + (w.kin.length ? `, ${w.kin.length} kin colon${w.kin.length > 1 ? 'ies' : 'y'}` : '') + '. ' + (ctx.flags.has('tech:bordernests') ? 'Border nests let your scouts claim in the eight cells around the garden.' : 'Claiming land beyond the garden is beyond this colony. For now.');
        const so = w.sortie;
        sortieLine.hidden = !so;
        if (so) { sortieText.textContent = `${so.ants} winged scouts over the ${name(so.cell) === 'Unexplored' ? 'unknown' : name(so.cell).toLowerCase()}, flying ${windText[so.wind]}. ${Math.ceil((so.duration - so.elapsed) / ctx.speed)}s left.`; sbar.set(so.elapsed / so.duration); }
        const c = wSel;
        lmHead.hidden = !w.found.length;
        lmList.replaceChildren(...w.found.map((id) => { const l = lmName(id); return el('div', {}, el('span.muted', {}, l.name), el('span', {}, l.desc.replace('{p}', Math.round(Math.abs(l.per) * 100) + '%'))); }));
        if (c == null) { wInfo.replaceChildren(el('span.muted', {}, 'No cell selected.')); sortieWrap.hidden = true; lookWrap.hidden = true; return; }
        if (isTown(c)) {
          const d = TOWN.sites[townSite(c)];
          const trows: [string, string][] = shoreSeen(ctx)
            ? [['Cell', `${d.name}, across the water${townHome(ctx) ? ' (home)' : ''}`], ['', d.desc], ['Yields', Object.entries(d.yields).map(([r, v]) => `${r} ${'+'.repeat(Math.max(1, Math.round(v * 2)))}`).join(', ')], ['Now', siteStatus(ctx, c)]]
            : [['Cell', 'The far shore'], ['', 'Something lies across the water. Only a galleon can find out what.']];
          wInfo.replaceChildren(...trows.map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
          sortieWrap.hidden = true; lookWrap.hidden = !shoreSeen(ctx);
          return;
        }
        const cell = cells[c], seen = isSeen(w, c);
        const rows: [string, string][] = [['Cell', `${cxy(c).join(',')}  ${name(c)}${c === HOME ? ' (home)' : ''}`]];
        if (c !== HOME) rows.push(['Distance', `${ring(c)} cell${ring(c) > 1 ? 's' : ''} from the garden`]);
        if (seen && c !== HOME) rows.push(['From the air', WORLD.biomes[cell.biome].note]);
        if (seen && cell.landmark) rows.push(['Landmark', lmName(cell.landmark).name]);
        if (seen && cell.kin) { const k = kinOf(cell.kin); rows.push(['Kin colony', `${k.name}. They are ${k.temper}.`]); }
        if (seen && cell.foe) { const f = foeOf(cell.foe); rows.push([W(ctx).fallen?.includes(f.id) ? 'Fallen colony' : 'Hostile colony', `${f.name}, ${f.kind}`]); }
        if (held(w, c).length) rows.push(['You hold', `${held(w, c).length} tiles`]);
        if (!seen) {
          if (frontier(w, c)) {
            const wd = windFor(w, c);
            rows.push(['Sortie', `${sortieAnts(c)} scouts, about ${sortieTime(w, c)}s, flying ${windText[wd]}`]);
            rows.push(['Birds', `${Math.round(sortieRisk(w, c) * 100)}% chance they take half the sortie`]);
            if (w.sortie) rows.push(['', 'A sortie is already out.']);
            else if (scoutsFree(ctx) < sortieAnts(c)) rows.push(['', `Needs ${sortieAnts(c)} scouts at home (you have ${Math.max(0, scoutsFree(ctx))})`]);
          } else rows.push(['Sortie', 'Too far. See a cell next to it first.']);
        }
        wInfo.replaceChildren(...rows.map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        sortieWrap.hidden = seen || !frontier(w, c);
        lookWrap.hidden = !seen;
        sortie.update(ctx);
      },
      cell(ctx: Context) {
        const s = S(ctx), w = W(ctx), town = isTown(looking), site = town ? TOWN.sites[townSite(looking)] : null;
        const cell = town ? { biome: 'town', seed: 0 } as ReturnType<typeof layout>[number] : layout(s.seed)[looking], terr = terrainAt(s.seed, looking);
        const a = w.assault, cl = s.claiming;
        drawCell(ccv, s.seed, w, looking, cHover, cSel, a?.cell === looking ? a.i : cl?.cell === looking ? cl.i : null);
        cTitle.textContent = site ? `${site.name}, across the water. ${site.desc}` : `${biomeName(cell)}, ${ring(looking)} cell${ring(looking) > 1 ? 's' : ''} from the garden. ${WORLD.biomes[cell.biome]?.note ?? ''}`;
        const ON: Record<string, string> = { you: 'Your colony', foe: town ? 'Pavement ants' : cell.foe ? foeOf(cell.foe).name : 'Enemy', kin: cell.kin ? kinOf(cell.kin).name : 'Kin', null: 'Unclaimed' };
        const describe = (i: number | null) => (i == null ? '' : `${xy(i).join(',')}  ${TERRAIN_NAME[terr[i]]}, ${ON[String(ownerAt(s.seed, w, looking, i))]}${isFoeCore(s.seed, looking, i) && ownerAt(s.seed, w, looking, i) === 'foe' ? ' (their queen)' : ''}`);
        cHoverLine.textContent = describe(cHover) || 'Hover a tile.';
        aLine.hidden = !a;
        if (a) { aText.textContent = `${a.army} soldiers marching. ${Math.ceil((a.duration - a.elapsed) / ctx.speed)}s left.`; abar.set(a.elapsed / a.duration); }
        const rows: [string, string][] = [];
        if (held(w, looking).length) rows.push(['You hold', `${held(w, looking).length} tiles here`]);
        if (cell.landmark) rows.push(['Landmark', lmName(cell.landmark).name]);
        if (cell.kin) { const k = kinOf(cell.kin); rows.push(['Kin colony', `${k.name}. They are ${k.temper}. Their land is not for taking.`]); }
        if (cell.foe) { const f = foeOf(cell.foe); rows.push([w.fallen?.includes(f.id) ? 'Fallen' : 'Hostile', `${f.name}, ${f.kind}. ${f.note}`]); }
        if (town) rows.push(['Now', siteStatus(ctx, looking)]);
        if (town && !reachable(ctx, looking)) rows.push(['Claim', townHome(ctx) ? 'Needs research first.' : 'After a migration.']);
        else if (!reachable(ctx, looking)) rows.push(['Claim', !ctx.flags.has('tech:bordernests') ? 'Not yet. This colony cannot hold land so far from home.' : 'Too far for now. Only the cells around the garden can be claimed.']);
        cInfo.replaceChildren(...rows.map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        const i = cSel;
        if (i == null) { cTile.replaceChildren(el('span.muted', {}, 'No tile selected.')); fClaimWrap.hidden = true; fAssaultWrap.hidden = true; return; }
        const o = ownerAt(s.seed, w, looking, i), y = MAP.yield[terr[i]] ?? {};
        const trows: [string, string][] = [['Tile', describe(i)], ['Yield if held', Object.keys(y).length ? Object.entries(y).map(([r, v]) => `+${fmt(v * yieldMult(ctx))} ${r}/s`).join(', ') : 'nothing']];
        if (o === null && reachable(ctx, looking)) trows.push(['Can claim?', canClaimAt(ctx, looking, i) ? (s.claiming ? 'A party is already out claiming' : `Yes. ${WORLD.claim.scouts} scouts, about ${WORLD.claim.time}s.`) : terr[i] === 'water' && !ctx.flags.has('tech:rafts') ? 'Needs Leaf rafts' : 'Only tiles next to your land (across a cell\'s edge counts)']);
        if (o === 'foe') {
          trows.push(['Their strength', `about ${Math.round(foeStrength(s.seed, looking, i))}. Yours: ${Math.floor(assaultArmy(ctx) * (1 + ctx.mods.get('soldierPower')))} (${assaultArmy(ctx)} soldiers)`]);
          if (town) trows.pop(), trows.push(['Pavement ants', 'Clear them with soldiers from the Town tab.']);
          else if (!ctx.flags.has('tech:campaigns')) trows.push(['', 'Needs Campaigning']);
          else if (!canAssault(ctx, looking, i)) trows.push(['', reachable(ctx, looking) ? 'Only tiles next to your land' : 'Out of reach for now']);
        }
        cTile.replaceChildren(...trows.map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        fClaimWrap.hidden = !(o === null && reachable(ctx, looking));
        fAssaultWrap.hidden = o !== 'foe' || !ctx.flags.has('tech:campaigns') || !reachable(ctx, looking);
        fClaim.update(ctx); fAssault.update(ctx);
      },
    };
    return P;
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
  if (s.claiming && s.claiming.cell == null && Math.floor(performance.now() / 400) % 2) mark(s.claiming.i, PAL.you);
  mark(hoverI, PAL.bone);
  mark(s.selected, PAL.bone);
}
