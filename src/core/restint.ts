import type { Context } from './types';

/** A muted colour for each resource name, used in Stores and wherever text names a resource. */
export const RES_TINT: Record<string, string> = {
  ant: '#e2d6c2', food: '#a8b872', soil: '#b48e68', pheromone: '#a69be6', knowledge: '#93b6dc',
  egg: '#efe6d2', larva: '#e3d2ad', jelly: '#e6c76c', reserve: '#c2cf8a',
  leaf: '#86b062', fungus: '#cdb7a2', honeydew: '#d9c274', wax: '#e8cb8e',
  twig: '#b8966a', seed: '#cfa848', resin: '#c48f42', amber: '#e39f45', silk: '#d6d2e8', trailmark: '#a69be6',
  chitin: '#a98264', venom: '#a6c873',
  lineage: '#d8a85e', heritage: '#cf8461', memory: '#aea6cc', unity: '#93c4b4',
};

/** The words that count as naming each resource in running text (singular and plural). */
const WORDS: Record<string, string[]> = {
  food: ['food'], soil: ['soil'], pheromone: ['pheromones?'], knowledge: ['knowledge'],
  egg: ['eggs?'], larva: ['larvae', 'larva'], jelly: ['royal jelly', 'jelly'], reserve: ['reserve'],
  leaf: ['leaves', 'leaf'], fungus: ['fungus'], honeydew: ['honeydew'], wax: ['wax'],
  twig: ['twigs?'], seed: ['seeds?'], resin: ['resin'], amber: ['amber'], silk: ['silk'], trailmark: ['trail marks?'],
  chitin: ['chitin'], venom: ['venom'],
  lineage: ['lineage'], heritage: ['heritage'], memory: ['memory', 'memories'], unity: ['unity'],
  // Workers are left plain: "ants" is in nearly every sentence.
};

/** Text inside these is left alone: the Stores list (already tinted), names on buttons and tabs, headings, inputs. */
const SKIP = '.rn, .res-list, button, .gtab, .tab, h1, h2, h3, input, textarea, select, script, style, canvas, svg';

/**
 * Colours resource names wherever they appear in the page's text. Only resources the
 * player has seen are matched, so nothing is spoiled early.
 */
export function watchResourceNames(root: HTMLElement, ctx: Context) {
  let key = '';
  let re: RegExp | null = null;
  let byWord = new Map<string, string>();
  const refresh = () => {
    const seen = ctx.res.all().filter((r) => r.seen && WORDS[r.id] && RES_TINT[r.id]).map((r) => r.id);
    const k = seen.join(',');
    if (k === key) return;
    key = k;
    byWord = new Map();
    const alts: string[] = [];
    for (const id of seen) for (const w of WORDS[id]) { alts.push(w); byWord.set(w, id); }
    alts.sort((a, b) => b.length - a.length);
    re = alts.length ? new RegExp(`\\b(${alts.join('|')})\\b`, 'gi') : null;
  };
  const idFor = (word: string) => {
    const w = word.toLowerCase();
    for (const [pat, id] of byWord) if (new RegExp(`^${pat}$`).test(w)) return id;
    return null;
  };
  const doText = (t: Text) => {
    if (!re || !t.data.trim()) return;
    const parent = t.parentElement;
    if (!parent || parent.closest(SKIP)) return;
    re.lastIndex = 0;
    if (!re.test(t.data)) return;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of t.data.matchAll(re)) {
      const id = idFor(m[0]);
      if (!id) continue;
      if (m.index! > last) frag.append(t.data.slice(last, m.index));
      const s = document.createElement('span');
      s.className = 'rn';
      s.style.color = RES_TINT[id];
      s.textContent = m[0];
      frag.append(s);
      last = m.index! + m[0].length;
    }
    if (!last) return;
    if (last < t.data.length) frag.append(t.data.slice(last));
    t.replaceWith(frag);
  };
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) { doText(n as Text); return; }
    if (n.nodeType !== Node.ELEMENT_NODE || (n as Element).matches(SKIP)) return;
    const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    while (w.nextNode()) texts.push(w.currentNode as Text);
    texts.forEach(doText);
  };
  const obs = new MutationObserver((list) => {
    refresh();
    if (!re) return;
    for (const m of list) {
      if (m.type === 'characterData') doText(m.target as Text);
      else m.addedNodes.forEach(walk);
    }
    obs.takeRecords(); // our own edits don't need another pass
  });
  refresh();
  walk(root);
  obs.observe(root, { subtree: true, childList: true, characterData: true });
  // a resource seen for the first time colours text already on the page
  let lastKey = key;
  setInterval(() => { refresh(); if (key !== lastKey) { lastKey = key; walk(root); obs.takeRecords(); } }, 2000);
}
