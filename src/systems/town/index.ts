// The town: after a migration, colonies live among humans. Town foragers work the open sites
// (kitchen, walls, drain...) for crumbs, sugar, grease, paper and iron filings.
// Daylight work draws the humans' attention. Attention brings bait stations (poisoned food, which
// tasters catch or a purge clears), then a spray, then a sealed kitchen. Work at night to stay quiet.
// Pavement ants hold some sites until soldiers clear them. Satellite nests in walls and drains add room.
// Reads jobs.assigned (townforager, taster, soldier, major). Publishes mods; reads the 'attention' mod.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, progressBar, tileButton, type ActionButton } from '../../core/ui';
import { fmt } from '../../core/resources';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { PAL, rect, setup } from '../../core/pixel';
import { TOWN as T } from '../../data/town';

type Sched = 'day' | 'night' | 'both';
interface TownState {
  sched: Sched; clock: number; attention: number; taint: number; poisoned: number;
  sealed: Record<string, number>; cleared: string[]; sats: Record<string, number>; ups: Record<string, number>;
  sprayed: boolean; lost: number;
}
const S = (ctx: Context) => ctx.state.town as TownState;
const SITES = T.sites;
const UPS = fromBalance(T.upgrades);
const lvl = (ctx: Context, id: keyof typeof T.upgrades) => S(ctx).ups[id] ?? 0;
const job = (ctx: Context, id: string) => ctx.state.jobs?.assigned?.[id] ?? 0;
const isDay = (ctx: Context) => (S(ctx).clock % T.dayLength) < T.dayLength / 2;
const soldierStrength = (ctx: Context) => (job(ctx, 'soldier') + job(ctx, 'major') * 3) * (1 + ctx.mods.get('soldierPower'));
const siteVisible = (ctx: Context, id: string) => !SITES[id].needs || ctx.flags.has(SITES[id].needs!);
const siteOpen = (ctx: Context, id: string) => siteVisible(ctx, id) && (!SITES[id].rival || S(ctx).cleared.includes(id)) && !((S(ctx).sealed[id] ?? 0) > 0);
const openSites = (ctx: Context) => Object.keys(SITES).filter((id) => siteOpen(ctx, id));
/** How hard the foragers are working right now (0 when off shift). */
function work(ctx: Context) {
  const sched = S(ctx).sched, day = isDay(ctx);
  if (sched === 'day') return day ? 1 : 0;
  if (sched === 'night') return day ? 0 : T.night;
  return day ? 1 : T.night;
}
const baitOut = (ctx: Context) => S(ctx).attention >= T.thresholds.bait;

function rates(ctx: Context) {
  const out: Record<string, number> = {};
  const open = openSites(ctx);
  if (!open.length) return out;
  const each = (job(ctx, 'townforager') * T.perForager * work(ctx) * (1 + T.upgrades.tooth.per * lvl(ctx, 'tooth') + ctx.mods.get('townYield'))) / open.length;
  for (const id of open) for (const [r, v] of Object.entries(SITES[id].yields)) out[r] = (out[r] ?? 0) + v * each;
  return out;
}

export const town: GameSystem = {
  id: 'town',

  init(ctx) {
    let o = 20;
    for (const [id, cap] of Object.entries(T.caps)) ctx.res.define({ id, name: id[0].toUpperCase() + id.slice(1), cap, order: o++, group: 'Town' });
    ctx.state.town = { sched: 'day', clock: 0, attention: 0, taint: 0, poisoned: 0, sealed: {}, cleared: [], sats: {}, ups: {}, sprayed: false, lost: 0 } satisfies TownState;
  },

  isUnlocked: (ctx) => ctx.flags.has('tech:townlore'),

  tick(ctx, dt) {
    const s = S(ctx);
    // satellite nests count even before the tab is open
    const sat = (k: 'antCap' | 'brood' | 'upkeep') => Object.entries(s.sats).reduce((t, [id, n]) => t + (T.satellites[id][k] ?? 0) * n, 0);
    ctx.res.setCapBonus('ant', 'town', sat('antCap'));
    ctx.mods.set('brood', 'town', sat('brood'));
    ctx.mods.set('upkeep', 'town', -sat('upkeep'));
    ctx.mods.set('larvaGrowth', 'town', ctx.res.amt('sugar') >= 1 ? T.upgrades.syrup.per * lvl(ctx, 'syrup') : 0);
    ctx.mods.set('voyageSpeed', 'town', T.upgrades.grease.per * lvl(ctx, 'grease'));
    ctx.mods.set('soldierPower', 'town', T.upgrades.filings.per * lvl(ctx, 'filings'));
    if (!ctx.flags.has('tech:townlore')) return;

    s.clock += dt;
    for (const k of Object.keys(s.sealed)) { s.sealed[k] -= dt; if (s.sealed[k] <= 0) { delete s.sealed[k]; ctx.log(`${SITES[k].name} is open again. The humans have forgotten.`, 'info'); } }
    // gather
    const r = rates(ctx);
    for (const [rid, v] of Object.entries(r)) if (ctx.res.has(rid)) ctx.res.add(rid, v * dt);
    // poisoned food comes in with what's gathered at busy sites while bait is out
    if (baitOut(ctx)) {
      const busy = openSites(ctx).filter((id) => SITES[id].weight >= 1).length / Math.max(1, openSites(ctx).length);
      s.taint += ((r.crumbs ?? 0) + (r.sugar ?? 0)) * busy * T.taintShare * dt;
    }
    // tasters clean, the rest gets eaten
    s.taint = Math.max(0, s.taint - job(ctx, 'taster') * T.tasterClean * dt);
    if (s.taint > 0) {
      const eaten = Math.min(s.taint, 0.03 * dt);
      s.taint -= eaten; s.poisoned += eaten;
      while (s.poisoned >= T.taintPerDeath && ctx.res.amt('ant') >= 1) { s.poisoned -= T.taintPerDeath; ctx.res.add('ant', -1); s.lost++; ctx.log('A worker eats poisoned food and dies.', 'warn'); }
    }
    // attention: only daylight work is seen
    const quiet = Math.max(0.2, 1 - T.upgrades.feet.per * lvl(ctx, 'feet') + ctx.mods.get('attention'));
    if (isDay(ctx) && work(ctx) > 0) {
      const open = openSites(ctx);
      const weight = open.reduce((t, id) => t + SITES[id].weight, 0) / Math.max(1, open.length);
      s.attention += job(ctx, 'townforager') * T.attentionPerAnt * weight * quiet * dt;
    }
    s.attention = Math.max(0, Math.min(100, s.attention - T.attentionDecay * dt));
    const was = s.attention;
    if (was >= T.thresholds.spray && !s.sprayed) {
      s.sprayed = true;
      const dead = Math.min(8, Math.ceil(job(ctx, 'townforager') * T.sprayKills));
      if (dead) { ctx.res.add('ant', -dead); s.lost += dead; }
      ctx.log(`A human sprays the kitchen. ${dead} town foragers die in the mist.`, 'warn');
    }
    if (s.attention < T.thresholds.bait) s.sprayed = false;
    if (s.attention >= T.thresholds.seal && siteOpen(ctx, 'kitchen')) {
      s.sealed.kitchen = T.sealTime;
      s.attention = 50;
      ctx.log('The humans seal the gaps around the kitchen. Nobody gets in for a while.', 'warn');
    }
    ctx.alert('taint', s.taint > 0.5 ? `Poisoned food in the stores (${fmt(s.taint)}). Workers will die eating it. Put workers on Taster, or purge the stores in the Town tab.` : null);
    ctx.alert('attention', s.attention >= T.thresholds.bait ? `The humans have noticed you (${Math.round(s.attention)}/100). Bait stations are out. Work at night, or ease off, before they spray.` : null);
  },

  panel: (() => {
    let cv: HTMLCanvasElement, clockEl: HTMLElement, schedRow: HTMLElement, ledger: HTMLElement, siteBox: HTMLElement, satBox: HTMLElement;
    let purge: ActionButton, ups: ReturnType<typeof upgradeList>;
    const attBar = progressBar();
    const sats: { id: string; btn: ReturnType<typeof tileButton> }[] = [];
    let sig = '';
    return {
      title: 'Town',
      group: 'World',
      mount(root, ctx) {
        cv = el('canvas.viewer', { width: 320, height: 56, 'aria-label': 'The town' }) as HTMLCanvasElement;
        clockEl = el('p');
        schedRow = el('div.row');
        for (const sc of ['day', 'night', 'both'] as Sched[]) {
          const b = el('button.ghost', { type: 'button', 'data-s': sc }, sc === 'day' ? 'Work by day' : sc === 'night' ? 'Work by night' : 'Work day and night') as HTMLButtonElement;
          b.addEventListener('click', () => { S(ctx).sched = sc; });
          schedRow.append(b);
        }
        purge = actionButton({
          ctx, label: 'Purge the stores', cooldown: 30, desc: `Throw out ${Math.round(T.purgeShare * 100)}% of food and sugar, and all the poison with it.`,
          enabled: (c) => S(c).taint > 0,
          onBuy: (c) => { c.res.lump('food', -c.res.amt('food') * T.purgeShare); c.res.lump('sugar', -c.res.amt('sugar') * T.purgeShare); S(c).taint = 0; c.log('The stores are emptied and scrubbed. The poison is gone.', 'info'); },
        });
        ledger = el('div.ledger');
        siteBox = el('div.ledger');
        satBox = el('div.tiles');
        for (const [id, d] of Object.entries(T.satellites)) {
          const btn = tileButton({
            ctx, label: d.name, costs: () => d.cost, effect: d.desc,
            count: () => `${S(ctx).sats[id] ?? 0}/${d.max}`,
            enabled: (c) => (S(c).sats[id] ?? 0) < d.max,
            onBuy: (c) => { const s = S(c); s.sats[id] = (s.sats[id] ?? 0) + 1; c.log(`A ${d.name.toLowerCase()} is dug out. More room for the colony.`, 'info'); },
          });
          sats.push({ id, btn });
          satBox.append(btn.root);
        }
        ups = upgradeList(ctx, () => S(ctx).ups, UPS);
        root.append(
          el('p.flavor', {}, 'A forest of table legs. A sea of floor. Food everywhere, and giants who hate to share.'),
          el('p.muted', {}, 'Town foragers (Jobs tab) share their work over every open site. Work in daylight and the humans notice; work at night and they sleep, but the dark is slow going.'),
          cv, clockEl, el('div', {}, el('span.muted', {}, 'Human attention '), attBar.root), schedRow, ledger, el('div.row', {}, purge.root),
          el('h3', {}, 'Sites'), siteBox,
          el('h3', {}, 'Satellite nests'), satBox,
          el('h3', {}, 'Town craft'), ups.root,
        );
      },
      update(_root, ctx) {
        const s = S(ctx);
        draw(cv, ctx);
        const day = isDay(ctx);
        const left = (T.dayLength / 2 - (s.clock % (T.dayLength / 2))) / ctx.speed;
        clockEl.textContent = `${day ? 'Day' : 'Night'}: ${Math.ceil(left / 60)} min until ${day ? 'dusk' : 'dawn'}. Foragers are ${work(ctx) ? 'out' : 'resting'}.`;
        attBar.set(s.attention / 100);
        schedRow.hidden = !ctx.flags.has('tech:nightwork');
        schedRow.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.s === s.sched));
        purge.update(ctx);
        purge.root.hidden = s.taint <= 0;
        const r = rates(ctx);
        ledger.replaceChildren(...([
          ['Town foragers', `${job(ctx, 'townforager')} over ${openSites(ctx).length} open sites`],
          ['Bringing in', Object.entries(r).map(([k, v]) => `${fmt(v)} ${k}/s`).join(', ') || 'nothing right now'],
          ['Attention', `${Math.round(s.attention)}/100. Bait at ${T.thresholds.bait}, spray at ${T.thresholds.spray}, sealed kitchen at ${T.thresholds.seal}.`],
          ['Poison in the stores', s.taint > 0 ? `${fmt(s.taint)} (tasters: ${job(ctx, 'taster')})` : 'none'],
          ['Lost to the humans', String(s.lost)],
        ] as [string, string][]).map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        // sites: rebuild on change
        const now = JSON.stringify([s.cleared, Object.keys(s.sealed), [...ctx.flags].filter((f) => f.startsWith('tech:')).length]);
        if (now !== sig) {
          sig = now;
          siteBox.replaceChildren(...Object.keys(SITES).filter((id) => siteVisible(ctx, id)).map((id) => {
            const d = SITES[id];
            const status = s.sealed[id] ? 'sealed by the humans' : d.rival && !s.cleared.includes(id) ? 'held by pavement ants' : 'open';
            const right = el('span', {}, el('span.muted', {}, status + ' '));
            if (d.rival && !s.cleared.includes(id) && ctx.flags.has('tech:pavement')) {
              const need = T.rivalStrength[id as keyof typeof T.rivalStrength];
              const b = el('button.ghost', { type: 'button' }, `Clear them (needs strength ${need})`) as HTMLButtonElement;
              b.addEventListener('click', () => {
                if (soldierStrength(ctx) < need) { ctx.log(`Your soldiers (strength ${fmt(soldierStrength(ctx))}) are not enough. They need ${need}.`, 'info'); return; }
                const lost = Math.ceil(job(ctx, 'soldier') * 0.15);
                ctx.res.add('ant', -lost);
                s.cleared.push(id);
                ctx.log(`Your soldiers drive the pavement ants out of ${d.name.toLowerCase()}. ${lost} fell. It's ours.`, 'story');
                sig = '';
              });
              right.append(b);
            }
            return el('div', {}, el('span', {}, el('strong', {}, d.name), ' ', el('span.muted', {}, d.desc)), right);
          }));
        }
        for (const st of sats) st.btn.update(ctx);
        satBox.hidden = !ctx.flags.has('tech:papercraft');
        satBox.previousElementSibling!.toggleAttribute('hidden', !ctx.flags.has('tech:papercraft'));
        ups.update(ctx);
      },
    };
  })(),
};

// ---- the kitchen at ant height: flat pixels ----
function draw(cv: HTMLCanvasElement, ctx: Context) {
  const c = setup(cv);
  const W = cv.width, H = cv.height, s = S(ctx);
  const day = isDay(ctx);
  rect(c, 0, 0, W, H, day ? '#3a3a40' : '#121218');
  rect(c, 0, H - 10, W, 10, PAL.paved);
  for (let i = 0; i < W; i += 16) rect(c, i, H - 10, 1, 10, '#5d5b57');           // floor tiles
  rect(c, 40, 8, 6, H - 18, PAL.dirt); rect(c, 110, 8, 6, H - 18, PAL.dirt);      // table legs
  rect(c, 30, 4, 100, 4, PAL.dirt);                                              // table top
  rect(c, 230, 10, 70, H - 20, '#4a4238');                                       // cupboard
  if (!day) rect(c, 300, 6, 6, 6, PAL.bone);                                      // the moon in the window
  // crumbs
  for (let i = 0; i < 8; i++) rect(c, 60 + i * 13, H - 12, 2, 2, PAL.seed);
  // foragers
  const n = Math.min(30, job(ctx, 'townforager'));
  const t = performance.now() / 600;
  if (work(ctx) > 0) for (let i = 0; i < n; i++) rect(c, (((i * 23 + t * 8 * (i % 2 ? 1 : -1)) % W) + W) % W, H - 13 - (i % 3), 3, 1, PAL.you);
  if (baitOut(ctx)) rect(c, 180, H - 16, 10, 6, '#c4532f');                       // bait station
  if (s.sealed.kitchen) rect(c, 0, H - 11, W, 1, PAL.bone);                       // sealed gaps
}
