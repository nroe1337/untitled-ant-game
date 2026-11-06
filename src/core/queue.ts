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

/** The strip of chips above a tile grid: "Queue 1/2." and a ✕ on each. */
export function queueStrip(title: string, hint: string) {
  const head = el('strong');
  const list = el('div.qlist');
  const root = el('div.queue', { hidden: true }, el('div.qhead', {}, head, el('span.muted', {}, ' ' + hint)), list);
  let sig = '';
  return {
    root,
    update(slots: number, q: string[], name: (key: string) => string, only?: (key: string) => boolean) {
      root.hidden = !slots;
      if (!slots) return;
      head.textContent = `${title} ${q.length}/${slots}.`;
      const shown = q.map((k, i) => [k, i] as const).filter(([k]) => !only || only(k));
      const s = shown.map(([k]) => k).join(',') + '|' + q.length + '|' + slots;
      if (s === sig) return;
      sig = s;
      list.replaceChildren(...(shown.length ? shown.map(([k, i]) => el('span.qchip', {}, name(k),
        el('button.qx', { type: 'button', 'aria-label': `Remove ${name(k)} from the queue`, onclick: () => { if (q[i] === k) q.splice(i, 1); sig = ''; } }, '✕')))
        : [el('span.muted', {}, 'Nothing queued.')]));
    },
  };
}
