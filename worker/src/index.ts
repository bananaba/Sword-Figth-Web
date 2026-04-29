import type { Env } from "./bindings.js";
import { json } from "./http.js";
export { DuelRoom } from "./duel-room.js";
export { RankedQueue } from "./ranked-queue.js";

const SERVICE_NAME = "chambara-ranked-worker";
const GLOBAL_QUEUE_NAME = "global";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/healthz") {
      return json({ ok: true, service: SERVICE_NAME });
    }

    if (request.method === "GET" && url.pathname === "/leaderboard") {
      return json({ players: [] });
    }

    if (request.method === "POST" && url.pathname === "/matchmake") {
      const queueId = env.RANKED_QUEUE.idFromName(GLOBAL_QUEUE_NAME);
      return env.RANKED_QUEUE.get(queueId).fetch(request);
    }

    const roomId = roomIdFromPath(url.pathname);
    if (roomId) {
      if (!env.DUEL_ROOM) {
        return json({ error: "duel_room_binding_missing" }, { status: 500 });
      }
      const durableRoomId = env.DUEL_ROOM.idFromName(roomId);
      return env.DUEL_ROOM.get(durableRoomId).fetch(request);
    }

    return json({ error: "not_found" }, { status: 404 });
  },
};

function roomIdFromPath(pathname: string): string | null {
  const match = /^\/rooms\/([^/]+)$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
