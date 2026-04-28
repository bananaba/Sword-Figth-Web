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
  /** Wall-clock ms after which we may pick a new guard angle. */
  nextGuardChangeAt: number;
  /** Wall-clock ms after which we may pick a new attack. */
  nextAttackAt: number;
  /** Current guard direction (radians, atan2 convention) for visualisation. */
  guardAngle: number;
  /** Whether the bot is currently holding guard (default: yes). */
  guardActive: boolean;
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
}

export const DEFAULT_AI: AiTuning = {
  guardChangeMinMs: 700,
  guardChangeMaxMs: 1500,
  attackIntervalMinMs: 1400,
  attackIntervalMaxMs: 2800,
  thrustChance: 0.18,
  smartSliceChance: 0.4,
};

export interface AiTickResult {
  newAi: AiState;
  guard: GuardSnapshot;
  attack: AttackEvent | null;
}

export function initialAiState(now: number, tuning: AiTuning = DEFAULT_AI): AiState {
  return {
    nextGuardChangeAt: now + randIn(tuning.guardChangeMinMs, tuning.guardChangeMaxMs),
    nextAttackAt: now + randIn(tuning.attackIntervalMinMs, tuning.attackIntervalMaxMs),
    guardAngle: Math.PI / 2,
    guardActive: true,
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
      guardAngle: pickGuardAngle(),
      nextGuardChangeAt: now + randIn(tuning.guardChangeMinMs, tuning.guardChangeMaxMs),
    };
  }

  const guard = guardSegmentFromAngle(grip, newAi.guardAngle, weapon.bladeLength);

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

function pickGuardAngle(): number {
  const presets = [
    Math.PI / 2, // up
    -Math.PI / 2, // down
    0, // right
    Math.PI, // left
    Math.PI / 4,
    (3 * Math.PI) / 4,
    -Math.PI / 4,
    (-3 * Math.PI) / 4,
  ];
  const base = presets[Math.floor(Math.random() * presets.length)] ?? Math.PI / 2;
  return base + (Math.random() - 0.5) * 0.25;
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
