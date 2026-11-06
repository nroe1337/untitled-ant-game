// Champion hunts: one named ant fights at a fight level you choose (or Auto chooses). Each ground spans
// 20 levels; level 10 of it is guarded by an elder foe, level 20 by the ground's boss, and you can't
// fight past a guard until it falls. Higher levels: harder foes, more experience, better gear odds.
// Idle, it fights at a crawl. Use its abilities and it fights at full speed for a while (about 5x).
// Every foe can drop a piece of its ground's gear set. A duplicate levels up the piece you own,
// so there is no bag to sort. Rare pieces roll a trait. Wearing 3 or 6 of a set gives a bonus.
// Bosses give trophies: permanent colony bonuses. The champion and its gear outlive every flight.
// Publishes mods (soldierPower, expLoot, trophy mods), food from kills, and emits 'champion:kill'.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, progressBar, type ActionButton } from '../../core/ui';
import { fmt } from '../../core/resources';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { PAL, rect, setup } from '../../core/pixel';
import { CHAMPION as C, type Slot, type Stat } from '../../data/champion';

interface Owned { lvl: number; q: number; trait?: string }
interface Foe { id: string; name: string; lvl: number; hp: number; max: number; atk: number; swing: number; t: number; boss: boolean; size: number; color: string; drop: string }
interface ChampState {
  name: string | null;
  level: number; xp: number; hp: number; kills: number; defeats: number;
  ground: string;
  depth: Record<string, number>;     // old saves only
  /** Fight level now, the highest guard beaten (0 = none), Auto on or off, wins in a row at this level, and the pause after a loss. */
  lvl?: number; top?: number; auto?: boolean; streak?: number; hold?: number;
  beaten: string[];
  items: Record<string, Owned>;
  worn: (string | null)[];
  trophies: string[];
  train: Record<string, number>;
  recent: string[];
  // fight state (not kept across flights)
  foe: Foe | null; gap: number; recover: number; active: number; swingT: number;
  poison: { dps: number; left: number } | null; brace: number; cds: Record<string, number>;
  flash: number; lunge: number; challenge: boolean;
}
const S = (ctx: Context) => ctx.state.champion as ChampState;
const GROUNDS = C.grounds;
const ITEMS = C.items;
const groundOf = (id: string) => GROUNDS.find((g) => g.id === id)!;
const gIndex = (id: string) => GROUNDS.findIndex((g) => g.id === id);
const TRAIN = fromBalance(C.training);
const tl = (ctx: Context, id: keyof typeof C.training) => S(ctx).train[id] ?? 0;
const FLAT: Stat[] = ['atk', 'hp', 'def', 'venom'];
const STATS: Stat[] = ['atk', 'hp', 'def', 'speed', 'crit', 'luck', 'regen', 'venom', 'xp'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// ---- stats ----
/** One item's stats at its level and quality. */
function itemStats(id: string, o: Owned) {
  const d = ITEMS[id];
  const tier = Math.pow(C.gear.tier, gIndex(d.ground));
  const m = (1 + C.gear.perLevel * (o.lvl - 1)) * C.gear.quality[o.q].mult;
  const out: Partial<Record<Stat, number>> = {};
  for (const [k, v] of Object.entries(d.stats) as [Stat, number][]) out[k] = v * m * (FLAT.includes(k) ? tier : 1);
  return out;
}
function itemScore(id: string, o: Owned) {
  const s = itemStats(id, o);
  const w: Record<Stat, number> = { atk: 3, hp: 0.3, def: 3, venom: 2, speed: 40, crit: 40, luck: 8, regen: 600, xp: 10 };
  return STATS.reduce((t, k) => t + (s[k] ?? 0) * w[k], 0) + (o.trait ? 5 : 0);
}
function setCounts(ctx: Context) {
  const n: Record<string, number> = {};
  for (const id of S(ctx).worn) if (id) n[ITEMS[id].ground] = (n[ITEMS[id].ground] ?? 0) + 1;
  return n;
}
function stats(ctx: Context) {
  const s = S(ctx);
  const flat: Record<Stat, number> = { atk: 0, hp: 0, def: 0, speed: 0, crit: 0, luck: 0, regen: 0, venom: 0, xp: 0 };
  const pct: Record<Stat, number> = { ...flat };
  const traits = new Set<string>();
  for (const id of s.worn) {
    if (!id || !s.items[id]) continue;
    for (const [k, v] of Object.entries(itemStats(id, s.items[id])) as [Stat, number][]) flat[k] += v;
    if (s.items[id].trait) traits.add(s.items[id].trait!);
  }
  const counts = setCounts(ctx);
  for (const g of GROUNDS) {
    const c = counts[g.id] ?? 0;
    const bonus = c >= 6 ? g.set.six : c >= 3 ? g.set.three : null;
    if (bonus) for (const [k, v] of Object.entries(bonus) as [Stat, number][]) {
      if (k === 'regen' || k === 'crit' || k === 'luck' || k === 'xp') flat[k] += v; else pct[k] += v;
    }
  }
  const grow = Math.pow(1 + C.perLevel, s.level - 1);
  return {
    atk: (C.base.atk + flat.atk) * grow * (1 + pct.atk + C.training.grip.per * tl(ctx, 'grip') + ctx.mods.get('champAtk')),
    maxHp: (C.base.hp + flat.hp) * grow * (1 + pct.hp + C.training.shell.per * tl(ctx, 'shell') + C.training.wraps.per * tl(ctx, 'wraps')),
    def: flat.def * grow * (1 + pct.def),
    swing: C.base.swing / (1 + Math.min(1, flat.speed + (traits.has('swift') ? 0.1 : 0))),
    crit: Math.min(0.5, 0.03 + flat.crit + (traits.has('keen') ? 0.08 : 0)),
    luck: flat.luck + (traits.has('lucky') ? 0.15 : 0) + C.training.nets.per * tl(ctx, 'nets'),
    regen: C.regen + flat.regen + (traits.has('hardy') ? 0.01 : 0),
    venom: flat.venom * grow,
    xp: flat.xp,
    traits,
  };
}
const xpNeed = (lvl: number) => Math.ceil(C.xpBase * Math.pow(C.xpGrowth, lvl - 1));
const mitigation = (def: number, atk: number) => Math.min(0.75, def / (def + atk));
const speedMult = (ctx: Context) => (S(ctx).active > 0 ? 1 : C.idleSpeed + C.training.stamina.per * tl(ctx, 'stamina') + (ctx.flags.has('accord:call') ? 0.3 : 0));
const unlockedGrounds = (ctx: Context) => GROUNDS.filter((g, i) => i * C.levelsPerGround < (S(ctx).top ?? 0) + C.bossEvery);
const fighting = (ctx: Context) => !!S(ctx).name && S(ctx).recover <= 0;
const LPG = C.levelsPerGround;
/** Which ground a fight level is in (past the last ground, the last one keeps going). */
const groundAt = (L: number) => GROUNDS[Math.min(GROUNDS.length - 1, Math.floor((L - 1) / LPG))];
const isGuard = (L: number) => L % C.bossEvery === 0;
const isBossLevel = (L: number) => L % LPG === 0 && Math.floor((L - 1) / LPG) < GROUNDS.length;
/** The highest level you may fight at: up to and including the next guard. */
const maxLevel = (ctx: Context) => (S(ctx).top ?? 0) + C.bossEvery;
/** Better odds of fine and rare gear the deeper into a ground you hunt. */
const deepBonus = (L: number) => (((L - 1) % LPG) + 1) * C.gear.deepQuality;
function setLevel(ctx: Context, L: number) {
  const s = S(ctx);
  L = Math.max(1, Math.min(maxLevel(ctx), Math.round(L)));
  if (L === s.lvl) return;
  s.lvl = L; s.ground = groundAt(L).id; s.foe = null; s.gap = Math.min(s.gap, C.gap); s.streak = 0;
}

// ---- the fight ----
function spawn(ctx: Context) {
  const s = S(ctx), L = s.lvl ?? 1, g = groundAt(L);
  s.ground = g.id;
  const guarded = isGuard(L) && L > (s.top ?? 0);
  if (guarded || s.challenge) {
    const ground = isBossLevel(L) || s.challenge;
    const b = ground ? g.boss : (() => { const f = g.foes[(L / C.bossEvery) % g.foes.length]; return { id: 'elder_' + f.id, name: 'Elder ' + f.name.toLowerCase(), size: f.size + 3, color: f.color, drop: f.drop }; })();
    const k = ground ? C.boss : C.guardian;
    const lv = L + k.extraLevels, sc = Math.pow(C.foe.scale, lv);
    s.foe = { id: b.id, name: b.name, lvl: lv, hp: C.foe.hp * k.hp * sc, max: C.foe.hp * k.hp * sc, atk: C.foe.atk * k.atk * sc, swing: C.foe.swing, t: 0, boss: true, size: b.size, color: b.color, drop: b.drop };
    if (guarded) ctx.log(`${s.name} faces ${b.name.startsWith('The') ? b.name.toLowerCase() : 'the ' + b.name.toLowerCase()}, who guards level ${L}.`, 'story');
    return;
  }
  const f = pick(g.foes);
  const sc = Math.pow(C.foe.scale, L);
  s.foe = { id: f.id, name: f.name, lvl: L, hp: C.foe.hp * f.hp * sc, max: C.foe.hp * f.hp * sc, atk: C.foe.atk * f.atk * sc, swing: C.foe.swing, t: Math.random() * C.foe.swing * 0.5, boss: false, size: f.size, color: f.color, drop: f.drop };
}

function hit(ctx: Context, dmg: number, st: ReturnType<typeof stats>) {
  const s = S(ctx);
  if (!s.foe) return;
  const crit = Math.random() < st.crit;
  const d = dmg * (crit ? 2 : 1);
  s.foe.hp -= d;
  s.flash = 0.12;
  if (st.traits.has('vampiric')) s.hp = Math.min(st.maxHp, s.hp + d * 0.08);
}

function defeat(ctx: Context) {
  const s = S(ctx);
  s.defeats++;
  s.recover = C.recoverTime;
  s.poison = null; s.brace = 0;
  const f = s.foe;
  s.foe = null; s.challenge = false; s.streak = 0;
  // fall back a little so it doesn't walk straight into the same jaws (Auto falls back further and waits)
  const L = s.lvl ?? 1;
  setLevel(ctx, L - (s.auto ? C.auto.dropOnLoss : 1));
  if (s.auto) s.hold = C.auto.holdAfterLoss;
  ctx.log(f?.boss ? `${s.name} is thrown back by the ${f.name.toLowerCase()} at level ${L}, and limps home to recover. Get stronger and try again.` : `${s.name} is beaten at level ${L} and limps home to recover. It will hunt again at level ${s.lvl} in a minute.`, 'warn');
}

function win(ctx: Context) {
  const s = S(ctx), f = s.foe!, L = s.lvl ?? 1, g = groundAt(L);
  const st = stats(ctx);
  s.foe = null; s.poison = null; s.gap = C.gap;
  s.kills++;
  s.xp += C.foe.xp * Math.pow(C.foe.xpScale, f.lvl) * (f.boss ? 10 : 1) * (1 + st.xp);
  while (s.xp >= xpNeed(s.level)) {
    s.xp -= xpNeed(s.level); s.level++;
    const unlocked = Object.values(C.abilities).find((a) => a.lvl === s.level);
    ctx.log(`${s.name} reaches level ${s.level}.` + (unlocked ? ` It learns ${unlocked.name}.` : ''), unlocked ? 'story' : 'info');
  }
  if (ctx.res.has('food')) ctx.res.add('food', C.foodPerKill * (1 + f.lvl / 10));
  ctx.bus.emit('champion:kill', { foe: f.id, boss: f.boss, lvl: f.lvl, level: s.level });
  // loot
  const deep = deepBonus(L);
  if (f.boss) {
    s.challenge = false;
    gain(ctx, f.drop, rollQuality(deep + 0.15));
    if (isGuard(L) && L > (s.top ?? 0)) {
      s.top = L;
      if (f.id === g.boss.id && !s.beaten.includes(f.id)) {
        s.beaten.push(f.id);
        const t = C.trophies[g.boss.trophy];
        s.trophies.push(g.boss.trophy);
        ctx.log(`${s.name} kills the ${f.name.toLowerCase()}! The colony hangs up its ${t.name.toLowerCase()} (${t.desc}). Levels up to ${maxLevel(ctx)} are open.`, 'story');
      } else ctx.log(`${s.name} kills the ${f.name.toLowerCase()}. Levels up to ${maxLevel(ctx)} are open.`, 'story');
    }
  } else {
    if (Math.random() < C.gear.dropChance * (1 + st.luck)) gain(ctx, f.drop, rollQuality(deep));
    if (Math.random() < C.gear.rareFind * (1 + st.luck)) gain(ctx, g.rare, rollQuality(deep + 0.1));
  }
  // Auto: climb after a few clean wins, up to the next guard
  if (s.auto && (s.hold ?? 0) <= 0) {
    s.streak = (s.streak ?? 0) + 1;
    if (s.streak >= C.auto.climbAfter && s.hp / st.maxHp >= C.auto.minHp && L < maxLevel(ctx)) setLevel(ctx, L + 1);
  }
}

function rollQuality(bonus: number) {
  const r = Math.random();
  const [, fine, rare] = C.gear.quality;
  if (r < rare.chance + bonus) return 2;
  if (r < rare.chance + fine.chance + bonus * 3) return 1;
  return 0;
}

function gain(ctx: Context, id: string, q: number) {
  const s = S(ctx), d = ITEMS[id];
  const qn = C.gear.quality[q].name.toLowerCase();
  let o = s.items[id];
  let note: string;
  if (!o) {
    o = s.items[id] = { lvl: 1, q };
    if (q === 2) o.trait = pick(Object.keys(C.traits));
    note = `New: ${d.name} (${qn}${o.trait ? ', ' + C.traits[o.trait].name.toLowerCase() : ''})`;
    // wear it straight away if that slot is empty
    const slot = s.worn.findIndex((w, i) => !w && C.gear.slots[i] === d.slot);
    if (slot >= 0) s.worn[slot] = id;
    ctx.log(`${s.name} brings back something new: ${d.name.toLowerCase()}${d.rare ? ', a rare find' : ''}.`, d.rare ? 'story' : 'info');
  } else if (q > o.q) {
    o.q = q;
    if (q === 2 && !o.trait) o.trait = pick(Object.keys(C.traits));
    note = `${d.name} is now ${qn}` + (o.trait ? ` (${C.traits[o.trait].name.toLowerCase()})` : '');
    ctx.log(`${note}.`, 'info');
  } else if (o.lvl < C.gear.maxLevel) {
    o.lvl++;
    note = `${d.name} +1 (level ${o.lvl})`;
  } else note = `${d.name} (already at its best)`;
  s.recent.unshift(note);
  s.recent.length = Math.min(s.recent.length, 8);
}

export function useAbility(ctx: Context, id: string, manual = true) {
  const s = S(ctx), a = C.abilities[id];
  if (!fighting(ctx) || !s.foe || (s.cds[id] ?? 0) > 0 || s.level < a.lvl) return;
  const st = stats(ctx);
  s.cds[id] = a.cd;
  if (manual) s.active = C.activeWindow + C.training.focus.per * tl(ctx, 'focus');
  s.lunge = 0.2;
  if (id === 'bite') hit(ctx, st.atk * 2.5, st);
  if (id === 'sting') s.poison = { dps: st.atk * 0.5 + st.venom, left: 8 };
  if (id === 'brace') s.brace = 4;
  if (id === 'groom') s.hp = Math.min(st.maxHp, s.hp + st.maxHp * 0.35);
  if (id === 'acid') hit(ctx, st.atk * 6, st);
}

export function wearBest(ctx: Context) {
  const s = S(ctx);
  const used = new Set<string>();
  s.worn = C.gear.slots.map((slot) => {
    const best = Object.keys(s.items).filter((id) => ITEMS[id].slot === slot && !used.has(id))
      .sort((a, b) => itemScore(b, s.items[b]) - itemScore(a, s.items[a]))[0] ?? null;
    if (best) used.add(best);
    return best;
  });
}

export const champion: GameSystem = {
  id: 'champion',

  init(ctx) {
    ctx.state.champion = {
      name: null, level: 1, xp: 0, hp: C.base.hp, kills: 0, defeats: 0, ground: 'litter', depth: {}, beaten: [], lvl: 1, top: 0, auto: false, streak: 0, hold: 0,
      items: {}, worn: C.gear.slots.map(() => null), trophies: [], train: {}, recent: [],
      foe: null, gap: 0, recover: 0, active: 0, swingT: 0, poison: null, brace: 0, cds: {}, flash: 0, lunge: 0, challenge: false,
    } satisfies ChampState;
  },

  isUnlocked: (ctx) => ctx.flags.has('tech:hunting'),

  keep(ctx) {
    const s = S(ctx);
    return { ...s, foe: null, gap: 0, recover: 0, active: 0, poison: null, brace: 0, cds: {}, challenge: false, hp: stats(ctx).maxHp };
  },

  tick(ctx, dt) {
    const s = S(ctx);
    if (s.lvl === undefined) {   // an old save: rebuild the fight level from the bosses it has beaten
      const beaten = GROUNDS.filter((g) => s.beaten.includes(g.boss.id)).length;
      s.top = beaten * LPG; s.lvl = Math.max(1, s.top); s.auto = false; s.streak = 0; s.hold = 0;
    }
    s.hold = Math.max(0, (s.hold ?? 0) - dt);
    // the colony feels its champion
    const lv = s.name ? s.level : 0;
    const troph: Record<string, number> = {};
    for (const t of s.trophies) { const d = C.trophies[t]; troph[d.mod] = (troph[d.mod] ?? 0) + d.value; }
    for (const key of ['soldierPower', 'expLoot', 'job:digger', 'job:forager', 'upkeep']) {
      const fromLevel = key === 'soldierPower' ? C.colony.soldierPower * lv : key === 'expLoot' ? C.colony.expLoot * lv : 0;
      ctx.mods.set(key, 'champion', fromLevel + (troph[key] ?? 0));
    }
    ctx.busy.champion = s.name ? Math.min(1, Math.floor(ctx.res.amt('ant'))) : 0;
    if (!s.name) return;

    for (const k of Object.keys(s.cds)) s.cds[k] = Math.max(0, s.cds[k] - dt);
    s.active = Math.max(0, s.active - dt);
    s.flash = Math.max(0, s.flash - dt);
    s.lunge = Math.max(0, s.lunge - dt);
    const st = stats(ctx);
    if (s.recover > 0) {
      s.recover -= dt * (1 + 2 * ctx.mods.get('nurseHeal'));
      if (s.recover <= 0) { s.hp = st.maxHp; ctx.log(`${s.name} is back on its feet and hunting again.`); }
      return;
    }
    const e = dt * speedMult(ctx);
    s.hp = Math.min(st.maxHp, s.hp + st.maxHp * st.regen * e);
    if (!s.foe) { s.gap -= e; if (s.gap <= 0) spawn(ctx); return; }
    const f = s.foe;
    if (tl(ctx, 'instinct') && (s.cds.bite ?? 0) <= 0) useAbility(ctx, 'bite', false);
    s.swingT += e;
    if (s.swingT >= st.swing) { s.swingT -= st.swing; s.lunge = 0.15; hit(ctx, st.atk, st); }
    if (s.poison) { f.hp -= s.poison.dps * e; s.poison.left -= e; if (s.poison.left <= 0) s.poison = null; }
    s.brace = Math.max(0, s.brace - e);
    if (f.hp <= 0) { win(ctx); return; }
    f.t += e;
    if (f.t >= f.swing) {
      f.t -= f.swing;
      const dmg = f.atk * (1 - mitigation(st.def, f.atk)) * (s.brace > 0 ? 0.25 : 1);
      s.hp -= dmg;
      if (st.traits.has('thorny')) f.hp -= dmg * 0.15;
      if (s.hp <= 0) { s.hp = 0; defeat(ctx); }
    }
  },

  panel: (() => {
    let cv: HTMLCanvasElement, status: HTMLElement, speedEl: HTMLElement, raise: ActionButton, fightBox: HTMLElement;
    let levelEl: HTMLElement, autoBtn: HTMLButtonElement, groundNote: HTMLElement, dropsNote: HTMLElement, bossBtn: HTMLButtonElement, ledger: HTMLElement, gearBox: HTMLElement, collection: HTMLElement;
    let trophyBox: HTMLElement, recentBox: HTMLElement, train: ReturnType<typeof upgradeList>;
    const hpBar = progressBar(), foeBar = progressBar(), xpBar = progressBar();
    const abil: { id: string; btn: HTMLButtonElement; cd: HTMLElement }[] = [];
    let sigGear = '';
    return {
      title: 'Hunts',
      group: 'War',
      mount(root, ctx) {
        raise = actionButton({
          ctx, label: 'Raise a champion', costs: () => C.raiseCost,
          desc: 'Pick the boldest worker and feed it well. It will hunt for the colony, and it stays with your line through every flight.',
          enabled: (c) => !S(c).name,
          onBuy: (c) => { const s = S(c); s.name = pick(C.names); s.hp = stats(c).maxHp; c.log(`${s.name} steps forward: bigger than the others, and bolder. The colony has a champion.`, 'story'); },
        });
        cv = el('canvas.viewer', { width: 320, height: 72, 'aria-label': 'Your champion fighting' }) as HTMLCanvasElement;
        status = el('p');
        speedEl = el('p.muted');
        const abRow = el('div.row.abilities');
        for (const [id, a] of Object.entries(C.abilities)) {
          const cd = el('span.cd');
          const btn = el('button.action', { type: 'button', title: a.desc }, el('span.label', {}, a.name), el('span.cost', {}, a.desc), cd) as HTMLButtonElement;
          btn.addEventListener('click', () => useAbility(ctx, id));
          abil.push({ id, btn, cd });
          abRow.append(btn);
        }
        const step = (label: string, d: number, title: string) => el('button.small.step', { type: 'button', title, onclick: () => { const s = S(ctx); s.auto = false; setLevel(ctx, (s.lvl ?? 1) + d); } }, label);
        levelEl = el('strong.fightlvl');
        autoBtn = el('button.ghost', { type: 'button', title: 'Auto climbs after a few clean wins and steps back after a loss, so the champion stays at the best level it can hold.', onclick: () => { const s = S(ctx); s.auto = !s.auto; s.streak = 0; s.hold = 0; } }) as HTMLButtonElement;
        groundNote = el('p.muted');
        dropsNote = el('p.drops');
        bossBtn = el('button.action', { type: 'button' }) as HTMLButtonElement;
        bossBtn.addEventListener('click', () => { const s = S(ctx); if (bossBtn.disabled) return; s.challenge = true; s.foe = null; s.gap = 0.5; });
        const levelRow = el('div.row.levelpick', {}, step('−10', -10, 'Down 10 levels'), step('−', -1, 'Down a level'), el('span.muted', {}, 'Fight level'), levelEl, step('+', 1, 'Up a level'), step('+10', 10, 'Up 10 levels (as far as is open)'), autoBtn);
        ledger = el('div.ledger');
        gearBox = el('div.ledger');
        collection = el('div');
        trophyBox = el('div.ledger');
        recentBox = el('div.muted');
        train = upgradeList(ctx, () => S(ctx).train, TRAIN);
        const best = el('button.ghost', { type: 'button', onclick: () => { wearBest(ctx); sigGear = ''; } }, 'Wear the best');
        foeBar.root.classList.add('foe');
        fightBox = el('div.hunt', {},
          cv, el('div.row', {}, el('span.muted', {}, 'Health'), hpBar.root, el('span.muted', {}, 'Foe'), foeBar.root),
          status, speedEl, abRow,
          el('h3', {}, 'Fight level'), levelRow, groundNote, dropsNote, el('div.row', {}, bossBtn),
          el('h3', {}, 'Champion'), ledger, el('div.row', {}, el('span.muted', {}, 'Experience'), xpBar.root),
          el('h3', {}, 'Gear'), el('p.muted', {}, 'Every foe can drop a piece of its ground\'s set. Finding a piece again levels it up. Rare pieces carry a trait.'),
          gearBox, el('div.row', {}, best),
          el('h3', {}, 'Recent finds'), recentBox,
          el('h3', {}, 'Collection'), collection,
          el('h3', {}, 'Trophies'), trophyBox,
          el('h3', {}, 'Training'), train.root,
        );
        root.append(
          el('p.flavor', {}, 'Out past the trails, things live that would eat a forager whole. Send something that bites back.'),
          el('p.muted', {}, 'Your champion hunts on its own, slowly. Use its abilities and it fights at full speed for a while. Pick a fight level: higher is harder, and pays better.'),
          el('div.row', {}, raise.root), fightBox,
        );
      },
      update(_root, ctx) {
        const s = S(ctx);
        raise.update(ctx);
        raise.root.hidden = !!s.name;
        fightBox.hidden = !s.name;
        if (!s.name) return;
        const st = stats(ctx);
        draw(cv, s, groundAt(s.lvl ?? 1));
        hpBar.set(s.hp / st.maxHp);
        foeBar.set(s.foe ? s.foe.hp / s.foe.max : 0);
        xpBar.set(s.xp / xpNeed(s.level));
        status.textContent = s.recover > 0 ? `${s.name} is recovering: back in ${Math.ceil(s.recover / ctx.speed)}s.`
          : s.foe ? `${s.name} (level ${s.level}) fights a ${s.foe.name.toLowerCase()} (level ${s.foe.lvl}${s.foe.boss ? ', boss' : ''}).`
            : `${s.name} looks for the next foe.`;
        speedEl.textContent = s.active > 0 ? `Full speed for ${Math.ceil(s.active / ctx.speed)}s more.` : `Hunting slowly on its own (${Math.round(speedMult(ctx) * 100)}% speed). Use an ability for full speed.`;
        for (const a of abil) {
          const def = C.abilities[a.id];
          const locked = s.level < def.lvl;
          a.btn.hidden = locked && s.level < def.lvl - 2;
          a.btn.disabled = locked || !fighting(ctx) || !s.foe || (s.cds[a.id] ?? 0) > 0;
          (a.btn.querySelector('.cost') as HTMLElement).textContent = locked ? `Learned at level ${def.lvl}` : def.desc;
          a.cd.style.width = `${((s.cds[a.id] ?? 0) / def.cd) * 100}%`;
        }
        // fight level
        const L = s.lvl ?? 1, g = groundAt(L), top = s.top ?? 0, cap = maxLevel(ctx);
        levelEl.textContent = String(L);
        autoBtn.textContent = s.auto ? ((s.hold ?? 0) > 0 ? `Auto: on (resting ${Math.ceil(s.hold! / ctx.speed)}s)` : 'Auto: on') : 'Auto: off';
        autoBtn.classList.toggle('on', !!s.auto);
        const nextGuard = cap;
        const guardName = isBossLevel(nextGuard) ? `the ${groundAt(nextGuard).boss.name.toLowerCase()}` : 'an elder foe';
        groundNote.textContent = `${g.name}, levels ${Math.floor((L - 1) / LPG) * LPG + 1} to ${Math.floor((L - 1) / LPG) * LPG + LPG}. ${g.flavor} ` +
          `Open up to level ${cap}: ${guardName} guards it` + (L === cap && L > top ? ' and is fighting you now.' : '.');
        // what this level drops, and what you still lack: the reason to farm a particular level
        const groundItems = Object.keys(ITEMS).filter((id) => ITEMS[id].ground === g.id && !ITEMS[id].rare);
        const have = (id: string) => { const from = id === g.boss.drop ? 'boss drop, ' : ''; return s.items[id] ? `${ITEMS[id].name} (${from}level ${s.items[id].lvl}, ${C.gear.quality[s.items[id].q].name.toLowerCase()})` : `${ITEMS[id].name} (${from}missing)`; };
        const missing = groundItems.filter((id) => !s.items[id]).length;
        const odds = Math.round(deepBonus(L) * 100);
        dropsNote.textContent = `Drops here: ${groundItems.map(have).join(' · ')}. ` +
          (missing ? `${missing} piece${missing > 1 ? 's' : ''} still to find on this ground. ` : 'Every piece found: more kills here level them up. ') +
          `Deeper into a ground gives better odds of fine and rare gear (+${odds}% here). Higher levels give more experience.`;
        const g20 = groundAt(L);
        const beat = s.beaten.includes(g20.boss.id);
        bossBtn.textContent = `Fight the ${g20.boss.name.toLowerCase()} again`;
        bossBtn.dataset.tip = 'Bosses always drop their piece, with better odds of quality.';
        bossBtn.hidden = !beat;
        bossBtn.disabled = s.challenge || !!s.foe?.boss || !fighting(ctx);
        // stats
        ledger.replaceChildren(...[
          ['Level', `${s.level} (${fmt(s.xp)} / ${xpNeed(s.level)} xp)`],
          ['Attack', `${fmt(st.atk)}, one swing every ${fmt(st.swing)}s`],
          ['Health', `${fmt(s.hp)} / ${fmt(st.maxHp)}, regains ${fmt(st.regen * 100)}%/s`],
          ['Armour', s.foe ? `${fmt(st.def)} (blocks ${Math.round(mitigation(st.def, s.foe.atk) * 100)}% of this foe's bite)` : fmt(st.def)],
          ['Critical hits', `${Math.round(st.crit * 100)}%`],
          ...(st.venom ? [['Venom', `+${fmt(st.venom)} poison per second on Sting`]] : []),
          ...(st.luck ? [['Luck', `+${Math.round(st.luck * 100)}% drops`]] : []),
          ...(st.xp ? [['Learning', `+${Math.round(st.xp * 100)}% experience`]] : []),
          ['Kills', `${s.kills} (${s.defeats} defeats)`],
          ['For the colony', `soldiers +${fmt(C.colony.soldierPower * s.level * 100)}%, expedition loot +${fmt(C.colony.expLoot * s.level * 100)}%`],
        ].map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        // gear: rebuild only when it changes
        const gsig = JSON.stringify([s.worn, s.items]);
        if (gsig !== sigGear) {
          sigGear = gsig;
          gearBox.replaceChildren(...C.gear.slots.map((slot, i) => gearRow(ctx, slot, i, () => { sigGear = ''; })));
          collection.replaceChildren(...unlockedGrounds(ctx).map((gr) => setBlock(ctx, gr.id)));
        }
        recentBox.replaceChildren(...(s.recent.length ? s.recent.map((r) => el('div', {}, r)) : [el('div', {}, 'Nothing yet.')]));
        trophyBox.replaceChildren(...(s.trophies.length ? s.trophies.map((t) => el('div', {}, el('span', {}, C.trophies[t].name), el('span.muted', {}, C.trophies[t].desc))) : [el('div', {}, el('span.muted', {}, 'Kill a ground\'s boss to bring home a trophy.'))]));
        train.update(ctx);
      },
    };
  })(),
};

function describe(id: string, o: Owned) {
  const s = itemStats(id, o);
  const parts = (Object.entries(s) as [Stat, number][]).map(([k, v]) => {
    if (k === 'speed' || k === 'crit' || k === 'luck' || k === 'xp') return `${k === 'speed' ? 'speed' : k} +${Math.round(v * 100)}%`;
    if (k === 'regen') return `regen +${+(v * 100).toFixed(1)}%/s`;
    return `${k === 'def' ? 'armour' : k} +${fmt(v)}`;
  });
  if (o.trait) parts.push(C.traits[o.trait].desc);
  return parts.join(', ');
}

function gearRow(ctx: Context, slot: Slot, i: number, changed: () => void) {
  const s = S(ctx);
  const cur = s.worn[i];
  const sel = el('select', { 'aria-label': slot }) as HTMLSelectElement;
  const other = s.worn.filter((w, j) => j !== i);
  const options = Object.keys(s.items).filter((id) => ITEMS[id].slot === slot && !other.includes(id));
  sel.append(el('option', { value: '' }, options.length ? '(nothing)' : '(nothing found yet)'));
  for (const id of options) {
    const o = s.items[id];
    sel.append(el('option', { value: id }, `${ITEMS[id].name}, ${C.gear.quality[o.q].name.toLowerCase()}, level ${o.lvl}`));
  }
  sel.value = cur ?? '';
  sel.addEventListener('change', () => { s.worn[i] = sel.value || null; changed(); });
  return el('div', {}, el('span.muted', {}, slot[0].toUpperCase() + slot.slice(1)), el('span', {}, sel, ' ', el('span.muted', {}, cur ? describe(cur, s.items[cur]) : '')));
}

function setBlock(ctx: Context, gid: string) {
  const s = S(ctx), g = groundOf(gid);
  const ids = Object.keys(ITEMS).filter((id) => ITEMS[id].ground === gid);
  const found = ids.filter((id) => s.items[id]);
  const worn = setCounts(ctx)[gid] ?? 0;
  const fmtBonus = (b: Partial<Record<Stat, number>>) => Object.entries(b).map(([k, v]) => `${k === 'def' ? 'armour' : k} +${k === 'regen' ? (v! * 100).toFixed(0) + '%/s' : Math.round(v! * 100) + '%'}`).join(', ');
  return el('div.section', {},
    el('div', {}, el('strong', {}, g.set.name), ' ', el('span.muted', {}, `Levels ${gIndex(gid) * C.levelsPerGround + 1} to ${gIndex(gid) * C.levelsPerGround + C.levelsPerGround}. ${found.length}/${ids.length} found, ${worn} worn. 3 worn: ${fmtBonus(g.set.three)}. 6 worn: ${fmtBonus(g.set.six)}.`)),
    el('div.muted', {}, ids.map((id) => s.items[id] ? `${ITEMS[id].name} (${s.items[id].lvl})` : ITEMS[id].rare ? '??? (rare find)' : '???').join(' · ')),
  );
}

// ---- the arena: flat pixels, no text ----
function draw(cv: HTMLCanvasElement, s: ChampState, g: typeof GROUNDS[number]) {
  const c = setup(cv);
  const W = cv.width, H = cv.height, floor = H - 14;
  const t = performance.now() / 1000;
  rect(c, 0, 0, W, H, g.sky);
  rect(c, 0, floor, W, H - floor, g.ground);
  for (let i = 0; i < 12; i++) rect(c, (i * 37 + 11) % W, floor + 4 + (i % 3) * 3, 3, 1, PAL.hole);
  // champion: three body segments, six legs; lunges when it bites
  const cx = 90 + (s.lunge > 0 ? 6 : 0);
  if (s.recover > 0) {
    rect(c, cx - 12, floor - 3, 22, 3, PAL.you); // lying flat
  } else {
    const bob = Math.floor(t * 6) % 2;
    rect(c, cx - 14, floor - 9 - bob, 9, 6, PAL.you);   // abdomen
    rect(c, cx - 4, floor - 9 - bob, 6, 4, PAL.you);    // thorax
    rect(c, cx + 3, floor - 11 - bob, 6, 6, PAL.you);   // head
    rect(c, cx + 9, floor - 7 - bob, 3, 2, PAL.bone);   // mandibles
    for (let k = 0; k < 3; k++) rect(c, cx - 6 + k * 4, floor - 3, 1, 3, PAL.you);
    rect(c, cx + 6, floor - 14 - bob, 1, 3, PAL.you);   // antenna
    if (s.brace > 0) rect(c, cx + 13, floor - 16, 2, 16, PAL.bone);
    if (s.active > 0) rect(c, cx - 14, floor - 13 - bob, 2, 2, PAL.seed);
  }
  // foe
  const f = s.foe;
  if (f) {
    const z = f.size, fx = 200, wob = Math.floor(t * 5) % 2;
    const col = s.flash > 0 ? PAL.bone : f.color;
    rect(c, fx, floor - z - 2 - wob, z * 2, z, col);
    rect(c, fx - Math.ceil(z / 2), floor - z - wob, Math.ceil(z / 2), Math.ceil(z * 0.7), col);
    for (let k = 0; k < 3; k++) rect(c, fx + 2 + k * Math.max(2, Math.floor(z * 0.6)), floor - 2, 1, 2, col);
    if (s.poison) for (let k = 0; k < 3; k++) rect(c, fx + ((k * 7 + Math.floor(t * 10)) % (z * 2)), floor - z - 5 - k * 2, 1, 1, PAL.food);
    if (f.boss) rect(c, fx + z - 2, floor - z - 8, 4, 2, PAL.amber);
  }
}
