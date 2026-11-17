// War: the rival colony grows, raids your nest, and you fight back.
// Raids play out as a small auto-battle at the nest entrance you can watch.
// Kills give chitin, which other systems need (techniques, chambers, fortifications).
// Campaigns send soldiers to take enemy tiles; this reads ctx.state.map and emits 'map:capture'.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, hoverTip, progressBar, type ActionButton } from '../../core/ui';
import { fmt } from '../../core/resources';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { PAL, setup } from '../../core/pixel';
import { WAR, MAP, CASTES, NEST } from '../../data/balance';
import { reworkLevel } from '../nest';
import { idleAnts } from '../jobs';
import { queenGuard } from '../brood';
import { awayOf, tilePost } from '../castes';
import { nearCamp } from '../wonders';

const B = WAR.battle;
const F = WAR.fortifications;

/** One stack per kind of ant on each side: a count, and the hit points left on the ant at the front of it. */
type Kind = 'major' | 'soldier' | 'worker' | 'queen' | 'wall' | 'mound' | 'raider' | 'brute' | 'rqueen' | 'thrall' | 'wasp';
interface Stack { kind: Kind; n: number; hp: number; max: number; atk: number; start: number; hit?: number; fell?: number }
interface Battle {
  /** How strong this raid is (threat x luck x bait), its kind, and the spoils multiplier from bait and kind. */
  lvl?: number; kind?: string; spoils?: number;
  /** ours, in the order the raiders bite them: majors, then soldiers, then rallied workers */
  us: Stack[];
  /** theirs, in the order we bite them: raiders, then brutes */
  them: Stack[];
  /** Spoil walls III: wall hit points added in front of the barricade, and the barricade's own at the start. */
  spoil?: number; barricade0?: number;
  chitin?: number; kills: number; breaches: number; soldiersLost: number; majorsLost?: number; workersLost: number; rallied: number; soldiersAtStart: number;
  rescued?: number;
  /** seconds left of the war cry */
  cry?: number;
  /** A fight at the rival's home tile against their queen (a campaign), not a raid at our entrance. */
  boss?: Boss;
  /** Wasps that followed the army home from their nest (a stronghold): not a wave, and they fly over the barricade. */
  wasps?: boolean;
  /** seconds until the next raider slips in, once nobody holds the entrance */
  slip?: number;
  t?: number;
  /** War Cairn: Last stand has been used this fight; the last trait effect to show, a counter, and seconds to the next one. */
  stood?: boolean; cfx?: 'double' | 'acid' | 'stand'; cfxN?: number; cfxT?: number;
}
/** The rival queen's fight: she makes a move every few seconds, warned of first, and changes as she weakens. */
interface Boss {
  target: number; army: number; enemy: number;
  /** seconds to her next move; the move she is winding up and seconds until it lands */
  cd: number; next?: Move; warn?: number;
  phase: number; enraged?: boolean;
  frenzy?: number; burrow?: number;
  /** the line over the field: what she is doing now */
  call?: string; callT?: number; big?: boolean;
  /** seconds left of a shake, for the screen */
  shake?: number;
  charmed?: number;
  /** the last effect to show on the field, and a counter so the screen knows it is new */
  fx?: Move | 'scream' | 'berserk' | 'death'; fxN?: number;
}
type Move = 'brood' | 'acid' | 'scent' | 'cry' | 'burrow';
interface Campaign { target: number; army: number; elapsed: number; duration: number }
type ShKind = keyof typeof WAR.strongholds.kinds;
interface WarState {
  rivalArmy: number;
  nextRaid: number;           // seconds until raiders arrive
  warned: boolean;
  battle: Battle | null;
  rallyCd: number;
  forts: Record<string, number>;
  campaign: Campaign | null;
  /** Strongholds: walls left on a termite mound under siege (by tile), and how far the antlions have undermined enemy ground (0 to sapMax). */
  siege?: Record<number, number>; sap?: number;
  raids: number;
  /** The next wave you can provoke. Each wave is harder; a clean win moves you up. */
  wave: number;
  won: number;
  rivalDefeated: boolean;
  spiderDefeated: boolean;
  lastReport: string;
  /** Refill dead soldiers and majors from idle workers. */
  replenish?: boolean;
  refill?: { soldier: number; major: number };
  /** War honours ever earned this colony (unlocks honour upgrades), honour upgrade levels, milestones reached. */
  honoured?: number;
  ups?: Record<string, number>;
  milestones?: string[];
  /** Lure the rival again as soon as it can be (after War drums). */
  autoProvoke?: boolean;
  /** Seconds until the rival raids on its own (Nov 17: raids also come unprovoked, every so often). */
  attackIn?: number;
  /** The next unprovoked raid, rolled when the clock resets: its kind and its luck (so the marching column can hint at it). */
  next?: { kind: string; luck: number };
  /** Seconds since the War tab opened this colony: threat creeps up with it. */
  warTime?: number;
  /** How hard Provoke baits the rival: light, normal or heavy. */
  bait?: string;
  /** Husk barricade health left (it regrows between raids). */
  wall?: number;
  /** Unopened spoils chests. */
  chests?: Partial<Record<ChestKind, number>>;
  /** Skulls taken, by trophy id. They work once a Hall of husks is dug. */
  skulls?: string[];
}
type ChestKind = 'common' | 'rare' | 'royal';
const S = (ctx: Context) => ctx.state.war as WarState;
const fl = (ctx: Context, id: keyof typeof F) => S(ctx).forts[id] ?? 0;
const FORTS = fromBalance(F, (ctx, needs) => !needs || ctx.flags.has(needs));
const H = WAR.honourUps;
const hl = (ctx: Context, id: keyof typeof H) => S(ctx).ups?.[id] ?? 0;
const honoured = (ctx: Context) => S(ctx).honoured ?? 0;
// honour upgrades unfold as honours come in ("honour:N" = after N honours earned)
const HONOUR_UPS = fromBalance(H, (ctx, needs) => !needs || honoured(ctx) >= Number(needs.slice(7)));
const hasMilestone = (ctx: Context, id: string) => (S(ctx).milestones ?? []).includes(id);
/** The deepest wave cleared this colony. */
const bestWave = (ctx: Context) => (S(ctx).wave ?? 1) - 1;
function giveHonours(ctx: Context, n: number) {
  const s = S(ctx);
  s.honoured = (s.honoured ?? 0) + n;
  ctx.res.add('honour', n);
}
/** Hand out every milestone the deepest wave has now reached. */
function checkMilestones(ctx: Context) {
  const s = S(ctx);
  s.milestones ??= [];
  for (const m of WAR.milestones) {
    if (bestWave(ctx) < m.wave || s.milestones.includes(m.id)) continue;
    s.milestones.push(m.id);
    if (m.id === 'maps') revealRival(ctx);
    ctx.log(`War milestone: ${m.name}. ${m.desc}`, 'story');
    ctx.announce(m.name, m.desc, { small: true, kicker: `War milestone, wave ${m.wave}` });
  }
}
function revealRival(ctx: Context) {
  for (const t of tiles(ctx)) if (t.o === 'rival') t.seen = true;
}

// ---- trophies: one skull per kind of foe, mounted in the Hall of husks ----
const hasSkull = (ctx: Context, id: string) => (S(ctx)?.skulls ?? []).includes(id);
/** A skull works once there is a Hall of husks to hang it in. */
export const skullWorks = (ctx: Context, id: string) => hasSkull(ctx, id) && (ctx.state.nest?.built?.husks ?? 0) > 0;
export const skullCount = (ctx: Context) => (S(ctx)?.skulls ?? []).length;
export function addTrophy(ctx: Context, id: string) {
  const s = S(ctx), t = WAR.trophies.find((x) => x.id === id);
  if (!s || !t || hasSkull(ctx, id)) return;
  (s.skulls ??= []).push(id);
  const hall = (ctx.state.nest?.built?.husks ?? 0) > 0;
  ctx.log(`Trophy: the ${t.name}. ${t.desc}` + (hall ? ' It hangs in the Hall of husks.' : ' Dig a Hall of husks to hang it.'), 'story');
  ctx.announce(t.name, t.desc, { small: true, kicker: 'A trophy for the Hall of husks' });
}

// ---- spoils chests ----
const chestOf = (w: number): ChestKind => (w >= WAR.chests.royalFrom ? 'royal' : w >= WAR.chests.rareFrom ? 'rare' : 'common');
function giveChest(ctx: Context, k: ChestKind, n = 1) {
  const c = (S(ctx).chests ??= {});
  c[k] = (c[k] ?? 0) + n;
}
const chestTotal = (ctx: Context) => Object.values(S(ctx).chests ?? {}).reduce((a, b) => a + (b ?? 0), 0);
function openChests(ctx: Context) {
  const s = S(ctx), C = WAR.chests, got: Record<string, number> = {};
  const scale = 1 + C.perWave * bestWave(ctx);
  const pick = (table: Record<string, [number, number]>) => {
    const lines = Object.entries(table).filter(([r]) => ctx.res.has(r));
    const [r, [lo, hi]] = lines[Math.floor(Math.random() * lines.length)];
    got[r] = (got[r] ?? 0) + (r === 'honour' ? Math.round(rand(lo, hi)) : rand(lo, hi) * scale);
  };
  const opened = chestTotal(ctx);
  for (const [k, n] of Object.entries(s.chests ?? {}) as [ChestKind, number][]) {
    const kind = C.kinds[k];
    for (let i = 0; i < n; i++) for (let j = 0; j < kind.rolls; j++) pick(Math.random() < kind.rareOdds ? C.rare : C.table);
  }
  s.chests = {};
  const lines = Object.entries(got).map(([r, v]) => {
    const n = Math.max(1, Math.round(v));
    if (r === 'honour') giveHonours(ctx, n); else ctx.res.add(r, n);
    return `+${fmt(n, true)} ${ctx.res.get(r).name.toLowerCase()}`;
  });
  ctx.log(`Opened ${opened} chest${opened > 1 ? 's' : ''}: ${lines.join(', ')}.`, 'info');
  ctx.announce(`${opened} chest${opened > 1 ? 's' : ''} opened`, '', { small: true, kicker: 'Spoils', lines });
}

// ---- the husk barricade ----
const wallMax = (ctx: Context) => F.barricade.per * fl(ctx, 'barricade');
const wallHp = (ctx: Context) => Math.min(wallMax(ctx), S(ctx).wall ?? wallMax(ctx));
/** Majors at home: the ones away carrying for expeditions (Pack mules) don't fight. */
/** Majors at the gate: not out with a party, and not posted elsewhere (see Castes). */
const majors = (ctx: Context) => Math.max(0, (ctx.state.jobs?.assigned?.major ?? 0) - (ctx.busy['job:major'] ?? 0) - awayOf(ctx, 'major'));
/** Fighting strength in soldier-equivalents: a major counts as several soldiers. */
const soldiers = (ctx: Context) => (ctx.state.jobs?.assigned?.soldier ?? 0) + majors(ctx) * CASTES.major.atk * (1 + ctx.mods.get('majorAtk'));
const power = (ctx: Context) => 1 + ctx.mods.get('soldierPower');
const defence = (ctx: Context) => ctx.mods.get('defence');
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const tiles = (ctx: Context) => (ctx.state.map?.tiles ?? []) as { t: string; o: string | null; seen: boolean; core?: boolean; sh?: ShKind }[];
const rivalTiles = (ctx: Context) => Math.max(1, tiles(ctx).filter((t) => t.o === 'rival').length);
const waveOf = (ctx: Context) => S(ctx).wave ?? 1;
// ---- threat (Nate, Nov 17): raids are an ongoing pressure, not a ladder you climb ----
// A raid's strength comes from the colony's threat (its size, plus a slow creep with time), a roll of luck, and the bait.
const T = WAR.threat;
const builtChambers = (ctx: Context) => Object.values((ctx.state.nest?.built ?? {}) as Record<string, number>).reduce((a, n) => a + (n || 0), 0);
export function threat(ctx: Context) {
  const s = S(ctx);
  const size = Math.max(0, ctx.res.amt('ant') / T.perWorkers + builtChambers(ctx) / T.perChambers - T.offset);
  return (1 + size + ((s.warTime ?? 0) / 3600) * T.perHour) * (s.rivalDefeated ? T.wanderers : 1);
}
const threatWord = (t: number) => T.words.reduce((w, [at, name]) => (t >= at ? name : w), T.words[0][1]);
function rollKind(ctx: Context) {
  const t = threat(ctx), ks = Object.entries(WAR.raidKinds).filter(([, k]) => t >= k.from);
  let r = Math.random() * ks.reduce((a, [, k]) => a + k.weight, 0);
  for (const [id, k] of ks) { r -= k.weight; if (r <= 0) return id; }
  return 'plain';
}
const rollLuck = () => 1 - T.luck + Math.random() * 2 * T.luck;
const waveComp = (w: number) => ({
  raiders: Math.min(WAR.maxRaiders, Math.round(B.wave.base + w * B.wave.perWave)),
  brutes: Math.floor(w / B.wave.bruteEvery),
});
/** The wave as it arrives: minims in the rival's walls (a caste post) thin it out. */
const raidComp = (ctx: Context, lvl = threat(ctx), kind = 'plain') => {
  const c = waveComp(lvl), k = WAR.raidKinds[kind] ?? WAR.raidKinds.plain, m = Math.max(0.5, 1 + ctx.mods.get('raidSize'));
  const raiders = Math.min(k.cap ?? WAR.maxRaiders, Math.round(c.raiders * k.raiders * m));
  return { raiders: Math.max(1, raiders), brutes: Math.max(k.brutes > 1 ? 1 : 0, Math.round(c.brutes * k.brutes * m)) };
};
const toughness = (w: number) => Math.pow(B.wave.toughness, w - 1);
const describeRaid = (ctx: Context, lvl: number, kind = 'plain') => { const c = raidComp(ctx, lvl, kind), w = lvl * (WAR.raidKinds[kind]?.tough ?? 1); return `${c.raiders} raiders` + (c.brutes ? ` and ${c.brutes} brute${c.brutes > 1 ? 's' : ''}` : '') + (w > 1 ? `, each ${Math.round((toughness(w) - 1) * 100)}% tougher` : ''); };


/** Fighters died: take them off their jobs, and queue them for refilling from idle if that's on. */
function loseFighters(ctx: Context, n: number) {
  const a = ctx.state.jobs?.assigned as Record<string, number> | undefined;
  if (!a || n <= 0) return;
  const plain = Math.min(n, a.soldier ?? 0);
  const big = Math.min(n - plain, a.major ?? 0);
  a.soldier = (a.soldier ?? 0) - plain;
  if (big) a.major -= big;
  const s = S(ctx);
  if (s.replenish) {
    s.refill ??= { soldier: 0, major: 0 };
    s.refill.soldier += plain; s.refill.major += big;
    refill(ctx);
  }
}
/** Move idle workers back into the soldier and major jobs, up to the number that died. */
function refill(ctx: Context) {
  const s = S(ctx), r = s.refill, a = ctx.state.jobs?.assigned as Record<string, number> | undefined;
  if (!s.replenish || !r || !a) return;
  for (const job of ['soldier', 'major'] as const) {
    const n = Math.max(0, Math.min(r[job], Math.floor(idleAnts(ctx))));
    a[job] = (a[job] ?? 0) + n;
    r[job] -= n;
  }
}

/** The end of a fight: a small banner over the page, like the new-age one but lighter. */
function showResult(ctx: Context, kicker: string, r: { win: boolean; title: string; lines: string[] }) {
  ctx.announce(r.title, '', { small: true, kicker, lines: r.lines, loss: !r.win });
  ctx.ping('war');
}

// ---- the entrance battle ----
// No lanes and no ranks: each kind of ant is one stack. Every ant in a stack bites, every second,
// and the bites land on the enemy's first stack, killing its ants one at a time.
const stack = (kind: Kind, n: number, hp: number, atk: number): Stack => ({ kind, n, hp, max: hp, atk, start: n });
/** Our fighters as battle stacks: majors in front, then soldiers. */
function army(ctx: Context): Stack[] {
  const hp = B.soldier.hp * (1 + F.carapace.per * fl(ctx, 'carapace'));
  const plain = ctx.state.jobs?.assigned?.soldier ?? 0, us: Stack[] = [];
  if (majors(ctx)) us.push(stack('major', majors(ctx), hp * CASTES.major.hp * (1 + ctx.mods.get('majorHp')), B.soldier.atk * CASTES.major.atk * (1 + ctx.mods.get('majorAtk'))));
  if (plain) us.push(stack('soldier', plain, hp, B.soldier.atk));
  return us;
}
const rollAttack = () => WAR.attack.every[0] + Math.random() * (WAR.attack.every[1] - WAR.attack.every[0]);
function startBattle(ctx: Context, how: { kind: string; luck: number; bait?: string } = { kind: rollKind(ctx), luck: rollLuck(), bait: S(ctx).bait }) {
  const s = S(ctx);
  s.attackIn = rollAttack(); // any raid, provoked or not, resets the clock to the next unprovoked one
  s.next = { kind: rollKind(ctx), luck: rollLuck() };
  const K = WAR.raidKinds[how.kind] ?? WAR.raidKinds.plain, bait = WAR.bait[how.bait ?? 'normal'] ?? WAR.bait.normal;
  const lvl = Math.max(1, threat(ctx) * how.luck * bait.size);
  const comp = raidComp(ctx, lvl, how.kind);
  const tough = toughness(lvl) * K.tough;
  const plain = ctx.state.jobs?.assigned?.soldier ?? 0;
  const us: Stack[] = [];
  if (wallHp(ctx) > 0) { const w = stack('wall', 1, wallMax(ctx), 0); w.hp = wallHp(ctx); us.push(w); }
  // Spoil walls III: the soil walls stand in front and take the first bites (they share the barricade's stack)
  const nest = ctx.state.nest as { walls?: number } | undefined;
  const spoil = reworkLevel(ctx, 'storeroom') >= 3 ? Math.floor((nest?.walls ?? 0) * NEST.rw.wallHp) : 0;
  const barricade0 = us[0]?.kind === 'wall' ? us[0].hp : 0;
  if (spoil > 0) { if (us[0]?.kind === 'wall') { us[0].hp += spoil; us[0].max += spoil; } else us.push(stack('wall', 1, spoil, 0)); }
  // a manned termite mound stands in front of everything: fresh walls every raid, and the garrison bites from them
  if (manned(ctx, 'termite')) us.unshift(stack('mound', 1, SK.termite.moundHp, SK.termite.moundAtk));
  us.push(...army(ctx));
  // Silk crown: some nurses come to the entrance and fight as workers
  const nurses = Math.floor((ctx.state.jobs?.assigned?.nurse ?? 0) * ctx.mods.get('nurseGuard'));
  if (nurses > 0) us.push(stack('worker', nurses, B.worker.hp, B.worker.atk));
  const them: Stack[] = [stack('raider', comp.raiders, B.raider.hp * tough, B.raider.atk * tough)];
  if (comp.brutes) them.push(stack('brute', comp.brutes, B.brute.hp * tough, B.brute.atk * tough));
  s.battle = { us, them, kills: 0, breaches: 0, soldiersLost: 0, majorsLost: 0, workersLost: 0, rallied: 0, soldiersAtStart: plain + majors(ctx), t: 0, spoil, barricade0, lvl, kind: how.kind, spoils: bait.spoils * K.spoils };
  ctx.log(`${K.name}${how.bait && how.bait !== 'normal' ? ` (${bait.name.toLowerCase()})` : ''}: ${comp.raiders + comp.brutes} of them pour toward the entrance. ${K.desc}`, 'warn');
  if (autoCry(ctx) || ctx.mods.get('fierceGuards') > 0) warCry(ctx);
}

/** Standing alarm (or the accord's standing orders): the war cry sounds by itself whenever it is ready. */
const autoCry = (ctx: Context) => fl(ctx, 'alarm') > 0 || ctx.flags.has('accord:alarm');
/** The war cry: every fighter bites harder for a few seconds, then it needs time to come back. */
const cryTime = (ctx: Context) => B.warCry.time * (skullWorks(ctx, 'raider') ? 2 : 1);
function warCry(ctx: Context) {
  const s = S(ctx);
  if (!s.battle || s.rallyCd > 0) return;
  if (WAR.raidKinds[s.battle.kind ?? '']?.noCry) return; // a night raid: nobody hears the cry in the dark
  s.rallyCd = B.warCry.cooldown;
  s.battle.cry = cryTime(ctx);
  ctx.log('The war cry goes up. Every fighter bites harder.', 'info');
}

const alive = (xs: Stack[]) => xs.filter((x) => x.n > 0);
/** Bite a stack: damage runs through its ants one after another. Returns how many died. */
function bite(x: Stack, dmg: number) {
  let dead = 0;
  if (dmg > 0) x.hit = 0.25;
  while (dmg > 0 && x.n > 0) {
    if (dmg >= x.hp) { dmg -= x.hp; x.n--; dead++; x.hp = x.max; } else { x.hp -= dmg; dmg = 0; }
  }
  if (dead) x.fell = 0.5;
  return dead;
}
/** Spread damage down a side: the first stack takes it all until it is gone, then the next. */
function biteSide(xs: Stack[], dmg: number, onDeath: (x: Stack, n: number) => void) {
  for (const x of alive(xs)) {
    if (dmg <= 0) break;
    const pool = x.hp + (x.n - 1) * x.max; // everything this stack can still take
    const take = Math.min(dmg, pool);
    dmg -= take;
    const d = bite(x, take);
    if (d) onDeath(x, d);
  }
}

function stepBattle(ctx: Context, dt: number) {
  const s = S(ctx), b = s.battle!;
  // the queen's fight plays out slower, everything in it alike, so it lasts longer at the same difficulty
  if (b.boss) dt *= WAR.rivalQueen.slow;
  b.t = (b.t ?? 0) + dt;
  for (const x of [...b.us, ...b.them]) { x.hit = Math.max(0, (x.hit ?? 0) - dt); x.fell = Math.max(0, (x.fell ?? 0) - dt); }
  if (b.boss) bossStep(ctx, b, dt);
  const P = B.pace * dt;
  // away from home (the rival queen's fight) there are no thorns and no walls
  const blunt = b.boss ? 1 : Math.max(0.2, 1 - F.thorns.per * fl(ctx, 'thorns'));
  const ours = alive(b.us), theirs = alive(b.them);
  // the walls (nest defence) bite whoever is in front, all fight long
  const towers = b.boss ? 0 : defence(ctx) * B.defenceDps * (1 + F.spitters.per * fl(ctx, 'spitters'));
  b.cry = Math.max(0, (b.cry ?? 0) - dt);
  const cry = b.cry > 0 ? 1 + B.warCry.boost : 1;
  // War Cairn: serrated mandibles strike twice now and then, acid splashes onto the group behind
  const dbl = ctx.mods.get('cairnDouble'), acid = ctx.mods.get('cairnAcid');
  const fighters = (x: Stack) => x.kind === 'major' || x.kind === 'soldier';
  const fightDmg = ours.reduce((t, x) => t + (fighters(x) ? x.n * x.atk * power(ctx) * cry * (1 + dbl) : 0), 0);
  const outDmg = ours.reduce((t, x) => t + (fighters(x) ? 0 : x.n * x.atk * (x.kind === 'worker' ? 1 : power(ctx)) * (x.kind === 'wall' || x.kind === 'mound' ? 1 : cry)), 0) + fightDmg + towers;
  if ((dbl || acid) && fightDmg > 0) {
    b.cfxT = (b.cfxT ?? 1) - dt;
    if (b.cfxT <= 0) { b.cfxT = 1.2 + Math.random(); b.cfx = acid && (!dbl || Math.random() < 0.5) ? 'acid' : 'double'; b.cfxN = (b.cfxN ?? 0) + 1; }
  }
  const fr = b.boss?.frenzy ? 2 : 1;
  // War Cairn: chitin plates soften the bites on our fighters (not the barricade)
  const front = alive(b.us)[0];
  const plated = front && (front.kind === 'major' || front.kind === 'soldier') ? 1 - ctx.mods.get('cairnPlates') : 1;
  // Clay crown: a narrow door lets only so many of them bite at once (not in the rival queen's fight)
  let door = b.boss ? 0 : ctx.mods.get('narrowDoor');
  const inDmg = theirs.reduce((t, x) => { let n = x.n; if (door > 0) { n = Math.min(n, door); door -= n; if (door <= 0) door = -1; } else if (door < 0) n = 0; return t + n * x.atk * (x.kind === 'raider' || x.kind === 'brute' ? fr : 1); }, 0) * blunt * plated;
  // while she is burrowed our bites can't reach her, only her guard
  const targets = b.boss?.burrow ? b.them.filter((x) => x.kind !== 'rqueen') : b.them;
  biteSide(targets, outDmg * P, (x, n) => {
    if (x.kind === 'thrall') { b.soldiersLost += n; return; }
    b.kills += n;
    b.chitin = (b.chitin ?? 0) + n * (x.kind === 'brute' ? B.brute.chitin * (skullWorks(ctx, 'brute') ? 2 : 1) : B.raider.chitin);
    if (x.kind === 'raider' || x.kind === 'brute') addTrophy(ctx, x.kind);
  });
  if (acid && fightDmg > 0) {
    const behind = alive(targets)[1];
    if (behind) biteSide([behind], fightDmg * acid * P, (x, n) => {
      if (x.kind === 'thrall') { b.soldiersLost += n; return; }
      b.kills += n;
      b.chitin = (b.chitin ?? 0) + n * (x.kind === 'brute' ? B.brute.chitin * (skullWorks(ctx, 'brute') ? 2 : 1) : B.raider.chitin);
    });
  }
  if (ours.length) {
    // rallied workers carry the fallen home: each one at the entrance makes a rescue likelier
    const carriers = b.us.find((x) => x.kind === 'worker')?.n ?? 0;
    const save = Math.min(B.rescueMax, carriers * B.rescuePerWorker);
    biteSide(b.us, inDmg * P, (x, n) => {
      if (x.kind === 'mound') { ctx.log('The raiders break through the termite mound.', 'warn'); return; }
      if (x.kind === 'wall') { ctx.log('The husk barricade gives way.', 'warn'); return; }
      if (x.kind === 'worker') { b.workersLost += n; return; }
      if (x.kind === 'queen') { ctx.log('The queen is driven back into the royal chamber, hurt but alive.', 'warn'); return; }
      let saved = 0;
      for (let i = 0; i < n; i++) if (Math.random() < save) saved++;
      b.rescued = (b.rescued ?? 0) + saved;
      if (x.kind === 'major') b.majorsLost = (b.majorsLost ?? 0) + n; else b.soldiersLost += n;
    });
  } else if (ctx.mods.get('cairnStand') > 0 && !b.stood && b.us.some((x) => (x.kind === 'major' || x.kind === 'soldier') && x.start > 0)) {
    // Last stand (War Cairn epic): once a fight, half of the fallen get back up
    b.stood = true;
    let up = 0;
    for (const x of b.us) {
      if (x.kind !== 'major' && x.kind !== 'soldier') continue;
      const back = Math.ceil(x.start / 2);
      x.n = back; x.hp = x.max; up += back;
      if (x.kind === 'major') b.majorsLost = Math.max(0, (b.majorsLost ?? 0) - back); else b.soldiersLost = Math.max(0, b.soldiersLost - back);
    }
    b.cfx = 'stand'; b.cfxN = (b.cfxN ?? 0) + 1;
    ctx.log(`Last stand. As the line breaks, ${up} of the fallen get back up and fight on.`, 'story');
    if (b.boss) say(b.boss, 'LAST STAND', true, 3);
  } else if (b.boss) {
    endBoss(ctx, false); return;
  } else if (queenGuard(ctx) > 0 && !b.us.some((x) => x.kind === 'queen')) {
    // Chitin plates: with the line gone, the armoured queen comes out to fight
    b.us.push(stack('queen', 1, queenGuard(ctx), B.queenAtk));
    ctx.log('The line is gone. The queen herself comes to the entrance, armoured in raider chitin.', 'warn');
  } else {
    // nobody holds the entrance: they slip in one by one while the walls keep biting
    b.slip = (b.slip ?? B.slipEvery) - dt;
    if (b.slip <= 0) {
      b.slip = B.slipEvery;
      const x = alive(b.them)[0];
      if (x) { x.n--; x.hp = x.max; b.breaches++; }
    }
  }
  if (b.boss && !b.them.find((x) => x.kind === 'rqueen')?.n) endBoss(ctx, true);
  else if (!alive(b.them).length) endBattle(ctx);
}

function endBattle(ctx: Context) {
  const s = S(ctx), b = s.battle!;
  s.battle = null;
  if (b.wasps) { endWasps(ctx, b); return; }
  s.raids++;
  const wall = b.us.find((x) => x.kind === 'wall');
  if (b.spoil) { // the spoil walls took the first bites: whatever is left of them goes back to the nest
    const left = wall && wall.n > 0 ? wall.hp : 0, lost = (b.spoil + (b.barricade0 ?? 0)) - left, spoilLeft = Math.max(0, b.spoil - lost);
    const nest = ctx.state.nest as { walls?: number } | undefined;
    if (nest) nest.walls = spoilLeft / NEST.rw.wallHp;
    if (wall && b.barricade0) s.wall = Math.max(0, left - spoilLeft);
  } else if (wall) s.wall = wall.n > 0 ? wall.hp : 0;
  // losses are capped so a raid hurts but never ruins you
  // soldiers being carried in when the fight ends make it home too
  const fell = b.soldiersLost + (b.majorsLost ?? 0);
  const rescued = Math.min(fell, b.rescued ?? 0);
  const medics = Math.max(0.2, 1 + H.medics.per * hl(ctx, 'medics'));
  const soldierLoss = Math.min(fell - rescued, Math.ceil(b.soldiersAtStart * B.maxSoldierLoss * medics));
  const workerLoss = Math.min(b.workersLost, 2);
  const lost = soldierLoss + workerLoss;
  if (lost) {
    ctx.res.add('ant', -lost);
    ctx.bus.emit('war:fallen', { n: lost });
    // the dead come off their jobs: majors in the share they fell
    const bigs = fell ? Math.round(soldierLoss * (b.majorsLost ?? 0) / fell) : 0;
    loseFighters(ctx, soldierLoss - bigs);
    const a = ctx.state.jobs?.assigned as Record<string, number> | undefined;
    if (a && bigs) { const k = Math.min(bigs, a.major ?? 0); a.major -= k; if (S(ctx).replenish) { S(ctx).refill ??= { soldier: 0, major: 0 }; S(ctx).refill!.major += k; } }
  }
  const stealShare = Math.min(B.maxSteal, b.breaches * B.stealPerBreach) * Math.max(0.2, 1 + F.plug.per * fl(ctx, 'plug'));
  const stolen = ctx.mods.get('noSteal') > 0 ? 0 : ctx.res.amt('food') * Math.min(0.9, stealShare * (1 + ctx.mods.get('stealMult')));
  ctx.res.add('food', -stolen);
  const clean = !b.breaches;
  const w = b.lvl ?? threat(ctx), sp = b.spoils ?? 1;
  const chitin = Math.round(((b.chitin ?? 0) + (clean ? w * B.wave.clearBonus * sp : 0)) * (1 + H.harvest.per * hl(ctx, 'harvest')));
  const honours = clean ? Math.max(1, Math.round((WAR.honours.perWave + Math.floor(w / 5) * WAR.honours.perFive) * (hasMilestone(ctx, 'endless') ? 2 : 1) * sp)) : 0;
  if (chitin) ctx.res.add('chitin', chitin);
  s.rivalArmy = Math.max(5, s.rivalArmy - b.kills);
  const parts = [`${b.kills} raiders killed (+${chitin} chitin)`];
  if (b.breaches) parts.push(`${b.breaches} got in and stole ${fmt(stolen)} food`);
  if (lost) parts.push(`${lost} of ours fell`);
  if (rescued) parts.push(`${rescued} wounded carried home`);
  const chest = clean && sp >= 1 ? chestOf(w) : null; // light bait brings no chest
  if (chest) { giveChest(ctx, chest); parts.push(`A ${WAR.chests.kinds[chest].name.toLowerCase()} is carried in`); }
  // s.wave now counts raids repelled (plus one): milestones and research read it
  if (clean) { s.won++; s.wave = waveOf(ctx) + 1; ctx.bus.emit('war:won', { wave: w }); giveHonours(ctx, honours); parts.push(`+${honours} honour${honours > 1 ? 's' : ''}`); parts.push(`Raid repelled (${s.wave - 1} so far)`); }
  s.lastReport = parts.join('. ') + '.';
  const lines = [`${b.kills} raiders killed`, `+${chitin} chitin`];
  if (honours) lines.push(`+${honours} war honour${honours > 1 ? 's' : ''}`);
  if (soldierLoss) lines.push(`${soldierLoss} soldier${soldierLoss > 1 ? 's' : ''} fell`);
  if (workerLoss) lines.push(`${workerLoss} worker${workerLoss > 1 ? 's' : ''} fell`);
  if (rescued) lines.push(`${rescued} wounded carried home`);
  if (b.breaches) lines.push(`${b.breaches} got in and stole ${fmt(stolen)} food`);
  if (chest) lines.push(`A ${WAR.chests.kinds[chest].name.toLowerCase()}`);
  lines.push(`${WAR.raidKinds[b.kind ?? 'plain']?.name ?? 'A raid'}, threat ${fmt(w)}`);
  showResult(ctx, 'The raid', { win: clean, title: clean ? 'Victory' : 'They got through', lines });
  ctx.log((b.breaches ? 'The raid is over. ' : 'The raid is broken at the entrance. ') + s.lastReport, b.breaches ? 'warn' : 'story');
  s.nextRaid = WAR.provokeCooldown * Math.max(0.2, 1 + H.regroup.per * hl(ctx, 'regroup'));
  if (clean) checkMilestones(ctx);
}

// ---- campaigns ----
// ---- strongholds: three rare fortress tiles, each with its own catch (see WAR.strongholds) ----
const SK = WAR.strongholds.kinds;
/** An untaken stronghold on this tile, if any. */
const strongholdAt = (ctx: Context, i: number): ShKind | undefined => { const t = tiles(ctx)[i]; return t?.sh && t.o !== 'you' ? t.sh : undefined; };
/** Is the stronghold of this kind ours and manned by majors (the Garrison post)? */
const manned = (ctx: Context, kind: ShKind) => ((ctx.state.castes?.forts ?? []) as number[]).some((i) => tiles(ctx)[i]?.sh === kind && tiles(ctx)[i].o === 'you');
const bridgeBeside = (ctx: Context, i: number) => {
  const x = i % MAP.cols, y = Math.floor(i / MAP.cols);
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < MAP.cols && y + dy < MAP.rows && tilePost(ctx, 'bridge', (y + dy) * MAP.cols + x + dx) === 'there');
};
const wallsLeft = (ctx: Context, i: number) => S(ctx).siege?.[i] ?? SK.termite.walls;
function enemyStrength(ctx: Context, i: number) {
  const t = tiles(ctx)[i];
  const sh = strongholdAt(ctx, i);
  if (sh) return sh === 'termite' ? wallsLeft(ctx, i) : SK[sh].power;
  const sap = 1 - (S(ctx).sap ?? 0); // manned antlion pits undermine enemy ground
  if (t.o === 'spider') return WAR.spiderPower * (t.core ? 1.5 : 0.6) * sap;
  if (t.o === 'rival') return ((S(ctx).rivalArmy / rivalTiles(ctx)) * (t.core ? 3 : 1) * WAR.tileDefence.rival + 4) * sap;
  return Infinity;
}
const adjacentToYou = (ctx: Context, i: number) => {
  const x = i % MAP.cols, y = Math.floor(i / MAP.cols), T = tiles(ctx);
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
    const nx = x + dx, ny = y + dy;
    return nx >= 0 && ny >= 0 && nx < MAP.cols && ny < MAP.rows && (T[ny * MAP.cols + nx].o === 'you' || tilePost(ctx, 'bridge', ny * MAP.cols + nx) === 'there');
  });
};
const validTarget = (ctx: Context, i: number | null) => {
  if (i == null) return false;
  const t = tiles(ctx)[i];
  return !!t && t.seen && (t.o === 'rival' || t.o === 'spider' || !!strongholdAt(ctx, i)) && (adjacentToYou(ctx, i) || nearCamp(ctx, i));
};

/** The share of an army lost on a campaign or assault: a third less with the rival queen's skull. */
export const lossMult = (ctx: Context) => (skullWorks(ctx, 'queen') ? 2 / 3 : 1);
function finishCampaign(ctx: Context) {
  const s = S(ctx), c = s.campaign!;
  s.campaign = null;
  const t = tiles(ctx)[c.target];
  if (strongholdAt(ctx, c.target)) { assaultStronghold(ctx, c); return; }
  const enemy = enemyStrength(ctx, c.target);
  if (t.core && t.o === 'rival') { startBoss(ctx, c.target, enemy); return; }
  const ours = c.army * power(ctx) * rand(0.85, 1.15);
  const win = ours >= enemy;
  const lost = Math.min(c.army, Math.ceil(c.army * WAR.campaignLoss * lossMult(ctx) * (win ? 1 : 2)));
  ctx.res.add('ant', -lost);
  loseFighters(ctx, lost);
  if (!win) { ctx.log(`The campaign fails. ${lost} soldiers do not return.`, 'warn'); showResult(ctx, 'The campaign', { win: false, title: 'Defeat', lines: ['The tile holds', `${lost} soldiers fell`] }); return; }
  const owner = t.o!;
  const loot = WAR.loot[owner] ?? {};
  const got = Object.entries(loot).map(([r, [lo, hi]]) => { const n = Math.round(rand(lo, hi) * (t.core ? 4 : 1) * (hasMilestone(ctx, 'spoils') ? 2 : 1)); ctx.res.add(r, n); return `${n} ${r}`; });
  if (owner === 'rival') s.rivalArmy = Math.max(5, s.rivalArmy - enemy * 0.5);
  if (s.sap) { s.sap = 0; got.push('the antlions start digging again'); }
  if (t.core) giveChest(ctx, 'royal');
  const hon = WAR.honours.campaign * (t.core ? 3 : 1);
  giveHonours(ctx, hon);
  got.push(`${hon} war honours`);
  ctx.bus.emit('map:capture', { x: c.target % MAP.cols, y: Math.floor(c.target / MAP.cols) });
  ctx.log(`Victory. The tile is ours, with ${got.join(', ')}. ${lost} soldiers fell.`);
  showResult(ctx, 'The campaign', { win: true, title: 'Victory', lines: ['The tile is ours', ...got.map((g) => '+' + g), ...(lost ? [`${lost} soldiers fell`] : [])] });
  if (t.core && owner === 'spider') { addTrophy(ctx, 'spider'); s.spiderDefeated = true; ctx.flags.add('spider:defeated'); ctx.log('The spider is dead. Its web hangs empty in the wind.'); }
}

/** A march on a stronghold. Each kind has its own catch. */
function assaultStronghold(ctx: Context, c: Campaign) {
  const s = S(ctx), kind = strongholdAt(ctx, c.target)!, K = SK[kind], lines: string[] = [];
  let army = c.army, pit = 0;
  if (kind === 'antlion' && !bridgeBeside(ctx, c.target)) { pit = Math.min(army, SK.antlion.pit); army -= pit; lines.push(`${pit} soldiers slid into the pits`); }
  if (kind === 'antlion' && !pit) lines.push('The living bridge carried the army over the pits');
  const ours = army * power(ctx) * rand(0.85, 1.15);
  let win: boolean;
  if (kind === 'termite') {
    const left = Math.max(0, wallsLeft(ctx, c.target) - ours);
    (s.siege ??= {})[c.target] = left;
    win = left <= 0;
    if (!win) lines.push(`The walls are cracked: ${Math.round((left / SK.termite.walls) * 100)}% still stands`);
  } else win = ours >= (K as { power: number }).power;
  const lost = Math.min(c.army, pit + Math.ceil(army * WAR.campaignLoss * lossMult(ctx) * (win || kind === 'termite' ? 1 : 2)));
  ctx.res.add('ant', -lost);
  loseFighters(ctx, lost);
  if (lost) lines.push(`${lost} soldiers fell`);
  if (win) {
    if (s.siege) delete s.siege[c.target];
    giveHonours(ctx, WAR.strongholds.honours);
    ctx.bus.emit('map:capture', { x: c.target % MAP.cols, y: Math.floor(c.target / MAP.cols) });
    ctx.log(`${K.name} taken. Post 2 majors there on the Map to put it to work. +${WAR.strongholds.honours} war honours.`, 'story');
    showResult(ctx, K.name, { win: true, title: 'The stronghold falls', lines: [`+${WAR.strongholds.honours} war honours`, 'Man it with 2 majors to use it', ...lines] });
  } else {
    ctx.log(kind === 'termite' ? `The army comes home from the termite mound. ${lines.join('. ')}.` : `The assault on the ${K.name.toLowerCase()} fails. ${lines.join('. ')}.`, 'warn');
    showResult(ctx, K.name, { win: kind === 'termite', title: kind === 'termite' ? 'The siege goes on' : 'Thrown back', lines });
  }
  if (kind === 'wasp') startWasps(ctx, win);
}
/** The wasps follow the army home: a fight at the entrance with no barricade in the way. */
function startWasps(ctx: Context, last: boolean) {
  const s = S(ctx), W = SK.wasp;
  if (s.battle) return;
  const us = army(ctx);
  s.battle = { us, them: [stack('wasp', W.swarm, W.hp, W.atk)], kills: 0, breaches: 0, soldiersLost: 0, majorsLost: 0, workersLost: 0, rallied: 0,
    soldiersAtStart: us.reduce((t, x) => t + x.n, 0), t: 0, wasps: true };
  ctx.log(last ? 'The last of the wasps follow the army home, flying over the barricade.' : 'Wasps follow the army home, flying over the barricade.', 'warn');
  ctx.announce('Wasps', 'They followed the army home and came in over the barricade. Watch the fight on the War tab.', { small: true, kicker: 'The wasp nest' });
  if (autoCry(ctx) || ctx.mods.get('fierceGuards') > 0) warCry(ctx);
  ctx.ping('war');
}
function endWasps(ctx: Context, b: Battle) {
  const fell = b.soldiersLost + (b.majorsLost ?? 0);
  const soldierLoss = Math.min(fell, Math.ceil(b.soldiersAtStart * B.maxSoldierLoss));
  const workerLoss = Math.min(b.workersLost + b.breaches, 4);
  const lost = soldierLoss + workerLoss;
  if (lost) {
    ctx.res.add('ant', -lost);
    ctx.bus.emit('war:fallen', { n: lost });
    const bigs = fell ? Math.round(soldierLoss * (b.majorsLost ?? 0) / fell) : 0;
    loseFighters(ctx, soldierLoss - bigs);
    const a = ctx.state.jobs?.assigned as Record<string, number> | undefined;
    if (a && bigs) a.major = Math.max(0, (a.major ?? 0) - bigs);
  }
  const chitin = b.kills * B.brute.chitin;
  if (chitin) ctx.res.add('chitin', chitin);
  const lines = [`${b.kills} wasps killed`, ...(chitin ? [`+${chitin} chitin`] : []), ...(soldierLoss ? [`${soldierLoss} soldiers fell`] : []), ...(workerLoss ? [`${workerLoss} workers stung`] : [])];
  ctx.log(`The wasps are gone. ${lines.join(', ')}.`, b.breaches ? 'warn' : 'story');
  showResult(ctx, 'The wasps', { win: !b.breaches, title: b.breaches ? 'They got in' : 'Driven off', lines });
}

// ---- the rival queen: her home tile is a fight on the battle screen ----
function startBoss(ctx: Context, target: number, enemy: number) {
  const s = S(ctx), Q = WAR.rivalQueen, us = army(ctx);
  const n = us.reduce((t, x) => t + x.n, 0);
  if (!n) { ctx.log('Nobody is left to march on the rival mound. The campaign is called off.', 'warn'); return; }
  const them = [stack('raider', Math.max(1, Math.round(enemy * Q.guard)), B.raider.hp, B.raider.atk), stack('rqueen', 1, enemy * Q.hp, Q.atk + enemy * Q.atkPer)];
  s.battle = { us, them, kills: 0, breaches: 0, soldiersLost: 0, majorsLost: 0, workersLost: 0, rallied: 0, soldiersAtStart: n, t: 0,
    boss: { target, army: n, enemy, cd: Q.every, phase: 0, call: 'The rival queen rises from her chamber.', callT: 4, big: true, shake: 0.6 } };
  ctx.log('The army breaks into the rival mound. Their queen waits in the deepest chamber, ringed by her guard.', 'warn');
  ctx.announce('The rival queen', 'Your army is inside her mound. Watch the fight on the War tab.', { small: true, kicker: 'Campaign' });
  if (autoCry(ctx) || ctx.mods.get('fierceGuards') > 0) warCry(ctx);
  ctx.ping('war');
}
const MOVES: Record<Move, { warn: string; hit: string }> = {
  brood:  { warn: 'She arches her back. Eggs are splitting in the dark…', hit: 'Royal brood! Fresh guards hatch around her.' },
  acid:   { warn: 'She raises her gaster high…', hit: 'Acid rain! It sprays over every one of us.' },
  scent:  { warn: 'A sweet, wrong smell spreads through the chamber…', hit: 'Queen\'s scent! Some of ours turn and fight for her.' },
  cry:    { warn: 'She drums the floor with her legs…', hit: 'War cry! Her guard bites twice as hard.' },
  burrow: { warn: 'She digs her claws into the floor…', hit: 'She burrows! Nothing can reach her.' },
};
const say = (bs: Boss, text: string, big = false, t = 2.5) => { bs.call = text; bs.callT = t; bs.big = big; };
/** Bite one of our groups directly (her acid): the dead are counted like any other fallen. */
function hurt(b: Battle, x: Stack, dmg: number) {
  const n = bite(x, Math.min(dmg, x.hp + (x.n - 1) * x.max));
  if (x.kind === 'major') b.majorsLost = (b.majorsLost ?? 0) + n; else if (x.kind !== 'worker') b.soldiersLost += n;
}
function bossMove(b: Battle, m: Move) {
  const bs = b.boss!, Q = WAR.rivalQueen, E = bs.enemy;
  const guards = () => { let g = b.them.find((x) => x.kind === 'raider'); if (!g) { g = stack('raider', 0, B.raider.hp, B.raider.atk); b.them.unshift(g); } return g; };
  if (m === 'brood') { const g = guards(), n = Math.max(2, Math.round(E * Q.summon)); g.n += n; g.start += n; }
  if (m === 'acid') { for (const x of alive(b.us)) hurt(b, x, E * Q.acid * (bs.enraged ? 1.5 : 1)); bs.shake = 0.5; }
  if (m === 'scent') {
    const from = alive(b.us).filter((x) => x.kind === 'soldier' || x.kind === 'major').pop();
    const k = from ? Math.min(from.n, Math.max(1, Math.round(bs.army * Q.charm))) : 0;
    if (from && k) {
      from.n -= k;
      let t = b.them.find((x) => x.kind === 'thrall');
      if (!t) { t = stack('thrall', 0, from.max, from.atk); b.them.unshift(t); }
      t.n += k; t.start += k; bs.charmed = (bs.charmed ?? 0) + k;
    }
  }
  if (m === 'cry') bs.frenzy = Q.frenzy;
  if (m === 'burrow') { bs.burrow = Q.burrow; const q = b.them.find((x) => x.kind === 'rqueen'); if (q && q.n) q.hp = Math.min(q.max, q.hp + q.max * Q.heal); }
  say(bs, MOVES[m].hit, true);
  bs.fx = m; bs.fxN = (bs.fxN ?? 0) + 1;
}
/** Her turn, every frame: wind up a move, land it, and change when her health falls past a phase. */
function bossStep(ctx: Context, b: Battle, dt: number) {
  const bs = b.boss!, Q = WAR.rivalQueen, q = b.them.find((x) => x.kind === 'rqueen');
  bs.callT = Math.max(0, (bs.callT ?? 0) - dt); bs.shake = Math.max(0, (bs.shake ?? 0) - dt);
  bs.frenzy = Math.max(0, (bs.frenzy ?? 0) - dt); bs.burrow = Math.max(0, (bs.burrow ?? 0) - dt);
  if (!q || !q.n) return;
  const share = q.hp / q.max;
  if (bs.phase < Q.phases.length && share <= Q.phases[bs.phase]) {
    bs.phase++;
    if (bs.phase === 1) { bossMove(b, 'brood'); bossMove(b, 'brood'); say(bs, 'She SCREAMS. The whole mound shakes, and her brood pours out of the walls!', true, 3.5); bs.shake = 1; bs.fx = 'scream'; bs.fxN = (bs.fxN ?? 0) + 1; ctx.log('The rival queen screams, and her brood pours out of the walls.', 'warn'); }
    else { bs.enraged = true; q.atk *= 2; say(bs, 'Berserk! She tears off her own wing stubs and charges!', true, 3.5); bs.shake = 1.2; bs.fx = 'berserk'; bs.fxN = (bs.fxN ?? 0) + 1; ctx.log('The rival queen goes berserk.', 'warn'); }
    bs.cd = Math.max(bs.cd, 2.5);
  }
  if (bs.next) {
    bs.warn = (bs.warn ?? 0) - dt;
    if (bs.warn <= 0) { bossMove(b, bs.next); bs.next = undefined; }
    return;
  }
  bs.cd -= dt;
  if (bs.cd > 0) return;
  // early on she only calls her brood and spits; later she uses everything
  const pool: Move[] = bs.phase === 0 ? ['brood', 'acid', 'cry'] : ['brood', 'acid', 'scent', 'cry', 'burrow'];
  bs.next = pool[Math.floor(Math.random() * pool.length)];
  bs.warn = Q.warn;
  bs.cd = Q.every * (bs.enraged ? 0.6 : 1);
  say(bs, MOVES[bs.next].warn, false, Q.warn);
}
function endBoss(ctx: Context, win: boolean) {
  const s = S(ctx), b = s.battle!, boss = b.boss!;
  s.battle = null;
  // turned fighters still standing come home if she dies, and stay with her if we lose
  const thralls = b.them.find((x) => x.kind === 'thrall')?.n ?? 0;
  if (!win) b.soldiersLost += thralls;
  const fell = b.soldiersLost + (b.majorsLost ?? 0);
  const lost = Math.min(fell, Math.ceil(boss.army * WAR.campaignLoss * 2 * lossMult(ctx)));
  if (lost) {
    ctx.res.add('ant', -lost);
    const bigs = fell ? Math.round(lost * (b.majorsLost ?? 0) / fell) : 0;
    loseFighters(ctx, lost - bigs);
    const a = ctx.state.jobs?.assigned as Record<string, number> | undefined;
    if (a && bigs) a.major = Math.max(0, (a.major ?? 0) - bigs);
  }
  if (!win) {
    ctx.log(`The army is thrown out of the rival mound. ${lost} soldiers do not return. Their queen lives.`, 'warn');
    showResult(ctx, 'The rival queen', { win: false, title: 'Driven out', lines: ['Their queen lives', `${lost} soldiers fell`, 'Come back stronger'] });
    return;
  }
  const t = tiles(ctx)[boss.target];
  const got = Object.entries(WAR.loot.rival).map(([r, [lo, hi]]) => { const n = Math.round(rand(lo, hi) * 4 * (hasMilestone(ctx, 'spoils') ? 2 : 1)); ctx.res.add(r, n); return `+${n} ${r}`; });
  const hon = WAR.honours.campaign * 3;
  giveHonours(ctx, hon);
  giveChest(ctx, 'royal');
  if (t) ctx.bus.emit('map:capture', { x: boss.target % MAP.cols, y: Math.floor(boss.target / MAP.cols) });
  s.rivalDefeated = true; ctx.flags.add('rival:defeated');
  addTrophy(ctx, 'queen');
  ctx.log(`The rival queen is dead. Her mound is ours. Her raids stop, but wandering colonies will still come. ${got.join(', ')}, +${hon} war honours, and a royal chest.`, 'story');
  showResult(ctx, 'The rival queen', { win: true, title: 'The queen is dead', lines: ['Her mound is ours. Wanderers will still raid.', ...got, `+${hon} war honours`, 'A royal chest', ...(lost ? [`${lost} soldiers fell`] : [])] });
}

export const war: GameSystem = {
  id: 'war',

  init(ctx) {
    ctx.res.define({ id: 'chitin', name: 'Chitin', order: 40, integer: true, group: 'Spoils' });
    ctx.res.define({ id: 'venom', name: 'Venom', order: 41, integer: true, group: 'Spoils' });
    ctx.res.define({ id: 'honour', name: 'War honours', order: 51, integer: true, group: 'Marks' });
    ctx.state.war = {
      rivalArmy: WAR.rivalStartArmy, nextRaid: 0, warned: false, battle: null, rallyCd: 0,
      forts: {}, campaign: null, wave: 1, raids: 0, won: 0, rivalDefeated: false, spiderDefeated: false, lastReport: '',
    } satisfies WarState;
  },

  isUnlocked: (ctx) => ctx.flags.has('tech:martial'),

  tick(ctx, dt) {
    if (!ctx.flags.has('rival')) return;
    const s = S(ctx);
    if (s.battle && !s.battle.us) s.battle = null; // a raid saved in the old lane format: call it off
    ctx.mods.set('soldierPower', 'plating', F.plating.per * fl(ctx, 'plating'));
    ctx.mods.set('chamberCost', 'husktiles', F.husktiles.per * fl(ctx, 'husktiles'));
    ctx.mods.set('job:forager', 'sickles', F.sickles.per * fl(ctx, 'sickles'));
    ctx.mods.set('soldierPower', 'standards', H.standards.per * hl(ctx, 'standards'));
    ctx.mods.set('hunting', 'firstblood', hasMilestone(ctx, 'hunt') ? 1 : 0);
    ctx.mods.set('expSafety', 'feared', hasMilestone(ctx, 'feared') ? -0.2 : 0);
    ctx.mods.set('claimCost', 'scent', hasMilestone(ctx, 'scent') ? -0.15 : 0);
    ctx.mods.set('lineageGain', 'legend', hasMilestone(ctx, 'legend') ? 0.1 : 0);
    ctx.mods.set('hunting', 'spiderskull', skullWorks(ctx, 'spider') ? 0.5 : 0);
    s.rallyCd = Math.max(0, s.rallyCd - dt);
    if (s.battle && s.rallyCd <= 0 && autoCry(ctx)) warCry(ctx);
    if (!s.battle && s.wall != null) s.wall = Math.min(wallMax(ctx), s.wall + (wallMax(ctx) * dt) / WAR.barricadeRegrow);
    refill(ctx);
    if (s.battle) stepBattle(ctx, dt);
    ctx.mods.set('noWipe', 'wasps', manned(ctx, 'wasp') ? 1 : 0);
    s.sap = manned(ctx, 'antlion') ? Math.min(SK.antlion.sapMax, (s.sap ?? 0) + (SK.antlion.sapMax / SK.antlion.sapTime) * dt) : 0;
    if (!s.rivalDefeated) s.rivalArmy = Math.min(rivalTiles(ctx) * WAR.rivalArmyPerTile, s.rivalArmy + WAR.rivalGrowthPerSecond * dt);
    if (ctx.flags.has('tech:martial')) s.warTime = (s.warTime ?? 0) + dt;
    {
      if (!s.battle) {
        s.nextRaid = Math.max(0, s.nextRaid - dt); // now: cooldown before you can provoke again
        if (s.autoProvoke && hasMilestone(ctx, 'drums') && s.nextRaid <= 0 && !s.campaign && ctx.res.canAfford(WAR.provokeCost)) {
          ctx.res.spend(WAR.provokeCost);
          startBattle(ctx);
        } else if (ctx.flags.has('tech:martial') && !s.campaign) {
          // the rival raids on its own every so often (the first one waits a grace period after the War tab opens)
          const before = s.attackIn ??= WAR.attack.grace;
          s.attackIn = Math.max(0, before - dt);
          s.next ??= { kind: rollKind(ctx), luck: rollLuck() };
          const nk = WAR.raidKinds[s.next.kind] ?? WAR.raidKinds.plain, who = s.rivalDefeated ? 'A wandering colony' : 'The rival';
          if (before > WAR.attack.march && s.attackIn <= WAR.attack.march) ctx.log(`${who} is marching on the nest: ${nk.hint} Watch it on the Map. It arrives in about ${Math.round(WAR.attack.march / 60)} minutes.`, 'warn');
          if (before > WAR.attack.warn && s.attackIn <= WAR.attack.warn) ctx.log(`The column is almost at the entrance: about ${WAR.attack.warn} seconds.`, 'warn');
          if (s.attackIn <= 0) startBattle(ctx, { ...s.next });
        }
      }
    }
    if (s.campaign) { s.campaign.elapsed += dt; if (s.campaign.elapsed >= s.campaign.duration) finishCampaign(ctx); }
  },

  panel: (() => {
    let spoilsSection: HTMLElement, spoilsText: HTMLElement, openBtn: HTMLButtonElement, trophySection: HTMLElement, trophyList: HTMLElement;
    let baitWrap: HTMLElement;
    let fortSection: HTMLElement, campSection: HTMLElement, honourSection: HTMLElement, honourHead: HTMLElement, mileList: HTMLElement, autoWrap: HTMLElement, autoBox: HTMLInputElement;
    let honourUps: ReturnType<typeof upgradeList>;
    const field = battleField();
    let status: HTMLElement, ledger: HTMLElement, rallyBtn: ActionButton, refillBox: HTMLInputElement, campBtn: ActionButton, campInfo: HTMLElement, provokeBtn: ActionButton;
    let forts: ReturnType<typeof upgradeList>;
    const campBar = progressBar();
    return {
      title: 'War',
      group: 'War',
      mount(root, ctx) {
        status = el('p');
        ledger = el('div.ledger');
        provokeBtn = actionButton({
          ctx, label: 'Provoke a raid', costs: () => WAR.provokeCost,
          desc: 'Lay a false trail to the rival mound. Their raiders follow it to your entrance, where you are waiting. Kills give chitin.',
          enabled: (c) => !S(c).battle && !S(c).campaign && S(c).nextRaid <= 0,
          onBuy: (c) => startBattle(c),
        });
        const baitSel = el('select', { title: 'How big a raid Provoke lures. Bigger raids bring more chitin and honours; light bait brings no chest.' },
          ...Object.entries(WAR.bait).map(([id, b]) => el('option', { value: id }, `${b.name} (x${b.spoils} spoils)`))) as HTMLSelectElement;
        baitSel.value = S(ctx).bait ?? 'normal';
        baitSel.addEventListener('change', () => { S(ctx).bait = baitSel.value; });
        baitWrap = baitSel;
        rallyBtn = actionButton({
          ctx, label: 'War cry', desc: () => `Every fighter bites ${B.warCry.boost * 100}% harder for ${cryTime(ctx)}s. Ready again ${B.warCry.cooldown}s after it sounds. The Standing alarm sounds it by itself.`,
          enabled: (c) => !!S(c).battle && S(c).rallyCd <= 0, onBuy: (c) => warCry(c),
        });
        refillBox = el('input', { type: 'checkbox', id: 'war-refill' }) as HTMLInputElement;
        refillBox.addEventListener('change', () => { const s = S(ctx); s.replenish = refillBox.checked; if (!s.replenish) s.refill = undefined; });
        const refillWrap = el('label', { for: 'war-refill', style: 'white-space: nowrap', title: 'When soldiers or majors die, idle workers take their place.' }, refillBox, ' Refill from idle');
        campInfo = el('div.ledger');
        campBtn = actionButton({
          ctx, label: 'Launch campaign', desc: 'All soldiers march on the tile selected on the Map.',
          enabled: (c) => !S(c).campaign && !S(c).battle && soldiers(c) >= 3 && validTarget(c, c.state.map?.selected ?? null),
          onBuy: (c) => {
            const target = c.state.map.selected as number;
            S(c).campaign = { target, army: soldiers(c), elapsed: 0, duration: WAR.campaignTime * Math.max(0.2, 1 + c.mods.get('campaignTime')) };
            c.log(`${soldiers(c)} soldiers march out to take enemy ground.`);
          },
        });
        forts = upgradeList(ctx, () => S(ctx).forts, FORTS);
        honourUps = upgradeList(ctx, () => (S(ctx).ups ??= {}), HONOUR_UPS);
        autoBox = el('input', { type: 'checkbox', id: 'war-auto' }) as HTMLInputElement;
        autoBox.addEventListener('change', () => { S(ctx).autoProvoke = autoBox.checked; });
        autoWrap = el('label', { for: 'war-auto', style: 'white-space: nowrap', title: 'Lure the rival again the moment it will take the bait.' }, autoBox, ' Auto-provoke');
        openBtn = el('button', {}, 'Open all') as HTMLButtonElement;
        openBtn.addEventListener('click', () => { if (chestTotal(ctx)) openChests(ctx); });
        spoilsText = el('p.muted');
        trophyList = el('div.ledger.trophies');
        honourHead = el('p.muted');
        mileList = el('div.ledger.miles');
        root.append(
          el('p.flavor', {}, 'They know where we are now. Hold the entrance, then take the fight to them.'),
          el('details.info', {}, el('summary', {}, 'Information'),
          el('p.muted', {}, 'Why fight: every raider killed leaves chitin, and every raid repelled without losses earns war honours and a chest. Raids repelled reach war milestones, each a lasting reward for this colony. Chitin builds fortifications, husk halls, training grounds and majors; honours buy honour upgrades.'),
          el('p.muted', {}, 'How it works: every ant on both sides fights at once, so numbers and strength are what count. Each side bites the first group of the other: raiders take our majors first, then soldiers, then rallied workers; we cut down raiders first, then brutes. Nest defence (guard posts, stone tiles, husk halls) bites from the walls the whole fight. The War cry makes every fighter bite harder for a few seconds. If nobody is left at the entrance, raiders slip in one by one and steal food.')),
          field.root, status, el('div.row', {}, provokeBtn.root, baitWrap, rallyBtn.root, refillWrap, autoWrap), ledger,
          spoilsSection = el('div.section', {}, el('h3', {}, 'Spoils'), spoilsText, el('div.row', {}, openBtn)),
          trophySection = el('div.section', {}, el('h3', {}, 'Trophies'), el('p.muted', {}, 'The first kill of each kind of foe gives a skull. Skulls work once they hang in a Hall of husks.'), trophyList),
          honourSection = el('div.section', {}, el('h3', {}, 'War honours'), honourHead, mileList, honourUps.root),
          fortSection = el('div.section', {}, el('h3', {}, 'Fortifications'), forts.root),
          campSection = el('div.section', {}, el('h3', {}, 'Campaign'), el('p.muted', {}, 'Select an enemy tile next to your territory on the Map, then launch.'),
            campInfo, el('div.row', {}, campBtn.root), campBar.root),
        );
      },
      update(_root, ctx) {
        const s = S(ctx);
        field.update(ctx);
        fortSection.hidden = !ctx.flags.has('tech:fortify');
        campSection.hidden = !ctx.flags.has('tech:campaigns');
        refillBox.checked = !!s.replenish;
        autoBox.checked = !!s.autoProvoke;
        autoWrap.hidden = !hasMilestone(ctx, 'drums');
        honourUps.update(ctx);
        const ch = s.chests ?? {}, total = chestTotal(ctx);
        spoilsSection.hidden = !total && !s.won;
        spoilsText.textContent = total
          ? 'Waiting to be opened: ' + (Object.entries(ch) as [ChestKind, number][]).filter(([, n]) => n).map(([k, n]) => `${n} ${WAR.chests.kinds[k].name.toLowerCase()}${n > 1 ? 's' : ''}`).join(', ') + '.'
          : `Every raid repelled without losses leaves a chest. Raids of threat ${WAR.chests.rareFrom} or more leave rare chests, ${WAR.chests.royalFrom} or more royal ones.`;
        openBtn.disabled = !total;
        trophySection.hidden = !skullCount(ctx);
        const hall = (ctx.state.nest?.built?.husks ?? 0) > 0;
        const tkey = (s.skulls ?? []).join() + hall;
        if (trophyList.dataset.key !== tkey) {
          trophyList.dataset.key = tkey;
          const got = WAR.trophies.filter((t) => hasSkull(ctx, t.id));
          const left = WAR.trophies.length - got.length;
          trophyList.replaceChildren(
            ...got.map((t) => el('div', {}, el('span', {}, (hall ? '☠ ' : '○ ') + t.name), el('span', { class: hall ? '' : 'muted' }, t.desc + (hall ? '' : ' (needs a Hall of husks)')))),
            ...(left ? [el('div', {}, el('span.muted', {}, `${left} more to find`), el('span', {}, ''))] : []),
          );
        }
        honourSection.hidden = !ctx.flags.has('rival');
        honourHead.textContent = `Raids repelled: ${bestWave(ctx)}. Honours earned: ${honoured(ctx)}. Each milestone is a lasting reward for this colony.`;
        const next = WAR.milestones.find((m) => !hasMilestone(ctx, m.id));
        const shown = WAR.milestones.filter((m) => hasMilestone(ctx, m.id)).map((m) => ({ m, done: true }));
        if (next) shown.push({ m: next, done: false });
        const key = shown.map((x) => x.m.id + x.done).join() + bestWave(ctx);
        if (mileList.dataset.key !== key) {
          mileList.dataset.key = key;
          mileList.replaceChildren(...shown.map(({ m, done }) => el('div', { class: done ? '' : 'next' },
            el('span', { class: done ? '' : 'muted' }, `${done ? '✓' : '○'} ${m.wave} raids: ${m.name}`),
            el('span', { class: done ? 'muted' : '' }, done ? m.desc : `${m.desc} (${bestWave(ctx)} of ${m.wave} raids)`))));
        }
        provokeBtn.update(ctx); rallyBtn.update(ctx); campBtn.update(ctx); forts.update(ctx);
        if (s.battle?.boss) {
          const b = s.battle, sum = (xs: Stack[]) => xs.reduce((t, x) => t + x.n, 0), q = b.them.find((x) => x.kind === 'rqueen');
          status.textContent = `Inside the rival mound: ${sum(b.us)} of ${b.soldiersAtStart} fighters standing, ${b.them.find((x) => x.kind === 'raider')?.n ?? 0} guards left, ` + (q && q.n ? `the queen at ${Math.ceil((q.hp / q.max) * 100)}% health.` : 'the queen is down.');
        } else if (s.battle) {
          const b = s.battle, sum = (xs: Stack[]) => xs.reduce((t, x) => t + x.n, 0);
          const fighters = sum(b.us.filter((x) => x.kind !== 'worker' && x.kind !== 'wall' && x.kind !== 'mound')), helpers = b.us.find((x) => x.kind === 'worker')?.n ?? 0;
          status.textContent = `Raid in progress: ${sum(b.them)} of them left, ${fighters} of ${b.soldiersAtStart} fighters standing` + (helpers ? `, ${helpers} workers helping` : '') + `, ${b.kills} killed` + (b.rescued ? `, ${b.rescued} wounded carried in` : '') + (b.breaches ? `, ${b.breaches} got in` : '') + '.' + (b.cry ? ` War cry: ${Math.ceil(b.cry / ctx.speed)}s left.` : s.rallyCd > 0 ? ` War cry ready in ${Math.ceil(s.rallyCd / ctx.speed)}s.` : '');
        } else if (s.attackIn != null && s.attackIn <= WAR.attack.march && ctx.flags.has('tech:martial')) status.textContent = `${s.rivalDefeated ? 'Wanderers are' : 'The rival is'} marching on the nest: ${WAR.raidKinds[s.next?.kind ?? 'plain']?.hint ?? ''} (see the Map). It reaches the entrance in about ${Math.ceil(s.attackIn / ctx.speed)}s. ` + (s.lastReport ? 'Last raid: ' + s.lastReport : '');
        else status.textContent = `${s.rivalDefeated ? 'Wandering colonies raid' : 'The rival raids'} on its own every ${Math.round(WAR.attack.every[0] / 60)} to ${Math.round(WAR.attack.every[1] / 60)} minutes${s.attackIn != null ? ` (next in about ${Math.ceil(s.attackIn / 60)} min)` : ''}, or sooner if you provoke it. ` +
          (s.nextRaid > 0 ? `They will take the bait again in ${Math.ceil(s.nextRaid / ctx.speed)}s. ` : 'They are ready to take the bait. ') +
          (s.lastReport ? 'Last raid: ' + s.lastReport : '');
        const hold = soldiers(ctx) * B.soldier.atk * power(ctx) + defence(ctx) * B.defenceDps * (1 + F.spitters.per * fl(ctx, 'spitters'));
        ledger.replaceChildren(...[
          ['Rival army', `about ${Math.round(s.rivalArmy)}`],
          ['Threat', `${threatWord(threat(ctx))} (${fmt(threat(ctx))}). A raid now: ${describeRaid(ctx, threat(ctx))}, give or take ${Math.round(T.luck * 100)}%` + (ctx.mods.get('raidSize') < 0 ? `. Minims in their walls thin it by ${Math.round(-ctx.mods.get('raidSize') * 100)}%` : '')],
          ['Your soldiers', `${soldiers(ctx)} (assign them on the Jobs tab)`],
          ['Nest defence', `${defence(ctx)} (guard posts, stone tiles, husk halls)`],
          ...(wallMax(ctx) ? [['Husk barricade', `${Math.floor(s.battle && !s.battle.boss ? (s.battle.us.find((x) => x.kind === 'wall')?.n ? s.battle.us.find((x) => x.kind === 'wall')!.hp : 0) : wallHp(ctx))} of ${wallMax(ctx)}`]] : []),
          ['Damage per second at the gate', fmt(hold)],
          ['Raids fought', `${s.raids}, ${s.won} without losses`],
        ].map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
        const sel = ctx.state.map?.selected ?? null;
        const rows: [string, string][] = [];
        if (s.campaign) {
          campBar.set(s.campaign.elapsed / s.campaign.duration);
          rows.push(['Under way', `${s.campaign.army} soldiers, ${Math.ceil((s.campaign.duration - s.campaign.elapsed) / ctx.speed)}s left`]);
        } else campBar.set(0);
        if (sel != null && tiles(ctx)[sel]) {
          const ok = validTarget(ctx, sel);
          const sh = strongholdAt(ctx, sel);
          rows.push(['Target', ok ? (sh ? SK[sh].name : `${tiles(ctx)[sel].o} ground${tiles(ctx)[sel].core ? ' (their home)' : ''}`) : sh ? `${SK[sh].name}: claim land next to it first` : 'Not an enemy tile next to your territory']);
          if (sh) rows.push(['The catch', SK[sh].catch + (sh === 'antlion' && bridgeBeside(ctx, sel) ? ' A bridge stands ready.' : '')]);
          if (!sh && (s.sap ?? 0) > 0.005) rows.push(['Antlions', `Enemy ground is undermined: ${Math.round((s.sap ?? 0) * 100)}% weaker`]);
          if (ok) rows.push(['Enemy strength vs yours', `about ${Math.round(enemyStrength(ctx, sel))} vs ${fmt(soldiers(ctx) * power(ctx))}`]);
        }
        campInfo.replaceChildren(...rows.map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
      },
    };
  })(),
};

// ---- the entrance: one ant for each stack, with the front ant's health and the count over its head ----
const NAMES: Record<Kind, string> = { queen: 'Queen', major: 'Majors', soldier: 'Soldiers', worker: 'Workers', wall: 'Barricade', mound: 'Termite mound', wasp: 'Wasps', raider: 'Raiders', brute: 'Brutes', rqueen: 'Rival queen', thrall: 'Turned' };
const LEGS_A = ['...#..#..#......', '..#..#..#.......'];
const LEGS_B = ['...#..#..#......', '....#..#..#.....'];
/** Pixel ants, facing right. '#' is body. */
const SHAPES: Record<'small' | 'major' | 'brute' | 'rqueen' | 'wall', string[]> = {
  small: [
    '...........#....',
    '..........#.....',
    '..###..##.###...',
    '.#############..',
    '..###..##.###...',
  ],
  major: [
    '...........#....',
    '..........#.....',
    '..........#####.',
    '..###..##.######',
    '.###############',
    '..###..##.#####.',
  ],
  rqueen: [ // long and heavy in the gaster, with the stubs where her wings were
    '.............#..',
    '....##......#...',
    '.....##..#.####.',
    '######..##.####.',
    '################',
    '######..##.####.',
    '.####...........',
  ],
  wall: [ // curved husks stacked into a wall
    '..####...####...',
    '.#....#.#....#..',
    '...####...####..',
    '..#....#.#....#.',
    '.####...####....',
    '#....#.#....#...',
    '..####...####...',
    '.#....#.#....#..',
  ],
  brute: [
    '............#...',
    '...........#....',
    '.#####..##.####.',
    '#######.##.####.',
    '################',
    '#######.##.####.',
    '.#####..........',
  ],
};
/** Blend two #rrggbb colours. */
function mix(a: string, b: string, f: number) {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * f).toString(16).padStart(2, '0')).join('');
}
const CW = 18, CH = 10;
/** cairn: War Cairn trait tiers (jaws, plates, acid), drawn onto our fighters. */
function drawAnt(cv: HTMLCanvasElement, x: Stack, theirs: boolean, fighting: boolean, cairn: [number, number, number] = [0, 0, 0]) {
  const c = setup(cv);
  c.clearRect(0, 0, CW, CH);
  const shape = SHAPES[x.kind === 'major' ? 'major' : x.kind === 'brute' || x.kind === 'queen' || x.kind === 'wasp' ? 'brute' : x.kind === 'rqueen' ? 'rqueen' : x.kind === 'wall' || x.kind === 'mound' ? 'wall' : 'small'];
  const t = performance.now() / 1000;
  const step = fighting ? Math.floor(t * 6) % 2 : 0;
  const lunge = fighting && x.kind !== 'wall' && x.kind !== 'mound' && x.n > 0 && Math.floor(t * 2.5 + (theirs ? 0.5 : 0)) % 2 ? 1 : 0;
  const still = x.kind === 'wall' || x.kind === 'mound';
  const rows = still ? [...shape, '################', '################'] : [...shape, ...(step ? LEGS_B : LEGS_A)];
  const top = CH - rows.length;
  let col = theirs ? (x.kind === 'rqueen' ? mix(PAL.rival, PAL.amber, 0.35) : x.kind === 'thrall' ? mix(PAL.you, PAL.rival, 0.55) : x.kind === 'wasp' ? '#f2c14e' : PAL.rival) : x.kind === 'worker' ? PAL.bone : x.kind === 'queen' ? PAL.amber : x.kind === 'wall' ? mix(PAL.rival, PAL.bg, 0.3) : PAL.you;
  if (x.n <= 0) col = mix(col, PAL.bg, 0.65);
  else if ((x.hit ?? 0) > 0.12) col = mix(col, PAL.bone, 0.55);
  c.fillStyle = col;
  rows.forEach((r, y) => {
    for (let i = 0; i < r.length; i++) {
      if (r[i] !== '#') continue;
      const px = 1 + i + lunge;
      c.fillRect(theirs ? CW - 1 - px : px, top + y, 1, 1);
    }
  });
  if (!theirs && (x.kind === 'major' || x.kind === 'soldier') && x.n > 0 && (cairn[0] || cairn[1] || cairn[2])) {
    // the body's midline is its widest row; the head is its right end, the gaster its left
    let mid = 0, w = 0;
    shape.forEach((r, y) => { const n = r.split('#').length - 1; if (n > w) { w = n; mid = y; } });
    const row = shape[mid], L = row.indexOf('#'), Rt = row.lastIndexOf('#');
    const px = (i: number, y: number, colr: string) => { c.fillStyle = colr; c.fillRect(1 + i + lunge, top + y, 1, 1); };
    const [jaws, plates, acid] = cairn;
    if (acid) for (let i = L; i < L + 1 + acid; i++) for (let y = Math.max(0, mid - 1); y <= mid + 1; y++) if (shape[y]?.[i] === '#') px(i, y, mix(PAL.you, '#9bd34a', 0.35 + acid * 0.15));
    if (plates) for (let i = L + 3; i < Math.min(Rt - 2, L + 3 + plates * 2); i += 1) if (shape[mid - 1]?.[i] === '#' || mid === 0) px(i, Math.max(0, mid - 1), mix(PAL.you, PAL.bone, 0.5));
    if (jaws) { const jc = mix(PAL.bone, PAL.you, 0.2); px(Rt + 1, mid, jc); if (jaws > 1) px(Rt + 2, mid, jc); if (jaws > 2) { px(Rt + 2, mid - 1, jc); px(Rt + 2, mid + 1, jc); } }
  }
}
interface Card { root: HTMLElement; fill: HTMLElement; count: HTMLElement; cv: HTMLCanvasElement; stack?: Stack }
function card(kind: Kind, info: (x: Stack) => (Node | string)[]): Card {
  const fill = el('span.fill'), count = el('span.fcount');
  const cv = el('canvas', { width: CW, height: CH, 'aria-hidden': 'true' }) as HTMLCanvasElement;
  const root = el('div.fighter', { tabindex: 0, class: 'fighter k-' + kind }, el('div.fhead', {}, el('span.bar', {}, fill), count), cv, el('div.fname', {}, NAMES[kind]));
  const cd: Card = { root, fill, count, cv };
  hoverTip(root, () => (cd.stack ? info(cd.stack) : []));
  return cd;
}
const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;
/** What the battle tooltip says about one group: numbers first, then what is changing them. */
function fighterInfo(ctx: Context, x: Stack, theirs: boolean, boss: boolean): (Node | string)[] {
  const out: (Node | string)[] = [el('b', {}, NAMES[x.kind])];
  if (x.kind === 'wall') {
    out.push(`Health: ${Math.floor(x.n ? x.hp : 0)} of ${Math.round(x.max)}`, 'Takes the bites before anyone else does.', `Regrows whole in ${WAR.barricadeRegrow}s between raids. Thicker with each level.`);
    return out;
  }
  const bite = x.atk * (theirs || x.kind === 'worker' || x.kind === 'queen' ? 1 : power(ctx));
  out.push(x.max > 0 && (x.kind === 'queen' || x.kind === 'rqueen') ? `Health: ${fmt(x.n ? x.hp : 0)} of ${fmt(x.max)}` : `${x.n} ${x.n === 1 ? 'ant' : 'ants'}, ${fmt(x.max)} health each`, `Bite: ${fmt(bite)}${x.kind === 'queen' || x.kind === 'rqueen' ? '' : ' each'}`);
  const why: string[] = [];
  if (theirs) {
    const b = S(ctx).battle, w = b?.lvl ?? threat(ctx), tk = WAR.raidKinds[b?.kind ?? 'plain']?.tough ?? 1;
    if (!boss && w * tk > 1) why.push(`Threat ${fmt(w)}: ${pct(toughness(w) * tk - 1)} health and bite`);
    if (!boss && fl(ctx, 'thorns')) why.push(`Thorn barricade: their bites ${pct(-Math.min(0.8, F.thorns.per * fl(ctx, 'thorns')))}`);
    if (boss && x.kind === 'rqueen') why.push('Kill her and the raids stop for good.');
    if (x.kind === 'brute') why.push(skullWorks(ctx, 'brute') ? `Drops ${B.brute.chitin * 2} chitin (Brute skull)` : `Drops ${B.brute.chitin} chitin`);
    if (!boss && defence(ctx)) why.push(`Your walls bite them for ${fmt(defence(ctx) * B.defenceDps * (1 + F.spitters.per * fl(ctx, 'spitters')))} a second`);
  } else if (x.kind === 'worker') {
    if (skullWorks(ctx, 'raider')) why.push('Raider skull: bite x2');
    why.push(`Each one here: ${Math.round(B.rescuePerWorker * 100)}% chance to carry a fallen soldier home`);
  } else if (x.kind === 'queen') {
    why.push('Armoured in raider chitin. She comes out only when the line is gone.');
  } else {
    const sp = ctx.mods.get('soldierPower');
    if (sp) why.push(`Strength ${pct(sp)} (plating, standards and more)`);
    if (S(ctx).battle?.cry) why.push(`War cry: bite ${pct(B.warCry.boost)}`);
    if (fl(ctx, 'carapace')) why.push(`Hardened carapace: health ${pct(F.carapace.per * fl(ctx, 'carapace'))}`);
    if (x.kind === 'major') why.push('Majors stand in front and take the first bites.');
    const cd = ctx.mods.get('cairnDouble'), cp = ctx.mods.get('cairnPlates'), ca = ctx.mods.get('cairnAcid');
    if (cd) why.push(`Serrated mandibles: ${Math.round(cd * 100)}% of bites strike twice (War Cairn)`);
    if (cp) why.push(`Chitin plates: ${Math.round(cp * 100)}% less damage taken (War Cairn)`);
    if (ca) why.push(`Acid glands: ${Math.round(ca * 100)}% of damage splashes onto the group behind (War Cairn)`);
    if (ctx.mods.get('cairnStand')) why.push(S(ctx).battle?.stood ? 'Last stand: used this fight' : 'Last stand: once a fight, half the fallen get back up');
  }
  for (const w of why) out.push(el('div.muted', {}, w));
  return out;
}
/** The entrance, drawn as stacks. Idle: our fighters at the gate and the next wave waiting, faded. */
function battleField() {
  const us = el('div.side'), them = el('div.side.them');
  const bossFill = el('span.fill'), bossName = el('span.bname'), call = el('div.bosscall', { 'aria-live': 'polite' });
  const bossBar = el('div.bossbar', { hidden: true }, bossName, el('span.bar', {}, bossFill));
  const fxLayer = el('div.fx', { 'aria-hidden': 'true' });
  const field = el('div.field', { role: 'img', 'aria-label': 'The nest entrance' }, us, el('div.gate', {}, 'vs'), them, fxLayer);
  let fxSeen = 0, cfxSeen = 0;
  /** A burst of little CSS particles for one of her moves. */
  const burst = (kind: string) => {
    const spec: Record<string, { n: number; cls: string; from: [number, number]; to: [number, number] }> = {
      acid:    { n: 26, cls: 'drop',  from: [2, 50], to: [0, 0] },
      brood:   { n: 14, cls: 'egg',   from: [62, 98], to: [0, 0] },
      scream:  { n: 28, cls: 'egg',   from: [50, 98], to: [0, 0] },
      scent:   { n: 16, cls: 'wisp',  from: [70, 95], to: [-60, 0] },
      cry:     { n: 3,  cls: 'ring',  from: [85, 85], to: [0, 0] },
      berserk: { n: 5,  cls: 'ring',  from: [85, 85], to: [0, 0] },
      burrow:  { n: 18, cls: 'dirt',  from: [76, 94], to: [0, 0] },
      // War Cairn traits
      cairnacid: { n: 6, cls: 'drop', from: [55, 75], to: [0, 0] },
      double:  { n: 2,  cls: 'ring small', from: [38, 48], to: [0, 0] },
      stand:   { n: 5,  cls: 'ring gold', from: [10, 40], to: [0, 0] },
    };
    const sp = spec[kind];
    if (!sp) return;
    for (let i = 0; i < sp.n; i++) {
      const d = el('span', { class: 'p ' + sp.cls + (kind === 'berserk' ? ' red' : '') });
      d.style.left = `${sp.from[0] + Math.random() * (sp.from[1] - sp.from[0])}%`;
      d.style.animationDelay = `${(sp.cls === 'ring' ? i * 0.18 : Math.random() * 0.5).toFixed(2)}s`;
      d.style.setProperty('--dx', `${sp.to[0] * (0.6 + Math.random() * 0.8)}%`);
      d.style.setProperty('--r', Math.random().toFixed(2));
      fxLayer.append(d);
      setTimeout(() => d.remove(), 2200);
    }
  };
  const root = el('div.arena', {}, bossBar, call, field);
  const cards = new Map<string, Card>();
  let key = '';
  return {
    root,
    update(ctx: Context) {
      const s = S(ctx), b = s.battle;
      let ours: Stack[], theirs: Stack[];
      if (b) { ours = b.us; theirs = b.them; }
      else {
        ours = [];
        if (wallMax(ctx)) { const w = stack('wall', 1, wallMax(ctx), 0); w.hp = wallHp(ctx); ours.push(w); }
        ours.push(...army(ctx));
        if (!ours.some((x) => x.kind === 'soldier') && !majors(ctx)) ours.push(stack('soldier', 0, B.soldier.hp, B.soldier.atk));
        const comp = raidComp(ctx), tough = toughness(threat(ctx));
        theirs = [stack('raider', comp.raiders, B.raider.hp * tough, B.raider.atk * tough)];
        if (comp.brutes) theirs.push(stack('brute', comp.brutes, B.brute.hp * tough, B.brute.atk * tough));
      }
      const k = (b ? 'b' : 'i') + ours.map((x) => x.kind).join() + '|' + theirs.map((x) => x.kind).join();
      if (k !== key) {
        key = k;
        cards.clear();
        const mk = (x: Stack, side: string) => { const cd = card(x.kind, (st) => fighterInfo(ctx, st, side === 't', !!S(ctx).battle?.boss)); cards.set(side + x.kind, cd); return cd.root; };
        us.replaceChildren(...ours.map((x) => mk(x, 'u')));
        them.replaceChildren(...theirs.map((x) => mk(x, 't')));
      }
      field.classList.toggle('idle', !b);
      const bs = b?.boss, q = b?.them.find((x) => x.kind === 'rqueen');
      bossBar.hidden = !bs;
      field.classList.toggle('boss', !!bs);
      field.classList.toggle('warcry', !!b?.cry);
      field.classList.toggle('shake', !!bs?.shake);
      field.classList.toggle('enraged', !!bs?.enraged);
      field.classList.toggle('frenzy', !!bs?.frenzy);
      field.classList.toggle('burrowed', !!bs?.burrow);
      if (bs && q) {
        bossFill.style.width = `${q.n ? (q.hp / q.max) * 100 : 0}%`;
        bossName.textContent = `The rival queen${bs.enraged ? ', berserk' : bs.phase ? ', wounded' : ''}`;
      }
      const text = bs && bs.callT ? bs.call ?? '' : '';
      if (call.textContent !== text) { call.textContent = text; call.classList.remove('pop'); void call.offsetWidth; call.classList.toggle('pop', !!bs?.big); }
      call.classList.toggle('warn', !!bs?.next);
      if (bs && (bs.fxN ?? 0) !== fxSeen) { fxSeen = bs.fxN ?? 0; if (bs.fx) burst(bs.fx); }
      if (!bs) fxSeen = 0;
      if (b && (b.cfxN ?? 0) !== cfxSeen) { cfxSeen = b.cfxN ?? 0; if (b.cfx) burst(b.cfx === 'acid' ? 'cairnacid' : b.cfx === 'stand' ? 'stand' : 'double'); }
      if (!b) cfxSeen = 0;
      field.classList.toggle('stood', !!b?.stood);
      const show = (x: Stack, side: string) => {
        const cd = cards.get(side + x.kind);
        if (!cd) return;
        cd.stack = x;
        cd.fill.style.width = `${x.n > 0 ? Math.max(4, (x.hp / x.max) * 100) : 0}%`;
        cd.count.textContent = x.kind === 'wall' ? `${Math.floor(x.n ? x.hp : 0)}` : `×${x.n}`;
        cd.root.classList.toggle('down', x.n <= 0);
        cd.root.classList.toggle('lost', (x.fell ?? 0) > 0);
        drawAnt(cd.cv, x, side === 't', !!b, [ctx.mods.get('cairnJawsTier'), ctx.mods.get('cairnPlatesTier'), ctx.mods.get('cairnAcidTier')]);
      };
      ours.forEach((x) => show(x, 'u'));
      theirs.forEach((x) => show(x, 't'));
    },
  };
}
