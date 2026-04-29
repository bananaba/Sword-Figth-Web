import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Trail } from "@react-three/drei";
import * as THREE from "three";
import type { AttackKind, GuardSnapshot, Vec2 } from "@vibejam/shared";

export const SHOULDER_Y = 1.15;
export const BODY_HEIGHT = 1.7;
export const BODY_HALF_WIDTH = 0.32;
export const BODY_DEPTH = 0.42;
const STUN_STAR_Y = BODY_HEIGHT + 0.55;
const STUN_STAR_RADIUS = 0.42;

const starShape = (() => {
  const shape = new THREE.Shape();
  const outer = 0.12;
  const inner = 0.05;
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
})();

/**
 * Visual representation of a committed attack. Lives on FighterVisualState
 * so the resolver and the rendering layer share one timeline. Cleared by the
 * duel loop once `now > cooldownEndAt`.
 */
export interface AttackVisualState {
  inputAt: number;
  impactAt: number;
  swingEndAt: number;
  cooldownEndAt: number;
  start: Vec2;
  end: Vec2;
  kind: AttackKind;
}

export interface FighterVisualState {
  worldZ: number;
  facing: number;
  /** Idle blade tip in blade-plane coords (mouse cursor for player; resting pose for AI). */
  bladeTipBladePlane: Vec2;
  /** Resolver-driven guard segment (perpendicular, centred on mouse target). */
  guard: GuardSnapshot;
  /** In-flight attack (windUp → swing → recovery). null = idle. */
  attack: AttackVisualState | null;
  stunned: boolean;
  cooldown: boolean;
  /** True during post-hit grace window (resolver tradeImmuneUntil). */
  tradeImmune: boolean;
  /** Current speed magnitude — used so knockback motion stays opaque. */
  speed: number;
  bodyColor: string;
  /**
   * If true, the body fades to ~35% opacity while the fighter is fully idle
   * (no attack / stun / motion). Switch Sports does this to keep the
   * opponent visible behind the player's own back during over-the-shoulder
   * camera. Player gets true; AI / opponent stays opaque.
   */
  transparentWhenIdle: boolean;
}

interface FighterProps {
  state: React.MutableRefObject<FighterVisualState>;
}

const GRIP_LOCAL = new THREE.Vector3(0, SHOULDER_Y, 0);

/** Single segment representing the fighter's current sword pose. */
interface SwordPose {
  fromBladePlane: Vec2;
  toBladePlane: Vec2;
  color: string;
  emissive: string;
  emissiveIntensity: number;
}

const IDLE_OPACITY = 0.32;
const ACTIVE_OPACITY = 1.0;

export function Fighter({ state }: FighterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const swordRef = useRef<THREE.Group>(null);
  const stunGroupRef = useRef<THREE.Group>(null);

  const bodyMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        roughness: 0.6,
        transparent: true,
        opacity: ACTIVE_OPACITY,
      }),
    [],
  );
  const headMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#fef3c7",
        roughness: 0.7,
        transparent: true,
        opacity: ACTIVE_OPACITY,
      }),
    [],
  );
  const swordMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#e5e7eb",
        metalness: 0.7,
        roughness: 0.3,
        emissive: new THREE.Color("#000000"),
      }),
    [],
  );

  useFrame(() => {
    const s = state.current;
    const now = performance.now();

    if (groupRef.current) {
      groupRef.current.position.z = s.worldZ;
      groupRef.current.rotation.y = s.facing > 0 ? 0 : Math.PI;
    }

    const inImpactFrames = s.stunned || s.tradeImmune;
    const targetOpacity =
      s.transparentWhenIdle && !inImpactFrames ? IDLE_OPACITY : ACTIVE_OPACITY;
    bodyMaterial.opacity = THREE.MathUtils.lerp(
      bodyMaterial.opacity,
      targetOpacity,
      0.18,
    );
    headMaterial.opacity = bodyMaterial.opacity;

    if (bodyRef.current) {
      const baseColor = new THREE.Color(s.bodyColor);
      if (s.stunned) baseColor.lerp(new THREE.Color("#facc15"), 0.55);
      else if (s.cooldown) baseColor.lerp(new THREE.Color("#475569"), 0.35);
      bodyMaterial.color.copy(baseColor);
    }

    if (swordRef.current) {
      const pose = currentSwordPose(s, now);
      orientSegment(
        swordRef.current,
        bladePlaneToLocal(pose.fromBladePlane, s.facing),
        bladePlaneToLocal(pose.toBladePlane, s.facing),
      );
      swordMaterial.color.set(pose.color);
      swordMaterial.emissive.set(pose.emissive);
      swordMaterial.emissiveIntensity = pose.emissiveIntensity;
    }

    if (stunGroupRef.current) {
      stunGroupRef.current.visible = s.stunned;
      if (s.stunned) {
        const t = now * 0.005;
        stunGroupRef.current.rotation.y = t;
        stunGroupRef.current.position.y =
          STUN_STAR_Y + Math.sin(t * 1.6) * 0.04;
      }
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={bodyRef} position={[0, BODY_HEIGHT / 2, 0]} castShadow>
        <boxGeometry args={[BODY_HALF_WIDTH * 2, BODY_HEIGHT, BODY_DEPTH]} />
        <primitive object={bodyMaterial} attach="material" />
      </mesh>
      <mesh position={[0, BODY_HEIGHT + 0.15, 0]} castShadow>
        <sphereGeometry args={[0.18, 16, 16]} />
        <primitive object={headMaterial} attach="material" />
      </mesh>
      <group ref={stunGroupRef} position={[0, STUN_STAR_Y, 0]} visible={false}>
        <mesh position={[STUN_STAR_RADIUS, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <shapeGeometry args={[starShape]} />
          <meshStandardMaterial
            color="#facc15"
            emissive="#fde68a"
            emissiveIntensity={1.6}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[-STUN_STAR_RADIUS, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <shapeGeometry args={[starShape]} />
          <meshStandardMaterial
            color="#facc15"
            emissive="#fde68a"
            emissiveIntensity={1.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
      <group ref={swordRef}>
        <mesh castShadow>
          <boxGeometry args={[0.05, 1.0, 0.05]} />
          <primitive object={swordMaterial} attach="material" />
        </mesh>
        <Trail
          width={0.22}
          length={1.6}
          color={new THREE.Color("#7dd3fc")}
          attenuation={(t) => t * t}
          decay={3}
        >
          <mesh position={[0, 0.5, 0]} visible={false}>
            <sphereGeometry args={[0.01, 4, 4]} />
          </mesh>
        </Trail>
      </group>
    </group>
  );
}

const GRIP_2D: Vec2 = { x: 0, y: SHOULDER_Y };

/**
 * Resolves which segment to render this frame, prioritising:
 *   (1) in-flight attack (windUp → swing → recovery animation)
 *   (2) active guard (perpendicular segment centred on chest)
 *   (3) idle (grip → bladeTipBladePlane, follows mouse for the player)
 */
/**
 * Phase-based sword pose. The blade is always anchored at GRIP_2D — slice
 * vs. thrust look different purely because their committed `start` / `end`
 * positions differ:
 *
 *  - **slice**: start = drag start, end = drag end. Both at body height; blade
 *    pivots from grip and tip arcs across the body.
 *  - **thrust**: start = (chest + dir * 0.15) ready pose, end = (chest + dir
 *    * (bladeLength + reach)) extended pose. Blade visibly extends along
 *    the thrust direction — reads as a stab.
 */
function currentSwordPose(s: FighterVisualState, now: number): SwordPose {
  const a = s.attack;
  if (a) {
    if (now < a.impactAt) {
      const t = clamp01((now - a.inputAt) / Math.max(1, a.impactAt - a.inputAt));
      const eased = easeInQuad(t);
      const tip = lerpVec(s.bladeTipBladePlane, a.start, eased);
      return {
        fromBladePlane: GRIP_2D,
        toBladePlane: tip,
        color: "#dbeafe",
        emissive: "#38bdf8",
        emissiveIntensity: 1.6,
      };
    }
    if (now < a.swingEndAt) {
      const t = clamp01((now - a.impactAt) / Math.max(1, a.swingEndAt - a.impactAt));
      const tip = lerpVec(a.start, a.end, t);
      return {
        fromBladePlane: GRIP_2D,
        toBladePlane: tip,
        color: "#ffffff",
        emissive: "#7dd3fc",
        emissiveIntensity: 3.4,
      };
    }
    if (now < a.cooldownEndAt) {
      const t = clamp01(
        (now - a.swingEndAt) / Math.max(1, a.cooldownEndAt - a.swingEndAt),
      );
      const eased = easeOutQuad(t);
      const restingTip = s.guard.active
        ? s.guard.tip
        : s.bladeTipBladePlane;
      const tip = lerpVec(a.end, restingTip, eased);
      return {
        fromBladePlane: GRIP_2D,
        toBladePlane: tip,
        color: "#dbeafe",
        emissive: "#0ea5e9",
        emissiveIntensity: 1.2,
      };
    }
  }

  if (s.guard.active) {
    return {
      fromBladePlane: s.guard.grip,
      toBladePlane: s.guard.tip,
      color: "#dbeafe",
      emissive: "#3b82f6",
      emissiveIntensity: 2.2,
    };
  }

  return {
    fromBladePlane: GRIP_2D,
    toBladePlane: s.bladeTipBladePlane,
    color: "#e0f2fe",
    emissive: "#38bdf8",
    emissiveIntensity: 1.4,
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function easeInQuad(t: number): number {
  return t * t;
}
function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

const SWORD_FORWARD_OFFSET = 1.6;

function bladePlaneToLocal(point: Vec2, facing: number): THREE.Vector3 {
  return new THREE.Vector3(facing * point.x, point.y, SWORD_FORWARD_OFFSET);
}

function orientSegment(group: THREE.Group, from: THREE.Vector3, to: THREE.Vector3): void {
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const dir = to.clone().sub(from);
  const length = dir.length();
  if (length < 1e-5) {
    group.scale.set(0, 0, 0);
    return;
  }
  group.position.copy(mid);
  group.scale.set(1, length, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
  group.quaternion.copy(q);
}

void GRIP_LOCAL;
