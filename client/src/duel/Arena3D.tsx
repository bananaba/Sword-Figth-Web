import { Sky } from "@react-three/drei";

export const ARENA_RADIUS = 4.0;
export const ARENA_HEIGHT = 0.4;
export const WATER_LEVEL = -0.4;

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

      <mesh
        position={[0, WATER_LEVEL, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial
          color="#1e3a5f"
          metalness={0.45}
          roughness={0.4}
        />
      </mesh>

      <mesh position={[0, -ARENA_HEIGHT / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[ARENA_RADIUS, ARENA_RADIUS, ARENA_HEIGHT, 48]} />
        <meshStandardMaterial color="#9b8463" roughness={0.85} />
      </mesh>

      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[ARENA_RADIUS - 0.18, ARENA_RADIUS, 64]} />
        <meshStandardMaterial color="#cda86a" roughness={0.9} />
      </mesh>
    </>
  );
}
