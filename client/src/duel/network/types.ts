import type {
  AttackKind,
  GuardSnapshot,
  Outcome,
  Vec2,
  WeaponId,
} from "@vibejam/shared";

/**
 * Wire protocol shared with `worker/src/duel-session.ts`. Authoritative
 * server: ratings, fighter physics, outcome resolution all happen there.
 * Client only sends inputs (`hello`, `ready`, `guard`, `attack`) and renders
 * what the server broadcasts.
 *
 * Match phases mirror `useDuelLoop.MatchPhase` plus the `waiting` lobby
 * phase that exists only while the room is filling.
 */

export type DuelSide = "player" | "opponent";
export type ServerMatchPhase =
  | "waiting"
  | "countdown"
  | "fighting"
  | "roundOver"
  | "matchOver";

export interface RankedPlayerInfo {
  side: DuelSide;
  playerId: string;
  name: string;
  rating: number;
  saberColor: string;
  /** Optional for backward-compat with worker builds older than 2026-04-30. */
  weaponId?: WeaponId;
}

export interface FighterNetState {
  posX: number;
  velX: number;
  guard: GuardSnapshot;
  stunUntil: number;
  attackCooldownUntil: number;
  counterUntil: number;
  /**
   * Live blade-tip position in blade-plane coords. Driven by the player's
   * cursor and broadcast at ~30 Hz alongside `state`. Optional because old
   * server builds may not include it; clients fall back to guard.tip.
   */
  bladeTip?: Vec2;
}

export interface RatingChange {
  before: number;
  after: number;
  delta: number;
}

export interface MatchRatings {
  player: RatingChange;
  opponent: RatingChange;
}

export type ServerMessage =
  | { t: "hello"; side: DuelSide; rating: number }
  | {
      t: "room_state";
      roomId: string;
      phase: "waiting";
      players: RankedPlayerInfo[];
    }
  | {
      t: "match_state";
      phase: ServerMatchPhase;
      roundNumber: number;
      playerWins: number;
      opponentWins: number;
      phaseEndsAt: number;
    }
  | {
      t: "round_over";
      winner: "player" | "opponent" | "draw";
      reason: "ringout" | "timeout";
      roundNumber: number;
      playerWins: number;
      opponentWins: number;
      phaseEndsAt: number;
    }
  | {
      t: "match_over";
      winner: "player" | "opponent";
      playerWins: number;
      opponentWins: number;
      ratings: MatchRatings | null;
    }
  | {
      t: "state";
      serverNow: number;
      player: FighterNetState;
      opponent: FighterNetState;
    }
  | {
      t: "impact";
      attackerSide: DuelSide;
      at: number;
      outcome: Outcome;
    }
  | {
      t: "attack_telegraph";
      side: DuelSide;
      kind: AttackKind;
      origin: Vec2;
      direction: Vec2;
      reach: number;
      inputAt: number;
      impactAt: number;
      swingEndAt: number;
      cooldownEndAt: number;
    }
  | { t: "error"; error: string };

export type ClientMessage =
  | {
      t: "hello";
      player: {
        playerId: string;
        name: string;
        rating: number;
        saberColor: string;
        weaponId?: WeaponId;
      };
    }
  | { t: "ready"; now: number }
  | { t: "guard"; active: boolean; grip: Vec2; tip: Vec2 }
  | { t: "tip"; tip: Vec2 }
  | {
      t: "attack";
      kind: AttackKind;
      origin: Vec2;
      direction: Vec2;
      reach: number;
      now: number;
    };
