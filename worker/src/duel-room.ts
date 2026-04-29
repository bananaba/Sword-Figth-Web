import { json } from "./http.js";
import {
  DuelRoomSession,
  type MatchOverEvent,
  type RoomSocket,
} from "./duel-session.js";
import type { ResultRequest } from "./leaderboard.js";

interface CloudflareWebSocket extends RoomSocket {
  accept(): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", listener: () => void): void;
  addEventListener(type: "error", listener: () => void): void;
}

type WebSocketPairConstructor = new () => {
  0: CloudflareWebSocket;
  1: CloudflareWebSocket;
};

interface DurableObjectStateLike {
  storage?: {
    setAlarm(value: number): void | Promise<void>;
  };
}

interface LeaderboardEnv {
  LEADERBOARD?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
}

const TICK_HZ = 30;
const TICK_MS = 1000 / TICK_HZ;
const GLOBAL_LEADERBOARD_NAME = "global";

export class DuelRoom {
  private readonly session: DuelRoomSession;
  private recordResults = true;

  constructor(
    private readonly state: DurableObjectStateLike,
    private readonly env: LeaderboardEnv,
  ) {
    this.session = new DuelRoomSession("duel-room", {
      onMatchOver: (event) => {
        if (!this.recordResults) return;
        // Forward W/L/D + new ratings to the persistent leaderboard DO.
        // Fire-and-forget: a leaderboard write failure must not block the
        // match-end broadcast or wedge the room.
        void this.recordMatchResult(event);
      },
    });
  }

  private async recordMatchResult(event: MatchOverEvent): Promise<void> {
    const lb = this.env.LEADERBOARD;
    if (!lb) return;
    const body: ResultRequest = {
      player: event.player,
      opponent: event.opponent,
      at: event.at,
    };
    try {
      const id = lb.idFromName(GLOBAL_LEADERBOARD_NAME);
      await lb.get(id).fetch(
        new Request("https://internal/result", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    } catch {
      /* swallow — match-over UX must not depend on persistence */
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "upgrade_required" }, { status: 426 });
    }
    const url = new URL(request.url);
    const roomId = /^\/rooms\/([^/]+)$/.exec(url.pathname)?.[1];
    if (roomId) {
      this.session.setRoomId(decodeURIComponent(roomId));
    }
    if (url.searchParams.get("record") === "0") {
      this.recordResults = false;
    }

    const pair = createWebSocketPair();
    if (!pair) {
      return json({ error: "websocket_pair_unavailable" }, { status: 501 });
    }

    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.session.attach(server);
    this.scheduleNextTick();
    server.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        this.session.handleMessage(server, event.data);
      } else {
        server.send(JSON.stringify({ t: "error", error: "invalid_message" }));
      }
    });
    const detach = () => this.session.detach(server);
    server.addEventListener("close", detach);
    server.addEventListener("error", detach);

    return webSocketResponse(client);
  }

  async alarm(): Promise<void> {
    if (!this.session.hasConnections()) return;
    this.session.tick(Date.now(), 1 / TICK_HZ);
    await this.scheduleNextTick();
  }

  private async scheduleNextTick(): Promise<void> {
    await this.state.storage?.setAlarm(Date.now() + TICK_MS);
  }
}

function createWebSocketPair(): { 0: CloudflareWebSocket; 1: CloudflareWebSocket } | null {
  const ctor = (globalThis as typeof globalThis & { WebSocketPair?: WebSocketPairConstructor })
    .WebSocketPair;
  return ctor ? new ctor() : null;
}

function webSocketResponse(client: CloudflareWebSocket): Response {
  const init = { status: 101, webSocket: client } as ResponseInit & {
    webSocket: CloudflareWebSocket;
  };
  try {
    return new Response(null, init);
  } catch (error) {
    if (error instanceof RangeError) {
      return new Response(null, {
        status: 200,
        headers: { "x-websocket-upgrade": "accepted" },
      });
    }
    throw error;
  }
}
