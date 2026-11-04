// Genome: genes carried by this colony's queen. Choose them once per colony; a gene carried
// through a flight gains expression, and at full expression it is fixed in your line forever.
// Reads ctx.state.lineage.flights. Publishes mods named in GENOME.genes.
import type { GameSystem, Context } from '../../core/types';
import { el } from '../../core/ui';
import { GENOME as G } from '../../data/balance';

interface GenomeState { expr: Record<string, number>; carried: string[] }
const S = (ctx: Context) => ctx.state.genome as GenomeState;
const IDS = Object.keys(G.genes);
const flights = (ctx: Context) => ctx.state.lineage?.flights ?? 0;
const fixed = (ctx: Context, id: string) => (S(ctx).expr[id] ?? 0) >= G.fixAt;
const slots = (ctx: Context) => G.slotsAt.filter((f) => flights(ctx) >= f).length;

export const genome: GameSystem = {
  id: 'genome',

  init(ctx) {
    ctx.state.genome = { expr: {}, carried: [] } satisfies GenomeState;
  },

  isUnlocked: (ctx) => flights(ctx) >= 2,

  keep(ctx) {
    const s = S(ctx);
    const expr = { ...s.expr };
    for (const id of s.carried) if (!fixed(ctx, id)) expr[id] = (expr[id] ?? 0) + 1;
    return { expr, carried: [] };
  },

  tick(ctx) {
    const s = S(ctx);
    const totals: Record<string, number> = {};
    for (const id of IDS) {
      const g = G.genes[id], e = Math.min(G.fixAt, s.expr[id] ?? 0);
      const share = fixed(ctx, id) || s.carried.includes(id) ? 1 : e * G.partial;
      totals[g.mod] = (totals[g.mod] ?? 0) + g.value * share;
    }
    for (const id of IDS) ctx.mods.set(G.genes[id].mod, 'genome', totals[G.genes[id].mod] ?? 0);
  },

  panel: (() => {
    let head: HTMLElement, list: HTMLElement;
    let sig = '';
    return {
      title: 'Genome',
      mount(root) {
        head = el('p');
        list = el('div.ledger');
        root.append(
          el('p.flavor', {}, 'The queen carries the whole line in her body. What she passes on, the colony becomes.'),
          el('p.muted', {}, `Choose the genes this colony's queen carries. A choice holds for the whole colony. Carry a gene through a flight and it gains expression; at ${G.fixAt} it is fixed in your line, always on, and frees its slot. Every level of expression also keeps a tenth of the gene's effect forever.`),
          head, list,
        );
      },
      update(_root, ctx) {
        const s = S(ctx);
        const free = slots(ctx) - s.carried.length;
        const nextAt = G.slotsAt.find((f) => f > flights(ctx));
        head.textContent = `Slots: ${s.carried.length} of ${slots(ctx)} used.` + (nextAt !== undefined ? ` Another slot opens at ${nextAt} flights.` : '');
        const now = JSON.stringify([s.expr, s.carried, free]);
        if (now === sig) return;
        sig = now;
        list.replaceChildren(...IDS.map((id) => {
          const g = G.genes[id], e = Math.min(G.fixAt, s.expr[id] ?? 0);
          const state = fixed(ctx, id) ? 'fixed in your line' : s.carried.includes(id) ? 'carried by this queen' : e ? `expression ${e}/${G.fixAt}, ${Math.round(e * G.partial * 100)}% kept` : 'dormant';
          const btn = el('button.ghost', { type: 'button', hidden: fixed(ctx, id) || s.carried.includes(id) || free <= 0 }, 'Carry') as HTMLButtonElement;
          btn.addEventListener('click', () => {
            if (!btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = 'Click again to carry it'; setTimeout(() => { delete btn.dataset.armed; btn.textContent = 'Carry'; }, 4000); return; }
            if (slots(ctx) - S(ctx).carried.length > 0) { S(ctx).carried.push(id); ctx.log(`The queen's line now carries ${g.name.toLowerCase()}.`, 'info'); }
          });
          return el('div', {}, el('span', {}, el('strong', {}, g.name), ' ', el('span.muted', {}, g.desc)), el('span', {}, el('span.muted', {}, state + ' '), btn));
        }));
      },
    };
  })(),
};
