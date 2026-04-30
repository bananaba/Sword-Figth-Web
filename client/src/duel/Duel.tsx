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
import { BASIC_SWORD, type Vec2, type WeaponId } from "@vibejam/shared";
import { ARENA_RADIUS, Arena3D } from "./Arena3D";
import {
  playBgm,
  startArenaAmbient,
  stopArenaAmbient,
} from "./audio";
import { AudioToggle } from "./AudioToggle";
import {
  Fighter,
  GUARD_FORWARD_OFFSET,
  SHOULDER_Y,
  SWORD_FORWARD_OFFSET,
  type FighterVisualState,
} from "./Fighter";
import { ImpactRings } from "./ImpactRings";
import { SparkParticles } from "./SparkParticles";
import { useDuelLoop, type UseDuelLoop } from "./useDuelLoop";
import { useMouseInput } from "./useMouseInput";
import { DEFAULT_AI, initialAiState, tickAi, type AiState } from "./ai";
import { DuelHud } from "./DuelHud";
import { useFlash } from "./stores/useFlash";
import { useShake } from "./stores/useShake";
import { useTimeScale } from "./stores/useTimeScale";
import {
  CHARACTER_PRESETS,
  TitleScreen,
  type CharacterId,
  type CharacterPreset,
  type Identity,
} from "./TitleScreen";
import { useRankedMatch, type RankedSummary } from "./useRankedMatch";
import { LeaderboardView } from "./LeaderboardView";
import {
  DuelDebugPanel,
  DuelDebugScene,
  tuningFromWeapon,
  tuningToWeaponPatch,
  type DuelTuning,
} from "./DuelDebug";

const PLAYER_Z = -1.0;
const OPPONENT_Z = +1.0;
// Camera shake amplitude when trauma == 1.0. Tuned for over-the-shoulder
// 3-4 unit camera distance (`research_impact_feedback_20260429.md` §3.5.2).
const SHAKE_AMPLITUDE = 0.18;

/**
 * Solo opponent always takes the *other* character so the matchup reads
 * visually (X bot blue vs. Y bot pink). For ranked the opponent's character
 * comes from the server payload — but the worker currently only sends
 * `saberColor`, so ranked opponents pick a model whose saber color is closest
 * to the broadcast value.
 */
function pickOpponentCharacter(playerId: CharacterId): CharacterPreset {
  const other = CHARACTER_PRESETS.find((c) => c.id !== playerId);
  return other ?? CHARACTER_PRESETS[0]!;
}

function characterByColor(color: string | undefined): CharacterPreset {
  return (
    CHARACTER_PRESETS.find((c) => c.saberColor === color) ??
    CHARACTER_PRESETS[1]! /* fallback to ybot so the player still gets visual contrast */
  );
}

// react-postprocessing's `forwardRef` types resolve to the *constructor*
// type rather than instance, so the ergonomic ref types we actually want
// don't line up. Use a loose ref type and read instance props at runtime.
type CaRef = React.MutableRefObject<ChromaticAberrationEffect | null>;
type VigRef = React.MutableRefObject<VignetteEffect | null>;

function GameStage({
  duel,
  debug,
  playerAccent,
  opponentAccent,
  playerModelUrl,
  opponentModelUrl,
  playerWeaponId,
  opponentWeaponId,
  caRef,
  vigRef,
  aiEnabled,
}: {
  duel: UseDuelLoop;
  debug: boolean;
  playerAccent: string;
  opponentAccent: string;
  playerModelUrl: string;
  opponentModelUrl: string;
  playerWeaponId: WeaponId;
  /** Opponent weapon — solo: BASIC, ranked: from server hello (defaults to BASIC for old clients). */
  opponentWeaponId: WeaponId;
  caRef: CaRef;
  vigRef: VigRef;
  /** Solo runs the local AI tick; ranked mode disables it (server is authority). */
  aiEnabled: boolean;
}) {
  const { camera } = useThree();
  const lastTime = useRef(performance.now());
  const aiRef = useRef<AiState>(initialAiState(performance.now()));
  // Saber hum (synthesized) intentionally disabled — the saw + tremolo tone
  // clashed with the cyberpunk BGM bed. `audio/saberHum.ts` is kept on disk
  // so we can revisit with a smoother profile (sine-only, no LFO) later.

  const toWorld = useCallback(
    (screen: Vec2): Vec2 => {
      const ndc = new THREE.Vector2(
        (screen.x / window.innerWidth) * 2 - 1,
        -(screen.y / window.innerHeight) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      // Raycast onto the *blade plane* — same world-Z as the rendered sword
      // (player worldZ + SWORD_FORWARD_OFFSET). This way the cursor is the
      // blade tip on screen instead of being offset back to chest depth.
      const playerZ = duel.playerVisual.current.worldZ;
      const bladeZ = playerZ + SWORD_FORWARD_OFFSET;
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -bladeZ);
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

    if (aiEnabled) {
      const fighters = duel.readFighters();
      // AI runs on the BOT's own weapon, not the player's. Using
      // `duel.weapon.current` here would let a player's rapier bleed into the
      // bot's slice/thrust stats — solo-mode parity with ranked requires the
      // opponent's weapon to drive its own attacks.
      const aiResult = tickAi(
        aiRef.current,
        fighters.opponent,
        fighters.player,
        duel.opponentWeapon.current,
        now,
        DEFAULT_AI,
      );
      aiRef.current = aiResult.newAi;
      duel.setOpponentGuard(aiResult.guard);
      if (aiResult.attack) {
        duel.handleOpponentAttack(aiResult.attack);
      }
    }

    // Game-logic dt is scaled (physics + visual interp freeze during hit-stop).
    // VFX (rings, post FX) keep using raw dt so the freeze moment is visible.
    duel.tick(dt * timeScale, now);

    const playerZ = duel.playerVisual.current.worldZ;
    const targetCamZ = playerZ - 2.6;
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.22);

    // Eiserloh trauma model: square trauma so shake feels punchy then
    // tapers fast. Decay runs on real dt so shake doesn't get "stuck on"
    // during a hit-stop freeze.
    useShake.getState().decay(dt);
    const trauma = useShake.getState().trauma;
    const shake = trauma * trauma * SHAKE_AMPLITUDE;
    camera.position.x = (Math.random() - 0.5) * shake;
    camera.position.y = 2.4 + (Math.random() - 0.5) * shake;
    camera.lookAt(0, 1.1, camera.position.z + 4.5);

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
      <Fighter
        state={duel.playerVisual}
        modelUrl={playerModelUrl}
        accentColor={playerAccent}
        weaponId={playerWeaponId}
      />
      <Fighter
        state={duel.opponentVisual}
        modelUrl={opponentModelUrl}
        accentColor={opponentAccent}
        weaponId={opponentWeaponId}
      />
      <GuardDirectionIndicator state={duel.playerVisual} accentColor={playerAccent} />
      <GuardDirectionIndicator state={duel.opponentVisual} accentColor={opponentAccent} />
      <ImpactRings />
      <SparkParticles />
      {debug && <DuelDebugScene player={duel.playerVisual} opponent={duel.opponentVisual} />}
    </>
  );
}

function GuardDirectionIndicator({
  state,
  accentColor,
}: {
  state: React.MutableRefObject<FighterVisualState>;
  accentColor: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const fanMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const fanTexture = useMemo(() => createGuardFanTexture(), []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const s = state.current;
    const active = s.guard.active && !s.stunned && !s.attack;
    const targetOpacity = active ? 1 : 0;
    group.userData.opacity = THREE.MathUtils.damp(
      group.userData.opacity ?? 0,
      targetOpacity,
      18,
      delta,
    );
    const opacity = group.userData.opacity as number;
    group.visible = opacity > 0.01;
    if (!group.visible) return;

    const { x: aimX, y: aimY } = guardAimDirection(s);
    const guardWorldZ =
      s.worldZ + s.facing * (GUARD_FORWARD_OFFSET + 0.08);
    group.position.set(0, SHOULDER_Y, guardWorldZ);
    group.rotation.z = Math.atan2(aimY, aimX);

    if (fanMaterialRef.current) {
      fanMaterialRef.current.opacity = opacity;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh position={[0.42, 0, 0]} renderOrder={20}>
        <planeGeometry args={[0.84, 0.56]} />
        <meshBasicMaterial
          ref={fanMaterialRef}
          color={accentColor}
          map={fanTexture}
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function guardAimDirection(s: FighterVisualState): Vec2 {
  const guardDx = s.guard.tip.x - s.guard.grip.x;
  const guardDy = s.guard.tip.y - s.guard.grip.y;
  const guardLen = Math.hypot(guardDx, guardDy);
  if (s.guard.active && guardLen > 1e-5) {
    // `buildPerpendicularGuard` stores guardDir = rotate90(aim), so recover
    // aim with rotate-90. This keeps the UI tied to the authoritative guard
    // segment instead of the smoothed/predicted blade-tip stream.
    return { x: guardDy / guardLen, y: -guardDx / guardLen };
  }

  const aimDx = s.bladeTipBladePlane.x;
  const aimDy = s.bladeTipBladePlane.y - SHOULDER_Y;
  const aimLen = Math.hypot(aimDx, aimDy);
  return aimLen > 1e-5
    ? { x: aimDx / aimLen, y: aimDy / aimLen }
    : { x: 0, y: 1 };
}

function createGuardFanTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const w = canvas.width;
    const h = canvas.height;
    const centerY = h / 2;
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const t = x / (w - 1);
        const halfWidth = (h * 0.08) + Math.pow(t, 0.8) * (h * 0.42);
        const side = Math.abs(y - centerY) / halfWidth;
        if (side > 1) continue;
        const sideAlpha = Math.pow(1 - side, 1.15);
        const centerGuide = Math.exp(-Math.pow(side / 0.34, 2)) * 0.12;
        const distanceFade = 1 - Math.pow(t, 1.35) * 0.58;
        const alpha = Math.min(0.34, (sideAlpha * 0.3 + centerGuide) * distanceFade);
        const i = (y * w + x) * 4;
        image.data[i] = 255;
        image.data[i + 1] = 255;
        image.data[i + 2] = 255;
        image.data[i + 3] = Math.round(alpha * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function Duel() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  let inner: React.ReactNode;
  if (showLeaderboard) {
    inner = <LeaderboardView onBack={() => setShowLeaderboard(false)} />;
  } else if (!identity) {
    inner = (
      <TitleScreen
        onStart={setIdentity}
        onShowLeaderboard={() => setShowLeaderboard(true)}
      />
    );
  } else if (identity.mode === "ranked" || identity.mode === "private") {
    inner = (
      <RankedDuelGame
        identity={identity}
        onLeave={() => setIdentity(null)}
      />
    );
  } else {
    inner = <DuelGame identity={identity} onLeave={() => setIdentity(null)} />;
  }
  return (
    <>
      {inner}
      <AudioToggle />
    </>
  );
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

function DuelGame({
  identity,
  onLeave,
}: {
  identity: Identity;
  onLeave: () => void;
}) {
  useEffect(() => {
    playBgm("match");
    startArenaAmbient();
    return () => {
      stopArenaAmbient();
      playBgm("title");
    };
  }, []);

  const opponentCharacter = useMemo(
    () => pickOpponentCharacter(identity.characterId),
    [identity.characterId],
  );
  const playerCharacter = useMemo(
    () =>
      CHARACTER_PRESETS.find((c) => c.id === identity.characterId) ??
      CHARACTER_PRESETS[0]!,
    [identity.characterId],
  );

  const duel = useDuelLoop({
    initialPlayerZ: PLAYER_Z,
    initialOpponentZ: OPPONENT_Z,
    arenaRadius: ARENA_RADIUS,
    weaponId: identity.weaponId,
    // Bot defaults to "basic" so its stats match the rendered blade preset.
    // (`<Fighter weaponId="basic">` below.) Mirrors ranked's per-side authority.
    opponentWeaponId: "basic",
  });
  const caRef = useRef<ChromaticAberrationEffect | null>(null);
  const vigRef = useRef<VignetteEffect | null>(null);

  const [hudKey, setHudKey] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setHudKey((k) => (k + 1) % 1024), 100);
    return () => window.clearInterval(id);
  }, []);

  const [debug, setDebug] = useState(false);
  const [tuning, setTuning] = useState<DuelTuning>(() =>
    tuningFromWeapon(duel.weapon.current),
  );

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
    () => ({ position: [0, 2.4, PLAYER_Z - 2.6] as [number, number, number] }),
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
          playerAccent={playerCharacter.saberColor}
          opponentAccent={opponentCharacter.saberColor}
          playerModelUrl={playerCharacter.modelUrl}
          opponentModelUrl={opponentCharacter.modelUrl}
          playerWeaponId={identity.weaponId}
          opponentWeaponId="basic"
          caRef={caRef}
          vigRef={vigRef}
          aiEnabled={true}
        />
        <EffectComposer multisampling={0}>
          <Bloom
            mipmapBlur
            luminanceThreshold={0.95}
            luminanceSmoothing={0.08}
            intensity={0.85}
            radius={0.32}
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
        onLeave={onLeave}
        playerName={identity.name}
        playerAccent={playerCharacter.saberColor}
        opponentName="AI Bot"
        opponentAccent={opponentCharacter.saberColor}
      />
      {debug && (
        <DuelDebugPanel tuning={tuning} onChange={setTuning} onReset={resetTuning} />
      )}
    </div>
  );
}

function RankedDuelGame({
  identity,
  onLeave,
}: {
  identity: Identity;
  onLeave: () => void;
}) {
  // Title BGM stays on through queue/connecting/waiting; the in_match
  // useEffect below promotes to match BGM only once the duel actually starts.
  useEffect(() => {
    startArenaAmbient();
    return () => {
      stopArenaAmbient();
      playBgm("title");
    };
  }, []);

  const playerCharacter = useMemo(
    () =>
      CHARACTER_PRESETS.find((c) => c.id === identity.characterId) ??
      CHARACTER_PRESETS[0]!,
    [identity.characterId],
  );
  const ranked = useRankedMatch({
    initialPlayerZ: PLAYER_Z,
    initialOpponentZ: OPPONENT_Z,
    identity: {
      name: identity.name,
      saberColor: identity.saberColor,
      weaponId: identity.weaponId,
    },
    roomId: directRoomIdForIdentity(identity),
    recordResult: identity.mode === "ranked",
  });
  const caRef = useRef<ChromaticAberrationEffect | null>(null);
  const vigRef = useRef<VignetteEffect | null>(null);

  const [hudKey, setHudKey] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setHudKey((k) => (k + 1) % 1024), 100);
    return () => window.clearInterval(id);
  }, []);

  const [debug, setDebug] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "d" || e.key === "D") setDebug((d) => !d);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Promote to match BGM only when the duel actually starts. While in
  // queue/connecting/waitingForOpponent the player is staring at an overlay,
  // not the arena — keeping the title bed there avoids a "match started!"
  // false signal. match_over → stinger; useRankedMatch dispatches that.
  const rankedStatus = ranked.summary.status;
  useEffect(() => {
    if (rankedStatus === "in_match") {
      playBgm("match");
    }
  }, [rankedStatus]);

  const cameraInit = useMemo(
    () => ({ position: [0, 2.4, PLAYER_Z - 2.6] as [number, number, number] }),
    [],
  );

  const opponentName = ranked.summary.opponent?.name ?? "Opponent";
  const opponentCharacter = useMemo(
    () =>
      ranked.summary.opponent
        ? characterByColor(ranked.summary.opponent.saberColor)
        : pickOpponentCharacter(identity.characterId),
    [identity.characterId, ranked.summary.opponent],
  );
  const opponentAccent = opponentCharacter.saberColor;
  const opponentWeaponId: WeaponId = ranked.summary.opponent?.weaponId ?? "basic";
  const handleLeave = useCallback(() => {
    ranked.leaveMatch();
    onLeave();
  }, [ranked, onLeave]);

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
          duel={ranked}
          debug={debug}
          playerAccent={playerCharacter.saberColor}
          opponentAccent={opponentAccent}
          playerModelUrl={playerCharacter.modelUrl}
          opponentModelUrl={opponentCharacter.modelUrl}
          playerWeaponId={identity.weaponId}
          opponentWeaponId={opponentWeaponId}
          caRef={caRef}
          vigRef={vigRef}
          aiEnabled={false}
        />
        <EffectComposer multisampling={0}>
          <Bloom
            mipmapBlur
            luminanceThreshold={0.95}
            luminanceSmoothing={0.08}
            intensity={0.85}
            radius={0.32}
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
        hud={ranked.hud}
        tickKey={hudKey}
        onResetMatch={handleLeave}
        playerName={identity.name}
        playerAccent={playerCharacter.saberColor}
        opponentName={opponentName}
        opponentAccent={opponentAccent}
      />
      <RankedOverlay
        summary={ranked.summary}
        onCancel={handleLeave}
        mode={identity.mode}
        roomCode={identity.roomCode}
      />
    </div>
  );
}

function directRoomIdForIdentity(identity: Identity): string | undefined {
  if (identity.mode === "private" && identity.roomCode) {
    return `private-${identity.roomCode}`;
  }
  return undefined;
}

/**
 * Lobby/queue/connection/match-over overlay for ranked mode. Sits above the
 * canvas during transitional states; pointerEvents auto so the cancel
 * button is clickable. Once `status === "in_match"`, the overlay disappears
 * and the live HUD takes over.
 */
function RankedOverlay({
  summary,
  onCancel,
  mode,
  roomCode,
}: {
  summary: RankedSummary;
  onCancel: () => void;
  mode: Identity["mode"];
  roomCode?: string;
}) {
  if (summary.status === "in_match") return null;

  let title = "";
  let subtitle = "";
  let showCancel = true;
  let titleColor = "#7dd3fc";
  let titleGlow = "#38bdf8";
  let won: boolean | null = null;
  let ratings: {
    before: number;
    after: number;
    delta: number;
  } | null = null;

  switch (summary.status) {
    case "matchmaking":
      title = mode === "ranked" ? "FINDING DUELIST" : "OPENING ROOM";
      subtitle =
        mode === "ranked"
          ? "connecting to ranked queue…"
          : `private room ${roomCode ?? ""}`;
      break;
    case "queued":
      title = "IN QUEUE";
      subtitle =
        summary.queueSize > 1
          ? `${summary.queueSize} duelists waiting · widening rating range`
          : "waiting for an opponent in your rating range";
      break;
    case "connecting":
      title = mode === "ranked" ? "MATCH FOUND" : "ROOM READY";
      subtitle = "connecting to room…";
      break;
    case "waitingForOpponent":
      title = mode === "ranked" ? "READY" : roomCode ?? "READY";
      subtitle =
        mode === "ranked"
          ? "waiting for opponent to load…"
          : "share this code with your opponent";
      break;
    case "match_over": {
      ratings =
        summary.matchOver?.ratings?.player ??
        summary.matchOver?.ratings?.opponent ??
        null;
      won = summary.matchOver?.winner === "player";
      title = won ? "VICTORY" : "DEFEAT";
      titleColor = won ? "#fbbf24" : "#f87171";
      titleGlow = won ? "#f59e0b" : "#dc2626";
      subtitle = "";
      showCancel = true;
      break;
    }
    case "disconnected":
      title = "DISCONNECTED";
      subtitle = "connection lost";
      titleColor = "#f87171";
      titleGlow = "#dc2626";
      break;
    case "error":
      title = "ERROR";
      subtitle = summary.errorMessage ?? "could not connect";
      titleColor = "#f87171";
      titleGlow = "#dc2626";
      break;
  }

  const isMatchOver = summary.status === "match_over";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background: "rgba(5, 9, 19, 0.78)",
        backdropFilter: "blur(8px)",
        zIndex: 60,
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui",
      }}
    >
      <div
        style={{
          fontSize: isMatchOver ? 64 : 36,
          fontWeight: 900,
          letterSpacing: isMatchOver ? 12 : 8,
          color: titleColor,
          textShadow: `0 0 28px ${titleGlow}, 0 0 56px ${titleGlow}`,
          fontFamily: "ui-monospace, monospace",
          animation: isMatchOver ? "rankedPopIn 360ms ease-out both" : undefined,
        }}
      >
        {title}
      </div>
      {isMatchOver && ratings && (
        <>
          <div
            style={{
              marginTop: 4,
              fontSize: 56,
              fontWeight: 900,
              fontFamily: "ui-monospace, monospace",
              letterSpacing: 2,
              color:
                ratings.delta > 0
                  ? "#34d399"
                  : ratings.delta < 0
                    ? "#fb7185"
                    : "#cbd5e1",
              textShadow:
                ratings.delta > 0
                  ? "0 0 24px #10b981"
                  : ratings.delta < 0
                    ? "0 0 24px #e11d48"
                    : "0 0 12px #475569",
              animation: "rankedDeltaPop 460ms 180ms ease-out both",
            }}
          >
            {ratings.delta > 0 ? "+" : ""}
            {ratings.delta}
          </div>
          <div
            style={{
              fontSize: 14,
              color: "#94a3b8",
              letterSpacing: 2,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            rating&nbsp;{ratings.before}&nbsp;→&nbsp;{ratings.after}
          </div>
        </>
      )}
      {!isMatchOver && subtitle && (
        <div style={{ fontSize: 14, color: "#94a3b8", letterSpacing: 1 }}>
          {subtitle}
        </div>
      )}
      {showCancel && (
        <button
          onClick={onCancel}
          style={{
            marginTop: 18,
            padding: "10px 24px",
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 2,
            color: "#e2e8f0",
            background: "rgba(2,6,23,0.6)",
            border: "1px solid #475569",
            borderRadius: 8,
            cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          {isMatchOver ? "Back to Title" : "Cancel"}
        </button>
      )}
      <style>{`
        @keyframes rankedPopIn {
          0% { transform: scale(0.6); opacity: 0; }
          70% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes rankedDeltaPop {
          0% { transform: scale(0.4); opacity: 0; }
          60% { transform: scale(1.18); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
