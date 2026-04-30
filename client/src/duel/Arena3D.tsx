import { ARENA_RADIUS } from "@vibejam/shared";
import * as THREE from "three";
import { Water } from "./Water";

export { ARENA_RADIUS };
export const ARENA_HEIGHT = 0.4;
export const WATER_LEVEL = -0.32;
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
        <meshStandardMaterial color={color} roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.46, -0.01]} castShadow receiveShadow>
        <cylinderGeometry args={[0.43, 0.43, 0.2, 18, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#d2bea0" roughness={0.86} />
      </mesh>
      <mesh position={[0, -0.16, -0.035]}>
        <boxGeometry args={[0.46, 0.66, 0.08]} />
        <meshStandardMaterial color="#223044" roughness={0.9} />
      </mesh>
    </group>
  );
}

function ColosseumBowl() {
  const arches = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    const warm = i % 3 === 0 ? "#c8a574" : i % 3 === 1 ? "#b99369" : "#d0b58e";
    return <SpectatorArch key={i} angle={angle} color={warm} />;
  });

  return (
    <group>
      <mesh position={[0, WATER_LEVEL - 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[BASIN_RADIUS, WALL_INNER_RADIUS, 128]} />
        <meshStandardMaterial color="#5f5446" roughness={0.95} />
      </mesh>

      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <cylinderGeometry
          args={[WALL_INNER_RADIUS, WALL_INNER_RADIUS, 1.05, 128, 1, true]}
        />
        <meshStandardMaterial color="#6d5d49" roughness={0.94} side={THREE.BackSide} />
      </mesh>

      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[WALL_INNER_RADIUS, WALL_OUTER_RADIUS, 128]} />
        <meshStandardMaterial color="#8c7455" roughness={0.9} />
      </mesh>

      <mesh position={[0, 0.42, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[WALL_INNER_RADIUS + 0.8, WALL_OUTER_RADIUS - 0.45, 128]} />
        <meshStandardMaterial color="#a5845d" roughness={0.9} />
      </mesh>

      <mesh position={[0, 0.82, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[WALL_INNER_RADIUS + 1.55, WALL_OUTER_RADIUS - 0.9, 128]} />
        <meshStandardMaterial color="#b48f64" roughness={0.88} />
      </mesh>

      <mesh position={[0, WALL_HEIGHT / 2 - 0.15, 0]} castShadow receiveShadow>
        <cylinderGeometry
          args={[WALL_OUTER_RADIUS, WALL_OUTER_RADIUS, WALL_HEIGHT, 128, 1, true]}
        />
        <meshStandardMaterial color="#7b6348" roughness={0.94} side={THREE.DoubleSide} />
      </mesh>

      <mesh position={[0, 1.74, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[WALL_INNER_RADIUS + 2.2, WALL_OUTER_RADIUS + 0.18, 128]} />
        <meshStandardMaterial color="#b89365" roughness={0.86} />
      </mesh>

      {arches}
    </group>
  );
}

export function Arena3D() {
  return (
    <>
      <color attach="background" args={["#111923"]} />
      <ambientLight intensity={0.34} color="#b9cff2" />
      <directionalLight
        position={[6, 12, -8]}
        intensity={0.95}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={1}
        shadow-camera-far={40}
      />
      <directionalLight position={[-4, 4, 6]} intensity={0.28} color="#fcd34d" />

      <ColosseumBowl />
      <Water level={WATER_LEVEL} arenaRadius={ARENA_RADIUS} waterRadius={BASIN_RADIUS} />

      {/* Pedestal cylinder (bulk of the platform). */}
      <mesh position={[0, -ARENA_HEIGHT / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[ARENA_RADIUS, ARENA_RADIUS, ARENA_HEIGHT, 48]} />
        <meshStandardMaterial color="#8c7558" roughness={0.9} />
      </mesh>

      {/* Inner playable disk — slightly inset, lighter sandstone for contrast. */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[ARENA_RADIUS - RIM_THICKNESS, 64]} />
        <meshStandardMaterial color="#b59872" roughness={0.85} />
      </mesh>

      {/* Outer raised rim — darker stone, reads as a separate tier. */}
      <mesh
        position={[0, RIM_LIFT, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <ringGeometry args={[ARENA_RADIUS - RIM_THICKNESS, ARENA_RADIUS, 64]} />
        <meshStandardMaterial color="#4a3d2c" roughness={0.95} />
      </mesh>

      {/* Emissive perimeter — bloom-friendly cyan threadline at the lip. */}
      <mesh position={[0, RIM_LIFT + 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ARENA_RADIUS - 0.06, ARENA_RADIUS - 0.012, 64]} />
        <meshStandardMaterial
          color="#5ed3e6"
          emissive="#1aa6c2"
          emissiveIntensity={0.35}
        />
      </mesh>
    </>
  );
}
