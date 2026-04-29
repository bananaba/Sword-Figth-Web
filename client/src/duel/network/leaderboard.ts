import { getWorkerUrl } from "./matchmake";

/**
 * Read-only client for the worker's `/leaderboard` and `/me` HTTP routes.
 * Both forward to the global Leaderboard Durable Object (Phase 11c).
 *
 * The shape mirrors `worker/src/leaderboard.ts#PlayerRow` exactly. Keep
 * them in sync — there's no shared schema package because the worker
 * already depends on `@vibejam/shared` and adding a reverse dependency
 * for one tiny type would tangle the build graph.
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

export async function fetchLeaderboard(
  signal?: AbortSignal,
): Promise<PlayerRow[]> {
  const res = await fetch(`${getWorkerUrl()}/leaderboard`, { signal });
  if (!res.ok) throw new Error(`leaderboard_http_${res.status}`);
  const body = (await res.json()) as { players?: PlayerRow[] };
  return Array.isArray(body.players) ? body.players : [];
}

export async function fetchMe(
  playerId: string,
  signal?: AbortSignal,
): Promise<PlayerRow | null> {
  const url = new URL(`${getWorkerUrl()}/me`);
  url.searchParams.set("playerId", playerId);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`me_http_${res.status}`);
  const body = (await res.json()) as { player?: PlayerRow | null };
  return body.player ?? null;
}
