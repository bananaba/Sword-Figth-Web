import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Trail, useFBX } from "@react-three/drei";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { AttackKind, GuardSnapshot, Vec2, WeaponId } from "@vibejam/shared";
import { ARENA_RADIUS } from "./Arena3D";

export const SHOULDER_Y = 1.15;
export const BODY_HEIGHT = 1.7;
export const BODY_HALF_WIDTH = 0.32;
export const BODY_DEPTH = 0.42;
const STUN_STAR_Y = BODY_HEIGHT + 0.65;
// hit 클립의 root motion / 자세 변화로 model이 fighter group 내에서 이동하면
// 별을 group local 고정 좌표에 두면 머리에서 떨어진다. head bone(있으면)을
// 매 프레임 추적하고 그 위 이 거리만큼 띄운다. STUN_STAR_Y는 head bone이
// 없을 때(legacy / 다른 모델)의 fallback.
const STUN_STAR_HEAD_OFFSET = 0.45;
const STUN_STAR_RADIUS = 0.55;
const MODEL_HEIGHT = BODY_HEIGHT;
const STUN_TINT = new THREE.Color("#facc15");
const COOLDOWN_TINT = new THREE.Color("#475569");
const IDLE_ANIM_URL = "/models/raw/anim_idle.fbx";
const SLASH_ANIM_URL = "/models/raw/anim_slash.fbx";
const THRUST_ANIM_URL = "/models/raw/anim_thrust.fbx";
// 가드는 별도 클립이 없다. idle 클립을 그대로 재생하면서 IK가 손 위치를
// `s.guard.grip`으로 끌어당기고, `currentSwordPose`가 perpendicular 가드
// segment를 반환해 검 각도가 자동으로 바뀐다 (Fighter.tsx useFrame idle 분기).
// hit는 두 종류로 분기될 예정이라 슬롯을 미리 분리해 둔다.
//  - hit_guard: 내 공격이 가드에 막혀 stun된 상태 (resolver의 attackerStun)
//  - hit_taken: 피격 reaction (별도 visual 윈도우, 클립 도착 시 추가)
// 새 클립이 들어올 때까지는 두 슬롯 모두 기존 anim_hit.fbx를 가리킨다.
const HIT_GUARD_ANIM_URL = "/models/raw/anim_hit.fbx";
const HIT_TAKEN_ANIM_URL = "/models/raw/anim_hit.fbx";
const DEATH_ANIM_URL = "/models/raw/anim_death.fbx";

// FBX 클립을 gameplay 윈도우에 맞춰 압축할 때 적용하는 timeScale 상한.
// 너무 큰 배속은 모션이 기괴하게 보이므로 4.0(=원본의 1/4 길이)에서 자른다.
// 그 이상이 필요하면 클립 자체를 더 짧게 다시 익스포트하는 게 정답.
const ATTACK_TIMESCALE_MAX = 4.0;
const ATTACK_TIMESCALE_MIN = 0.25;

// Ringout fall (Phase 12): when |worldZ| > ARENA_RADIUS the fighter is past
// the pedestal edge. useDuelLoop already detected ringout and the round is
// freezing for ~2200ms (`ROUND_OVER_DISPLAY_MS`) — but velX gets zeroed in
// non-fighting phases, so without explicit Y-axis gravity the fighter just
// hovers at y=0 (pedestal top) while the KO splash plays. Quadratic gravity
// with g=14 crosses the water surface (y=-0.4) by ~0.24s and bottoms out at
// y=-12 by ~1.3s — a clear "vanished into the water" read.
const FALL_GRAVITY = 14.0;
const FALL_MAX_Y = -12.0;
const IDLE_ARM_REACH = 0.46;
const AUTHORED_SWORD_GRIP_OFFSET = 0.06;

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
  /**
   * Stun의 출처. `stunned`가 true일 때만 의미 있음.
   *  - "guard": 내 공격이 상대 가드에 막혀 stun (resolver `attackerStun`)
   *  - "hit":   피격 reaction (현재 결정론 resolver는 hit/pierce 시 stunUntil = 0
   *             이라 visual-only 윈도우로 추후 도입 예정 — 슬롯만 미리 둠)
   *  - null:    stun 아님
   */
  stunSource: "guard" | "hit" | null;
  cooldown: boolean;
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
  modelUrl: string;
   /**
   * Side identity color (hex). Drives **sword guard glow** (full-blade
   * emissive lerps 0 → 3.0 only while `s.guard.active`, dark otherwise) +
   * drei `<Trail>` color (always on, so swing motion stays readable as a
   * side-colored streak). Sword body stays neutral so the accent emissive
   * flash is a high-contrast, all-angles tell when guard activates.
   * Character body stays neutral throughout
   * (`research_character_weapon_customization_20260429.md` §3.3).
   */
  accentColor: string;
  /**
   * Which sword silhouette to render — basic / charge / rapier. Composite
   * mesh built once per weapon (handle/guard/blade), then animated as a
   * single rigid unit attached to the right hand or idle IK grip pose.
   */
  weaponId: WeaponId;
}

/**
 * Style spec for the composite sword model. The blade is the only segment
 * that scales with `s.attack` length (thrust extends, slice/idle stay at
 * `bladeLength`); handle/crossguard/pommel sit at fixed sizes around the
 * grip pivot at swordRef y=0.
 */
interface SwordStyle {
  blade: {
    /** Width of the flat blade (X). */
    width: number;
    /** Thickness of the blade (Z, into the camera). Slim blades read as rapier-like. */
    thickness: number;
    /** Hue family for the blade body. Accent color drives emissive separately. */
    color: string;
    /** If set, an inner emissive core mesh runs the length of the blade (charge sword energy). */
    coreWidth?: number;
  };
  handle: {
    /** Length of the grip below y=0. Pommel sits at -length, crossguard at 0. */
    length: number;
    radius: number;
    color: string;
  };
  crossguard: {
    /** Total width of the bar (X). */
    width: number;
    /** Vertical thickness (Y). */
    height: number;
    /** Z thickness so it shows from the front. */
    depth: number;
    color: string;
  };
  pommel: {
    radius: number;
    color: string;
    /** "sphere" (default) renders an orb. "disc" renders a flat capstan — used
     *  on the rapier so its silhouette differs from the basic/charge orbs. */
    shape?: "sphere" | "disc";
    /** When true, the pommel uses the always-on accent emissive material —
     *  charge sword lights up the handle butt as an "energy reservoir". */
    emissive?: boolean;
  };
  /** Small decorative bead at each crossguard tip — used by the basic sword
   *  as a steel finial. Removed from the charge sword (the bar-tip-with-orb
   *  silhouette read as awkward in playtest). */
  guardCaps?: {
    radius: number;
  };
  /** Disc-shaped emissive collar sitting on top of the crossguard, around
   *  the blade base. Reads as an "energy intake" feature on the charge
   *  sword — bright accent feature without adding length to the cross-bar. */
  collar?: {
    outerRadius: number;
    thickness: number;
  };
  /** Torus-shaped basket / swept guard wrapping the upper handle. Used by the
   *  rapier so its silhouette reads as a fencing weapon at a glance. */
  basket?: {
    radius: number;
    tube: number;
  };
}

// Handle length is sized to fit *both* hands of the idle two-hand grip. The
// idle IK lays the right hand near the cross-guard end and the left hand
// near the pommel; the gap between them is roughly handle.length minus the
// padding constants in `useFrame`. Going below ~0.22 makes the bottom hand
// slip past the pommel onto thin air, which is what shipped in the first
// pass and read as "one hand on the blade".
const SWORD_STYLES: Record<WeaponId, SwordStyle> = {
  basic: {
    // Plain straight long-sword silhouette. Small steel beads on the
    // crossguard tips give the otherwise neutral profile a focal point so
    // it reads as "deliberately balanced", not "missing detail".
    blade: { width: 0.055, thickness: 0.014, color: "#cbd5e1" },
    handle: { length: 0.26, radius: 0.024, color: "#1e293b" },
    crossguard: { width: 0.22, height: 0.025, depth: 0.04, color: "#94a3b8" },
    pommel: { radius: 0.034, color: "#94a3b8" },
    guardCaps: { radius: 0.022 },
  },
  charge: {
    // Wider, heavier blade with a glowing inner core. The differentiator
    // is now *emissive bookends*: a glowing collar at the blade base
    // ("energy intake" feeding the core) and a glowing pommel orb at the
    // handle butt ("energy reservoir"). With the blade core itself, the
    // weapon has three accent-coloured glow points — clearly the
    // power-user silhouette without resorting to bar-tip orbs (which
    // read as "stick with balls" in playtest).
    blade: { width: 0.092, thickness: 0.022, color: "#475569", coreWidth: 0.034 },
    handle: { length: 0.30, radius: 0.030, color: "#0f172a" },
    crossguard: { width: 0.22, height: 0.05, depth: 0.075, color: "#cbd5e1" },
    pommel: { radius: 0.054, color: "#cbd5e1", emissive: true },
    collar: { outerRadius: 0.07, thickness: 0.028 },
  },
  rapier: {
    // Thin wand-like blade with a swept basket guard (torus around the
    // upper handle) and a flat capstan-style pommel. The basket is the
    // primary silhouette differentiator — at any zoom, the rapier reads as
    // a fencing weapon rather than a sword.
    blade: { width: 0.025, thickness: 0.01, color: "#e2e8f0" },
    handle: { length: 0.24, radius: 0.020, color: "#1e293b" },
    crossguard: { width: 0.16, height: 0.02, depth: 0.035, color: "#cbd5e1" },
    pommel: { radius: 0.038, color: "#cbd5e1", shape: "disc" },
    basket: { radius: 0.075, tube: 0.011 },
  },
};

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

type FighterMaterial = THREE.Material & {
  color?: THREE.Color;
  userData: {
    baseColor?: THREE.Color;
  };
};

type FighterAnimationName =
  | "idle"
  | "slash"
  | "thrust"
  | "hit_guard"
  | "hit_taken"
  | "death";
type AttackAnimationName = Extract<FighterAnimationName, "slash" | "thrust">;

interface FighterAnimationController {
  mixer: THREE.AnimationMixer;
  actions: Record<FighterAnimationName, THREE.AnimationAction>;
}

interface ArmRig {
  upper: THREE.Bone;
  forearm: THREE.Bone;
  hand: THREE.Bone;
}

interface FighterRig {
  leftArm: ArmRig | null;
  rightArm: ArmRig | null;
  rightHand: THREE.Bone | null;
  head: THREE.Bone | null;
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

export function Fighter({ state, modelUrl, accentColor, weaponId }: FighterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const swordRef = useRef<THREE.Group>(null);
  const bladeRef = useRef<THREE.Group>(null);
  const stunGroupRef = useRef<THREE.Group>(null);
  const currentAnimationRef = useRef<{ name: FighterAnimationName; token: string } | null>(
    null,
  );
  const attackAnimationHoldRef = useRef<{
    name: AttackAnimationName;
    token: string;
    until: number;
  } | null>(null);
  // Tracks the moment a fighter first crosses the arena edge so the fall
  // y(t) = -½ g t² is anchored to the ringout instant rather than the
  // useFrame epoch. Reset to null whenever the fighter is back inside.
  const fallStartRef = useRef<number | null>(null);
  const palette = useMemo(() => deriveBladePalette(accentColor), [accentColor]);
  const trailColor = useMemo(() => new THREE.Color(palette.bright), [palette.bright]);
  const fbx = useFBX(modelUrl);
  const idleFbx = useFBX(IDLE_ANIM_URL);
  const slashFbx = useFBX(SLASH_ANIM_URL);
  const thrustFbx = useFBX(THRUST_ANIM_URL);
  const hitGuardFbx = useFBX(HIT_GUARD_ANIM_URL);
  const hitTakenFbx = useFBX(HIT_TAKEN_ANIM_URL);
  const deathFbx = useFBX(DEATH_ANIM_URL);

  const { model, materials, rig } = useMemo(() => normalizeFighterModel(fbx), [fbx]);
  const animation = useMemo(
    () =>
      createFighterAnimationController(model, {
        idle: idleFbx.animations[0],
        slash: slashFbx.animations[0],
        thrust: thrustFbx.animations[0],
        hit_guard: hitGuardFbx.animations[0],
        hit_taken: hitTakenFbx.animations[0],
        death: deathFbx.animations[0],
      }),
    [deathFbx, hitGuardFbx, hitTakenFbx, idleFbx, model, slashFbx, thrustFbx],
  );

  useEffect(() => {
    currentAnimationRef.current = null;
    attackAnimationHoldRef.current = null;
    playFighterAnimation(animation, currentAnimationRef, "idle", "idle", undefined);
    return () => {
      animation.mixer.stopAllAction();
    };
  }, [animation]);

  const style = useMemo(() => SWORD_STYLES[weaponId], [weaponId]);

  // Blade body material — neutral colour drawn from the weapon style, with
  // accent emissive layered on. The guard tell lerps emissiveIntensity 0 →
  // 3.0 only while `s.guard.active`, so the whole blade lights up accent
  // from any camera angle (per-fragment emissive sidesteps the
  // view-dependence problem that bit the earlier Fresnel rim attempt).
  const bladeMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: style.blade.color,
        metalness: 0.75,
        roughness: 0.28,
        emissive: new THREE.Color(accentColor),
        emissiveIntensity: 0,
      }),
    [accentColor, style.blade.color],
  );

  // Charge sword's inner core glows constantly — the "stored energy" tell
  // for its huge counter knockback. The same emissive lerp is applied so
  // the guard tell still flashes the whole blade.
  const coreMaterial = useMemo(() => {
    if (!style.blade.coreWidth) return null;
    return new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: new THREE.Color(accentColor),
      emissiveIntensity: 1.6,
      toneMapped: false,
    });
  }, [accentColor, style.blade.coreWidth]);

  const handleMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: style.handle.color, roughness: 0.6 }),
    [style.handle.color],
  );
  const fittingMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: style.crossguard.color,
        metalness: 0.85,
        roughness: 0.32,
      }),
    [style.crossguard.color],
  );

  // Always-on accent material — used for the charge sword's emissive guard
  // orbs and any decorative jewel that should glow regardless of guard
  // state. Sits at intensity 1.0 so Bloom (threshold 0.85) catches it but
  // it doesn't drown out the blade's stronger guard flash.
  const accentMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: new THREE.Color(accentColor),
        emissiveIntensity: 1.0,
        metalness: 0.4,
        roughness: 0.3,
        toneMapped: false,
      }),
    [accentColor],
  );

  useFrame((_, delta) => {
    const s = state.current;
    const now = performance.now();
    const isOutside = Math.abs(s.worldZ) > ARENA_RADIUS;
    const requestedAnimation = desiredFighterAnimation(s, isOutside);
    const desiredAnimation = completeAttackAnimation(
      requestedAnimation,
      attackAnimationHoldRef,
      animation,
      s,
      now,
    );
    const windowMs = animationWindowMs(s, desiredAnimation);
    playFighterAnimation(
      animation,
      currentAnimationRef,
      desiredAnimation.name,
      desiredAnimation.token,
      windowMs,
    );
    animation.mixer.update(delta);
    model.updateMatrixWorld(true);

    if (groupRef.current) {
      groupRef.current.position.z = s.worldZ;
      groupRef.current.rotation.y = s.facing > 0 ? 0 : Math.PI;

      // Ringout fall: useDuelLoop already detects |posX| > ARENA_RADIUS and
      // freezes the round, but velX gets zeroed in the roundOver phase so
      // there's no built-in motion. Apply our own quadratic gravity from the
      // moment we cross the edge until y bottoms out (clamped) or the next
      // round resets posX inside.
      if (isOutside) {
        if (fallStartRef.current === null) fallStartRef.current = now;
        const t = (now - fallStartRef.current) / 1000;
        groupRef.current.position.y = Math.max(
          FALL_MAX_Y,
          -0.5 * FALL_GRAVITY * t * t,
        );
      } else {
        fallStartRef.current = null;
        groupRef.current.position.y = 0;
      }
      // We just mutated group.position/rotation; flush the matrices so any
      // localToWorld / worldToLocal calls below (used by the arm IK and the
      // post-IK guard sword anchor) see the fresh transform. Without this,
      // matrix updates only happen on R3F's pre-render pass — making this
      // frame's IK target one frame stale and the hand bone world position
      // we read after IK come from the previous frame's group pose.
      groupRef.current.updateMatrixWorld(true);
    }

    const visuallyIdle =
      desiredAnimation.name === "idle" && !s.guard.active && !s.stunned && s.speed < 0.5;
    const targetOpacity =
      s.transparentWhenIdle && visuallyIdle ? IDLE_OPACITY : ACTIVE_OPACITY;
    for (const mat of materials) {
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, targetOpacity, 0.18);
      if (mat.color) {
        mat.color.copy(mat.userData.baseColor ?? new THREE.Color("#ffffff"));
        if (s.stunned) mat.color.lerp(STUN_TINT, 0.35);
        else if (s.cooldown) mat.color.lerp(COOLDOWN_TINT, 0.18);
      }
    }

    if (swordRef.current) {
      const pose = currentSwordPose(s, now, palette);
      const isAuthoredAnimation = desiredAnimation.name !== "idle";
      let fromLocal = bladePlaneToLocal(pose.fromBladePlane, s.facing);
      let toLocal = bladePlaneToLocal(pose.toBladePlane, s.facing);

      if (desiredAnimation.name === "idle" && groupRef.current) {
        const bladeDir = toLocal.clone().sub(fromLocal).normalize();
        // Both hands sit *along the handle*, below the cross-guard at
        // swordRef y=0 (the handle mesh spans y=-style.handle.length..0).
        // Right (dominant) hand near the cross-guard end, left hand near
        // the pommel — `bladeDir` points grip→tip so we use *negative*
        // multipliers to walk down the handle.
        const handleLen = style.handle.length;
        const topOffset = -Math.max(0.025, handleLen * 0.12);
        const bottomOffset = -handleLen + Math.max(0.025, handleLen * 0.12);
        const rightHandLocal = fromLocal
          .clone()
          .add(bladeDir.clone().multiplyScalar(topOffset));
        const leftHandLocal = fromLocal
          .clone()
          .add(bladeDir.clone().multiplyScalar(bottomOffset));
        applyIdleArmIk(rig.leftArm, groupRef.current.localToWorld(leftHandLocal));
        applyIdleArmIk(rig.rightArm, groupRef.current.localToWorld(rightHandLocal));
        model.updateMatrixWorld(true);

        // Re-anchor the sword on the *actual* post-IK right hand position.
        // For idle aim where the IK reaches its target, this is a no-op
        // (handLocal == rightHandLocal). For the guard pose where the
        // resolver's segment grip can sit past arm reach, the IK stops
        // short and the hand ends up somewhere closer to the body — we
        // translate the sword onto that real hand position so the handle
        // actually ends up *in* the hand. The perpendicular block
        // direction (`bladeDir`) is preserved end-to-end, so resolver
        // angle detection is unchanged.
        if (rig.rightArm) {
          const handWorld = rig.rightArm.hand.getWorldPosition(new THREE.Vector3());
          const handLocal = groupRef.current.worldToLocal(handWorld);
          fromLocal = handLocal
            .clone()
            .sub(bladeDir.clone().multiplyScalar(topOffset));
          toLocal = fromLocal
            .clone()
            .add(bladeDir.clone().multiplyScalar(ACTIVE_BLADE_LENGTH));

          const finalLeftHandLocal = fromLocal
            .clone()
            .add(bladeDir.clone().multiplyScalar(bottomOffset));
          const sideGuard = s.guard.active && Math.abs(fromLocal.x) > BODY_HALF_WIDTH * 0.55;
          if (sideGuard) {
            finalLeftHandLocal.x = -BODY_HALF_WIDTH * 0.38;
            finalLeftHandLocal.y = THREE.MathUtils.clamp(
              fromLocal.y - 0.08,
              SHOULDER_Y - 0.22,
              SHOULDER_Y + 0.18,
            );
          }
          applyIdleArmIk(
            rig.leftArm,
            groupRef.current.localToWorld(finalLeftHandLocal),
          );
          const bladeDirWorld = bladeDir
            .clone()
            .applyQuaternion(groupRef.current.getWorldQuaternion(new THREE.Quaternion()))
            .normalize();
          alignHandGripAxisToWorldDirection(rig.rightArm, bladeDirWorld);
          if (!sideGuard) {
            alignHandGripAxisToWorldDirection(rig.leftArm, bladeDirWorld);
          }
          model.updateMatrixWorld(true);
        }
      } else if (isAuthoredAnimation && rig.rightHand && groupRef.current) {
        const handSword = authoredSwordSegmentFromHand(rig.rightHand, groupRef.current);
        fromLocal = handSword.fromLocal;
        toLocal = handSword.toLocal;
      }

      // Anchor the composite sword at the grip and orient toward the tip —
      // this lets the static handle/crossguard/pommel meshes sit at fixed
      // sizes around y=0 while the blade alone scales to the segment length.
      // (The earlier single-box version used midpoint+Y-scale, which would
      // stretch the crossguard during a thrust extension.)
      anchorSwordAtGrip(swordRef.current, fromLocal, toLocal);
      const segmentLength = fromLocal.distanceTo(toLocal);
      if (bladeRef.current) {
        bladeRef.current.scale.y = Math.max(0.001, segmentLength);
        bladeRef.current.position.y = segmentLength / 2;
      }

      // Guard tell: blade emissive lerps 0 ↔ 1.5. Bloom (threshold 0.85)
      // still catches the accent glow from every angle, but kept low
      // enough that the bloom halo no longer bleeds onto the
      // (non-emissive) handle / cross-guard / pommel — earlier 3.0 made
      // the whole sword silhouette read as glowing. Charge sword's
      // always-on core sits on top of this and brightens further when
      // guard activates so it still pulses, just within Bloom's safe
      // band.
      bladeMaterial.emissiveIntensity = THREE.MathUtils.lerp(
        bladeMaterial.emissiveIntensity,
        s.guard.active ? 1.5 : 0,
        0.22,
      );
      if (coreMaterial) {
        coreMaterial.emissiveIntensity = THREE.MathUtils.lerp(
          coreMaterial.emissiveIntensity,
          s.guard.active ? 2.4 : 1.0,
          0.22,
        );
      }
    }

    if (stunGroupRef.current && groupRef.current) {
      stunGroupRef.current.visible = s.stunned;
      if (s.stunned) {
        const t = now * 0.005;
        stunGroupRef.current.rotation.y = t;
        let baseY = STUN_STAR_Y;
        let baseX = 0;
        let baseZ = 0;
        // hit 클립의 자세/루트 모션으로 model이 그룹 내에서 이동해도 별이
        // 머리 위에 따라가도록 head bone의 world 위치를 fighter group local로
        // 변환해서 추적. head bone이 없으면 STUN_STAR_Y 정적 fallback.
        if (rig.head) {
          rig.head.updateWorldMatrix(true, false);
          const headWorld = rig.head.getWorldPosition(new THREE.Vector3());
          const headLocal = groupRef.current.worldToLocal(headWorld);
          baseX = headLocal.x;
          baseZ = headLocal.z;
          baseY = headLocal.y + STUN_STAR_HEAD_OFFSET;
        }
        stunGroupRef.current.position.x = baseX;
        stunGroupRef.current.position.z = baseZ;
        stunGroupRef.current.position.y = baseY + Math.sin(t * 1.6) * 0.04;
      }
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={model} />
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
        {/* Pommel — sits below the grip at the very base of the sword.
            Rapier uses a flat capstan disc; basic/charge use a sphere
            (the orb shape reads heavier, matching their broader silhouette).
            Charge sword's pommel is emissive — the "energy reservoir" that
            feeds the blade core via the upper collar. */}
        {style.pommel.shape === "disc" ? (
          <mesh
            position={[0, -style.handle.length - style.pommel.radius * 0.4, 0]}
            castShadow
            material={fittingMaterial}
          >
            <cylinderGeometry
              args={[style.pommel.radius, style.pommel.radius, style.pommel.radius * 0.7, 16]}
            />
          </mesh>
        ) : (
          <mesh
            position={[0, -style.handle.length, 0]}
            castShadow
            material={style.pommel.emissive ? accentMaterial : fittingMaterial}
          >
            <sphereGeometry args={[style.pommel.radius, 12, 8]} />
          </mesh>
        )}
        {/* Handle/grip — fixed cylinder between pommel and crossguard. */}
        <mesh
          position={[0, -style.handle.length / 2, 0]}
          castShadow
          material={handleMaterial}
        >
          <cylinderGeometry
            args={[style.handle.radius, style.handle.radius, style.handle.length, 14]}
          />
        </mesh>
        {/* Crossguard — perpendicular bar at y=0 (where the blade starts).
            Width runs along *Z* (the blade's broadside axis, toward the
            camera/opponent), thickness along *X* (the cutting-edge axis).
            This matches the blade's X/Z layout (`<boxGeometry args=[
            thickness, length, width]>` below) so the cross is square to
            the flat of the blade — a real sword has its quillons in the
            same plane as the broadside, not perpendicular to it. */}
        <mesh position={[0, 0, 0]} castShadow material={fittingMaterial}>
          <boxGeometry
            args={[style.crossguard.depth, style.crossguard.height, style.crossguard.width]}
          />
        </mesh>
        {/* Crossguard tip ornaments — small steel beads on the basic
            sword as a focal point on the otherwise plain hilt. Sit on the
            *Z* axis (the crossguard's width direction). */}
        {style.guardCaps && (
          <>
            <mesh
              position={[0, 0, style.crossguard.width / 2]}
              castShadow
              material={fittingMaterial}
            >
              <sphereGeometry args={[style.guardCaps.radius, 12, 8]} />
            </mesh>
            <mesh
              position={[0, 0, -style.crossguard.width / 2]}
              castShadow
              material={fittingMaterial}
            >
              <sphereGeometry args={[style.guardCaps.radius, 12, 8]} />
            </mesh>
          </>
        )}
        {/* Emissive collar — flat disc sitting flush above the cross-guard,
            wrapping the blade base. Reads as the "energy intake" port on
            the charge sword. Disc plane = X-Z (perpendicular to the
            blade's length axis Y), radius noticeably wider than the
            handle but narrower than the cross-guard so it sits *between*
            the two without competing with either. */}
        {style.collar && (
          <mesh
            position={[0, style.crossguard.height / 2 + style.collar.thickness / 2, 0]}
            castShadow
            material={accentMaterial}
          >
            <cylinderGeometry
              args={[
                style.collar.outerRadius,
                style.collar.outerRadius,
                style.collar.thickness,
                20,
              ]}
            />
          </mesh>
        )}
        {/* Basket / swept guard — torus wrapping the cross-guard so it
            reads as a fencing weapon at any zoom. Sits at y=0 (the
            crossguard plane) rather than mid-handle so the basket and
            crossguard share a hilt; ring axis = blade length (+Y), ring
            plane = X-Z (the broadside plane the crossguard now lives in).
            Used by the rapier. */}
        {style.basket && (
          <mesh
            position={[0, 0, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
            material={fittingMaterial}
          >
            <torusGeometry args={[style.basket.radius, style.basket.tube, 8, 24]} />
          </mesh>
        )}
        {/*
          Blade group — only this scales with the segment length. The
          mesh inside is a unit-tall flat box; bladeRef.scale.y stretches
          it to fit grip→tip while bladeRef.position.y centres it at
          length/2 so the bottom edge sits at the crossguard.
        */}
        <group ref={bladeRef}>
          <mesh castShadow material={bladeMaterial}>
            {/*
              Edge orientation: anchorSwordAtGrip rotates this group around
              local +Z so its +Y aligns with the segment. That means the
              instantaneous swing motion (perpendicular to the segment, in
              the X-Y blade plane) maps to the blade's local +X — and the
              opponent sits along the blade's local +Z. Putting the *thin*
              dimension on local X means the cutting edge leads the swing
              (canonical "swing with the blade, not the flat"); putting
              *width* on local Z faces the blade's broadside toward the
              opponent so the silhouette reads as a real sword profile from
              the over-the-shoulder camera, instead of a thin line.
            */}
            <boxGeometry args={[style.blade.thickness, 1.0, style.blade.width]} />
          </mesh>
          {/* Charge-sword inner core. Same X/Z layout as the outer blade
              so the energy seam runs along the cutting edge. */}
          {coreMaterial && style.blade.coreWidth && (
            <mesh material={coreMaterial}>
              <boxGeometry
                args={[style.blade.thickness * 1.4, 0.92, style.blade.coreWidth]}
              />
            </mesh>
          )}
          {/* Trail anchor sits at the blade tip (local y=0.5 inside the
              unit blade → world y=length once scaled). */}
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
    </group>
  );
}

useFBX.preload("/models/X Bot.fbx");
useFBX.preload("/models/Y Bot.fbx");
useFBX.preload(IDLE_ANIM_URL);
useFBX.preload(SLASH_ANIM_URL);
useFBX.preload(THRUST_ANIM_URL);
useFBX.preload(HIT_GUARD_ANIM_URL);
useFBX.preload(HIT_TAKEN_ANIM_URL);
useFBX.preload(DEATH_ANIM_URL);

function createFighterAnimationController(
  model: THREE.Group,
  clips: Record<FighterAnimationName, THREE.AnimationClip | undefined>,
): FighterAnimationController {
  const mixer = new THREE.AnimationMixer(model);
  const actions = Object.fromEntries(
    Object.entries(clips).map(([name, clip]) => {
      if (!clip) {
        throw new Error(`Missing fighter animation clip: ${name}`);
      }
      const action = mixer.clipAction(clip);
      action.enabled = true;
      // idle은 루프(가드 시에도 idle 위에 IK + 검 포즈만 덮어쓰는 방식이라
      // 별도 block 클립을 재생하지 않는다), 그 외(slash/thrust/hit_*/death)는
      // 1회 재생 후 마지막 포즈에 stop.
      if (name === "idle") {
        action.setLoop(THREE.LoopRepeat, Infinity);
      } else {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      return [name, action];
    }),
  ) as Record<FighterAnimationName, THREE.AnimationAction>;

  return { mixer, actions };
}

function desiredFighterAnimation(
  s: FighterVisualState,
  isOutside: boolean,
): { name: FighterAnimationName; token: string } {
  if (isOutside) return { name: "death", token: "death" };
  if (s.stunned) {
    // stunSource는 useDuelLoop / useRankedMatch가 매 tick 갱신한다. 현재는
    // resolver 구조상 stun이 발생하면 항상 "guard"지만, 피격 reaction
    // visual 윈도우가 추가되면 "hit" 가지가 hit_taken으로 자동 라우팅된다.
    const source = s.stunSource ?? "guard";
    return {
      name: source === "hit" ? "hit_taken" : "hit_guard",
      token: `stun:${source}`,
    };
  }
  if (s.attack) {
    return {
      name: s.attack.kind === "thrust" ? "thrust" : "slash",
      token: `attack:${s.attack.inputAt}`,
    };
  }
  // 가드는 별도 애니메이션 없이 idle 위에 검/손 포즈만 덮어쓴다 —
  // useFrame의 idle IK가 `currentSwordPose`(가드 시 perpendicular segment)를
  // 받아 grip 위치로 손을 끌어당긴다. 토큰을 `idle`로 통일하면 가드 토글 시
  // 새 fadeIn이 발생하지 않아 모션이 끊기지 않는다.
  return { name: "idle", token: "idle" };
}

function completeAttackAnimation(
  requested: { name: FighterAnimationName; token: string },
  holdRef: React.MutableRefObject<{
    name: AttackAnimationName;
    token: string;
    until: number;
  } | null>,
  controller: FighterAnimationController,
  s: FighterVisualState,
  now: number,
): { name: FighterAnimationName; token: string } {
  if (requested.name === "slash" || requested.name === "thrust") {
    if (
      holdRef.current?.name !== requested.name ||
      holdRef.current.token !== requested.token
    ) {
      // attack window를 hold until로 사용한다. timeScale이 클립을 이 윈도우에
      // 맞춰 압축하므로 클립 종료 시점과 attack 라이프사이클 종료가 정확히
      // 일치한다. attack ref가 도중에 사라진 케이스(이론상 cooldownEndAt
      // 이전엔 useDuelLoop이 클리어 안 함)는 native clip duration으로 폴백.
      const fallback =
        now + controller.actions[requested.name].getClip().duration * 1000;
      holdRef.current = {
        name: requested.name,
        token: requested.token,
        until: s.attack ? s.attack.cooldownEndAt : fallback,
      };
    }
    return requested;
  }

  // Ringout and hit reactions should interrupt immediately. Idle (guard 포함 —
  // guard는 idle 위 오버라이드)이 attack 클립 종료 전에 도착할 수 있으므로
  // visual attack을 마지막 포즈까지 살려둔다.
  if (
    requested.name === "idle" &&
    holdRef.current &&
    now < holdRef.current.until
  ) {
    return { name: holdRef.current.name, token: holdRef.current.token };
  }

  if (holdRef.current && now >= holdRef.current.until) {
    holdRef.current = null;
  }
  return requested;
}

/**
 * 현재 desired animation에 대해 클립을 압축할 gameplay 윈도우를 계산한다.
 * `undefined`를 반환하면 클립을 native 속도로 재생한다.
 *
 *  - slash / thrust: `s.attack.cooldownEndAt - inputAt` (전체 attack 라이프사이클)
 *  - 그 외: undefined (idle은 loop / 가드 오버라이드, hit/death는 일단 native — 새 클립이
 *    들어오고 윈도우가 정해지면 분기 추가)
 */
function animationWindowMs(
  s: FighterVisualState,
  desired: { name: FighterAnimationName; token: string },
): number | undefined {
  if (desired.name === "slash" || desired.name === "thrust") {
    if (s.attack) {
      return Math.max(1, s.attack.cooldownEndAt - s.attack.inputAt);
    }
  }
  return undefined;
}

/**
 * AnimationAction의 timeScale을 클립 길이 / 목표 윈도우 비율로 맞춘다.
 * 결과 timeScale은 `[ATTACK_TIMESCALE_MIN, ATTACK_TIMESCALE_MAX]`로 clamp.
 * 윈도우가 너무 짧아 클립을 4배 이상 빨리 돌려야 하는 경우 cap에서 잘리고,
 * 그러면 클립이 윈도우 안에 끝나지 못해 hold가 추가로 살짝 길어질 수 있다 —
 * 그 시점에는 클립 자체를 더 짧게 만드는 게 정답이라 cap을 의도적으로 둔다.
 */
function fitClipToWindow(
  action: THREE.AnimationAction,
  windowMs: number | undefined,
): void {
  if (windowMs === undefined) {
    action.timeScale = 1;
    return;
  }
  const clipMs = action.getClip().duration * 1000;
  const raw = clipMs / Math.max(1, windowMs);
  action.timeScale = THREE.MathUtils.clamp(
    raw,
    ATTACK_TIMESCALE_MIN,
    ATTACK_TIMESCALE_MAX,
  );
}

function playFighterAnimation(
  controller: FighterAnimationController,
  currentRef: React.MutableRefObject<{
    name: FighterAnimationName;
    token: string;
  } | null>,
  nextName: FighterAnimationName,
  nextToken: string,
  windowMs: number | undefined,
): void {
  const current = currentRef.current;
  if (current?.name === nextName && current.token === nextToken) return;

  const next = controller.actions[nextName];
  next.reset();
  fitClipToWindow(next, windowMs);
  next.fadeIn(0.12);
  next.play();

  if (current) {
    controller.actions[current.name].fadeOut(0.12);
  }
  currentRef.current = { name: nextName, token: nextToken };
}

function normalizeFighterModel(source: THREE.Group): {
  model: THREE.Group;
  materials: FighterMaterial[];
  rig: FighterRig;
} {
  const model = SkeletonUtils.clone(source) as THREE.Group;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = size.y > 1e-5 ? MODEL_HEIGHT / size.y : 1;
  const bottom = box.min.y;
  const materials: FighterMaterial[] = [];
  const seen = new Set<string>();

  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -bottom * scale, -center.z * scale);
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;

    const clonedMaterials = Array.isArray(child.material)
      ? child.material.map((material) => cloneFighterMaterial(material))
      : cloneFighterMaterial(child.material);
    child.material = clonedMaterials;

    const meshMaterials = Array.isArray(clonedMaterials)
      ? clonedMaterials
      : [clonedMaterials];
    for (const material of meshMaterials) {
      if (seen.has(material.uuid)) continue;
      seen.add(material.uuid);
      materials.push(material);
    }
  });

  return { model, materials, rig: findFighterRig(model) };
}

function cloneFighterMaterial(material: THREE.Material): FighterMaterial {
  const cloned = material.clone() as FighterMaterial;
  cloned.transparent = true;
  cloned.opacity = ACTIVE_OPACITY;
  cloned.depthWrite = true;
  if (cloned.color) cloned.userData.baseColor = cloned.color.clone();
  return cloned;
}

function findFighterRig(model: THREE.Group): FighterRig {
  const bone = (name: string) => model.getObjectByName(name) as THREE.Bone | undefined;
  const rightArm = makeArmRig(
    bone("mixamorigRightArm"),
    bone("mixamorigRightForeArm"),
    bone("mixamorigRightHand"),
  );
  const leftArm = makeArmRig(
    bone("mixamorigLeftArm"),
    bone("mixamorigLeftForeArm"),
    bone("mixamorigLeftHand"),
  );
  return {
    leftArm,
    rightArm,
    rightHand: rightArm?.hand ?? null,
    head: bone("mixamorigHead") ?? null,
  };
}

function makeArmRig(
  upper: THREE.Bone | undefined,
  forearm: THREE.Bone | undefined,
  hand: THREE.Bone | undefined,
): ArmRig | null {
  if (!upper || !forearm || !hand) return null;
  return { upper, forearm, hand };
}

function applyIdleArmIk(arm: ArmRig | null, targetWorld: THREE.Vector3): void {
  if (!arm) return;
  arm.upper.updateWorldMatrix(true, true);
  const shoulder = arm.upper.getWorldPosition(new THREE.Vector3());
  const elbow = arm.forearm.getWorldPosition(new THREE.Vector3());
  const wrist = arm.hand.getWorldPosition(new THREE.Vector3());
  const upperLen = Math.max(0.01, elbow.distanceTo(shoulder));
  const lowerLen = Math.max(0.01, wrist.distanceTo(elbow));
  const desired = solveTwoBoneElbow(shoulder, elbow, wrist, targetWorld, upperLen, lowerLen);

  alignBoneToWorldDirection(
    arm.upper,
    arm.forearm,
    desired.elbow.clone().sub(shoulder),
  );
  arm.upper.updateWorldMatrix(true, true);
  alignBoneToWorldDirection(
    arm.forearm,
    arm.hand,
    targetWorld.clone().sub(arm.forearm.getWorldPosition(new THREE.Vector3())),
  );
  arm.forearm.updateWorldMatrix(true, true);
}

function solveTwoBoneElbow(
  shoulder: THREE.Vector3,
  elbow: THREE.Vector3,
  wrist: THREE.Vector3,
  target: THREE.Vector3,
  upperLen: number,
  lowerLen: number,
): { elbow: THREE.Vector3 } {
  const toTarget = target.clone().sub(shoulder);
  const maxReach = upperLen + lowerLen - 1e-4;
  const dist = THREE.MathUtils.clamp(toTarget.length(), 1e-4, maxReach);
  const dir = toTarget.normalize();
  const currentWristDir = wrist.clone().sub(shoulder).normalize();
  let pole = elbow.clone().sub(shoulder).projectOnPlane(currentWristDir);
  if (pole.lengthSq() < 1e-5) pole = new THREE.Vector3(0, 1, 0).projectOnPlane(dir);
  if (pole.lengthSq() < 1e-5) pole = new THREE.Vector3(1, 0, 0).projectOnPlane(dir);
  pole.normalize();

  const along = (upperLen * upperLen - lowerLen * lowerLen + dist * dist) / (2 * dist);
  const height = Math.sqrt(Math.max(0, upperLen * upperLen - along * along));
  return {
    elbow: shoulder.clone().add(dir.multiplyScalar(along)).add(pole.multiplyScalar(height)),
  };
}

function alignBoneToWorldDirection(
  bone: THREE.Bone,
  child: THREE.Bone,
  desiredDirection: THREE.Vector3,
): void {
  if (desiredDirection.lengthSq() < 1e-5) return;
  bone.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);
  const boneWorld = bone.getWorldPosition(new THREE.Vector3());
  const childWorld = child.getWorldPosition(new THREE.Vector3());
  const currentDirection = childWorld.sub(boneWorld);
  if (currentDirection.lengthSq() < 1e-5) return;

  const delta = new THREE.Quaternion().setFromUnitVectors(
    currentDirection.normalize(),
    desiredDirection.normalize(),
  );
  const currentWorldQuat = bone.getWorldQuaternion(new THREE.Quaternion());
  const nextWorldQuat = delta.multiply(currentWorldQuat);
  const parentWorldQuat = bone.parent?.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(
    parentWorldQuat ? parentWorldQuat.invert().multiply(nextWorldQuat) : nextWorldQuat,
  );
}

function alignHandGripAxisToWorldDirection(
  arm: ArmRig | null,
  desiredDirection: THREE.Vector3,
): void {
  if (!arm || desiredDirection.lengthSq() < 1e-5) return;
  const hand = arm.hand;
  hand.updateWorldMatrix(true, false);
  const currentDirection = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()))
    .normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(
    currentDirection,
    desiredDirection.clone().normalize(),
  );
  const currentWorldQuat = hand.getWorldQuaternion(new THREE.Quaternion());
  const targetWorldQuat = delta.multiply(currentWorldQuat);
  const parentWorldQuat = hand.parent?.getWorldQuaternion(new THREE.Quaternion());
  const targetLocalQuat = parentWorldQuat
    ? parentWorldQuat.invert().multiply(targetWorldQuat)
    : targetWorldQuat;
  hand.quaternion.slerp(targetLocalQuat, 0.85);
}

function authoredSwordSegmentFromHand(
  hand: THREE.Bone,
  fighterGroup: THREE.Group,
): { fromLocal: THREE.Vector3; toLocal: THREE.Vector3 } {
  hand.updateWorldMatrix(true, false);
  fighterGroup.updateWorldMatrix(true, false);

  const handWorld = hand.getWorldPosition(new THREE.Vector3());
  const handWorldQuat = hand.getWorldQuaternion(new THREE.Quaternion());
  // Mixamo right-hand local +Y points through the fingers. For authored
  // weapon clips this is the grip axis; using it keeps slash/thrust
  // blade rotation tied to the actual hand animation instead of the mouse.
  const bladeDirWorld = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(handWorldQuat)
    .normalize();
  const bladeBaseWorld = handWorld
    .clone()
    .add(bladeDirWorld.clone().multiplyScalar(AUTHORED_SWORD_GRIP_OFFSET));
  const bladeTipWorld = bladeBaseWorld
    .clone()
    .add(bladeDirWorld.clone().multiplyScalar(ACTIVE_BLADE_LENGTH));

  return {
    fromLocal: fighterGroup.worldToLocal(bladeBaseWorld),
    toLocal: fighterGroup.worldToLocal(bladeTipWorld),
  };
}

const GRIP_2D: Vec2 = { x: 0, y: SHOULDER_Y };
const ACTIVE_BLADE_LENGTH = 1.2;

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
function swordFromTip(tip: Vec2, bladeLength = ACTIVE_BLADE_LENGTH): { grip: Vec2; tip: Vec2 } {
  const dx = tip.x - GRIP_2D.x;
  const dy = tip.y - GRIP_2D.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-5) {
    return {
      grip: { x: GRIP_2D.x, y: GRIP_2D.y - bladeLength },
      tip: { x: GRIP_2D.x, y: GRIP_2D.y + 1e-4 },
    };
  }
  const inv = 1 / len;
  return {
    grip: { x: tip.x - dx * inv * bladeLength, y: tip.y - dy * inv * bladeLength },
    tip,
  };
}

function idleSwordFromAim(aim: Vec2): { grip: Vec2; tip: Vec2 } {
  const dx = aim.x - GRIP_2D.x;
  const dy = aim.y - GRIP_2D.y;
  const len = Math.hypot(dx, dy);
  const dir = len > 1e-5 ? { x: dx / len, y: dy / len } : { x: 0, y: 1 };
  // Reach model: the hand/grip can move within an arm-radius circle and the
  // blade tip sits exactly ACTIVE_BLADE_LENGTH away from that grip. If the
  // cursor lies inside the annulus [blade-arm, blade+arm], place the tip
  // exactly on the cursor. Otherwise clamp the tip to the nearest point on the
  // same body→cursor ray.
  const tipReach = THREE.MathUtils.clamp(
    len,
    Math.max(0.05, ACTIVE_BLADE_LENGTH - IDLE_ARM_REACH),
    ACTIVE_BLADE_LENGTH + IDLE_ARM_REACH,
  );
  const gripReach = tipReach - ACTIVE_BLADE_LENGTH;
  const grip = {
    x: GRIP_2D.x + dir.x * gripReach,
    y: GRIP_2D.y + dir.y * gripReach,
  };
  return {
    grip,
    tip: {
      x: GRIP_2D.x + dir.x * tipReach,
      y: GRIP_2D.y + dir.y * tipReach,
    },
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
    // Put the blade's blocking surface toward the pointer, while keeping
    // the resolver-provided perpendicular direction. The position is visual
    // only; block rules use the direction (`tip - grip`).
    const MAX_GUARD_OFFSET = 0.45;
    const segDx = s.guard.tip.x - s.guard.grip.x;
    const segDy = s.guard.tip.y - s.guard.grip.y;
    const segLen = Math.hypot(segDx, segDy);
    const perpDirX = segLen > 1e-5 ? segDx / segLen : 1;
    const perpDirY = segLen > 1e-5 ? segDy / segLen : 0;

    const dx = s.bladeTipBladePlane.x - GRIP_2D.x;
    const dy = s.bladeTipBladePlane.y - GRIP_2D.y;
    const mouseDist = Math.hypot(dx, dy);
    const aimX = mouseDist > 1e-5 ? dx / mouseDist : 0;
    const aimY = mouseDist > 1e-5 ? dy / mouseDist : 1;
    const offset = Math.min(mouseDist, MAX_GUARD_OFFSET);
    const center = {
      x: GRIP_2D.x + aimX * offset,
      y: GRIP_2D.y + aimY * offset,
    };

    const half = ACTIVE_BLADE_LENGTH / 2;
    const endA = {
      x: center.x - perpDirX * half,
      y: center.y - perpDirY * half,
    };
    const endB = {
      x: center.x + perpDirX * half,
      y: center.y + perpDirY * half,
    };
    const aIsGrip = endA.y < endB.y || (endA.y === endB.y && endA.x <= endB.x);
    const grip = aIsGrip ? endA : endB;
    const tip = aIsGrip ? endB : endA;
    return {
      fromBladePlane: grip,
      toBladePlane: tip,
      color: "#ffffff",
      emissive: palette.guard,
      emissiveIntensity: 2.2,
    };
  }

  const idleSeg = idleSwordFromAim(s.bladeTipBladePlane);
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

export const SWORD_FORWARD_OFFSET = 0.35;

function bladePlaneToLocal(point: Vec2, facing: number): THREE.Vector3 {
  return new THREE.Vector3(facing * point.x, point.y, SWORD_FORWARD_OFFSET);
}

/**
 * Pin the composite sword at its **grip** (segment `from`) and orient local
 * +Y along the segment toward `to`. Crucially, the group itself is *not*
 * scaled — only the inner blade group stretches with segment length. This
 * keeps handle/crossguard/pommel meshes at fixed authored sizes (the
 * earlier midpoint+Y-scale approach distorted those parts during a thrust
 * extension where the segment grew to ~2.6 units).
 */
function anchorSwordAtGrip(
  group: THREE.Group,
  from: THREE.Vector3,
  to: THREE.Vector3,
): void {
  group.position.copy(from);
  group.scale.set(1, 1, 1);
  const dir = to.clone().sub(from);
  if (dir.lengthSq() < 1e-10) {
    group.quaternion.identity();
    return;
  }
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir.normalize());
  group.quaternion.copy(q);
}
