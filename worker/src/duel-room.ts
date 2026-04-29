import { json } from "./http.js";
import { DuelRoomSession, type RoomSocket } from "./duel-session.js";

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

export class DuelRoom {
  private readonly session = new DuelRoomSession("duel-room");

  constructor(
    private readonly state: unknown,
    private readonly env: unknown,
  ) {
    void this.state;
    void this.env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "upgrade_required" }, { status: 426 });
    }

    const pair = createWebSocketPair();
    if (!pair) {
      return json({ error: "websocket_pair_unavailable" }, { status: 501 });
    }

    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.session.attach(server);
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
