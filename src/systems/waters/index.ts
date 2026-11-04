// Waters: build boats, crew them with workers, and send them on voyages.
// Voyages are Oregon Trail style: most meet one event on the way, and the boat waits (safely)
// until you choose what to do. Voyages pay loot and push back the map fog across water.
// Emits 'expedition:return' with a tile, which the map uses to reveal fog.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, progressBar, type ActionButton } from '../../core/ui';
import { fmtCosts } from '../../core/resources';
import { WATERS } from '../../data/balance';

interface Voyage { dest: string; elapsed: number; time: number; eventAt: number; event: number | null; met: boolean; bonus: Record<string, number>; lostCrew: number }
interface Boat { type: string; hull: number; name: string; voyage: Voyage | null }
interface WatersState { boats: Boat[]; dest: string; built: number; voyages: number }
const S = (ctx: Context) => ctx.state.waters as WatersState;
const BOATS = WATERS.boats;
const destOf = (id: string) => WATERS.voyages.find((v) => v.id === id)!;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const NAMES = ['Dewdrop', 'Old Leaf', 'Brave Stem', 'Petal', 'Long Reach', 'Driftwood', 'Little Queen', 'Mossback', 'Seedpod', 'Far Scent'];

const crewAway = (ctx: Context) => S(ctx).boats.filter((b) => b.voyage).reduce((t, b) => t + BOATS[b.type].crew, 0);
function idle(ctx: Context) {
  const assigned = Object.values((ctx.state.jobs?.assigned ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
  const busy = Object.entries(ctx.busy).filter(([k]) => k !== 'waters').reduce((a, [, b]) => a + b, 0);
  return Math.floor(ctx.res.amt('ant')) - assigned - busy - crewAway(ctx);
}

/** Events on the water. Each choice changes the voyage and returns what happened. */
const EVENTS: { text: string; choices: { label: string; act: (ctx: Context, b: Boat, v: Voyage) => string }[] }[] = [
  { text: 'A water strider skates in circles around the boat, closer each time.', choices: [
    { label: 'Fight it off', act: (_c, b, v) => { if (Math.random() < 0.5) { v.lostCrew++; b.hull = Math.max(0, b.hull - 1); return 'The strider is driven off, but one of the crew is dragged under.'; } v.bonus.food = (v.bonus.food ?? 0) + 20; return 'The crew kill it. Fresh meat for the colony.'; } },
    { label: 'Paddle away', act: (_c, _b, v) => { v.time += 30; return 'The crew paddle hard and lose it in the reeds. The trip takes longer.'; } },
  ] },
  { text: 'The current splits around a stone. One way is fast and rough, the other slow and calm.', choices: [
    { label: 'Take the fast channel', act: (_c, b, v) => { v.time *= 0.8; b.hull = Math.max(0, b.hull - 1); return 'The boat scrapes the stone but shoots ahead.'; } },
    { label: 'Take the slow channel', act: (_c, _b, v) => { v.time += 40; return 'A gentle drift. Nothing lost but time.'; } },
  ] },
  { text: 'A seed pod bobs past, fat and heavy.', choices: [
    { label: 'Haul it aboard', act: (_c, _b, v) => { v.bonus.seed = (v.bonus.seed ?? 0) + 3; v.time += 20; return 'Heavy work, but the pod is full of seeds.'; } },
    { label: 'Let it go', act: () => 'The pod drifts on.' },
  ] },
  { text: 'Rain starts to fall. Each drop is as big as the boat.', choices: [
    { label: 'Bail and wait it out', act: (_c, _b, v) => { v.time += 45; return 'The crew bail until the shower passes.'; } },
    { label: 'Push on through', act: (_c, b) => { b.hull = Math.max(0, b.hull - 2); return 'The boat takes a beating but keeps going.'; } },
  ] },
  { text: 'A glint of amber shows under the surface near the bank.', choices: [
    { label: 'Dive for it', act: (_c, _b, v) => { if (Math.random() < 0.3) { v.lostCrew++; return 'The diver never comes up.'; } v.bonus.amber = (v.bonus.amber ?? 0) + 1; return 'A diver comes up with a bead of amber.'; } },
    { label: 'Keep rowing', act: () => 'The glint fades behind them.' },
  ] },
];

function launch(ctx: Context, b: Boat) {
  const s = S(ctx);
  const d = destOf(s.dest);
  const time = d.time / BOATS[b.type].speed / (1 + ctx.mods.get('voyageSpeed'));
  b.voyage = { dest: d.id, elapsed: 0, time, eventAt: Math.random() < WATERS.eventChance ? rand(0.25, 0.75) * time : Infinity, event: null, met: false, bonus: {}, lostCrew: 0 };
  ctx.log(`The ${b.name} pushes off toward ${d.name.toLowerCase()}.`);
}

function arrive(ctx: Context, b: Boat) {
  const s = S(ctx), v = b.voyage!, d = destOf(v.dest);
  b.voyage = null;
  s.voyages++;
  const got: string[] = [];
  for (const [rid, [lo, hi]] of Object.entries(d.loot)) {
    const n = Math.round(rand(lo, hi)) + (v.bonus[rid] ?? 0);
    if (n > 0 && ctx.res.has(rid)) { ctx.res.add(rid, n); got.push(`${n} ${ctx.res.get(rid).name.toLowerCase()}`); }
  }
  for (const [rid, n] of Object.entries(v.bonus)) if (!(rid in d.loot) && ctx.res.has(rid)) { ctx.res.add(rid, n); got.push(`${n} ${ctx.res.get(rid).name.toLowerCase()}`); }
  if (v.lostCrew) ctx.res.add('ant', -v.lostCrew);
  ctx.bus.emit('expedition:return', { dest: 'voyage:' + d.id, tile: d.tile });
  ctx.log(`The ${b.name} is back from ${d.name.toLowerCase()} with ${got.join(', ') || 'nothing'}.` + (v.lostCrew ? ` ${v.lostCrew} of the crew did not come home.` : ''));
}

function sink(ctx: Context, b: Boat) {
  const s = S(ctx);
  ctx.res.add('ant', -Math.ceil(BOATS[b.type].crew / 2));
  s.boats.splice(s.boats.indexOf(b), 1);
  ctx.log(`The ${b.name} breaks apart and sinks. Some of the crew swim home; the rest are lost.`, 'warn');
}

export const waters: GameSystem = {
  id: 'waters',

  init(ctx) {
    ctx.state.waters = { boats: [], dest: 'puddle', built: 0, voyages: 0 } satisfies WatersState;
  },

  isUnlocked: (ctx) => ctx.flags.has('tech:rafts'),

  tick(ctx, dt) {
    const s = S(ctx);
    for (const b of [...s.boats]) {
      const v = b.voyage;
      if (!v) continue;
      if (v.event !== null) continue; // waiting for your choice: nothing happens meanwhile
      v.elapsed += dt;
      if (!v.met && v.elapsed >= v.eventAt) { v.met = true; v.event = Math.floor(Math.random() * EVENTS.length); ctx.log(`The ${b.name} needs orders. (Waters tab)`, 'warn'); continue; }
      if (v.elapsed >= v.time) {
        arrive(ctx, b);
        // the archive's accord: boats set out again by themselves
        const d = destOf(s.dest);
        if (ctx.flags.has('accord:relaunch') && s.boats.includes(b) && idle(ctx) >= BOATS[b.type].crew && (!d.boat || b.type === d.boat)) launch(ctx, b);
      }
    }
    ctx.busy.waters = crewAway(ctx);
    const waiting = s.boats.filter((b) => b.voyage?.event != null).length;
    ctx.alert('waters', waiting ? `${waiting === 1 ? 'A boat is' : `${waiting} boats are`} stopped on the water, waiting for your orders. Nothing bad happens while they wait.` : null);
  },

  panel: (() => {
    let destSel: HTMLSelectElement, fleet: HTMLElement, buildRow: HTMLElement, note: HTMLElement;
    const builders: { type: string; btn: ActionButton }[] = [];
    let sig = '';
    return {
      title: 'Waters',
      mount(root, ctx) {
        const s = S(ctx);
        destSel = el('select', { id: 'voyage-dest' }) as HTMLSelectElement;
        destSel.addEventListener('change', () => { s.dest = destSel.value; sig = ''; });
        buildRow = el('div.row');
        for (const type of Object.keys(BOATS)) {
          const def = BOATS[type];
          const btn = actionButton({
            ctx, label: `Build a ${def.name.toLowerCase()}`, costs: () => def.cost,
            desc: `Crew ${def.crew}, hull ${def.hull}, speed x${def.speed}.`,
            enabled: (c) => S(c).boats.length < WATERS.maxBoats && (!def.needs || c.flags.has(def.needs)),
            onBuy: (c) => {
              const st = S(c);
              const name = NAMES[st.built % NAMES.length] + (st.built >= NAMES.length ? ` ${Math.floor(st.built / NAMES.length) + 1}` : '');
              st.boats.push({ type, hull: def.hull, name, voyage: null });
              st.built++;
              c.log(`The ${name} is ready: a ${def.name.toLowerCase()} for ${def.crew} crew.`);
              sig = '';
            },
          });
          builders.push({ type, btn });
          buildRow.append(btn.root);
        }
        fleet = el('div.fleet');
        note = el('p.muted');
        root.append(
          el('p.flavor', {}, 'To an ant, a puddle is a sea. Leaves float. So do ants, if they are brave.'),
          buildRow,
          el('div.row', {}, el('label', { for: 'voyage-dest' }, 'Destination'), destSel),
          note,
          el('h3', {}, 'Your boats'),
          fleet,
        );
      },
      update(_root, ctx) {
        const s = S(ctx);
        for (const b of builders) { b.btn.update(ctx); b.btn.root.hidden = !!BOATS[b.type].needs && !ctx.flags.has(BOATS[b.type].needs!); }
        // destinations
        const opts = WATERS.voyages.map((v) => `${v.id}:${v.name}`).join('|');
        if (destSel.dataset.v !== opts) {
          destSel.dataset.v = opts;
          destSel.replaceChildren(...WATERS.voyages.map((v) => el('option', { value: v.id }, `${v.name} (${Math.round(v.time / 60)} min${v.boat ? ', bark boat only' : ''})`)));
        }
        destSel.value = s.dest;
        const d = destOf(s.dest);
        note.textContent = `${d.name}: about ${Math.round(d.time / 60)} minutes for a raft. Brings back ${Object.keys(d.loot).map((r) => ctx.res.has(r) ? ctx.res.get(r).name.toLowerCase() : r).join(', ')}.` +
          ` Idle workers: ${idle(ctx)}.`;
        // fleet: rebuild only when something structural changes
        const now = s.boats.map((b) => `${b.name}:${b.hull}:${b.voyage ? b.voyage.dest + (b.voyage.event ?? '') : '-'}`).join('|') + '|' + s.dest;
        if (now !== sig) {
          sig = now;
          fleet.replaceChildren(...(s.boats.length ? s.boats.map((b) => boatCard(ctx, b, () => { sig = ''; })) : [el('p.muted', {}, 'No boats yet.')]));
        }
        // live progress bars
        fleet.querySelectorAll<HTMLElement>('[data-boat]').forEach((card) => {
          const b = s.boats.find((x) => x.name === card.dataset.boat);
          const fill = card.querySelector<HTMLElement>('.fill');
          if (b?.voyage && fill) fill.style.width = `${Math.min(100, (b.voyage.elapsed / b.voyage.time) * 100)}%`;
          const go = card.querySelector<HTMLButtonElement>('button.launch');
          if (go && b) go.disabled = idle(ctx) < BOATS[b.type].crew || (!!d.boat && b.type !== d.boat);
        });
      },
    };
  })(),
};

function boatCard(ctx: Context, b: Boat, changed: () => void) {
  const def = BOATS[b.type];
  const head = el('div', {}, el('strong', {}, b.name), ' ', el('span.muted', {}, `${def.name}, hull ${b.hull}/${def.hull}, crew ${def.crew}`));
  const card = el('div.boat', { 'data-boat': b.name }, head);
  const v = b.voyage;
  if (!v) {
    const go = el('button.action.launch', { type: 'button' }, 'Launch') as HTMLButtonElement;
    go.addEventListener('click', () => { if (go.disabled) return; launch(ctx, b); changed(); });
    const repair = el('button.ghost', { type: 'button', hidden: b.hull >= def.hull }, `Repair (${fmtCosts({ leaf: 5, twig: 1 }, ctx.res)})`) as HTMLButtonElement;
    repair.addEventListener('click', () => { if (ctx.res.spend({ leaf: 5, twig: 1 })) { b.hull = Math.min(def.hull, b.hull + 1); changed(); } });
    card.append(el('div.row', {}, go, repair));
    return card;
  }
  const bar = progressBar();
  card.append(el('div.row', {}, el('span.muted', {}, `To ${destOf(v.dest).name.toLowerCase()}`), bar.root));
  if (v.event !== null) {
    const ev = EVENTS[v.event];
    const out = el('div.row');
    for (const c of ev.choices) {
      out.append(el('button.action', { type: 'button', onclick: () => {
        const what = c.act(ctx, b, v);
        v.event = null;
        ctx.log(`${b.name}: ${what}`);
        if (b.hull <= 0) sink(ctx, b);
        changed();
      } }, c.label));
    }
    card.append(el('p', {}, ev.text), out);
  }
  return card;
}

