import type { Context } from './types';
import { fmt, fmtCosts, type Costs } from './resources';

/** Small DOM helper: el('div.card', {title:'x'}, child1, 'text') */
export function el<K extends keyof HTMLElementTagNameMap>(
  spec: K | `${K}.${string}`,
  attrs: Record<string, any> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = spec.split('.') as [K, ...string[]];
  const node = document.createElement(tag);
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, String(v));
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

export interface ActionButton {
  root: HTMLButtonElement;
  /** Refresh enabled state and cost text. */
  update(ctx: Context): void;
}

/**
 * A button that spends `costs()` and runs `onBuy`. Optional cooldown in seconds
 * shows a draining bar, A Dark Room style.
 */
export function actionButton(opts: {
  label: string | (() => string);
  costs?: () => Costs;
  desc?: string;
  cooldown?: number;
  enabled?: (ctx: Context) => boolean;
  onBuy: (ctx: Context) => void;
  ctx: Context;
  /** Leave off the native title tooltip (tiles show their own). */
  noTitle?: boolean;
}): ActionButton {
  const labelEl = el('span.label');
  const costEl = el('span.cost');
  const bar = el('span.cd');
  const root = el('button.action', { type: 'button', title: opts.desc ?? '' }, labelEl, costEl, bar);
  let cdLeft = 0;
  let cdStart = 0;
  let lastSeen = 0;

  root.addEventListener('click', () => {
    const ctx = opts.ctx;
    if (cdLeft > 0) return;
    if (opts.enabled && !opts.enabled(ctx)) return;
    const c = opts.costs?.() ?? {};
    if (!ctx.res.spend(c)) return;
    opts.onBuy(ctx);
    if (opts.cooldown) { cdLeft = opts.cooldown; cdStart = performance.now(); }
    api.update(ctx);
  });

  const api: ActionButton = {
    root,
    update(ctx) {
      labelEl.textContent = typeof opts.label === 'function' ? opts.label() : opts.label;
      const c = opts.costs?.() ?? {};
      costEl.textContent = Object.keys(c).length ? fmtCosts(c, ctx.res) : '';
      const now = performance.now();
      if (ctx.paused && lastSeen) cdStart += now - lastSeen; // cooldowns wait while the game is paused
      lastSeen = now;
      if (opts.cooldown && cdLeft > 0) {
        const elapsed = ((performance.now() - cdStart) / 1000) * ctx.speed;
        cdLeft = Math.max(0, opts.cooldown - elapsed);
        bar.style.width = `${(cdLeft / opts.cooldown) * 100}%`;
      } else bar.style.width = '0';
      const ok = cdLeft <= 0 && ctx.res.canAfford(c) && (!opts.enabled || opts.enabled(ctx));
      root.disabled = !ok;
      // explain a button that is short only because something is holding the stores back
      const heldBy = !ok && ctx.res.canAffordIgnoringHolds(c) ? [...new Set(Object.keys(c).flatMap((r) => ctx.res.holders(r)))] : [];
      const title = (opts.desc ?? '') + (heldBy.length ? `\nHeld back for ${heldBy.join(' and ')}. Turn that off to spend it here.` : '');
      if (!opts.noTitle && root.title !== title) root.title = title;
      // can't afford (but otherwise could buy): drawn dimmer than a button that is ready
      root.classList.toggle('short', cdLeft <= 0 && (!opts.enabled || opts.enabled(ctx)) && !ctx.res.canAfford(c));
    },
  };
  return api;
}

/** A thin progress bar. */
export function progressBar() {
  const fill = el('span.fill');
  const root = el('span.bar', {}, fill);
  return { root, set(p: number) { fill.style.width = `${Math.max(0, Math.min(1, p)) * 100}%`; } };
}

/** One floating tooltip shared by every tile: shows on hover or keyboard focus, follows live costs. */
let tipEl: HTMLElement | null = null;
let tipOwner: HTMLElement | null = null;
function tip() {
  if (!tipEl) { tipEl = el('div.tip', { role: 'tooltip', hidden: true }); document.body.append(tipEl); }
  return tipEl;
}
function placeTip(anchor: HTMLElement) {
  const t = tip(), r = anchor.getBoundingClientRect();
  t.hidden = false;
  const w = t.offsetWidth, h = t.offsetHeight;
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const below = r.bottom + 6 + h < window.innerHeight;
  t.style.left = `${left}px`;
  t.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - h - 6)}px`;
}

/**
 * An Evolve-style building tile: name plus a count badge on the button, with the
 * description, costs (short ones in red) and effect in a hover tooltip.
 */
export function tileButton(opts: {
  ctx: Context; label: string; desc?: string; effect?: string | (() => string);
  costs: () => Costs; count?: () => number | string;
  enabled?: (ctx: Context) => boolean; onBuy: (ctx: Context) => void;
}) {
  const btn = actionButton({ ctx: opts.ctx, label: opts.label, costs: opts.costs, enabled: opts.enabled, onBuy: opts.onBuy, noTitle: true });
  const badge = el('span.badge');
  btn.root.classList.add('tile');
  if (opts.count) btn.root.append(badge);
  const wrap = el('div.tilewrap', {}, btn.root);
  const fill = (ctx: Context) => {
    const c = opts.costs();
    const lines = Object.entries(c).map(([r, n]) => {
      const name = ctx.res.has(r) ? ctx.res.get(r).name : r;
      const short = ctx.res.amt(r) < n, over = ctx.res.has(r) && ctx.res.cap(r) < n;
      return el(`div.${over ? 'over' : short ? 'short' : 'ok'}`, { title: over ? 'More than you can store' : '' }, `${name}: ${fmt(n, true)}`);
    });
    tip().replaceChildren(
      ...(opts.desc ? [el('div.tdesc', {}, opts.desc)] : []),
      ...(lines.length ? [el('div.tcost', {}, ...lines)] : []),
      ...(opts.effect ? [el('div.teffect', {}, typeof opts.effect === 'function' ? opts.effect() : opts.effect)] : []),
    );
  };
  const show = () => { tipOwner = wrap; fill(opts.ctx); placeTip(wrap); };
  const hide = () => { if (tipOwner === wrap) { tipOwner = null; tip().hidden = true; } };
  wrap.addEventListener('mouseenter', show);
  wrap.addEventListener('mouseleave', hide);
  btn.root.addEventListener('focus', show);
  btn.root.addEventListener('blur', hide);
  return {
    root: wrap,
    update(ctx: Context) {
      btn.update(ctx);
      if (opts.count) badge.textContent = String(opts.count());
      if (tipOwner === wrap) {
        if (!wrap.isConnected || wrap.offsetParent === null) hide();
        else { fill(ctx); placeTip(wrap); }
      }
    },
  };
}
