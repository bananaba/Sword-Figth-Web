import { useEffect } from "react";
import { Client, Room } from "colyseus.js";
import { ROOM_NAME } from "@vibejam/shared";
import { useGameStore } from "../stores/gameStore";
import type { RemotePlayer } from "../stores/gameStore";

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ?? "ws://localhost:2567";

interface NetworkedVec3 {
  x: number;
  y: number;
  z: number;
}
interface NetworkedQuat {
  x: number;
  y: number;
  z: number;
  w: number;
}
interface NetworkedPlayer {
  id: string;
  name: string;
  position: NetworkedVec3;
  rotation: NetworkedQuat;
  velocity: NetworkedVec3;
  health: number;
  score: number;
  lastInputSeq: number;
}
interface NetworkedPlayersMap {
  forEach(cb: (player: NetworkedPlayer, id: string) => void): void;
}
interface NetworkedState {
  players: NetworkedPlayersMap;
  tick: number;
}

export function useNetwork() {
  useEffect(() => {
    const store = useGameStore.getState();
    store.setStatus("connecting");

    const client = new Client(SERVER_URL);
    let room: Room | null = null;
    let cancelled = false;

    client
      .joinOrCreate(ROOM_NAME, {})
      .then((joined) => {
        if (cancelled) {
          joined.leave();
          return;
        }
        room = joined;
        store.setRoom(joined);
        store.setLocalSessionId(joined.sessionId);
        store.setStatus("connected");

        joined.onStateChange((state: NetworkedState) => {
          const next = new Map<string, RemotePlayer>();
          state.players.forEach((p: NetworkedPlayer, id: string) => {
            next.set(id, {
              id,
              name: p.name,
              position: { x: p.position.x, y: p.position.y, z: p.position.z },
              rotation: {
                x: p.rotation.x,
                y: p.rotation.y,
                z: p.rotation.z,
                w: p.rotation.w,
              },
              health: p.health,
              score: p.score,
            });
          });
          useGameStore.getState().setPlayers(next);
        });

        joined.onLeave(() => {
          useGameStore.getState().setStatus("disconnected");
        });
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[network] joinOrCreate failed", err);
        useGameStore.getState().setStatus("error");
      });

    return () => {
      cancelled = true;
      room?.leave();
      useGameStore.getState().setRoom(null);
    };
  }, []);
}
