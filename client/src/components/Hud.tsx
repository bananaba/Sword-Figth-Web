import { useGameStore } from "../stores/gameStore";

export function Hud() {
  const status = useGameStore((s) => s.connectionStatus);
  const players = useGameStore((s) => s.players);

  return (
    <div className="hud">
      <div className="hud-top">
        <span className={`status status-${status}`}>{status}</span>
        <span className="player-count">pilots: {players.size}</span>
      </div>
      <div className="hud-bottom">
        <span>WASD / Arrows · Space throttle · Mouse aim</span>
      </div>
    </div>
  );
}
