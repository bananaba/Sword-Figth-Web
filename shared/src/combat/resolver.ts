import {
  acuteAngleBetween,
  add,
  scale,
  segmentIntersectsBox,
  sub,
} from "./geometry.js";
import type {
  AttackEvent,
  BodyHitbox,
  FighterState,
  Outcome,
  WeaponStats,
} from "./types.js";

/**
 * Resolve one attack event from `attacker` against `defender`. Pure function
 * — does not mutate either argument. Use {@link applyOutcome} to fold the
 * resulting Outcome back into fighter state.
 *
 * Decision order (Appendix A of research_chambara_20260428.md, with the user's
 * geometric-validity additions):
 *
 *   1. Reject if attacker is on cooldown or stunned.
 *   2. Compute the swept blade-tip segment (origin → origin + reach·dir).
 *   3. If the segment doesn't cross the defender's body hitbox → MISS.
 *   4. Thrust path:
 *      - guard active → BLOCK (no stun, no knockback — wasted attack)
 *      - no guard     → HIT (counter-window upgrades to counterKnockback)
 *   5. Slice path:
 *      - guard segment doesn't intersect slice path  → HIT (guard out of position)
 *      - intersects, angle near perpendicular        → BLOCK (attacker stunned, defender gets counter window)
 *      - intersects, angle near parallel             → PIERCE (HIT through guard)
 *
 * Coordinates are in the defender's local frame (see types.ts header).
 */
export function resolveAttack(
  attacker: FighterState,
  defender: FighterState,
  defenderBody: BodyHitbox,
  event: AttackEvent,
  weapon: WeaponStats,
  now: number,
): Outcome {
  // Cooldown is the duel loop's responsibility (it gates inputs via
  // `commitPending`). The resolver only fires at impact and at that point the
  // attacker IS attacking — checking attackCooldownUntil here would always
  // reject because the cooldown was set at input time and extends past impact.
  if (now < attacker.stunUntil) {
    return rejected();
  }

  const attackEnd = add(event.origin, scale(event.direction, event.reach));
  const hitsBody = segmentIntersectsBox(event.origin, attackEnd, defenderBody);
  if (!hitsBody) {
    return { kind: "miss", knockback: 0, attackerStun: 0, defenderCounterWindow: 0 };
  }

  // Movement immunity (rule 3a): you can't land or absorb a clean hit while
  // sliding under knockback. The swing still costs cooldown — it just whiffs.
  const moving =
    Math.abs(attacker.velX) > weapon.motionImmunityVelocityThreshold ||
    Math.abs(defender.velX) > weapon.motionImmunityVelocityThreshold;
  if (moving) {
    return { kind: "miss", knockback: 0, attackerStun: 0, defenderCounterWindow: 0 };
  }

  // Trade immunity (rule 3b): if the defender just landed an attack, the
  // attacker's same-tempo retaliation is voided. Forces a clean rhythm
  // between exchanges instead of mutual-trade chaos.
  if (now < defender.tradeImmuneUntil) {
    return { kind: "miss", knockback: 0, attackerStun: 0, defenderCounterWindow: 0 };
  }

  const counterActive = now < attacker.counterUntil;

  if (event.kind === "thrust") {
    if (defender.guard.active) {
      return {
        kind: "block",
        knockback: 0,
        attackerStun: weapon.stunMs,
        defenderCounterWindow: 0,
      };
    }
    return {
      kind: "hit",
      knockback: counterActive ? weapon.counterKnockback : weapon.thrustKnockback,
      attackerStun: 0,
      defenderCounterWindow: 0,
    };
  }

  // Slice
  if (!defender.guard.active) {
    return {
      kind: "hit",
      knockback: counterActive ? weapon.counterKnockback : weapon.sliceKnockback,
      attackerStun: 0,
      defenderCounterWindow: 0,
    };
  }

  // Angle-only guard model: guard pose blocks based on perpendicularity to the
  // incoming slice, regardless of where on the body the slice was aimed.
  // Inclusive tolerance — exactly `guardAngleTolerance` away from perpendicular
  // still counts as a block (avoids feeling unfairly tight at the edge).
  const guardDir = sub(defender.guard.tip, defender.guard.grip);
  const angle = acuteAngleBetween(event.direction, guardDir);
  const isPerpendicular =
    Math.PI / 2 - angle <= weapon.guardAngleTolerance;

  if (isPerpendicular) {
    return {
      kind: "block",
      knockback: 0,
      attackerStun: weapon.stunMs,
      defenderCounterWindow: weapon.stunMs,
    };
  }

  return {
    kind: "pierce",
    knockback: counterActive ? weapon.counterKnockback : weapon.sliceKnockback,
    attackerStun: 0,
    defenderCounterWindow: 0,
  };
}

function rejected(): Outcome {
  return { kind: "rejected", knockback: 0, attackerStun: 0, defenderCounterWindow: 0 };
}

/**
 * Fold an Outcome into the two fighter states. Returns new immutable state
 * objects — original references are untouched. `defenderFacing` is +1 or -1,
 * the direction the defender gets pushed on their local x axis (away from
 * the attacker).
 */
export function applyOutcome(
  attacker: FighterState,
  defender: FighterState,
  outcome: Outcome,
  defenderFacing: number,
  now: number,
  weapon: WeaponStats,
): { attacker: FighterState; defender: FighterState } {
  let nextAttacker = attacker;
  let nextDefender = defender;

  if (outcome.kind !== "rejected") {
    // The duel loop's `commitPending` already set a cooldown anchored to
    // input time. Use Math.max so direct callers (tests, no-pending paths)
    // still get a cooldown, but resolved-pending paths keep the input-anchored
    // cooldown set earlier — preventing the cooldown from extending past
    // input + attackCooldownMs.
    nextAttacker = {
      ...nextAttacker,
      attackCooldownUntil: Math.max(
        nextAttacker.attackCooldownUntil,
        now + weapon.attackCooldownMs,
      ),
    };
    if (outcome.kind === "hit" || outcome.kind === "pierce") {
      // Successful landing consumes the counter window — one bonus per stun.
      nextAttacker = { ...nextAttacker, counterUntil: 0 };
    }
  }

  if (outcome.attackerStun > 0) {
    nextAttacker = {
      ...nextAttacker,
      stunUntil: now + outcome.attackerStun,
    };
  }

  if (outcome.defenderCounterWindow > 0) {
    nextDefender = {
      ...nextDefender,
      counterUntil: now + outcome.defenderCounterWindow,
    };
  }

  if (outcome.knockback > 0) {
    // Push-along: defender takes the full impulse, attacker drifts forward at
    // `attackerFollowFraction` of it in the same direction. Net effect — both
    // fighters move toward the defender's edge of the platform, but the
    // distance between them grows only by `(1 - frac)` of the impulse so the
    // duel doesn't immediately spread out into nothingness.
    nextDefender = {
      ...nextDefender,
      velX: nextDefender.velX + defenderFacing * outcome.knockback,
    };
    nextAttacker = {
      ...nextAttacker,
      velX:
        nextAttacker.velX +
        defenderFacing * outcome.knockback * weapon.attackerFollowFraction,
    };
  }

  // Trade immunity: whoever LANDED the hit (the attacker on hit/pierce) gets
  // a brief grace where they cannot be hit back. This is what voids
  // simultaneous retaliations between the two fighters. The defender's stun
  // is also cleared — taking a hit immediately frees you from the lock so
  // counters function as the canonical "release" for a successful read.
  if (outcome.kind === "hit" || outcome.kind === "pierce") {
    nextAttacker = {
      ...nextAttacker,
      tradeImmuneUntil: now + weapon.tradeImmuneMs,
    };
    nextDefender = {
      ...nextDefender,
      stunUntil: 0,
    };
  }

  return { attacker: nextAttacker, defender: nextDefender };
}

/**
 * Step a fighter's 1D physics. `friction` is exponential decay rate per second
 * (≈2 → knockback halves every 350ms). The duel loop is responsible for fall
 * detection (|posX| > arenaRadius).
 */
export function tickFighter(
  state: FighterState,
  dtSeconds: number,
  friction: number,
): FighterState {
  return {
    ...state,
    posX: state.posX + state.velX * dtSeconds,
    velX: state.velX * Math.exp(-friction * dtSeconds),
  };
}

/** Convenience predicate for input layer / HUD. */
export function isStunned(state: FighterState, now: number): boolean {
  return now < state.stunUntil;
}

/** Convenience predicate for input layer / HUD. */
export function isOnCooldown(state: FighterState, now: number): boolean {
  return now < state.attackCooldownUntil;
}

/** Convenience predicate for HUD telegraphing the counter window. */
export function isInCounterWindow(state: FighterState, now: number): boolean {
  return now < state.counterUntil;
}
