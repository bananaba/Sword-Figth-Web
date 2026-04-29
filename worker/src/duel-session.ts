import {
  BASIC_SWORD,
  applyOutcome,
  resolveAttack,
  type AttackEvent,
  type BodyHitbox,
  type FighterState,
  type GuardSnapshot,
  type Outcome,
  type Vec2,
} from "@vibejam/shared";
import { parseMatchmakePlayer, type MatchmakePlayer } from "./protocol.js";

export type DuelSide = "player" | "opponent";

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

export class DuelRoomSession {
  private readonly sockets: AttachedSocket[] = [];
  private readonly fighters: Record<DuelSide, FighterState> = {
    player: freshFighter(),
    opponent: freshFighter(),
  };

  constructor(private readonly roomId: string) {}

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

  private handleAttack(socket: RoomSocket, message: AttackMessage): void {
    const attackerSide = this.sideForSocket(socket);
    if (!attackerSide) {
      send(socket, { t: "error", error: "hello_required" });
      return;
    }
    const defenderSide = otherSide(attackerSide);
    const attacker = this.fighters[attackerSide];
    const defender = this.fighters[defenderSide];
    const outcome = resolveAttack(
      attacker,
      defender,
      DEFAULT_BODY,
      message.event,
      BASIC_SWORD,
      message.now,
    );
    const next = applyOutcome(
      attacker,
      defender,
      outcome,
      attackerSide === "player" ? 1 : -1,
      message.now,
      BASIC_SWORD,
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

  private broadcastImpact(attackerSide: DuelSide, at: number, outcome: Outcome): void {
    this.broadcast({
      t: "impact",
      attackerSide,
      at,
      outcome,
    });
  }

  private sideForSocket(socket: RoomSocket): DuelSide | null {
    return this.sockets.find((entry) => entry.socket === socket)?.player?.side ?? null;
  }
}

type ClientMessage = HelloMessage | GuardMessage | AttackMessage;

interface HelloMessage {
  t: "hello";
  player: MatchmakePlayer;
}

interface GuardMessage {
  t: "guard";
  guard: GuardSnapshot;
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

function freshFighter(): FighterState {
  return {
    posX: 0,
    velX: 0,
    attackCooldownUntil: 0,
    stunUntil: 0,
    counterUntil: 0,
    tradeImmuneUntil: 0,
    guard: {
      active: false,
      grip: { x: 0, y: 1.15 },
      tip: { x: 0, y: 1.15 },
    },
  };
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
    const player = parseMatchmakePlayer(candidate);
    return player ? { t: "hello", player } : null;
  }
  if (candidate.t === "guard") {
    const guard = parseGuard(candidate);
    return guard ? { t: "guard", guard } : null;
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
