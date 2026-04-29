import { create } from "zustand";

/**
 * Eiserloh trauma model (GDC 2016 *Juicing Your Cameras with Math*). Trauma
 * accumulates from impacts (cap 1.0), decays linearly, and the camera
 * applies `trauma²` as the shake amplitude — squaring keeps the curve
 * punchy at the start and falls off fast.
 *
 * Critical: only X/Y rotational/positional perturbations. Z shake triggers
 * motion sickness #1 (Xbox Accessibility Guideline 117) and would break
 * the camera-follow lerp in `Duel.GameStage`.
 */

const TRAUMA_DECAY_PER_SEC = 1.4;

interface ShakeState {
  /** Current trauma in [0, 1]. Camera applies `trauma²` as amplitude. */
  trauma: number;
  /** Add to trauma (clamped to 1.0). Phase 10a fires from dispatchImpactFx. */
  add: (amount: number) => void;
  /** Decay called every frame from a single useFrame on real-time dt. */
  decay: (dtSeconds: number) => void;
  reset: () => void;
}

export const useShake = create<ShakeState>((set) => ({
  trauma: 0,
  add: (amount) =>
    set((s) => ({ trauma: Math.min(1, s.trauma + amount) })),
  decay: (dt) =>
    set((s) =>
      s.trauma <= 0
        ? s
        : { trauma: Math.max(0, s.trauma - TRAUMA_DECAY_PER_SEC * dt) },
    ),
  reset: () => set({ trauma: 0 }),
}));
