import { json } from "./http.js";
import {
  parseMatchmakePlayer,
  type MatchmakePlayer,
  type MatchmakeResponse,
} from "./protocol.js";

const MATCH_RANGE = 200;

export class RankedQueue {
  private waiting: MatchmakePlayer[] = [];

  constructor(
    private readonly state: unknown,
    private readonly env: unknown,
  ) {
    void this.state;
    void this.env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, { status: 405 });
    }

    const player = parseMatchmakePlayer(await readJson(request));
    if (!player) {
      return json({ error: "invalid_matchmake_request" }, { status: 400 });
    }

    const matchIndex = this.waiting.findIndex(
      (waitingPlayer) => Math.abs(waitingPlayer.rating - player.rating) <= MATCH_RANGE,
    );

    if (matchIndex >= 0) {
      const opponent = this.waiting.splice(matchIndex, 1)[0];
      if (!opponent) {
        return json({ error: "queue_corrupt" }, { status: 500 });
      }
      const response: MatchmakeResponse = {
        status: "matched",
        roomId: roomIdFor(opponent.playerId, player.playerId),
        players: [opponent, player],
      };
      return json(response);
    }

    this.waiting.push(player);
    const response: MatchmakeResponse = {
      status: "queued",
      playerId: player.playerId,
      rating: player.rating,
      queueSize: this.waiting.length,
    };
    return json(response);
  }
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function roomIdFor(firstPlayerId: string, secondPlayerId: string): string {
  return `ranked-${firstPlayerId}-${secondPlayerId}`;
}
