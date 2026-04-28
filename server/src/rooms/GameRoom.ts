import { Room, type Client } from "@colyseus/core";
import {
  type InputCommand,
  MessageType,
  TICK_INTERVAL_MS,
} from "@vibejam/shared";
import { GameState, PlayerState } from "../schemas/GameState";

const MAX_CLIENTS = 64;
const SPAWN_RADIUS = 200;

export class GameRoom extends Room<GameState> {
  override maxClients = MAX_CLIENTS;

  override onCreate(): void {
    this.setState(new GameState());

    this.onMessage<InputCommand>(MessageType.Input, (client, input) => {
      this.applyInput(client.sessionId, input);
    });

    this.onMessage<{ name: string }>(MessageType.Rename, (client, payload) => {
      const player = this.state.players.get(client.sessionId);
      if (player && typeof payload?.name === "string") {
        player.name = payload.name.slice(0, 24);
      }
    });

    this.setSimulationInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  override onJoin(client: Client, options?: { name?: string }): void {
    const player = new PlayerState();
    player.id = client.sessionId;
    player.name = (options?.name ?? `pilot-${client.sessionId.slice(0, 4)}`)
      .slice(0, 24);

    const angle = Math.random() * Math.PI * 2;
    player.position.x = Math.cos(angle) * SPAWN_RADIUS;
    player.position.y = 50;
    player.position.z = Math.sin(angle) * SPAWN_RADIUS;

    this.state.players.set(client.sessionId, player);
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
  }

  private applyInput(sessionId: string, input: InputCommand): void {
    const player = this.state.players.get(sessionId);
    if (!player) return;

    const dt = Math.max(0, Math.min(input.dt ?? 0, 0.1));
    const throttle = clamp(input.throttle ?? 0, 0, 1);

    player.velocity.x += Math.sin(input.yaw ?? 0) * throttle * dt * 50;
    player.velocity.y += -Math.sin(input.pitch ?? 0) * throttle * dt * 50;
    player.velocity.z += Math.cos(input.yaw ?? 0) * throttle * dt * 50;

    player.lastInputSeq = input.seq ?? player.lastInputSeq;
  }

  private tick(): void {
    const dt = TICK_INTERVAL_MS / 1000;
    this.state.tick += 1;

    this.state.players.forEach((player) => {
      player.position.x += player.velocity.x * dt;
      player.position.y += player.velocity.y * dt;
      player.position.z += player.velocity.z * dt;

      const drag = 0.98;
      player.velocity.x *= drag;
      player.velocity.y *= drag;
      player.velocity.z *= drag;
    });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
