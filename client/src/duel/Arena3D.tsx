import { Sky } from "@react-three/drei";
import { Water } from "./Water";

export const ARENA_RADIUS = 4.0;
export const ARENA_HEIGHT = 0.4;
export const WATER_LEVEL = -0.4;
const RIM_THICKNESS = 0.55;
const RIM_LIFT = 0.06;

export function Arena3D() {
  return (
    <>
      <Sky
        distance={4500}
        sunPosition={[6, 18, -12]}
        rayleigh={2.5}
        turbidity={4}
      />
      <ambientLight intensity={0.55} color="#bcd4ff" />
      <directionalLight
        position={[6, 12, -8]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={1}
        shadow-camera-far={40}
      />
      <directionalLight position={[-4, 4, 6]} intensity={0.4} color="#fcd34d" />

      <Water level={WATER_LEVEL} arenaRadius={ARENA_RADIUS} />

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
          color="#bae6fd"
          emissive="#38bdf8"
          emissiveIntensity={2.4}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}
