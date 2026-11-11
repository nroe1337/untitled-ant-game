// War: the rival colony grows, raids your nest, and you fight back.
// Raids play out as a small auto-battle at the nest entrance you can watch.
// Kills give chitin, which other systems need (techniques, chambers, fortifications).
// Campaigns send soldiers to take enemy tiles; this reads ctx.state.map and emits 'map:capture'.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, progressBar, type ActionButton } from '../../core/ui';
import { fmt } from '../../core/resources';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { PAL, rect, setup } from '../../core/pixel';
import { WAR, MAP, CASTES } from '../../data/balance';
import { idleAnts } from '../jobs';

const B = WAR.battle;
const F = WAR.fortifications;
const GAP = 6, BIG_GAP = 9, REACH = 6; // spacing in each battle line, and how close the two fronts stand to fight

interface Unit {
  x: number; hp: number; max: number; kind: 'raider' | 'soldier' | 'worker'; big?: boolean; atk?: number; speed?: number;
  /** a rallied worker sent to fetch a fallen soldier (the body's id), and whether it has it yet */
  fetch?: number; carrying?: boolean;
  /** a brute's time until its next shove */
  shove?: number;
}
interface Body { id: number; x: number; big?: boolean; taken?: boolean }
interface Corpse { x: number; age: number; big?: boolean }
interface Battle {
  units: Unit[]; chitin?: number; kills: number; breaches: number; soldiersLost: number; workersLost: number; rallied: number; soldiersAtStart: number;
  /** fallen soldiers waiting to be carried home, and how many were */
  bodies?: Body[]; rescued?: number; nextBody?: number;
  /** dead raiders on their backs, fading */
  corpses?: Corpse[];
}
interface Campaign { target: number; army: number; elapsed: number; duration: number }
interface WarState {
  rivalArmy: number;
  nextRaid: number;           // seconds until raiders arrive
  warned: boolean;
  battle: Battle | null;
  rallyCd: number;
  forts: Record<string, number>;
  campaign: Campaign | null;
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
}
const S = (ctx: Context) => ctx.state.war as WarState;
const fl = (ctx: Context, id: keyof typeof F) => S(ctx).forts[id] ?? 0;
const FORTS = fromBalance(F);
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
const majors = (ctx: Context) => ctx.state.jobs?.assigned?.major ?? 0;
/** Fighting strength in soldier-equivalents: a major counts as several soldiers. */
const soldiers = (ctx: Context) => (ctx.state.jobs?.assigned?.soldier ?? 0) + majors(ctx) * CASTES.major.atk;
const power = (ctx: Context) => 1 + ctx.mods.get('soldierPower');
const defence = (ctx: Context) => ctx.mods.get('defence');
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const tiles = (ctx: Context) => (ctx.state.map?.tiles ?? []) as { t: string; o: string | null; seen: boolean; core?: boolean }[];
const rivalTiles = (ctx: Context) => Math.max(1, tiles(ctx).filter((t) => t.o === 'rival').length);
const waveOf = (ctx: Context) => S(ctx).wave ?? 1;
const waveComp = (w: number) => ({
  raiders: Math.min(WAR.maxRaiders, Math.round(B.wave.base + w * B.wave.perWave)),
  brutes: Math.floor(w / B.wave.bruteEvery),
});
const toughness = (w: number) => Math.pow(B.wave.toughness, w - 1);
const describeWave = (w: number) => { const c = waveComp(w); return `${c.raiders} raiders` + (c.brutes ? ` and ${c.brutes} brute${c.brutes > 1 ? 's' : ''}` : '') + (w > 1 ? `, each ${Math.round((toughness(w) - 1) * 100)}% tougher` : ''); };

function freeWorkers(ctx: Context) {
  const assigned = Object.values((ctx.state.jobs?.assigned ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0);
  const busy = Object.values(ctx.busy).reduce((a, b) => a + b, 0);
  return Math.max(0, Math.floor(ctx.res.amt('ant')) - assigned - busy);
}

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
function startBattle(ctx: Context) {
  const s = S(ctx);
  const comp = waveComp(waveOf(ctx));
  const n = comp.raiders + comp.brutes;
  const units: Unit[] = [];
  const tough = toughness(waveOf(ctx));
  for (let i = 0; i < comp.raiders; i++) units.push({ kind: 'raider', x: B.laneLength + i * GAP, hp: B.raider.hp * tough, max: B.raider.hp * tough, atk: B.raider.atk * tough, speed: B.raider.speed });
  for (let i = 0; i < comp.brutes; i++) units.push({ kind: 'raider', big: true, x: B.laneLength + comp.raiders * GAP + i * BIG_GAP, hp: B.brute.hp * tough, max: B.brute.hp * tough, atk: B.brute.atk * tough, speed: B.brute.speed });
  const hp = B.soldier.hp * (1 + F.carapace.per * fl(ctx, 'carapace'));
  const plain = ctx.state.jobs?.assigned?.soldier ?? 0;
  // majors stand at the front of the line, soldiers behind them; the back of a long line waits inside the nest
  let lineX = 60;
  for (let i = 0; i < Math.min(20, majors(ctx)); i++) { units.push({ kind: 'soldier', big: true, x: lineX, hp: hp * CASTES.major.hp, max: hp * CASTES.major.hp, atk: B.soldier.atk * CASTES.major.atk }); lineX -= BIG_GAP; }
  for (let i = 0; i < Math.min(40, plain); i++) { units.push({ kind: 'soldier', x: lineX, hp, max: hp }); lineX -= GAP; }
  s.battle = { units, kills: 0, breaches: 0, soldiersLost: 0, workersLost: 0, rallied: 0, soldiersAtStart: soldiers(ctx) };
  ctx.log(`Wave ${waveOf(ctx)}: the rival takes the bait. ${n} of them pour toward the entrance.`, 'warn');
  if (fl(ctx, 'alarm') || ctx.flags.has('accord:alarm')) rally(ctx);
}

function rally(ctx: Context) {
  const s = S(ctx);
  if (!s.battle || s.rallyCd > 0) return;
  const n = Math.min(B.rallyMax, freeWorkers(ctx) + Math.floor((ctx.state.jobs?.assigned?.forager ?? 0) / 2));
  // rallied workers join the back of the line
  let back = Math.min(30, ...s.battle.units.filter((u) => u.kind !== 'raider').map((u) => u.x - GAP));
  for (let i = 0; i < n; i++) { s.battle.units.push({ kind: 'worker', x: back, hp: B.worker.hp, max: B.worker.hp }); back -= GAP; }
  s.battle.rallied += n;
  s.rallyCd = B.rallyCooldown;
  if (n) ctx.log(`${n} workers drop what they carry and rush to the entrance.`, 'info');
}

/** The battle lines: raiders front first, and the defenders standing in line (not workers off carrying the fallen). */
const lines = (b: Battle) => ({
  raiders: b.units.filter((u) => u.kind === 'raider').sort((a, z) => a.x - z.x),
  defenders: b.units.filter((u) => u.kind !== 'raider' && u.fetch == null).sort((a, z) => z.x - a.x),
});
const gapOf = (u: Unit) => (u.big ? BIG_GAP : GAP);
/** Which ranks behind the front are close enough to help: their place in line, and how much of their bite lands. */
function helpers(line: Unit[], share: readonly number[]) {
  const out: [Unit, number][] = [];
  for (let i = 1; i < Math.min(line.length, share.length); i++) {
    if (Math.abs(line[i].x - line[0].x) > i * BIG_GAP + 2) break; // still marching up
    out.push([line[i], share[i]]);
  }
  return out;
}
const defBite = (ctx: Context, u: Unit) => (u.kind === 'soldier' ? (u.atk ?? B.soldier.atk) * power(ctx) : B.worker.atk);

function stepBattle(ctx: Context, dt: number) {
  const s = S(ctx), b = s.battle!;
  const { raiders, defenders } = lines(b);
  const front = raiders[0];
  const wall = defenders[0];
  const slow = 1 + F.thorns.per * fl(ctx, 'thorns');

  // towers (nest defence) shoot the front raider in range
  if (front && front.x < B.guardRange) front.hp -= defence(ctx) * B.defenceDps * (1 + F.spitters.per * fl(ctx, 'spitters')) * dt;

  // the two lines meet front to front. The front of each side fights; the ranks just behind help:
  // our soldiers spit acid over the front one's shoulder, raiders shove and snap past theirs
  const touching = !!(front && wall && front.x - wall.x <= REACH);
  if (touching) {
    let toWall = front.atk ?? B.raider.atk;
    for (const [r, k] of helpers(raiders, B.raiderSupport)) toWall += (r.atk ?? B.raider.atk) * k;
    let toFront = defBite(ctx, wall);
    for (const [d, k] of helpers(defenders, B.spit)) if (d.kind === 'soldier') toFront += defBite(ctx, d) * k;
    wall.hp -= toWall * dt;
    front.hp -= toFront * dt;
    // a brute shoves the whole line back a step now and then
    if (front.big) {
      front.shove = (front.shove ?? B.shoveEvery) - dt;
      if (front.shove <= 0) { front.shove = B.shoveEvery; for (const d of defenders) d.x -= B.shove; }
    }
  }
  raiders.forEach((r, i) => {
    if (i === 0 && touching) return;
    const stop = i === 0 ? (wall ? wall.x + REACH : -Infinity) : raiders[i - 1].x + gapOf(raiders[i - 1]);
    r.x = Math.max(stop, r.x - ((r.speed ?? B.raider.speed) / slow) * dt);
  });
  defenders.forEach((d, i) => {
    if (i === 0 && touching) return;
    const stop = i === 0 ? (front ? front.x - REACH : 60) : defenders[i - 1].x - gapOf(d);
    d.x = Math.min(stop, d.x + 8 * dt); // step up to meet them, or close the gap left by the fallen
  });

  // rallied workers at the back fetch the fallen and carry them inside: they live, wounded
  b.bodies ??= [];
  for (const body of b.bodies) {
    if (body.taken) continue;
    const w = b.units.filter((u) => u.kind === 'worker' && u.fetch == null).sort((a, z) => a.x - z.x)[0]; // the one furthest back
    if (!w || (wall && w === wall)) break;
    w.fetch = body.id; body.taken = true;
  }
  for (const w of b.units.filter((u) => u.fetch != null)) {
    const body = b.bodies.find((x) => x.id === w.fetch);
    if (!w.carrying && body) {
      w.x = Math.min(body.x, w.x + B.carrySpeed * dt);
      if (w.x >= body.x - 0.5) { w.carrying = true; b.bodies.splice(b.bodies.indexOf(body), 1); }
    } else {
      w.carrying = true;
      w.x -= B.carrySpeed * dt;
      if (w.x <= 0) { b.units.splice(b.units.indexOf(w), 1); b.rescued = (b.rescued ?? 0) + 1; }
    }
  }

  // remove the dead and the raiders that got in
  b.corpses = (b.corpses ?? []).filter((c) => (c.age += dt) < 1.6);
  for (const u of [...b.units]) {
    if (u.hp <= 0) {
      b.units.splice(b.units.indexOf(u), 1);
      if (u.kind === 'raider') { b.kills++; b.chitin = (b.chitin ?? 0) + (u.big ? B.brute.chitin : B.raider.chitin); b.corpses.push({ x: u.x, age: 0, big: u.big }); }
      if (u.kind === 'soldier') { b.soldiersLost++; b.nextBody = (b.nextBody ?? 0) + 1; b.bodies.push({ id: b.nextBody, x: u.x, big: u.big }); }
      if (u.kind === 'worker') b.workersLost++;
    } else if (u.kind === 'raider' && u.x <= 10) {
      b.units.splice(b.units.indexOf(u), 1);
      b.breaches++;
    }
  }
  if (!b.units.some((u) => u.kind === 'raider')) endBattle(ctx);
}

function endBattle(ctx: Context) {
  const s = S(ctx), b = s.battle!;
  s.battle = null;
  s.raids++;
  // losses are capped so a raid hurts but never ruins you
  // soldiers being carried in when the fight ends make it home too
  const rescued = Math.min(b.soldiersLost, (b.rescued ?? 0) + b.units.filter((u) => u.carrying).length);
  const medics = Math.max(0.2, 1 + H.medics.per * hl(ctx, 'medics'));
  const soldierLoss = Math.min(b.soldiersLost - rescued, Math.ceil(b.soldiersAtStart * B.maxSoldierLoss * medics));
  const workerLoss = Math.min(b.workersLost, 2);
  const lost = soldierLoss + workerLoss;
  if (lost) { ctx.res.add('ant', -lost); loseFighters(ctx, soldierLoss); }
  const stealShare = Math.min(B.maxSteal, b.breaches * B.stealPerBreach) * Math.max(0.2, 1 + F.plug.per * fl(ctx, 'plug'));
  const stolen = ctx.res.amt('food') * stealShare;
  ctx.res.add('food', -stolen);
  const clean = !b.breaches;
  const chitin = Math.round(((b.chitin ?? 0) + (clean ? waveOf(ctx) * B.wave.clearBonus : 0)) * (1 + H.harvest.per * hl(ctx, 'harvest')));
  const w = waveOf(ctx);
  const honours = clean ? (WAR.honours.perWave + Math.floor(w / 5) * WAR.honours.perFive) * (hasMilestone(ctx, 'endless') ? 2 : 1) : 0;
  if (chitin) ctx.res.add('chitin', chitin);
  s.rivalArmy = Math.max(5, s.rivalArmy - b.kills);
  const parts = [`${b.kills} raiders killed (+${chitin} chitin)`];
  if (b.breaches) parts.push(`${b.breaches} got in and stole ${fmt(stolen)} food`);
  if (lost) parts.push(`${lost} of ours fell`);
  if (rescued) parts.push(`${rescued} wounded carried home`);
  if (clean) { s.won++; s.wave = waveOf(ctx) + 1; giveHonours(ctx, honours); parts.push(`+${honours} honour${honours > 1 ? 's' : ''}`); parts.push(`Wave cleared. Next: wave ${s.wave}, ${describeWave(s.wave)}`); }
  else parts.push(`Some got through, so wave ${waveOf(ctx)} must be fought again`);
  s.lastReport = parts.join('. ') + '.';
  const lines = [`${b.kills} raiders killed`, `+${chitin} chitin`];
  if (honours) lines.push(`+${honours} war honour${honours > 1 ? 's' : ''}`);
  if (soldierLoss) lines.push(`${soldierLoss} soldier${soldierLoss > 1 ? 's' : ''} fell`);
  if (workerLoss) lines.push(`${workerLoss} worker${workerLoss > 1 ? 's' : ''} fell`);
  if (rescued) lines.push(`${rescued} wounded carried home`);
  if (b.breaches) lines.push(`${b.breaches} got in and stole ${fmt(stolen)} food`);
  lines.push(clean ? `Next: wave ${s.wave}` : `Wave ${waveOf(ctx)} must be fought again`);
  showResult(ctx, 'The raid', { win: clean, title: clean ? 'Victory' : 'They got through', lines });
  ctx.log((b.breaches ? 'The raid is over. ' : 'The raid is broken at the entrance. ') + s.lastReport, b.breaches ? 'warn' : 'story');
  s.nextRaid = WAR.provokeCooldown * Math.max(0.2, 1 + H.regroup.per * hl(ctx, 'regroup'));
  if (clean) checkMilestones(ctx);
}

// ---- campaigns ----
function enemyStrength(ctx: Context, i: number) {
  const t = tiles(ctx)[i];
  if (t.o === 'spider') return WAR.spiderPower * (t.core ? 1.5 : 0.6);
  if (t.o === 'rival') return (S(ctx).rivalArmy / rivalTiles(ctx)) * (t.core ? 3 : 1) * WAR.tileDefence.rival + 4;
  return Infinity;
}
const adjacentToYou = (ctx: Context, i: number) => {
  const x = i % MAP.cols, y = Math.floor(i / MAP.cols), T = tiles(ctx);
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
    const nx = x + dx, ny = y + dy;
    return nx >= 0 && ny >= 0 && nx < MAP.cols && ny < MAP.rows && T[ny * MAP.cols + nx].o === 'you';
  });
};
const validTarget = (ctx: Context, i: number | null) => {
  if (i == null) return false;
  const t = tiles(ctx)[i];
  return !!t && t.seen && (t.o === 'rival' || t.o === 'spider') && adjacentToYou(ctx, i);
};

function finishCampaign(ctx: Context) {
  const s = S(ctx), c = s.campaign!;
  s.campaign = null;
  const t = tiles(ctx)[c.target];
  const enemy = enemyStrength(ctx, c.target);
  const ours = c.army * power(ctx) * rand(0.85, 1.15);
  const win = ours >= enemy;
  const lost = Math.min(c.army, Math.ceil(c.army * WAR.campaignLoss * (win ? 1 : 2)));
  ctx.res.add('ant', -lost);
  loseFighters(ctx, lost);
  if (!win) { ctx.log(`The campaign fails. ${lost} soldiers do not return.`, 'warn'); showResult(ctx, 'The campaign', { win: false, title: 'Defeat', lines: ['The tile holds', `${lost} soldiers fell`] }); return; }
  const owner = t.o!;
  const loot = WAR.loot[owner] ?? {};
  const got = Object.entries(loot).map(([r, [lo, hi]]) => { const n = Math.round(rand(lo, hi) * (t.core ? 4 : 1) * (hasMilestone(ctx, 'spoils') ? 2 : 1)); ctx.res.add(r, n); return `${n} ${r}`; });
  if (owner === 'rival') s.rivalArmy = Math.max(5, s.rivalArmy - enemy * 0.5);
  const hon = WAR.honours.campaign * (t.core ? 3 : 1);
  giveHonours(ctx, hon);
  got.push(`${hon} war honours`);
  ctx.bus.emit('map:capture', { x: c.target % MAP.cols, y: Math.floor(c.target / MAP.cols) });
  ctx.log(`Victory. The tile is ours, with ${got.join(', ')}. ${lost} soldiers fell.`);
  showResult(ctx, 'The campaign', { win: true, title: 'Victory', lines: ['The tile is ours', ...got.map((g) => '+' + g), ...(lost ? [`${lost} soldiers fell`] : [])] });
  if (t.core && owner === 'rival') { s.rivalDefeated = true; ctx.flags.add('rival:defeated'); ctx.log('The rival queen is dead. Her mound is ours. The raids stop.'); }
  if (t.core && owner === 'spider') { s.spiderDefeated = true; ctx.flags.add('spider:defeated'); ctx.log('The spider is dead. Its web hangs empty in the wind.'); }
}

export const war: GameSystem = {
  id: 'war',

  init(ctx) {
    ctx.res.define({ id: 'chitin', name: 'Chitin', order: 40, integer: true, group: 'Spoils' });
    ctx.res.define({ id: 'venom', name: 'Venom', order: 41, integer: true, group: 'Spoils' });
    ctx.res.define({ id: 'honour', name: 'War honours', order: 42, integer: true, group: 'Spoils' });
    ctx.state.war = {
      rivalArmy: WAR.rivalStartArmy, nextRaid: 0, warned: false, battle: null, rallyCd: 0,
      forts: {}, campaign: null, wave: 1, raids: 0, won: 0, rivalDefeated: false, spiderDefeated: false, lastReport: '',
    } satisfies WarState;
  },

  isUnlocked: (ctx) => ctx.flags.has('tech:martial'),

  tick(ctx, dt) {
    if (!ctx.flags.has('rival')) return;
    const s = S(ctx);
    ctx.mods.set('soldierPower', 'plating', F.plating.per * fl(ctx, 'plating'));
    ctx.mods.set('soldierPower', 'standards', H.standards.per * hl(ctx, 'standards'));
    ctx.mods.set('hunting', 'firstblood', hasMilestone(ctx, 'hunt') ? 1 : 0);
    ctx.mods.set('expSafety', 'feared', hasMilestone(ctx, 'feared') ? -0.2 : 0);
    ctx.mods.set('claimCost', 'scent', hasMilestone(ctx, 'scent') ? -0.15 : 0);
    ctx.mods.set('lineageGain', 'legend', hasMilestone(ctx, 'legend') ? 0.1 : 0);
    s.rallyCd = Math.max(0, s.rallyCd - dt);
    refill(ctx);
    if (!s.rivalDefeated) {
      s.rivalArmy = Math.min(rivalTiles(ctx) * WAR.rivalArmyPerTile, s.rivalArmy + WAR.rivalGrowthPerSecond * dt);
      if (s.battle) stepBattle(ctx, dt);
      else {
        s.nextRaid = Math.max(0, s.nextRaid - dt); // now: cooldown before you can provoke again
        if (s.autoProvoke && hasMilestone(ctx, 'drums') && s.nextRaid <= 0 && !s.campaign && ctx.res.canAfford(WAR.provokeCost)) {
          ctx.res.spend(WAR.provokeCost);
          startBattle(ctx);
        }
      }
    }
    if (s.campaign) { s.campaign.elapsed += dt; if (s.campaign.elapsed >= s.campaign.duration) finishCampaign(ctx); }
  },

  panel: (() => {
    let fortSection: HTMLElement, campSection: HTMLElement, honourSection: HTMLElement, honourHead: HTMLElement, mileList: HTMLElement, autoWrap: HTMLElement, autoBox: HTMLInputElement;
    let honourUps: ReturnType<typeof upgradeList>;
    let cv: HTMLCanvasElement, status: HTMLElement, ledger: HTMLElement, rallyBtn: ActionButton, refillBox: HTMLInputElement, campBtn: ActionButton, campInfo: HTMLElement, provokeBtn: ActionButton;
    let forts: ReturnType<typeof upgradeList>;
    const campBar = progressBar();
    return {
      title: 'War',
      group: 'War',
      mount(root, ctx) {
        cv = el('canvas.viewer', { width: 320, height: 40, 'aria-label': 'The nest entrance' }) as HTMLCanvasElement;
        status = el('p');
        ledger = el('div.ledger');
        provokeBtn = actionButton({
          ctx, label: 'Provoke a raid', costs: () => WAR.provokeCost,
          desc: 'Lay a false trail to the rival mound. Their raiders follow it to your entrance, where you are waiting. Kills give chitin.',
          enabled: (c) => !S(c).battle && !S(c).rivalDefeated && !S(c).campaign && S(c).nextRaid <= 0,
          onBuy: (c) => startBattle(c),
        });
        rallyBtn = actionButton({
          ctx, label: 'Rally the workers', desc: `Up to ${B.rallyMax} idle workers and foragers rush out to carry the fallen home, and fight if the line reaches them.`,
          enabled: (c) => !!S(c).battle && S(c).rallyCd <= 0, onBuy: (c) => rally(c),
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
            S(c).campaign = { target, army: soldiers(c), elapsed: 0, duration: WAR.campaignTime };
            c.log(`${soldiers(c)} soldiers march out to take enemy ground.`);
          },
        });
        forts = upgradeList(ctx, () => S(ctx).forts, FORTS);
        honourUps = upgradeList(ctx, () => (S(ctx).ups ??= {}), HONOUR_UPS);
        autoBox = el('input', { type: 'checkbox', id: 'war-auto' }) as HTMLInputElement;
        autoBox.addEventListener('change', () => { S(ctx).autoProvoke = autoBox.checked; });
        autoWrap = el('label', { for: 'war-auto', style: 'white-space: nowrap', title: 'Lure the rival again the moment it will take the bait.' }, autoBox, ' Auto-provoke');
        honourHead = el('p.muted');
        mileList = el('div.ledger.miles');
        root.append(
          el('p.flavor', {}, 'They know where we are now. Hold the entrance, then take the fight to them.'),
          el('details.info', {}, el('summary', {}, 'Information'),
          el('p.muted', {}, 'Why fight: every raider killed leaves chitin, and every wave cleared without losses earns war honours. Deeper waves reach war milestones, each a lasting reward for this colony. Chitin builds fortifications, husk halls, training grounds and majors; honours buy honour upgrades.'),
          el('p.muted', {}, 'How it works: your soldiers hold the entrance in a line, majors in front. The fronts fight, and the next steps up when one falls. Nest defence (guard posts, stone tiles, husk halls) bites the front raider from the walls. Our soldiers behind the front spit acid over its shoulder, so a longer line hits harder. Rallied workers carry fallen soldiers home alive, and fight if the line reaches them.')),
          cv, status, el('div.row', {}, provokeBtn.root, rallyBtn.root, refillWrap, autoWrap), ledger,
          honourSection = el('div.section', {}, el('h3', {}, 'War honours'), honourHead, mileList, honourUps.root),
          fortSection = el('div.section', {}, el('h3', {}, 'Fortifications'), forts.root),
          campSection = el('div.section', {}, el('h3', {}, 'Campaign'), el('p.muted', {}, 'Select an enemy tile next to your territory on the Map, then launch.'),
            campInfo, el('div.row', {}, campBtn.root), campBar.root),
        );
      },
      update(_root, ctx) {
        const s = S(ctx);
        drawEntrance(cv, s.battle);
        fortSection.hidden = !ctx.flags.has('tech:fortify');
        campSection.hidden = !ctx.flags.has('tech:campaigns');
        refillBox.checked = !!s.replenish;
        autoBox.checked = !!s.autoProvoke;
        autoWrap.hidden = !hasMilestone(ctx, 'drums');
        honourUps.update(ctx);
        honourSection.hidden = !ctx.flags.has('rival');
        honourHead.textContent = `Deepest wave cleared: ${bestWave(ctx)}. Honours earned: ${honoured(ctx)}. Each milestone is a lasting reward for this colony.`;
        const next = WAR.milestones.find((m) => !hasMilestone(ctx, m.id));
        const shown = WAR.milestones.filter((m) => hasMilestone(ctx, m.id)).map((m) => ({ m, done: true }));
        if (next) shown.push({ m: next, done: false });
        const key = shown.map((x) => x.m.id + x.done).join() + bestWave(ctx);
        if (mileList.dataset.key !== key) {
          mileList.dataset.key = key;
          mileList.replaceChildren(...shown.map(({ m, done }) => el('div', { class: done ? '' : 'next' },
            el('span', { class: done ? '' : 'muted' }, `${done ? '✓' : '○'} Wave ${m.wave}: ${m.name}`),
            el('span', { class: done ? 'muted' : '' }, done ? m.desc : `${m.desc} (${bestWave(ctx)} of ${m.wave})`))));
        }
        provokeBtn.update(ctx); rallyBtn.update(ctx); campBtn.update(ctx); forts.update(ctx);
        if (s.rivalDefeated) status.textContent = 'The rival is gone. The entrance is quiet.';
        else if (s.battle) {
          const r = s.battle.units.filter((u) => u.kind === 'raider').length;
          const ours = s.battle.units.filter((u) => u.kind === 'soldier').length, start = ours + s.battle.soldiersLost;
          const helpers = s.battle.units.filter((u) => u.kind === 'worker').length;
          status.textContent = `Raid in progress: ${r} raiders left, ${ours} of ${start} soldiers standing` + (helpers ? `, ${helpers} workers helping` : '') + `, ${s.battle.kills} killed, ${s.battle.breaches} got in.` + (s.rallyCd > 0 ? ` Rally ready in ${Math.ceil(s.rallyCd)}s.` : '');
        } else status.textContent = 'The rival only attacks when you provoke it. ' +
          (s.nextRaid > 0 ? `They will take the bait again in ${Math.ceil(s.nextRaid / ctx.speed)}s. ` : 'They are ready to take the bait. ') +
          (s.lastReport ? 'Last raid: ' + s.lastReport : '');
        const hold = soldiers(ctx) * B.soldier.atk * power(ctx) + defence(ctx) * B.defenceDps * (1 + F.spitters.per * fl(ctx, 'spitters'));
        ledger.replaceChildren(...[
          ['Rival army', `about ${Math.round(s.rivalArmy)}`],
          ['Next fight', s.rivalDefeated ? 'none' : `wave ${waveOf(ctx)}: ${describeWave(waveOf(ctx))}`],
          ['Your soldiers', `${soldiers(ctx)} (assign them on the Jobs tab)`],
          ['Nest defence', `${defence(ctx)} (guard posts, stone tiles, husk halls)`],
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
          rows.push(['Target', ok ? `${tiles(ctx)[sel].o} ground${tiles(ctx)[sel].core ? ' (their home)' : ''}` : 'Not an enemy tile next to your territory']);
          if (ok) rows.push(['Enemy strength vs yours', `about ${Math.round(enemyStrength(ctx, sel))} vs ${fmt(soldiers(ctx) * power(ctx))}`]);
        }
        campInfo.replaceChildren(...rows.map(([k, v]) => el('div', {}, el('span.muted', {}, k), el('span', {}, v))));
      },
    };
  })(),
};

// ---- the entrance lane: flat pixels, no text ----
const HP_LEFT = '#8fbf5a', HP_LOST = '#b0473c', ACID = '#d4e06a';
/** Blend two #rrggbb colours. */
function mix(a: string, b: string, f: number) {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * f).toString(16).padStart(2, '0')).join('');
}
function drawEntrance(cv: HTMLCanvasElement, b: Battle | null) {
  const c = setup(cv);
  const W = cv.width, H = cv.height;
  const t = performance.now() / 1000;
  rect(c, 0, 0, W, H, PAL.bg);
  rect(c, 0, H - 8, W, 8, PAL.dirt);
  rect(c, 0, H - 22, 10, 14, PAL.hole);    // the entrance
  rect(c, 0, H - 24, 14, 2, PAL.dirt);
  if (!b) {
    for (let i = 0; i < 3; i++) rect(c, 18 + i * 6, H - 11, 3, 2, PAL.you); // a quiet guard
    return;
  }
  const scale = (W - 20) / (WAR.battle.laneLength + 40);
  const X = (x: number) => 12 + x * scale;
  // dead raiders on their backs, legs up, fading into the dirt
  for (const k of b.corpses ?? []) {
    const col = mix(PAL.rival, PAL.bg, Math.min(1, k.age / 1.6));
    const w = k.big ? 6 : 3, x = X(k.x);
    rect(c, x, H - 10, w, 2, col);
    for (let l = 0; l < w; l += 2) rect(c, x + l, H - 11, 1, 1, col);
  }
  // fallen soldiers waiting to be fetched
  for (const body of b.bodies ?? []) if (!body.taken || b.units.some((u) => u.fetch === body.id && !u.carrying)) rect(c, X(body.x), H - 10, body.big ? 6 : 4, 2, mix(PAL.you, PAL.bg, 0.45));
  for (const u of b.units) {
    const x = X(u.x);
    if (x > W) continue;
    const bob = Math.floor(t * 8 + u.x) % 2;
    const col = u.kind === 'raider' ? PAL.rival : u.kind === 'soldier' ? PAL.you : PAL.bone;
    const w = u.big ? 6 : u.kind === 'soldier' ? 4 : 3;
    const low = u.fetch != null ? 2 : 0; // fetchers run along the near side, in front of the line
    if (u.big) rect(c, x, H - 14 - bob, 6, 5, col);
    else rect(c, x, H - 11 - bob + low, w, 2, col);
    if (u.carrying) rect(c, x - 1, H - 14 - bob + low, 4, 2, mix(PAL.you, PAL.bg, 0.3)); // a wounded soldier held overhead
    if (u.hp < u.max) { // health left in green over the lost part in red
      const by = u.big ? H - 17 : H - 14;
      rect(c, x, by, w, 1, HP_LOST);
      rect(c, x, by, Math.max(1, Math.round((u.hp / u.max) * w)), 1, HP_LEFT);
    }
  }
  // acid arcing from the ranks behind our front onto the front raider
  const { raiders, defenders } = lines(b);
  const front = raiders[0], wall = defenders[0];
  if (front && wall && front.x - wall.x <= REACH) {
    helpers(defenders, B.spit).forEach(([d], i) => {
      if (d.kind !== 'soldier') return;
      const p = (t * 1.4 + i * 0.29) % 1;
      const x0 = X(d.x) + 3, x1 = X(front.x) + 1;
      const h = 5 + (i + 1) * 2;
      rect(c, x0 + (x1 - x0) * p, H - 13 - Math.sin(Math.PI * p) * h, 1, 1, ACID);
    });
  }
}
