// Reusable leveled upgrades. A system keeps levels in its own state object
// and reads them with lvl(); this file only draws the buttons and charges costs.
import type { Context } from './types';
import type { Costs } from './resources';
import { actionButton, el, type ActionButton } from './ui';

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
  const root = el('div.build');
  const rows: { def: UpgradeDef; wrap: HTMLElement; btn: ActionButton; lv: HTMLElement }[] = [];
  for (const def of defs) {
    const lv = el('span.count');
    const btn = actionButton({
      ctx, label: def.name, desc: def.desc,
      costs: () => def.cost(levels()[def.id] ?? 0),
      enabled: () => (levels()[def.id] ?? 0) < def.max,
      onBuy: (c) => {
        const L = levels();
        L[def.id] = (L[def.id] ?? 0) + 1;
        def.onBuy?.(c, L[def.id]);
      },
    });
    const wrap = el('div.buildrow', { hidden: true }, btn.root, el('span.muted', {}, def.desc), lv);
    root.append(wrap);
    rows.push({ def, wrap, btn, lv });
  }
  return {
    root,
    update(c: Context) {
      let any = false;
      for (const r of rows) {
        const show = !r.def.requires || r.def.requires(c);
        r.wrap.hidden = !show;
        if (!show) continue;
        any = true;
        r.btn.update(c);
        const L = levels()[r.def.id] ?? 0;
        const eff = r.def.effect?.(L);
        r.lv.textContent = (eff ? eff + '  ' : '') + (L >= r.def.max ? 'max' : `${L}/${r.def.max}`);
      }
      root.hidden = !any;
      return any;
    },
  };
}
