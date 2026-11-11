// The Guide: a Legacy sub-tab with one page per age. A page opens the first time the line reaches
// its age and stays open forever after. Text comes from data/guide.ts; {Tab}, [Thing], |res| and !warn!
// are drawn in colour.
import type { GameSystem, Context } from '../../core/types';
import { el } from '../../core/ui';
import { RESEARCH } from '../../data/balance';
import { GUIDE } from '../../data/guide';
import { currentAge } from '../research';

/** shown: steps the player chose to reveal, as 'age:index' ('age:next' for the next-age box). */
interface GuideState { seen: string[]; page?: string; shown?: string[] }
const S = (ctx: Context) => ctx.state.guide as GuideState;
const ageIdx = (id: string) => RESEARCH.ages.findIndex((a) => a.id === id);
const ageName = (id: string) => RESEARCH.ages[ageIdx(id)]?.name ?? id;

const MARKS: Record<string, string> = { '{': 'g-tab', '[': 'g-thing', '|': 'g-res', '!': 'g-warn' };
const CLOSE: Record<string, string> = { '{': '}', '[': ']', '|': '|', '!': '!' };

/** Turn guide markup into coloured spans. */
export function rich(text: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  let i = 0, plain = '';
  while (i < text.length) {
    const c = text[i], end = CLOSE[c] ? text.indexOf(CLOSE[c], i + 1) : -1;
    if (end > i) {
      if (plain) { out.push(plain); plain = ''; }
      out.push(el(`span.${MARKS[c]}` as 'span', {}, text.slice(i + 1, end)));
      i = end + 1;
    } else { plain += c; i++; }
  }
  if (plain) out.push(plain);
  return out;
}

export const guide: GameSystem = {
  id: 'guide',
  init(ctx) {
    ctx.state.guide = { seen: ['dirt'] } satisfies GuideState;
  },
  tick(ctx) {
    const s = S(ctx), at = ageIdx(currentAge(ctx).id);
    const fresh = GUIDE.filter((p) => ageIdx(p.age) <= at && !s.seen.includes(p.age));
    if (!fresh.length) return;
    for (const p of fresh) s.seen.push(p.age);
    const last = fresh[fresh.length - 1].age;
    s.page = last;
    if (last !== 'dirt') ctx.log(`A new page in the Guide: ${ageName(last)}. (Legacy tab)`, 'story');
  },
  keep(ctx) {
    return { seen: S(ctx).seen, page: S(ctx).page, shown: S(ctx).shown };
  },
  panel: (() => {
    let bar: HTMLElement, page: HTMLElement, sig = '';
    return {
      title: 'Guide',
      group: 'Legacy',
      quiet: true,
      mount(root) {
        bar = el('div.tabs.maptoggle');
        page = el('div.guide');
        root.append(el('p.flavor', {}, 'What the old ants tell the young ones. A new page opens with each age.'), bar, page);
      },
      update(_root, ctx) {
        const s = S(ctx);
        const pages = GUIDE.filter((p) => s.seen.includes(p.age));
        const cur = pages.find((p) => p.age === s.page) ?? pages[pages.length - 1];
        const shown = (s.shown ??= []);
        const key = `${pages.map((p) => p.age).join()}:${cur.age}:${shown.length}`;
        if (key === sig) return;
        sig = key;
        bar.replaceChildren(...pages.map((p) => {
          const b = el(`button.tab${p === cur ? '.on' : ''}` as 'button', { type: 'button' }, ageName(p.age).replace(/^Age of /, ''));
          b.addEventListener('click', () => { s.page = p.age; });
          return b;
        }));
        // Spoiler-free: each step stays blurred until the player clicks it.
        const veil = (id: string, label: string, node: HTMLElement) => {
          if (shown.includes(id)) return node;
          node.classList.add('g-veil');
          node.tabIndex = 0;
          node.setAttribute('role', 'button');
          node.setAttribute('aria-label', label);
          node.dataset.label = label;
          const open = () => { if (!shown.includes(id)) shown.push(id); };
          node.addEventListener('click', open);
          node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
          return node;
        };
        const hidden = cur.steps.filter((_, i) => !shown.includes(`${cur.age}:${i}`)).length;
        page.replaceChildren(
          el('h3', {}, ageName(cur.age)),
          el('p.muted.g-hint', {}, hidden ? `Steps are hidden so you can work things out yourself. (${hidden} hidden)` : 'All steps revealed.'),
          ...(hidden ? [el('p.controls', {}, 'Click a step to reveal it.')] : []),
          el('p.g-goal', {}, el('span.g-label', {}, 'Goal'), ...rich(cur.goal)),
          el('ol.g-steps', {}, ...cur.steps.map((st, i) => veil(`${cur.age}:${i}`, `Show step ${i + 1}`, el('li', {},
            el('div.g-head', {}, st.head),
            el('ul', {}, ...st.do.map((d) => el('li', {}, ...rich(d)))),
            st.tip ? el('p.g-tip', {}, el('span.g-label', {}, 'Tip'), ...rich(st.tip)) : null,
          )))),
          veil(`${cur.age}:next`, 'Show how to reach the next age', el('p.g-next', {}, el('span', {}, el('span.g-label', {}, 'Next age'), ...rich(cur.next)))),
          el('p.muted.g-key', {},
            el('span.g-tab', {}, 'Tabs'), ' · ', el('span.g-thing', {}, 'Research, chambers and buttons'), ' · ',
            el('span.g-res', {}, 'Resources'), ' · ', el('span.g-warn', {}, 'Watch out')),
        );
      },
    };
  })(),
};
