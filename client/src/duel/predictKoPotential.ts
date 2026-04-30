import type { WeaponStats } from "@vibejam/shared";

/**
 * "Could this swing knock the defender off the edge?" Heuristic predictor
 * used to engage a pre-impact slow-mo buildup so the killing blow gets
 * cinematic time to breathe (vs. the post-hoc `slowmoKo` which only fires
 * after the fighter has already left the platform).
 *
 * Two predicates ORed together:
 *  1. **Near-edge** — defender is already inside `radius - NEAR_EDGE_MARGIN`,
 *     so even a graze + the existing knockback could push them off. This
 *     also catches the dramatic "saved at the edge" guard scenarios.
 *  2. **Worst-case knockback projection** — assume the swing lands as the
 *     biggest possible knockback (max of slice/thrust/counter), apply along
 *     attacker→defender direction with exponential-decay travel = `K /
 *     friction`. If projected `|posX| > radius`, this swing definitely has
 *     KO potential.
 *
 * Pure visual prediction — does NOT influence resolver/server outcome.
 * Friction matches `useDuelLoop.FRICTION` (see `client/src/duel/CLAUDE.md`).
 */
const FRICTION = 5.0;
const NEAR_EDGE_MARGIN = 1.0;

export function predictKoPotential(
  attackerPosX: number,
  defenderPosX: number,
  weapon: WeaponStats,
  arenaRadius: number,
): boolean {
  if (Math.abs(defenderPosX) > arenaRadius - NEAR_EDGE_MARGIN) return true;
  const dx = defenderPosX - attackerPosX;
  const facing = dx === 0 ? 1 : Math.sign(dx);
  const maxKnockback = Math.max(
    weapon.sliceKnockback,
    weapon.thrustKnockback,
    weapon.counterKnockback,
  );
  const maxTravel = maxKnockback / FRICTION;
  const projected = defenderPosX + facing * maxTravel;
  return Math.abs(projected) > arenaRadius;
}
