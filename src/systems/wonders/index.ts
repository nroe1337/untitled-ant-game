// Wonders: a way of life for a colony. The line finds blueprints in special places (with bad luck
// protection); each colony picks one wonder and it cannot be changed until the next flight. The wonder
// rises by doing its activity, counted from the moment it is chosen: the Footings switch it on at the
// levels the line owns, its price starts at the Body, and the Crown earns the next level for good.
// This system owns blueprints, the pick, the stages and the levels, and publishes every rule as a shared
// mod (or a small export) that seasons, brood, jobs, war, expeditions, castes, nest and the map read.
import type { GameSystem, Context } from '../../core/types';
import { el } from '../../core/ui';
import { fmt } from '../../core/resources';
import { dockProject } from '../../core/queue';
import { WONDERS, MAP } from '../../data/balance';

const WD = WONDERS;
const IDS = Object.keys(WD.list);
const VAULTED = ['food', 'soil', 'seed'];
interface WState {
  /** Kept for good. */
  levels: Record<string, number>; found: string[]; signs: Record<string, number>;
  /** This colony: the wonder chosen, where its activity count stood when it was chosen, and stages finished (0 to 3). */
  pick: string | null; base: number; count: number; stage: number;
  /** Seconds a manned stronghold has been searched since the last search. */
  search: Record<string, number>;
  vault: Record<string, number>;
  /** The Bivouac's camp: its tile, and seconds until it can move again. */
  camp: number | null; campCd: number;
  migrated?: boolean;
}
const S = (ctx: Context) => ctx.state.wonders as WState;
const def = (id: string) => WD.list[id];
export const wonderLevel = (ctx: Context, id: string) => S(ctx)?.levels?.[id] ?? 0;
/** The highest level any wonder has reached (migration asks for a full one). */
export const bestWonder = (ctx: Context) => Math.max(0, ...IDS.map((id) => wonderLevel(ctx, id)));
export const blueprintsFound = (ctx: Context) => S(ctx)?.found?.length ?? 0;
export const blueprintCount = IDS.length;
/** The level at which this colony's wonder works: 0 until its Footings are done. */
const live = (ctx: Context, id: string) => { const s = S(ctx); return s?.pick === id && s.stage >= 1 ? wonderLevel(ctx, id) : 0; };
const paying = (ctx: Context, id: string) => { const s = S(ctx); return s?.pick === id && s.stage >= 2; };

type Tile = { t: string; o: string | null; seen: boolean; core?: boolean; sh?: string };
const tiles = (ctx: Context) => (ctx.state.map?.tiles ?? []) as Tile[];
const cheb = (a: number, b: number) => Math.max(Math.abs((a % MAP.cols) - (b % MAP.cols)), Math.abs(Math.floor(a / MAP.cols) - Math.floor(b / MAP.cols)));

// ---- the activity each wonder rises by ----
const chambers = (ctx: Context) => Object.values((ctx.state.nest?.built ?? {}) as Record<string, number>).reduce((a, n) => a + (n || 0), 0);
/** The running count behind a wonder's activity (the pick remembers where it stood). */
function counter(ctx: Context, id: string) {
  if (id === 'thatch') return chambers(ctx);
  if (id === 'canopy') return ctx.state.map?.claims ?? 0;
  return S(ctx).count; // fights won, or seconds living on vault food
}
const progress = (ctx: Context) => { const s = S(ctx); if (!s.pick) return 0; const n = counter(ctx, s.pick) - s.base; return Math.max(0, s.pick === 'vault' ? n / 60 : n); };

// ---- blueprints ----
function search(ctx: Context, id: string) {
  const s = S(ctx), d = def(id);
  if (s.found.includes(id)) return;
  const signs = s.signs[id] ?? 0;
  if (signs + 1 >= WD.pity || Math.random() < d.chance) {
    s.found.push(id);
    ctx.log(`A blueprint, found at ${d.where}: ${d.name}. ${d.real} Your line keeps it for good. (Legacy, Wonder)`, 'story');
    ctx.announce(d.name, `${d.real} A colony can now choose it as its wonder.`, { kicker: 'Blueprint found' });
  } else {
    s.signs[id] = signs + 1;
    ctx.log(`Signs of something at ${d.where}, but no blueprint yet (${signs + 1} of ${WD.pity}: the search after ${WD.pity - 1} signs is sure to find it).`, 'info');
  }
  ctx.ping('wonders');
}
const mannedKind = (ctx: Context, kind: string) => ((ctx.state.castes?.forts ?? []) as number[]).some((i) => tiles(ctx)[i]?.sh === kind && tiles(ctx)[i].o === 'you');
function searches(ctx: Context, dt: number) {
  const s = S(ctx);
  for (const id of IDS) {
    if (s.found.includes(id)) continue;
    const d = def(id);
    if (d.from === 'rival') { const t = tiles(ctx)[MAP.rival[1] * MAP.cols + MAP.rival[0]]; if (ctx.flags.has('rival:defeated') || t?.o === 'you') search(ctx, id); continue; }
    if (!d.every || !mannedKind(ctx, d.from)) continue;
    s.search[id] = (s.search[id] ?? 0) + dt;
    if (s.search[id] >= d.every) { s.search[id] = 0; search(ctx, id); }
  }
}

// ---- choosing, and rising ----
export function chooseWonder(ctx: Context, id: string) {
  const s = S(ctx);
  if (s.pick || !s.found.includes(id)) return;
  s.pick = id; s.stage = 0; s.count = 0; s.base = counter(ctx, id);
  ctx.log(`This colony will raise ${def(id).name}. It rises by ${def(id).act}, and cannot be changed until the next flight.`, 'story');
}
function rise(ctx: Context) {
  const s = S(ctx);
  if (!s.pick) return;
  const d = def(s.pick), p = progress(ctx);
  while (s.stage < 3 && p >= d.goals[s.stage]) {
    s.stage++;
    const L = wonderLevel(ctx, s.pick);
    if (s.stage === 1) ctx.log(`${d.name}: the footings are done. ${L ? `It works now, at level ${L}.` : 'It does nothing yet: your line has no levels in it.'}`, 'story');
    if (s.stage === 2) ctx.log(`${d.name}: the body stands. From here on its price is paid. ${d.cost}`, 'warn');
    if (s.stage === 3) {
      if (L < WD.max) {
        s.levels[s.pick] = L + 1;
        ctx.log(`${d.name} is crowned. Level ${L + 1}, kept by your line for good: ${d.levels[L]}`, 'story');
        ctx.announce(`${d.name}, level ${L + 1}`, d.levels[L], { kicker: L + 1 >= WD.max ? 'Wonder fully raised' : 'Wonder crowned' });
      } else ctx.log(`${d.name} is crowned again. It is already fully raised.`, 'story');
    }
    ctx.ping('wonders');
  }
}

// ---- the Bivouac's camp ----
export const campAt = (ctx: Context) => (live(ctx, 'bivouac') >= 1 ? S(ctx).camp : null);
export const campReach = (ctx: Context) => (live(ctx, 'bivouac') >= 4 ? WD.bivouac.farReach : WD.bivouac.reach);
/** Is tile i within the camp's reach? `claims`: for scouts (level 2), not only the army. */
export const nearCamp = (ctx: Context, i: number, claims = false) => { const c = campAt(ctx); return c != null && (!claims || live(ctx, 'bivouac') >= 2) && cheb(c, i) <= campReach(ctx); };
const moveTime = (ctx: Context) => WD.bivouac.move / (live(ctx, 'bivouac') >= 4 ? 2 : 1);
export const campWait = (ctx: Context) => S(ctx).campCd ?? 0;
export const canPitch = (ctx: Context, i: number | null) => { const t = i == null ? null : tiles(ctx)[i]; return live(ctx, 'bivouac') >= 1 && !!t && t.o === 'you' && S(ctx).camp !== i && campWait(ctx) <= 0; };
let overrunning = false;
export function pitchCamp(ctx: Context, i: number) {
  if (!canPitch(ctx, i)) return;
  const s = S(ctx);
  s.camp = i; s.campCd = moveTime(ctx);
  ctx.log('The camp is struck and pitched again on new ground.', 'info');
  if (live(ctx, 'bivouac') < 5) return;
  const x = i % MAP.cols, y = Math.floor(i / MAP.cols);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= MAP.cols || ny >= MAP.rows) continue;
    const t = tiles(ctx)[ny * MAP.cols + nx];
    if (!t || t.core || t.sh || (t.o !== 'rival' && t.o !== 'spider')) continue;
    overrunning = true; ctx.bus.emit('map:capture', { x: nx, y: ny }); overrunning = false;
    ctx.log('The camp rolls over the enemy ground beside it. The tile is ours without a fight.', 'story');
    return;
  }
}

// ---- the Honey Vault ----
export const vaultOf = (ctx: Context, r: string) => S(ctx)?.vault?.[r] ?? 0;
function vault(ctx: Context, dt: number) {
  // the vault itself comes with choosing it (Nov 17): it is how this wonder rises, so it works from level 0
  const s = S(ctx), L = live(ctx, 'vault'), on = s.pick === 'vault';
  for (const r of VAULTED) {
    const spilt = ctx.res.has(r) ? ctx.res.spill(r) : 0; // always drained, so an old spill never lands in a new vault
    if ((r === 'food' ? on : L >= 4) && spilt > 0) s.vault[r] = (s.vault[r] ?? 0) + spilt;
  }
  if (!on) return;
  const cap = ctx.res.cap('food'), low = cap * (L >= 1 ? WD.vault.feedUpTo : WD.vault.feedAt);
  if (s.vault.food > 0 && ctx.res.amt('food') < low) {
    const n = Math.min(s.vault.food, low - ctx.res.amt('food'));
    ctx.res.source = 'Honey Vault'; ctx.res.add('food', n); s.vault.food -= n;
    s.count += dt; // the wonder rises by time the colony lives on vault food
  }
  if (L >= 3 && ctx.res.has('jelly') && s.vault.food > 0 && ctx.res.amt('jelly') < ctx.res.cap('jelly')) {
    const n = Math.min(s.vault.food, WD.vault.jellyRate * dt);
    s.vault.food -= n; ctx.res.source = 'Honey Vault'; ctx.res.add('jelly', n / WD.vault.jellyFood);
  }
}

/** Publish every rule as a shared mod (source 'wonders'). */
function publish(ctx: Context) {
  const s = S(ctx), m = (k: string, v: number) => ctx.mods.set(k, 'wonders', v);
  // Thatch Mound
  const th = live(ctx, 'thatch'), cold = ctx.mods.get('winter') > 0 ? (th >= 2 ? 1 : th >= 1 ? 0.5 : 0) : 0;
  m('mouldMade', paying(ctx, 'thatch') ? WD.thatch.mould : 0);
  m('job:forager', 0.75 * cold); m('job:leafcutter', 0.5 * cold); m('brood', 0.5 * cold); // gives back what winter takes (SEASONS)
  m('untendedFull', th >= 3 ? 1 : 0);
  m('winterTrails', th >= 4 ? 1 : 0);
  m('shortWinter', th >= 5 ? 1 : 0);
  // Bivouac
  const held = paying(ctx, 'bivouac') ? Math.floor(ctx.res.amt('ant') * WD.bivouac.share) : 0;
  if (held) ctx.busy.bivouac = held; else delete ctx.busy.bivouac;
  m('campaignTime', live(ctx, 'bivouac') >= 3 ? WD.bivouac.campaign : 0);
  if (s.camp != null && tiles(ctx)[s.camp]?.o !== 'you') s.camp = null;
  // Honey Vault
  m('raidSize', paying(ctx, 'vault') ? WD.vault.raid : 0);
  m('stealMult', paying(ctx, 'vault') ? WD.vault.steal : 0);
  const vl = live(ctx, 'vault');
  for (const r of VAULTED) ctx.res.purse[r] = vl >= (r === 'food' ? 2 : 4) ? { amt: () => s.vault[r] ?? 0, take: (n) => { s.vault[r] = Math.max(0, (s.vault[r] ?? 0) - n); } } : undefined;
  // Canopy
  const ca = live(ctx, 'canopy');
  m('wonderSoil', paying(ctx, 'canopy') ? WD.canopy.soil : 0);
  const grass = ca ? tiles(ctx).filter((t) => t.o === 'you' && t.t === 'grass').length : 0;
  ctx.res.setCapBonus('ant', 'canopy', grass * (ca >= 4 ? WD.canopy.living[1] : ca >= 1 ? WD.canopy.living[0] : 0));
  m('leafNestOne', ca >= 2 ? 1 : 0);
  m('treeRoads', ca >= 3 ? 1 : 0);
  m('noSteal', ca >= 5 ? 1 : 0);
}

// ---- drawing: placeholder art, 8x8, until Nate's sprites ----
const ART: Record<string, { rows: string[]; pal: Record<string, string> }> = {
  thatch: { rows: ['........', '...aa...', '..abba..', '.abcbba.', '.abbcba.', 'abcbbbca', 'abbbcbba', 'dddddddd'], pal: { a: '#5a4a2a', b: '#9a7a3a', c: '#c9a85a', d: '#3a2e1c' } },
  bivouac: { rows: ['........', '..rrrr..', '.rRrRrr.', 'rrRrrRrr', 'rRrrRrRr', 'rrRrrrrr', '.rr..rr.', '.r....r.'], pal: { r: '#c4532f', R: '#7a2f18' } },
  vault: { rows: ['dddddddd', '.d.dd.d.', '.h.hh.h.', 'hHhhHhHh', 'hHhHHhHh', 'hhhHHhhh', '.h.hh.h.', '........'], pal: { d: '#3a2e1c', h: '#e0a030', H: '#f8d070' } },
  canopy: { rows: ['..gGg...', '.gGGGg..', 'gGgGGGg.', '.GGgGGGg', '..gGGg..', '...tt...', '...tt...', '..tttt..'], pal: { g: '#5f8a3a', G: '#8fb85a', t: '#5a3a22' } },
};
function drawArt(id: string) {
  const cv = el('canvas', { width: 8, height: 8 }), g = cv.getContext('2d')!, a = ART[id];
  g.fillStyle = '#1d1a17'; g.fillRect(0, 0, 8, 8);
  a.rows.forEach((r, y) => { for (let x = 0; x < 8; x++) if (r[x] !== '.') { g.fillStyle = a.pal[r[x]]; g.fillRect(x, y, 1, 1); } });
  return cv;
}

const fresh = (): WState => ({ levels: {}, found: [], signs: {}, pick: null, base: 0, count: 0, stage: 0, search: {}, vault: {}, camp: null, campCd: 0, migrated: true });

export const wonders: GameSystem = {
  id: 'wonders',
  init(ctx) {
    ctx.state.wonders = fresh();
    ctx.bus.on('loaded', () => {
      const s = S(ctx), old = s as unknown as { levels?: Record<string, number>; reserve?: number };
      for (const [k, v] of Object.entries(fresh())) (s as unknown as Record<string, unknown>)[k] ??= v;
      // saves from the old tile wonders: their levels become signs toward the blueprints, and the deep reserve goes into the vault
      const gone = Object.keys(s.levels).filter((id) => !IDS.includes(id));
      if (gone.length) {
        let signs = Math.floor(gone.reduce((a, id) => a + (old.levels![id] ?? 0), 0) / WD.oldPerSign);
        for (const id of gone) delete s.levels[id];
        const hunt = IDS.filter((id) => def(id).chance < 1);
        for (let k = 0; signs > 0 && k < hunt.length * (WD.pity - 1); k++) { const id = hunt[k % hunt.length]; if ((s.signs[id] ?? 0) < WD.pity - 1) { s.signs[id] = (s.signs[id] ?? 0) + 1; signs--; } }
        if (old.reserve) s.vault.food = (s.vault.food ?? 0) + old.reserve;
        ctx.log('The old wonders are gone: a wonder is now one way of life for each colony. What your line learned raising them counts as signs toward the new blueprints. (Legacy, Wonder)', 'story');
      }
    });
    const fight = () => { const s = S(ctx); if (s.pick === 'bivouac' && !overrunning) s.count++; };
    ctx.bus.on('war:won', fight);
    ctx.bus.on('map:capture', fight);
    ctx.bus.on('rumour:done', () => search(ctx, 'vault'));
  },
  isUnlocked: (ctx) => { const s = S(ctx); return s.found.length > 0 || Object.keys(s.signs).length > 0 || bestWonder(ctx) > 0 || ctx.flags.has('stronghold:held') || ctx.flags.has('rival:defeated') || ctx.flags.has('legacy:flown'); },
  keep(ctx) {
    const s = S(ctx), carry = live(ctx, 'vault') >= 5 ? WD.vault.carry : 0;
    return { ...fresh(), levels: s.levels, found: s.found, signs: s.signs, vault: Object.fromEntries(VAULTED.map((r) => [r, Math.floor((s.vault[r] ?? 0) * carry)])) };
  },
  tick(ctx, dt) {
    const s = S(ctx);
    if (!ctx.flags.has('wonders:open') && wonders.isUnlocked!(ctx)) ctx.flags.add('wonders:open'); // opens the Guide's Wonders page
    s.campCd = Math.max(0, (s.campCd ?? 0) - dt);
    searches(ctx, dt);
    rise(ctx);
    publish(ctx);
    vault(ctx, dt);
  },
  panel: (() => {
    let picks: HTMLElement, card: HTMLElement, sel = 0, sig = '', armed = '';
    const draw = (ctx: Context) => {
      const s = S(ctx);
      picks.replaceChildren(...IDS.map((id, i) => {
        const d = def(id), found = s.found.includes(id);
        const b = el(`button.wn-pick${i === sel ? '.sel' : ''}${found ? '' : '.lost'}${s.pick === id ? '.live' : ''}` as 'button', { type: 'button' }, drawArt(id),
          el('div.nm', {}, found ? d.name : 'Not found'), el('div.lv', {}, found ? `Level ${wonderLevel(ctx, id)} of ${WD.max}` : `Signs ${s.signs[id] ?? 0} of ${WD.pity}`));
        b.addEventListener('click', () => { sel = i; armed = ''; sig = ''; });
        return b;
      }));
      const id = IDS[sel], d = def(id), found = s.found.includes(id), L = wonderLevel(ctx, id), mine = s.pick === id;
      const kids: (Node | string)[] = [el('h4', {}, d.name), el('div.real', {}, d.real)];
      if (!found) {
        const n = s.signs[id] ?? 0;
        kids.push(el('div.hunt', {}, `The blueprint is hidden at ${d.where}. ${d.how}`,
          ...(d.chance < 1 ? [` Each search might find it. You have found signs ${n} time${n === 1 ? '' : 's'}, and search ${WD.pity} is sure to find it.`, el('span.pips', {}, ...Array.from({ length: WD.pity }, (_, k) => el(k < n ? 'i.on' : 'i')))] : [])));
      } else kids.push(el('div.sec', {}, 'Its price, at every level'), el('div.cost', {}, d.cost));
      kids.push(el('div.sec', {}, 'Levels, kept by your line for good'));
      kids.push(el('div.levels', {}, ...d.levels.map((t, k) => {
        const st = k < L ? 'have' : k === L && found ? 'next' : 'todo';
        return el(`div.lvl.${st}` as 'div', {}, el('b', {}, String(k + 1)), el('span', {}, t, st === 'next' ? el('small', {}, mine ? (s.stage >= 3 ? 'Earned next: crown the wonder in another colony.' : 'Crown the wonder in this colony to earn this level.') : 'Crown the wonder in a colony to earn this level.') : null));
      })));
      if (found) {
        const p = mine ? progress(ctx) : 0;
        kids.push(el('div.sec', {}, mine ? `Rising in this colony, by ${d.act}` : `How it rises: by ${d.act}, counted from when you choose it`));
        if (d.note) kids.push(el('div.hunt', {}, d.note));
        kids.push(el('div.stages', {}, ...WD.stages.map((name, k) => {
          const g = d.goals[k], fill = el('i'); fill.style.width = `${Math.min(1, p / g) * 100}%`;
          return el('div.stage', {}, el('b', {}, name), el('div.t', {}, `${fmt(Math.min(p, g), true)} of ${g} ${d.act}`), el('div.bar', {}, fill),
            el('div.t', {}, k === 0 ? 'Switches the wonder on at the levels you own' : k === 1 ? 'Its price is paid from here on' : 'Earns the next level for good'));
        })));
        const b = el('button.wn-act', { type: 'button' }, mine ? 'This colony\'s wonder. It cannot be changed until the next flight.' : s.pick ? 'This colony has already chosen' : armed === id ? 'Really? It cannot be changed until the next flight' : 'Choose for this colony') as HTMLButtonElement;
        b.disabled = !!s.pick;
        b.addEventListener('click', () => { if (armed !== id) { armed = id; sig = ''; setTimeout(() => { if (armed === id) { armed = ''; sig = ''; } }, 4000); return; } armed = ''; chooseWonder(ctx, id); sig = ''; });
        kids.push(b);
      }
      card.replaceChildren(...kids);
    };
    return {
      title: 'Wonder',
      group: 'Legacy',
      mount(root) {
        picks = el('div.wn-picks'); card = el('div.wn-card');
        root.append(
          el('p.flavor', {}, 'One wonder for each colony. It decides what kind of colony this is.'),
          el('p.muted', {}, `Wonder levels are the main thing a colony hands on to the next: every level changes a rule for good. The line cannot migrate to the town until one wonder reaches level ${WD.max}, so plan to crown a wonder in every colony.`),
          picks, card);
      },
      update(_root, ctx) {
        const s = S(ctx);
        const key = [sel, armed, s.pick, s.stage, s.found.join(), IDS.map((id) => `${s.signs[id] ?? 0}${wonderLevel(ctx, id)}`).join(), Math.floor(progress(ctx) * 10)].join('|');
        if (key === sig) return;
        sig = key;
        draw(ctx);
      },
    };
  })(),
};

// ---- the project bar above the tabs: this colony's wonder ----
const projRoot = el('div.projectbar', { hidden: true });
dockProject(projRoot, (ctx) => {
  const s = S(ctx);
  projRoot.hidden = !s?.pick || s.stage >= 3;
  if (projRoot.hidden) return;
  const d = def(s.pick!), p = progress(ctx), g = d.goals[s.stage], from = s.stage ? d.goals[s.stage - 1] : 0;
  const key = `${s.pick}${s.stage}${Math.floor(p * 10)}`;
  if (projRoot.dataset.k === key) return;
  projRoot.dataset.k = key;
  const fill = el('span.fill'); fill.style.width = `${(Math.min(1, (p - from) / (g - from)) * 100).toFixed(1)}%`;
  projRoot.replaceChildren(el('div.project', { title: 'Legacy, Wonder' }, el('span.pname', {}, `${d.name}: ${WD.stages[s.stage]}`), el('span.bar', {}, fill), el('span.ppct', {}, `${fmt(Math.min(p, g), true)} / ${g} ${d.act}`)));
});
