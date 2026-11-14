// Tile wonders: one per terrain, raised on a tile you hold on the Map. Each is built in three stages
// (Footings, Body, Crown, then a settling time), carried in by hand or by Builders. A finished wonder
// rises one level for good, through every flight; each colony can raise each wonder once.
// This system owns the levels and the builds, and publishes every trait as a shared mod that the
// nest, brood, war, expeditions and map read. The Map marks the tile (tile.w) and asks us for its buttons.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, progressBar, type ActionButton } from '../../core/ui';
import { fmt } from '../../core/resources';
import { dockProject } from '../../core/queue';
import { WONDERS, LINEAGE } from '../../data/balance';

const WD = WONDERS;
export type WonderId = keyof typeof WD.list & string;
const IDS = Object.keys(WD.list) as WonderId[];
interface Build { id: WonderId; tile: number; stage: number; paid: Record<string, number>; settle: number }
interface WState {
  levels: Record<string, number>;
  /** Wonders revealed (stays revealed through flights). */
  seen: string[];
  /** Raised this colony (each can be raised once a colony). */
  raised: string[];
  builds: Build[];
  /** Deep stores: food kept back from what spilled past the stores. */
  reserve?: number;
  /** Great Mound epic: daughter mounds raised this colony, and the countdown to the next swarm. */
  daughters?: number; swarmCd?: number;
}
const S = (ctx: Context) => ctx.state.wonders as WState;
export const wonderLevel = (ctx: Context, id: string) => S(ctx)?.levels?.[id] ?? 0;
const def = (id: string) => WD.list[id];
type Tile = { t: string; o: string | null; seen: boolean; outpost?: boolean; core?: boolean; w?: string; dm?: boolean };
const tiles = (ctx: Context) => (ctx.state.map?.tiles ?? []) as Tile[];

// ---- traits ----
/** Tier (0 to 3) of trait t at wonder level L: levels 1-3 open tier I of each trait in turn, 4-6 tier II, 7-9 tier III. */
export const tierOf = (L: number, t: number) => Math.max(0, Math.min(3, Math.floor((Math.min(L, 9) - 1 - t) / 3) + 1));
const traitValue = (id: string, t: number, L: number) => { const tr = def(id).traits?.[t]; const k = tierOf(L, t); return tr && k ? tr.tiers[k - 1] : 0; };
const ROMAN = ['', 'I', 'II', 'III'];
const showV = (tr: { flat?: boolean }, v: number) => (tr.flat ? String(v) : `${+(v * 100).toFixed(1)}%`);
/** Lines describing what a wonder does at level L, for the panel. */
function effectLines(id: string, L: number): string[] {
  const d = def(id);
  if (id === 'mound') return [L ? `Living space from chambers +${Math.round(L * WD.mound.per * 100)}%` : 'Nothing yet', ...(L >= WD.max ? [`${d.epic.name}: ${d.epic.desc}`] : [])];
  const out: string[] = [];
  d.traits!.forEach((tr, t) => { const k = tierOf(L, t); if (k) out.push(`${tr.name} ${ROMAN[k]}: ${tr.desc.replace('{v}', showV(tr, tr.tiers[k - 1]))}`); });
  if (L >= WD.max) out.push(`${d.epic.name}: ${d.epic.desc}`);
  return out.length ? out : ['Nothing yet'];
}
/** What the next level adds. */
function nextLine(id: string, L: number) {
  const d = def(id);
  if (L >= WD.max) return 'Fully raised.';
  if (L + 1 === WD.max) return `Level 10: ${d.epic.name} (epic). ${d.epic.desc}`;
  if (id === 'mound') return `Level ${L + 1}: living space from chambers +${Math.round((L + 1) * WD.mound.per * 100)}%.`;
  const t = L % 3, tr = d.traits![t], k = tierOf(L + 1, t);
  return `Level ${L + 1}: ${tr.name} ${ROMAN[k]}. ${tr.desc.replace('{v}', showV(tr, tr.tiers[k - 1]))}`;
}

/** Publish every wonder's effects as shared mods (source 'wonders'). */
function publish(ctx: Context) {
  const L = (id: string) => wonderLevel(ctx, id);
  const m = (k: string, v: number) => ctx.mods.set(k, 'wonders', v);
  m('livingSpace', L('mound') * WD.mound.per);
  m('wonderSoil', -traitValue('undercroft', 0, L('undercroft')));
  m('rootProps', traitValue('undercroft', 1, L('undercroft')));
  m('deepStores', traitValue('undercroft', 2, L('undercroft')));
  m('daughterQueen', L('undercroft') >= WD.max ? 1 : 0);
  m('tunnelsTier', tierOf(L('undercroft'), 0)); m('propsTier', tierOf(L('undercroft'), 1)); m('storesTier', tierOf(L('undercroft'), 2));
  m('cairnDouble', traitValue('cairn', 0, L('cairn')));
  m('cairnPlates', traitValue('cairn', 1, L('cairn')));
  m('cairnAcid', traitValue('cairn', 2, L('cairn')));
  m('cairnJawsTier', tierOf(L('cairn'), 0)); m('cairnPlatesTier', tierOf(L('cairn'), 1)); m('cairnAcidTier', tierOf(L('cairn'), 2));
  m('cairnStand', L('cairn') >= WD.max ? 1 : 0);
  m('expSpeed', -traitValue('ford', 0, L('ford')));
  m('rumourChance', traitValue('ford', 1, L('ford')));
  m('wipeChance', -traitValue('ford', 2, L('ford')));
  m('expColumns', L('ford') >= WD.max ? 1 : 0);
  m('fordTier', tierOf(L('ford'), 0));
  m('outpostCost', -traitValue('stones', 0, L('stones')));
  m('reach', tierOf(L('stones'), 0) >= 3 ? 1 : 0);
  m('lookoutSight', traitValue('stones', 1, L('stones')));
  m('roadYield', traitValue('stones', 2, L('stones')));
  m('beaconChain', L('stones') >= WD.max ? 1 : 0);
  m('firesTier', tierOf(L('stones'), 0)); m('watchTier', tierOf(L('stones'), 1)); m('roadsTier', tierOf(L('stones'), 2));
}

// ---- building ----
const loreKnown = (ctx: Context) => ctx.flags.has('tech:wonderlore');
const held = (ctx: Context, terrain: string) => tiles(ctx).filter((t) => t.o === 'you' && t.t === terrain).length;
const building = (ctx: Context, id: string) => S(ctx).builds.find((b) => b.id === id);
/** Can wonder id be raised now (somewhere)? */
const canStart = (ctx: Context, id: WonderId) => loreKnown(ctx) && S(ctx).seen.includes(id) && wonderLevel(ctx, id) < WD.max && !S(ctx).raised.includes(id) && !building(ctx, id);
/** Which wonder could stand on tile i, if any. */
export function wonderFor(ctx: Context, i: number): WonderId | null {
  const t = tiles(ctx)[i];
  if (!t || t.o !== 'you' || t.core || t.outpost || t.w) return null;
  return IDS.find((id) => def(id).terrain === t.t && canStart(ctx, id)) ?? null;
}
/** One stage's cost for wonder id at its current level. */
function stageCost(ctx: Context, id: string, stage: number): Record<string, number> {
  const st = WD.stages[stage], g = Math.pow(WD.growth, wonderLevel(ctx, id));
  const out: Record<string, number> = {};
  for (const [r, v] of Object.entries(st.cost)) out[r] = Math.ceil(v * g);
  if (st.rare) for (const [r, v] of Object.entries(def(id).rare)) out[r] = Math.max(1, Math.round(v * st.rare * g));
  return out;
}
const owed = (ctx: Context, b: Build, r: string) => Math.max(0, (stageCost(ctx, b.id, b.stage)[r] ?? 0) - (b.paid[r] ?? 0));
const stagePaid = (ctx: Context, b: Build) => Object.keys(stageCost(ctx, b.id, b.stage)).every((r) => owed(ctx, b, r) <= 0);
const spare = (ctx: Context, r: string) => (ctx.res.has(r) ? Math.max(0, ctx.res.amt(r) - ctx.res.held(r)) : 0);
/** Carry up to `units` into a build's current stage, spread over what it still needs. */
function carry(ctx: Context, b: Build, units: number) {
  if (b.stage >= WD.stages.length || stagePaid(ctx, b)) return 0;
  const want = Object.keys(stageCost(ctx, b.id, b.stage)).filter((r) => owed(ctx, b, r) > 0 && spare(ctx, r) > 0);
  if (!want.length) return 0;
  let moved = 0;
  for (const r of want) {
    // rare materials come in whole pieces
    const rare = r === 'sugar' || r === 'ivory';
    let n = Math.min(units / want.length, owed(ctx, b, r), spare(ctx, r));
    if (rare) n = Math.min(owed(ctx, b, r), Math.floor(spare(ctx, r)), Math.max(1, Math.floor(n)));
    if (n <= 0) continue;
    ctx.res.add(r, -n);
    b.paid[r] = (b.paid[r] ?? 0) + n;
    moved += n;
  }
  return moved;
}
function advance(ctx: Context, b: Build) {
  if (!stagePaid(ctx, b)) return;
  const last = b.stage === WD.stages.length - 1;
  if (last && b.settle < WD.settle) return;
  if (!last) { b.stage++; b.paid = {}; ctx.log(`${def(b.id).name}: the ${WD.stages[b.stage - 1].name.toLowerCase()} are done. Next, the ${WD.stages[b.stage].name.toLowerCase()}.`, 'info'); return; }
  finish(ctx, b);
}
function finish(ctx: Context, b: Build) {
  const s = S(ctx);
  s.builds = s.builds.filter((x) => x !== b);
  s.raised.push(b.id);
  const L = (s.levels[b.id] = (s.levels[b.id] ?? 0) + 1);
  const d = def(b.id);
  ctx.log(`${d.name} stands finished, level ${L}. Its gift stays with your line through every flight.`, 'story');
  ctx.announce(`${d.name}, level ${L}`, L >= WD.max ? `${d.epic.name}: ${d.epic.desc}` : effectLines(b.id, L).slice(-1)[0] ?? '', { kicker: L >= WD.max ? 'Wonder fully raised' : 'Wonder raised' });
  ctx.ping('wonders');
}
export function raiseWonder(ctx: Context, i: number) {
  const id = wonderFor(ctx, i);
  if (!id) return;
  tiles(ctx)[i].w = id;
  S(ctx).builds.push({ id, tile: i, stage: 0, paid: {}, settle: 0 });
  ctx.log(`Work begins on ${def(id).name}. Builders carry to it when the Swarm Spire doesn't need them, or haul by hand (World, Wonders).`, 'info');
}
/** Builders work on the Spire first, while it is being built. */
const spireBusy = (ctx: Context) => ctx.flags.has('tech:flight') && (ctx.state.lineage?.wonder?.stage ?? 0) < LINEAGE.wonder.stages.length;

// ---- the Great Mound's epic: daughter mounds ----
function daughterMounds(ctx: Context, dt: number) {
  const s = S(ctx);
  if (wonderLevel(ctx, 'mound') < WD.max || (s.daughters ?? 0) >= WD.mound.maxDaughters) return;
  if (ctx.res.amt('ant') < ctx.res.cap('ant') - 0.5) return;
  s.swarmCd = (s.swarmCd ?? WD.mound.every) - dt;
  if (s.swarmCd > 0) return;
  s.swarmCd = WD.mound.every;
  const T = tiles(ctx);
  const spots = T.map((t, i) => [t, i] as const).filter(([t]) => t.o === 'you' && t.t === 'grass' && !t.core && !t.outpost && !t.w);
  if (!spots.length) return;
  const [t] = spots[Math.floor(Math.random() * spots.length)];
  ctx.res.add('ant', -WD.mound.swarm);
  t.outpost = true; t.dm = true;
  s.daughters = (s.daughters ?? 0) + 1;
  ctx.log(`The Great Mound is full to bursting. ${WD.mound.swarm} workers swarm out and raise a daughter mound on the grass. It works as an outpost. (${s.daughters} of ${WD.mound.maxDaughters})`, 'story');
}

// ---- Deep stores ----
function deepStores(ctx: Context) {
  const s = S(ctx), share = ctx.mods.get('deepStores'), spilt = ctx.res.spill('food');
  if (share <= 0) return;
  const cap = ctx.res.cap('food');
  s.reserve = Math.min(cap, (s.reserve ?? 0) + spilt * share);
  if (s.reserve > 0 && ctx.res.amt('food') < cap * 0.05) {
    const n = Math.min(s.reserve, cap * 0.05 - ctx.res.amt('food'));
    ctx.res.source = 'Deep stores'; ctx.res.add('food', n); s.reserve -= n;
  }
}

export const wonders: GameSystem = {
  id: 'wonders',
  init(ctx) {
    ctx.state.wonders = { levels: {}, seen: [], raised: [], builds: [] } satisfies WState;
    ctx.bus.on('loaded', () => {
      const s = S(ctx);
      s.levels ??= {}; s.seen ??= []; s.raised ??= []; s.builds ??= [];
      // a wonder's tile is marked on the map; drop marks whose build is gone (a new colony starts bare)
      const live = new Set([...s.builds.map((b) => b.tile)]);
      tiles(ctx).forEach((t, i) => { if (t.w && !live.has(i) && !s.raised.includes(t.w)) delete t.w; });
    });
  },
  isUnlocked: (ctx) => loreKnown(ctx) || IDS.some((id) => wonderLevel(ctx, id) > 0),
  keep(ctx) { const s = S(ctx); return { levels: s.levels, seen: s.seen, raised: [], builds: [] }; },
  tick(ctx, dt) {
    const s = S(ctx);
    publish(ctx);
    deepStores(ctx);
    daughterMounds(ctx, dt);
    if (loreKnown(ctx)) for (const id of IDS) {
      if (s.seen.includes(id) || held(ctx, def(id).terrain) < def(id).tiles) continue;
      s.seen.push(id);
      ctx.log(`Your builders have an idea: ${def(id).name}, on ${def(id).terrain === 'water' ? 'a stream' : def(id).terrain === 'paved' ? 'the patio slabs' : def(id).terrain === 'soil' ? 'bare soil' : def(id).terrain} you hold. Select such a tile on the Map to raise it.`, 'info');
      ctx.ping('wonders');
    }
    // a build whose tile was lost stops (nothing paid is lost: it waits for the tile)
    const builders = spireBusy(ctx) ? 0 : (ctx.state.jobs?.assigned?.builder ?? 0);
    let units = builders * LINEAGE.wonder.builderRate * (ctx.flags.has('accord:haul') ? 2 : 1) * dt;
    for (const b of [...s.builds]) {
      if (tiles(ctx)[b.tile]?.o !== 'you') continue;
      if (units > 0) units -= carry(ctx, b, units);
      if (b.stage === WD.stages.length - 1 && stagePaid(ctx, b)) b.settle += dt;
      advance(ctx, b);
    }
  },
  panel: (() => {
    const rows = new Map<WonderId, { root: HTMLElement; head: HTMLElement; now: HTMLElement; next: HTMLElement; build: HTMLElement; bar: ReturnType<typeof progressBar>; haul: ActionButton }>();
    let intro: HTMLElement;
    return {
      title: 'Wonders',
      group: 'World',
      mount(root, ctx) {
        intro = el('p.muted');
        root.append(el('p.flavor', {}, 'Great works raised on the land you hold. The building is left behind at each flight, but what it taught the colony stays.'), intro);
        for (const id of IDS) {
          const head = el('h3'), now = el('div.ledger'), next = el('p.muted'), build = el('div.ledger'), bar = progressBar();
          const haul = actionButton({
            ctx, label: 'Haul a load', cooldown: WD.haulCooldown, desc: `Carry ${WD.haul} units of what this stage needs from your stores. Builders (Jobs tab) do this on their own when the Swarm Spire doesn't need them.`,
            enabled: (c) => { const b = building(c, id); return !!b && !stagePaid(c, b); },
            onBuy: (c) => { const b = building(c, id); if (b) { carry(c, b, WD.haul); advance(c, b); } },
          });
          const box = el('div.section.wonder', {}, head, now, next, build, bar.root, el('div.row', {}, haul.root));
          rows.set(id, { root: box, head, now, next, build, bar, haul });
          root.append(box);
        }
      },
      update(_root, ctx) {
        const s = S(ctx);
        intro.textContent = loreKnown(ctx)
          ? 'A wonder shows here once you hold enough of its ground. To raise one, select a tile of that ground you hold on the Map (not the nest or an outpost). Each can be raised once a colony; each raise is one level, up to 10. The tile gives no yield while a wonder stands on it.'
          : 'Learn Wonder lore to raise wonders in this colony. The levels you have already raised still work.';
        for (const id of IDS) {
          const r = rows.get(id)!, d = def(id), L = wonderLevel(ctx, id), seen = s.seen.includes(id);
          r.root.hidden = !seen && !L;
          if (r.root.hidden) continue;
          r.head.textContent = `${d.name}, level ${L} of ${WD.max}`;
          r.now.replaceChildren(el('div', {}, el('span.muted', {}, 'Ground'), el('span', {}, `${{ grass: 'Grass', soil: 'Bare soil', stone: 'Stones', water: 'Stream', paved: 'Patio slabs' }[d.terrain]}. ${d.what}`)),
            ...effectLines(id, L).map((line, k) => el('div', {}, el('span.muted', {}, k ? '' : 'Now'), el('span', {}, line))));
          r.next.textContent = nextLine(id, L);
          const b = building(ctx, id);
          r.bar.root.hidden = !b; r.haul.root.hidden = !b;
          if (!b) {
            const why = L >= WD.max ? 'Fully raised.' : s.raised.includes(id) ? 'Raised this colony. The next level waits for a new colony.' : !loreKnown(ctx) ? 'Needs Wonder lore in this colony.' : `Not started. Select a ${{ grass: 'grass', soil: 'bare soil', stone: 'stone', water: 'stream', paved: 'patio slab' }[d.terrain]} tile you hold on the Map.`;
            r.build.replaceChildren(el('div', {}, el('span.muted', {}, 'Building'), el('span', {}, why)));
            continue;
          }
          r.haul.update(ctx);
          const cost = stageCost(ctx, id, b.stage), st = WD.stages[b.stage];
          const lines: [string, string][] = [['Building', `Stage ${b.stage + 1} of ${WD.stages.length}: ${st.name}`]];
          for (const k of Object.keys(cost)) lines.push([ctx.res.has(k) ? ctx.res.get(k).name : k, `${fmt(b.paid[k] ?? 0)} / ${cost[k]}` + (owed(ctx, b, k) > 0 && spare(ctx, k) <= 0 ? ' (none in stores)' : '')]);
          if (b.stage === WD.stages.length - 1) lines.push(['Then', stagePaid(ctx, b) ? `settling, ${Math.ceil((WD.settle - b.settle) / 60)} min left` : `${Math.round(WD.settle / 60)} min to settle once paid`]);
          if (tiles(ctx)[b.tile]?.o !== 'you') lines.push(['Stopped', 'The tile is no longer ours. Work waits until it is taken back.']);
          if (spireBusy(ctx)) lines.push(['Builders', 'busy on the Swarm Spire']);
          r.build.replaceChildren(...lines.map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
          r.bar.set(progressOf(ctx, b));
        }
      },
    };
  })(),
};

/** How far along a build is, 0 to 1, over all its stages and the settling. */
function progressOf(ctx: Context, b: Build) {
  const n = WD.stages.length + 1;
  const cost = stageCost(ctx, b.id, b.stage);
  const total = Object.values(cost).reduce((a, x) => a + x, 0) || 1;
  const paid = Object.keys(cost).reduce((a, r) => a + Math.min(cost[r], b.paid[r] ?? 0), 0);
  const settled = b.stage === WD.stages.length - 1 && stagePaid(ctx, b) ? b.settle / WD.settle : 0;
  return Math.min(1, (b.stage + paid / total + settled) / n);
}

// ---- the project bar above the tabs ----
const projRoot = el('div.projectbar', { hidden: true });
dockProject(projRoot, (ctx) => {
  const s = S(ctx);
  const list = s?.builds ?? [];
  projRoot.hidden = !list.length;
  if (!list.length) return;
  const key = list.map((b) => `${b.id}${b.stage}${Math.floor(progressOf(ctx, b) * 200)}`).join();
  if (projRoot.dataset.k === key) return;
  projRoot.dataset.k = key;
  projRoot.replaceChildren(...list.map((b) => {
    const p = progressOf(ctx, b), fill = el('span.fill');
    fill.style.width = `${(p * 100).toFixed(1)}%`;
    return el('div.project', { title: 'World, Wonders' }, el('span.pname', {}, `${def(b.id).name}: ${WD.stages[b.stage].name}${b.stage === WD.stages.length - 1 && stagePaid(ctx, b) ? ', settling' : ''}`), el('span.bar', {}, fill), el('span.ppct', {}, `${Math.floor(p * 100)}%`));
  }));
});

/** For the Map: what to show for the selected tile, and the Raise button. */
export function wonderTileBox(ctx: Context) {
  const raise = actionButton({
    ctx, label: () => { const i = ctx.state.map?.selected; const id = i == null ? null : wonderFor(ctx, i); return id ? `Raise ${def(id).name}` : 'Raise a wonder'; },
    desc: () => { const i = ctx.state.map?.selected; const id = i == null ? null : wonderFor(ctx, i); return id ? `Start building here. ${nextLine(id, wonderLevel(ctx, id))} The tile gives no yield while the wonder stands.` : ''; },
    enabled: (c) => { const i = c.state.map?.selected; return i != null && !!wonderFor(c, i); },
    onBuy: (c) => raiseWonder(c, c.state.map.selected),
  });
  const note = el('span.muted');
  const root = el('div.row', { hidden: true }, raise.root, note);
  return {
    root,
    /** A line for the tile's ledger, if a wonder stands or is being built there. */
    line(i: number): string | null {
      const t = tiles(ctx)[i];
      if (!t?.w) return null;
      const b = S(ctx).builds.find((x) => x.tile === i);
      return b ? `${def(t.w).name}, being built (${Math.floor(progressOf(ctx, b) * 100)}%)` : `${def(t.w).name}, level ${wonderLevel(ctx, t.w)}`;
    },
    update(i: number | null) {
      const id = i == null ? null : wonderFor(ctx, i);
      root.hidden = !id;
      if (id) raise.update(ctx);
    },
  };
}
