import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import * as THREE from "three";
import type { ImpactEvent } from "./useDuelLoop";

const RING_LIFE_MS = 520;

interface RingStyle {
  color: string;
  startRadius: number;
  endRadius: number;
  thickness: number;
  initialOpacity: number;
}

function ringStyle(kind: ImpactEvent["kind"]): RingStyle {
  switch (kind) {
    case "hit":
      return {
        color: "#fde68a",
        startRadius: 0.25,
        endRadius: 1.45,
        thickness: 0.22,
        initialOpacity: 1.0,
      };
    case "pierce":
      return {
        color: "#fda4af",
        startRadius: 0.25,
        endRadius: 1.6,
        thickness: 0.26,
        initialOpacity: 1.0,
      };
    case "block":
      return {
        color: "#bfdbfe",
        startRadius: 0.2,
        endRadius: 0.95,
        thickness: 0.16,
        initialOpacity: 0.9,
      };
    default:
      return {
        color: "#cbd5e1",
        startRadius: 0.18,
        endRadius: 0.55,
        thickness: 0.1,
        initialOpacity: 0.4,
      };
  }
}

function ImpactRing({ event }: { event: ImpactEvent }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const style = ringStyle(event.kind);

  useFrame(() => {
    const now = performance.now();
    const tt = Math.min(1, Math.max(0, (now - event.at) / RING_LIFE_MS));
    const eased = 1 - (1 - tt) * (1 - tt);
    const radius = style.startRadius + (style.endRadius - style.startRadius) * eased;
    if (meshRef.current) {
      meshRef.current.scale.setScalar(radius);
    }
    if (materialRef.current) {
      materialRef.current.opacity = style.initialOpacity * (1 - tt);
    }
  });

  return (
    <mesh ref={meshRef} position={[0, event.worldY, event.worldZ]}>
      <ringGeometry args={[1, 1 + style.thickness, 48]} />
      <meshBasicMaterial
        ref={materialRef}
        color={style.color}
        transparent
        opacity={style.initialOpacity}
        side={THREE.DoubleSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

interface Props {
  eventsRef: React.MutableRefObject<ImpactEvent[]>;
}

/**
 * Renders an expanding ring per fresh impact event. Mirrors the resolver
 * outcome timeline; `useDuelLoop` prunes the source ref so events disappear
 * here automatically.
 */
export function ImpactRings({ eventsRef }: Props) {
  const [active, setActive] = useState<ImpactEvent[]>([]);
  const lastIdRef = useRef<number>(-1);
  const lastLenRef = useRef<number>(0);

  useFrame(() => {
    const now = performance.now();
    const fresh = eventsRef.current.filter((e) => now - e.at < RING_LIFE_MS);
    const last = fresh[fresh.length - 1];
    const lastId = last ? last.id : -1;
    if (lastId !== lastIdRef.current || fresh.length !== lastLenRef.current) {
      lastIdRef.current = lastId;
      lastLenRef.current = fresh.length;
      setActive(fresh);
    }
  });

  return (
    <>
      {active.map((e) => (
        <ImpactRing key={e.id} event={e} />
      ))}
    </>
  );
}
