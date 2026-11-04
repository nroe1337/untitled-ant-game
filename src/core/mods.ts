// Shared modifiers. Systems publish bonuses by name and source; anyone can read the total.
// Example: nest sets mods.set('upkeep', 'nest', -0.12); jobs reads mods.get('upkeep').
export class Mods {
  private m = new Map<string, Map<string, number>>();
  set(key: string, source: string, value: number) {
    if (!this.m.has(key)) this.m.set(key, new Map());
    this.m.get(key)!.set(source, value);
  }
  /** Sum of all sources for a key (0 when nobody set it). */
  get(key: string) {
    let t = 0;
    this.m.get(key)?.forEach((v) => (t += v));
    return t;
  }
}
