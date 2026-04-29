import type { RankedPlayerInfo } from "./types";

/**
 * REST entry into the Cloudflare worker. `POST /matchmake` returns either
 * `matched` (room is ready, both sides will receive the same `roomId`) or
 * `queued` (we keep polling until our rating range catches an opponent).
 *
 * The worker URL is read from `VITE_WORKER_URL`. In dev this is typically
 * `http://localhost:8787` (`wrangler dev`); in prod it'll be the deployed
 * `*.workers.dev` host. WS scheme is derived in `RankedClient`.
 */

export interface MatchmakeRequest {
  playerId: string;
  name: string;
  rating: number;
  saberColor: string;
}

export type MatchmakeResult =
  | {
      status: "matched";
      roomId: string;
      players: [RankedPlayerInfo, RankedPlayerInfo];
    }
  | {
      status: "queued";
      playerId: string;
      rating: number;
      queueSize: number;
    };

export function getWorkerUrl(): string {
  const fromEnv = import.meta.env.VITE_WORKER_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  // Sensible local default — `wrangler dev` runs on 8787.
  return "http://localhost:8787";
}

export async function postMatchmake(
  workerUrl: string,
  req: MatchmakeRequest,
  signal?: AbortSignal,
): Promise<MatchmakeResult> {
  const res = await fetch(`${workerUrl}/matchmake`, {
    method: "POST",
    body: JSON.stringify(req),
    headers: { "content-type": "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`matchmake_http_${res.status}`);
  }
  const data = (await res.json()) as MatchmakeResult & { error?: string };
  if ("error" in data && data.error) {
    throw new Error(`matchmake_${data.error}`);
  }
  return data;
}

/**
 * Polls `/matchmake` every `intervalMs` until matched or aborted. Each call
 * re-enters the queue, but the queue dedupes by playerId on the worker side
 * (it just updates the existing entry's position).
 *
 * Network failures (offline blip, worker cold start, transient 5xx) trigger
 * an exponential backoff up to MAX_BACKOFF_MS instead of bailing — the user
 * will see "queued" longer rather than a hard error mid-search. Aborts and
 * 4xx responses still throw immediately.
 *
 * Returns the matched roomId. Throws on abort.
 */
const RETRY_BASE_MS = 500;
const MAX_BACKOFF_MS = 8000;

export async function pollUntilMatched(
  workerUrl: string,
  req: MatchmakeRequest,
  onQueued: (queueSize: number) => void,
  signal: AbortSignal,
  intervalMs = 2000,
): Promise<string> {
  let consecutiveFailures = 0;
  while (true) {
    if (signal.aborted) throw new Error("matchmake_aborted");
    try {
      const result = await postMatchmake(workerUrl, req, signal);
      consecutiveFailures = 0;
      if (result.status === "matched") return result.roomId;
      onQueued(result.queueSize);
      await sleep(intervalMs, signal);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Aborts must surface immediately — the caller is unmounting.
      if (message === "matchmake_aborted" || signal.aborted) {
        throw err;
      }
      // 4xx is a programmer error (bad payload), not a transient glitch.
      // 5xx and network failures are retryable.
      if (/^matchmake_http_4\d\d$/.test(message)) {
        throw err;
      }
      consecutiveFailures += 1;
      const backoff = Math.min(
        MAX_BACKOFF_MS,
        RETRY_BASE_MS * 2 ** Math.min(consecutiveFailures - 1, 6),
      );
      await sleep(backoff, signal);
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("matchmake_aborted"));
      },
      { once: true },
    );
  });
}

/**
 * Stable per-browser playerId. Generated once and persisted to localStorage
 * so rating updates accumulate across sessions. (Phase 11c will key the DO
 * SQLite leaderboard off this same id.)
 */
export const PLAYER_ID_KEY = "chambara.playerId";
const RATING_KEY = "chambara.rating";
const DEFAULT_RATING = 1000;

export function getOrCreatePlayerId(): string {
  try {
    const stored = localStorage.getItem(PLAYER_ID_KEY);
    if (stored && stored.length > 0) return stored;
  } catch {
    /* localStorage unavailable */
  }
  const fresh = `p_${cryptoRandom(10)}`;
  try {
    localStorage.setItem(PLAYER_ID_KEY, fresh);
  } catch {
    /* localStorage unavailable */
  }
  return fresh;
}

export function readStoredRating(): number {
  try {
    const raw = localStorage.getItem(RATING_KEY);
    if (!raw) return DEFAULT_RATING;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : DEFAULT_RATING;
  } catch {
    return DEFAULT_RATING;
  }
}

export function writeStoredRating(rating: number): void {
  try {
    localStorage.setItem(RATING_KEY, Math.round(rating).toString());
  } catch {
    /* localStorage unavailable */
  }
}

function cryptoRandom(length: number): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
