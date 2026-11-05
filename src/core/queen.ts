// The queen, drawn in the flat pixel style. She grows in two ways:
//  - fat (0..1): within one colony her abdomen swells as the colony grows.
//  - tier (0..6): across prestige she changes for good. A slim founding queen becomes a banded,
//    tended egg sac, then a sac fed by tubes, then a sac in a cage of ribs, and in the Age of Orbit
//    a vast pale egg wired into the walls, her small body curled up inside, her head a machine.
//    From the Age of Industry on she is more machine each age: tubes, braces, a lens, servo arms,
//    plating and, in orbit, thrusters.
// Pure drawing: no game state, so any view can use it.
import { PAL, blob, rect } from './pixel';

export interface QueenLook { tier: number; fat: number }

const MEM = '#e2d2b2';       // stretched membrane between the plates
const MEM_DARK = '#b89c7c';  // its shadowed underside
const FLESH = '#c98f78';
const RIM = '#8c4b3c';
const VEIN = '#a8473a';
const PLATE = PAL.you;       // the hard plates, which never grow
const METAL = PAL.stone;
const CLAMP = PAL.paved;
const NURSE = '#7a3a24';
const GLOW = '#8fd0c0';

/** How big the abdomen is for a look. */
function sac(l: QueenLook) {
  const s = Math.min(6, l.tier) + Math.max(0, Math.min(1, l.fat));
  return { s, rx: Math.round(4 + s * 4), ry: Math.round(2 + s * 2.2) };
}

/** The space the sprite needs, so the nest can dig her cell to fit. */
export function queenSize(l: QueenLook) {
  if (l.tier >= 6) return { w: 112, h: 80 };
  const { rx, ry } = sac(l);
  return { w: rx * 2 + 18 + (l.tier >= 3 ? 14 : 0), h: ry * 2 + 8 + (l.tier >= 4 ? 18 : 0) };
}

const inEllipse = (dx: number, dy: number, rx: number, ry: number) =>
  (dx * dx) / ((rx + 0.5) * (rx + 0.5)) + (dy * dy) / ((ry + 0.5) * (ry + 0.5)) <= 1;

function px(c: CanvasRenderingContext2D, x: number, y: number, color: string) { rect(c, x, y, 1, 1, color); }

/** Head, thorax and legs, facing right, with the waist at (x, y). cyber 0..3 swaps flesh for machine. */
function body(c: CanvasRenderingContext2D, x: number, y: number, t: number, wings: boolean, cyber = 0) {
  const twitch = Math.sin(t * 3) > 0.7 ? 1 : 0;
  const leg = cyber >= 1 ? METAL : PLATE;
  blob(c, x + 3, y, 3, 2, PLATE);              // thorax
  if (cyber >= 1) { rect(c, x - 1, y - 2, 2, 5, CLAMP); rect(c, x + 2, y - 3, 3, 1, METAL); } // collar and spine plate
  if (cyber >= 2) {                            // a visor head with one lens
    blob(c, x + 8, y - 1 + twitch, 3, 2, METAL);
    rect(c, x + 9, y - 2 + twitch, 2, 2, Math.floor(t * 1.5) % 4 === 0 ? PAL.bone : GLOW);
    rect(c, x + 7, y - 5, 1, 3, METAL); rect(c, x + 6, y - 7, 3, 2, CLAMP);   // antenna mast and dish
    px(c, x + 7, y - 8, Math.floor(t * 3) % 2 ? GLOW : CLAMP);
  } else {
    blob(c, x + 8, y - 1 + twitch, 2, 2, PLATE); // head
    px(c, x + 11, y - 3, PLATE); px(c, x + 12, y - 4 + twitch, PLATE); // antenna
  }
  if (cyber >= 1) px(c, x + 10, y - 1 + twitch, GLOW); // an implant at the brow
  for (let i = 0; i < 3; i++) { px(c, x + 1 + i * 2, y + 3, leg); px(c, x + i * 2, y + 4, leg); if (cyber >= 1) px(c, x + i * 2, y + 5, CLAMP); }
  if (wings) { rect(c, x, y - 4, 5, 1, PAL.bone); rect(c, x - 2, y - 3, 4, 1, PAL.bone); }
}

/** Servo arms that reach round from her back, each holding a fresh egg. */
function servoArms(c: CanvasRenderingContext2D, gx: number, y: number, rx: number, ry: number, t: number, n: number) {
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const sx = gx + Math.round(rx * (0.2 + 0.25 * i) * (i % 3 === 0 ? -1 : 1)), sy = y - ry;
    const swing = Math.round(Math.sin(t * 0.9 + i * 1.3) * 3);
    const ex = sx + side * (8 + swing), ey = sy - 8;
    const hx = ex + side * 5, hy = ey + 6;
    for (let k = 0; k <= 8; k++) rect(c, Math.round(sx + (ex - sx) * k / 8), Math.round(sy + (ey - sy) * k / 8), 2, 2, METAL);
    for (let k = 0; k <= 5; k++) rect(c, Math.round(ex + (hx - ex) * k / 5), Math.round(ey + (hy - ey) * k / 5), 1, 1, METAL);
    rect(c, ex - 1, ey - 1, 3, 3, CLAMP);           // elbow joint
    rect(c, hx - 1, hy, 3, 1, METAL);               // gripper
    rect(c, hx - 1, hy + 1, 2, 2, PAL.bone);        // the egg it holds
  }
}

/** Riveted plates bolted onto the sac. */
function plating(c: CanvasRenderingContext2D, gx: number, y: number, rx: number, ry: number, n: number) {
  for (let i = 0; i < n; i++) {
    const dx = Math.round(-rx * 0.7 + (i * rx * 1.4) / Math.max(1, n - 1)), dy = Math.round(ry * (i % 2 ? 0.25 : -0.15));
    rect(c, gx + dx - 3, y + dy - 2, 7, 5, CLAMP);
    rect(c, gx + dx - 3, y + dy + 2, 7, 1, METAL);
    px(c, gx + dx - 2, y + dy - 1, METAL); px(c, gx + dx + 2, y + dy - 1, METAL);
  }
}

/** Thrusters under her, flickering. */
function thrusters(c: CanvasRenderingContext2D, x: number, y: number, t: number, n: number, gap: number) {
  for (let i = 0; i < n; i++) {
    const tx = x + Math.round((i - (n - 1) / 2) * gap);
    rect(c, tx - 3, y, 7, 3, METAL); rect(c, tx - 2, y + 3, 5, 2, CLAMP);
    const f = Math.floor(t * 8 + i * 3) % 3;
    rect(c, tx - 1, y + 5, 3, 1 + f, PAL.amber); if (f) px(c, tx, y + 6 + f, GLOW);
  }
}

/** The swollen abdomen: membrane with the plates stretched apart, centred at (gx, y). */
function abdomen(c: CanvasRenderingContext2D, gx: number, y: number, rx: number, ry: number, s: number, tier: number, t: number) {
  if (s < 1.2) { blob(c, gx, y, rx, ry, PLATE); return; }
  blob(c, gx, y, rx, ry, MEM);
  // shadowed belly
  for (let dy = Math.ceil(ry * 0.45); dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++)
    if (inEllipse(dx, dy, rx, ry) && (dy > ry * 0.7 || (dx + dy) % 2 === 0)) px(c, gx + dx, y + dy, MEM_DARK);
  // the plates keep their size, so they drift apart as she swells
  const bands = 5;
  for (let b = 0; b < bands; b++) {
    const bx = Math.round(gx - rx + ((b + 0.5) * 2 * rx) / bands);
    const w = Math.max(2, Math.round(6 - s * 0.6));
    for (let dx = 0; dx < w; dx++) for (let dy = -ry; dy <= Math.round(ry * 0.35); dy++)
      if (inEllipse(bx + dx - gx, dy, rx, ry)) px(c, bx + dx, y + dy, PLATE);
  }
  // veins over the membrane once she is very large
  if (tier >= 3) {
    for (let v = 0; v < 3; v++) for (let dx = -rx; dx <= rx; dx++) {
      const dy = Math.round(ry * (0.15 + v * 0.22) + Math.sin(dx * 0.35 + v * 2 + t * 0.6) * 2);
      if (inEllipse(dx, dy, rx - 1, ry - 1) && (dx + v) % 3 !== 0) px(c, gx + dx, y + dy, VEIN);
    }
  }
}

/** Small workers that tend her, shuffling round the sac. */
function nurses(c: CanvasRenderingContext2D, gx: number, y: number, rx: number, ry: number, n: number, t: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.15 + (i / Math.max(1, n - 1)) * 0.7) + Math.sin(t * 0.7 + i) * 0.05;
    const top = i % 2 === 0;
    const nx = gx + Math.cos(a) * (rx + 3) * (i % 3 === 0 ? -1 : 1);
    const ny = y + (top ? -1 : 1) * (Math.sin(a) * (ry + 2));
    const bob = Math.sin(t * 4 + i * 1.7) > 0 ? 1 : 0;
    rect(c, nx - 2, ny - 1 + bob, 4, 2, NURSE);
    px(c, nx + (nx < gx ? 2 : -3), ny - 1 + bob, NURSE);
  }
}

/** Eggs she lays from the tip, drifting away behind her. */
function eggTrail(c: CanvasRenderingContext2D, gx: number, y: number, rx: number, t: number) {
  for (let i = 0; i < 4; i++) {
    const d = ((t * 3 + i * 4) % 16);
    rect(c, gx - rx - 2 - d, y + 1 + (i % 2), 2, 2, PAL.bone);
  }
}

/** Feeding tubes from the ceiling, clamped into the sac, with food pulsing down them. */
function tubes(c: CanvasRenderingContext2D, gx: number, y: number, rx: number, ry: number, t: number, n: number) {
  for (let i = 0; i < n; i++) {
    const tx = Math.round(gx - rx * 0.6 + (i * rx * 1.2) / Math.max(1, n - 1));
    const dy = Math.round(ry * Math.sqrt(Math.max(0, 1 - ((tx - gx) / (rx + 0.5)) ** 2)));
    const top = y - ry - 10, end = y - dy;
    rect(c, tx - 1, top, 2, end - top + 1, METAL);
    rect(c, tx - 2, end - 1, 4, 2, CLAMP);
    const p = Math.floor((t * 6 + i * 5) % Math.max(1, end - top));
    rect(c, tx - 1, top + p, 2, 2, PAL.amber);
  }
}

/** A cage of ribs over the sac with lights along it. */
function ribs(c: CanvasRenderingContext2D, gx: number, y: number, rx: number, ry: number, t: number) {
  for (let r = -2; r <= 2; r++) {
    const bx = Math.round(gx + (r * rx) / 2.6);
    for (let dy = -ry - 1; dy <= ry + 1; dy++) if (inEllipse(bx - gx, dy, rx + 1, ry + 1) && !inEllipse(bx - gx, dy, rx - 3, ry - 3) || (inEllipse(bx - gx, dy, rx + 1, ry + 1) && dy % 2 === 0)) px(c, bx, y + dy, METAL);
    const on = Math.floor(t * 2 + r) % 3 === 0;
    rect(c, bx - 1, y - Math.round(ry * 0.8), 2, 2, on ? GLOW : CLAMP);
  }
}

/** The last form: a huge pale egg, wired into the walls, the queen curled up inside. */
function egg(c: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const beat = Math.sin(t * 1.6) > 0.85 ? 1 : 0;
  const rx = 34 + beat, ry = 25 + beat;
  // cables out to the cell walls and floor
  const cables = [[-46, -22], [-48, 6], [-30, 30], [30, 30], [48, 4], [44, -24], [0, -32]];
  cables.forEach(([ex, ey], i) => {
    const steps = 24;
    for (let k = 0; k <= steps; k++) {
      const f = k / steps;
      const cx = Math.round(x + ex * f), cy = Math.round(y + ey * f + Math.sin(f * Math.PI) * (i % 2 ? 4 : -4));
      rect(c, cx, cy, 2, 2, METAL);
    }
    const f = ((t * 0.5 + i * 0.37) % 1);
    rect(c, Math.round(x + ex * f), Math.round(y + ey * f + Math.sin(f * Math.PI) * (i % 2 ? 4 : -4)), 2, 2, GLOW);
    rect(c, x + ex - 2, y + ey - 2, 5, 5, CLAMP);
  });
  // the egg itself: a rim, then pale flesh seen half through (dithered), darker below
  blob(c, x, y, rx + 1, ry + 1, RIM);
  for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
    if (!inEllipse(dx, dy, rx, ry)) continue;
    const shade = dy / ry + dx / rx * 0.3;
    const col = shade > 0.55 ? FLESH : shade > 0.1 ? ((dx + dy) % 2 === 0 ? MEM : FLESH) : MEM;
    px(c, x + dx, y + dy, col);
  }
  // the queen inside, curled, seen through the shell: only every other pixel shows
  const inner = (qx: number, qy: number, w: number, h: number) => {
    for (let dy = -h; dy <= h; dy++) for (let dx = -w; dx <= w; dx++)
      if (inEllipse(dx, dy, w, h) && (qx + dx + qy + dy) % 2 === 0) px(c, qx + dx, qy + dy, RIM);
  };
  const sway = Math.round(Math.sin(t * 0.4) * 1);
  inner(x - 3 + sway, y + 3, 11, 8);     // her abdomen, folded under
  inner(x + 8 + sway, y - 4, 4, 3);      // thorax
  inner(x + 11 + sway, y - 10, 3, 3);    // head tucked down
  // veins branching over the shell
  for (let v = 0; v < 6; v++) {
    let vx = x + Math.round(Math.cos(v * 1.05) * rx * 0.9), vy = y + Math.round(Math.sin(v * 1.05) * ry * 0.9);
    for (let k = 0; k < 18; k++) {
      vx += Math.round(Math.cos(v * 1.05 + Math.PI + Math.sin(k * 0.7 + v) * 0.8));
      vy += Math.round(Math.sin(v * 1.05 + Math.PI + Math.sin(k * 0.7 + v) * 0.8));
      if (inEllipse(vx - x, vy - y, rx - 1, ry - 1)) px(c, vx, vy, VEIN);
    }
  }
  // a glint
  rect(c, x - 14, y - 16, 4, 2, PAL.bone); rect(c, x - 16, y - 14, 2, 2, PAL.bone);
  // the machine grown over her: plates, a ring of lights, servo arms, thrusters, and her armoured
  // head and thorax fused to the front of the egg, still watching
  plating(c, x - 4, y + 4, rx - 6, ry - 8, 4);
  for (let dx = -rx + 4; dx <= rx - 4; dx += 6) rect(c, x + dx, y + ry - 4, 3, 2, Math.floor(t * 2 + dx) % 3 === 0 ? GLOW : CLAMP);
  servoArms(c, x, y, rx, ry, t, 4);
  thrusters(c, x, y + ry + 2, t, 3, 18);
  rect(c, x + rx - 4, y - 6, 6, 10, METAL);         // the socket that joins her to the egg
  body(c, x + rx + 1, y - 2, t, false, 3);
}

/** Draw the queen centred on (x, y). t is seconds, for the slow animation. */
export function drawQueen(c: CanvasRenderingContext2D, x: number, y: number, l: QueenLook, t: number) {
  x = Math.round(x); y = Math.round(y);
  if (l.tier >= 6) { egg(c, x, y, t); return; }
  const { s, rx: rx0, ry: ry0 } = sac(l);
  const pulse = s > 2.5 && Math.sin(t * 1.3) > 0.6 ? 1 : 0;
  const rx = rx0 + pulse, ry = ry0;
  const gx = x - 6, waist = gx + rx + 1;
  if (l.tier >= 4) tubes(c, gx, y, rx, ry, t, l.tier >= 5 ? 4 : 3);
  if (l.tier >= 3) {
    eggTrail(c, gx, y, rx, t);
    blob(c, gx - Math.round(rx * 0.55), y - Math.round(ry * 0.5), Math.round(rx * 0.4), Math.round(ry * 0.5), MEM); // lobes
    blob(c, gx - Math.round(rx * 0.5), y + Math.round(ry * 0.55), Math.round(rx * 0.4), Math.round(ry * 0.45), MEM_DARK);
  }
  abdomen(c, gx, y, rx, ry, s, l.tier, t);
  if (l.tier >= 5) { ribs(c, gx, y, rx, ry, t); plating(c, gx, y, rx - 4, ry - 4, 3); }
  if (l.tier >= 4) servoArms(c, gx, y, rx, ry, t, l.tier >= 5 ? 3 : 1);
  if (l.tier >= 5) thrusters(c, gx, y + ry + 1, t, 2, rx);
  body(c, waist, y + (s > 3 ? 1 : 0), t, l.tier === 0, Math.max(0, l.tier - 3));
  if (l.tier >= 2) nurses(c, gx, y, rx, ry, Math.min(8, l.tier * 2), t);
}
