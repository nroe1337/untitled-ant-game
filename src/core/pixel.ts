// Flat pixel drawing, Incremancer style: solid colours, whole pixels, no shading,
// no gradients, no transparency, no anti-aliasing, no text on canvas.

export const PAL = {
  bg: '#141210',
  soil: '#2a2018',
  hole: '#0d0b09',
  grass: '#3d4a2a',
  dirt: '#4a3626',
  stone: '#5d5b57',
  water: '#2b4556',
  paved: '#77746e',
  fog: '#0b0a09',
  bone: '#e6dfd3',
  food: '#8fa35a',
  seed: '#c9a03a',
  amber: '#d08a2e',
  scent: '#7b6fd0',
  you: '#c4532f',
  rival: '#7b6fd0',
  spider: '#c9a03a',
  humans: '#9aa0a6',
  waste: '#4a4238',
};

export function setup(cv: HTMLCanvasElement) {
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  return c;
}

export function rect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** A pixel-stepped oval made of whole-pixel rows (no anti-aliasing). */
export function blob(c: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string) {
  c.fillStyle = color;
  cx = Math.round(cx); cy = Math.round(cy);
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5))));
    c.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}
