import { create } from "zustand";

/**
 * Per-system delta scaling. Reads from this store multiply their `useFrame`
 * delta — currently only the duel-loop physics tick. VFX (rings, particles,
 * post FX) deliberately stay on real time so the impact moment is *visible*
 * during a freeze (`research_impact_feedback_20260429.md` §3.4.1).
 *
 * Phase 10a ships only the simple hit-stop envelope (freeze for `ms` then
 * snap back to 1.0). Phase 10b extends with `slowmoKo()` for the KO
 * cinematic — freeze 350ms → 0.25× hold 650ms → ease back to 1.0 over 200ms.
 */

const FREEZE_SCALE = 0.05;
const SLOWMO_HOLD_SCALE = 0.25;
const SLOWMO_FREEZE_MS = 350;
const SLOWMO_HOLD_MS = 650;
const SLOWMO_EASE_MS = 200;

type Envelope =
  | { kind: "idle" }
  | { kind: "hitstop"; endAt: number }
  | {
      kind: "slowmo";
      freezeEndAt: number;
      holdEndAt: number;
      easeEndAt: number;
    };

interface TimeScaleState {
  /** Current scalar — read inside useFrame and multiply with raw dt. */
  scale: number;
  envelope: Envelope;
  /**
   * Trigger or extend a hit-stop. Multiple consecutive hits at different ms
   * extend the freeze rather than truncate it (longer wins). The longer KO
   * envelope replaces a hit-stop in progress.
   */
  hitstop: (ms: number, now?: number) => void;
  /** KO slow-mo envelope — freeze → hold → ease. Replaces any active state. */
  slowmoKo: (now?: number) => void;
  /** Advance envelope state. Call every frame from a single useFrame. */
  tick: (now: number) => void;
}

const easeOutCubic = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - Math.pow(1 - x, 3);
};

export const useTimeScale = create<TimeScaleState>((set, get) => ({
  scale: 1,
  envelope: { kind: "idle" },
  hitstop: (ms, now) => {
    const t = now ?? performance.now();
    const target = t + ms;
    const env = get().envelope;
    // Don't truncate a longer envelope (e.g. don't let a 60ms BLOCK hit-stop
    // override a 350ms KO freeze that started a frame earlier).
    if (env.kind === "slowmo") return;
    if (env.kind === "hitstop" && env.endAt > target) return;
    set({ envelope: { kind: "hitstop", endAt: target }, scale: FREEZE_SCALE });
  },
  slowmoKo: (now) => {
    const t = now ?? performance.now();
    set({
      envelope: {
        kind: "slowmo",
        freezeEndAt: t + SLOWMO_FREEZE_MS,
        holdEndAt: t + SLOWMO_FREEZE_MS + SLOWMO_HOLD_MS,
        easeEndAt: t + SLOWMO_FREEZE_MS + SLOWMO_HOLD_MS + SLOWMO_EASE_MS,
      },
      scale: FREEZE_SCALE,
    });
  },
  tick: (now) => {
    const env = get().envelope;
    if (env.kind === "idle") return;
    if (env.kind === "hitstop") {
      if (now >= env.endAt) {
        set({ envelope: { kind: "idle" }, scale: 1 });
      }
      return;
    }
    // slowmo
    if (now < env.freezeEndAt) {
      // already FREEZE_SCALE
      return;
    }
    if (now < env.holdEndAt) {
      if (get().scale !== SLOWMO_HOLD_SCALE) set({ scale: SLOWMO_HOLD_SCALE });
      return;
    }
    if (now < env.easeEndAt) {
      const t = (now - env.holdEndAt) / SLOWMO_EASE_MS;
      const eased = SLOWMO_HOLD_SCALE + (1 - SLOWMO_HOLD_SCALE) * easeOutCubic(t);
      set({ scale: eased });
      return;
    }
    set({ envelope: { kind: "idle" }, scale: 1 });
  },
}));
