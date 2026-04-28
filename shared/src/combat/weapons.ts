import type { WeaponStats } from "./types.js";

/**
 * Default-balance sword. Numbers are tuned for a 2D blade plane sized roughly
 * 4×4 units with the body hitbox spanning ~1×1.7. Push-along knockback
 * (`attackerFollowFraction`) keeps fighters engaged so the duel lasts longer;
 * knockback magnitudes are correspondingly lower than a "vacuum" model.
 *
 * Future weapons will swap one or more of these knobs:
 *   - "rapier"  : sliceKnockback ↓, thrustKnockback ↑↑, attackCooldownMs ↓
 *   - "bastion" : guardAngleTolerance ↑, bladeLength ↑ (longer guard segment)
 *   - "katana"  : counterKnockback ↑↑, stunMs ↑
 *
 * Keep additions strictly through `WeaponStats` — the resolver should never
 * need a switch on weapon identity.
 */
export const BASIC_SWORD: WeaponStats = {
  sliceKnockback: 3.0,
  thrustKnockback: 5.0,
  counterKnockback: 7.0,
  attackCooldownMs: 600,
  guardAngleTolerance: (30 * Math.PI) / 180,
  thrustReach: 1.4,
  thrustChargeMs: 280,
  stunMs: 800,
  counterWindowMs: 600,
  bladeLength: 1.2,
  minSliceReach: 0.35,
  attackerFollowFraction: 0.5,
  motionImmunityVelocityThreshold: 1.0,
  tradeImmuneMs: 250,
  windUpMs: 280,
  swingDurationMs: 120,
};
