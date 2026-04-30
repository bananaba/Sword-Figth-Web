import { ARENA_RADIUS } from "@vibejam/shared";
import * as THREE from "three";
import { Spikes } from "./Spikes";

export { ARENA_RADIUS };
export const PIT_LEVEL = -3.8;
export const ARENA_HEIGHT = -PIT_LEVEL;
const PIT_LINER_TOP = -0.225;
const RIM_THICKNESS = 0.55;
const RIM_LIFT = 0.06;
const BASIN_RADIUS = 10.5;
const WALL_INNER_RADIUS = 11.2;
const WALL_OUTER_RADIUS = 14.2;
const WALL_HEIGHT = 2.6;

function SpectatorArch({
  angle,
  color,
}: {
  angle: number;
  color: string;
}) {
  const radius = WALL_INNER_RADIUS + 0.08;
  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;

  return (
    <group position={[x, 0.9, z]} rotation={[0, angle, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.86, 1.12, 0.18]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.46, -0.01]} castShadow receiveShadow>
        <cylinderGeometry args={[0.43, 0.43, 0.2, 18, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#8e7152" roughness={0.88} />
      </mesh>
      {/* Torch glow inside each arch — Bloom catches these as a ring of distant
          flames around the bowl. */}
      <mesh position={[0, -0.16, -0.035]}>
        <boxGeometry args={[0.46, 0.66, 0.08]} />
        <meshStandardMaterial
          color="#1d0c04"
          emissive="#ff6024"
          emissiveIntensity={1.1}
          roughness={0.9}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function ColosseumBowl() {
  const arches = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    const warm = i % 3 === 0 ? "#ad8a5e" : i % 3 === 1 ? "#9c7e58" : "#b59477";
    return <SpectatorArch key={i} angle={angle} color={warm} />;
  });

  return (
    <group>
      <mesh position={[0, PIT_LEVEL - 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[BASIN_RADIUS, WALL_INNER_RADIUS, 128]} />
        <meshStandardMaterial color="#1a110d" roughness={0.96} />
      </mesh>

      {/* Pit liner — dark stone wall from pit floor up to where the existing
          spectator-bowl wall starts. Without this you'd see through to the bg. */}
      <mesh
        position={[0, (PIT_LEVEL + PIT_LINER_TOP) / 2, 0]}
        receiveShadow
      >
        <cylinderGeometry
          args={[
            WALL_INNER_RADIUS,
            WALL_INNER_RADIUS,
            PIT_LINER_TOP - PIT_LEVEL,
            128,
            1,
            true,
          ]}
        />
        <meshStandardMaterial
          color="#1a120e"
          roughness={0.97}
          side={THREE.BackSide}
        />
      </mesh>

      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry
          args={[WALL_INNER_RADIUS, WALL_INNER_RADIUS, 1.05, 128, 1, true]}
        />
        <meshStandardMaterial color="#574330" roughness={0.94} side={THREE.BackSide} />
      </mesh>

      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[WALL_INNER_RADIUS, WALL_OUTER_RADIUS, 128]} />
        <meshStandardMaterial color="#624a32" roughness={0.92} />
      </mesh>

      <mesh position={[0, 0.42, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[WALL_INNER_RADIUS + 0.8, WALL_OUTER_RADIUS - 0.45, 128]} />
        <meshStandardMaterial color="#75593a" roughness={0.92} />
      </mesh>

      <mesh position={[0, 0.82, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[WALL_INNER_RADIUS + 1.55, WALL_OUTER_RADIUS - 0.9, 128]} />
        <meshStandardMaterial color="#876a47" roughness={0.9} />
      </mesh>

      <mesh position={[0, WALL_HEIGHT / 2 - 0.15, 0]} castShadow receiveShadow>
        <cylinderGeometry
          args={[WALL_OUTER_RADIUS, WALL_OUTER_RADIUS, WALL_HEIGHT, 128, 1, true]}
        />
        <meshStandardMaterial color="#5e4530" roughness={0.94} side={THREE.DoubleSide} />
      </mesh>

      <mesh position={[0, 1.74, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[WALL_INNER_RADIUS + 2.2, WALL_OUTER_RADIUS + 0.18, 128]} />
        <meshStandardMaterial color="#9c7d54" roughness={0.88} />
      </mesh>

      {arches}
    </group>
  );
}

export function Arena3D() {
  return (
    <>
      <color attach="background" args={["#0a0807"]} />
      <fog attach="fog" args={["#0a0807", 28, 60]} />
      <ambientLight intensity={0.62} color="#5a5360" />
      <directionalLight
        position={[6, 12, -8]}
        intensity={0.95}
        color="#dde0e8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={1}
        shadow-camera-far={40}
      />
      <directionalLight position={[-4, 4, 6]} intensity={0.45} color="#ff8a4a" />
      {/* Spike-pit ember bounce — reddish wash on the pillar undersides + pit
          liner so the pit reads as a hot abyss, not just black. */}
      <pointLight
        position={[0, PIT_LEVEL + 0.6, 0]}
        color="#ff4520"
        intensity={3.2}
        distance={14}
        decay={2}
      />

      <ColosseumBowl />
      <Spikes
        floorY={PIT_LEVEL}
        innerRadius={ARENA_RADIUS + 0.25}
        outerRadius={BASIN_RADIUS - 0.3}
        pitFloorOuter={BASIN_RADIUS}
      />

      {/* Pedestal cylinder (bulk of the platform — its side is visible from
          the pit, so dim warm stone reads under the ember bounce). */}
      <mesh position={[0, -ARENA_HEIGHT / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[ARENA_RADIUS, ARENA_RADIUS, ARENA_HEIGHT, 48]} />
        <meshStandardMaterial color="#5a4632" roughness={0.92} />
      </mesh>

      {/* Inner playable disk — kept lighter than walls so fighters read clearly. */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[ARENA_RADIUS - RIM_THICKNESS, 64]} />
        <meshStandardMaterial color="#b89366" roughness={0.85} />
      </mesh>

      {/* Outer raised rim — darker stone, reads as a separate tier. */}
      <mesh
        position={[0, RIM_LIFT, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <ringGeometry args={[ARENA_RADIUS - RIM_THICKNESS, ARENA_RADIUS, 64]} />
        <meshStandardMaterial color="#332918" roughness={0.96} />
      </mesh>

      {/* Emissive perimeter — bloom-friendly cyan threadline at the lip
          (chambara accent against the warm pit). */}
      <mesh position={[0, RIM_LIFT + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ARENA_RADIUS - 0.06, ARENA_RADIUS - 0.012, 64]} />
        <meshStandardMaterial
          color="#5ed3e6"
          emissive="#1aa6c2"
          emissiveIntensity={0.55}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}
