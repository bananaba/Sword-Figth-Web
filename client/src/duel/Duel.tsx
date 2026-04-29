import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Vignette,
} from "@react-three/postprocessing";
import type { ChromaticAberrationEffect, VignetteEffect } from "postprocessing";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { PLASMA_BLADE, type Vec2 } from "@vibejam/shared";
import { ARENA_RADIUS, Arena3D } from "./Arena3D";
import { Fighter, SHOULDER_Y } from "./Fighter";
import { ImpactRings } from "./ImpactRings";
import { useDuelLoop, type UseDuelLoop } from "./useDuelLoop";
import { useMouseInput } from "./useMouseInput";
import { DEFAULT_AI, initialAiState, tickAi, type AiState } from "./ai";
import { DuelHud } from "./DuelHud";
import { useFlash } from "./stores/useFlash";
import { useShake } from "./stores/useShake";
import { useTimeScale } from "./stores/useTimeScale";
import {
  TitleScreen,
  readStoredIdentity,
  type Identity,
} from "./TitleScreen";
import {
  DuelDebugPanel,
  DuelDebugScene,
  tuningFromWeapon,
  tuningToWeaponPatch,
  type DuelTuning,
} from "./DuelDebug";

const PLAYER_Z = -1.6;
const OPPONENT_Z = +1.6;
// Camera shake amplitude when trauma == 1.0. Tuned for over-the-shoulder
// 3-4 unit camera distance (`research_impact_feedback_20260429.md` §3.5.2).
const SHAKE_AMPLITUDE = 0.18;

// Opponent (AI) accent color. Magenta — high hue contrast vs. all five
// player presets, and avoids Sith-coded red
// (`research_character_weapon_customization_20260429.md` §3.3, §7.4).
const OPPONENT_ACCENT = "#e879f9";

// react-postprocessing's `forwardRef` types resolve to the *constructor*
// type rather than instance, so the ergonomic ref types we actually want
// don't line up. Use a loose ref type and read instance props at runtime.
type CaRef = React.MutableRefObject<ChromaticAberrationEffect | null>;
type VigRef = React.MutableRefObject<VignetteEffect | null>;

function GameStage({
  duel,
  debug,
  playerAccent,
  caRef,
  vigRef,
}: {
  duel: UseDuelLoop;
  debug: boolean;
  playerAccent: string;
  caRef: CaRef;
  vigRef: VigRef;
}) {
  const { camera } = useThree();
  const lastTime = useRef(performance.now());
  const aiRef = useRef<AiState>(initialAiState(performance.now()));

  const toWorld = useCallback(
    (screen: Vec2): Vec2 => {
      const ndc = new THREE.Vector2(
        (screen.x / window.innerWidth) * 2 - 1,
        -(screen.y / window.innerHeight) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      const playerZ = duel.playerVisual.current.worldZ;
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -playerZ);
      const target = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(plane, target);
      if (!hit) return { x: 0, y: SHOULDER_Y };
      return { x: target.x, y: target.y };
    },
    [camera, duel],
  );

  const input = useMouseInput({
    toWorld,
    minSliceDist: duel.weapon.current.minSliceReach,
    onAttack: duel.handlePlayerAttack,
  });

  const inputRef = useRef(input);
  inputRef.current = input;

  useFrame(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTime.current) / 1000);
    lastTime.current = now;

    // Advance time-scale envelope (hit-stop / KO slow-mo) before reading.
    useTimeScale.getState().tick(now);
    const timeScale = useTimeScale.getState().scale;

    const i = inputRef.current;
    duel.setPlayerGuard(i.guardActive, i.mouseWorld);
    duel.setPlayerBladeTip(i.mouseWorld);

    const fighters = duel.readFighters();
    const aiResult = tickAi(
      aiRef.current,
      fighters.opponent,
      fighters.player,
      duel.weapon.current,
      now,
      DEFAULT_AI,
    );
    aiRef.current = aiResult.newAi;
    duel.setOpponentGuard(aiResult.guard);
    if (aiResult.attack) {
      duel.handleOpponentAttack(aiResult.attack);
    }

    // Game-logic dt is scaled (physics + visual interp freeze during hit-stop).
    // VFX (rings, post FX) keep using raw dt so the freeze moment is visible.
    duel.tick(dt * timeScale, now);

    const playerZ = duel.playerVisual.current.worldZ;
    const targetCamZ = playerZ - 1.6;
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.22);

    // Eiserloh trauma model: square trauma so shake feels punchy then
    // tapers fast. Decay runs on real dt so shake doesn't get "stuck on"
    // during a hit-stop freeze.
    useShake.getState().decay(dt);
    const trauma = useShake.getState().trauma;
    const shake = trauma * trauma * SHAKE_AMPLITUDE;
    camera.position.x = (Math.random() - 0.5) * shake;
    camera.position.y = 2.05 + (Math.random() - 0.5) * shake;
    camera.lookAt(0, 1.1, camera.position.z + 3.7);

    // Post FX driven from trauma — BLOCK trauma 0.20 < 0.25 cutoff so
    // BLOCK doesn't pulse CA (matches research §2.1: BLOCK CA = none).
    // Vignette only blooms past 0.7 → KO-only trigger.
    const ca = caRef.current;
    if (ca) {
      const caOffset = Math.max(0, trauma - 0.25) * 0.011;
      ca.offset.set(caOffset, caOffset);
    }
    const vig = vigRef.current;
    if (vig) {
      vig.darkness = 0.4 + Math.max(0, trauma - 0.7) * 1.3;
    }

    // Flash overlay decays on its own envelope (independent of trauma).
    useFlash.getState().tick(now);
  });

  return (
    <>
      <Fighter state={duel.playerVisual} accentColor={playerAccent} />
      <Fighter state={duel.opponentVisual} accentColor={OPPONENT_ACCENT} />
      <ImpactRings />
      {debug && <DuelDebugScene player={duel.playerVisual} opponent={duel.opponentVisual} />}
    </>
  );
}

export function Duel() {
  const [identity, setIdentity] = useState<Identity | null>(() =>
    readStoredIdentity(),
  );
  if (!identity) return <TitleScreen onStart={setIdentity} />;
  return <DuelGame identity={identity} />;
}

/**
 * Full-screen white flash overlay. CSS layer above the R3F canvas so the
 * 1-3 frame impact flash doesn't need its own postprocessing pass. Reads
 * `useFlash` 100Hz to track decay; pointerEvents:none so it never eats
 * mouse input.
 */
function FullScreenFlash() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => (t + 1) % 1024), 16);
    return () => window.clearInterval(id);
  }, []);
  void tick;
  const amount = useFlash((s) => s.amount);
  if (amount <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "white",
        opacity: amount,
        pointerEvents: "none",
        zIndex: 40,
        mixBlendMode: "screen",
      }}
    />
  );
}

function DuelGame({ identity }: { identity: Identity }) {
  const duel = useDuelLoop({
    initialPlayerZ: PLAYER_Z,
    initialOpponentZ: OPPONENT_Z,
    arenaRadius: ARENA_RADIUS,
  });
  const caRef = useRef<ChromaticAberrationEffect | null>(null);
  const vigRef = useRef<VignetteEffect | null>(null);

  const [hudKey, setHudKey] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setHudKey((k) => (k + 1) % 1024), 100);
    return () => window.clearInterval(id);
  }, []);

  const [debug, setDebug] = useState(false);
  const [tuning, setTuning] = useState<DuelTuning>(() => tuningFromWeapon(PLASMA_BLADE));

  useEffect(() => {
    duel.updateWeapon(tuningToWeaponPatch(tuning));
  }, [tuning, duel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "d" || e.key === "D") {
        setDebug((d) => !d);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const resetTuning = useCallback(() => {
    setTuning(tuningFromWeapon(PLASMA_BLADE));
  }, []);

  const cameraInit = useMemo(
    () => ({ position: [0, 2.05, PLAYER_Z - 1.6] as [number, number, number] }),
    [],
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        userSelect: "none",
        background: "#0b1424",
      }}
    >
      <Canvas
        shadows
        camera={{ ...cameraInit, fov: 52, near: 0.1, far: 100 }}
        gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
      >
        <Arena3D />
        <GameStage
          duel={duel}
          debug={debug}
          playerAccent={identity.saberColor}
          caRef={caRef}
          vigRef={vigRef}
        />
        <EffectComposer multisampling={0}>
          <Bloom
            mipmapBlur
            luminanceThreshold={0.85}
            luminanceSmoothing={0.2}
            intensity={1.4}
            radius={0.7}
          />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <ChromaticAberration
            ref={caRef as any}
            offset={new THREE.Vector2(0, 0)}
            radialModulation={false}
            modulationOffset={0}
          />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Vignette ref={vigRef as any} darkness={0.4} offset={0.3} />
        </EffectComposer>
      </Canvas>

      <FullScreenFlash />

      <DuelHud
        hud={duel.hud}
        tickKey={hudKey}
        onResetMatch={duel.resetMatch}
        playerName={identity.name}
        playerAccent={identity.saberColor}
        opponentName="AI Bot"
        opponentAccent={OPPONENT_ACCENT}
      />
      {debug && (
        <DuelDebugPanel tuning={tuning} onChange={setTuning} onReset={resetTuning} />
      )}
    </div>
  );
}
