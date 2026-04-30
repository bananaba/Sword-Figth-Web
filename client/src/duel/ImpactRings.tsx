import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useImpacts, type ImpactEvent } from "./stores/useImpacts";

const RING_LIFE_MS = 360;

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
        startRadius: 0.18,
        endRadius: 1.12,
        thickness: 0.16,
        initialOpacity: 0.9,
      };
    case "pierce":
      return {
        color: "#fda4af",
        startRadius: 0.18,
        endRadius: 1.25,
        thickness: 0.18,
        initialOpacity: 0.95,
      };
    case "block":
      return {
        color: "#bfdbfe",
        startRadius: 0.14,
        endRadius: 0.82,
        thickness: 0.12,
        initialOpacity: 0.75,
      };
    case "ko":
      return {
        color: "#ffffff",
        startRadius: 0.35,
        endRadius: 1.9,
        thickness: 0.22,
        initialOpacity: 1.0,
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
      meshRef.current.rotation.z += 0.025;
    }
    if (materialRef.current) {
      materialRef.current.opacity = style.initialOpacity * (1 - tt) * (1 - tt);
    }
  });

  return (
    <mesh ref={meshRef} position={[0, event.worldY, event.worldZ]} renderOrder={28}>
      <ringGeometry args={[1, 1 + style.thickness, 56]} />
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

/**
 * Renders a fast circular shockwave per fresh impact event. Subscribes directly to
 * `useImpacts` — push from `dispatchImpactFx` triggers a re-render with the
 * new event in the array; `useDuelLoop.tick` prunes stale entries each frame
 * so shockwaves stop rendering automatically.
 */
export function ImpactRings() {
  const events = useImpacts((s) => s.events);
  return (
    <>
      {events.map((e) => (
        <ImpactRing key={e.id} event={e} />
      ))}
    </>
  );
}
