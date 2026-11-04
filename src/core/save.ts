import type { Context } from './types';

const KEY = 'ant-colony-save-v1';

export function snapshot(ctx: Context, time: number) {
  return {
    v: 1,
    time,
    savedAt: Date.now(),
    res: ctx.res.serialize(),
    flags: [...ctx.flags],
    state: ctx.state,
  };
}

export function saveLocal(ctx: Context, time: number) {
  try { localStorage.setItem(KEY, JSON.stringify(snapshot(ctx, time))); return true; }
  catch { return false; }
}

export function readLocal(): ReturnType<typeof snapshot> | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearLocal() {
  try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

export function exportText(ctx: Context, time: number) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(snapshot(ctx, time)))));
}

export function importText(text: string) {
  return JSON.parse(decodeURIComponent(escape(atob(text.trim()))));
}

/** Merge saved per-system state over the defaults each system set in init(). */
export function applySave(ctx: Context, data: ReturnType<typeof snapshot>) {
  ctx.res.load(data.res);
  data.flags.forEach((f) => ctx.flags.add(f));
  for (const [id, s] of Object.entries(data.state ?? {})) {
    ctx.state[id] = { ...(ctx.state[id] ?? {}), ...(s as object) };
  }
}
