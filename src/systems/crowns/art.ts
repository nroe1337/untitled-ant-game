// Placeholder pixel art for the crowns screen, drawn in code until Nate's sprites arrive.
// Drop crown_<id>.png (16x16) and queen_face.png (48x48) into src/assets/sprites/ and they are used instead.
import { spriteUrl } from '../../core/sprites';

type G = CanvasRenderingContext2D;
/** Each crown's left half (8 of 16 columns, mirrored onto the right) and its colours.
 *  . empty  o outline  d dark  b base  l light  w shine  g gem  h gem light  a accent */
const CROWN_ART: Record<string, { pal: Record<string, string>; rows: string[] }> = {
  chitin: { pal: { o: '#2a0e08', d: '#6e2a1a', b: '#a8452e', l: '#d9774f', w: '#f0a878', g: '#3a1a12', h: '#c87858', a: '#8a3422' }, rows: [
    '........',
    '.o......',
    'olo.....',
    'obo....o',
    'obbo..ol',
    '.obo..ob',
    '.odbo.ob',
    '..odbood',
    'o.oodbdb',
    'obooaoob',
    'olllllll',
    'obbabbab',
    'obhgbbhg',
    'odggddgg',
    'oooooooo',
    '........',
  ] },
  clay: { pal: { o: '#2a140c', d: '#5a3022', b: '#8a4f3a', l: '#b8735a', w: '#d8987a', g: '#3a6a7a', h: '#8ac0d0', a: '#6e3a2a' }, rows: [
    '........',
    '........',
    '........',
    '........',
    '........',
    'oooo..oo',
    'olbo..ol',
    'obbo..ob',
    'obboooob',
    'obabbbab',
    'olllllll',
    'oabhgbba',
    'obbggbbb',
    'odddaddd',
    'oooooooo',
    '........',
  ] },
  petal: { pal: { o: '#3a1424', d: '#8a4a68', b: '#d08aa8', l: '#f0c0d4', w: '#fff0f6', g: '#e8c040', h: '#fff4b0', a: '#b06a88' }, rows: [
    '........',
    '........',
    '........',
    '..oo..oo',
    '.olwo.ol',
    'olbbo.ob',
    'obbbaoob',
    'oabbaobb',
    '.oaaobbb',
    'oohoooab',
    'olllllll',
    'obbbbhgb',
    'obabbggb',
    'odddaddd',
    'oooooooo',
    '........',
  ] },
  fungus: { pal: { o: '#2a2416', d: '#7a6a4a', b: '#c8b890', l: '#e8dcb8', w: '#fff8e8', g: '#a83a2a', h: '#e87a5a', a: '#9a8a64' }, rows: [
    '........',
    '........',
    '........',
    '....oooo',
    '...olwll',
    '.oooblbw',
    'olwlbbbb',
    'obbbdddd',
    'odddooao',
    '.oaoo.ao',
    'olllllll',
    'obbbbhgb',
    'obabbggb',
    'odddaddd',
    'oooooooo',
    '........',
  ] },
  amber: { pal: { o: '#3a2006', d: '#9a6010', b: '#e0a030', l: '#f8d070', w: '#fffbe0', g: '#c86a10', h: '#ffd890', a: '#b87818' }, rows: [
    '........',
    '.......o',
    '......ol',
    '......ob',
    '...o..ob',
    '..olo.ob',
    '..obo.ob',
    'o.obo.ob',
    'olobooob',
    'obbbbbbb',
    'olllllll',
    'obhgbbhg',
    'obggbbgg',
    'odddaddd',
    'oooooooo',
    '........',
  ] },
  seed: { pal: { o: '#2a2010', d: '#6e5a28', b: '#b89a50', l: '#d8c080', w: '#f8ecc0', g: '#5a3a1a', h: '#9a6a3a', a: '#8a7038' }, rows: [
    '........',
    '........',
    '.......o',
    '..oo..oh',
    '.ohgo.og',
    '.oggo.og',
    '..oao..o',
    '..oao.oa',
    '..oao.oa',
    'oooaooab',
    'olllllll',
    'obbbbhgb',
    'obabbggb',
    'odddaddd',
    'oooooooo',
    '........',
  ] },
  silk: { pal: { o: '#3a3630', d: '#9a948a', b: '#e8e4dc', l: '#ffffff', w: '#ffffff', g: '#b8c8e0', h: '#ffffff', a: '#c8c2b8' }, rows: [
    '........',
    '........',
    '........',
    '......oo',
    '..oo.ohw',
    '.ohwoohg',
    '.oggo.oo',
    '..oo.oao',
    '..oa.oao',
    'oaoaooao',
    'olllllll',
    'oabbaabb',
    'obaabhgb',
    'odddaggd',
    'oooooooo',
    '........',
  ] },
  thorn: { pal: { o: '#141a08', d: '#3a4a1e', b: '#6f8a3a', l: '#9ab85a', w: '#c8e090', g: '#a82a2a', h: '#e86a5a', a: '#55702a' }, rows: [
    'o.......',
    'olo.....',
    '.obo...o',
    '..obo.ol',
    '.o.odo.b',
    'olo.ob.b',
    '.obooaod',
    '..obdbob',
    '..oodbbd',
    'oaodbadb',
    'olllllll',
    'odbbbhgb',
    'obdbbggb',
    'odddaddd',
    'oooooooo',
    '........',
  ] },
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
  const art = CROWN_ART[id];
  if (!art) return;
  art.rows.forEach((row, y) => {
    for (let x = 0; x < 8; x++) {
      const c = art.pal[row[x]];
      if (!c) continue;
      g.fillStyle = c;
      g.fillRect(ox + x, oy + y, 1, 1);
      g.fillRect(ox + 15 - x, oy + y, 1, 1);
    }
  });
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
