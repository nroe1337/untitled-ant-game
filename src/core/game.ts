import type { Context, GameSystem } from './types';
import { Resources, fmt } from './resources';
import { EventBus } from './events';
import { Mods } from './mods';
import { el } from './ui';
import { icon } from './sprites';
import { saveLocal, readLocal, applySave, clearLocal, exportText, importText } from './save';

const TICK_MS = 100;
const AUTOSAVE_S = 15;

export class Game {
  ctx: Context;
  time = 0;
  /** Set when resetting or importing, so the save-on-close doesn't write the old game back. */
  private noSave = false;
  private alerts = new Map<string, string>();
  private alertEl!: HTMLElement;
  private systems: GameSystem[];
  private tabs = new Map<string, { btn: HTMLButtonElement; body: HTMLElement; mounted: boolean; seen: boolean }>();
  private active = '';
  private resRows = new Map<string, { row: HTMLElement; amt: HTMLElement; rate: HTMLElement }>();
  private logEl!: HTMLElement;
  private tabBar!: HTMLElement;
  private panelHost!: HTMLElement;
  private resList!: HTMLElement;

  constructor(systems: GameSystem[]) {
    this.systems = systems;
    this.ctx = {
      res: new Resources(),
      flags: new Set(),
      bus: new EventBus(),
      busy: {},
      mods: new Mods(),
      state: {},
      speed: 1,
      log: (m, k) => this.log(m, k),
      alert: (id, m) => { if (m) this.alerts.set(id, m); else this.alerts.delete(id); },
    };
  }

  start(root: HTMLElement) {
    this.buildLayout(root);
    for (const s of this.systems) s.init(this.ctx);
    const save = readLocal();
    if (save) {
      applySave(this.ctx, save);
      this.time = save.time ?? 0;
      this.log('The colony remembers. (Save loaded)', 'info');
    }
    this.ctx.bus.emit('loaded');
    if (!save) this.ctx.bus.emit('newgame');

    let acc = 0, rateAcc = 0, saveAcc = 0;
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      const real = Math.min(1, (now - last) / 1000);
      last = now;
      const dt = real * this.ctx.speed;
      this.time += dt;
      for (const s of this.systems) s.tick?.(this.ctx, dt);
      acc += real; rateAcc += real; saveAcc += real;
      if (rateAcc >= 1) { this.ctx.res.measureRates(rateAcc * this.ctx.speed); rateAcc = 0; } // rates in game time
      if (saveAcc >= AUTOSAVE_S && !this.noSave) { saveLocal(this.ctx, this.time); saveAcc = 0; }
      this.render();
    }, TICK_MS);
    window.addEventListener('beforeunload', () => { if (!this.noSave) saveLocal(this.ctx, this.time); });
  }

  // ---------- layout ----------
  private buildLayout(root: HTMLElement) {
    this.resList = el('div.res-list');
    this.tabBar = el('nav.tabs');
    this.panelHost = el('div.panels');
    this.logEl = el('div.log');
    this.alertEl = el('div.alerts', { role: 'status' });

    const speedBtn = el('button.ghost', { type: 'button', title: 'Developer tool: speed up time' }, 'x1');
    speedBtn.addEventListener('click', () => {
      const steps = [1, 10];
      this.ctx.speed = steps[(steps.indexOf(this.ctx.speed) + 1) % steps.length];
      speedBtn.textContent = 'x' + this.ctx.speed;
    });
    const saveBtn = el('button.ghost', { type: 'button', onclick: () => { saveLocal(this.ctx, this.time); this.log('Saved.', 'info'); } }, 'Save');
    const exportBtn = el('button.ghost', { type: 'button', onclick: () => this.openSaveBox() }, 'Export / import');
    const resetBtn = el('button.ghost', { type: 'button', onclick: () => this.confirmReset(resetBtn) }, 'Reset');

    root.append(
      el('header.top', {},
        el('div.brand', {}, el('span.mark'), el('h1', {}, 'Formicarium')),
        el('div.tools', {}, saveBtn, exportBtn, resetBtn, speedBtn)),
      el('div.layout', {},
        el('aside.side', {}, el('h2.kicker', {}, 'Stores'), this.resList),
        el('main.main', {}, this.alertEl, this.tabBar, this.panelHost),
        el('aside.story', {}, el('h2.kicker', {}, 'Chronicle'), this.logEl)),
    );
  }

  private confirmReset(btn: HTMLButtonElement) {
    if (btn.dataset.armed) { this.noSave = true; clearLocal(); location.reload(); return; }
    btn.dataset.armed = '1';
    btn.textContent = 'Really reset?';
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = 'Reset'; }, 3000);
  }

  private openSaveBox() {
    const existing = document.querySelector('.savebox');
    if (existing) { existing.remove(); return; }
    const ta = el('textarea', { id: 'save-text', rows: 5, spellcheck: 'false' }) as HTMLTextAreaElement;
    ta.value = exportText(this.ctx, this.time);
    const status = el('span.muted');
    const box = el('div.savebox', {},
      el('p', {}, 'Copy this text to back up your colony, or paste a save and press Load.'),
      ta,
      el('div.row', {},
        el('button.action', { type: 'button', onclick: async () => {
          try { await navigator.clipboard.writeText(ta.value); status.textContent = 'Copied.'; }
          catch { ta.select(); status.textContent = 'Press Ctrl+C to copy.'; }
        } }, 'Copy'),
        el('button.action', { type: 'button', onclick: () => {
          try {
            const data = importText(ta.value);
            try { localStorage.setItem('ant-colony-save-v1', JSON.stringify(data)); } catch { /* */ }
            this.noSave = true; location.reload();
          } catch { status.textContent = 'That text is not a valid save.'; }
        } }, 'Load'),
        el('button.ghost', { type: 'button', onclick: () => box.remove() }, 'Close'),
        status));
    document.querySelector('.main')!.prepend(box);
  }

  // ---------- log ----------
  log(msg: string, kind: 'story' | 'info' | 'warn' = 'story') {
    if (!this.logEl) return;
    const line = el(`p.${kind}` as 'p', {}, msg);
    this.logEl.prepend(line);
    while (this.logEl.childElementCount > 60) this.logEl.lastElementChild!.remove();
  }

  // ---------- render ----------
  private render() {
    const { ctx } = this;
    // alerts
    const txt = [...this.alerts.values()];
    if (this.alertEl.dataset.v !== txt.join('|')) {
      this.alertEl.dataset.v = txt.join('|');
      this.alertEl.replaceChildren(...txt.map((m) => el('p.alert', {}, m)));
    }
    // resources
    for (const r of ctx.res.all()) {
      if (!r.seen) continue;
      let row = this.resRows.get(r.id);
      if (!row) {
        const amt = el('span.amt'), rate = el('span.rate');
        const rowEl = el('div.res', {}, el('span.name', {}, icon(r.id), r.name), amt, rate);
        this.resList.append(rowEl);
        row = { row: rowEl, amt, rate };
        this.resRows.set(r.id, row);
        // keep sidebar order
        [...this.resRows.entries()]
          .sort((a, b) => ctx.res.get(a[0]).order - ctx.res.get(b[0]).order)
          .forEach(([, v]) => this.resList.append(v.row));
      }
      const cap = ctx.res.cap(r.id);
      row.amt.textContent = fmt(r.amount, r.integer) + (isFinite(cap) ? ` / ${fmt(cap, true)}` : '');
      const flat = Math.abs(r.rate) < 0.005;
      row.rate.textContent = flat ? '0/s' : (r.rate > 0 ? '+' : '') + fmt(r.rate) + '/s';
      row.rate.className = 'rate ' + (flat ? 'flat' : r.rate < 0 ? 'neg' : 'pos');
      row.row.classList.toggle('full', isFinite(cap) && r.amount >= cap);
    }

    // panels
    for (const s of this.systems) {
      if (!s.panel) continue;
      const unlocked = s.isUnlocked ? s.isUnlocked(ctx) : true;
      let tab = this.tabs.get(s.id);
      if (!tab && unlocked) {
        const btn = el('button.tab', { type: 'button' }, s.panel.title) as HTMLButtonElement;
        const body = el('section.panel', { hidden: true });
        btn.addEventListener('click', () => this.show(s.id));
        this.tabBar.append(btn);
        this.panelHost.append(body);
        tab = { btn, body, mounted: false, seen: false };
        this.tabs.set(s.id, tab);
        if (!this.active) this.show(s.id); else btn.classList.add('new');
        this.tabBar.hidden = this.tabs.size < 2;
      }
      if (tab && !tab.mounted) { s.panel.mount(tab.body, ctx); tab.mounted = true; }
      if (tab && this.active === s.id) s.panel.update?.(tab.body, ctx);
    }
  }

  private show(id: string) {
    this.active = id;
    for (const [tid, t] of this.tabs) {
      const on = tid === id;
      t.body.hidden = !on;
      t.btn.classList.toggle('on', on);
      if (on) t.btn.classList.remove('new');
    }
  }
}
