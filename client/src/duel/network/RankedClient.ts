import type { ClientMessage, ServerMessage } from "./types";

/**
 * Thin WebSocket wrapper for a single DuelRoom session. Buffers outgoing
 * messages until the socket opens (so caller can fire `hello`/`ready`
 * eagerly), parses incoming JSON, and dispatches to a single
 * `onMessage(msg)` consumer.
 *
 * No automatic reconnect — if the connection drops mid-match, we surface
 * `onClose` so the UI can return to the title screen. Mid-match
 * reconnection across DurableObject instances is out of jam scope.
 */
export type RankedClientStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "errored";

export interface RankedClientOptions {
  url: string;
  onMessage: (msg: ServerMessage) => void;
  onStatusChange?: (status: RankedClientStatus) => void;
  onError?: (err: Error) => void;
}

export class RankedClient {
  private socket: WebSocket | null = null;
  private status: RankedClientStatus = "idle";
  private readonly outbox: ClientMessage[] = [];

  constructor(private readonly options: RankedClientOptions) {}

  connect(): void {
    if (this.socket) return;
    this.setStatus("connecting");
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.options.url);
    } catch (err) {
      this.options.onError?.(toError(err));
      this.setStatus("errored");
      return;
    }
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.setStatus("open");
      // Drain any messages queued before the socket finished connecting.
      while (this.outbox.length > 0) {
        const msg = this.outbox.shift();
        if (msg) socket.send(JSON.stringify(msg));
      }
    });
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let parsed: ServerMessage | null = null;
      try {
        parsed = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }
      if (parsed && typeof parsed === "object" && "t" in parsed) {
        this.options.onMessage(parsed);
      }
    });
    socket.addEventListener("close", () => {
      this.setStatus("closed");
    });
    socket.addEventListener("error", () => {
      this.options.onError?.(new Error("websocket_error"));
      this.setStatus("errored");
    });
  }

  send(msg: ClientMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    } else {
      this.outbox.push(msg);
    }
  }

  close(code = 1000, reason = "client_close"): void {
    if (!this.socket) return;
    try {
      this.socket.close(code, reason);
    } catch {
      /* ignore — socket already torn down */
    }
    this.socket = null;
  }

  getStatus(): RankedClientStatus {
    return this.status;
  }

  private setStatus(next: RankedClientStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.options.onStatusChange?.(next);
  }
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Build the room WS URL from the worker base. The worker's `/rooms/:id`
 * path accepts the `Upgrade: websocket` handshake.
 */
export function roomWsUrl(
  workerHttpUrl: string,
  roomId: string,
  params: Record<string, string> = {},
): string {
  const wsBase = workerHttpUrl
    .replace(/^http:/, "ws:")
    .replace(/^https:/, "wss:");
  const query = new URLSearchParams(params).toString();
  return `${wsBase}/rooms/${encodeURIComponent(roomId)}${query ? `?${query}` : ""}`;
}
