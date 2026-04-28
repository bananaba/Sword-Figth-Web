import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  useSwordInput,
  type PointerState,
} from "../hooks/useSwordInput";

const SWORD_LERP = 0.28;
const PLAYER_X = 0;
const DUMMY_X = 5;

type DummyPhase = "idle" | "telegraph" | "impact" | "recovery";

interface DummyState {
  phase: DummyPhase;
  attackAngle: number;
  phaseStartedAt: number;
}

interface Settings {
  toleranceDeg: number;
  telegraphMs: number;
  idleMs: number;
}

interface ScoreState {
  blocks: number;
  hits: number;
  streak: number;
  bestStreak: number;
}

interface FlashState {
  result: "block" | "hit" | null;
  at: number;
  position: THREE.Vector3;
}

const DEFAULT_SETTINGS: Settings = {
  toleranceDeg: 25,
  telegraphMs: 800,
  idleMs: 1500,
};

function blockCheck(
  playerAngle: number,
  attackAngle: number,
  toleranceDeg: number,
): boolean {
  const PI = Math.PI;
  const raw = ((((playerAngle - attackAngle) % PI) + PI) % PI);
  const lineAngle = Math.min(raw, PI - raw);
  const toleranceRad = (toleranceDeg * PI) / 180;
  return Math.abs(lineAngle - PI / 2) < toleranceRad;
}

function pickAttackAngle(): number {
  const angles = [
    Math.PI / 2,
    0,
    Math.PI,
    Math.PI / 4,
    (3 * Math.PI) / 4,
    -Math.PI / 6,
    Math.PI + Math.PI / 6,
  ];
  const idx = Math.floor(Math.random() * angles.length);
  return angles[idx] ?? Math.PI / 2;
}

function PlayerCharacter({
  stateRef,
}: {
  stateRef: React.MutableRefObject<PointerState>;
}) {
  const swordRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const sword = swordRef.current;
    if (!sword) return;
    const p = stateRef.current;
    if (!p.guardActive) {
      sword.rotation.z = THREE.MathUtils.lerp(
        sword.rotation.z,
        p.targetAngle,
        SWORD_LERP,
      );
    }
    sword.children.forEach((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.userData.isBlade) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.set(p.guardActive ? "#54a0ff" : "#e5e7eb");
        mat.emissive.set(p.guardActive ? "#1e40af" : "#000000");
        mat.emissiveIntensity = p.guardActive ? 0.6 : 0;
      }
    });
  });

  return (
    <group position={[PLAYER_X, 0, 0]}>
      <mesh>
        <circleGeometry args={[0.4, 32]} />
        <meshStandardMaterial color="#9ca3af" />
      </mesh>
      <group ref={swordRef}>
        <mesh position={[0.15, 0, 0]}>
          <boxGeometry args={[0.4, 0.5, 0.15]} />
          <meshStandardMaterial color="#5b3f2c" />
        </mesh>
        <mesh position={[1.45, 0, 0]} userData={{ isBlade: true }}>
          <boxGeometry args={[2.2, 0.16, 0.05]} />
          <meshStandardMaterial color="#e5e7eb" metalness={0.6} roughness={0.2} />
        </mesh>
        <mesh position={[2.7, 0, 0]} userData={{ isBlade: true }}>
          <coneGeometry args={[0.12, 0.3, 8]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
}

function Dummy({
  dummyRef,
}: {
  dummyRef: React.MutableRefObject<DummyState>;
}) {
  const swordRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const sword = swordRef.current;
    if (!sword) return;
    const d = dummyRef.current;
    sword.rotation.z = THREE.MathUtils.lerp(
      sword.rotation.z,
      d.attackAngle,
      d.phase === "telegraph" ? 0.22 : 0.08,
    );
    sword.children.forEach((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.userData.isBlade) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (d.phase === "telegraph") {
          mat.color.set("#f97316");
          mat.emissive.set("#ea580c");
          mat.emissiveIntensity = 0.85;
        } else if (d.phase === "impact") {
          mat.color.set("#ef4444");
          mat.emissive.set("#dc2626");
          mat.emissiveIntensity = 1;
        } else {
          mat.color.set("#cbd5e1");
          mat.emissive.set("#000000");
          mat.emissiveIntensity = 0;
        }
      }
    });
  });

  return (
    <group position={[DUMMY_X, 0, 0]}>
      <mesh>
        <circleGeometry args={[0.4, 32]} />
        <meshStandardMaterial color="#dc2626" />
      </mesh>
      <group ref={swordRef}>
        <mesh position={[0.15, 0, 0]}>
          <boxGeometry args={[0.4, 0.5, 0.15]} />
          <meshStandardMaterial color="#5b3f2c" />
        </mesh>
        <mesh position={[1.45, 0, 0]} userData={{ isBlade: true }}>
          <boxGeometry args={[2.2, 0.16, 0.05]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.2} />
        </mesh>
        <mesh position={[2.7, 0, 0]} userData={{ isBlade: true }}>
          <coneGeometry args={[0.12, 0.3, 8]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
}

function FlashEffect({
  flashRef,
}: {
  flashRef: React.MutableRefObject<FlashState>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const f = flashRef.current;
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!f.result) {
      mesh.scale.setScalar(0);
      return;
    }
    const elapsed = performance.now() - f.at;
    const duration = 600;
    if (elapsed > duration) {
      f.result = null;
      mesh.scale.setScalar(0);
      return;
    }
    const t = elapsed / duration;
    const scale = 0.4 + t * 3;
    const opacity = 1 - t;
    mesh.position.copy(f.position);
    mesh.scale.setScalar(scale);
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = opacity;
    mat.color.set(f.result === "block" ? "#3b82f6" : "#ef4444");
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0.5]}>
      <ringGeometry args={[0.5, 0.7, 32]} />
      <meshBasicMaterial
        color="#3b82f6"
        transparent
        opacity={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function Arena({
  stateRef,
  dummyRef,
  settingsRef,
  flashRef,
  onResult,
}: {
  stateRef: React.MutableRefObject<PointerState>;
  dummyRef: React.MutableRefObject<DummyState>;
  settingsRef: React.MutableRefObject<Settings>;
  flashRef: React.MutableRefObject<FlashState>;
  onResult: React.MutableRefObject<(r: "block" | "hit") => void>;
}) {
  useFrame(() => {
    const d = dummyRef.current;
    const s = settingsRef.current;
    const now = performance.now();
    const elapsed = now - d.phaseStartedAt;

    switch (d.phase) {
      case "idle":
        if (elapsed > s.idleMs) {
          d.phase = "telegraph";
          d.attackAngle = pickAttackAngle();
          d.phaseStartedAt = now;
        }
        break;
      case "telegraph":
        if (elapsed > s.telegraphMs) {
          d.phase = "impact";
          d.phaseStartedAt = now;
          const p = stateRef.current;
          const isBlock =
            p.guardActive &&
            blockCheck(p.targetAngle, d.attackAngle, s.toleranceDeg);
          const result: "block" | "hit" = isBlock ? "block" : "hit";
          flashRef.current = {
            result,
            at: now,
            position: new THREE.Vector3(PLAYER_X + 1.5, 0, 0.5),
          };
          onResult.current(result);
        }
        break;
      case "impact":
        if (elapsed > 200) {
          d.phase = "recovery";
          d.phaseStartedAt = now;
        }
        break;
      case "recovery":
        if (elapsed > 600) {
          d.phase = "idle";
          d.phaseStartedAt = now;
        }
        break;
    }
  });

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 4]} intensity={1.0} />
      <PlayerCharacter stateRef={stateRef} />
      <Dummy dummyRef={dummyRef} />
      <FlashEffect flashRef={flashRef} />
    </>
  );
}

function modeButtonStyle(
  enabled: boolean,
  accent = "#54a0ff",
): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 8,
    border: `1px solid ${accent}`,
    background: enabled ? `${accent}33` : "rgba(255,255,255,0.05)",
    color: enabled ? "white" : "#9ca3af",
    fontSize: 13,
    fontWeight: 600,
    cursor: enabled ? "pointer" : "not-allowed",
    pointerEvents: "auto",
  };
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <span style={{ color: "#9ca3af" }}>{label}</span>
        <span style={{ color: "white", fontVariantNumeric: "tabular-nums" }}>
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#54a0ff" }}
      />
    </div>
  );
}

export function ChambaraArena() {
  const input = useSwordInput();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [score, setScore] = useState<ScoreState>({
    blocks: 0,
    hits: 0,
    streak: 0,
    bestStreak: 0,
  });

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const onResultRef = useRef<(r: "block" | "hit") => void>(() => {});
  useEffect(() => {
    onResultRef.current = (result) => {
      setScore((prev) => {
        const isBlock = result === "block";
        const newStreak = isBlock ? prev.streak + 1 : 0;
        return {
          blocks: prev.blocks + (isBlock ? 1 : 0),
          hits: prev.hits + (isBlock ? 0 : 1),
          streak: newStreak,
          bestStreak: Math.max(prev.bestStreak, newStreak),
        };
      });
    };
  }, []);

  const dummyRef = useRef<DummyState>({
    phase: "idle",
    attackAngle: Math.PI / 2,
    phaseStartedAt: performance.now(),
  });

  const flashRef = useRef<FlashState>({
    result: null,
    at: 0,
    position: new THREE.Vector3(),
  });

  const updateSetting = <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const resetScore = () => {
    setScore({ blocks: 0, hits: 0, streak: 0, bestStreak: 0 });
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#1f2937",
        touchAction: "none",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      <Canvas
        orthographic
        camera={{ zoom: 75, position: [DUMMY_X / 2, 0, 10] }}
        gl={{ antialias: true }}
      >
        <Arena
          stateRef={input.stateRef}
          dummyRef={dummyRef}
          settingsRef={settingsRef}
          flashRef={flashRef}
          onResult={onResultRef}
        />
      </Canvas>

      <div
        style={{
          position: "absolute",
          left: 16,
          top: 16,
          padding: 14,
          background: "rgba(0,0,0,0.7)",
          color: "white",
          borderRadius: 10,
          fontSize: 13,
          minWidth: 220,
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            fontWeight: 700,
            marginBottom: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          Chambara Training
          <button
            onClick={resetScore}
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.05)",
              color: "white",
              cursor: "pointer",
            }}
          >
            reset
          </button>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto auto",
            gap: "4px 12px",
          }}
        >
          <span style={{ color: "#9ca3af" }}>Blocks</span>
          <span
            style={{
              color: "#3b82f6",
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {score.blocks}
          </span>
          <span style={{ color: "#9ca3af" }}>Hits</span>
          <span
            style={{
              color: "#ef4444",
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {score.hits}
          </span>
          <span style={{ color: "#9ca3af" }}>Streak</span>
          <span
            style={{
              color: "#fbbf24",
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {score.streak}
          </span>
          <span style={{ color: "#9ca3af" }}>Best</span>
          <span
            style={{
              color: "#fbbf24",
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {score.bestStreak}
          </span>
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: "#9ca3af",
            lineHeight: 1.4,
          }}
        >
          Block when blades ≈ perpendicular at impact (red flash → impact moment).
          {input.mode === "gyro"
            ? " Tilt phone for sword · tap+hold to guard."
            : input.onTouchDevice
            ? " Drag for sword · 2nd finger to guard."
            : " Mouse for sword · click+hold to guard."}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 16,
          bottom: 16,
          padding: 12,
          background: "rgba(0,0,0,0.7)",
          color: "white",
          borderRadius: 10,
          fontSize: 12,
          minWidth: 280,
          maxWidth: 340,
        }}
      >
        <SliderRow
          label="Tolerance (block window)"
          value={settings.toleranceDeg}
          min={5}
          max={45}
          step={1}
          unit="°"
          onChange={(v) => updateSetting("toleranceDeg", v)}
        />
        <SliderRow
          label="Telegraph (warning time)"
          value={settings.telegraphMs}
          min={300}
          max={1500}
          step={50}
          unit="ms"
          onChange={(v) => updateSetting("telegraphMs", v)}
        />
        <SliderRow
          label="Idle (between attacks)"
          value={settings.idleMs}
          min={500}
          max={3000}
          step={100}
          unit="ms"
          onChange={(v) => updateSetting("idleMs", v)}
        />
      </div>

      <div
        style={{
          position: "absolute",
          right: 16,
          top: 16,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          alignItems: "flex-end",
        }}
      >
        {input.mode === "touch" && input.onGyroDevice && (
          <button
            onClick={input.enableGyro}
            disabled={input.permStatus === "checking"}
            style={modeButtonStyle(input.permStatus !== "checking")}
          >
            {input.permStatus === "checking" ? "Requesting…" : "📱 Use phone tilt"}
          </button>
        )}
        {input.mode === "gyro" && (
          <>
            <button onClick={input.switchToTouch} style={modeButtonStyle(true)}>
              🖱 Switch to touch
            </button>
            <button
              onClick={input.recenter}
              style={modeButtonStyle(true, "#ff5470")}
            >
              🎯 Recenter
            </button>
          </>
        )}
        {input.permStatus === "denied" && (
          <div
            style={{
              background: "rgba(239,68,68,0.2)",
              color: "#fecaca",
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: 12,
              border: "1px solid rgba(239,68,68,0.4)",
              maxWidth: 220,
            }}
          >
            Gyro permission denied. iOS requires HTTPS.
          </div>
        )}
      </div>
    </div>
  );
}
