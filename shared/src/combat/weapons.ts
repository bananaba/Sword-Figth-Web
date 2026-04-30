import type { WeaponId, WeaponStats } from "./types.js";

/**
 * Default-balance basic sword. Numbers are tuned for a 2D blade plane sized
 * roughly 4×4 units with the body hitbox spanning ~1×1.7. Push-along knockback
 * (`attackerFollowFraction`) keeps fighters engaged so the duel lasts longer;
 * knockback magnitudes are correspondingly lower than a "vacuum" model.
 *
 * Each preset trades off a strength against a weakness so the choice carries
 * meaning rather than being a flat upgrade. Knobs that move:
 *   - "charge" : sliceKnockback ↓, counterKnockback ↑↑ — punishes blocks hard
 *   - "rapier" : sliceKnockback ↓, thrustKnockback ↑↑, thrustReach/charge ↑/↓
 *
 * Add a new weapon strictly through `WeaponStats` — the resolver should never
 * need a switch on weapon identity.
 */
export const BASIC_SWORD: WeaponStats = {
  id: "basic",
  sliceKnockback: 4.5,
  thrustKnockback: 8.0,
  counterKnockback: 5.5,
  attackCooldownMs: 600,
  guardAngleTolerance: (45 * Math.PI) / 180,
  thrustReach: 1.4,
  thrustChargeMs: 280,
  stunMs: 1500,
  bladeLength: 1.2,
  minSliceReach: 0.35,
  attackerFollowFraction: 1.0,
  motionImmunityVelocityThreshold: 1.0,
  windUpMs: 280,
  swingDurationMs: 120,
};

/**
 * Charge sword — slice payoff is lower so successful counters become the
 * dominant scoring path. Counter knockback jumps from 5.5 → 9.5 (~73% boost),
 * meaning a parry-then-strike cycle now threatens a one-hit ringout from
 * mid-arena. Trade-off keeps the fighter engaged in baits/blocks rather than
 * spamming slices.
 */
export const CHARGE_SWORD: WeaponStats = {
  ...BASIC_SWORD,
  id: "charge",
  sliceKnockback: 3.0,
  counterKnockback: 9.5,
  // Slightly heavier swing — committed strikes feel weightier and the
  // longer cooldown discourages spam (you want each counter to count).
  attackCooldownMs: 680,
  windUpMs: 320,
};

/**
 * Rapier — long thin blade built around the thrust. Slice knockback is gutted
 * (3.0) so you can't poke-spam, but thrust gets +5 knockback, longer reach,
 * faster windup, and shorter cooldown — the rapier wins by stabbing from
 * outside the opponent's slice arc. Blade length increase widens the guard
 * segment too, a small defensive bonus that comes "for free" with the geometry.
 */
export const RAPIER: WeaponStats = {
  ...BASIC_SWORD,
  id: "rapier",
  sliceKnockback: 3.0,
  thrustKnockback: 13.0,
  thrustReach: 1.7,
  thrustChargeMs: 220,
  attackCooldownMs: 520,
  bladeLength: 1.4,
};

export const WEAPON_PRESETS: Record<WeaponId, WeaponStats> = {
  basic: BASIC_SWORD,
  charge: CHARGE_SWORD,
  rapier: RAPIER,
};

/** Resolve a weapon by id, falling back to BASIC_SWORD for unknown values. */
export function getWeaponPreset(id: WeaponId | string | null | undefined): WeaponStats {
  if (typeof id === "string" && id in WEAPON_PRESETS) {
    const preset = WEAPON_PRESETS[id as WeaponId];
    if (preset) return preset;
  }
  return BASIC_SWORD;
}

/**
 * Backwards-compat alias for the worker's `resolveDefaultWeapon` lookup that
 * checks both `PLASMA_BLADE` and `BASIC_SWORD`. Pre-multi-weapon builds shipped
 * the basic sword under the `PLASMA_BLADE` name.
 */
export const PLASMA_BLADE: WeaponStats = BASIC_SWORD;
