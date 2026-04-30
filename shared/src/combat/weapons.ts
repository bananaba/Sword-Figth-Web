import type { WeaponStats } from "./types.js";

/**
 * Default-balance plasma blade. Numbers are tuned for a 2D blade plane sized
 * roughly 4×4 units with the body hitbox spanning ~1×1.7. Push-along knockback
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
export const PLASMA_BLADE: WeaponStats = {
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
  tradeImmuneMs: 250,
  windUpMs: 280,
  swingDurationMs: 120,
};
