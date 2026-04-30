import { Instance, Instances } from "@react-three/drei";
import { useMemo } from "react";

interface SpikesProps {
  floorY: number;
  innerRadius: number;
  outerRadius: number;
  count?: number;
  pitFloorOuter?: number;
}

const BODY_HEIGHT = 1.30;
const TIP_HEIGHT = 0.60;
const BODY_BASE_R = 0.16;
const BODY_TOP_R = 0.05;
const TIP_BASE_R = 0.05;

// Deterministic PRNG so the spike layout is identical every match.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SpikeData {
  x: number;
  z: number;
  rotY: number;
  tiltX: number;
  tiltZ: number;
  widthScale: number;
  heightScale: number;
  bodyY: number;
  tipY: number;
}

export function Spikes({
  floorY,
  innerRadius,
  outerRadius,
  count = 480,
  pitFloorOuter,
}: SpikesProps) {
  const items = useMemo<SpikeData[]>(() => {
    const rng = mulberry32(0xcafeba);
    const list: SpikeData[] = [];

    for (let i = 0; i < count; i++) {
      // Area-uniform sampling so spike density is constant across the annulus.
      const t = rng();
      const r = Math.sqrt(
        innerRadius * innerRadius +
          t * (outerRadius * outerRadius - innerRadius * innerRadius),
      );
      const a = rng() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const heightScale = 0.55 + rng() * 0.85;
      const widthScale = 0.8 + rng() * 0.45;
      const rotY = rng() * Math.PI * 2;
      const tiltX = (rng() - 0.5) * 0.16;
      const tiltZ = (rng() - 0.5) * 0.16;
      const bodyY = floorY + BODY_HEIGHT * 0.5 * heightScale;
      const tipY = floorY + (BODY_HEIGHT + TIP_HEIGHT * 0.5) * heightScale;
      list.push({
        x,
        z,
        rotY,
        tiltX,
        tiltZ,
        widthScale,
        heightScale,
        bodyY,
        tipY,
      });
    }
    return list;
  }, [floorY, innerRadius, outerRadius, count]);

  const pitOuterR = pitFloorOuter ?? outerRadius + 0.3;
  const pitInnerR = Math.max(0, innerRadius - 0.5);

  return (
    <group>
      {/* Pit floor — dark gunmetal slab, reads as the bottom of the chamber. */}
      <mesh
        position={[0, floorY - 0.005, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <ringGeometry args={[pitInnerR, pitOuterR, 96]} />
        <meshStandardMaterial color="#0d1118" roughness={0.85} metalness={0.4} />
      </mesh>

      {/* Spike bodies — gunmetal industrial pikes, instanced for cheap rendering. */}
      <Instances limit={count} range={count} castShadow receiveShadow>
        <cylinderGeometry
          args={[BODY_TOP_R, BODY_BASE_R, BODY_HEIGHT, 6]}
        />
        <meshStandardMaterial
          color="#2a3038"
          roughness={0.45}
          metalness={0.7}
        />
        {items.map((s, i) => (
          <Instance
            key={i}
            position={[s.x, s.bodyY, s.z]}
            rotation={[s.tiltX, s.rotY, s.tiltZ]}
            scale={[s.widthScale, s.heightScale, s.widthScale]}
          />
        ))}
      </Instances>

      {/* Glowing tips — red-orange danger signal, Bloom-friendly. */}
      <Instances limit={count} range={count}>
        <coneGeometry args={[TIP_BASE_R, TIP_HEIGHT, 6]} />
        <meshStandardMaterial
          color="#ff7042"
          emissive="#ff3a1a"
          emissiveIntensity={1.5}
          roughness={0.45}
          toneMapped={false}
        />
        {items.map((s, i) => (
          <Instance
            key={i}
            position={[s.x, s.tipY, s.z]}
            rotation={[s.tiltX, s.rotY, s.tiltZ]}
            scale={[s.widthScale, s.heightScale, s.widthScale]}
          />
        ))}
      </Instances>
    </group>
  );
}
