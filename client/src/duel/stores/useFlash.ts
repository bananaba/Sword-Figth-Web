import { create } from "zustand";

/**
 * Full-screen white flash for HIT/PIERCE/KO. Per
 * `research_impact_feedback_20260429.md` §3.1.5 + §2.1: 1f for HIT (~16ms),
 * 2f for PIERCE (~33ms), 3f for KO (~50ms). BLOCK is intentionally
 * excluded — it fires often and chained flashes cross the WCAG 3-flash/sec
 * threshold; the bright metal SFX layer carries the BLOCK punch instead.
 *
 * Rendered as a CSS overlay (`FullScreenFlash` in `Duel.tsx`) above the
 * R3F canvas — keeps it simple and avoids an extra render-target pass.
 */

interface FlashState {
  /** Current opacity in [0, 1]. */
  amount: number;
  startAt: number;
  endAt: number;
  /** Peak intensity (per outcome). */
  peak: number;
  /**
   * Trigger a flash. `intensity` is the peak alpha (0..1); `durationMs` is
   * the on-screen lifespan. A new pulse extends the active envelope if the
   * proposed end is later or peak is higher — never cuts short.
   */
  pulse: (durationMs: number, intensity: number, now: number) => void;
  /** Recompute `amount` (linear decay from peak). Call every frame. */
  tick: (now: number) => void;
  reset: () => void;
}

export const useFlash = create<FlashState>((set, get) => ({
  amount: 0,
  startAt: 0,
  endAt: 0,
  peak: 0,
  pulse: (durationMs, intensity, now) => {
    const target = now + durationMs;
    const cur = get();
    const newPeak = Math.max(cur.peak, intensity);
    const newEnd = Math.max(cur.endAt, target);
    // Anchor startAt to the *earlier* start so decay still completes by
    // newEnd; if there was no active envelope, start now.
    const newStart = cur.amount > 0 ? cur.startAt : now;
    // Don't snap brightness back up when extending a still-decaying envelope:
    // a fresh, smaller pulse arriving on top of a brighter one should NOT
    // make the screen go dim, but it shouldn't reset to the original peak
    // either — that would create a visible upward flicker. tick() will
    // recompute on the next frame from (startAt, endAt, peak), so we only
    // need to ensure the *current* frame doesn't dim below either value.
    set({
      startAt: newStart,
      endAt: newEnd,
      peak: newPeak,
      amount: Math.max(cur.amount, intensity),
    });
  },
  tick: (now) => {
    const { startAt, endAt, peak, amount } = get();
    if (amount <= 0) return;
    if (now >= endAt) {
      set({ amount: 0, peak: 0, startAt: 0, endAt: 0 });
      return;
    }
    const total = Math.max(1, endAt - startAt);
    const elapsed = Math.max(0, now - startAt);
    const next = peak * (1 - elapsed / total);
    if (Math.abs(next - amount) > 0.01) set({ amount: Math.max(0, next) });
  },
  reset: () => set({ amount: 0, peak: 0, startAt: 0, endAt: 0 }),
}));
