// Expeditions: send parties to the surface, watch them travel, bring back surface materials.
// Emits "expedition:return" { dest, tile } so the map (if present) can reveal the area.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, progressBar, type ActionButton } from '../../core/ui';
import { fmt } from '../../core/resources';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { PAL, blob, rect, setup } from '../../core/pixel';
import { EXPEDITIONS as X, NEST } from '../../data/balance';

/** What happens to a party on the trail, rolled when it leaves and played out partway (at = share of the trip). */
interface Fate { at: number; lost: number; wipe: boolean; done?: boolean }
interface Party { dest: string; ants: number; elapsed: number; duration: number; told: number; event?: string; sent?: number; fate?: Fate }
interface ExpState {
  runs: number;
  /** Trail marks ever earned this colony. Unlocks new places and trail upgrades. */
  earned?: number;
  party: number;
  dest: string;
  parties: Party[];
  ups: Record<string, number>;
  /** The place whose trail is marked (true in older saves: any place). */
  marked: boolean | string;
  auto: boolean;
  /** Keep workers back for expeditions between trips, so jobs don't take them. */
  reserve?: boolean;
  /** Mark the trail automatically before each trip, when there is pheromone for it. */
  autoMark?: boolean;
  /** Workers who never came back, this colony. */
  perished?: number;
  /** Where the last party came back from: the quiet trail shows that place. */
  lastDest?: string;
  reserved?: number;
  /** Reserve places still empty after losses on the trail: new idle workers fill them before anything else. */
  short?: number;
  rare: number;
  /** legacy single-party saves */
  active?: Party | null;
}
const S = (ctx: Context) => ctx.state.expeditions as ExpState;
const U = X.upgrades;
const lvl = (ctx: Context, id: keyof typeof U) => S(ctx).ups[id] ?? 0;
/** Marks earned so far. Only parties that come home earn them; a lost party adds nothing. */
const earned = (ctx: Context) => S(ctx).earned ?? 0;
/** Marks a trip pays: one per secondsPerMark of the place's base time, so Sure feet and marked trails don't cut it. */
const marksFor = (time: number) => Math.max(1, Math.round(time / X.secondsPerMark));
// Trail upgrades unfold one by one as marks come in ("marks:N" = after N marks earned).
const UPGRADES = fromBalance(U, (ctx, needs) =>
  !needs || (needs.startsWith('marks:') ? earned(ctx) >= Number(needs.slice(6)) : ctx.flags.has(needs)));
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

const onTrail = (ctx: Context) => S(ctx).parties.reduce((a, p) => a + p.ants, 0);
/** Workers away on trails plus any kept in reserve between trips. */
const away = (ctx: Context) => onTrail(ctx) + (S(ctx).reserve ? S(ctx).reserved ?? 0 : 0);
const ready = (ctx: Context) => idle(ctx) + (S(ctx).reserve ? S(ctx).reserved ?? 0 : 0);
const idle = (ctx: Context) => {
  const assigned = Object.values((ctx.state.jobs?.assigned ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
  const busy = Object.entries(ctx.busy).filter(([k]) => k !== 'expeditions' && !k.startsWith('job:')).reduce((a, [, b]) => a + b, 0);
  return Math.floor(ctx.res.amt('ant')) - assigned - busy - away(ctx);
};
const maxParties = (ctx: Context) => 1 + U.columns.per * lvl(ctx, 'columns');
const durationOf = (ctx: Context, time: number, marked = false) =>
  time * Math.max(0.4, 1 + U.feet.per * lvl(ctx, 'feet')) * (marked ? 1 - X.markTrailCut : 1);
/** Marking costs more for longer trails, but grows slower than the time it saves, so it always pays off. */
const markCost = (ctx: Context) => {
  const d = X.destinations.find((x) => x.id === S(ctx).dest) ?? X.destinations[0];
  return Object.fromEntries(Object.entries(X.markTrailCost).map(([r, n]) => [r, Math.ceil(n * Math.sqrt(d.time / X.destinations[0].time))]));
};
const available = (ctx: Context) => X.destinations.filter((d) => earned(ctx) >= d.unlockMarks);
const canSend = (ctx: Context) => ctx.mods.get('winter') <= 0 && S(ctx).parties.length < maxParties(ctx) && ready(ctx) >= S(ctx).party;

const safetyOf = (ctx: Context) => Math.max(0.1, 1 + U.instinct.per * lvl(ctx, 'instinct'));
type Dest = (typeof X.destinations)[number];
const lossOf = (ctx: Context, d: Dest) => d.loss * safetyOf(ctx) * (1 - ctx.mods.get('nurseHeal')) * Math.max(0.1, 1 + ctx.mods.get('expSafety'));
/** Most a bad trip can cost: up to this share of the party (always at least one). */
const maxLost = (party: number) => Math.max(1, Math.round(party * X.lossShare));
const riskText = (r: number, party: number) => {
  const n = maxLost(party);
  return `${fmt(Math.min(1, r) * 100)}% to lose ${n > 1 ? `1 to ${n} workers` : 'a worker'}`;
};
const wipeOf = (ctx: Context, d: Dest) => d.wipe * safetyOf(ctx) * Math.max(0.1, 1 + U.scouts.per * lvl(ctx, 'scouts'));

/** Why a trip came home short. {n} is "one worker" or "3 workers". */
const LOSSES = [
  'A jumping spider struck from above and took {n}.',
  'A gust of wind scattered the column. They found all but {n}.',
  'A beetle crushed {n} under a leaf.',
  'Raiders from another nest cut off {n}.',
  'A drop of dew trapped {n}.',
  'An antlion pit swallowed {n}.',
  'A bird pecked at the trail and took {n}.',
];
const WIPEOUTS = [
  'A bird found the column.',
  'Rain flooded the trail.',
  'A spider was waiting.',
  'Scouts found only their scent, then nothing.',
  'Another colony took them.',
  'A footstep came down on the trail.',
];

function send(ctx: Context) {
  const st = S(ctx);
  const d = X.destinations.find((x) => x.id === st.dest) ?? X.destinations[0];
  if (st.autoMark && st.marked !== true && st.marked !== d.id && ctx.res.spend(markCost(ctx))) st.marked = d.id;
  const marked = st.marked === true || st.marked === d.id;
  if (st.reserve) st.reserved = Math.max(0, (st.reserved ?? 0) - st.party); // reserve goes first, idle workers top it up
  // The trip's luck is decided as it sets out; the loss itself happens somewhere along the trail.
  const wipe = Math.random() < wipeOf(ctx, d);
  const lost = !wipe && Math.random() < lossOf(ctx, d) ? Math.min(st.party, 1 + Math.floor(Math.random() * maxLost(st.party))) : 0;
  const fate: Fate = { at: 0.25 + Math.random() * 0.5, lost, wipe };
  st.parties.push({ dest: d.id, ants: st.party, sent: st.party, elapsed: 0, duration: durationOf(ctx, d.time, marked), told: 0, fate });
  ctx.bus.emit('expedition:send', { dest: d.id, marked, ants: st.party });
  if (marked) { if (!st.autoMark) ctx.log('Fresh pheromone marks the way. The party moves quickly.', 'info'); st.marked = false; }
  ctx.busy.expeditions = away(ctx);
}

/** Play out a party's fate partway along the trail: workers vanish from the column, or the whole column does. */
function befall(ctx: Context, p: Party) {
  const s = S(ctx), f = p.fate!;
  f.done = true;
  const d = X.destinations.find((x) => x.id === p.dest)!;
  const place = d.name.toLowerCase();
  const n = f.wipe ? p.ants : Math.min(f.lost, p.ants);
  if (!n) return;
  ctx.res.add('ant', -n);
  s.perished = (s.perished ?? 0) + n;
  p.ants -= n;
  // with Reserve workers on, idle workers step in for the ones lost so the next party is still full
  if (s.reserve) {
    const k = Math.max(0, Math.min(n, idle(ctx)));
    s.reserved = (s.reserved ?? 0) + k;
    s.short = Math.min(s.party, (s.short ?? 0) + n - k);
  }
  if (f.wipe) {
    const why = WIPEOUTS[Math.floor(Math.random() * WIPEOUTS.length)];
    ctx.log(`The party to ${place} is gone. ${why} ${n} workers lost.`, 'warn');
    ctx.bus.emit('expedition:wipe', { dest: d.id, ants: n });
  } else {
    const who = n === 1 ? 'one worker' : `${n} workers`;
    const why = LOSSES[Math.floor(Math.random() * LOSSES.length)].replace('{n}', who);
    ctx.log(`${why} The rest of the party to ${place} presses on.`, 'warn');
  }
  ctx.busy.expeditions = away(ctx);
}

function finish(ctx: Context, p: Party) {
  const s = S(ctx);
  const d = X.destinations.find((x) => x.id === p.dest)!;
  s.lastDest = p.dest;
  // a party lost on the trail still holds its column until its time is up
  ctx.ping('expeditions');
  if (p.ants <= 0) { s.runs += 1; return; } // a wiped party earns no marks
  const mult = partyMult(p.ants) * (1 + U.mandibles.per * lvl(ctx, 'mandibles') + ctx.mods.get('expLoot'));
  const got: string[] = [];
  for (const [rid, [lo, hi]] of Object.entries(d.loot)) {
    const n = Math.round((lo + Math.random() * (hi - lo)) * mult);
    if (n > 0) { ctx.res.lump(rid, n); got.push(`${n} ${ctx.res.get(rid).name.toLowerCase()}`); }
  }
  const marks = marksFor(d.time);
  const before = earned(ctx);
  s.earned = before + marks;
  ctx.res.lump('trailmark', marks);
  got.push(`${marks} trail mark${marks === 1 ? '' : 's'}`);
  if (Math.random() < X.rareChance * (1 + U.eyes.per * lvl(ctx, 'eyes'))) {
    ctx.res.add('amber', 1); s.rare += 1;
    ctx.log('Among the haul: a bead of amber with something tiny trapped inside.');
  }
  s.runs += 1;
  ctx.log(`The party returns from ${d.name.toLowerCase()} with ${got.join(', ')}.`);
  const sent = p.sent ?? p.ants;
  ctx.bus.emit('expedition:return', { dest: d.id, tile: d.tile, ants: sent, lost: sent - p.ants });
  const next = X.destinations.find((x) => x.unlockMarks > before && x.unlockMarks <= s.earned!);
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
    ctx.res.define({ id: 'amber', name: 'Amber', order: 24, integer: true, stepped: true, group: 'Surface' });
    ctx.res.define({ id: 'trailmark', name: 'Trail marks', order: 25, integer: true, stepped: true, group: 'Surface' });
    ctx.state.expeditions = { runs: 0, party: X.minParty, dest: 'grass', parties: [], ups: {}, marked: false, auto: true, rare: 0, earned: 0 } satisfies ExpState;
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
      if (p.fate && !p.fate.done && p.elapsed >= p.fate.at * p.duration) befall(ctx, p);
      if (p.elapsed >= p.duration) {
        s.parties.splice(s.parties.indexOf(p), 1);
        const before = Math.floor(ctx.res.amt('ant'));
        finish(ctx, p);
        if (s.reserve) s.reserved = (s.reserved ?? 0) + Math.max(0, p.ants - (before - Math.floor(ctx.res.amt('ant'))));
        if (lvl(ctx, 'memory') && s.auto && canSend(ctx)) send(ctx);
      }
    }
    if (s.reserve && s.short) {
      // places lost on the trail are filled by the next idle workers, before the default job takes them
      const k = Math.max(0, Math.min(s.short, idle(ctx)));
      s.reserved = (s.reserved ?? 0) + k;
      s.short -= k;
    }
    if (s.reserve) {
      // starvation or raids can leave fewer workers than are held back
      const others = Object.entries(ctx.busy).filter(([k]) => k !== 'expeditions' && !k.startsWith('job:')).reduce((a, [, b]) => a + b, 0);
      const assigned = Object.values((ctx.state.jobs?.assigned ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
      s.reserved = Math.max(0, Math.min(s.reserved ?? 0, Math.floor(ctx.res.amt('ant')) - onTrail(ctx) - others - assigned));
    } else { s.reserved = 0; s.short = 0; }
    ctx.busy.expeditions = away(ctx);
  },

  panel: (() => {
    let sendBtn: ActionButton, markBtn: ActionButton, partyEl: HTMLElement, destSel: HTMLSelectElement, statusEl: HTMLElement;
    let viewer: HTMLCanvasElement, captions: HTMLElement, autoBox: HTMLInputElement, autoWrap: HTMLElement, ledger: HTMLElement;
    let markBox: HTMLInputElement, markWrap: HTMLElement;
    let reserveBox: HTMLInputElement, reserveWrap: HTMLElement, reserveCount: HTMLElement;
    let lootEl: HTMLElement, partyHint: HTMLElement, idleEl: HTMLElement, upsHead: HTMLElement;
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
          s.party = Math.max(X.minParty, Math.min(s.party + step, Math.max(X.minParty, ready(ctx))));
        } }, d > 0 ? '+' : '−');
        sendBtn = actionButton({
          ctx, label: 'Send expedition',
          desc: () => 'Idle workers leave the nest and come back with whatever they find. Not all of them come back.\n' +
            (() => { const d = X.destinations.find((x) => x.id === S(ctx).dest) ?? X.destinations[0];
              return `Risk each trip to ${d.name.toLowerCase()}: ${riskText(lossOf(ctx, d), S(ctx).party)}, ${fmt(wipeOf(ctx, d) * 100)}% to lose the whole party. Farther places are more dangerous.`; })(),
          enabled: canSend, onBuy: (c) => send(c),
        });
        markBtn = actionButton({
          ctx, label: () => (S(ctx).marked ? 'Trail marked' : 'Mark the trail'), costs: () => markCost(ctx),
          desc: () => {
            const d = X.destinations.find((x) => x.id === S(ctx).dest) ?? X.destinations[0];
            return `Lay pheromone along the way. The next expedition to ${d.name.toLowerCase()} is ${Math.round(X.markTrailCut * 100)}% shorter. ` +
              'Longer trails take more pheromone to mark.';
          },
          enabled: (c) => !S(c).marked && !S(c).autoMark && !S(c).parties.length, onBuy: (c) => { S(c).marked = S(c).dest; },
        });
        statusEl = el('p.muted');
        captions = el('div.captions');
        viewer = el('canvas.viewer', { width: 320, height: 40, 'aria-label': 'Your expeditions on the trail' }) as HTMLCanvasElement;
        autoBox = el('input', { type: 'checkbox', id: 'exp-auto' }) as HTMLInputElement;
        autoBox.addEventListener('change', () => { s.auto = autoBox.checked; });
        autoWrap = el('label.row', { for: 'exp-auto' }, autoBox, 'Send parties again when they return');
        markBox = el('input', { type: 'checkbox', id: 'exp-automark' }) as HTMLInputElement;
        markBox.addEventListener('change', () => { s.autoMark = markBox.checked; });
        markWrap = el('label', { for: 'exp-automark', title: 'Mark the trail before every trip, whenever you have the pheromone for it.' }, markBox, ' Mark every trip');
        reserveBox = el('input', { type: 'checkbox', id: 'exp-reserve' }) as HTMLInputElement;
        reserveBox.addEventListener('change', () => { s.reserve = reserveBox.checked; if (!s.reserve) { s.reserved = 0; s.short = 0; } });
        reserveWrap = el('label', { for: 'exp-reserve', title: "Workers who come back from a trip wait for the next one instead of going idle, so jobs can't take them. Workers lost on the trail are replaced by idle workers, and by new workers as they hatch, before the default job gets any." },
          reserveBox, ' reserve workers', reserveCount = el('span.muted'));
        ledger = el('div.ledger');
        ups = upgradeList(ctx, () => S(ctx).ups, UPGRADES, { research: true });
        lootEl = el('p.muted');
        partyHint = el('p.muted');
        idleEl = el('strong');
        upsHead = el('h3', {}, 'Trail upgrades');
        root.append(
          el('p.flavor', {}, 'Above the nest the world is enormous. Send parties out and see what they bring home.'),
          el('div.row', {}, el('label', { for: 'exp-dest' }, 'Destination'), destSel),
          lootEl,
          el('div.row', {}, el('span', {}, 'Party size'), party(-1), partyEl, party(1), el('span', { style: 'margin-left: 16px' }, 'Idle workers: ', idleEl), el('span', { style: 'margin-left: 16px' }, reserveWrap)),
          el('div.row', {}, sendBtn.root, markBtn.root, markWrap),
          partyHint,
          el('p.controls', {}, 'Shift-click moves 5.'),
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
        idleEl.textContent = String(Math.max(0, idle(ctx)));
        const dest = X.destinations.find((x) => x.id === s.dest) ?? X.destinations[0];
        const m = partyMult(s.party) * (1 + U.mandibles.per * lvl(ctx, 'mandibles') + ctx.mods.get('expLoot'));
        lootEl.textContent = 'Every trip here brings back about ' + Object.entries(dest.loot)
          .map(([rid, [lo, hi]]) => `${Math.round(lo * m)} to ${Math.round(hi * m)} ${ctx.res.get(rid).name.toLowerCase()}`).join(', ') +
          `, and ${marksFor(dest.time)} trail mark${marksFor(dest.time) === 1 ? '' : 's'}. Trips can be repeated as often as you like.`;
        partyHint.textContent = `Each worker past ${X.minParty} carries ${Math.round(X.lootPerAnt * 100)}% more loot home ` +
          `(this party: +${Math.round((partyMult(s.party) - 1) * 100)}%). They are away from their jobs until the party returns.` +
          (s.party < 30 && 'twig' in dest.loot ? ' Short on twigs? Big parties of 30 to 50 bring home far more.' : '');
        sendBtn.update(ctx); markBtn.update(ctx);
        autoWrap.hidden = !lvl(ctx, 'memory');
        autoBox.checked = s.auto;
        reserveBox.checked = !!s.reserve;
        markBox.checked = !!s.autoMark;
        reserveCount.textContent = s.reserve ? ` (${s.reserved ?? 0} waiting${s.short ? `, ${s.short} to fill` : ''})` : '';

        // one caption + bar per party
        while (bars.length < s.parties.length) bars.push(progressBar());
        captions.replaceChildren(...(s.parties.length ? s.parties.map((p, i) => {
          const d = X.destinations.find((x) => x.id === p.dest)!;
          bars[i].set(p.elapsed / p.duration);
          return el('div.caption', {},
            el('span', {}, p.ants <= 0
              ? `No word from the party to ${d.name.toLowerCase()}. The column clears in ${fmtTime((p.duration - p.elapsed) / ctx.speed)}.`
              : `${p.ants} workers to ${d.name.toLowerCase()}, ${p.elapsed / p.duration < 0.5 ? 'outbound' : 'returning'}. ${fmtTime((p.duration - p.elapsed) / ctx.speed)} left.`),
            bars[i].root,
            p.event ? el('span.muted', {}, p.event) : null);
        }) : [el('div.caption', {}, el('span.muted', {}, 'The trail is quiet.'))]));

        statusEl.textContent = ctx.mods.get('winter') > 0 ? 'Winter: the trails are frozen. Parties wait for spring.' : !canSend(ctx) && s.parties.length < maxParties(ctx)
          ? `Need ${s.party} idle workers. Take some off their jobs.`
          : s.parties.length >= maxParties(ctx) ? 'Every column is out on the trail.' : '';
        ledger.replaceChildren(...[
          ['Expeditions so far', String(s.runs)],
          ['Workers lost on the trail', String(s.perished ?? 0)],
          ['Columns', `${s.parties.length} of ${maxParties(ctx)} out`],
          ['Loot bonus', `+${fmt(((1 + U.mandibles.per * lvl(ctx, 'mandibles') + ctx.mods.get('expLoot')) * partyMult(s.party) - 1) * 100)}%`],
          ['Trail marks earned', String(earned(ctx))],
          ['Next destination', (() => { const n = X.destinations.find((d) => d.unlockMarks > earned(ctx)); return n ? `${earned(ctx)}/${n.unlockMarks} marks` : 'all found'; })()],
          ['Rare finds', String(s.rare)],
        ].map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        upsHead.hidden = !ups.update(ctx);
        drawTrail(viewer, s.parties, s.lastDest);
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

// ---- the watchable trail: one flat lane per party, with scenery for each place ----
type Scene = { sky: string; ground: string; draw: (c: CanvasRenderingContext2D, y0: number, W: number, near: (i: number, gap: number) => number, far: (i: number, gap: number) => number) => void };
const GROUND = 32; // y of the ground line inside a 40px lane
const SCENES: Record<string, Scene> = {
  grass: { sky: PAL.bg, ground: PAL.grass, draw(c, y0, W, near) {
    for (let i = 0; i < 40; i++) {
      const x = near(i, 53), h = 6 + ((i * 17) % 18);
      rect(c, x, y0 + GROUND - h, 2, h, PAL.grass);
      if (i % 7 === 0) rect(c, x + 6, y0 + GROUND - 4, 6, 4, PAL.stone);
    }
  } },
  leaf: { sky: '#16140f', ground: '#3a3a22', draw(c, y0, W, near, far) {
    for (let i = 0; i < 8; i++) blob(c, far(i, 70), y0 + 6, 22, 5, i % 2 ? '#5a4a22' : '#4a3d1c'); // the old leaf overhead
    for (let i = 0; i < 24; i++) {
      const x = near(i, 61);
      if (i % 3 === 0) blob(c, x, y0 + GROUND - 1, 7, 2, i % 2 ? '#7a5a2a' : '#6a4a22'); // fallen leaves
      else rect(c, x, y0 + GROUND - 8 - (i % 5) * 2, 2, 8 + (i % 5) * 2, '#3a3a22');
    }
  } },
  stump: { sky: '#17130f', ground: '#3a2a1c', draw(c, y0, W, near, far) {
    for (let i = 0; i < 6; i++) { const x = far(i, 90); rect(c, x, y0, 26, GROUND, '#2e2216'); rect(c, x + 4, y0, 2, GROUND, '#3a2c1c'); rect(c, x + 16, y0, 1, GROUND, '#3a2c1c'); }
    for (let i = 0; i < 18; i++) {
      const x = near(i, 67);
      if (i % 3 === 0) { rect(c, x + 2, y0 + GROUND - 6, 2, 6, '#c9b89a'); blob(c, x + 3, y0 + GROUND - 7, 5, 2, '#a0522d'); } // mushrooms
      else rect(c, x, y0 + GROUND - 3, 10, 3, '#4a3626'); // bark chips
    }
  } },
  stream: { sky: '#121516', ground: '#3a3a2a', draw(c, y0, W, near, far) {
    for (let i = 0; i < 30; i++) { const x = far(i, 41), h = 14 + ((i * 13) % 14); rect(c, x, y0 + GROUND - h, 1, h, '#4a5a2a'); rect(c, x - 1, y0 + GROUND - h, 3, 4, '#5a4a2a'); } // reeds
    rect(c, 0, y0 + GROUND + 3, W, 5, PAL.water);
    for (let i = 0; i < 20; i++) rect(c, near(i, 37), y0 + GROUND + 4 + (i % 2), 4, 1, '#4a6a7a'); // ripples
  } },
  patio: { sky: '#151514', ground: '#5d5b57', draw(c, y0, W, near, far) {
    for (let i = 0; i < 7; i++) { const x = far(i, 64); rect(c, x, y0 + 14, 40, GROUND - 14, '#3a3936'); rect(c, x, y0 + 14, 40, 2, '#4a4946'); } // the step of the next stone
    for (let i = 0; i < 16; i++) {
      const x = near(i, 46);
      rect(c, x, y0 + GROUND, 2, 8, '#3a3936'); // cracks between the stones
      if (i % 4 === 1) { rect(c, x + 1, y0 + GROUND - 5, 1, 5, PAL.grass); rect(c, x - 1, y0 + GROUND - 3, 2, 1, PAL.grass); } // weeds in the cracks
    }
  } },
  hedge: { sky: '#101410', ground: '#2e3a22', draw(c, y0, W, near, far) {
    for (let i = 0; i < 10; i++) { const x = far(i, 48); blob(c, x, y0 + 12, 20, 14, i % 2 ? '#2a3a20' : '#24331c'); }
    for (let i = 0; i < 20; i++) {
      const x = near(i, 59);
      if (i % 2) rect(c, x, y0 + GROUND - 2, 12, 1, '#5a4228'); // twigs
      else blob(c, x, y0 + GROUND - 3, 3, 2, '#3d4a2a');
    }
  } },
};

const TRAILMARK = '#a69be6'; // the trail mark colour used in text
const CARRY = [PAL.food, PAL.seed, '#b8966a']; // crumbs, seeds and twig bits carried home

function drawTrail(cv: HTMLCanvasElement, parties: Party[], lastDest?: string) {
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
    const wrapX = (x: number) => ((x % (W + 40)) + W + 40) % (W + 40) - 20;
    const near = (i: number, gap: number) => wrapX(i * gap + li * 17 - scroll);
    const far = (i: number, gap: number) => wrapX(i * gap + li * 11 - Math.floor(scroll / 2)); // background drifts slower
    const scene = SCENES[p?.dest ?? lastDest ?? 'grass'] ?? SCENES.grass;
    rect(c, 0, y0, W, LANE, scene.sky);
    rect(c, 0, y0 + GROUND, W, LANE - GROUND, scene.ground);
    scene.draw(c, y0, W, near, far);
    if (!p) return;
    const out = prog < 0.5;
    const base = out ? 40 + prog * 2 * 200 : 240 - (prog - 0.5) * 2 * 200;
    // a big party walks as a column several abreast; on the way home each ant carries a crumb of loot
    const shown = Math.min(p.ants, 48);
    const rows = shown > 24 ? 3 : shown > 10 ? 2 : 1;
    for (let i = 0; i < shown; i++) {
      const row = i % rows, col = Math.floor(i / rows);
      const x = base - (out ? 1 : -1) * (col * 7 + row * 3);
      const y = y0 + LANE - 11 - (rows - 1 - row) * 3;
      const bob = Math.floor(t * 8 + i) % 2;
      rect(c, x, y - bob, 4, 2, PAL.bone);
      rect(c, x + (out ? 4 : -1), y - 1 - bob, 1, 1, PAL.bone);
      if (i === 0) { // the lead ant holds the trail mark, both ways
        const mx = out ? x + 5 : x - 3;
        rect(c, mx, y - 2 - bob, 2, 3, TRAILMARK);
        rect(c, mx, y - 2 - bob, 1, 1, '#d4ccff');
      } else if (!out) rect(c, x - 2, y - 1 - bob, 2, 2, CARRY[i % CARRY.length]);
    }
  });
}
