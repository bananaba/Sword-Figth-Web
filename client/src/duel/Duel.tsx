import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { BASIC_SWORD, type Vec2 } from "@vibejam/shared";
import { ARENA_RADIUS, Arena3D } from "./Arena3D";
import { Fighter, SHOULDER_Y } from "./Fighter";
import { useDuelLoop, type UseDuelLoop } from "./useDuelLoop";
import { useMouseInput } from "./useMouseInput";
import { DEFAULT_AI, initialAiState, tickAi, type AiState } from "./ai";
import { DuelHud } from "./DuelHud";
import {
  DuelDebugPanel,
  DuelDebugScene,
  tuningFromWeapon,
  tuningToWeaponPatch,
  type DuelTuning,
} from "./DuelDebug";

const PLAYER_Z = -1.6;
const OPPONENT_Z = +1.6;

function GameStage({ duel, debug }: { duel: UseDuelLoop; debug: boolean }) {
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
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const target = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(plane, target);
      if (!hit) return { x: 0, y: SHOULDER_Y };
      return { x: target.x, y: target.y };
    },
    [camera],
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
  });

  return (
    <>
      <Fighter state={duel.playerVisual} />
      <Fighter state={duel.opponentVisual} />
      {debug && <DuelDebugScene player={duel.playerVisual} opponent={duel.opponentVisual} />}
    </>
  );
}

export function Duel() {
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
  const [tuning, setTuning] = useState<DuelTuning>(() => tuningFromWeapon(BASIC_SWORD));

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
    setTuning(tuningFromWeapon(BASIC_SWORD));
  }, []);

  const cameraInit = useMemo(
    () => ({ position: [0.6, 1.95, PLAYER_Z - 1.5] as [number, number, number] }),
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
        onCreated={({ camera }) => {
          camera.lookAt(0, 1.0, 0.4);
        }}
      >
        <Arena3D />
        <GameStage duel={duel} debug={debug} />
      </Canvas>

      <DuelHud hud={duel.hud} tickKey={hudKey} onResetMatch={duel.resetMatch} />
      {debug && (
        <DuelDebugPanel tuning={tuning} onChange={setTuning} onReset={resetTuning} />
      )}
    </div>
  );
}
