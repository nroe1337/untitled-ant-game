// Supercolony: the third prestige. The line stops being colonies and becomes one people across a
// continent. Lineage and heritage are kept; Unity is earned on top, from the regions you hold.
// Regions get a role (farm, forge, nursery, garrison). Each neighbouring nation is a front with a
// standing order: hold, push or raid. Fronts move on their own; you only set the orders.
// The continent is kept forever. Reads town, migration and jobs state. Publishes mods.
import type { GameSystem, Context } from '../../core/types';
import { el } from '../../core/ui';
import { fmt, fmtCosts } from '../../core/resources';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { PAL, rect, setup } from '../../core/pixel';
import { SUPER as U, TOWN } from '../../data/town';

type Order = 'hold' | 'push' | 'raid';
interface Region { terrain: string; owner: string | null; role: string; home?: boolean }
interface Front { order: Order; progress: number; pressure: number; strength: number }
interface SuperState { regions: Region[]; fronts: Record<string, Front>; laws: Record<string, number>; selected: number | null; becoming?: boolean; supers: number }
const S = (ctx: Context) => ctx.state.supercolony as SuperState;
const LAWS = fromBalance(U.laws);
const law = (ctx: Context, id: keyof typeof U.laws) => S(ctx).laws[id] ?? 0;
const idx = (x: number, y: number) => y * U.cols + x;
const xy = (i: number) => [i % U.cols, Math.floor(i / U.cols)] as const;
const neighbours = (i: number) => { const [x, y] = xy(i); return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < U.cols && b < U.rows).map(([a, b]) => idx(a, b)); };
const owned = (ctx: Context) => S(ctx).regions.filter((r) => r.owner === 'you');
const isSuper = (ctx: Context) => ctx.flags.has('legacy:super');

function makeContinent(): Region[] {
  const regions: Region[] = [];
  for (let y = 0; y < U.rows; y++) for (let x = 0; x < U.cols; x++) {
    const h = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
    const terrain = y >= 4 && x >= 3 && x <= 5 ? 'desert' : h < 0.15 ? 'marsh' : h < 0.45 ? 'forest' : h > 0.9 ? 'town' : 'meadow';
    let owner: string | null = null, best = 2.3;
    for (const [n, [sx, sy]] of Object.entries(U.seeds)) { const d = Math.hypot(sx - x, sy - y); if (d < best) { best = d; owner = n; } }
    regions.push({ terrain, owner, role: 'farm' });
  }
  const home = regions[idx(...U.home)];
  home.owner = 'you'; home.home = true;
  return regions;
}
const bordering = (ctx: Context) => {
  const s = S(ctx), set = new Set<string>();
  s.regions.forEach((r, i) => { if (r.owner === 'you') for (const n of neighbours(i)) { const o = s.regions[n].owner; if (o && o !== 'you') set.add(o); } });
  return [...set];
};
const ourStrength = (ctx: Context) => {
  const garrisons = owned(ctx).filter((r) => r.role === 'garrison').length;
  const soldiers = ((ctx.state.jobs?.assigned?.soldier ?? 0) + (ctx.state.jobs?.assigned?.major ?? 0) * 3) * (1 + ctx.mods.get('soldierPower'));
  return (garrisons * U.garrison + soldiers * U.soldierShare + 10) * (1 + U.laws.army.per * law(ctx, 'army'));
};
const unityRate = (ctx: Context) => owned(ctx).length * U.unityPerRegion * (1 + U.laws.roads.per * law(ctx, 'roads'));

function checks(ctx: Context): [string, boolean][] {
  const t = ctx.state.town;
  const sites = t ? Object.keys(TOWN.sites).filter((id) => (!TOWN.sites[id].rival || t.cleared.includes(id)) && (!TOWN.sites[id].needs || ctx.flags.has(TOWN.sites[id].needs!))).length : 0;
  const sats = t ? Object.values(t.sats as Record<string, number>).reduce((a, b) => a + b, 0) : 0;
  const her = ctx.state.migration?.total ?? 0;
  return [
    [`${U.needs.migrations} migration${U.needs.migrations > 1 ? 's' : ''} (${ctx.state.migration?.migrations ?? 0})`, (ctx.state.migration?.migrations ?? 0) >= U.needs.migrations],
    [`All ${U.needs.sites} town sites open (${sites})`, sites >= U.needs.sites],
    [`${U.needs.satellites} satellite nests in this colony (${sats})`, sats >= U.needs.satellites],
    [`${U.needs.heritage} heritage earned in all (${her})`, her >= U.needs.heritage],
  ];
}

export const supercolony: GameSystem = {
  id: 'supercolony',

  init(ctx) {
    ctx.res.define({ id: 'unity', name: 'Unity', order: 1002, group: 'Legacy' });
    ctx.state.supercolony = { regions: makeContinent(), fronts: {}, laws: {}, selected: null, supers: 0 } satisfies SuperState;
  },

  isUnlocked: (ctx) => isSuper(ctx) || ctx.flags.has('tech:metalwork'),

  keep(ctx) {
    const s = S(ctx);
    return { ...s, selected: null, becoming: false, unityStore: ctx.res.amt('unity') };
  },

  tick(ctx, dt) {
    const s = S(ctx) as SuperState & { unityStore?: number };
    if (s.unityStore !== undefined) { ctx.res.set('unity', s.unityStore); delete s.unityStore; }
    // the regions' roles and the laws reach every colony
    const roles: Record<string, number> = {};
    for (const r of owned(ctx)) { const d = U.roles[r.role]; if (d.mod) roles[d.mod] = (roles[d.mod] ?? 0) + d.per; }
    ctx.mods.set('job:forager', 'super', (roles['job:forager'] ?? 0) + U.laws.scent.per * law(ctx, 'scent'));
    ctx.mods.set('brood', 'super', (roles.brood ?? 0) + U.laws.brood.per * law(ctx, 'brood'));
    ctx.mods.set('soldierPower', 'super', roles.soldierPower ?? 0);
    ctx.mods.set('upkeep', 'super', -U.laws.stores.per * law(ctx, 'stores'));
    if (!isSuper(ctx)) return;
    ctx.res.add('unity', unityRate(ctx) * dt);
    // fronts
    const ours = ourStrength(ctx);
    const nations = bordering(ctx);
    for (const n of nations) {
      const N = U.nations[n];
      const f = (s.fronts[n] ??= { order: 'hold', progress: 0, pressure: 0, strength: N.strength });
      f.strength *= 1 + (U.nationGrowth / 60) * dt;
      const diff = ours - f.strength;
      if (f.order === 'push' && diff > 0) f.progress += diff * U.push * dt / 10;
      if (f.order === 'raid') { ctx.res.add('unity', U.raidUnity * dt); f.strength = Math.max(N.strength * 0.5, f.strength - 0.01 * dt); }
      const def = f.order === 'hold' ? 2 : 1;
      if (-diff * N.aggression > 0) f.pressure += (-diff * N.aggression / def) * U.pressure * dt / 10;
      else f.pressure = Math.max(0, f.pressure - dt * 0.1);
      if (f.progress >= 100) {
        f.progress = 0;
        const target = s.regions.findIndex((r, i) => r.owner === n && neighbours(i).some((j) => s.regions[j].owner === 'you'));
        if (target >= 0) { s.regions[target].owner = 'you'; s.regions[target].role = 'farm'; f.strength *= 0.85; ctx.log(`The ${N.name.toLowerCase()} are pushed back. A new region joins the supercolony.`, 'story'); }
      }
      if (f.pressure >= 100) {
        f.pressure = 0;
        const lost = s.regions.findIndex((r, i) => r.owner === 'you' && !r.home && neighbours(i).some((j) => s.regions[j].owner === n));
        if (lost >= 0) { s.regions[lost].owner = n; ctx.log(`The ${N.name.toLowerCase()} overrun one of your regions. Hold the front, or send more strength.`, 'warn'); }
      }
    }
    const losing = nations.filter((n) => (s.fronts[n]?.pressure ?? 0) > 50);
    ctx.alert('front', losing.length ? `The ${losing.map((n) => U.nations[n].name.toLowerCase()).join(' and ')} are pressing a front. Set it to Hold, or add garrisons.` : null);
  },

  panel: (() => {
    let pre: HTMLElement, list: HTMLElement, go: HTMLButtonElement, main: HTMLElement;
    let cv: HTMLCanvasElement, info: HTMLElement, sel: HTMLElement, fronts: HTMLElement, laws: ReturnType<typeof upgradeList>;
    let sigSel = '', sigFront = '';
    return {
      title: 'Continent',
      group: 'World',
      mount(root, ctx) {
        list = el('div.ledger');
        go = el('button.action', { type: 'button' }, 'Become a supercolony') as HTMLButtonElement;
        go.addEventListener('click', () => {
          if (go.disabled) return;
          if (!go.dataset.armed) { go.dataset.armed = '1'; go.textContent = 'Really? This colony ends here'; setTimeout(() => { delete go.dataset.armed; go.textContent = 'Become a supercolony'; }, 4000); return; }
          const s = S(ctx);
          s.becoming = true; s.supers++;
          ctx.flags.add('legacy:super');
          ctx.rebirth();
        });
        pre = el('div', {},
          el('p.muted', {}, 'When the town is yours, the line can stop being colonies and become one people: queens by the hundred, nests joined by highways across a continent. This colony ends, but Lineage, Heritage and their perks stay: Unity is earned on top. Your continent, champion, archive and genome stay.'),
          list, el('div.row', {}, go));
        cv = el('canvas.viewer', { width: 320, height: 192, 'aria-label': 'The continent. Click a region.' }) as HTMLCanvasElement;
        cv.addEventListener('click', (e) => {
          const r = cv.getBoundingClientRect();
          const x = Math.floor(((e.clientX - r.left) / r.width) * U.cols), y = Math.floor(((e.clientY - r.top) / r.height) * U.rows);
          S(ctx).selected = idx(x, y); sigSel = '';
        });
        info = el('div.ledger');
        sel = el('div.section');
        fronts = el('div.ledger');
        laws = upgradeList(ctx, () => S(ctx).laws, LAWS);
        main = el('div', {},
          el('p.muted', {}, 'Click a region. Give your regions roles. Each front with a neighbouring nation follows its standing order.'),
          cv, info, sel,
          el('h3', {}, 'Fronts'), fronts,
          el('h3', {}, 'Laws'), laws.root);
        root.append(el('p.flavor', {}, 'One scent from coast to coast.'), pre, main);
      },
      update(_root, ctx) {
        const s = S(ctx);
        const sup = isSuper(ctx);
        pre.hidden = sup; main.hidden = !sup;
        if (!sup) {
          const c = checks(ctx);
          list.replaceChildren(...c.map(([k, ok]) => el('div', {}, el(ok ? 'span' : 'span.muted', {}, k), el('span', {}, ok ? 'done' : 'not yet'))));
          go.disabled = !c.every(([, v]) => v);
          return;
        }
        draw(cv, s);
        info.replaceChildren(...[
          ['Regions held', String(owned(ctx).length)],
          ['Unity', `+${fmt(unityRate(ctx))}/s from regions`],
          ['Front strength', `${fmt(ourStrength(ctx))} (garrisons, a share of this colony's soldiers, laws)`],
        ].map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        // the selected region
        const i = s.selected;
        const key = JSON.stringify([i, i != null ? s.regions[i] : null, owned(ctx).length]);
        if (key !== sigSel) {
          sigSel = key;
          if (i == null) sel.replaceChildren(el('p.muted', {}, 'No region selected.'));
          else {
            const r = s.regions[i];
            const head = el('p', {}, el('strong', {}, r.owner === 'you' ? (r.home ? 'Your home region' : 'Your region') : r.owner ? U.nations[r.owner].name : 'Wild land'), ` (${r.terrain})`);
            const kids: HTMLElement[] = [head];
            if (r.owner === 'you') {
              const roleSel = el('select', { 'aria-label': 'Role' }) as HTMLSelectElement;
              for (const [id, d] of Object.entries(U.roles)) roleSel.append(el('option', { value: id }, `${d.name}: ${d.desc}`));
              roleSel.value = r.role;
              roleSel.addEventListener('change', () => { r.role = roleSel.value; });
              kids.push(el('div.row', {}, el('span.muted', {}, 'Role'), roleSel));
            } else if (!r.owner && neighbours(i).some((j) => s.regions[j].owner === 'you')) {
              const cost = U.claimCost(owned(ctx).length);
              const b = el('button.action', { type: 'button' }, `Settle it (${fmtCosts(cost, ctx.res)})`) as HTMLButtonElement;
              b.addEventListener('click', () => { if (ctx.res.spend(cost)) { r.owner = 'you'; r.role = 'farm'; ctx.log('A daughter colony settles new ground. The supercolony grows.', 'story'); sigSel = ''; } });
              kids.push(el('div.row', {}, b));
            } else if (r.owner && r.owner !== 'you') kids.push(el('p.muted', {}, neighbours(i).some((j) => s.regions[j].owner === 'you') ? 'Take it by pushing on their front.' : 'Not next to your land yet.'));
            else kids.push(el('p.muted', {}, 'Too far. Settle the land next to yours first.'));
            sel.replaceChildren(...kids);
          }
        }
        // fronts
        const ns = bordering(ctx);
        const fk = JSON.stringify(ns.map((n) => [n, s.fronts[n]?.order]));
        if (fk !== sigFront) {
          sigFront = fk;
          fronts.replaceChildren(...(ns.length ? ns.map((n) => {
            const row = el('span', { 'data-n': n });
            for (const o of ['hold', 'push', 'raid'] as Order[]) {
              const b = el((s.fronts[n]?.order ?? 'hold') === o ? 'button.ghost.on' : 'button.ghost', { type: 'button' }, o[0].toUpperCase() + o.slice(1)) as HTMLButtonElement;
              b.addEventListener('click', () => { (s.fronts[n] ??= { order: 'hold', progress: 0, pressure: 0, strength: U.nations[n].strength }).order = o; sigFront = ''; });
              row.append(b);
            }
            return el('div', {}, el('span', {}, el('strong', {}, U.nations[n].name), ' ', el('span.muted.fs', { 'data-f': n })), row);
          }) : [el('div', {}, el('span.muted', {}, 'No neighbours yet.'))]));
        }
        fronts.querySelectorAll<HTMLElement>('[data-f]').forEach((e) => {
          const f = s.fronts[e.dataset.f!];
          if (f) e.textContent = `strength ${fmt(f.strength)}, your push ${Math.round(f.progress)}%, their pressure ${Math.round(f.pressure)}%`;
        });
        laws.update(ctx);
      },
    };
  })(),
};

function draw(cv: HTMLCanvasElement, s: SuperState) {
  const c = setup(cv);
  const w = cv.width / U.cols, h = cv.height / U.rows;
  rect(c, 0, 0, cv.width, cv.height, PAL.bg);
  s.regions.forEach((r, i) => {
    const [x, y] = xy(i);
    rect(c, x * w, y * h, w - 1, h - 1, U.terrains[r.terrain]);
    if (r.owner) {
      const col = r.owner === 'you' ? PAL.bone : U.nations[r.owner].color;
      rect(c, x * w + 3, y * h + 3, w - 7, 4, col);
      if (r.owner === 'you') rect(c, x * w + w / 2 - 2, y * h + h / 2 - 2, 4, 4, r.home ? PAL.you : r.role === 'garrison' ? PAL.stone : r.role === 'forge' ? PAL.amber : r.role === 'nursery' ? PAL.seed : PAL.food);
    }
    if (s.selected === i) { rect(c, x * w, y * h, w - 1, 1, PAL.bone); rect(c, x * w, y * h + h - 2, w - 1, 1, PAL.bone); }
  });
}
