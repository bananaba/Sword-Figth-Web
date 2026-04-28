import { useGameStore } from "../stores/gameStore";

export function RemotePlayers() {
  const players = useGameStore((s) => s.players);
  const localId = useGameStore((s) => s.localSessionId);

  return (
    <group>
      {Array.from(players.values())
        .filter((p) => p.id !== localId)
        .map((p) => (
          <group
            key={p.id}
            position={[p.position.x, p.position.y, p.position.z]}
          >
            <mesh castShadow>
              <coneGeometry args={[1.5, 6, 4]} />
              <meshStandardMaterial color="#54a0ff" />
            </mesh>
          </group>
        ))}
    </group>
  );
}
