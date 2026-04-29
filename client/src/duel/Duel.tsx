import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
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
const SHAKE_LIFE_MS = 220;

// Opponent (AI) accent color. Magenta — high hue contrast vs. all five
// player presets, and avoids Sith-coded red
// (`research_character_weapon_customization_20260429.md` §3.3, §7.4).
const OPPONENT_ACCENT = "#e879f9";

function GameStage({
  duel,
  debug,
  playerAccent,
}: {
  duel: UseDuelLoop;
  debug: boolean;
  playerAccent: string;
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

    duel.tick(dt, now);

    const playerZ = duel.playerVisual.current.worldZ;
    const targetCamZ = playerZ - 1.6;
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.22);

    // Camera shake — driven by recent impact events.
    let shake = 0;
    for (const e of duel.impactEvents.current) {
      const dtMs = now - e.at;
      if (dtMs < 0 || dtMs > SHAKE_LIFE_MS) continue;
      const power =
        e.kind === "pierce" ? 0.13 : e.kind === "hit" ? 0.10 : e.kind === "block" ? 0.05 : 0;
      const fade = 1 - dtMs / SHAKE_LIFE_MS;
      const intensity = power * fade * fade;
      if (intensity > shake) shake = intensity;
    }
    camera.position.x = (Math.random() - 0.5) * shake;
    camera.position.y = 2.05 + (Math.random() - 0.5) * shake;
    camera.lookAt(0, 1.1, camera.position.z + 3.7);
  });

  return (
    <>
      <Fighter state={duel.playerVisual} accentColor={playerAccent} />
      <Fighter state={duel.opponentVisual} accentColor={OPPONENT_ACCENT} />
      <ImpactRings eventsRef={duel.impactEvents} />
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

function DuelGame({ identity }: { identity: Identity }) {
  const duel = useDuelLoop({
    initialPlayerZ: PLAYER_Z,
    initialOpponentZ: OPPONENT_Z,
    arenaRadius: ARENA_RADIUS,
  });

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
        <GameStage duel={duel} debug={debug} playerAccent={identity.saberColor} />
        <EffectComposer multisampling={0}>
          <Bloom
            mipmapBlur
            luminanceThreshold={0.85}
            luminanceSmoothing={0.2}
            intensity={1.4}
            radius={0.7}
          />
        </EffectComposer>
      </Canvas>

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
