export interface ResourceDef {
  id: string;
  name: string;
  /** Max amount; Infinity for no cap. */
  cap?: number;
  /** Order in the sidebar. Lower first. */
  order?: number;
  /** Show whole numbers only. */
  integer?: boolean;
  /** Group label in the sidebar. */
  group?: string;
}

export interface Resource extends Required<ResourceDef> {
  amount: number;
  /** Becomes true the first time amount > 0; then it stays visible. */
  seen: boolean;
  /** Per-second change, measured, for display. */
  rate: number;
}

export type Costs = Record<string, number>;

export class Resources {
  private map = new Map<string, Resource>();
  private last = new Map<string, number>();
  private capBonus = new Map<string, Record<string, number>>();

  define(def: ResourceDef) {
    if (this.map.has(def.id)) return this.map.get(def.id)!;
    const r: Resource = {
      cap: Infinity, order: 100, integer: false, group: 'Colony',
      ...def, amount: 0, seen: false, rate: 0,
    } as Resource;
    this.map.set(def.id, r);
    return r;
  }

  get(id: string) {
    const r = this.map.get(id);
    if (!r) throw new Error(`Unknown resource "${id}"`);
    return r;
  }
  has(id: string) { return this.map.has(id); }
  amt(id: string) { return this.map.get(id)?.amount ?? 0; }
  all() { return [...this.map.values()].sort((a, b) => a.order - b.order); }

  /** Effective cap = base cap + all bonuses registered by systems. */
  cap(id: string) {
    const r = this.get(id);
    const bonus = Object.values(this.capBonus.get(id) ?? {}).reduce((a, b) => a + b, 0);
    return r.cap + bonus;
  }
  /** A system sets its own contribution to a resource cap (replaces its previous value). */
  setCapBonus(id: string, source: string, value: number) {
    if (!this.capBonus.has(id)) this.capBonus.set(id, {});
    this.capBonus.get(id)![source] = value;
  }

  add(id: string, n: number) {
    const r = this.get(id);
    r.amount = Math.max(0, Math.min(this.cap(id), r.amount + n));
    if (r.amount > 0) r.seen = true;
    return r.amount;
  }
  set(id: string, n: number) { this.get(id).amount = 0; this.add(id, n); }

  canAfford(costs: Costs) {
    return Object.entries(costs).every(([id, n]) => this.amt(id) >= n);
  }
  spend(costs: Costs) {
    if (!this.canAfford(costs)) return false;
    for (const [id, n] of Object.entries(costs)) this.add(id, -n);
    return true;
  }

  /** Called once per second by the loop to measure rates for display. */
  measureRates(seconds: number) {
    for (const r of this.map.values()) {
      const prev = this.last.get(r.id) ?? r.amount;
      r.rate = (r.amount - prev) / seconds;
      this.last.set(r.id, r.amount);
    }
  }

  serialize() {
    const out: Record<string, { a: number; s: boolean }> = {};
    for (const r of this.map.values()) out[r.id] = { a: r.amount, s: r.seen };
    return out;
  }
  load(data: Record<string, { a: number; s: boolean }>) {
    for (const [id, v] of Object.entries(data)) {
      const r = this.map.get(id);
      if (r) { r.amount = v.a; r.seen = v.s; }
    }
  }
}

export function fmt(n: number, integer = false) {
  if (!isFinite(n)) return '∞';
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  if (integer) return Math.floor(n).toString();
  if (a >= 100) return n.toFixed(0);
  if (a >= 10) return n.toFixed(1);
  if (a > 0 && a < 0.01) return n.toFixed(3); // tiny rates, e.g. one slow worker
  return n.toFixed(2);
}

export function fmtCosts(costs: Costs, res: Resources) {
  return Object.entries(costs)
    .map(([id, n]) => `${fmt(n, true)} ${res.has(id) ? res.get(id).name.toLowerCase() : id}`)
    .join(', ');
}
