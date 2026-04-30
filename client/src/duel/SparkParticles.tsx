import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useImpacts, type ImpactEvent, type ImpactKind } from "./stores/useImpacts";

/**
 * Phase 11.5 — particle sparks layer driven by `useImpacts`. One `<Points>`
 * with a fixed ring-buffer pool; each impact event burst-writes N
 * consecutive slots' attributes (origin / velocity / startTime / color /
 * size). The vertex shader integrates `pos = origin + v·t + ½·g·t²` so
 * playback is GPU-side — CPU only writes once per emission.
 *
 * Burst design follows `docs/jam-polish-plan.md` §11.5:
 *   BLOCK  → small cyan flecks (8–12)
 *   HIT    → magenta sparks (5–10)
 *   PIERCE → orange + gray "cloth" (15)
 *   KO     → white→magenta explosion (30)
 *
 * Keep point sprites bounded in screen space while still throwing a readable
 * burst. Distance scaling stays disabled because it can turn one particle
 * into a giant translucent circle in the over-the-shoulder camera.
 */

interface KindConfig {
  /** Particles emitted per event. Picked above the typical research range
   *  so even mid-cluster impacts read clearly. */
  count: number;
  base: THREE.Color;
  /** Optional second color used on a fraction of particles. PIERCE = gray
   *  cloth, KO = magenta on top of white core. */
  alt?: THREE.Color;
  altFraction: number;
  /** Initial speed range — m/s. */
  speedMin: number;
  speedMax: number;
  /** Point size in screen pixels before shader clamping. */
  size: number;
  /** Y gravity in m/s² (positive = downward). 0 = floats freely. */
  gravity: number;
  /** Particle lifetime in seconds. */
  lifetime: number;
  /** Origin jitter radius — random offset added to event position. */
  jitter: number;
  /** Hemisphere bias toward +Y (0 = full sphere, 1 = upper hemisphere only). */
  upBias: number;
}

const COLOR = (hex: string, boost: number): THREE.Color =>
  new THREE.Color(hex).multiplyScalar(boost);

const CONFIGS: Record<ImpactKind, KindConfig> = {
  block: {
    count: 14,
    base: COLOR("#67e8f9", 1.15),
    altFraction: 0,
    speedMin: 2.8,
    speedMax: 5.2,
    size: 7.0,
    gravity: 0.8,
    lifetime: 0.55,
    jitter: 0.08,
    upBias: 0.4,
  },
  hit: {
    count: 16,
    base: COLOR("#f472b6", 1.25),
    altFraction: 0,
    speedMin: 3.8,
    speedMax: 6.4,
    size: 8.5,
    gravity: 1.4,
    lifetime: 0.7,
    jitter: 0.06,
    upBias: 0.55,
  },
  pierce: {
    count: 20,
    base: COLOR("#fb923c", 1.25),
    alt: COLOR("#cbd5e1", 0.95),
    altFraction: 0.35,
    speedMin: 3.4,
    speedMax: 7.2,
    size: 8.0,
    gravity: 1.1,
    lifetime: 0.85,
    jitter: 0.1,
    upBias: 0.45,
  },
  ko: {
    count: 42,
    base: COLOR("#ffffff", 1.2),
    alt: COLOR("#e879f9", 1.1),
    altFraction: 0.5,
    speedMin: 4.5,
    speedMax: 8.5,
    size: 10.0,
    gravity: 0.5,
    lifetime: 1.1,
    jitter: 0.18,
    upBias: 0.25,
  },
};

const POOL_SIZE = 256;

const VERT = /* glsl */ `
uniform float uTime;
uniform vec3 uGravity;
attribute vec3 aVelocity;
attribute float aStartTime;
attribute float aLifetime;
attribute vec3 aColor;
attribute float aSize;
varying float vAge;
varying vec3 vColor;

void main() {
  float t = uTime - aStartTime;
  vAge = clamp(t / max(aLifetime, 0.0001), 0.0, 1.0);
  vColor = aColor;
  vec3 pos = position + aVelocity * t + 0.5 * uGravity * t * t;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  // Shrink as the particle ages so it dies out cleanly.
  float fade = 1.0 - vAge;
  float pixelSize = clamp(aSize * fade, 0.0, 24.0);
  // Collapse expired or unallocated slots to zero size — they'll be
  // discarded by the rasteriser.
  if (t < 0.0 || t >= aLifetime || aLifetime <= 0.0) pixelSize = 0.0;
  gl_PointSize = pixelSize;
}
`;

const FRAG = /* glsl */ `
varying float vAge;
varying vec3 vColor;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float r = length(uv);
  // Soft circular sprite — antialiased edge between r=0.42 and r=0.5.
  float disc = 1.0 - smoothstep(0.42, 0.5, r);
  // Compact hot core. Keep opacity low enough that particles read as sparks,
  // not translucent screen-space blobs.
  float core = 1.0 - smoothstep(0.0, 0.32, r);
  float a = disc * (1.0 - vAge) * 0.9;
  vec3 c = vColor + vColor * core * 0.32;
  gl_FragColor = vec4(c, a);
}
`;

interface PoolBuffers {
  positions: THREE.BufferAttribute;
  velocities: THREE.BufferAttribute;
  startTimes: THREE.BufferAttribute;
  lifetimes: THREE.BufferAttribute;
  colors: THREE.BufferAttribute;
  sizes: THREE.BufferAttribute;
}

function buildPool(): {
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  buffers: PoolBuffers;
} {
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(POOL_SIZE * 3), 3);
  const velocities = new THREE.BufferAttribute(new Float32Array(POOL_SIZE * 3), 3);
  const startTimes = new THREE.BufferAttribute(new Float32Array(POOL_SIZE), 1);
  const lifetimes = new THREE.BufferAttribute(new Float32Array(POOL_SIZE), 1);
  const colors = new THREE.BufferAttribute(new Float32Array(POOL_SIZE * 3), 3);
  const sizes = new THREE.BufferAttribute(new Float32Array(POOL_SIZE), 1);
  // Initialise every slot to expired so empty pool renders nothing.
  for (let i = 0; i < POOL_SIZE; i++) {
    lifetimes.setX(i, 0);
  }
  geometry.setAttribute("position", positions);
  geometry.setAttribute("aVelocity", velocities);
  geometry.setAttribute("aStartTime", startTimes);
  geometry.setAttribute("aLifetime", lifetimes);
  geometry.setAttribute("aColor", colors);
  geometry.setAttribute("aSize", sizes);
  // The vertex shader handles culling; without an explicit draw range
  // three.js still issues GL_POINTS for every slot which is fine.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 50);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uGravity: { value: new THREE.Vector3(0, 0, 0) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return { geometry, material, buffers: { positions, velocities, startTimes, lifetimes, colors, sizes } };
}

interface EmitState {
  cursor: number;
  /** Time origin (seconds) — emission `aStartTime` is `(now - origin)/1000`. */
  origin: number;
}

function emitBurst(
  buffers: PoolBuffers,
  cfg: KindConfig,
  event: ImpactEvent,
  state: EmitState,
): void {
  const seconds = (event.at - state.origin) / 1000;
  for (let i = 0; i < cfg.count; i++) {
    const idx = state.cursor;
    state.cursor = (state.cursor + 1) % POOL_SIZE;

    // Random hemisphere direction with up-bias.
    const phi = Math.random() * Math.PI * 2;
    const cosThetaMin = 1 - 2 * (1 - cfg.upBias);
    const cosTheta = cosThetaMin + Math.random() * (1 - cosThetaMin);
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    const dirX = sinTheta * Math.cos(phi);
    const dirY = cosTheta;
    const dirZ = sinTheta * Math.sin(phi);
    const speed = cfg.speedMin + Math.random() * (cfg.speedMax - cfg.speedMin);

    const ox = (Math.random() - 0.5) * cfg.jitter * 2;
    const oy = (Math.random() - 0.5) * cfg.jitter * 2;
    const oz = (Math.random() - 0.5) * cfg.jitter * 2;

    buffers.positions.setXYZ(idx, ox, event.worldY + oy, event.worldZ + oz);
    buffers.velocities.setXYZ(idx, dirX * speed, dirY * speed, dirZ * speed);
    buffers.startTimes.setX(idx, seconds);
    buffers.lifetimes.setX(idx, cfg.lifetime);

    const useAlt = cfg.alt && Math.random() < cfg.altFraction;
    const c = useAlt && cfg.alt ? cfg.alt : cfg.base;
    buffers.colors.setXYZ(idx, c.r, c.g, c.b);
    buffers.sizes.setX(idx, cfg.size * (0.7 + Math.random() * 0.6));
  }
  buffers.positions.needsUpdate = true;
  buffers.velocities.needsUpdate = true;
  buffers.startTimes.needsUpdate = true;
  buffers.lifetimes.needsUpdate = true;
  buffers.colors.needsUpdate = true;
  buffers.sizes.needsUpdate = true;
}

export function SparkParticles() {
  const events = useImpacts((s) => s.events);
  const lastEmittedId = useRef(-1);
  // Use one shared time origin so every frame's `uTime` value is in the
  // same seconds frame as `aStartTime`. Updates each frame in useFrame.
  const stateRef = useRef<EmitState>({ cursor: 0, origin: performance.now() });
  const pool = useMemo(buildPool, []);

  // Set initial gravity each time a config could change. CONFIGS are static,
  // so we read the largest gravity for KO/HIT but that's not right —
  // gravity is per-particle is what we'd want, but simplest is per-shader.
  // Compromise: use a single average gravity for the whole pool. Particles
  // with explicit zero gravity will show *some* drop, but visually
  // imperceptible at the 600-1100ms lifetimes we use.
  useEffect(() => {
    const g = pool.material.uniforms.uGravity;
    if (g) g.value.set(0, -1.0, 0);
  }, [pool]);

  // Emit fresh events into the pool. zustand `events` is monotonically
  // appended; `id` is strictly increasing, so we just track the highest.
  useEffect(() => {
    for (const ev of events) {
      if (ev.id <= lastEmittedId.current) continue;
      const cfg = CONFIGS[ev.kind];
      emitBurst(pool.buffers, cfg, ev, stateRef.current);
      lastEmittedId.current = ev.id;
    }
  }, [events, pool.buffers]);

  useFrame(() => {
    const seconds = (performance.now() - stateRef.current.origin) / 1000;
    const u = pool.material.uniforms.uTime;
    if (u) u.value = seconds;
  });

  // R3F auto-disposes geometry/material attached via JSX, but the pool here
  // is built imperatively in `useMemo` so three.js never registers it for
  // automatic teardown. Release GPU resources explicitly when the component
  // unmounts (e.g. Solo↔Ranked toggle, leaveMatch).
  useEffect(() => {
    return () => {
      pool.geometry.dispose();
      pool.material.dispose();
    };
  }, [pool]);

  // R3F's `<points>` element accepts attached geometry/material.
  return (
    <points geometry={pool.geometry} material={pool.material} frustumCulled={false} />
  );
}
