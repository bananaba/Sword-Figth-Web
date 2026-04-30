import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface WaterProps {
  level: number;
  arenaRadius: number;
  waterRadius?: number;
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPos;

  void main() {
    vec3 p = position;
    // Small, dense ripples — visible motion without sculpting visible bumps.
    float w1 = sin(p.x * 0.9 + uTime * 0.75) * 0.018;
    float w2 = sin(p.y * 0.8 + uTime * 0.95) * 0.018;
    float w3 = sin((p.x + p.y) * 0.45 + uTime * 0.55) * 0.025;
    p.z += w1 + w2 + w3;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform float uArenaRadius;
  uniform float uWaterRadius;
  varying vec3 vWorldPos;

  void main() {
    float r = length(vWorldPos.xz);
    if (r > uWaterRadius) discard;

    // Depth fade — shallow cyan close to the arena, deep navy toward the basin wall.
    float depthT = 1.0 - smoothstep(uArenaRadius + 0.8, uArenaRadius + 5.8, r);
    vec3 base = mix(uDeep, uShallow, depthT);

    // Drifting current bands — barely visible, just enough to feel alive.
    float band = sin(vWorldPos.x * 0.4 + uTime * 0.32)
               + cos(vWorldPos.z * 0.35 + uTime * 0.28);
    band = smoothstep(1.2, 1.85, band);

    // Subtle shoreline foam; keep it below bloom threshold so it never reads as a light.
    float shoreInner = smoothstep(uArenaRadius - 0.04, uArenaRadius + 0.06, r);
    float shoreOuter = 1.0 - smoothstep(uArenaRadius + 0.06, uArenaRadius + 0.28, r);
    float shore = shoreInner * shoreOuter;

    vec3 col = base
             + uFoam * band * 0.045
             + uFoam * shore * 0.08;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function Water({ level, arenaRadius, waterRadius = 11.0 }: WaterProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color("#071426") },
      uShallow: { value: new THREE.Color("#173957") },
      uFoam: { value: new THREE.Color("#6ec7ed") },
      uArenaRadius: { value: arenaRadius },
      uWaterRadius: { value: waterRadius },
    }),
    [arenaRadius, waterRadius],
  );

  useFrame((_, dt) => {
    const u = matRef.current?.uniforms.uTime;
    if (u) u.value += dt;
  });

  return (
    <mesh
      position={[0, level, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[waterRadius * 2, waterRadius * 2, 96, 96]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </mesh>
  );
}
