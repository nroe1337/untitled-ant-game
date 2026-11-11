// War: the rival colony grows, raids your nest, and you fight back.
// Raids play out as a small auto-battle at the nest entrance you can watch.
// Kills give chitin, which other systems need (techniques, chambers, fortifications).
// Campaigns send soldiers to take enemy tiles; this reads ctx.state.map and emits 'map:capture'.
import type { GameSystem, Context } from '../../core/types';
import { actionButton, el, progressBar, type ActionButton } from '../../core/ui';
import { fmt } from '../../core/resources';
import { fromBalance, upgradeList } from '../../core/upgrades';
import { PAL, setup } from '../../core/pixel';
import { WAR, MAP, CASTES } from '../../data/balance';
import { idleAnts } from '../jobs';

const B = WAR.battle;
const F = WAR.fortifications;

/** One stack per kind of ant on each side: a count, and the hit points left on the ant at the front of it. */
type Kind = 'major' | 'soldier' | 'worker' | 'raider' | 'brute';
interface Stack { kind: Kind; n: number; hp: number; max: number; atk: number; start: number; hit?: number; fell?: number }
interface Battle {
  /** ours, in the order the raiders bite them: majors, then soldiers, then rallied workers */
  us: Stack[];
  /** theirs, in the order we bite them: raiders, then brutes */
  them: Stack[];
  chitin?: number; kills: number; breaches: number; soldiersLost: number; majorsLost?: number; workersLost: number; rallied: number; soldiersAtStart: number;
  rescued?: number;
  /** seconds until the next raider slips in, once nobody holds the entrance */
  slip?: number;
  t?: number;
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
// No lanes and no ranks: each kind of ant is one stack. Every ant in a stack bites, every second,
// and the bites land on the enemy's first stack, killing its ants one at a time.
const stack = (kind: Kind, n: number, hp: number, atk: number): Stack => ({ kind, n, hp, max: hp, atk, start: n });
function startBattle(ctx: Context) {
  const s = S(ctx);
  const comp = waveComp(waveOf(ctx));
  const tough = toughness(waveOf(ctx));
  const hp = B.soldier.hp * (1 + F.carapace.per * fl(ctx, 'carapace'));
  const plain = ctx.state.jobs?.assigned?.soldier ?? 0;
  const us: Stack[] = [];
  if (majors(ctx)) us.push(stack('major', majors(ctx), hp * CASTES.major.hp, B.soldier.atk * CASTES.major.atk));
  if (plain) us.push(stack('soldier', plain, hp, B.soldier.atk));
  const them: Stack[] = [stack('raider', comp.raiders, B.raider.hp * tough, B.raider.atk * tough)];
  if (comp.brutes) them.push(stack('brute', comp.brutes, B.brute.hp * tough, B.brute.atk * tough));
  s.battle = { us, them, kills: 0, breaches: 0, soldiersLost: 0, majorsLost: 0, workersLost: 0, rallied: 0, soldiersAtStart: plain + majors(ctx), t: 0 };
  ctx.log(`Wave ${waveOf(ctx)}: the rival takes the bait. ${comp.raiders + comp.brutes} of them pour toward the entrance.`, 'warn');
  if (fl(ctx, 'alarm') || ctx.flags.has('accord:alarm')) rally(ctx);
}

function rally(ctx: Context) {
  const s = S(ctx);
  if (!s.battle || s.rallyCd > 0) return;
  const n = Math.min(B.rallyMax, freeWorkers(ctx) + Math.floor((ctx.state.jobs?.assigned?.forager ?? 0) / 2));
  s.rallyCd = B.rallyCooldown;
  if (!n) return;
  const w = s.battle.us.find((x) => x.kind === 'worker');
  if (w) { w.n += n; w.start += n; } else s.battle.us.push(stack('worker', n, B.worker.hp, B.worker.atk));
  s.battle.rallied += n;
  ctx.log(`${n} workers drop what they carry and rush to the entrance.`, 'info');
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
  b.t = (b.t ?? 0) + dt;
  for (const x of [...b.us, ...b.them]) { x.hit = Math.max(0, (x.hit ?? 0) - dt); x.fell = Math.max(0, (x.fell ?? 0) - dt); }
  const P = B.pace * dt;
  const blunt = Math.max(0.2, 1 - F.thorns.per * fl(ctx, 'thorns'));
  const ours = alive(b.us), theirs = alive(b.them);
  // the walls (nest defence) bite whoever is in front, all fight long
  const towers = defence(ctx) * B.defenceDps * (1 + F.spitters.per * fl(ctx, 'spitters'));
  const outDmg = ours.reduce((t, x) => t + x.n * x.atk * (x.kind === 'worker' ? 1 : power(ctx)), 0) + towers;
  const inDmg = theirs.reduce((t, x) => t + x.n * x.atk, 0) * blunt;
  biteSide(b.them, outDmg * P, (x, n) => {
    b.kills += n;
    b.chitin = (b.chitin ?? 0) + n * (x.kind === 'brute' ? B.brute.chitin : B.raider.chitin);
  });
  if (ours.length) {
    // rallied workers carry the fallen home: each one at the entrance makes a rescue likelier
    const carriers = b.us.find((x) => x.kind === 'worker')?.n ?? 0;
    const save = Math.min(B.rescueMax, carriers * B.rescuePerWorker);
    biteSide(b.us, inDmg * P, (x, n) => {
      if (x.kind === 'worker') { b.workersLost += n; return; }
      let saved = 0;
      for (let i = 0; i < n; i++) if (Math.random() < save) saved++;
      b.rescued = (b.rescued ?? 0) + saved;
      if (x.kind === 'major') b.majorsLost = (b.majorsLost ?? 0) + n; else b.soldiersLost += n;
    });
  } else {
    // nobody holds the entrance: they slip in one by one while the walls keep biting
    b.slip = (b.slip ?? B.slipEvery) - dt;
    if (b.slip <= 0) {
      b.slip = B.slipEvery;
      const x = alive(b.them)[0];
      if (x) { x.n--; x.hp = x.max; b.breaches++; }
    }
  }
  if (!alive(b.them).length) endBattle(ctx);
}

function endBattle(ctx: Context) {
  const s = S(ctx), b = s.battle!;
  s.battle = null;
  s.raids++;
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
    // the dead come off their jobs: majors in the share they fell
    const bigs = fell ? Math.round(soldierLoss * (b.majorsLost ?? 0) / fell) : 0;
    loseFighters(ctx, soldierLoss - bigs);
    const a = ctx.state.jobs?.assigned as Record<string, number> | undefined;
    if (a && bigs) { const k = Math.min(bigs, a.major ?? 0); a.major -= k; if (S(ctx).replenish) { S(ctx).refill ??= { soldier: 0, major: 0 }; S(ctx).refill!.major += k; } }
  }
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
    if (s.battle && !s.battle.us) s.battle = null; // a raid saved in the old lane format: call it off
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
          el('p.muted', {}, 'How it works: every ant on both sides fights at once, so numbers and strength are what count. Each side bites the first group of the other: raiders take our majors first, then soldiers, then rallied workers; we cut down raiders first, then brutes. Nest defence (guard posts, stone tiles, husk halls) bites from the walls the whole fight. Rallied workers fight too, and carry fallen soldiers home alive. If nobody is left at the entrance, raiders slip in one by one and steal food.')),
          field.root, status, el('div.row', {}, provokeBtn.root, rallyBtn.root, refillWrap, autoWrap), ledger,
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
          const b = s.battle, sum = (xs: Stack[]) => xs.reduce((t, x) => t + x.n, 0);
          const fighters = sum(b.us.filter((x) => x.kind !== 'worker')), helpers = b.us.find((x) => x.kind === 'worker')?.n ?? 0;
          status.textContent = `Raid in progress: ${sum(b.them)} of them left, ${fighters} of ${b.soldiersAtStart} fighters standing` + (helpers ? `, ${helpers} workers helping` : '') + `, ${b.kills} killed` + (b.rescued ? `, ${b.rescued} wounded carried in` : '') + (b.breaches ? `, ${b.breaches} got in` : '') + '.' + (s.rallyCd > 0 ? ` Rally ready in ${Math.ceil(s.rallyCd)}s.` : '');
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

// ---- the entrance: one ant for each stack, with the front ant's health and the count over its head ----
const NAMES: Record<Kind, string> = { major: 'Majors', soldier: 'Soldiers', worker: 'Workers', raider: 'Raiders', brute: 'Brutes' };
const LEGS_A = ['...#..#..#......', '..#..#..#.......'];
const LEGS_B = ['...#..#..#......', '....#..#..#.....'];
/** Pixel ants, facing right. '#' is body. */
const SHAPES: Record<'small' | 'major' | 'brute', string[]> = {
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
function drawAnt(cv: HTMLCanvasElement, x: Stack, theirs: boolean, fighting: boolean) {
  const c = setup(cv);
  c.clearRect(0, 0, CW, CH);
  const shape = SHAPES[x.kind === 'major' ? 'major' : x.kind === 'brute' ? 'brute' : 'small'];
  const t = performance.now() / 1000;
  const step = fighting ? Math.floor(t * 6) % 2 : 0;
  const lunge = fighting && x.n > 0 && Math.floor(t * 2.5 + (theirs ? 0.5 : 0)) % 2 ? 1 : 0;
  const rows = [...shape, ...(step ? LEGS_B : LEGS_A)];
  const top = CH - rows.length;
  let col = theirs ? PAL.rival : x.kind === 'worker' ? PAL.bone : PAL.you;
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
}
interface Card { root: HTMLElement; fill: HTMLElement; count: HTMLElement; cv: HTMLCanvasElement }
function card(kind: Kind): Card {
  const fill = el('span.fill'), count = el('span.fcount');
  const cv = el('canvas', { width: CW, height: CH, 'aria-hidden': 'true' }) as HTMLCanvasElement;
  const root = el('div.fighter', {}, el('div.fhead', {}, el('span.bar', {}, fill), count), cv, el('div.fname', {}, NAMES[kind]));
  return { root, fill, count, cv };
}
/** The entrance, drawn as stacks. Idle: our fighters at the gate and the next wave waiting, faded. */
function battleField() {
  const us = el('div.side'), them = el('div.side.them');
  const root = el('div.field', { role: 'img', 'aria-label': 'The nest entrance' }, us, el('div.gate', {}, 'vs'), them);
  const cards = new Map<string, Card>();
  let key = '';
  return {
    root,
    update(ctx: Context) {
      const s = S(ctx), b = s.battle;
      let ours: Stack[], theirs: Stack[];
      if (b) { ours = b.us; theirs = b.them; }
      else {
        const hp = B.soldier.hp * (1 + F.carapace.per * fl(ctx, 'carapace'));
        const plain = ctx.state.jobs?.assigned?.soldier ?? 0;
        ours = [];
        if (majors(ctx)) ours.push(stack('major', majors(ctx), hp * CASTES.major.hp, 0));
        if (plain || !majors(ctx)) ours.push(stack('soldier', plain, hp, 0));
        const comp = waveComp(waveOf(ctx)), tough = toughness(waveOf(ctx));
        theirs = s.rivalDefeated ? [] : [stack('raider', comp.raiders, B.raider.hp * tough, 0)];
        if (comp.brutes && !s.rivalDefeated) theirs.push(stack('brute', comp.brutes, B.brute.hp * tough, 0));
      }
      const k = (b ? 'b' : 'i') + ours.map((x) => x.kind).join() + '|' + theirs.map((x) => x.kind).join();
      if (k !== key) {
        key = k;
        cards.clear();
        const mk = (x: Stack, side: string) => { const cd = card(x.kind); cards.set(side + x.kind, cd); return cd.root; };
        us.replaceChildren(...ours.map((x) => mk(x, 'u')));
        them.replaceChildren(...theirs.map((x) => mk(x, 't')));
      }
      root.classList.toggle('idle', !b);
      const show = (x: Stack, side: string) => {
        const cd = cards.get(side + x.kind);
        if (!cd) return;
        cd.fill.style.width = `${x.n > 0 ? Math.max(4, (x.hp / x.max) * 100) : 0}%`;
        cd.count.textContent = `×${x.n}`;
        cd.root.classList.toggle('down', x.n <= 0);
        cd.root.classList.toggle('lost', (x.fell ?? 0) > 0);
        drawAnt(cd.cv, x, side === 't', !!b);
      };
      ours.forEach((x) => show(x, 'u'));
      theirs.forEach((x) => show(x, 't'));
    },
  };
}
