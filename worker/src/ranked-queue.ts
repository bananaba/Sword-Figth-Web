import { json } from "./http.js";
import {
  parseMatchmakePlayer,
  type MatchmakePlayer,
  type MatchmakeResponse,
} from "./protocol.js";

const MATCH_RANGE = 200;
const WAITING_KEY = "waiting";

interface QueueStorageLike {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
}

interface QueueStateLike {
  storage?: QueueStorageLike;
}

export class RankedQueue {
  private waiting: MatchmakePlayer[] = [];
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

    // Same playerId polling again (queue side keeps polling every 2s while
    // waiting) — drop the prior entry so we don't double-queue or get matched
    // against ourselves.
    this.waiting = this.waiting.filter((w) => w.playerId !== player.playerId);

    const matchIndex = this.waiting.findIndex(
      (waitingPlayer) => Math.abs(waitingPlayer.rating - player.rating) <= MATCH_RANGE,
    );

    if (matchIndex >= 0) {
      const opponent = this.waiting.splice(matchIndex, 1)[0];
      if (!opponent) {
        return json({ error: "queue_corrupt" }, { status: 500 });
      }
      await this.persist();
      const response: MatchmakeResponse = {
        status: "matched",
        roomId: roomIdFor(opponent.playerId, player.playerId, Date.now()),
        players: [opponent, player],
      };
      return json(response);
    }

    this.waiting.push(player);
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
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const storage = this.state?.storage;
    if (!storage) return;
    await storage.put(WAITING_KEY, this.waiting);
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
  return `ranked-${firstPlayerId}-${secondPlayerId}-${at.toString(36)}`;
}
