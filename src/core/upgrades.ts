// Reusable leveled upgrades. A system keeps levels in its own state object
// and reads them with lvl(); this file only draws the buttons and charges costs.
import type { Context } from './types';
import type { Costs } from './resources';
import { el, tileButton } from './ui';
import { fits, queueStrip, runQueue, type QueueItem } from './queue';

/** Upgrade queue: unlocked late by the Work ledgers research. Keys are "<list>/<upgrade>", one per level. */
export const upgradeSlots = (ctx: Context) => (ctx.flags.has('tech:ledgers') ? 2 + ctx.mods.get('upgradeSlots') : 0);
const uq = (ctx: Context) => { const r = (ctx.state.research ??= {}) as { uq?: string[] }; return (r.uq ??= []); };
/** Every upgrade list drawn so far, so the queue can buy from a tab that isn't open. */
const registry = new Map<string, { def: UpgradeDef; levels: () => Record<string, number> }>();
const lvlOf = (key: string) => { const r = registry.get(key)!; return r.levels()[r.def.id] ?? 0; };
const queuedOf = (ctx: Context, key: string) => uq(ctx).filter((k) => k === key).length;
const itemOf = (ctx: Context, key: string): QueueItem | undefined => {
  const r = registry.get(key);
  if (!r) return undefined;
  return {
    name: r.def.name,
    cost: () => r.def.cost(lvlOf(key)),
    ok: () => lvlOf(key) < r.def.max && (!r.def.requires || r.def.requires(ctx)),
    buy: () => { const L = r.levels(); L[r.def.id] = (L[r.def.id] ?? 0) + 1; r.def.onBuy?.(ctx, L[r.def.id]); ctx.log(`Upgraded ${r.def.name} from the queue.`, 'info'); },
  };
};
/** Called once a tick (by research). */
export function runUpgradeQueue(ctx: Context) {
  if (upgradeSlots(ctx)) runQueue(ctx, uq(ctx), (k) => itemOf(ctx, k));
}

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  /** Cost of buying the next level, given the current level. */
  cost: (level: number) => Costs;
  max: number;
  /** Hide until this returns true. */
  requires?: (ctx: Context) => boolean;
  onBuy?: (ctx: Context, newLevel: number) => void;
  /** Text for the current total effect, e.g. "+12%". */
  effect?: (level: number) => string;
}

/** Build UpgradeDefs straight from balance data: { name, desc with {p}, per, base, growth, max, needs } */
export function fromBalance(
  table: Record<string, { name: string; desc: string; per: number; base: Costs; growth: number; max: number; needs?: string; unit?: 'pct' | 'flat' }>,
  requires?: (ctx: Context, needs?: string) => boolean,
  unit: 'pct' | 'flat' = 'pct',
): UpgradeDef[] {
  return Object.entries(table).map(([id, d]) => {
    const u = d.unit ?? unit;
    const show = (v: number) => (u === 'pct' ? `${+(v * 100).toFixed(1)}%` : `${+v.toFixed(2)}`);
    return {
    id, name: d.name, max: d.max,
    desc: d.desc.replace('{p}', show(Math.abs(d.per))),
    cost: scaled(d.base, d.growth),
    requires: requires ? (ctx: Context) => requires(ctx, d.needs) : undefined,
    effect: (L: number) => (L ? (d.per < 0 ? '−' : '+') + show(Math.abs(d.per * L)) : ''),
    };
  });
}

/** Scale every cost by growth^level. */
export const scaled = (base: Costs, growth: number) => (level: number): Costs =>
  Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.ceil(v * Math.pow(growth, level))]));

export function upgradeList(ctx: Context, levels: () => Record<string, number>, defs: UpgradeDef[]) {
  const grid = el('div.tiles');
  const strip = queueStrip('Upgrade queue', 'Shift-click an upgrade to queue it. Upgrades you can\'t afford yet queue with a plain click.');
  const root = el('div', {}, strip.root, grid);
  const list = defs.map((d) => d.id).join('+');
  const keyOf = (def: UpgradeDef) => `${list}/${def.id}`;
  const rows: { def: UpgradeDef; tile: ReturnType<typeof tileButton> }[] = [];
  const lvl = (def: UpgradeDef) => levels()[def.id] ?? 0;
  for (const def of defs) {
    registry.set(keyOf(def), { def, levels });
    const tile = tileButton({
      ctx, label: def.name,
      effect: () => def.desc,
      note: () => {
        const L = lvl(def), now = def.effect?.(L), next = def.effect?.(L + 1);
        if (!def.effect) return L >= def.max ? 'Fully upgraded.' : '';
        if (L >= def.max) return `Level ${L} of ${def.max} (max): ${now} in total.`;
        return L ? `Level ${L} of ${def.max}: ${now} now, ${next} after this level.` : `Level 0 of ${def.max}. The first level gives ${next}.`;
      },
      count: () => (lvl(def) >= def.max ? 'max' : `${lvl(def)}/${def.max}` + (queuedOf(ctx, keyOf(def)) ? ` +${queuedOf(ctx, keyOf(def))}` : '')),
      costs: () => def.cost(lvl(def)),
      enabled: () => lvl(def) < def.max,
      onBuy: (c) => {
        const L = levels();
        L[def.id] = (L[def.id] ?? 0) + 1;
        def.onBuy?.(c, L[def.id]);
      },
      onQueue: (c) => {
        const q = uq(c), k = keyOf(def);
        const next = lvl(def) + queuedOf(c, k);
        if (q.length >= upgradeSlots(c) || next >= def.max || !fits(c, def.cost(next))) return false;
        q.push(k);
        return true;
      },
    });
    tile.root.hidden = true;
    grid.append(tile.root);
    rows.push({ def, tile });
  }
  return {
    root,
    update(c: Context) {
      let any = false;
      const slots = upgradeSlots(c), q = uq(c);
      for (const r of rows) {
        const show = !r.def.requires || r.def.requires(c);
        r.tile.root.hidden = !show;
        if (!show) continue;
        any = true;
        r.tile.root.classList.toggle('queues', slots > q.length && lvl(r.def) + queuedOf(c, keyOf(r.def)) < r.def.max);
        r.tile.update(c);
      }
      strip.update(any ? slots : 0, q, (k) => registry.get(k)?.def.name ?? k, (k) => k.startsWith(list + '/'));
      root.hidden = !any;
      return any;
    },
  };
}
