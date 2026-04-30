import {
  applyOutcome,
  resolveAttack,
  tickFighter,
  type AttackEvent,
  type BodyHitbox,
  type FighterState,
  type GuardSnapshot,
  type Outcome,
  type Vec2,
  type WeaponStats,
} from "@vibejam/shared";
import * as Combat from "@vibejam/shared";
import { parseMatchmakePlayer, type MatchmakePlayer } from "./protocol.js";
import { applyEloResult } from "./rating.js";

export type DuelSide = "player" | "opponent";
type MatchPhase = "waiting" | "countdown" | "fighting" | "roundOver" | "matchOver";

export interface RoomSocket {
  send(message: string): void;
  close(code?: number, reason?: string): void;
}

interface RoomPlayer extends MatchmakePlayer {
  side: DuelSide;
}

interface AttachedSocket {
  socket: RoomSocket;
  player: RoomPlayer | null;
}

export interface MatchOverEvent {
  /** Server-frame slot called "player" (NOT "winner") — first-joiner. */
  player: {
    playerId: string;
    name: string;
    rating: number;
    outcome: "win" | "loss" | "draw";
  };
  opponent: {
    playerId: string;
    name: string;
    rating: number;
    outcome: "win" | "loss" | "draw";
  };
  at: number;
}

export interface DuelRoomSessionOptions {
  /** Fired after match_over broadcast. Used by DO to write Leaderboard. */
  onMatchOver?: (event: MatchOverEvent) => void;
}

export class DuelRoomSession {
  private readonly sockets: AttachedSocket[] = [];
  private readonly ready = new Set<DuelSide>();
  private readonly fighters: Record<DuelSide, FighterState> = {
    player: freshFighter(INITIAL_PLAYER_POS),
    opponent: freshFighter(INITIAL_OPPONENT_POS),
  };
  /**
   * Latest blade-tip cursor reported by each side. Memory-only; the resolver
   * doesn't read it (hit detection still uses the attack segment from the
   * `attack` message). Broadcast inside `state` so the *opponent* can render
   * the player's live cursor without us needing per-frame predictions.
   */
  private readonly bladeTips: Partial<Record<DuelSide, { x: number; y: number }>> = {};
  private match = initialMatch();

  constructor(
    private roomId: string,
    private readonly options: DuelRoomSessionOptions = {},
  ) {}

  setRoomId(roomId: string): void {
    if (this.sockets.some((entry) => entry.player)) return;
    this.roomId = roomId;
  }

  attach(socket: RoomSocket): void {
    this.sockets.push({ socket, player: null });
  }

  detach(socket: RoomSocket): void {
    const index = this.sockets.findIndex((entry) => entry.socket === socket);
    if (index >= 0) {
      this.sockets.splice(index, 1);
      this.broadcastRoomState();
    }
  }

  hasConnections(): boolean {
    return this.sockets.length > 0;
  }

  handleMessage(socket: RoomSocket, rawMessage: string): void {
    const message = parseClientMessage(rawMessage);
    if (!message) {
      send(socket, { t: "error", error: "invalid_message" });
      return;
    }

    if (message.t === "hello") {
      this.handleHello(socket, message);
      return;
    }
    if (message.t === "guard") {
      this.handleGuard(socket, message);
      return;
    }
    if (message.t === "tip") {
      this.handleTip(socket, message);
      return;
    }
    if (message.t === "ready") {
      this.handleReady(socket, message);
      return;
    }
    if (message.t === "attack") {
      this.handleAttack(socket, message);
      return;
    }

    send(socket, { t: "error", error: "unsupported_message" });
  }

  private handleHello(socket: RoomSocket, message: HelloMessage): void {
    const entry = this.sockets.find((candidate) => candidate.socket === socket);
    if (!entry) return;

    if (entry.player) {
      send(socket, { t: "error", error: "already_joined" });
      return;
    }

    const side = this.nextSide();
    if (!side) {
      socket.close(1008, "room_full");
      return;
    }

    const player: RoomPlayer = { ...message.player, side };
    entry.player = player;
    send(socket, { t: "hello", side, rating: player.rating });
    this.broadcastRoomState();
  }

  private handleGuard(socket: RoomSocket, message: GuardMessage): void {
    const side = this.sideForSocket(socket);
    if (!side) {
      send(socket, { t: "error", error: "hello_required" });
      return;
    }

    this.fighters[side] = {
      ...this.fighters[side],
      guard: message.guard,
    };
  }

  private handleTip(socket: RoomSocket, message: TipMessage): void {
    const side = this.sideForSocket(socket);
    if (!side) return;
    this.bladeTips[side] = message.tip;
  }

  private handleReady(socket: RoomSocket, message: ReadyMessage): void {
    const side = this.sideForSocket(socket);
    if (!side) {
      send(socket, { t: "error", error: "hello_required" });
      return;
    }
    this.ready.add(side);
    if (this.match.phase === "waiting" && this.ready.has("player") && this.ready.has("opponent")) {
      this.match = {
        ...this.match,
        phase: "countdown",
        phaseEndsAt: message.now + COUNTDOWN_MS,
      };
      this.broadcastMatchState();
    }
  }

  private handleAttack(socket: RoomSocket, message: AttackMessage): void {
    const attackerSide = this.sideForSocket(socket);
    if (!attackerSide) {
      send(socket, { t: "error", error: "hello_required" });
      return;
    }
    if (this.match.phase !== "fighting") {
      send(socket, { t: "error", error: "not_fighting" });
      return;
    }
    const defenderSide = otherSide(attackerSide);
    const attacker = this.fighters[attackerSide];
    const defender = this.fighters[defenderSide];

    // Telegraph the swing to BOTH sides immediately so the opponent sees a
    // wind-up + arc (otherwise they'd only ever see the impact ring). Phase
    // boundaries match the client's local-attack visual lifecycle.
    const isSlice = message.event.kind === "slice";
    const windUpMs = isSlice
      ? DEFAULT_WEAPON.windUpMs
      : DEFAULT_WEAPON.thrustChargeMs;
    const inputAt = message.now;
    const impactAt = inputAt + windUpMs;
    const swingEndAt = impactAt + DEFAULT_WEAPON.swingDurationMs;
    const cooldownEndAt = Math.max(
      inputAt + DEFAULT_WEAPON.attackCooldownMs,
      swingEndAt + 80,
    );
    this.broadcast({
      t: "attack_telegraph",
      side: attackerSide,
      kind: message.event.kind,
      origin: message.event.origin,
      direction: message.event.direction,
      reach: message.event.reach,
      inputAt,
      impactAt,
      swingEndAt,
      cooldownEndAt,
    });

    const outcome = resolveAttack(
      attacker,
      defender,
      DEFAULT_BODY,
      message.event,
      DEFAULT_WEAPON,
      message.now,
    );
    const next = applyOutcome(
      attacker,
      defender,
      outcome,
      attackerSide === "player" ? 1 : -1,
      message.now,
      DEFAULT_WEAPON,
    );
    this.fighters[attackerSide] = next.attacker;
    this.fighters[defenderSide] = next.defender;

    this.broadcastImpact(attackerSide, message.now, outcome);
  }

  private nextSide(): DuelSide | null {
    const occupied = new Set(
      this.sockets
        .map((entry) => entry.player?.side)
        .filter((side): side is DuelSide => side === "player" || side === "opponent"),
    );
    if (!occupied.has("player")) return "player";
    if (!occupied.has("opponent")) return "opponent";
    return null;
  }

  private broadcastRoomState(): void {
    const players = this.sockets
      .map((entry) => entry.player)
      .filter((player): player is RoomPlayer => player !== null)
      .map((player) => ({
        side: player.side,
        playerId: player.playerId,
        name: player.name,
        rating: player.rating,
        saberColor: player.saberColor,
      }));

    this.broadcast({
      t: "room_state",
      roomId: this.roomId,
      phase: "waiting",
      players,
    });
  }

  private broadcast(message: unknown): void {
    for (const entry of this.sockets) {
      if (entry.player) {
        send(entry.socket, message);
      }
    }
  }

  tick(now: number, dtSeconds = 0): void {
    if (this.match.phase === "roundOver" && now >= this.match.phaseEndsAt) {
      if (this.match.playerWins >= WINS_TO_TAKE_MATCH || this.match.opponentWins >= WINS_TO_TAKE_MATCH) {
        this.endMatch(now);
        return;
      }
      this.resetRoundFighters();
      this.match = {
        ...this.match,
        phase: "countdown",
        roundNumber: this.match.roundNumber + 1,
        phaseEndsAt: now + COUNTDOWN_MS,
      };
      this.broadcastMatchState();
      return;
    }

    if (this.match.phase === "countdown" && now >= this.match.phaseEndsAt) {
      this.resetRoundFighters();
      this.match = {
        ...this.match,
        phase: "fighting",
        phaseEndsAt: now + ROUND_DURATION_MS,
      };
      this.broadcastMatchState();
      return;
    }

    if (this.match.phase === "fighting") {
      if (dtSeconds > 0) {
        this.fighters.player = tickFighter(this.fighters.player, dtSeconds, FRICTION);
        this.fighters.opponent = tickFighter(this.fighters.opponent, dtSeconds, FRICTION);
      }

      this.broadcastState(now);

      const ringoutWinner = this.ringoutWinner();
      if (ringoutWinner) {
        this.endRound(ringoutWinner, "ringout", now);
        return;
      }

      if (now >= this.match.phaseEndsAt) {
        this.endRound("draw", "timeout", now);
      }
    }
  }

  private broadcastState(serverNow: number): void {
    this.broadcast({
      t: "state",
      serverNow,
      player: snapshotFighter(this.fighters.player, this.bladeTips.player),
      opponent: snapshotFighter(this.fighters.opponent, this.bladeTips.opponent),
    });
  }

  private broadcastImpact(attackerSide: DuelSide, at: number, outcome: Outcome): void {
    this.broadcast({
      t: "impact",
      attackerSide,
      at,
      outcome,
    });
  }

  private broadcastMatchState(): void {
    this.broadcast({
      t: "match_state",
      phase: this.match.phase,
      roundNumber: this.match.roundNumber,
      playerWins: this.match.playerWins,
      opponentWins: this.match.opponentWins,
      phaseEndsAt: this.match.phaseEndsAt,
    });
  }

  private resetRoundFighters(): void {
    this.fighters.player = freshFighter(INITIAL_PLAYER_POS);
    this.fighters.opponent = freshFighter(INITIAL_OPPONENT_POS);
  }

  private ringoutWinner(): RoundWinner | null {
    const playerOut = this.fighters.player.posX < -ARENA_RADIUS;
    const opponentOut = this.fighters.opponent.posX > ARENA_RADIUS;
    if (playerOut && opponentOut) return "draw";
    if (playerOut) return "opponent";
    if (opponentOut) return "player";
    return null;
  }

  private endRound(winner: RoundWinner, reason: RoundReason, now: number): void {
    const playerWins = this.match.playerWins + (winner === "player" ? 1 : 0);
    const opponentWins = this.match.opponentWins + (winner === "opponent" ? 1 : 0);
    this.match = {
      ...this.match,
      phase: "roundOver",
      playerWins,
      opponentWins,
      phaseEndsAt: now + ROUND_OVER_MS,
    };
    this.broadcast({
      t: "round_over",
      winner,
      reason,
      roundNumber: this.match.roundNumber,
      playerWins,
      opponentWins,
      phaseEndsAt: this.match.phaseEndsAt,
    });
  }

  private endMatch(now: number = Date.now()): void {
    const winner = this.match.playerWins > this.match.opponentWins ? "player" : "opponent";
    const ratings = this.matchRatingResult(winner);
    this.match = {
      ...this.match,
      phase: "matchOver",
    };
    this.broadcast({
      t: "match_over",
      winner,
      playerWins: this.match.playerWins,
      opponentWins: this.match.opponentWins,
      ratings,
    });
    // Persistence hook — fed to Leaderboard DO via DuelRoom. Skipped if
    // either side never finished `hello` (rare; would mean a DO crash
    // mid-match) since we have no rating to record.
    const playerInfo = this.playerForSide("player");
    const opponentInfo = this.playerForSide("opponent");
    if (this.options.onMatchOver && playerInfo && opponentInfo && ratings) {
      const playerOutcome: "win" | "loss" =
        winner === "player" ? "win" : "loss";
      const opponentOutcome: "win" | "loss" =
        winner === "opponent" ? "win" : "loss";
      this.options.onMatchOver({
        player: {
          playerId: playerInfo.playerId,
          name: playerInfo.name,
          rating: ratings.player.after,
          outcome: playerOutcome,
        },
        opponent: {
          playerId: opponentInfo.playerId,
          name: opponentInfo.name,
          rating: ratings.opponent.after,
          outcome: opponentOutcome,
        },
        at: now,
      });
    }
  }

  private matchRatingResult(winner: Exclude<RoundWinner, "draw">): MatchRatings | null {
    const player = this.playerForSide("player");
    const opponent = this.playerForSide("opponent");
    if (!player || !opponent) return null;

    const result = applyEloResult({
      playerRating: player.rating,
      opponentRating: opponent.rating,
      score: winner === "player" ? 1 : 0,
    });

    return {
      player: {
        before: player.rating,
        after: result.nextPlayerRating,
        delta: result.playerDelta,
      },
      opponent: {
        before: opponent.rating,
        after: result.nextOpponentRating,
        delta: result.opponentDelta,
      },
    };
  }

  private sideForSocket(socket: RoomSocket): DuelSide | null {
    return this.sockets.find((entry) => entry.socket === socket)?.player?.side ?? null;
  }

  private playerForSide(side: DuelSide): RoomPlayer | null {
    return this.sockets.find((entry) => entry.player?.side === side)?.player ?? null;
  }
}

type ClientMessage =
  | HelloMessage
  | GuardMessage
  | TipMessage
  | ReadyMessage
  | AttackMessage;

interface HelloMessage {
  t: "hello";
  player: MatchmakePlayer;
}

interface GuardMessage {
  t: "guard";
  guard: GuardSnapshot;
}

interface TipMessage {
  t: "tip";
  tip: { x: number; y: number };
}

interface ReadyMessage {
  t: "ready";
  now: number;
}

interface AttackMessage {
  t: "attack";
  event: AttackEvent;
  now: number;
}

const DEFAULT_BODY: BodyHitbox = {
  minX: -0.32,
  maxX: 0.32,
  minY: 0,
  maxY: 1.7,
};

const DEFAULT_WEAPON = resolveDefaultWeapon();

const COUNTDOWN_MS = 3000;
const ROUND_DURATION_MS = 45_000;
const ROUND_OVER_MS = 2200;
const WINS_TO_TAKE_MATCH = 2;
const INITIAL_PLAYER_POS = -1.6;
const INITIAL_OPPONENT_POS = 1.6;
const ARENA_RADIUS = 4.2;
const FRICTION = 5.0;

type RoundWinner = "player" | "opponent" | "draw";
type RoundReason = "ringout" | "timeout";

interface RatingChange {
  before: number;
  after: number;
  delta: number;
}

interface MatchRatings {
  player: RatingChange;
  opponent: RatingChange;
}

interface ServerMatchState {
  phase: MatchPhase;
  roundNumber: number;
  playerWins: number;
  opponentWins: number;
  phaseEndsAt: number;
}

interface FighterNetState {
  posX: number;
  velX: number;
  guard: GuardSnapshot;
  stunUntil: number;
  attackCooldownUntil: number;
  counterUntil: number;
  bladeTip?: { x: number; y: number };
}

function snapshotFighter(
  fighter: FighterState,
  bladeTip?: { x: number; y: number },
): FighterNetState {
  return {
    posX: fighter.posX,
    velX: fighter.velX,
    guard: fighter.guard,
    stunUntil: fighter.stunUntil,
    attackCooldownUntil: fighter.attackCooldownUntil,
    counterUntil: fighter.counterUntil,
    bladeTip,
  };
}

function initialMatch(): ServerMatchState {
  return {
    phase: "waiting",
    roundNumber: 1,
    playerWins: 0,
    opponentWins: 0,
    phaseEndsAt: 0,
  };
}

function freshFighter(posX: number): FighterState {
  return {
    posX,
    velX: 0,
    attackCooldownUntil: 0,
    stunUntil: 0,
    counterUntil: 0,
    guard: {
      active: false,
      grip: { x: 0, y: 1.15 },
      tip: { x: 0, y: 1.15 },
    },
  };
}

function resolveDefaultWeapon(): WeaponStats {
  const combat = Combat as unknown as { PLASMA_BLADE?: WeaponStats; BASIC_SWORD?: WeaponStats };
  const weapon = combat.PLASMA_BLADE ?? combat.BASIC_SWORD;
  if (!weapon) {
    throw new Error("No default weapon exported from @vibejam/shared");
  }
  return weapon;
}

function parseClientMessage(rawMessage: string): ClientMessage | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawMessage);
  } catch {
    return null;
  }
  if (!decoded || typeof decoded !== "object") return null;

  const candidate = decoded as Record<string, unknown>;
  if (candidate.t === "hello") {
    const playerPayload =
      candidate.player && typeof candidate.player === "object"
        ? candidate.player
        : candidate;
    const player = parseMatchmakePlayer(playerPayload);
    return player ? { t: "hello", player } : null;
  }
  if (candidate.t === "guard") {
    const guard = parseGuard(candidate);
    return guard ? { t: "guard", guard } : null;
  }
  if (candidate.t === "tip") {
    const tip = parseVec2(candidate.tip);
    return tip ? { t: "tip", tip } : null;
  }
  if (candidate.t === "ready") {
    const now = parseNumber(candidate.now);
    return now !== null ? { t: "ready", now } : null;
  }
  if (candidate.t === "attack") {
    const event = parseAttack(candidate);
    const now = parseNumber(candidate.now);
    return event && now !== null ? { t: "attack", event, now } : null;
  }
  return null;
}

function send(socket: RoomSocket, message: unknown): void {
  socket.send(JSON.stringify(message));
}

function parseGuard(candidate: Record<string, unknown>): GuardSnapshot | null {
  const active = candidate.active;
  const grip = parseVec2(candidate.grip);
  const tip = parseVec2(candidate.tip);
  if (typeof active !== "boolean" || !grip || !tip) return null;
  return { active, grip, tip };
}

function parseAttack(candidate: Record<string, unknown>): AttackEvent | null {
  const kind = candidate.kind;
  const origin = parseVec2(candidate.origin);
  const direction = parseVec2(candidate.direction);
  const reach = parseNumber(candidate.reach);
  const now = parseNumber(candidate.now);
  if ((kind !== "slice" && kind !== "thrust") || !origin || !direction || reach === null || now === null) {
    return null;
  }
  return {
    kind,
    origin,
    direction,
    reach,
    timestamp: now,
  };
}

function parseVec2(value: unknown): Vec2 | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const x = parseNumber(candidate.x);
  const y = parseNumber(candidate.y);
  return x === null || y === null ? null : { x, y };
}

function parseNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function otherSide(side: DuelSide): DuelSide {
  return side === "player" ? "opponent" : "player";
}
