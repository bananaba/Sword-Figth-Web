import {
  isInCounterWindow,
  isOnCooldown,
  isStunned,
  type AttackEvent,
  type FighterState,
  type GuardSnapshot,
  type Vec2,
  type WeaponStats,
} from "@vibejam/shared";

const SHOULDER_Y = 1.15;

export interface AiState {
  /** Wall-clock ms after which we may pick a new target guard angle. */
  nextGuardChangeAt: number;
  /** Wall-clock ms after which we may pick a new attack. */
  nextAttackAt: number;
  /** Current guard direction (radians, atan2). Smoothly tracks `targetGuardAngle`. */
  guardAngle: number;
  /** Desired guard direction — re-rolled every guardChangeMin..Max ms. */
  targetGuardAngle: number;
  /** Whether the bot is currently holding guard (default: yes). */
  guardActive: boolean;
  /** Phase accumulator (seconds) for the natural hand-tremor wobble. */
  wobblePhase: number;
}

/** Knobs that scale AI difficulty. Phase 4 uses one preset; ranked play would expose these. */
export interface AiTuning {
  guardChangeMinMs: number;
  guardChangeMaxMs: number;
  attackIntervalMinMs: number;
  attackIntervalMaxMs: number;
  thrustChance: number;
  /** Probability the bot reads player's guard and picks a parallel slice (pierce). */
  smartSliceChance: number;
  /** Exponential responsiveness of the smoothing toward target (1/s). Higher = snappier. */
  guardTrackResponsiveness: number;
  /** Hard cap on angular speed (rad/s) so big target jumps still arc smoothly. */
  guardMaxAngularSpeed: number;
  /** Amplitude of the idle hand tremor (radians). */
  guardWobbleAmplitude: number;
  /** Base frequency of the idle hand tremor (Hz). */
  guardWobbleFrequency: number;
}

export const DEFAULT_AI: AiTuning = {
  guardChangeMinMs: 700,
  guardChangeMaxMs: 1500,
  attackIntervalMinMs: 1400,
  attackIntervalMaxMs: 2800,
  thrustChance: 0.18,
  smartSliceChance: 0.4,
  guardTrackResponsiveness: 7.5,
  guardMaxAngularSpeed: 5.5,
  guardWobbleAmplitude: 0.07,
  guardWobbleFrequency: 1.3,
};

export interface AiTickResult {
  newAi: AiState;
  guard: GuardSnapshot;
  attack: AttackEvent | null;
}

export function initialAiState(now: number, tuning: AiTuning = DEFAULT_AI): AiState {
  const startAngle = Math.PI / 2;
  return {
    nextGuardChangeAt: now + randIn(tuning.guardChangeMinMs, tuning.guardChangeMaxMs),
    nextAttackAt: now + randIn(tuning.attackIntervalMinMs, tuning.attackIntervalMaxMs),
    guardAngle: startAngle,
    targetGuardAngle: startAngle,
    guardActive: true,
    wobblePhase: Math.random() * Math.PI * 2,
  };
}

/**
 * Decide what the bot does this frame. Pure-ish (uses Math.random — phase 4
 * scope; ranked play will swap to a seeded RNG passed in via context).
 *
 * Combat math runs in a single shared 2D blade plane (X = horizontal, Y = up,
 * both fighters' body silhouettes occupy X ∈ [-0.32, 0.32], Y ∈ [0, 1.7]).
 * Z separation is invisible to the resolver.
 */
export function tickAi(
  ai: AiState,
  selfState: FighterState,
  enemyState: FighterState,
  weapon: WeaponStats,
  now: number,
  dt: number,
  tuning: AiTuning = DEFAULT_AI,
): AiTickResult {
  const grip: Vec2 = { x: 0, y: SHOULDER_Y };

  if (isStunned(selfState, now)) {
    return {
      newAi: ai,
      guard: { active: false, grip, tip: grip },
      attack: null,
    };
  }

  let newAi = ai;
  if (now >= ai.nextGuardChangeAt) {
    newAi = {
      ...newAi,
      targetGuardAngle: pickGuardAngle(ai.targetGuardAngle, enemyState.guard),
      nextGuardChangeAt: now + randIn(tuning.guardChangeMinMs, tuning.guardChangeMaxMs),
    };
  }

  // Smoothly rotate the held angle toward the target. Critically-damped-style
  // exp decay (1 - e^{-k·dt}) keeps small corrections snappy while large
  // re-rolls still arc visibly. A hard rad/s cap prevents teleport-feel jumps
  // when the target is on the far side of the circle.
  const desired = wrapAngle(newAi.targetGuardAngle - newAi.guardAngle);
  const decay = 1 - Math.exp(-tuning.guardTrackResponsiveness * dt);
  const targeted = desired * decay;
  const maxStep = tuning.guardMaxAngularSpeed * dt;
  const step =
    targeted > maxStep ? maxStep : targeted < -maxStep ? -maxStep : targeted;
  const nextWobblePhase = newAi.wobblePhase + dt;
  const heldAngle = newAi.guardAngle + step;
  // Two-frequency wobble feels more like a person's natural hand than a
  // single sine — the second harmonic adds irregularity without committing
  // to expensive per-frame noise.
  const omega = 2 * Math.PI * tuning.guardWobbleFrequency;
  const wobble =
    Math.sin(nextWobblePhase * omega) * tuning.guardWobbleAmplitude +
    Math.sin(nextWobblePhase * omega * 1.7 + 1.3) * (tuning.guardWobbleAmplitude * 0.45);

  newAi = {
    ...newAi,
    guardAngle: heldAngle,
    wobblePhase: nextWobblePhase,
  };

  const guard = guardSegmentFromAngle(grip, heldAngle + wobble, weapon.bladeLength);

  let attack: AttackEvent | null = null;
  const counterReady = isInCounterWindow(selfState, now);
  const cooldownLocked = isOnCooldown(selfState, now);
  const wantsToAttack = counterReady || now >= newAi.nextAttackAt;

  if (!cooldownLocked && wantsToAttack) {
    attack = pickAttack(enemyState.guard, weapon, tuning);
    newAi = {
      ...newAi,
      nextAttackAt: now + randIn(tuning.attackIntervalMinMs, tuning.attackIntervalMaxMs),
    };
  }

  return { newAi, guard, attack };
}

/**
 * Player-mirroring guard: the segment is centred on the chest and oriented
 * perpendicular to the chosen `angle`. Matches `buildPerpendicularGuard`
 * (chest-centred) so the player reads the AI's posture the same way they
 * read their own.
 */
function guardSegmentFromAngle(grip: Vec2, angle: number, bladeLength: number): GuardSnapshot {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const px = -dirY;
  const py = dirX;
  const half = bladeLength / 2;
  return {
    active: true,
    grip: { x: grip.x - px * half, y: grip.y - py * half },
    tip: { x: grip.x + px * half, y: grip.y + py * half },
  };
}

/**
 * Sample a fresh **target** guard angle. Continuous (not snapped to PI/4
 * presets) so the smoothing in `tickAi` traces a believable arc instead of a
 * teleport. Biases toward cardinals so the silhouette still reads as a
 * recognizable guard pose, and rejects samples that are nearly the same as
 * the current target (makes the bot commit to a new direction) while also
 * softly limiting jumps past ~120° so the arc stays inside human-plausible
 * territory.
 */
function pickGuardAngle(currentTarget: number, enemyGuard: GuardSnapshot): number {
  const cardinals = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];
  for (let attempt = 0; attempt < 6; attempt++) {
    const cardinal = cardinals[Math.floor(Math.random() * cardinals.length)] ?? Math.PI / 2;
    // Wider spread (~±35°) than before so we don't always bias to the
    // exact cardinal; still recognizable as up/right/down/left.
    const candidate = cardinal + (Math.random() - 0.5) * 1.2;
    const delta = Math.abs(wrapAngle(candidate - currentTarget));
    if (delta < 0.25) continue; // too similar — keep moving
    if (delta > Math.PI * 0.75 && Math.random() < 0.6) continue; // damp huge flips
    return candidate;
  }
  // Occasional "react" target: mirror enemy's guard line so the bot's hand
  // looks like it's responding to the duel rather than rolling dice.
  if (enemyGuard.active && Math.random() < 0.35) {
    const dx = enemyGuard.tip.x - enemyGuard.grip.x;
    const dy = enemyGuard.tip.y - enemyGuard.grip.y;
    return Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.4;
  }
  return currentTarget + (Math.random() - 0.5) * Math.PI;
}

/** Wrap to (-PI, PI] for shortest-path angular interpolation. */
function wrapAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x <= -Math.PI) x += Math.PI * 2;
  return x;
}

function pickAttack(
  enemyGuard: GuardSnapshot,
  weapon: WeaponStats,
  tuning: AiTuning,
): AttackEvent {
  if (Math.random() < tuning.thrustChance) {
    return pickThrust(weapon);
  }
  return pickSlice(enemyGuard, tuning);
}

function pickThrust(weapon: WeaponStats): AttackEvent {
  const bodyY = 0.4 + Math.random() * 1.0;
  const fromLeft = Math.random() < 0.5;
  const startX = fromLeft ? -0.9 : 0.9;
  const dirX = fromLeft ? 1 : -1;
  return {
    kind: "thrust",
    origin: { x: startX, y: bodyY },
    direction: { x: dirX, y: 0 },
    reach: weapon.thrustReach,
    timestamp: performance.now(),
  };
}

function pickSlice(enemyGuard: GuardSnapshot, tuning: AiTuning): AttackEvent {
  let angle: number;
  if (enemyGuard.active && Math.random() < tuning.smartSliceChance) {
    const dx = enemyGuard.tip.x - enemyGuard.grip.x;
    const dy = enemyGuard.tip.y - enemyGuard.grip.y;
    angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.2;
  } else {
    angle = Math.random() * Math.PI * 2;
  }
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const reach = 1.3 + Math.random() * 0.6;
  const midY = 0.4 + Math.random() * 1.0;
  const half = reach / 2;
  return {
    kind: "slice",
    origin: { x: -cosA * half, y: midY - sinA * half },
    direction: { x: cosA, y: sinA },
    reach,
    timestamp: performance.now(),
  };
}

function randIn(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
