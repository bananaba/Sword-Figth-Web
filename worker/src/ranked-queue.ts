import { json } from "./http.js";
import {
  parseMatchmakePlayer,
  type MatchmakePlayer,
  type MatchmakeResponse,
} from "./protocol.js";

const MATCH_RANGE = 200;
const WAITING_KEY = "waiting";
const MATCHED_KEY = "matched";

interface QueueStorageLike {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
}

interface QueueStateLike {
  storage?: QueueStorageLike;
}

interface PendingMatch {
  roomId: string;
  players: [MatchmakePlayer, MatchmakePlayer];
}

export class RankedQueue {
  private waiting: MatchmakePlayer[] = [];
  /**
   * Match results stashed by playerId for the *other* side to pick up on
   * their next /matchmake poll. Without this, only the player whose request
   * created the match learns the roomId — the partner stays in queue forever.
   */
  private pendingMatches: Map<string, PendingMatch> = new Map();
  private loaded: boolean;

  constructor(
    private readonly state: QueueStateLike,
    private readonly env: unknown,
  ) {
    void this.env;
    // No storage binding (test environment, or the DO class isn't listed in
    // `new_sqlite_classes`) → in-memory only, no persistence.
    this.loaded = !this.state?.storage;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, { status: 405 });
    }

    const player = parseMatchmakePlayer(await readJson(request));
    if (!player) {
      return json({ error: "invalid_matchmake_request" }, { status: 400 });
    }

    await this.ensureLoaded();

    // 1) Pickup any match created for us by the partner's earlier request.
    const pending = this.pendingMatches.get(player.playerId);
    if (pending) {
      this.pendingMatches.delete(player.playerId);
      await this.persist();
      const response: MatchmakeResponse = {
        status: "matched",
        roomId: pending.roomId,
        players: pending.players,
      };
      return json(response);
    }

    // 2) Same playerId polling again (queue side keeps polling every 2s while
    // waiting) — update the existing entry in place so we don't double-queue,
    // get matched against ourselves, or move the player to the back.
    const existingIndex = this.waiting.findIndex((w) => w.playerId === player.playerId);
    if (existingIndex >= 0) {
      this.waiting[existingIndex] = player;
    }

    const matchIndex = this.waiting.findIndex(
      (waitingPlayer) =>
        waitingPlayer.playerId !== player.playerId &&
        Math.abs(waitingPlayer.rating - player.rating) <= MATCH_RANGE,
    );

    if (matchIndex >= 0) {
      const opponent = this.waiting.splice(matchIndex, 1)[0];
      if (!opponent) {
        return json({ error: "queue_corrupt" }, { status: 500 });
      }
      // Also drop ourselves from waiting if we were in it (re-poll case).
      const myWaitingIdx = this.waiting.findIndex(
        (w) => w.playerId === player.playerId,
      );
      if (myWaitingIdx >= 0) this.waiting.splice(myWaitingIdx, 1);

      const roomId = roomIdFor(opponent.playerId, player.playerId, Date.now());
      const players: [MatchmakePlayer, MatchmakePlayer] = [opponent, player];

      // Stash for the opponent's next poll — they were waiting and got matched
      // by us, but their last response was "queued". Without this they'd never
      // learn the roomId.
      this.pendingMatches.set(opponent.playerId, { roomId, players });
      await this.persist();

      const response: MatchmakeResponse = {
        status: "matched",
        roomId,
        players,
      };
      return json(response);
    }

    if (existingIndex < 0) {
      this.waiting.push(player);
    }
    await this.persist();
    const response: MatchmakeResponse = {
      status: "queued",
      playerId: player.playerId,
      rating: player.rating,
      queueSize: this.waiting.length,
    };
    return json(response);
  }

  /**
   * Lazy-load waiting list on the first request after a DO cold start.
   * Cloudflare evicts idle DOs after ~15 min of no requests; without
   * persistence, an in-flight queued player would silently disappear from
   * everyone else's view.
   */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const storage = this.state?.storage;
    if (!storage) {
      this.loaded = true;
      return;
    }
    const stored = await storage.get<MatchmakePlayer[]>(WAITING_KEY);
    if (Array.isArray(stored)) {
      this.waiting = stored;
    }
    const pendingStored = await storage.get<[string, PendingMatch][]>(
      MATCHED_KEY,
    );
    if (Array.isArray(pendingStored)) {
      this.pendingMatches = new Map(pendingStored);
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const storage = this.state?.storage;
    if (!storage) return;
    await storage.put(WAITING_KEY, this.waiting);
    await storage.put(MATCHED_KEY, Array.from(this.pendingMatches.entries()));
  }
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * Build a unique-per-match roomId. Including a base36 timestamp prevents
 * the same two players from re-entering a stale `DurableObjectNamespace
 * .idFromName(...)` instance after a previous match: that DO retains its
 * in-memory session (fighters, match state, ready set) since it's pinned
 * by name, so a deterministic name like "ranked-A-B" would let a second
 * match see leftover `ready`/`fighters` state from the first.
 */
function roomIdFor(firstPlayerId: string, secondPlayerId: string, at: number): string {
  return `ranked-${firstPlayerId}-${secondPlayerId}-${at.toString(36)}-${crypto.randomUUID()}`;
}
