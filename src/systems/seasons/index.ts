// Seasons: from the Age of Wings on, the year turns. Spring quickens the brood, summer and autumn
// are rich, and winter shuts the surface: foraging nearly stops, expeditions and sorties wait, and the
// colony eats less while it huddles on its stores. The nuptial flight needs a warm evening (spring or summer).
// Publishes mods only (brood, upkeep, job:*, expLoot, plus 'winter' and 'cold' for other systems to read).
import type { GameSystem, Context } from '../../core/types';
import { el, progressBar } from '../../core/ui';
import { dockStrip } from '../../core/queue';
import { RESEARCH, SEASONS } from '../../data/balance';

interface SeasonState { t: number; year: number; winters: number; starvedAtWinter?: number; started?: boolean }
const S = (ctx: Context) => ctx.state.seasons as SeasonState;
const WINGS = RESEARCH.ages.findIndex((a) => a.id === 'wings');
/** The year only turns once the colony has reached the Age of Wings. */
export const seasonsOn = (ctx: Context) => RESEARCH.ages.findIndex((a) => a.id === ctx.state.research?.age) >= WINGS;
const seasonIdx = (ctx: Context) => Math.floor(S(ctx).t / SEASONS.length) % SEASONS.list.length;
const season = (ctx: Context) => SEASONS.list[seasonIdx(ctx)];
const left = (ctx: Context) => SEASONS.length - (S(ctx).t % SEASONS.length);
const starved = (ctx: Context) => ctx.state.jobs?.starved ?? 0;
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// the season strip above the Chronicle
const bar = progressBar();
const name = el('strong'), when = el('span.muted');
const strip = el('div.queue.season', {}, el('div.qhead', {}, 'The year'), el('div.row', {}, name, when), bar.root);
dockStrip(0, strip, (ctx) => {
  strip.hidden = !ctx.state.seasons || !seasonsOn(ctx);
  if (strip.hidden) return;
  const s = S(ctx), se = season(ctx), next = SEASONS.list[(seasonIdx(ctx) + 1) % SEASONS.list.length];
  name.textContent = `${se.name}, year ${s.year}`;
  when.textContent = ` ${next.name} in ${clock(left(ctx) / ctx.speed)}`;
  strip.dataset.season = se.id;
  bar.set((s.t % SEASONS.length) / SEASONS.length);
  strip.title = se.note + (se.id === 'winter' ? ' Expeditions wait for spring.' : '') + (se.mods.cold ? ' No warm evenings for a flight.' : ' Warm evenings: a flight can leave.');
});

export const seasons: GameSystem = {
  id: 'seasons',
  init(ctx) {
    ctx.state.seasons = { t: 0, year: 1, winters: 0 } satisfies SeasonState;
  },
  tick(ctx, dt) {
    const s = S(ctx);
    const on = seasonsOn(ctx);
    for (const se of SEASONS.list) for (const m of Object.keys(se.mods)) ctx.mods.set(m, 'season', 0);
    ctx.alert('winter', null);
    if (!on) return;
    if (!s.started) {
      s.started = true;
      ctx.log('The air changes. For the first time the colony feels the year turn: spring now, and winter somewhere ahead. (The year is shown above the Chronicle.)', 'story');
    }
    const before = seasonIdx(ctx);
    s.t += dt;
    const now = seasonIdx(ctx);
    if (now !== before) {
      const se = season(ctx);
      if (before === SEASONS.list.length - 1) {
        s.year++;
        const fine = starved(ctx) <= (s.starvedAtWinter ?? 0);
        if (fine) s.winters++;
        ctx.log(fine ? `Spring. The colony came through the winter whole. (${s.winters} winter${s.winters > 1 ? 's' : ''} survived: +${SEASONS.winterLineage} lineage each)` : 'Spring, at last. Not everyone lived to see it.', fine ? 'story' : 'warn');
      } else ctx.log(`${se.name}. ${se.note}`, 'story');
      if (se.id === 'winter') s.starvedAtWinter = starved(ctx);
      ctx.announce(se.name, se.note, { small: true, kicker: `Year ${s.year}` });
    }
    for (const [m, v] of Object.entries(season(ctx).mods)) ctx.mods.set(m, 'season', v);
    const nextIsWinter = SEASONS.list[(now + 1) % SEASONS.list.length].id === 'winter';
    if (nextIsWinter && left(ctx) < SEASONS.warnBefore) ctx.alert('winter', `Winter comes in ${Math.ceil(left(ctx) / ctx.speed)}s. Fill the stores: foraging all but stops.`);
  },
};
