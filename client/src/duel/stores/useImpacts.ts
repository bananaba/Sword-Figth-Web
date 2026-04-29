import { create } from "zustand";

/**
 * Visual impact event store. Replaces the `impactEvents` ref array that
 * `useDuelLoop` previously owned — moving this to a single zustand entry
 * point lets `dispatchImpactFx` fire from any context (resolver, ringout
 * detection, future server outcomes) without threading refs around.
 *
 * `kind` extends the resolver's `Outcome["kind"]` with `"ko"` so ringout
 * cinematics share the same channel as in-round hits.
 */

export type ImpactKind = "hit" | "pierce" | "block" | "ko";

export interface ImpactEvent {
  id: number;
  kind: ImpactKind;
  /** Side that *caused* the event — for KO this is the surviving fighter. */
  attackerIsPlayer: boolean;
  /** World-space duel-line Z (resolver `posX`). */
  worldZ: number;
  /** World-space Y on the blade plane (chest height typical). */
  worldY: number;
  /** `performance.now()` at dispatch. */
  at: number;
}

interface ImpactsState {
  events: ImpactEvent[];
  push: (e: Omit<ImpactEvent, "id">) => void;
  /** Drop events older than `cutoffMs` ago. Called once per frame. */
  prune: (now: number, lifetimeMs: number) => void;
  /** Reset for new match. */
  clear: () => void;
}

let nextId = 0;

export const useImpacts = create<ImpactsState>((set) => ({
  events: [],
  push: (e) =>
    set((s) => ({ events: [...s.events, { ...e, id: nextId++ }] })),
  prune: (now, lifetimeMs) =>
    set((s) => {
      const cutoff = now - lifetimeMs;
      const next = s.events.filter((e) => e.at >= cutoff);
      // Avoid triggering subscribers when nothing changed.
      return next.length === s.events.length ? s : { events: next };
    }),
  clear: () => set({ events: [] }),
}));
