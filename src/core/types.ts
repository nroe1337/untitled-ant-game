// Shared contracts. Systems only talk to each other through the Context:
// resources, flags, events and "busy" ant counts. Never import another system.

import type { Resources } from './resources';
import type { EventBus } from './events';
import type { Mods } from './mods';

export interface Context {
  res: Resources;
  /** Permanent milestones, e.g. "chamber:brood" or "surface". Saved. */
  flags: Set<string>;
  bus: EventBus;
  /** Ants a system is currently using (expeditions out, soldiers away...). Jobs subtracts these. */
  busy: Record<string, number>;
  /**
   * Show (or clear with null) a persistent banner at the top of the screen. Use it for anything
   * bad that is happening right now, so a distracted player can't miss it. Call every tick.
   */
  alert(id: string, msg: string | null): void;
  /** Write a line to the story log. */
  log(msg: string, kind?: 'story' | 'info' | 'warn'): void;
  /** Per-system saved state. Each system owns state[its id]. */
  state: Record<string, any>;
  /** Shared bonuses by name (see mods.ts). Not saved: systems re-publish them every tick. */
  mods: Mods;
  /** Simulation speed multiplier (dev tool). */
  speed: number;
  /** True while the player has paused the game. Systems don't tick; buttons still work. */
  paused: boolean;
  /** A short fanfare at the top of the screen for a big milestone, such as reaching a new age. */
  /** A banner over the main column. small: a lighter one for battles and the like, with a kicker line and a list of results. */
  announce(title: string, text: string, opts?: { small?: boolean; kicker?: string; lines?: string[]; loss?: boolean }): void;
  /**
   * Prestige: start a new colony. Every system's state is wiped except what its keep() returns,
   * and only flags starting with "legacy:" survive. The page reloads into the new colony.
   */
  rebirth(): void;
}

export interface Panel {
  title: string;
  /** Top-level tab this panel sits under (e.g. "Colony", "World"). Panels in a group share a sub-tab row. */
  group?: string;
  /** Never light this tab's new-content dot (it only shows things the player has already seen). */
  quiet?: boolean;
  /** Called once when the panel first appears. Build DOM here. */
  mount(el: HTMLElement, ctx: Context): void;
  /** Called every UI frame (~10/s). Update numbers and button states. */
  update?(el: HTMLElement, ctx: Context): void;
}

export interface GameSystem {
  id: string;
  /** Set up resources, default state, and event listeners. */
  init(ctx: Context): void;
  /** Simulation step, dt in seconds (already multiplied by speed). */
  tick?(ctx: Context, dt: number): void;
  /** When does this system's panel appear? Default: always. */
  isUnlocked?(ctx: Context): boolean;
  panel?: Panel;
  /** On rebirth (prestige), return the part of ctx.state[id] to carry into the next colony. */
  keep?(ctx: Context): unknown;
}
