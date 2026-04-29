import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface WaterProps {
  level: number;
  arenaRadius: number;
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
  varying vec3 vWorldPos;

  void main() {
    float r = length(vWorldPos.xz);

    // Depth fade — shallow cyan close to the arena, deep navy far out.
    float depthT = 1.0 - smoothstep(uArenaRadius + 1.0, uArenaRadius + 16.0, r);
    vec3 base = mix(uDeep, uShallow, depthT);

    // Drifting current bands — barely visible, just enough to feel alive.
    float band = sin(vWorldPos.x * 0.4 + uTime * 0.32)
               + cos(vWorldPos.z * 0.35 + uTime * 0.28);
    band = smoothstep(1.2, 1.85, band);

    // Sparkle highlights — small dense dots, sharpened with pow() instead of
    // smoothstep so each dot stays tight rather than blurring into a blob.
    float spX = sin(vWorldPos.x * 9.0 + uTime * 1.3);
    float spZ = sin(vWorldPos.z * 8.5 + uTime * 1.55);
    float sp = max(0.0, spX) * max(0.0, spZ);
    sp = pow(sp, 14.0);

    // Thin shoreline foam — narrow cyan ring right at the arena lip (~25cm).
    float shoreInner = smoothstep(uArenaRadius - 0.04, uArenaRadius + 0.06, r);
    float shoreOuter = 1.0 - smoothstep(uArenaRadius + 0.06, uArenaRadius + 0.28, r);
    float shore = shoreInner * shoreOuter;

    vec3 col = base
             + uFoam * band * 0.08
             + uFoam * sp * 0.55
             + uFoam * shore * 0.95;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function Water({ level, arenaRadius }: WaterProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color("#0a1830") },
      uShallow: { value: new THREE.Color("#1d416d") },
      uFoam: { value: new THREE.Color("#7dd3fc") },
      uArenaRadius: { value: arenaRadius },
    }),
    [arenaRadius],
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
      <planeGeometry args={[60, 60, 96, 96]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </mesh>
  );
}
