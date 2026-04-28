import { create } from "zustand";
import type { Room } from "colyseus.js";
import type { Quat, Vec3 } from "@vibejam/shared";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface RemotePlayer {
  id: string;
  name: string;
  position: Vec3;
  rotation: Quat;
  health: number;
  score: number;
}

interface GameStore {
  room: Room | null;
  localSessionId: string | null;
  connectionStatus: ConnectionStatus;
  players: Map<string, RemotePlayer>;
  setRoom: (room: Room | null) => void;
  setLocalSessionId: (id: string | null) => void;
  setStatus: (status: ConnectionStatus) => void;
  setPlayers: (players: Map<string, RemotePlayer>) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  room: null,
  localSessionId: null,
  connectionStatus: "idle",
  players: new Map(),
  setRoom: (room) => set({ room }),
  setLocalSessionId: (id) => set({ localSessionId: id }),
  setStatus: (status) => set({ connectionStatus: status }),
  setPlayers: (players) => set({ players }),
}));
