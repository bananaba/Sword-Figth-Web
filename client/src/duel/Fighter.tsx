import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Trail } from "@react-three/drei";
import * as THREE from "three";
import type { AttackKind, GuardSnapshot, Vec2 } from "@vibejam/shared";

export const SHOULDER_Y = 1.15;
export const BODY_HEIGHT = 1.7;
export const BODY_HALF_WIDTH = 0.32;
export const BODY_DEPTH = 0.42;
const STUN_STAR_Y = BODY_HEIGHT + 0.65;
const STUN_STAR_RADIUS = 0.55;

// Cute Mii-style proportions (Phase 12). Visual only — `SHOULDER_Y` (sword
// grip pivot) and `BODY_HEIGHT` (resolver hitbox AABB) above are unchanged so
// combat math is untouched. The cute silhouette has to fit inside the same
// 1.7-tall hitbox the resolver assumes.
const HEAD_RADIUS = 0.30;
const HEAD_Y = 1.45;
const HAIR_Y = 1.56;
const HAIR_SCALE = new THREE.Vector3(1.06, 0.5, 1.06);
const EYE_RADIUS = 0.038;
const EYE_X = 0.10;
const EYE_Y = 1.46;
const EYE_Z = HEAD_RADIUS * 0.92;
const TORSO_Y = 0.86;
const TORSO_SCALE = new THREE.Vector3(0.30, 0.35, 0.24);
const SHOULDER_VIS_X = 0.24;
const SHOULDER_VIS_Y = 1.10;
const SHOULDER_BUMP_R = 0.10;
const ARM_RADIUS_TOP = 0.08;
const ARM_RADIUS_BOTTOM = 0.06;
const HAND_RADIUS = 0.09;
const LEG_X = 0.13;
const LEG_LEN = 0.5;
const LEG_Y = LEG_LEN / 2 + 0.05;
const LEG_RADIUS = 0.10;
const FOOT_Y = 0.05;
const FOOT_FORWARD_Z = 0.06;
const FOOT_RADIUS = 0.10;
const FOOT_SCALE = new THREE.Vector3(1.0, 0.5, 1.5);

const SKIN_COLOR = "#fed7aa";
const HAIR_COLOR = "#7c3a0f";
const PANTS_COLOR = "#1f2937";
const SHOE_COLOR = "#0f172a";
const EYE_COLOR = "#0a0a0a";

const starShape = (() => {
  const shape = new THREE.Shape();
  const outer = 0.2;
  const inner = 0.085;
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
   /**
   * Side identity color (hex). Drives **sword guard glow** (full-blade
   * emissive lerps 0 → 3.0 only while `s.guard.active`, dark otherwise) +
   * drei `<Trail>` color (always on, so swing motion stays readable as a
   * side-colored streak). Sword body is neutral black placeholder until
   * the post-jam sword redesign — keeping the body neutral means the
   * accent emissive flash is a high-contrast, all-angles tell when guard
   * activates. Character body stays neutral throughout
   * (`research_character_weapon_customization_20260429.md` §3.3).
   */
  accentColor: string;
}

/**
 * Derive a 3-stop palette from a single accent hex by sliding lightness in
 * HSL space. Lets Phase 9.5d hand a user-picked saber color straight through;
 * the resolver/UI never have to know the swing/recovery shades.
 */
interface BladePalette {
  core: string;    // idle / windUp glow
  bright: string;  // swing peak
  dim: string;     // recovery / cooldown
  guard: string;   // active guard segment
}

function deriveBladePalette(hex: string): BladePalette {
  const base = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const bright = new THREE.Color().setHSL(
    hsl.h,
    Math.min(1, hsl.s + 0.05),
    Math.min(0.88, hsl.l + 0.18),
  );
  const dim = new THREE.Color().setHSL(
    hsl.h,
    hsl.s,
    Math.max(0.28, hsl.l - 0.08),
  );
  const guard = new THREE.Color().setHSL(
    hsl.h,
    Math.min(1, hsl.s + 0.08),
    Math.max(0.42, hsl.l - 0.04),
  );
  return {
    core: "#" + base.getHexString(),
    bright: "#" + bright.getHexString(),
    dim: "#" + dim.getHexString(),
    guard: "#" + guard.getHexString(),
  };
}

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

function createPbr(color: string, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    transparent: true,
    opacity: ACTIVE_OPACITY,
  });
}

export function Fighter({ state, accentColor }: FighterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const swordRef = useRef<THREE.Group>(null);
  const stunGroupRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const handsRef = useRef<THREE.Mesh>(null);
  const palette = useMemo(() => deriveBladePalette(accentColor), [accentColor]);
  const trailColor = useMemo(() => new THREE.Color(palette.bright), [palette.bright]);

  // PBR materials for body parts. `shirtMat` carries the state-driven color
  // tint (stun → yellow, cooldown → grey); skin/hair/pants/shoes stay neutral.
  // No Fresnel rim on the body — the rim is reserved for the guard tell on
  // the sword (see `swordRimUniform` below).
  const skinMat = useMemo(() => createPbr(SKIN_COLOR, 0.7), []);
  const shirtMat = useMemo(() => createPbr("#64748b", 0.6), []);
  const hairMat = useMemo(() => createPbr(HAIR_COLOR, 0.85), []);
  const pantsMat = useMemo(() => createPbr(PANTS_COLOR, 0.8), []);
  const shoeMat = useMemo(() => createPbr(SHOE_COLOR, 0.7), []);
  const eyeMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: EYE_COLOR,
        transparent: true,
        opacity: ACTIVE_OPACITY,
        toneMapped: false,
      }),
    [],
  );
  // All body materials lerp opacity together — `transparentWhenIdle` fades
  // every part uniformly so the player's back stays see-through during idle.
  const allBodyMats = useMemo(
    () => [skinMat, shirtMat, hairMat, pantsMat, shoeMat, eyeMat],
    [skinMat, shirtMat, hairMat, pantsMat, shoeMat, eyeMat],
  );
  // Sword body is neutral medium grey (placeholder — sword redesign deferred
  // to post-jam). Black was too invisible in low-light parts of the arena;
  // white would blend with the bright water reflections. Mid-grey reads as
  // a clear silhouette against both. The guard tell drives the **whole
  // blade's emissive intensity** from 0 → high while `s.guard.active`, so
  // the sword lights up accent from any camera angle. (Earlier attempt used
  // a Fresnel rim shader, which is view-dependent — broad-face-on views had
  // dot≈1 → rim≈0, sword looked uncolored. Per-fragment emissive sidesteps
  // the angle dependence.)
  const swordMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#9ca3af",
        metalness: 0.7,
        roughness: 0.3,
        emissive: new THREE.Color(accentColor),
        emissiveIntensity: 0,
      }),
    [accentColor],
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
    for (const mat of allBodyMats) {
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, 0.18);
    }

    {
      const baseColor = new THREE.Color(s.bodyColor);
      if (s.stunned) baseColor.lerp(new THREE.Color("#facc15"), 0.55);
      else if (s.cooldown) baseColor.lerp(new THREE.Color("#475569"), 0.35);
      shirtMat.color.copy(baseColor);
    }

    if (swordRef.current) {
      const pose = currentSwordPose(s, now, palette);
      const fromLocal = bladePlaneToLocal(pose.fromBladePlane, s.facing);
      const toLocal = bladePlaneToLocal(pose.toBladePlane, s.facing);
      orientSegment(swordRef.current, fromLocal, toLocal);
      // Sword body stays neutral black across all phases; pose.color /
      // pose.emissive are intentionally unused (kept on the SwordPose type
      // for the post-jam sword redesign).

      // Guard tell: full-blade emissive lerps 0 ↔ 3.0 — the entire sword
      // lights up accent while guarding, dark otherwise. ~3 frames at 60fps
      // for a sharp on/off read; Bloom (threshold 0.85) catches the accent
      // glow from every angle.
      swordMaterial.emissiveIntensity = THREE.MathUtils.lerp(
        swordMaterial.emissiveIntensity,
        s.guard.active ? 3.0 : 0,
        0.22,
      );

      // Two-handed grip: both arms converge to the sword's back-end (`from`).
      // Hands park there as a single sphere — visually reads as clasped Mii
      // grip.
      if (handsRef.current) handsRef.current.position.copy(fromLocal);
      if (rightArmRef.current) {
        orientSegment(
          rightArmRef.current,
          new THREE.Vector3(SHOULDER_VIS_X, SHOULDER_VIS_Y, 0),
          fromLocal,
        );
      }
      if (leftArmRef.current) {
        orientSegment(
          leftArmRef.current,
          new THREE.Vector3(-SHOULDER_VIS_X, SHOULDER_VIS_Y, 0),
          fromLocal,
        );
      }
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
      <mesh position={[0, HEAD_Y, 0]} castShadow>
        <sphereGeometry args={[HEAD_RADIUS, 18, 14]} />
        <primitive object={skinMat} attach="material" />
      </mesh>
      <mesh position={[0, HAIR_Y, 0]} scale={HAIR_SCALE} castShadow>
        <sphereGeometry args={[HEAD_RADIUS, 18, 14]} />
        <primitive object={hairMat} attach="material" />
      </mesh>
      <mesh position={[EYE_X, EYE_Y, EYE_Z]}>
        <sphereGeometry args={[EYE_RADIUS, 10, 8]} />
        <primitive object={eyeMat} attach="material" />
      </mesh>
      <mesh position={[-EYE_X, EYE_Y, EYE_Z]}>
        <sphereGeometry args={[EYE_RADIUS, 10, 8]} />
        <primitive object={eyeMat} attach="material" />
      </mesh>
      <mesh position={[0, TORSO_Y, 0]} scale={TORSO_SCALE} castShadow>
        <sphereGeometry args={[1, 18, 14]} />
        <primitive object={shirtMat} attach="material" />
      </mesh>
      <mesh position={[SHOULDER_VIS_X, SHOULDER_VIS_Y, 0]} castShadow>
        <sphereGeometry args={[SHOULDER_BUMP_R, 12, 10]} />
        <primitive object={skinMat} attach="material" />
      </mesh>
      <mesh position={[-SHOULDER_VIS_X, SHOULDER_VIS_Y, 0]} castShadow>
        <sphereGeometry args={[SHOULDER_BUMP_R, 12, 10]} />
        <primitive object={skinMat} attach="material" />
      </mesh>
      {/* Arm groups stretched + rotated each frame from shoulder anchor to
          the shared sword grip. Cylinder default points along +Y; the
          orientSegment helper reuses the same code path the sword uses. */}
      <group ref={rightArmRef}>
        <mesh castShadow>
          <cylinderGeometry args={[ARM_RADIUS_BOTTOM, ARM_RADIUS_TOP, 1, 12]} />
          <primitive object={skinMat} attach="material" />
        </mesh>
      </group>
      <group ref={leftArmRef}>
        <mesh castShadow>
          <cylinderGeometry args={[ARM_RADIUS_BOTTOM, ARM_RADIUS_TOP, 1, 12]} />
          <primitive object={skinMat} attach="material" />
        </mesh>
      </group>
      <mesh ref={handsRef} castShadow>
        <sphereGeometry args={[HAND_RADIUS, 12, 10]} />
        <primitive object={skinMat} attach="material" />
      </mesh>
      <mesh position={[LEG_X, LEG_Y, 0]} castShadow>
        <cylinderGeometry args={[LEG_RADIUS, LEG_RADIUS, LEG_LEN, 12]} />
        <primitive object={pantsMat} attach="material" />
      </mesh>
      <mesh position={[-LEG_X, LEG_Y, 0]} castShadow>
        <cylinderGeometry args={[LEG_RADIUS, LEG_RADIUS, LEG_LEN, 12]} />
        <primitive object={pantsMat} attach="material" />
      </mesh>
      <mesh
        position={[LEG_X, FOOT_Y, FOOT_FORWARD_Z]}
        scale={FOOT_SCALE}
        castShadow
      >
        <sphereGeometry args={[FOOT_RADIUS, 12, 10]} />
        <primitive object={shoeMat} attach="material" />
      </mesh>
      <mesh
        position={[-LEG_X, FOOT_Y, FOOT_FORWARD_Z]}
        scale={FOOT_SCALE}
        castShadow
      >
        <sphereGeometry args={[FOOT_RADIUS, 12, 10]} />
        <primitive object={shoeMat} attach="material" />
      </mesh>
      <group ref={stunGroupRef} position={[0, STUN_STAR_Y, 0]} visible={false}>
        <mesh position={[STUN_STAR_RADIUS, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <shapeGeometry args={[starShape]} />
          <meshBasicMaterial
            color="#fde047"
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[-STUN_STAR_RADIUS, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <shapeGeometry args={[starShape]} />
          <meshBasicMaterial
            color="#fde047"
            side={THREE.DoubleSide}
            toneMapped={false}
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
          color={trailColor}
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
const BLADE_LENGTH = 1.2;

/**
 * Build a fixed-length blade segment whose **tip exactly tracks the cursor**
 * and whose extended grip line passes through the chest pivot. Geometrically:
 *
 *     direction = normalize(tip - chest)
 *     grip      = tip - direction * BLADE_LENGTH
 *
 * The (grip → tip) line therefore always passes through chest, no matter how
 * close or far the cursor is. When the cursor sits on the chest, fall back to
 * a forward-up pose so we still render a 1.2-unit blade.
 */
function swordFromTip(tip: Vec2): { grip: Vec2; tip: Vec2 } {
  const dx = tip.x - GRIP_2D.x;
  const dy = tip.y - GRIP_2D.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-5) {
    return {
      grip: { x: GRIP_2D.x, y: GRIP_2D.y - BLADE_LENGTH },
      tip: { x: GRIP_2D.x, y: GRIP_2D.y + 1e-4 },
    };
  }
  const inv = 1 / len;
  return {
    grip: { x: tip.x - dx * inv * BLADE_LENGTH, y: tip.y - dy * inv * BLADE_LENGTH },
    tip,
  };
}

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
function currentSwordPose(
  s: FighterVisualState,
  now: number,
  palette: BladePalette,
): SwordPose {
  const a = s.attack;
  if (a) {
    // Slice/idle keep a constant-length blade with grip extended back through
    // chest. Thrust is exempt — the blade visibly stretches forward to read
    // as a stab.
    const fixLength = a.kind === "slice";
    if (now < a.impactAt) {
      const t = clamp01((now - a.inputAt) / Math.max(1, a.impactAt - a.inputAt));
      const eased = easeInQuad(t);
      const rawTip = lerpVec(s.bladeTipBladePlane, a.start, eased);
      const seg = fixLength ? swordFromTip(rawTip) : { grip: GRIP_2D, tip: rawTip };
      return {
        fromBladePlane: seg.grip,
        toBladePlane: seg.tip,
        color: "#ffffff",
        emissive: palette.core,
        emissiveIntensity: 1.6,
      };
    }
    if (now < a.swingEndAt) {
      const t = clamp01((now - a.impactAt) / Math.max(1, a.swingEndAt - a.impactAt));
      const rawTip = lerpVec(a.start, a.end, t);
      const seg = fixLength ? swordFromTip(rawTip) : { grip: GRIP_2D, tip: rawTip };
      return {
        fromBladePlane: seg.grip,
        toBladePlane: seg.tip,
        color: "#ffffff",
        emissive: palette.bright,
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
      const rawTip = lerpVec(a.end, restingTip, eased);
      const seg = fixLength ? swordFromTip(rawTip) : { grip: GRIP_2D, tip: rawTip };
      return {
        fromBladePlane: seg.grip,
        toBladePlane: seg.tip,
        color: "#ffffff",
        emissive: palette.dim,
        emissiveIntensity: 1.2,
      };
    }
  }

  if (s.guard.active) {
    return {
      fromBladePlane: s.guard.grip,
      toBladePlane: s.guard.tip,
      color: "#ffffff",
      emissive: palette.guard,
      emissiveIntensity: 2.2,
    };
  }

  const idleSeg = swordFromTip(s.bladeTipBladePlane);
  return {
    fromBladePlane: idleSeg.grip,
    toBladePlane: idleSeg.tip,
    color: "#ffffff",
    emissive: palette.core,
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

export const SWORD_FORWARD_OFFSET = 1.0;

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
