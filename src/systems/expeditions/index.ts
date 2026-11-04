// Expeditions: send parties to the surface, watch them travel, bring back surface materials.
// Emits "expedition:return" { dest, tile } so the map (if present) can reveal the area.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, progressBar, type ActionButton } from '../../core/ui';
import { fmt } from '../../core/resources';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { PAL, rect, setup } from '../../core/pixel';
import { EXPEDITIONS as X, NEST } from '../../data/balance';

interface Party { dest: string; ants: number; elapsed: number; duration: number; told: number; event?: string }
interface ExpState {
  runs: number;
  party: number;
  dest: string;
  parties: Party[];
  ups: Record<string, number>;
  marked: boolean;
  auto: boolean;
  rare: number;
  /** legacy single-party saves */
  active?: Party | null;
}
const S = (ctx: Context) => ctx.state.expeditions as ExpState;
const U = X.upgrades;
const lvl = (ctx: Context, id: keyof typeof U) => S(ctx).ups[id] ?? 0;
// Trail upgrades unfold one by one as parties come home ("runs:N" = after N expeditions).
const UPGRADES = fromBalance(U, (ctx, needs) =>
  !needs || (needs.startsWith('runs:') ? S(ctx).runs >= Number(needs.slice(5)) : ctx.flags.has(needs)));
/** Loot multiplier from party size: each worker past the minimum adds lootPerAnt. */
const partyMult = (n: number) => 1 + (n - X.minParty) * X.lootPerAnt;

const EVENTS = [
  'The party skirts a beetle the size of a house.',
  'A dewdrop blocks the path. They go around.',
  'One scout finds a crumb and refuses to share.',
  'Shadows pass overhead. The party freezes, then moves on.',
  'They cross a scent trail that is not theirs.',
  'A blade of grass bends under the whole party.',
  'The wind changes. They follow their own trail home.',
  'A worm surfaces beside them, then sinks again.',
  'They wait out a footstep that shakes the ground.',
  'Two workers argue over the way and both are right.',
];

const away = (ctx: Context) => S(ctx).parties.reduce((a, p) => a + p.ants, 0);
const idle = (ctx: Context) => {
  const assigned = Object.values((ctx.state.jobs?.assigned ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
  const busy = Object.entries(ctx.busy).filter(([k]) => k !== 'expeditions').reduce((a, [, b]) => a + b, 0);
  return Math.floor(ctx.res.amt('ant')) - assigned - busy - away(ctx);
};
const maxParties = (ctx: Context) => 1 + U.columns.per * lvl(ctx, 'columns');
const durationOf = (ctx: Context, time: number, marked = false) =>
  time * Math.max(0.4, 1 + U.feet.per * lvl(ctx, 'feet')) * (marked ? 1 - X.markTrailCut : 1);
const available = (ctx: Context) => X.destinations.filter((d) => S(ctx).runs >= d.unlockRuns);
const canSend = (ctx: Context) => S(ctx).parties.length < maxParties(ctx) && idle(ctx) >= S(ctx).party;

function send(ctx: Context) {
  const st = S(ctx);
  const d = X.destinations.find((x) => x.id === st.dest) ?? X.destinations[0];
  st.parties.push({ dest: d.id, ants: st.party, elapsed: 0, duration: durationOf(ctx, d.time, st.marked), told: 0 });
  if (st.marked) ctx.log('Fresh pheromone marks the way. The party moves quickly.', 'info');
  st.marked = false;
  ctx.busy.expeditions = away(ctx);
}

function finish(ctx: Context, p: Party) {
  const s = S(ctx);
  const d = X.destinations.find((x) => x.id === p.dest)!;
  const mult = partyMult(p.ants) * (1 + U.mandibles.per * lvl(ctx, 'mandibles') + ctx.mods.get('expLoot'));
  const got: string[] = [];
  for (const [rid, [lo, hi]] of Object.entries(d.loot)) {
    const n = Math.round((lo + Math.random() * (hi - lo)) * mult);
    if (n > 0) { ctx.res.lump(rid, n); got.push(`${n} ${ctx.res.get(rid).name.toLowerCase()}`); }
  }
  ctx.res.lump('trailmark', X.trailMarksPerRun);
  got.push(`${X.trailMarksPerRun} trail mark`);
  if (Math.random() < X.rareChance * (1 + U.eyes.per * lvl(ctx, 'eyes'))) {
    ctx.res.add('amber', 1); s.rare += 1;
    ctx.log('Among the haul: a bead of amber with something tiny trapped inside.');
  }
  let lost = 0;
  if (Math.random() < X.lossChance * Math.max(0.1, 1 + U.instinct.per * lvl(ctx, 'instinct'))) { lost = 1; ctx.res.add('ant', -1); }
  s.runs += 1;
  ctx.log(`The party returns from ${d.name.toLowerCase()} with ${got.join(', ')}.` + (lost ? ' One worker did not come back.' : ''));
  ctx.bus.emit('expedition:return', { dest: d.id, tile: d.tile });
  const next = X.destinations.find((x) => x.unlockRuns === s.runs);
  if (next) ctx.log(`Scouts mention a new place: ${next.name.toLowerCase()}.`, 'info');
  if (s.runs === X.rivalAfterRuns && !ctx.flags.has('rival')) {
    ctx.flags.add('rival');
    ctx.log('A returning scout is shaking. To the east, a foreign colony. Many of them. (Mandible drill can now be researched)', 'warn');
  }
}

export const expeditions: GameSystem = {
  id: 'expeditions',

  init(ctx) {
    ctx.res.define({ id: 'twig', name: 'Twigs', cap: NEST.baseMaterialCap.twig, order: 20, integer: true, group: 'Surface' });
    ctx.res.define({ id: 'seed', name: 'Seeds', cap: NEST.baseMaterialCap.seed, order: 21, integer: true, group: 'Surface' });
    ctx.res.define({ id: 'resin', name: 'Resin', cap: NEST.baseMaterialCap.resin, order: 22, integer: true, group: 'Surface' });
    ctx.res.define({ id: 'amber', name: 'Amber', order: 23, integer: true, group: 'Surface' });
    ctx.res.define({ id: 'trailmark', name: 'Trail marks', order: 30, integer: true, group: 'Surface' });
    ctx.state.expeditions = { runs: 0, party: X.minParty, dest: 'grass', parties: [], ups: {}, marked: false, auto: true, rare: 0 } satisfies ExpState;
    ctx.bus.on('loaded', () => {
      const s = S(ctx);
      if (s.active) { s.parties = [s.active]; s.active = null; }
      s.parties ??= [];
      ctx.busy.expeditions = away(ctx);
    });
  },

  isUnlocked: (ctx) => ctx.flags.has('surface'),

  tick(ctx, dt) {
    const s = S(ctx);
    for (const p of [...s.parties]) {
      p.elapsed += dt;
      const quarter = Math.floor((p.elapsed / p.duration) * 4);
      if (quarter > p.told && quarter < 4) { p.told = quarter; p.event = EVENTS[Math.floor(Math.random() * EVENTS.length)]; }
      if (p.elapsed >= p.duration) {
        s.parties.splice(s.parties.indexOf(p), 1);
        finish(ctx, p);
        if (lvl(ctx, 'memory') && s.auto && canSend(ctx)) send(ctx);
      }
    }
    ctx.busy.expeditions = away(ctx);
  },

  panel: (() => {
    let sendBtn: ActionButton, markBtn: ActionButton, partyEl: HTMLElement, destSel: HTMLSelectElement, statusEl: HTMLElement;
    let viewer: HTMLCanvasElement, captions: HTMLElement, autoBox: HTMLInputElement, autoWrap: HTMLElement, ledger: HTMLElement;
    let lootEl: HTMLElement, partyHint: HTMLElement, upsHead: HTMLElement;
    let ups: ReturnType<typeof upgradeList>;
    const bars: ReturnType<typeof progressBar>[] = [];
    return {
      title: 'Surface',
      group: 'World',
      mount(root, ctx) {
        const s = S(ctx);
        partyEl = el('span.count');
        destSel = el('select', { id: 'exp-dest' }) as HTMLSelectElement;
        destSel.addEventListener('change', () => { s.dest = destSel.value; });
        const party = (d: number) => el('button.small', { type: 'button', onclick: (e: MouseEvent) => {
          const step = e.shiftKey ? d * 5 : d;
          s.party = Math.max(X.minParty, Math.min(s.party + step, Math.max(X.minParty, idle(ctx))));
        } }, d > 0 ? '+' : '−');
        sendBtn = actionButton({
          ctx, label: 'Send expedition',
          desc: 'Idle workers leave the nest and come back with whatever they find.',
          enabled: canSend, onBuy: (c) => send(c),
        });
        markBtn = actionButton({
          ctx, label: 'Mark the trail', costs: () => X.markTrailCost,
          desc: `Lay pheromone along the way. The next expedition is ${Math.round(X.markTrailCut * 100)}% shorter.`,
          enabled: (c) => !S(c).marked, onBuy: (c) => { S(c).marked = true; },
        });
        statusEl = el('p.muted');
        captions = el('div.captions');
        viewer = el('canvas.viewer', { width: 320, height: 40, 'aria-label': 'Your expeditions on the trail' }) as HTMLCanvasElement;
        autoBox = el('input', { type: 'checkbox', id: 'exp-auto' }) as HTMLInputElement;
        autoBox.addEventListener('change', () => { s.auto = autoBox.checked; });
        autoWrap = el('label.row', { for: 'exp-auto' }, autoBox, 'Send parties again when they return');
        ledger = el('div.ledger');
        ups = upgradeList(ctx, () => S(ctx).ups, UPGRADES);
        lootEl = el('p.muted');
        partyHint = el('p.muted');
        upsHead = el('h3', {}, 'Trail upgrades');
        root.append(
          el('p.flavor', {}, 'Above the nest the world is enormous. Send parties out and see what they bring home.'),
          el('div.row', {}, el('label', { for: 'exp-dest' }, 'Destination'), destSel),
          lootEl,
          el('div.row', {}, el('span', {}, 'Party size'), party(-1), partyEl, party(1), sendBtn.root, markBtn.root),
          partyHint,
          autoWrap,
          el('div.viewerwrap', {}, viewer, captions),
          statusEl,
          ledger,
          upsHead,
          ups.root,
        );
      },
      update(_root, ctx) {
        const s = S(ctx);
        const opts = available(ctx);
        const label = (d: (typeof X.destinations)[number]) => `${d.name} (${fmtTime(durationOf(ctx, d.time))})`;
        if (destSel.options.length !== opts.length || destSel.options[0]?.text !== label(opts[0])) {
          destSel.replaceChildren(...opts.map((d) => el('option', { value: d.id }, label(d))));
          destSel.value = s.dest;
        }
        partyEl.textContent = String(s.party);
        const dest = X.destinations.find((x) => x.id === s.dest) ?? X.destinations[0];
        const m = partyMult(s.party) * (1 + U.mandibles.per * lvl(ctx, 'mandibles') + ctx.mods.get('expLoot'));
        lootEl.textContent = 'Every trip here brings back about ' + Object.entries(dest.loot)
          .map(([rid, [lo, hi]]) => `${Math.round(lo * m)} to ${Math.round(hi * m)} ${ctx.res.get(rid).name.toLowerCase()}`).join(', ') +
          ', and a trail mark. Trips can be repeated as often as you like.';
        partyHint.textContent = `Each worker past ${X.minParty} carries ${Math.round(X.lootPerAnt * 100)}% more loot home ` +
          `(this party: +${Math.round((partyMult(s.party) - 1) * 100)}%). They are away from their jobs until the party returns. Shift-click moves 5.`;
        sendBtn.update(ctx); markBtn.update(ctx);
        autoWrap.hidden = !lvl(ctx, 'memory');
        autoBox.checked = s.auto;

        // one caption + bar per party
        while (bars.length < s.parties.length) bars.push(progressBar());
        captions.replaceChildren(...(s.parties.length ? s.parties.map((p, i) => {
          const d = X.destinations.find((x) => x.id === p.dest)!;
          bars[i].set(p.elapsed / p.duration);
          return el('div.caption', {},
            el('span', {}, `${p.ants} workers to ${d.name.toLowerCase()}, ${p.elapsed / p.duration < 0.5 ? 'outbound' : 'returning'}. ${fmtTime((p.duration - p.elapsed) / ctx.speed)} left.`),
            bars[i].root,
            p.event ? el('span.muted', {}, p.event) : null);
        }) : [el('div.caption', {}, el('span.muted', {}, 'The trail is quiet.'))]));

        statusEl.textContent = !canSend(ctx) && s.parties.length < maxParties(ctx)
          ? `Need ${s.party} idle workers. Take some off their jobs.`
          : s.parties.length >= maxParties(ctx) ? 'Every column is out on the trail.' : '';
        ledger.replaceChildren(...[
          ['Expeditions so far', String(s.runs)],
          ['Columns', `${s.parties.length} of ${maxParties(ctx)} out`],
          ['Loot bonus', `+${fmt(((1 + U.mandibles.per * lvl(ctx, 'mandibles') + ctx.mods.get('expLoot')) * partyMult(s.party) - 1) * 100)}%`],
          ['Next new place', (() => { const n = X.destinations.find((d) => d.unlockRuns > s.runs); return n ? `after ${n.unlockRuns} expeditions` : 'all found'; })()],
          ['Rare finds', String(s.rare)],
        ].map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        upsHead.hidden = !ups.update(ctx);
        drawTrail(viewer, s.parties);
      },
    };
  })(),
};

function fmtTime(sec: number) {
  sec = Math.max(0, Math.ceil(sec));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), r = sec % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

// ---- the watchable trail: one flat lane per party ----
function drawTrail(cv: HTMLCanvasElement, parties: Party[]) {
  const LANE = 40;
  const H = LANE * Math.max(1, parties.length);
  if (cv.height !== H) cv.height = H;
  const c = setup(cv);
  const W = cv.width;
  const t = performance.now() / 1000;
  rect(c, 0, 0, W, H, PAL.bg);
  const lanes = parties.length ? parties : [null];
  lanes.forEach((p, li) => {
    const y0 = li * LANE;
    const prog = p ? Math.min(1, p.elapsed / p.duration) : 0;
    // the ground slides past the ants: away from home on the way out, back toward home on the way back
    // (distance from home, so it turns smoothly at the halfway point and keeps moving on long trips)
    const fromHome = p ? Math.min(p.elapsed, p.duration - p.elapsed) : 0;
    const scroll = Math.floor(fromHome * 4 + (fromHome / (p?.duration || 1)) * 1200);
    rect(c, 0, y0 + LANE - 8, W, 8, PAL.grass);
    for (let i = 0; i < 40; i++) {
      const x = ((i * 53 + li * 17 - scroll) % (W + 40) + W + 40) % (W + 40) - 20;
      const h = 6 + ((i * 17) % 18);
      rect(c, x, y0 + LANE - 8 - h, 2, h, PAL.grass);
      if (i % 7 === 0) rect(c, x + 6, y0 + LANE - 12, 6, 4, PAL.stone);
    }
    if (!p) return;
    const out = prog < 0.5;
    const base = out ? 40 + prog * 2 * 200 : 240 - (prog - 0.5) * 2 * 200;
    for (let i = 0; i < Math.min(p.ants, 12); i++) {
      const x = base - (out ? 1 : -1) * i * 7;
      const bob = Math.floor(t * 8 + i) % 2;
      rect(c, x, y0 + LANE - 11 - bob, 4, 2, PAL.bone);
      rect(c, x + (out ? 4 : -1), y0 + LANE - 12 - bob, 1, 1, PAL.bone);
    }
  });
}
