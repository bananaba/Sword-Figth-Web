/**
 * Combat data model — shared by client and (future) authoritative server.
 *
 * Coordinate convention: every spatial value passed to {@link resolveAttack}
 * is expressed in the **defender's local 2D frame**.
 *  - origin  = defender's feet, on the duel platform ground
 *  - +x      = defender's right (= attacker's left, since they face each other)
 *  - +y      = up
 *
 * Each fighter renders in 3D (over-the-shoulder camera) but their swords live
 * in a 2D "blade plane" perpendicular to their facing direction. The duel
 * engine projects mouse cursor → blade plane → defender frame before calling
 * the resolver.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Segment {
  a: Vec2;
  b: Vec2;
}

/** Axis-aligned bounding box that represents a fighter's hittable silhouette. */
export interface BodyHitbox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export type AttackKind = "slice" | "thrust";

/**
 * One discrete attack input. The duel engine is responsible for mapping the
 * raw mouse input (drag-release for slice, double/middle click for thrust)
 * into this shape — the resolver doesn't care about the input device.
 *
 * `origin`/`direction`/`reach` define a single line segment in the defender's
 * frame: the path swept by the blade tip. For slice this is mousedown → mouseup;
 * for thrust this is current tip → tip + weapon.thrustReach * direction.
 */
export interface AttackEvent {
  kind: AttackKind;
  origin: Vec2;
  direction: Vec2;
  reach: number;
  timestamp: number;
}

/**
 * Snapshot of the defender's guard at the moment the attack lands. The guard
 * is a single line segment from grip (shoulder) to blade tip. When `active`
 * is false the segment is ignored.
 */
export interface GuardSnapshot {
  active: boolean;
  grip: Vec2;
  tip: Vec2;
}

export interface FighterState {
  /** 1D position along the duel axis (defender's local x extended to platform). */
  posX: number;
  /** 1D velocity (knockback impulses are accumulated here). */
  velX: number;
  /** Wall-clock ms; before this timestamp the fighter cannot start a new attack. */
  attackCooldownUntil: number;
  /** Wall-clock ms; before this timestamp the fighter is stunned (no inputs). */
  stunUntil: number;
  /** Wall-clock ms; before this timestamp the fighter's next attack uses counterKnockback. */
  counterUntil: number;
  /**
   * Wall-clock ms; while `now < tradeImmuneUntil` this fighter cannot be hit.
   * Set on whoever LANDS an attack — they get a brief grace where retaliation
   * within the same exchange is voided. Prevents "I hit you, you hit me back
   * one frame later" trades and forces a clean mind-game beat between hits.
   */
  tradeImmuneUntil: number;
  /** Latest guard snapshot from this fighter. */
  guard: GuardSnapshot;
}

/**
 * Resolution outcome of one attack. The resolver is purely descriptive —
 * `applyOutcome` is what mutates state. This keeps resolver decisions
 * inspectable for debug overlays / replay tooling / netcode reconciliation.
 */
export type OutcomeKind =
  | "rejected" // attacker on cooldown or stunned — the input did nothing
  | "miss" // attack path never reached defender's body
  | "hit" // landed cleanly (no guard, or guard didn't intersect path)
  | "pierce" // path crossed guard but at parallel angle — sword slid past
  | "block"; // path crossed guard near perpendicular — attacker stunned

export interface Outcome {
  kind: OutcomeKind;
  knockback: number;
  attackerStun: number;
  defenderCounterWindow: number;
}

/**
 * Per-weapon tuning. Future weapons (charge sword, twin swords, …) will ship
 * by swapping this stats object — the resolver is weapon-agnostic.
 *
 * Knobs explicitly called out by the design:
 *  - sliceKnockback     ↓ for harder swords with bigger thrust/counter payoff
 *  - thrustKnockback    ↑ for thrust-focused weapons
 *  - counterKnockback   ↑ for counter-focused weapons
 *  - attackCooldownMs   ↓ for fast weapons
 *  - guardAngleTolerance ↑ for forgiving-block weapons
 */
export interface WeaponStats {
  sliceKnockback: number;
  thrustKnockback: number;
  counterKnockback: number;
  attackCooldownMs: number;
  /** Half-width (radians) around perpendicular that counts as a block. */
  guardAngleTolerance: number;
  /** Length the blade tip travels during a thrust. */
  thrustReach: number;
  /** Wind-up duration for thrust before impact lands. */
  thrustChargeMs: number;
  /**
   * Duration of the post-block window. Used as:
   *   - attacker's stun lockout after a perpendicular slice block or thrust block
   *   - defender's counter window (next attack uses counterKnockback)
   * Both ends of the dynamic share the same clock so they always resolve together.
   */
  stunMs: number;
  /** Static blade length (sword orientation = grip → tip, fixed length). */
  bladeLength: number;
  /** Minimum slice drag distance for the input to register. Below this the input is ignored. */
  minSliceReach: number;
  /**
   * Fraction of the knockback impulse the attacker also receives in the same
   * direction as the defender. 0 = old behaviour (only defender moves);
   * 0.5 = attacker drifts forward at half the defender's speed, keeping the
   * pair engaged and stretching duels.
   */
  attackerFollowFraction: number;
  /**
   * Speed (units / second) below which a fighter is "settled" enough to land
   * or absorb an attack. Above this, both attacker and defender's strikes
   * resolve as MISS — you can't hit cleanly while sliding.
   */
  motionImmunityVelocityThreshold: number;
  /** Grace window (ms) granted to whoever landed a HIT/PIERCE — they cannot be hit back during it. */
  tradeImmuneMs: number;
  /**
   * Pre-impact telegraph time. The attacker commits the input, the sword
   * visibly winds up to the swing-start pose for this many ms, THEN the
   * resolver fires. Lets the opponent read the attack and adjust guard.
   */
  windUpMs: number;
  /**
   * Time the swing visually sweeps from start to end after impact. Visual-only
   * (resolver fires at impact); the value drives the recovery interpolation.
   */
  swingDurationMs: number;
}
