/** Live hover text for a store, registered by the system that owns it (shown under its description). */
export const RES_TIPS: Record<string, (ctx: any) => string> = {};

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
  /** Changes in whole steps (eggs, workers): the sidebar flashes +1/−1 instead of a per-second rate. */
  stepped?: boolean;
}

export interface Resource extends Required<ResourceDef> {
  amount: number;
  /** Becomes true the first time amount > 0; then it stays visible. */
  seen: boolean;
  /** Per-second change, measured, for display. */
  rate: number;
  /** Last measured rate split by where it came from, biggest first: [label, per second]. */
  sources: [string, number][];
}

export type Costs = Record<string, number>;

export class Resources {
  private map = new Map<string, Resource>();
  private last = new Map<string, number>();
  /** One-off changes (purchases, loot) since the last rate measurement; left out of the shown rate. */
  private lumps = new Map<string, number>();
  private capBonus = new Map<string, Record<string, number>>();
  /** Amounts a system has earmarked (e.g. for the Swarm Spire); purchases can't dip into them. */
  private holds = new Map<string, Record<string, number>>();
  /** What every add() is credited to in the rate breakdown; the loop sets it per system, systems may refine it. */
  source = 'Other';
  private flow = new Map<string, Map<string, number>>();
  private lumping = false;

  define(def: ResourceDef) {
    if (this.map.has(def.id)) return this.map.get(def.id)!;
    const r: Resource = {
      cap: Infinity, order: 100, integer: false, group: 'Colony', stepped: false,
      ...def, amount: 0, seen: false, rate: 0, sources: [],
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
    const before = r.amount;
    r.amount = Math.max(0, Math.min(this.cap(id), r.amount + n));
    if (r.amount > 0) r.seen = true;
    if (!this.lumping && r.amount !== before) {
      if (!this.flow.has(id)) this.flow.set(id, new Map());
      const f = this.flow.get(id)!;
      f.set(this.source, (f.get(this.source) ?? 0) + r.amount - before);
    }
    return r.amount;
  }
  set(id: string, n: number) { this.get(id).amount = 0; this.add(id, n); }

  /** A system sets how much of a resource it is holding back (replaces its previous value; 0 releases it). */
  hold(id: string, source: string, n: number) {
    if (!this.holds.has(id)) this.holds.set(id, {});
    this.holds.get(id)![source] = Math.max(0, n);
  }
  /** Total held back from purchases. */
  held(id: string) { return Object.values(this.holds.get(id) ?? {}).reduce((a, b) => a + b, 0); }
  /** Names of whatever holds this resource, for tooltips. */
  holders(id: string) { return Object.entries(this.holds.get(id) ?? {}).filter(([, n]) => n > 0).map(([k]) => k); }

  canAfford(costs: Costs) {
    return Object.entries(costs).every(([id, n]) => this.amt(id) - this.held(id) >= n);
  }
  /** Could afford it if nothing were held back. */
  canAffordIgnoringHolds(costs: Costs) {
    return Object.entries(costs).every(([id, n]) => this.amt(id) >= n);
  }
  spend(costs: Costs) {
    if (!this.canAfford(costs)) return false;
    for (const [id, n] of Object.entries(costs)) this.lump(id, -n);
    return true;
  }
  /**
   * A one-off gain or loss, such as a purchase or a party's loot. It changes the amount like add(),
   * but the per-second rate in the sidebar leaves it out, so buying something doesn't flash a
   * negative trickle (or set off food warnings) for a moment.
   */
  lump(id: string, n: number) {
    const before = this.amt(id);
    this.lumping = true;
    const after = this.add(id, n);
    this.lumping = false;
    this.lumps.set(id, (this.lumps.get(id) ?? 0) + (after - before));
    return after;
  }

  /** Called once per second by the loop to measure rates for display. */
  measureRates(seconds: number) {
    for (const r of this.map.values()) {
      const prev = this.last.get(r.id) ?? r.amount;
      const trickle = (r.amount - prev - (this.lumps.get(r.id) ?? 0)) / seconds;
      // a full store shows its flat 0, not the income it is wasting
      r.rate = r.amount >= this.cap(r.id) && trickle > 0 ? 0 : trickle;
      r.sources = [...(this.flow.get(r.id) ?? new Map<string, number>()).entries()]
        .map(([k, v]) => [k, v / seconds] as [string, number])
        .filter(([, v]) => Math.abs(v) >= 0.0005)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      this.last.set(r.id, r.amount);
    }
    this.lumps.clear();
    this.flow.clear();
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
  if (a > 0 && a < 0.01) return n.toFixed(Math.min(6, 1 - Math.floor(Math.log10(a)))); // tiny rates: two significant digits, e.g. 0.0040
  return n.toFixed(2);
}

export function fmtCosts(costs: Costs, res: Resources) {
  return Object.entries(costs)
    .map(([id, n]) => `${fmt(n, true)} ${res.has(id) ? res.get(id).name.toLowerCase() : id}`)
    .join(', ');
}
