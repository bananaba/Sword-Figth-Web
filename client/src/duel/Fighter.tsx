import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Trail, useFBX } from "@react-three/drei";
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { AttackKind, GuardSnapshot, Vec2 } from "@vibejam/shared";
import { ARENA_RADIUS } from "./Arena3D";

export const SHOULDER_Y = 1.15;
export const BODY_HEIGHT = 1.7;
export const BODY_HALF_WIDTH = 0.32;
export const BODY_DEPTH = 0.42;
const STUN_STAR_Y = BODY_HEIGHT + 0.65;
const STUN_STAR_RADIUS = 0.55;
const MODEL_HEIGHT = BODY_HEIGHT;
const STUN_TINT = new THREE.Color("#facc15");
const COOLDOWN_TINT = new THREE.Color("#475569");
const IDLE_ANIM_URL = "/models/raw/anim_idle.fbx";
const SLASH_ANIM_URL = "/models/raw/anim_slash.fbx";
const THRUST_ANIM_URL = "/models/raw/anim_thrust.fbx";
const BLOCK_ANIM_URL = "/models/raw/anim_block.fbx";
const HIT_ANIM_URL = "/models/raw/anim_hit.fbx";
const DEATH_ANIM_URL = "/models/raw/anim_death.fbx";

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
const IDLE_HANDLE_SPACING = 0.16;

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

type FighterMaterial = THREE.Material & {
  color?: THREE.Color;
  userData: {
    baseColor?: THREE.Color;
  };
};

type FighterAnimationName = "idle" | "slash" | "thrust" | "block" | "hit" | "death";

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

export function Fighter({ state, modelUrl, accentColor }: FighterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const swordRef = useRef<THREE.Group>(null);
  const stunGroupRef = useRef<THREE.Group>(null);
  const currentAnimationRef = useRef<{ name: FighterAnimationName; token: string } | null>(
    null,
  );
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
  const blockFbx = useFBX(BLOCK_ANIM_URL);
  const hitFbx = useFBX(HIT_ANIM_URL);
  const deathFbx = useFBX(DEATH_ANIM_URL);

  const { model, materials, rig } = useMemo(() => normalizeFighterModel(fbx), [fbx]);
  const animation = useMemo(
    () =>
      createFighterAnimationController(model, {
        idle: idleFbx.animations[0],
        slash: slashFbx.animations[0],
        thrust: thrustFbx.animations[0],
        block: blockFbx.animations[0],
        hit: hitFbx.animations[0],
        death: deathFbx.animations[0],
      }),
    [blockFbx, deathFbx, hitFbx, idleFbx, model, slashFbx, thrustFbx],
  );

  useEffect(() => {
    currentAnimationRef.current = null;
    playFighterAnimation(animation, currentAnimationRef, "idle", "idle");
    return () => {
      animation.mixer.stopAllAction();
    };
  }, [animation]);

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

  useFrame((_, delta) => {
    const s = state.current;
    const now = performance.now();
    const isOutside = Math.abs(s.worldZ) > ARENA_RADIUS;
    const desiredAnimation = desiredFighterAnimation(s, isOutside);
    playFighterAnimation(
      animation,
      currentAnimationRef,
      desiredAnimation.name,
      desiredAnimation.token,
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
    }

    const visuallyIdle =
      !s.attack && !s.guard.active && !s.stunned && s.speed < 0.5;
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
        const leftHandLocal = fromLocal.clone();
        const rightHandLocal = fromLocal
          .clone()
          .add(bladeDir.multiplyScalar(IDLE_HANDLE_SPACING));
        applyIdleArmIk(rig.leftArm, groupRef.current.localToWorld(leftHandLocal));
        applyIdleArmIk(rig.rightArm, groupRef.current.localToWorld(rightHandLocal));
        model.updateMatrixWorld(true);
      } else if (isAuthoredAnimation && rig.rightHand && groupRef.current) {
        const handWorld = rig.rightHand.getWorldPosition(new THREE.Vector3());
        fromLocal = groupRef.current.worldToLocal(handWorld.clone());
        const direction = toLocal.clone().sub(bladePlaneToLocal(pose.fromBladePlane, s.facing));
        if (direction.lengthSq() < 1e-5) direction.set(0, 1, 0);
        const length = Math.max(0.2, direction.length());
        toLocal = fromLocal.clone().add(direction.normalize().multiplyScalar(length));
      }

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

useFBX.preload("/models/X Bot.fbx");
useFBX.preload("/models/Y Bot.fbx");
useFBX.preload(IDLE_ANIM_URL);
useFBX.preload(SLASH_ANIM_URL);
useFBX.preload(THRUST_ANIM_URL);
useFBX.preload(BLOCK_ANIM_URL);
useFBX.preload(HIT_ANIM_URL);
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
      if (name === "idle" || name === "block") {
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
  if (s.stunned) return { name: "hit", token: "hit" };
  if (s.attack) {
    return {
      name: s.attack.kind === "thrust" ? "thrust" : "slash",
      token: `attack:${s.attack.inputAt}`,
    };
  }
  if (s.guard.active) return { name: "block", token: "block" };
  return { name: "idle", token: "idle" };
}

function playFighterAnimation(
  controller: FighterAnimationController,
  currentRef: React.MutableRefObject<{
    name: FighterAnimationName;
    token: string;
  } | null>,
  nextName: FighterAnimationName,
  nextToken: string,
): void {
  const current = currentRef.current;
  if (current?.name === nextName && current.token === nextToken) return;

  const next = controller.actions[nextName];
  next.reset();
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
    return {
      fromBladePlane: s.guard.grip,
      toBladePlane: s.guard.tip,
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
