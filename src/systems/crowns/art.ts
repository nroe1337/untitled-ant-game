// Placeholder pixel art for the crowns screen, drawn in code until Nate's sprites arrive.
// Drop crown_<id>.png (16x16) and queen_face.png (48x48) into src/assets/sprites/ and they are used instead.
import { spriteUrl } from '../../core/sprites';

type G = CanvasRenderingContext2D;
/** base, dark, light */
export const CROWN_COLORS: Record<string, [string, string, string]> = {
  chitin: ['#a8452e', '#6e2a1a', '#d9774f'], clay: ['#8a4f3a', '#5a3022', '#b8735a'], petal: ['#d08aa8', '#8a4a68', '#f0c0d4'],
  fungus: ['#c8b890', '#7a6a4a', '#e8dcb8'], amber: ['#e0a030', '#9a6010', '#f8d070'], seed: ['#b89a50', '#6e5a28', '#d8c080'],
  silk: ['#e8e4dc', '#9a948a', '#ffffff'], thorn: ['#6f8a3a', '#3a4a1e', '#9ab85a'],
};
/** height of each of the five points */
const SHAPES: Record<string, number[]> = {
  chitin: [0, 1, 2, 1, 0], clay: [1, 1, 1, 1, 1], petal: [2, 0, 2, 0, 2], fungus: [1, 2, 1, 2, 1],
  amber: [0, 2, 3, 2, 0], seed: [1, 0, 1, 0, 1], silk: [2, 1, 2, 1, 2], thorn: [3, 0, 3, 0, 3],
};

const images = new Map<string, HTMLImageElement | null>();
/** A loaded sprite, or null while there is none (or it is still loading). */
function sprite(id: string): HTMLImageElement | null {
  if (!images.has(id)) {
    const url = spriteUrl(id);
    if (!url) { images.set(id, null); return null; }
    const img = new Image(); img.src = url; images.set(id, img);
  }
  const img = images.get(id);
  return img && img.complete && img.naturalWidth ? img : null;
}

/** A 16x16 crown at (ox, oy), mirrored around its middle. */
export function crownPix(g: G, id: string, ox: number, oy: number) {
  const img = sprite('crown_' + id);
  if (img) { g.drawImage(img, ox, oy, 16, 16); return; }
  const [b, d, l] = CROWN_COLORS[id], s = SHAPES[id];
  const px = (x: number, y: number, c: string) => { g.fillStyle = c; g.fillRect(ox + x, oy + y, 1, 1); };
  for (let x = 1; x < 15; x++) { for (let y = 10; y < 14; y++) px(x, y, y === 13 ? d : b); px(x, 10, l); }
  [1, 4, 7, 10, 13].forEach((cx, i) => {
    const top = 8 - s[i] * 2;
    for (let y = top; y < 10; y++) { px(cx, y, b); px(cx + 1, y, b); }
    px(cx, top - 1, l); px(cx + 1, top - 1, l);
  });
  const gem = id === 'amber' ? '#fff4c0' : l;
  for (const x of [4, 7, 8, 11]) px(x, 11, gem);
}

export function drawCrown(cv: HTMLCanvasElement, id: string) {
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, 16, 16);
  crownPix(g, id, 0, 0);
}

/** The queen's face, 48x48, front on, wearing `crown` (or bare-headed). */
export function drawFace(cv: HTMLCanvasElement, crown: string | null) {
  const g = cv.getContext('2d')!, W = 48;
  g.clearRect(0, 0, W, W);
  const face = sprite('queen_face');
  if (face) g.drawImage(face, 0, 0, W, W);
  else paintFace(g, W);
  if (crown) crownPix(g, crown, 16, 1);
}

function paintFace(g: G, W: number) {
  const px = (x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const m = (x: number, y: number, w: number, h: number, c: string) => { px(x, y, w, h, c); px(W - x - w, y, w, h, c); }; // mirrored
  const O = '#1e130b', D = '#3a2416', H = '#5a3a24', M = '#6e4a2e', L = '#7e5636', S = '#94683f';
  // thorax and shoulders
  for (let y = 40; y < 48; y++) { const w = 8 + Math.round((y - 40) * 1.6); m(24 - w, y, w, 1, y === 40 ? O : y < 43 ? M : H); }
  m(10, 44, 3, 1, L); m(14, 42, 4, 1, L); m(22, 43, 2, 1, D);
  m(19, 37, 5, 3, D); // neck
  // antennae: scape up and out, elbow, funiculus out, club at the tip
  const ant = [[16, 17], [15, 16], [14, 15], [13, 14], [12, 13], [11, 12], [10, 11], [9, 11], [8, 11], [7, 10], [6, 10], [5, 9], [4, 9], [3, 8]];
  ant.forEach(([x, y], i) => { m(x, y, 1, 1, i < 7 ? D : H); if (i % 2 === 0 && i > 6) m(x, y - 1, 1, 1, O); });
  m(2, 6, 2, 3, O); m(3, 6, 1, 1, M);
  // head: rounded, wider at the cheeks
  for (let y = 14; y < 38; y++) {
    const t = (y - 25) / 12, w = Math.round(15 * Math.sqrt(Math.max(0, 1 - t * t)) * (y > 30 ? 1 - (y - 30) * 0.05 : 1));
    if (w <= 0) continue;
    m(24 - w, y, 1, 1, O); m(25 - w, y, w - 1, 1, y < 17 ? L : y > 33 ? D : H);
  }
  // soft sheen on the brow
  [4, 5, 5, 5, 4, 4, 3, 3, 2, 2, 1].forEach((w, i) => { const y = 15 + i; m(24 - w, y, w, 1, y < 18 ? S : L); if (y > 17) m(23 - w, y, 1, 1, M); });
  for (let y = 26; y < 35; y++) m(10 + Math.floor((y - 26) / 2), y, 2, 1, D); // cheeks
  m(18, 28, 3, 2, D); m(19, 28, 1, 1, O); // antenna sockets
  // ocelli
  px(23, 17, 2, 2, '#e8d27a'); px(23, 17, 1, 1, '#fff4c0'); m(20, 19, 1, 1, '#e8d27a');
  // compound eyes
  for (let y = 19; y < 29; y++) { const w = y === 19 || y === 28 ? 3 : y === 20 || y === 27 ? 5 : 6; m(11 + Math.floor((6 - w) / 2), y, w, 1, '#141210'); }
  for (let y = 21; y < 27; y += 2) for (let x = 12 + (y % 4 === 1 ? 0 : 1); x < 17; x += 2) m(x, y, 1, 1, '#2a2830');
  m(12, 20, 2, 2, '#e6dfd3'); m(14, 21, 1, 1, '#8a8a98');
  // clypeus and mouth
  for (let y = 31; y < 35; y++) { const w = Math.max(1, 6 - (y - 31)); m(24 - w, y, w, 1, M); }
  m(20, 30, 4, 1, L); m(22, 35, 2, 2, '#4a2214');
  // mandibles
  for (const [x, y, w] of [[16, 36, 5], [15, 37, 5], [15, 38, 4], [16, 39, 4], [17, 40, 4], [19, 41, 3]]) m(x, y, w, 1, '#7a3a1a');
  m(16, 36, 5, 1, '#9a5228');
}
