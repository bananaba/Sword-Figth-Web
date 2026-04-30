import type { WeaponId } from "@vibejam/shared";

export interface MatchmakePlayer {
  playerId: string;
  name: string;
  rating: number;
  saberColor: string;
  /** Optional for backward-compat with pre-multi-weapon clients (defaults to "basic"). */
  weaponId?: WeaponId;
}

export type MatchmakeResponse =
  | {
      status: "queued";
      playerId: string;
      rating: number;
      queueSize: number;
    }
  | {
      status: "matched";
      roomId: string;
      players: [MatchmakePlayer, MatchmakePlayer];
    };

const KNOWN_WEAPONS: ReadonlySet<WeaponId> = new Set(["basic", "charge", "rapier"]);

function parseWeaponId(value: unknown): WeaponId | undefined {
  if (typeof value !== "string") return undefined;
  return KNOWN_WEAPONS.has(value as WeaponId) ? (value as WeaponId) : undefined;
}

export function parseMatchmakePlayer(value: unknown): MatchmakePlayer | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const playerId = candidate.playerId;
  const name = candidate.name;
  const rating = candidate.rating;
  const saberColor = candidate.saberColor;

  if (typeof playerId !== "string" || playerId.trim().length === 0) return null;
  if (typeof name !== "string" || name.trim().length === 0) return null;
  if (typeof rating !== "number" || !Number.isFinite(rating)) return null;
  if (typeof saberColor !== "string" || saberColor.trim().length === 0) return null;

  return {
    playerId: playerId.slice(0, 64),
    name: name.slice(0, 24),
    rating: Math.round(rating),
    saberColor: saberColor.slice(0, 24),
    weaponId: parseWeaponId(candidate.weaponId),
  };
}
