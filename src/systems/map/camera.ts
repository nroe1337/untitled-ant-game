// A camera over a big tile map: the canvas shows a window of the map, drawn from a full-size source
// canvas the caller paints. Drag to pan (mouse or touch), arrow keys / WASD glide, and a minimap shows
// the whole map with the view on it (click or drag there to jump). Clicks that didn't drag pick a tile.
import { el } from '../../core/ui';
import { PAL, rect } from '../../core/pixel';

export interface Camera {
  root: HTMLElement;
  /** The full map, T pixels per tile. Paint it, then the camera shows part of it every frame. */
  source: HTMLCanvasElement;
  /** Paint the minimap: one pixel per tile. */
  paintMini: (c: CanvasRenderingContext2D) => void;
  hover: number | null;
  /** Centre the view on a tile. */
  centre: (x: number, y: number) => void;
  /** The tile at the centre of the view. */
  middle: () => [number, number];
}

const DRAG = 5;        // CSS pixels a press may move and still count as a click
const GLIDE = 28;      // tiles per second when panning with the keys

export function makeCamera(opts: { cols: number; rows: number; view: [number, number]; T: number; label: string; onPick: (i: number | null) => void }): Camera {
  const { cols, rows, T } = opts;
  const [vw, vh] = opts.view;
  const source = document.createElement('canvas');
  source.width = cols * T; source.height = rows * T;
  const view = el('canvas.map', { width: vw * T, height: vh * T, tabindex: 0, 'aria-label': opts.label + '. Drag or use the arrow keys to look around.' }) as HTMLCanvasElement;
  const mini = el('canvas.minimap', { width: cols, height: rows, 'aria-label': 'Whole map. Click to look there.' }) as HTMLCanvasElement;
  const root = el('div.camera', {}, el('div.camview', {}, view, mini));
  let x = 0, y = 0; // top-left of the view, in tiles
  const clamp = () => { x = Math.max(0, Math.min(cols - vw, x)); y = Math.max(0, Math.min(rows - vh, y)); };
  const cam: Camera = {
    root, source, paintMini: () => {}, hover: null,
    centre: (cx, cy) => { x = cx + 0.5 - vw / 2; y = cy + 0.5 - vh / 2; clamp(); },
    middle: () => [Math.floor(x + vw / 2), Math.floor(y + vh / 2)],
  };

  // ---- pointer: drag to pan, click to pick ----
  const tileAt = (e: PointerEvent | MouseEvent) => {
    const r = view.getBoundingClientRect();
    const tx = Math.floor(x + ((e.clientX - r.left) / r.width) * vw), ty = Math.floor(y + ((e.clientY - r.top) / r.height) * vh);
    return tx >= 0 && ty >= 0 && tx < cols && ty < rows ? ty * cols + tx : null;
  };
  let press: { px: number; py: number; x: number; y: number; moved: boolean; id: number } | null = null;
  view.addEventListener('pointerdown', (e) => {
    press = { px: e.clientX, py: e.clientY, x, y, moved: false, id: e.pointerId };
    view.setPointerCapture(e.pointerId);
    view.focus({ preventScroll: true });
  });
  view.addEventListener('pointermove', (e) => {
    if (press && press.id === e.pointerId) {
      const dx = e.clientX - press.px, dy = e.clientY - press.py;
      if (!press.moved && Math.hypot(dx, dy) > DRAG) press.moved = true;
      if (press.moved) {
        const r = view.getBoundingClientRect();
        x = press.x - (dx / r.width) * vw; y = press.y - (dy / r.height) * vh; clamp();
        view.classList.add('dragging');
        cam.hover = null;
        return;
      }
    }
    cam.hover = tileAt(e);
  });
  const release = (e: PointerEvent, pick: boolean) => {
    if (!press || press.id !== e.pointerId) return;
    if (pick && !press.moved) opts.onPick(tileAt(e));
    press = null;
    view.classList.remove('dragging');
  };
  view.addEventListener('pointerup', (e) => release(e, true));
  view.addEventListener('pointercancel', (e) => release(e, false));
  view.addEventListener('pointerleave', () => { if (!press) cam.hover = null; });

  // ---- keys: hold to glide ----
  const held = new Set<string>();
  const KEYS: Record<string, [number, number]> = { arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0], arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1] };
  view.addEventListener('keydown', (e) => { const k = e.key.toLowerCase(); if (KEYS[k] && !e.ctrlKey && !e.metaKey && !e.altKey) { held.add(k); e.preventDefault(); } });
  view.addEventListener('keyup', (e) => { held.delete(e.key.toLowerCase()); });
  view.addEventListener('blur', () => held.clear());

  // ---- minimap: click or drag to look there ----
  let miniDown = false;
  const miniJump = (e: PointerEvent) => {
    const r = mini.getBoundingClientRect();
    cam.centre(((e.clientX - r.left) / r.width) * cols - 0.5, ((e.clientY - r.top) / r.height) * rows - 0.5);
  };
  mini.addEventListener('pointerdown', (e) => { miniDown = true; mini.setPointerCapture(e.pointerId); miniJump(e); });
  mini.addEventListener('pointermove', (e) => { if (miniDown) miniJump(e); });
  mini.addEventListener('pointerup', () => { miniDown = false; });
  mini.addEventListener('pointercancel', () => { miniDown = false; });

  // ---- every frame while on screen: glide, then draw the window and the minimap ----
  const vc = view.getContext('2d')!, mc = mini.getContext('2d')!;
  let last = performance.now(), miniAt = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (view.isConnected && view.offsetParent !== null) {
      let dx = 0, dy = 0;
      for (const k of held) { dx += KEYS[k][0]; dy += KEYS[k][1]; }
      if (dx || dy) { x += dx * GLIDE * dt; y += dy * GLIDE * dt; clamp(); }
      vc.imageSmoothingEnabled = false;
      vc.fillStyle = PAL.fog; vc.fillRect(0, 0, view.width, view.height);
      // whole source pixels, so tiles never shimmer while panning
      vc.drawImage(source, Math.round(x * T), Math.round(y * T), vw * T, vh * T, 0, 0, vw * T, vh * T);
      if (cam.hover != null) {
        const hx = Math.round(((cam.hover % cols) - x) * T), hy = Math.round((Math.floor(cam.hover / cols) - y) * T);
        rect(vc, hx, hy, T, 1, PAL.bone); rect(vc, hx, hy + T - 1, T, 1, PAL.bone); rect(vc, hx, hy, 1, T, PAL.bone); rect(vc, hx + T - 1, hy, 1, T, PAL.bone);
      }
      if (now - miniAt > 120 || dx || dy || press?.moved || miniDown) {
        miniAt = now;
        cam.paintMini(mc);
        // the view's outline
        const bx = Math.round(x), by = Math.round(y);
        rect(mc, bx, by, vw, 1, PAL.bone); rect(mc, bx, by + vh - 1, vw, 1, PAL.bone);
        rect(mc, bx, by, 1, vh, PAL.bone); rect(mc, bx + vw - 1, by, 1, vh, PAL.bone);
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return cam;
}
