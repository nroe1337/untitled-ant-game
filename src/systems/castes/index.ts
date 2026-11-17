// Castes: chew food into royal jelly (or, with the Garden, let nurses make it from fungus), then spend jelly to breed new kinds of ant.
// Each caste sets the flag "caste:<id>", which unlocks its job on the Jobs tab.
// Also: repletes bank surplus food in a Reserve and feed it back in a famine (reads ctx.state.jobs.assigned.replete),
// and Jelly glands let nurses make jelly on their own (automation).
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, tileButton, type ActionButton } from '../../core/ui';
import { fmt } from '../../core/resources';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { CASTES, EXPEDITIONS, NEST } from '../../data/balance';

interface Walk { post: string; left: number; arg?: string | number }
interface CasteState {
  ups: Record<string, number>; chewed: number;
  /** Units standing at each counted post (walls, trail, pots, deck). */
  posts: Record<string, number>;
  /** Posts opened with royal jelly. */
  open: Record<string, boolean>;
  /** Kin colonies a replete hangs in; Map tiles held by a living bridge or a leaf nest. */
  gift: string[]; bridges: number[]; nests: number[]; forts: number[];
  /** Units still walking to a post. They have left home but don't count at the post yet. */
  walk: Walk[];
}
const S = (ctx: Context) => ctx.state.castes as CasteState;
const IDS = Object.keys(CASTES.types);
const nurses = (ctx: Context) => ctx.state.jobs?.assigned?.nurse ?? 0;
const glandRate = (ctx: Context) => nurses(ctx) * CASTES.upgrades.glands.per * (S(ctx).ups.glands ?? 0);
const UPS = fromBalance(CASTES.upgrades, (ctx) => ctx.flags.has('tech:castes'));

// ---- posts ----
type PostDef = (typeof CASTES.posts)[string]['posts'][number];
const POSTS: Record<string, PostDef & { caste: string }> = {};
for (const [caste, c] of Object.entries(CASTES.posts)) for (const p of c.posts) POSTS[p.id] = { ...p, caste };
const PLACED = ['gift', 'bridge', 'nest', 'fort'];
const placedList = (s: CasteState, id: string): (string | number)[] => (id === 'gift' ? s.gift : id === 'bridge' ? s.bridges : id === 'fort' ? (s.forts ??= []) : s.nests);
/** Units standing at a post now. */
export const postCount = (ctx: Context, id: string) => {
  const s = ctx.state.castes as CasteState | undefined;
  if (!s?.posts) return 0;
  return PLACED.includes(id) ? placedList(s, id).length : s.posts[id] ?? 0;
};
const walking = (ctx: Context, id: string) => S(ctx).walk.filter((w) => w.post === id).length;
const pool = (ctx: Context, caste: string) => (ctx.state.jobs?.assigned?.[CASTES.posts[caste].job] ?? 0) as number;
/** Ants of a caste away from their home post, walkers included. */
export const awayOf = (ctx: Context, caste: string) => {
  if (!(ctx.state.castes as CasteState | undefined)?.posts) return 0;
  return CASTES.posts[caste].posts.reduce((t, p) => t + (postCount(ctx, p.id) + walking(ctx, p.id)) * (p.size ?? 1), 0);
};
const atHome = (ctx: Context, caste: string) => Math.max(0, pool(ctx, caste) - awayOf(ctx, caste));
const postMax = (ctx: Context, p: PostDef) =>
  p.id === 'deck' ? ((ctx.state.waters?.boats?.length ?? 0) as number) : p.max ?? Infinity;
export const postOpen = (ctx: Context, id: string) => !!(ctx.state.castes as CasteState | undefined)?.open?.[id] && ctx.flags.has('caste:' + POSTS[id].caste);
/** Can one more unit set out for this post? arg: the kin colony or Map tile for placed posts. */
export function canPost(ctx: Context, id: string, arg?: string | number) {
  const p = POSTS[id], s = S(ctx);
  if (!postOpen(ctx, id) || atHome(ctx, p.caste) < (p.size ?? 1)) return false;
  if (postCount(ctx, id) + walking(ctx, id) >= postMax(ctx, p)) return false;
  if (arg !== undefined && (placedList(s, id).includes(arg) || s.walk.some((w) => w.post === id && w.arg === arg))) return false;
  return true;
}
export function sendToPost(ctx: Context, id: string, arg?: string | number) {
  if (!canPost(ctx, id, arg)) return false;
  S(ctx).walk.push({ post: id, left: CASTES.walk, arg });
  return true;
}
/** Bring one unit home at once: a walker first, then the last one posted (or the one at arg). */
export function recallFrom(ctx: Context, id: string, arg?: string | number) {
  const s = S(ctx);
  const w = s.walk.map((x, i) => [x, i] as const).filter(([x]) => x.post === id && (arg === undefined || x.arg === arg)).pop();
  if (w) { s.walk.splice(w[1], 1); return true; }
  if (PLACED.includes(id)) {
    const list = placedList(s, id), k = arg === undefined ? list.length - 1 : list.indexOf(arg);
    if (k < 0) return false;
    list.splice(k, 1); return true;
  }
  if ((s.posts[id] ?? 0) <= 0) return false;
  s.posts[id]--; return true;
}
/** Is a replete hanging in this kin colony, or on her way? */
export const giftAt = (ctx: Context, kin: string) => {
  const s = ctx.state.castes as CasteState | undefined;
  return s?.gift?.includes(kin) ? 'there' : s?.walk?.some((w) => w.post === 'gift' && w.arg === kin) ? 'walking' : '';
};
/** Is this Map tile held by a bridge or a leaf nest, or about to be? */
export const tilePost = (ctx: Context, id: 'bridge' | 'nest' | 'fort', i: number) => {
  const s = ctx.state.castes as CasteState | undefined;
  if (!s?.walk) return '';
  return placedList(s, id).includes(i) ? 'there' : s.walk.some((w) => w.post === id && w.arg === i) ? 'walking' : '';
};

/** Older saves: the royal jelly spent on the old caste tracks comes back as opened posts, cheapest first. */
function refundTracks(ctx: Context) {
  const s = S(ctx);
  let jelly = 0;
  for (const [id, [base, growth]] of Object.entries(CASTES.oldTracks)) {
    for (let k = 0; k < (s.ups[id] ?? 0); k++) jelly += base * Math.pow(growth, k);
    delete s.ups[id];
  }
  if (jelly <= 0) return;
  const opened: string[] = [];
  for (const p of Object.values(POSTS).sort((a, b) => a.open - b.open)) {
    if (s.open[p.id] || jelly < p.open || !ctx.flags.has('caste:' + p.caste)) continue;
    s.open[p.id] = true; jelly -= p.open; opened.push(p.name);
  }
  ctx.res.add('jelly', jelly);
  ctx.log('The castes have changed: their long roads are gone, and each caste now has posts around the colony.' + (opened.length ? ` The jelly you had spent opened ${opened.join(', ')}.` : ''), 'info');
}

/** Repletes feed the colony from their reserve: returns how much food they gave. */
export function drawReserve(ctx: Context, want: number) {
  if (want <= 0 || !ctx.res.has('reserve')) return 0;
  const got = Math.min(want, ctx.res.amt('reserve'));
  if (got <= 0) return 0;
  ctx.res.source = 'Feeding the colony';
  ctx.res.add('reserve', -got);
  ctx.res.source = 'Repletes feeding';
  ctx.res.add('food', got);
  return got;
}

export const castes: GameSystem = {
  id: 'castes',

  init(ctx) {
    ctx.res.define({ id: 'jelly', name: 'Royal jelly', cap: CASTES.jellyCap, order: 12, group: 'Brood' });
    ctx.res.define({ id: 'reserve', name: 'Reserve', cap: 0, order: 1.5 });
    ctx.res.define({ id: 'silk', name: 'Silk', cap: NEST.baseMaterialCap.silk, order: 23, integer: true, group: 'Surface' });
    ctx.state.castes = { ups: {}, chewed: 0, posts: {}, open: {}, gift: [], bridges: [], nests: [], forts: [], walk: [] } satisfies CasteState;
  },

  isUnlocked: (ctx) => ctx.flags.has('tech:castes'),

  tick(ctx, dt) {
    const s = S(ctx);
    s.posts ??= {}; s.open ??= {}; s.gift ??= []; s.bridges ??= []; s.nests ??= []; s.forts ??= []; s.walk ??= []; // older saves
    refundTracks(ctx);
    // walkers arrive
    for (const w of s.walk) w.left -= dt;
    for (const w of s.walk.filter((x) => x.left <= 0)) {
      if (PLACED.includes(w.post)) { if (w.arg !== undefined && !placedList(s, w.post).includes(w.arg)) placedList(s, w.post).push(w.arg); }
      else s.posts[w.post] = (s.posts[w.post] ?? 0) + 1;
    }
    s.walk = s.walk.filter((x) => x.left > 0);
    // posts that no longer make sense come home: a boat sank, the kin joined you, the tile changed hands
    while ((s.posts.deck ?? 0) > postMax(ctx, POSTS.deck)) s.posts.deck--;
    const tiles = ctx.state.map?.tiles as { t: string; o: string | null; sh?: string }[] | undefined;
    if (tiles) {
      s.bridges = s.bridges.filter((i) => tiles[i]?.t === 'water' && tiles[i].o !== 'you');
      s.nests = s.nests.filter((i) => tiles[i]?.t === 'grass' && tiles[i].o === 'you');
      s.forts = s.forts.filter((i) => !!tiles[i]?.sh && tiles[i].o === 'you');
    }
    s.gift = s.gift.filter((id) => !ctx.state.kin?.rel?.[id]?.merged);
    // fewer ants of a caste than are posted (they died, or were moved on the Jobs tab): the last posted come home
    for (const [caste, c] of Object.entries(CASTES.posts)) {
      for (let guard = 0; awayOf(ctx, caste) > pool(ctx, caste) && guard < 99; guard++) {
        const p = [...c.posts].reverse().find((x) => postCount(ctx, x.id) + walking(ctx, x.id) > 0);
        if (!p || !recallFrom(ctx, p.id)) break;
      }
    }
    // what the posts do. Bridges, the gift and the deck guard are read by the Map, Kin and Waters.
    ctx.mods.set('raidSize', 'castes', -POSTS.walls.per! * postCount(ctx, 'walls'));
    ctx.mods.set('rumourChance', 'castes', POSTS.trail.per! * postCount(ctx, 'trail'));
    ctx.res.setCapBonus('jelly', 'pots', POSTS.pots.per! * postCount(ctx, 'pots'));
    ctx.res.setCapBonus('ant', 'leafnests', POSTS.nest.per! * postCount(ctx, 'nest'));
    ctx.busy['job:gardener'] = awayOf(ctx, 'minim');
    ctx.busy['job:weaver'] = awayOf(ctx, 'weaver');
    // repletes in the larder fill up from surplus food: only while the stores are more than half full
    const n = atHome(ctx, 'replete');
    ctx.res.setCapBonus('reserve', 'repletes', n * CASTES.replete.hold * (1 + ctx.mods.get('repleteHold')));
    const over = ctx.res.amt('reserve') - ctx.res.cap('reserve'); // repletes moved off the job hand their food back
    if (over > 0) { ctx.res.source = 'Repletes reassigned'; ctx.res.add('reserve', -over); ctx.res.add('food', over); }
    const spare = ctx.res.amt('food') - ctx.res.cap('food') * 0.5;
    const take = Math.min(n * CASTES.replete.fill * (1 + ctx.mods.get('repleteFill')) * dt, ctx.res.cap('reserve') - ctx.res.amt('reserve'), spare);
    if (take > 0) {
      ctx.res.source = 'Repletes filling';
      ctx.res.add('food', -take);
      ctx.res.source = 'Repletes filling';
      ctx.res.add('reserve', take);
    }
    // with the reserve full, spare food becomes a slow trickle of royal jelly
    const R = CASTES.replete;
    const jelly = Math.min(n * R.jelly * (1 + ctx.mods.get('repleteJelly')) * dt, ctx.res.cap('jelly') - ctx.res.amt('jelly'), Math.max(0, spare - Math.max(0, take)) / R.food);
    if (jelly > 0 && ctx.res.amt('reserve') >= ctx.res.cap('reserve') - 1e-6) {
      ctx.res.source = 'Repletes making jelly';
      ctx.res.add('food', -jelly * R.food);
      ctx.res.source = 'Repletes';
      ctx.res.add('jelly', jelly);
    }
    // nurses with jelly glands chew fungus into jelly by themselves
    const make = glandRate(ctx) * dt;
    if (make > 0 && ctx.res.amt('fungus') >= make * 8 && ctx.res.amt('jelly') < ctx.res.cap('jelly')) {
      ctx.res.add('fungus', -make * 8);
      ctx.res.add('jelly', make);
    }
  },

  panel: (() => {
    let chew: ActionButton, list: HTMLElement, ledger: HTMLElement, ups: ReturnType<typeof upgradeList>;
    const rows = new Map<string, ReturnType<typeof tileButton>>();
    interface Row { id: string; root: HTMLElement; now: HTMLElement; walk: HTMLElement; num: HTMLElement; minus: HTMLButtonElement; plus: HTMLButtonElement; step: HTMLElement; open?: ActionButton }
    const cards: { caste: string; root: HTMLElement; dots: HTMLElement; idle: HTMLElement; home: HTMLElement; homeNum: HTMLElement; rows: Row[] }[] = [];
    const secs = (ctx: Context, id: string) => Math.ceil(Math.max(...S(ctx).walk.filter((w) => w.post === id).map((w) => w.left)) / ctx.speed);
    /** What a post is doing right now with the ants it has. */
    const nowText = (ctx: Context, id: string, n: number): string => {
      const pct = (v: number) => Math.round(v * 100) + '%';
      switch (id) {
        case 'walls': return `Raids ${pct(POSTS.walls.per! * n)} smaller`;
        case 'trail': return `Rumours ${pct(POSTS.trail.per! * n / EXPEDITIONS.rumours.chance)} more often`;
        case 'pots': return `+${POSTS.pots.per! * n} jelly room`;
        case 'gift': return `Hanging in ${n} kin ${n > 1 ? 'colonies' : 'colony'}`;
        case 'deck': return `${n} of ${postMax(ctx, POSTS.deck)} boats guarded`;
        case 'fort': return `${n} ${n > 1 ? 'strongholds' : 'stronghold'} manned`;
        case 'bridge': return `${n} ${n > 1 ? 'bridges' : 'bridge'} held`;
        case 'nest': return `${n} ${n > 1 ? 'nests' : 'nest'}, +${POSTS.nest.per! * n} living space`;
        case 'mules': return `${n} with each party`;
      }
      return '';
    };
    const mules = (ctx: Context) => (ctx.state.expeditions?.mules ?? 0) as number;
    const postRow = (ctx: Context, p: { id: string; name: string; where: string; desc: string; cost?: string; open?: number; size?: number; place?: string }): Row => {
      const now = el('div.post-now'), walk = el('div.post-walk', { hidden: true }), num = el('b');
      const placed = PLACED.includes(p.id);
      const act = (d: number) => () => {
        if (p.id === 'mules') { const e = ctx.state.expeditions; if (e) e.mules = Math.max(0, Math.min(EXPEDITIONS.packMules.max, mules(ctx) + d)); return; }
        if (d > 0) sendToPost(ctx, p.id); else recallFrom(ctx, p.id);
      };
      const minus = el('button.small', { type: 'button', onclick: act(-1) }, '−') as HTMLButtonElement;
      const plus = el('button.small', { type: 'button', onclick: act(1), hidden: placed }, '+') as HTMLButtonElement;
      const step = el('div.post-step', {}, minus, num, plus);
      const text = el('div', {},
        el('div', {}, el('strong', {}, p.name), el('span.muted.post-where', {}, p.where)),
        el('div.post-fx', {}, p.desc),
        p.cost ? el('div.post-cost', {}, p.cost) : null,
        now, walk,
        p.place ? el('div.muted.post-place', {}, p.place) : null);
      const root = el('div.post', {}, text, step);
      const row: Row = { id: p.id, root, now, walk, num, minus, plus, step };
      if (p.open) {
        row.open = actionButton({ ctx, label: 'Open post', costs: () => ({ jelly: p.open! }), desc: 'Opens this post for good, for this colony.', enabled: (c) => !S(c).open[p.id], onBuy: (c) => { S(c).open[p.id] = true; c.log(`A new post for the ${CASTES.types[POSTS[p.id].caste].name.toLowerCase()}: ${p.name}.`, 'info'); } });
        root.append(row.open.root);
      }
      return row;
    };
    return {
      title: 'Castes',
      group: 'Colony',
      mount(root, ctx) {
        chew = actionButton({
          ctx, label: 'Chew royal jelly', costs: () => CASTES.chew.cost, cooldown: CASTES.chew.cooldown,
          desc: 'Nurses chew food into one drop of royal jelly.',
          enabled: (c) => c.res.amt('jelly') < c.res.cap('jelly'),
          onBuy: (c) => { c.res.lump('jelly', 1); S(c).chewed++; },
        });
        list = el('div.tiles');
        for (const id of IDS) {
          const t = CASTES.types[id];
          const btn = tileButton({
            ctx, label: `Breed ${t.name.toLowerCase()}`, effect: t.desc, costs: () => t.cost,
            count: () => (ctx.flags.has('caste:' + id) ? 'bred' : ''),
            enabled: (c) => !c.flags.has('caste:' + id),
            onBuy: (c) => { c.flags.add('caste:' + id); c.log(`The first ${t.name.toLowerCase()} crawl out of the warming chamber. ${t.desc}`, 'info'); },
          });
          list.append(btn.root);
          rows.set(id, btn);
        }
        ledger = el('div.ledger');
        ups = upgradeList(ctx, () => S(ctx).ups, UPS);
        const posts = el('div.castes');
        for (const [caste, c] of Object.entries(CASTES.posts)) {
          const dots = el('div.caste-dots'), idle = el('span.muted'), homeNum = el('b');
          const home = el('div.post-now');
          const homeRow = el('div.post', {},
            el('div', {}, el('div', {}, el('strong', {}, c.home.name), el('span.muted.post-where', {}, c.home.where)), el('div.post-fx', {}, c.home.desc), home),
            el('div.post-step', {}, homeNum));
          const prs = c.posts.map((p) => postRow(ctx, p));
          if (caste === 'major') prs.unshift(postRow(ctx, { id: 'mules', name: 'Expedition guard', where: 'Surface', desc: `Up to ${EXPEDITIONS.packMules.max} walk with each party. Fewer workers lost, and they carry the rare finds. They leave the gate only while a party is out.` }));
          const card = el('div.caste', { hidden: true },
            el('div.caste-head', {}, el('div', {}, el('h3', {}, CASTES.types[caste].name), el('div.muted', {}, c.how)), el('div.caste-pool', {}, dots, idle)),
            homeRow, ...prs.map((r) => r.root));
          posts.append(card);
          cards.push({ caste, root: card, dots, idle, home, homeNum, rows: prs });
        }
        root.append(
          el('p.flavor', {}, 'Every larva could become anything. Royal jelly decides what.'),
          el('div.row', {}, chew.root),
          ledger,
          el('h3', {}, 'Castes'),
          list,
          el('p.muted', {}, 'A caste is a few special ants. Give them workers on the Jobs tab, then choose here where they stand. Ants take about half a minute to walk to a new post.'),
          posts,
          el('h3', {}, 'Royal kitchen'),
          ups.root,
        );
      },
      update(_root, ctx) {
        chew.update(ctx);
        for (const id of IDS) rows.get(id)!.update(ctx);
        const rate = glandRate(ctx);
        ledger.replaceChildren(...[
          ['Jelly from nurses', rate ? `${fmt(rate)}/s (uses ${fmt(rate * 8)} fungus/s)` : 'none yet: buy Jelly glands'],
          ['Castes bred', `${IDS.filter((id) => ctx.flags.has('caste:' + id)).length} of ${IDS.length}`],
        ].map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        ups.update(ctx);
        for (const c of cards) {
          const bred = ctx.flags.has('caste:' + c.caste);
          c.root.hidden = !bred;
          if (!bred) continue;
          const total = pool(ctx, c.caste), home = atHome(ctx, c.caste);
          const walkers = CASTES.posts[c.caste].posts.reduce((t, p) => t + walking(ctx, p.id) * (p.size ?? 1), 0);
          const sig = `${total}:${home}:${walkers}`;
          if (c.dots.dataset.sig !== sig) {
            c.dots.dataset.sig = sig;
            c.dots.replaceChildren(...Array.from({ length: Math.min(total, 40) }, (_, i) => el(i < total - home - walkers ? 'i.on' : i < total - home ? 'i.walk' : 'i.home')));
          }
          c.idle.textContent = total ? `${home} of ${total} at the ${CASTES.posts[c.caste].home.name.toLowerCase()}` : 'None yet. Assign some on the Jobs tab.';
          c.homeNum.textContent = String(home);
          c.home.textContent = c.caste === 'minim' ? `${Math.min(ctx.state.nest?.built?.fungus ?? 0, home * 2)} beds kept clean`
            : c.caste === 'replete' ? `Reserve holds up to ${fmt(ctx.res.cap('reserve'))} food`
            : c.caste === 'major' ? `${home} at the gate` : `${home} spinning`;
          for (const r of c.rows) {
            const isMules = r.id === 'mules';
            const p = isMules ? undefined : POSTS[r.id];
            r.root.hidden = isMules ? !ctx.flags.has('tech:packmules') : !!p!.needs && !ctx.flags.has(p!.needs)
              || (r.id === 'gift' && !(ctx.state.map?.world?.kin?.length > 0)) || (r.id === 'deck' && !postMax(ctx, p!) && !S(ctx).open.deck);
            if (r.root.hidden) continue;
            const opened = isMules || !!S(ctx).open[r.id];
            r.root.classList.toggle('locked', !opened);
            r.step.hidden = !opened;
            if (r.open) { r.open.root.hidden = opened; r.open.update(ctx); }
            const n = isMules ? mules(ctx) : postCount(ctx, r.id), size = p?.size ?? 1;
            r.num.textContent = String(n * size);
            r.now.hidden = !opened;
            r.now.textContent = n ? nowText(ctx, r.id, n) : 'Nobody posted';
            r.now.classList.toggle('off', !n);
            const w = isMules ? 0 : walking(ctx, r.id);
            r.walk.hidden = !w;
            if (w) r.walk.textContent = `${w * size} walking there, ${secs(ctx, r.id)}s`;
            r.minus.disabled = n + w <= 0;
            r.plus.disabled = isMules ? n >= EXPEDITIONS.packMules.max : !canPost(ctx, r.id);
          }
        }
      },
    };
  })(),
};
