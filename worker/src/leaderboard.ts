import { json } from "./http.js";

/**
 * Persistent player ratings + W/L/D ledger. Single global Durable Object
 * instance keyed by name "global"; all matchOver events write here, and
 * the worker's `/leaderboard` and `/me` HTTP routes forward to this DO.
 *
 * Storage layout (DurableObjectStorage KV; SQLite-backed when the class is
 * listed in `new_sqlite_classes`):
 *
 *   key:   "p:" + playerId
 *   value: PlayerRow
 *
 * No raw SQL — `storage.list({prefix})` is enough for Top 20 leaderboard
 * and the row count stays small in jam scope. If we ever need server-side
 * sorted indexes we can move to `state.storage.sql.exec(...)`.
 */

export interface PlayerRow {
  playerId: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  updatedAt: number;
}

export type ResultOutcome = "win" | "loss" | "draw";

export interface ResultPlayer {
  playerId: string;
  name: string;
  rating: number;
  outcome: ResultOutcome;
}

export interface ResultRequest {
  player: ResultPlayer;
  opponent: ResultPlayer;
  at: number;
}

interface DurableObjectStorageLike {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  list<T = unknown>(options?: {
    prefix?: string;
    limit?: number;
    reverse?: boolean;
  }): Promise<Map<string, T>>;
}

interface DurableObjectStateLike {
  storage: DurableObjectStorageLike;
}

const PLAYER_KEY_PREFIX = "p:";
const TOP_LIMIT = 20;
const MAX_NAME_LEN = 24;
const MAX_PLAYER_ID_LEN = 64;

export class Leaderboard {
  constructor(
    private readonly state: DurableObjectStateLike,
    private readonly env: unknown,
  ) {
    void this.env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname.endsWith("/leaderboard")) {
      return json({ players: await this.top(TOP_LIMIT) });
    }

    if (request.method === "GET" && url.pathname.endsWith("/me")) {
      const playerId = url.searchParams.get("playerId");
      if (!playerId) {
        return json({ error: "missing_playerId" }, { status: 400 });
      }
      const row = await this.read(playerId);
      return json({ player: row ?? null });
    }

    if (request.method === "POST" && url.pathname.endsWith("/result")) {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, { status: 400 });
      }
      const parsed = parseResultRequest(body);
      if (!parsed) {
        return json({ error: "invalid_result" }, { status: 400 });
      }
      const updated = await this.applyResult(parsed);
      return json({ ok: true, players: updated });
    }

    return json({ error: "not_found" }, { status: 404 });
  }

  /**
   * Public for tests. Reads a single player row, normalising the value
   * shape so callers can rely on every field being present even if older
   * rows lack one (forwards-compat for future schema additions).
   */
  async read(playerId: string): Promise<PlayerRow | null> {
    const safe = sanitisePlayerId(playerId);
    if (!safe) return null;
    const row = await this.state.storage.get<PlayerRow>(`${PLAYER_KEY_PREFIX}${safe}`);
    return row ? normaliseRow(row) : null;
  }

  /**
   * Top N by rating descending. Tiebreak: `updatedAt` desc (most recent
   * first), then playerId for stability.
   */
  async top(limit: number): Promise<PlayerRow[]> {
    const map = await this.state.storage.list<PlayerRow>({
      prefix: PLAYER_KEY_PREFIX,
    });
    const rows = Array.from(map.values()).map(normaliseRow);
    rows.sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
      return a.playerId < b.playerId ? -1 : 1;
    });
    return rows.slice(0, limit);
  }

  /**
   * Upsert both players. Atomicity isn't strictly required (a draw leaves
   * both intact, a mid-write crash at most loses one of the two updates)
   * but we run them sequentially inside one DO request which serialises
   * naturally — no two updates to the same DO overlap.
   */
  async applyResult(req: ResultRequest): Promise<{
    player: PlayerRow;
    opponent: PlayerRow;
  }> {
    const player = await this.upsert(req.player, req.at);
    const opponent = await this.upsert(req.opponent, req.at);
    return { player, opponent };
  }

  private async upsert(p: ResultPlayer, at: number): Promise<PlayerRow> {
    const id = sanitisePlayerId(p.playerId);
    if (!id) throw new Error("invalid_playerId");
    const existing = (await this.state.storage.get<PlayerRow>(
      `${PLAYER_KEY_PREFIX}${id}`,
    )) ?? null;
    const wins = (existing?.wins ?? 0) + (p.outcome === "win" ? 1 : 0);
    const losses = (existing?.losses ?? 0) + (p.outcome === "loss" ? 1 : 0);
    const draws = (existing?.draws ?? 0) + (p.outcome === "draw" ? 1 : 0);
    const next: PlayerRow = {
      playerId: id,
      name: sanitiseName(p.name) || existing?.name || "Duelist",
      rating: Math.round(p.rating),
      wins,
      losses,
      draws,
      updatedAt: at,
    };
    await this.state.storage.put<PlayerRow>(`${PLAYER_KEY_PREFIX}${id}`, next);
    return next;
  }
}

function parseResultRequest(value: unknown): ResultRequest | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  const player = parseResultPlayer(c.player);
  const opponent = parseResultPlayer(c.opponent);
  const at = typeof c.at === "number" && Number.isFinite(c.at) ? c.at : null;
  if (!player || !opponent || at === null) return null;
  if (player.playerId === opponent.playerId) return null;
  return { player, opponent, at };
}

function parseResultPlayer(value: unknown): ResultPlayer | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  const playerId = sanitisePlayerId(c.playerId);
  const name = sanitiseName(c.name);
  const rating =
    typeof c.rating === "number" && Number.isFinite(c.rating) ? c.rating : null;
  const outcome = c.outcome;
  if (
    !playerId ||
    !name ||
    rating === null ||
    (outcome !== "win" && outcome !== "loss" && outcome !== "draw")
  ) {
    return null;
  }
  return { playerId, name, rating, outcome };
}

function sanitisePlayerId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, MAX_PLAYER_ID_LEN);
  return trimmed.length > 0 ? trimmed : null;
}

function sanitiseName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_NAME_LEN);
}

function normaliseRow(row: PlayerRow): PlayerRow {
  return {
    playerId: row.playerId,
    name: row.name ?? "Duelist",
    rating: typeof row.rating === "number" ? row.rating : 1000,
    wins: typeof row.wins === "number" ? row.wins : 0,
    losses: typeof row.losses === "number" ? row.losses : 0,
    draws: typeof row.draws === "number" ? row.draws : 0,
    updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : 0,
  };
}
