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
/** Techniques and trail upgrades go in the research queue (Study plans) instead, as "u:<key>". */
const studySlots = (ctx: Context) => (ctx.flags.has('tech:studyplans') ? 2 + ctx.mods.get('queueSlots') : 0);
const rq = (ctx: Context) => { const r = (ctx.state.research ??= {}) as { queue?: string[] }; return (r.queue ??= []); };
export const upgradeItem = (ctx: Context, qkey: string) => itemOf(ctx, qkey.slice(2));
export const upgradeName = (qkey: string) => registry.get(qkey.slice(2))?.def.name ?? qkey.split('/').pop()!;
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

export function upgradeList(ctx: Context, levels: () => Record<string, number>, defs: UpgradeDef[], opts: { research?: boolean } = {}) {
  const grid = el('div.tiles');
  const research = !!opts.research, pre = research ? 'u:' : '';
  const Q = (c: Context) => (research ? rq(c) : uq(c));
  const SL = (c: Context) => (research ? studySlots(c) : upgradeSlots(c));
  const strip = queueStrip(research ? 'Research queue' : 'Upgrade queue');
  const root = el('div', {}, strip.root, grid);
  const list = defs.map((d) => d.id).join('+');
  const keyOf = (def: UpgradeDef) => `${list}/${def.id}`;
  const qd = (c: Context, def: UpgradeDef) => Q(c).filter((k) => k === pre + keyOf(def)).length;
  const rows: { def: UpgradeDef; tile: ReturnType<typeof tileButton> }[] = [];
  const lvl = (def: UpgradeDef) => levels()[def.id] ?? 0;
  for (const def of defs) {
    registry.set(keyOf(def), { def, levels });
    const tile = tileButton({
      ctx, label: def.name,
      effect: () => def.desc,
      count: () => (lvl(def) >= def.max ? 'max' : `${lvl(def)}/${def.max}` + (qd(ctx, def) ? ` +${qd(ctx, def)}` : '')),
      costs: () => def.cost(lvl(def)),
      enabled: () => lvl(def) < def.max,
      onBuy: (c) => {
        const L = levels();
        L[def.id] = (L[def.id] ?? 0) + 1;
        def.onBuy?.(c, L[def.id]);
      },
      onQueue: (c) => {
        const q = Q(c);
        const next = lvl(def) + qd(c, def);
        if (q.length >= SL(c) || next >= def.max || !fits(c, def.cost(next))) return false;
        q.push(pre + keyOf(def));
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
      const slots = SL(c), q = Q(c);
      for (const r of rows) {
        const show = !r.def.requires || r.def.requires(c);
        r.tile.root.hidden = !show;
        if (!show) continue;
        any = true;
        r.tile.root.classList.toggle('queues', slots > q.length && lvl(r.def) + qd(c, r.def) < r.def.max);
        r.tile.update(c);
      }
      strip.update(any ? slots : 0, q, (k) => registry.get(k.slice(pre.length))?.def.name ?? k, (k) => k.startsWith(pre + list + '/'), c, (k) => itemOf(c, k.slice(pre.length))?.cost());
      root.hidden = !any;
      return any;
    },
  };
}
