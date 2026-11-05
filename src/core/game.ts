import type { Context, GameSystem } from './types';
import { Resources, fmt } from './resources';
import { EventBus } from './events';
import { Mods } from './mods';
import { el } from './ui';
import { icon } from './sprites';
import { saveLocal, readLocal, applySave, clearLocal, exportText, importText, writeRebirth } from './save';

interface Tab {
  btn: HTMLButtonElement;
  body: HTMLElement;
  mounted: boolean;
  group: string;
  /** Things the player has already seen in this panel (see unlockKeys). */
  known: Set<string> | null;
}

/**
 * Names of the things a panel shows right now, used to light up a tab when something new
 * appears in it: rows in build lists, jobs, and destinations. Hidden rows are left out.
 */
function unlockKeys(body: HTMLElement) {
  const keys = new Set<string>();
  const shown = (n: Element) => { const h = n.closest('[hidden]'); return !h || h === body; };
  body.querySelectorAll('.buildrow .label, .job .jname, option[value], [data-unlock]').forEach((n) => {
    if (!shown(n)) return;
    const k = (n as HTMLElement).dataset.unlock ?? (n instanceof HTMLOptionElement ? 'opt:' + n.value : n.textContent ?? '');
    if (k) keys.add(k);
  });
  return keys;
}

const TICK_MS = 100;
const AUTOSAVE_S = 15;
/** Longest stretch of hidden-tab time the loop will catch up on. */
const MAX_CATCHUP_S = 8 * 3600;
/** Simulation steps per frame while catching up (each step is at most 1s of real time). */
const STEPS_PER_FRAME = 200;
/** Seconds each banner shows before the strip moves to the next one. */
const ALERT_ROTATE_S = 5;

/** Top tabs always sit in this order, whatever order they unlock in. Unlisted groups go last. */
const GROUP_ORDER = ['Home', 'Nest', 'World', 'War', 'Lineage'];
function sortChildren(bar: HTMLElement) {
  const kids = Array.from(bar.children) as HTMLElement[];
  kids.sort((a, b) => Number(a.dataset.rank ?? 99) - Number(b.dataset.rank ?? 99));
  for (const k of kids) bar.append(k);
}

export class Game {
  ctx: Context;
  time = 0;
  /** Set when resetting or importing, so the save-on-close doesn't write the old game back. */
  private noSave = false;
  private alerts = new Map<string, string>();
  private alertEl!: HTMLElement;
  private alertIdx = 0;
  private alertSince = 0;
  private pauseBtn!: HTMLButtonElement;
  private fanfareEl!: HTMLElement;
  private lastScan = 0;
  private firstRender = true;
  private systems: GameSystem[];
  private tabs = new Map<string, Tab>();
  private active = '';
  private resRows = new Map<string, { row: HTMLElement; amt: HTMLElement; rate: HTMLElement }>();
  private logEl!: HTMLElement;
  private tabBar!: HTMLElement;
  private groupBar!: HTMLElement;
  /** Top-level tabs. Each remembers the sub-tab that was open in it last. */
  private groups = new Map<string, { btn: HTMLButtonElement; last: string }>();
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
      paused: false,
      announce: (title, text) => this.announce(title, text),
      log: (m, k) => this.log(m, k),
      alert: (id, m) => { if (m) this.alerts.set(id, m); else this.alerts.delete(id); },
      rebirth: () => this.rebirth(),
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

    // Game time owed. A hidden browser tab runs this timer only about once a second (or once a
    // minute after a while), so the loop pays the time back in steps of at most 1s instead of dropping it.
    let owed = 0, rateAcc = 0, saveAcc = 0;
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      const real = (now - last) / 1000;
      last = now;
      if (!this.ctx.paused) owed = Math.min(owed + real, MAX_CATCHUP_S);
      for (let n = 0; owed > 0 && n < STEPS_PER_FRAME; n++) {
        const step = Math.min(1, owed);
        owed -= step;
        const dt = step * this.ctx.speed;
        this.time += dt;
        for (const s of this.systems) s.tick?.(this.ctx, dt);
        rateAcc += step;
        if (rateAcc >= 1) { this.ctx.res.measureRates(rateAcc * this.ctx.speed); rateAcc = 0; } // rates in game time
      }
      saveAcc += real;
      if (saveAcc >= AUTOSAVE_S && !this.noSave) { saveLocal(this.ctx, this.time); saveAcc = 0; }
      this.render();
    }, TICK_MS);
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) this.togglePause();
    });
    window.addEventListener('beforeunload', () => { if (!this.noSave) saveLocal(this.ctx, this.time); });
  }

  // ---------- layout ----------
  private buildLayout(root: HTMLElement) {
    this.resList = el('div.res-list');
    this.tabBar = el('nav.tabs');
    this.groupBar = el('nav.groups', { hidden: true });
    // On phones the Stores list is its own top tab (CSS hides this button on wide screens).
    this.storesBtn = el('button.gtab.stores-tab', { type: 'button' }, 'Stores') as HTMLButtonElement;
    this.storesBtn.dataset.rank = '-1';
    this.storesBtn.addEventListener('click', () => { this.storesOpen = true; this.refreshBars(); });
    this.groupBar.append(this.storesBtn);
    this.panelHost = el('div.panels');
    this.logEl = el('div.log');
    this.alertEl = el('div.alerts', { role: 'status' });

    // A plain 2x toggle for players who want things quicker. Balance is tuned at 1x.
    // (Developers can still set window.game.ctx.speed from the console.)
    let fast = false;
    try { fast = localStorage.getItem('formicarium-speed') === '2'; } catch { /* storage blocked */ }
    if (fast) this.ctx.speed = 2;
    const speedBtn = el('button.ghost', { type: 'button', title: 'Play at double speed' }, fast ? 'Speed ×2' : 'Speed ×1') as HTMLButtonElement;
    speedBtn.setAttribute('aria-pressed', String(fast));
    speedBtn.addEventListener('click', () => {
      fast = !fast;
      this.ctx.speed = fast ? 2 : 1;
      speedBtn.textContent = fast ? 'Speed ×2' : 'Speed ×1';
      speedBtn.setAttribute('aria-pressed', String(fast));
      try { localStorage.setItem('formicarium-speed', fast ? '2' : '1'); } catch { /* storage blocked */ }
    });
    this.pauseBtn = el('button.ghost', { type: 'button', title: 'Pause or resume the colony (P)', onclick: () => this.togglePause() }, 'Pause') as HTMLButtonElement;
    this.fanfareEl = el('div.fanfare', { hidden: true, role: 'status', onclick: () => { this.fanfareEl.hidden = true; } });
    const saveBtn = el('button.ghost', { type: 'button', onclick: () => { saveLocal(this.ctx, this.time); this.log('Saved.', 'info'); } }, 'Save');
    const exportBtn = el('button.ghost', { type: 'button', onclick: () => this.openSaveBox() }, 'Export / import');
    const resetBtn = el('button.ghost', { type: 'button', onclick: () => this.confirmReset(resetBtn) }, 'Reset');

    root.append(
      el('header.top', {},
        el('div.brand', {}, el('span.mark'), el('h1', {}, 'Formicarium')),
        el('div.tools', {}, this.pauseBtn, saveBtn, exportBtn, resetBtn, speedBtn)),
      this.layoutEl = el('div.layout', {},
        el('aside.side', {}, el('h2.kicker', {}, 'Stores'), this.resList),
        el('main.main', {}, this.alertEl, this.fanfareEl, this.groupBar, this.tabBar, this.panelHost),
        el('aside.story', {}, el('h2.kicker', {}, 'Chronicle'), this.logEl)),
    );
  }

  private rebirth() {
    const kept: Record<string, unknown> = {};
    for (const s of this.systems) { const k = s.keep?.(this.ctx); if (k !== undefined) kept[s.id] = k; }
    writeRebirth([...this.ctx.flags].filter((f) => f.startsWith('legacy:')), kept);
    this.noSave = true;
    location.reload();
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
    // alerts: a strip of fixed height that shows one banner at a time and cycles through them,
    // so warnings coming and going never push the rest of the screen up and down
    const list: [string, string][] = [...(ctx.paused ? [['paused', 'Paused. Nothing in the colony moves until you resume (P).'] as [string, string]] : []), ...this.alerts.entries()];
    const txt = list.map(([, m]) => m);
    const now = performance.now() / 1000;
    if (now - this.alertSince > ALERT_ROTATE_S) { this.alertIdx++; this.alertSince = now; }
    const i = txt.length ? this.alertIdx % txt.length : 0;
    // rebuild (and play the entrance animation) only when a different alert comes up;
    // a countdown ticking inside the same alert just updates its words quietly
    const key = txt.length ? `${i}/${txt.length}|${list[i][0]}` : 'quiet';
    if (this.alertEl.dataset.v !== key) {
      this.alertEl.dataset.v = key;
      this.alertEl.classList.toggle('on', txt.length > 0);
      this.alertEl.replaceChildren(txt.length
        ? el('p.alert', { title: txt.join('\n') }, el('span.msg', {}, txt[i]), txt.length > 1 ? el('span.more', {}, `${i + 1} of ${txt.length}`) : null)
        : el('p.quiet', {}, 'All is quiet in the nest.'));
    } else if (txt.length) {
      const msg = this.alertEl.querySelector('.msg');
      if (msg && msg.textContent !== txt[i]) msg.textContent = txt[i];
      const p = this.alertEl.firstElementChild as HTMLElement | null;
      if (p) p.title = txt.join('\n');
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
      const held = ctx.res.held(r.id);
      const tip = held > 0 ? `${fmt(Math.min(held, r.amount), r.integer)} held back for ${ctx.res.holders(r.id).join(' and ')}` : '';
      if (row.row.title !== tip) { row.row.title = tip; row.row.classList.toggle('held', held > 0); }
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
        // sub-tabs keep the system list's order, whatever order they unlock in
        btn.dataset.rank = String(this.systems.indexOf(s));
        this.tabBar.append(btn);
        sortChildren(this.tabBar);
        this.panelHost.append(body);
        const group = s.panel.group ?? s.panel.title;
        tab = { btn, body, mounted: false, known: null, group };
        this.tabs.set(s.id, tab);
        if (!this.groups.has(group)) {
          const gbtn = el('button.gtab', { type: 'button' }, group) as HTMLButtonElement;
          gbtn.addEventListener('click', () => {
            const g = this.groups.get(group)!;
            // open the sub-tab with something new in it, else the one used last
            const ids = [...this.tabs].filter(([, t]) => t.group === group).map(([id]) => id);
            this.show(ids.find((id) => this.tabs.get(id)!.btn.classList.contains('new')) ?? (ids.includes(g.last) ? g.last : ids[0]));
          });
          const gi = GROUP_ORDER.indexOf(group);
          gbtn.dataset.rank = String(gi < 0 ? 99 : gi);
          this.groupBar.append(gbtn);
          sortChildren(this.groupBar);
          this.groups.set(group, { btn: gbtn, last: s.id });
        }
        // tabs already open when the save loads stay quiet; ones that open during play get a dot
        if (!this.active) this.show(s.id); else if (!this.firstRender) btn.classList.add('new');
      }
      if (tab && !tab.mounted) { s.panel.mount(tab.body, ctx); tab.mounted = true; }
      if (tab && this.active === s.id) {
        s.panel.update?.(tab.body, ctx);
        tab.known = unlockKeys(tab.body);
      }
    }
    // Once a second, refresh the panels in the background and light up any tab that has
    // something the player hasn't seen there yet (a new chamber, job, upgrade or place to go).
    const now2 = performance.now();
    if (now2 - this.lastScan > 1000) {
      this.lastScan = now2;
      for (const s of this.systems) {
        const tab = this.tabs.get(s.id);
        if (!tab || !tab.mounted || this.active === s.id) continue;
        if (!tab.known && tab.btn.classList.contains('new')) continue; // already lit; learns its contents when opened
        s.panel!.update?.(tab.body, ctx);
        if (!tab.known) { tab.known = unlockKeys(tab.body); continue; }
        for (const k of unlockKeys(tab.body)) if (!tab.known.has(k)) { tab.btn.classList.add('new'); break; }
      }
    }
    this.firstRender = false;
    this.refreshBars();
  }

  /** Show the sub-tabs of the open group; light a group when any of its sub-tabs has something new. */
  private refreshBars() {
    const activeGroup = this.tabs.get(this.active)?.group;
    let inGroup = 0;
    for (const t of this.tabs.values()) {
      t.btn.hidden = t.group !== activeGroup;
      if (!t.btn.hidden) inGroup++;
    }
    this.layoutEl?.classList.toggle('stores-open', this.storesOpen);
    this.storesBtn.classList.toggle('on', this.storesOpen);
    for (const [name, g] of this.groups) {
      g.btn.classList.toggle('on', name === activeGroup && !this.storesOpen);
      g.btn.classList.toggle('new', name !== activeGroup && [...this.tabs.values()].some((t) => t.group === name && t.btn.classList.contains('new')));
    }
    this.groupBar.hidden = false;
    this.groupBar.classList.toggle('solo', this.groups.size < 2); // phones still show it for the Stores tab
    this.tabBar.hidden = inGroup < 2;
  }

  private togglePause() {
    this.ctx.paused = !this.ctx.paused;
    this.pauseBtn.textContent = this.ctx.paused ? 'Resume' : 'Pause';
    this.pauseBtn.classList.toggle('on', this.ctx.paused);
  }

  /** A short, calm fanfare across the top of the main column, for milestones like a new age. */
  private announce(title: string, text: string) {
    this.fanfareEl.replaceChildren(el('span.rule'), el('p.kicker', {}, 'A new age'), el('p.title', {}, title), el('p.muted', {}, text));
    this.fanfareEl.hidden = false;
    this.fanfareEl.classList.remove('play');
    void this.fanfareEl.offsetWidth; // restart the animation
    this.fanfareEl.classList.add('play');
    clearTimeout(this.fanfareTimer);
    this.fanfareTimer = window.setTimeout(() => { this.fanfareEl.hidden = true; }, 9000);
  }
  private fanfareTimer = 0;
  private storesBtn!: HTMLButtonElement;
  private storesOpen = false;
  private layoutEl!: HTMLElement;

  private show(id: string) {
    this.active = id;
    this.storesOpen = false;
    const g = this.groups.get(this.tabs.get(id)?.group ?? '');
    if (g) g.last = id;
    for (const [tid, t] of this.tabs) {
      const on = tid === id;
      t.body.hidden = !on;
      t.btn.classList.toggle('on', on);
      if (on) t.btn.classList.remove('new');
    }
    this.refreshBars();
  }
}
