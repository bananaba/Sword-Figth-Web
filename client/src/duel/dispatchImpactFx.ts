import { useFlash } from "./stores/useFlash";
import { useImpacts, type ImpactKind } from "./stores/useImpacts";
import { useShake } from "./stores/useShake";
import { useTimeScale } from "./stores/useTimeScale";

/**
 * Per-OUTCOME quantitative table from `research_impact_feedback_20260429.md`
 * §2.1. Trauma values come from §3.5.2; hit-stop ms from the same table.
 *
 * Hit-stop hierarchy: BLOCK < HIT < PIERCE < KO. KO is its own slow-mo
 * envelope (freeze + hold + ease) rather than a plain hit-stop — the
 * dispatcher routes accordingly.
 *
 * Flash: BLOCK is intentionally null — high-frequency outcome would chain
 * across the WCAG 3-flash/sec limit. Bright metal SFX (Phase 9) carries
 * BLOCK punch instead.
 *
 * Vibrate: Android Chrome / Samsung Internet only (iOS Safari opposes the
 * Vibration API per §3.3.1; iOS users get the audio sub-bass fallback in
 * Phase 9). Patterns from §3.3.2.
 */

interface FxParams {
  trauma: number;
  hitstopMs: number;
  flash: { ms: number; intensity: number } | null;
  vibrate: number[] | null;
}

const FX_TABLE: Record<ImpactKind, FxParams> = {
  block: {
    trauma: 0.20,
    hitstopMs: 60,
    flash: null,
    vibrate: [40, 30, 40],
  },
  hit: {
    trauma: 0.45,
    hitstopMs: 100,
    flash: { ms: 16, intensity: 0.45 },
    vibrate: [80],
  },
  pierce: {
    trauma: 0.55,
    hitstopMs: 150,
    flash: { ms: 33, intensity: 0.6 },
    vibrate: [20, 20, 80],
  },
  ko: {
    trauma: 0.85,
    hitstopMs: 350,
    flash: { ms: 50, intensity: 0.85 },
    vibrate: [200, 100, 400],
  },
};

function tryVibrate(pattern: number[]): void {
  // Feature-detect — graceful no-op on Chrome desktop / Firefox / Safari.
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    vibrate?: (p: number | number[]) => boolean;
  };
  if (typeof nav.vibrate !== "function") return;
  try {
    nav.vibrate(pattern);
  } catch {
    /* some browsers throw on user-gesture absence — silently ignore */
  }
}

export interface ImpactCtx {
  attackerIsPlayer: boolean;
  worldZ: number;
  worldY: number;
  now: number;
}

/**
 * Single entry point — fires impact ring, camera shake, and time freeze in
 * one call. Resolver outcomes (hit/pierce/block) and ringout detection
 * (ko) both route through here so all 5 sensory axes stay ±1 frame in
 * sync (research §1 "위계 일관성 원칙").
 *
 * Phase 11 server: when the authoritative server broadcasts an outcome,
 * the network handler calls this same function with the received
 * `(kind, ctx)` — no extra plumbing needed.
 */
export function dispatchImpactFx(kind: ImpactKind, ctx: ImpactCtx): void {
  useImpacts.getState().push({
    kind,
    attackerIsPlayer: ctx.attackerIsPlayer,
    worldZ: ctx.worldZ,
    worldY: ctx.worldY,
    at: ctx.now,
  });
  const params = FX_TABLE[kind];
  useShake.getState().add(params.trauma);
  if (kind === "ko") {
    useTimeScale.getState().slowmoKo(ctx.now);
  } else {
    useTimeScale.getState().hitstop(params.hitstopMs, ctx.now);
  }
  if (params.flash) {
    useFlash.getState().pulse(params.flash.ms, params.flash.intensity, ctx.now);
  }
  if (params.vibrate) tryVibrate(params.vibrate);
}
