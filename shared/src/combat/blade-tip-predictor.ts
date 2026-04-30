import type { Vec2 } from "./types.js";

export interface BladeTipPredictionOptions {
  /** Seconds of latest measured velocity to project past the newest snapshot. */
  maxLeadSeconds: number;
  /** Maximum distance the prediction may extend from the latest server tip. */
  maxLeadDistance: number;
  /** Upper bound for measured cursor speed in blade-plane units / second. */
  maxSpeed: number;
  /** Higher values catch up faster; expressed as exponential smoothing rate. */
  catchupRate: number;
  /** How hard a fresh snapshot pulls the render position toward the server tip. */
  snapshotCorrection: number;
}

export interface BladeTipPredictor {
  rendered: Vec2;
  latestSnapshot: Vec2;
  previousSnapshot: Vec2 | null;
  velocity: Vec2;
  latestSnapshotAtMs: number;
  options: BladeTipPredictionOptions;
}

export type BladeTipPredictionInput =
  | { kind: "snapshot"; tip: Vec2; receivedAtMs: number }
  | { kind: "frame"; dtSeconds: number; nowMs: number };

const DEFAULT_OPTIONS: BladeTipPredictionOptions = {
  maxLeadSeconds: 0.08,
  maxLeadDistance: 0.42,
  maxSpeed: 24,
  catchupRate: 26,
  snapshotCorrection: 0.85,
};

export function createBladeTipPredictor(
  initialTip: Vec2,
  options: Partial<BladeTipPredictionOptions> = {},
): BladeTipPredictor {
  return {
    rendered: { ...initialTip },
    latestSnapshot: { ...initialTip },
    previousSnapshot: null,
    velocity: { x: 0, y: 0 },
    latestSnapshotAtMs: Number.NEGATIVE_INFINITY,
    options: { ...DEFAULT_OPTIONS, ...options },
  };
}

export function resetBladeTipPredictor(
  predictor: BladeTipPredictor,
  tip: Vec2,
): BladeTipPredictor {
  return {
    ...predictor,
    rendered: { ...tip },
    latestSnapshot: { ...tip },
    previousSnapshot: null,
    velocity: { x: 0, y: 0 },
    latestSnapshotAtMs: Number.NEGATIVE_INFINITY,
  };
}

export function updateBladeTipPrediction(
  predictor: BladeTipPredictor,
  input: BladeTipPredictionInput,
): BladeTipPredictor {
  if (input.kind === "snapshot") {
    const velocity = measureVelocity(predictor, input.tip, input.receivedAtMs);
    return {
      ...predictor,
      rendered: lerpVec(
        predictor.rendered,
        input.tip,
        clamp01(predictor.options.snapshotCorrection),
      ),
      previousSnapshot: predictor.latestSnapshot,
      latestSnapshot: { ...input.tip },
      latestSnapshotAtMs: input.receivedAtMs,
      velocity,
    };
  }

  const ageSeconds = Math.max(
    0,
    (input.nowMs - predictor.latestSnapshotAtMs) / 1000,
  );
  const leadSeconds = Math.min(ageSeconds, predictor.options.maxLeadSeconds);
  const predicted = clampLead(
    {
      x: predictor.latestSnapshot.x + predictor.velocity.x * leadSeconds,
      y: predictor.latestSnapshot.y + predictor.velocity.y * leadSeconds,
    },
    predictor.latestSnapshot,
    predictor.options.maxLeadDistance,
  );
  const alpha = 1 - Math.exp(-predictor.options.catchupRate * input.dtSeconds);
  return {
    ...predictor,
    rendered: lerpVec(predictor.rendered, predicted, clamp01(alpha)),
  };
}

function measureVelocity(
  predictor: BladeTipPredictor,
  tip: Vec2,
  receivedAtMs: number,
): Vec2 {
  if (!Number.isFinite(predictor.latestSnapshotAtMs)) return { x: 0, y: 0 };
  const dtSeconds = (receivedAtMs - predictor.latestSnapshotAtMs) / 1000;
  if (dtSeconds <= 0) return { x: 0, y: 0 };

  const raw = {
    x: (tip.x - predictor.latestSnapshot.x) / dtSeconds,
    y: (tip.y - predictor.latestSnapshot.y) / dtSeconds,
  };
  return clampMagnitude(raw, predictor.options.maxSpeed);
}

function clampLead(tip: Vec2, latest: Vec2, maxDistance: number): Vec2 {
  const offset = { x: tip.x - latest.x, y: tip.y - latest.y };
  const clamped = clampMagnitude(offset, Math.max(0, maxDistance));
  return { x: latest.x + clamped.x, y: latest.y + clamped.y };
}

function clampMagnitude(v: Vec2, maxMagnitude: number): Vec2 {
  const magnitude = Math.hypot(v.x, v.y);
  if (magnitude <= maxMagnitude || magnitude === 0) return v;
  const scale = maxMagnitude / magnitude;
  return { x: v.x * scale, y: v.y * scale };
}

function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
