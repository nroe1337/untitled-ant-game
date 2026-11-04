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

const B = WAR.battle;
const F = WAR.fortifications;

interface Unit { x: number; hp: number; max: number; kind: 'raider' | 'soldier' | 'worker'; big?: boolean; atk?: number; speed?: number }
interface Battle { units: Unit[]; chitin?: number; kills: number; breaches: number; soldiersLost: number; workersLost: number; rallied: number; soldiersAtStart: number }
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
}
const S = (ctx: Context) => ctx.state.war as WarState;
const fl = (ctx: Context, id: keyof typeof F) => S(ctx).forts[id] ?? 0;
const FORTS = fromBalance(F);
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

// ---- the entrance battle ----
function startBattle(ctx: Context) {
  const s = S(ctx);
  const comp = waveComp(waveOf(ctx));
  const n = comp.raiders + comp.brutes;
  const units: Unit[] = [];
  const tough = toughness(waveOf(ctx));
  for (let i = 0; i < comp.raiders; i++) units.push({ kind: 'raider', x: B.laneLength + i * 2.5, hp: B.raider.hp * tough, max: B.raider.hp * tough, atk: B.raider.atk * tough, speed: B.raider.speed });
  for (let i = 0; i < comp.brutes; i++) units.push({ kind: 'raider', big: true, x: B.laneLength + comp.raiders * 2.5 + 6 + i * 4, hp: B.brute.hp * tough, max: B.brute.hp * tough, atk: B.brute.atk * tough, speed: B.brute.speed });
  const hp = B.soldier.hp * (1 + F.carapace.per * fl(ctx, 'carapace'));
  const plain = ctx.state.jobs?.assigned?.soldier ?? 0;
  for (let i = 0; i < Math.min(40, plain); i++) units.push({ kind: 'soldier', x: 40 + (i % 8) * 4, hp, max: hp });
  for (let i = 0; i < Math.min(20, majors(ctx)); i++) units.push({ kind: 'soldier', big: true, x: 44 + (i % 6) * 5, hp: hp * CASTES.major.hp, max: hp * CASTES.major.hp, atk: B.soldier.atk * CASTES.major.atk });
  s.battle = { units, kills: 0, breaches: 0, soldiersLost: 0, workersLost: 0, rallied: 0, soldiersAtStart: soldiers(ctx) };
  ctx.log(`Wave ${waveOf(ctx)}: the rival takes the bait. ${n} of them pour toward the entrance.`, 'warn');
  if (fl(ctx, 'alarm')) rally(ctx);
}

function rally(ctx: Context) {
  const s = S(ctx);
  if (!s.battle || s.rallyCd > 0) return;
  const n = Math.min(B.rallyMax, freeWorkers(ctx) + Math.floor((ctx.state.jobs?.assigned?.forager ?? 0) / 2));
  for (let i = 0; i < n; i++) s.battle.units.push({ kind: 'worker', x: 30 + (i % 6) * 4, hp: B.worker.hp, max: B.worker.hp });
  s.battle.rallied += n;
  s.rallyCd = B.rallyCooldown;
  if (n) ctx.log(`${n} workers drop what they carry and rush to the entrance.`, 'info');
}

function stepBattle(ctx: Context, dt: number) {
  const s = S(ctx), b = s.battle!;
  const raiders = b.units.filter((u) => u.kind === 'raider').sort((a, z) => a.x - z.x);
  const defenders = b.units.filter((u) => u.kind !== 'raider').sort((a, z) => z.x - a.x);
  const front = raiders[0];
  const wall = defenders[0];
  const slow = 1 + F.thorns.per * fl(ctx, 'thorns');

  // towers (nest defence) shoot the front raider in range
  if (front && front.x < B.guardRange) front.hp -= defence(ctx) * B.defenceDps * (1 + F.spitters.per * fl(ctx, 'spitters')) * dt;

  // raiders can't walk through a living defender: they pile up against the front one and bite it
  for (const r of raiders) {
    if (wall && r.x - wall.x < 6) wall.hp -= (r.atk ?? B.raider.atk) * dt;
    else r.x -= ((r.speed ?? B.raider.speed) / slow) * dt;
    if (wall) r.x = Math.max(r.x, wall.x + 4);
  }
  // defenders in reach hit the front raider
  if (front) for (const d of defenders) {
    if (Math.abs(front.x - d.x) < 7) front.hp -= (d.kind === 'soldier' ? (d.atk ?? B.soldier.atk) * power(ctx) : B.worker.atk) * dt;
    else if (d.x < front.x - 7) d.x = Math.min(d.x + 6 * dt, front.x - 5); // step forward to meet them
  }
  // remove the dead and the raiders that got in
  for (const u of [...b.units]) {
    if (u.hp <= 0) {
      b.units.splice(b.units.indexOf(u), 1);
      if (u.kind === 'raider') { b.kills++; b.chitin = (b.chitin ?? 0) + (u.big ? B.brute.chitin : B.raider.chitin); }
      if (u.kind === 'soldier') b.soldiersLost++;
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
  const soldierLoss = Math.min(b.soldiersLost, Math.ceil(b.soldiersAtStart * B.maxSoldierLoss));
  const workerLoss = Math.min(b.workersLost, 2);
  const lost = soldierLoss + workerLoss;
  if (lost) ctx.res.add('ant', -lost);
  const stealShare = Math.min(B.maxSteal, b.breaches * B.stealPerBreach) * Math.max(0.2, 1 + F.plug.per * fl(ctx, 'plug'));
  const stolen = ctx.res.amt('food') * stealShare;
  ctx.res.add('food', -stolen);
  const clean = !b.breaches;
  const chitin = (b.chitin ?? 0) + (clean ? waveOf(ctx) * B.wave.clearBonus : 0);
  if (chitin) ctx.res.add('chitin', chitin);
  s.rivalArmy = Math.max(5, s.rivalArmy - b.kills);
  const parts = [`${b.kills} raiders killed (+${chitin} chitin)`];
  if (b.breaches) parts.push(`${b.breaches} got in and stole ${fmt(stolen)} food`);
  if (lost) parts.push(`${lost} of ours fell`);
  if (clean) { s.won++; s.wave = waveOf(ctx) + 1; parts.push(`Wave cleared. Next: wave ${s.wave}, ${describeWave(s.wave)}`); }
  else parts.push(`Some got through, so wave ${waveOf(ctx)} must be fought again`);
  s.lastReport = parts.join('. ') + '.';
  ctx.log((b.breaches ? 'The raid is over. ' : 'The raid is broken at the entrance. ') + s.lastReport, b.breaches ? 'warn' : 'story');
  s.nextRaid = WAR.provokeCooldown;
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
  if (!win) { ctx.log(`The campaign fails. ${lost} soldiers do not return.`, 'warn'); return; }
  const owner = t.o!;
  const loot = WAR.loot[owner] ?? {};
  const got = Object.entries(loot).map(([r, [lo, hi]]) => { const n = Math.round(rand(lo, hi) * (t.core ? 4 : 1)); ctx.res.add(r, n); return `${n} ${r}`; });
  if (owner === 'rival') s.rivalArmy = Math.max(5, s.rivalArmy - enemy * 0.5);
  ctx.bus.emit('map:capture', { x: c.target % MAP.cols, y: Math.floor(c.target / MAP.cols) });
  ctx.log(`Victory. The tile is ours, with ${got.join(', ')}. ${lost} soldiers fell.`);
  if (t.core && owner === 'rival') { s.rivalDefeated = true; ctx.flags.add('rival:defeated'); ctx.log('The rival queen is dead. Her mound is ours. The raids stop.'); }
  if (t.core && owner === 'spider') { s.spiderDefeated = true; ctx.flags.add('spider:defeated'); ctx.log('The spider is dead. Its web hangs empty in the wind.'); }
}

export const war: GameSystem = {
  id: 'war',

  init(ctx) {
    ctx.res.define({ id: 'chitin', name: 'Chitin', order: 40, integer: true, group: 'Spoils' });
    ctx.res.define({ id: 'venom', name: 'Venom', order: 41, integer: true, group: 'Spoils' });
    ctx.state.war = {
      rivalArmy: WAR.rivalStartArmy, nextRaid: 0, warned: false, battle: null, rallyCd: 0,
      forts: {}, campaign: null, wave: 1, raids: 0, won: 0, rivalDefeated: false, spiderDefeated: false, lastReport: '',
    } satisfies WarState;
  },

  isUnlocked: (ctx) => ctx.flags.has('tech:martial'),

  tick(ctx, dt) {
    if (!ctx.flags.has('rival')) return;
    const s = S(ctx);
    s.rallyCd = Math.max(0, s.rallyCd - dt);
    if (!s.rivalDefeated) {
      s.rivalArmy = Math.min(rivalTiles(ctx) * WAR.rivalArmyPerTile, s.rivalArmy + WAR.rivalGrowthPerSecond * dt);
      if (s.battle) stepBattle(ctx, dt);
      else {
        s.nextRaid = Math.max(0, s.nextRaid - dt); // now: cooldown before you can provoke again
      }
    }
    if (s.campaign) { s.campaign.elapsed += dt; if (s.campaign.elapsed >= s.campaign.duration) finishCampaign(ctx); }
  },

  panel: (() => {
    let fortSection: HTMLElement, campSection: HTMLElement;
    let cv: HTMLCanvasElement, status: HTMLElement, ledger: HTMLElement, rallyBtn: ActionButton, campBtn: ActionButton, campInfo: HTMLElement, provokeBtn: ActionButton;
    let forts: ReturnType<typeof upgradeList>;
    const campBar = progressBar();
    return {
      title: 'War',
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
          ctx, label: 'Rally the workers', desc: `Up to ${B.rallyMax} idle workers and foragers join the fight.`,
          enabled: (c) => !!S(c).battle && S(c).rallyCd <= 0, onBuy: (c) => rally(c),
        });
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
        root.append(
          el('p.flavor', {}, 'They know where we are now. Hold the entrance, then take the fight to them.'),
          cv, status, el('div.row', {}, provokeBtn.root, rallyBtn.root), ledger,
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
        provokeBtn.update(ctx); rallyBtn.update(ctx); campBtn.update(ctx); forts.update(ctx);
        if (s.rivalDefeated) status.textContent = 'The rival is gone. The entrance is quiet.';
        else if (s.battle) {
          const r = s.battle.units.filter((u) => u.kind === 'raider').length;
          status.textContent = `Raid in progress: ${r} raiders left, ${s.battle.kills} killed, ${s.battle.breaches} got in.` + (s.rallyCd > 0 ? ` Rally ready in ${Math.ceil(s.rallyCd)}s.` : '');
        } else status.textContent = 'The rival only attacks when you provoke it. ' +
          (s.nextRaid > 0 ? `They will take the bait again in ${Math.ceil(s.nextRaid / ctx.speed)}s. ` : 'They are ready to take the bait. ') +
          (s.lastReport ? 'Last raid: ' + s.lastReport : '');
        const hold = soldiers(ctx) * B.soldier.atk * power(ctx) + defence(ctx) * B.defenceDps * (1 + F.spitters.per * fl(ctx, 'spitters'));
        ledger.replaceChildren(...[
          ['Rival army', `about ${Math.round(s.rivalArmy)}`],
          ['Next fight', s.rivalDefeated ? 'none' : `wave ${waveOf(ctx)}: ${describeWave(waveOf(ctx))}`],
          ['Your soldiers', `${soldiers(ctx)} (assign them on the Colony tab)`],
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
  for (const u of b.units) {
    const x = 12 + u.x * scale;
    if (x > W) continue;
    const bob = Math.floor(t * 8 + u.x) % 2;
    const col = u.kind === 'raider' ? PAL.rival : u.kind === 'soldier' ? PAL.you : PAL.bone;
    if (u.big) rect(c, x, H - 14 - bob, 6, 5, col);
    else rect(c, x, H - 11 - bob, u.kind === 'soldier' ? 4 : 3, 2, col);
    if (u.hp < u.max) rect(c, x, H - 15, Math.max(1, Math.round((u.hp / u.max) * 4)), 1, col);
  }
}
