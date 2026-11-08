// Shared bits for the research and upgrade queues (the nest keeps its own building queue).
// A queue is a list of string keys in the save. Each tick buys at most one: the first in line,
// or the cheapest affordable one when the player picked "cheapest first".
import type { Context } from './types';
import type { Costs } from './resources';
import { el } from './ui';
import { queueOrder } from './options';

export interface QueueItem { name: string; cost: () => Costs; ok: () => boolean; buy: () => void }

const total = (c: Costs) => Object.values(c).reduce((a, b) => a + b, 0);
/** Every cost fits under its storage cap, so waiting can pay for it. */
export const fits = (ctx: Context, c: Costs) => Object.entries(c).every(([r, n]) => ctx.res.has(r) && ctx.res.cap(r) >= n);

/** Drop entries that can no longer happen, then buy at most one. resolve() returns undefined for a key it can't place yet. */
export function runQueue(ctx: Context, q: string[], resolve: (key: string) => QueueItem | undefined) {
  for (let i = q.length - 1; i >= 0; i--) {
    const it = resolve(q[i]);
    if (it && (!it.ok() || !fits(ctx, it.cost()))) q.splice(i, 1);
  }
  let pick = -1;
  if (queueOrder() === 'cheapest') {
    let best = Infinity;
    q.forEach((k, i) => { const it = resolve(k); const c = it?.cost(); if (c && ctx.res.canAfford(c) && total(c) < best) { best = total(c); pick = i; } });
  } else {
    pick = q.findIndex((k) => resolve(k));
  }
  if (pick < 0) return;
  const it = resolve(q[pick])!;
  if (!ctx.res.spend(it.cost())) return;
  q.splice(pick, 1);
  it.buy();
}

/** Seconds until these costs are affordable at current rates; Infinity if something isn't coming in. */
export function eta(ctx: Context, c: Costs) {
  let t = 0;
  for (const [r, n] of Object.entries(c)) {
    const short = n - ctx.res.amt(r);
    if (short <= 0) continue;
    const rate = ctx.res.has(r) ? ctx.res.get(r).rate : 0;
    if (rate <= 0) return Infinity;
    t = Math.max(t, short / rate);
  }
  return t;
}
const fmtEta = (t: number) => (t <= 0 ? 'ready' : !isFinite(t) ? 'waiting' : t < 60 ? `${Math.ceil(t)}s` : t < 3600 ? `${Math.floor(t / 60)}m ${Math.ceil(t % 60)}s` : `${Math.floor(t / 3600)}h ${Math.floor((t % 3600) / 60)}m`);

/**
 * An Evolve-style queue box: a titled list, one row per queued item with the time until it can be
 * bought, a button to move it up and one to take it out. Repeats in a row show as "×N".
 */
export function queueStrip(title: string, _hint?: string) {
  const head = el('div.qhead');
  const list = el('div.qlist');
  const root = el('div.queue', { hidden: true }, head, list);
  let sig = '', last = 0;
  return {
    root,
    update(slots: number, q: string[], name: (key: string) => string, only?: (key: string) => boolean, ctx?: Context, cost?: (key: string) => Costs | undefined) {
      root.hidden = !slots;
      if (!slots) return;
      const now = performance.now();
      const s = q.join(',') + '|' + slots;
      if (s === sig && now - last < 500) return;
      sig = s; last = now;
      head.textContent = `${title} (${q.length}/${slots})`;
      // group runs of the same key so "Tunnel ×3" takes one row
      const rows: { k: string; i: number; n: number }[] = [];
      q.forEach((k, i) => { if (only && !only(k)) return; const prev = rows[rows.length - 1]; if (prev && prev.k === k && prev.i + prev.n === i) prev.n++; else rows.push({ k, i, n: 1 }); });
      list.replaceChildren(...(rows.length ? rows.map(({ k, i, n }) => {
        const c = ctx && cost ? cost(k) : undefined;
        const when = c && ctx ? fmtEta(eta(ctx, c)) : '';
        return el('div.qrow', {},
          el('span.qname', {}, name(k) + (n > 1 ? ` ×${n}` : '')),
          el('span.qeta', {}, when),
          el('button.qx', { type: 'button', title: 'Move up', 'aria-label': `Move ${name(k)} up`, ...(i === 0 ? { disabled: true } : {}), onclick: () => { if (i > 0 && q[i] === k) { const [it] = q.splice(i, n); q.splice(i - 1, 0, ...Array(n).fill(it)); sig = ''; } } }, '▲'),
          el('button.qx', { type: 'button', title: 'Remove', 'aria-label': `Remove ${name(k)} from the queue`, onclick: () => { if (q[i] === k) q.splice(i, 1); sig = ''; } }, '✕'));
      }) : [el('div.qrow.muted', {}, 'Empty')]));
    },
  };
}

/** The queues live in one dock above the Chronicle, refreshed every frame whatever tab is open. */
export const queueDock = el('div.queuedock');
const docked: { rank: number; root: HTMLElement; run: (ctx: Context) => void }[] = [];
export function dockQueue(title: string, rank: number, update: (strip: ReturnType<typeof queueStrip>, ctx: Context) => void) {
  const strip = queueStrip(title);
  docked.push({ rank, root: strip.root, run: (ctx) => update(strip, ctx) });
  docked.sort((a, b) => a.rank - b.rank);
  queueDock.replaceChildren(...docked.map((d) => d.root));
}
export function updateDock(ctx: Context) { for (const d of docked) d.run(ctx); }
