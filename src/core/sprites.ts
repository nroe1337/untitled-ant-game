// Sprite registry. Drop a PNG into src/assets/sprites/ and it is available by file name
// (without .png). Small files are inlined by Vite, so the single-file build keeps working.
import { el } from './ui';

/** The game is text-first. Flip this to true to show icon sprites in the UI again. */
export const SHOW_UI_SPRITES = false;

const files = import.meta.glob('../assets/sprites/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const urls: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) urls[path.split('/').pop()!.replace('.png', '')] = url;

/** Which sprite stands for a resource, job or thing. Missing entries simply show no icon. */
const ALIASES: Record<string, string> = {
  ant: 'worker_ant_icon',
  food: 'food_icon',
  soil: 'soil_icon',
  egg: 'egg_icon',
  larva: 'larva_icon',
  pupa: 'pupa_icon',
  queen: 'queen_ant_icon',
  forager: 'forager_ant_icon',
  digger: 'digger_ant_icon',
  nurse: 'nurse_ant_icon',
  scout: 'scout_ant_icon',
  soldier: 'soldier_ant_icon',
};

export function spriteUrl(id: string): string | undefined {
  return urls[ALIASES[id] ?? id];
}

/** An <img> for a sprite, or null if there is no art yet. size = displayed px. */
export function icon(id: string, size = 16) {
  if (!SHOW_UI_SPRITES) return null;
  const src = spriteUrl(id);
  return src ? el('img.sprite', { src, width: size, height: size, alt: '' }) : null;
}
