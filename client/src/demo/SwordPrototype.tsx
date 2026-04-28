import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const SWORD_LERP = 0.28;
const SWING_VELOCITY_THRESHOLD = 8;
const ACCEL_SWING_THRESHOLD = 18;

type InputMode = "touch" | "gyro";
type GyroPermStatus = "idle" | "checking" | "granted" | "denied" | "unsupported";

interface PointerState {
  targetAngle: number;
  guardActive: boolean;
  motionSpikeAt: number;
}

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

function hasGyroSupport(): boolean {
  if (typeof window === "undefined") return false;
  return "DeviceOrientationEvent" in window;
}

async function requestGyroPermission(): Promise<GyroPermStatus> {
  const evt = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<string>;
  };
  if (typeof evt.requestPermission === "function") {
    try {
      const result = await evt.requestPermission();
      return result === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }
  return "granted";
}

function Scene({
  state,
  onState,
}: {
  state: React.MutableRefObject<PointerState>;
  onState: (s: { guard: boolean; tipVelocity: number; swing: boolean }) => void;
}) {
  const swordRef = useRef<THREE.Group>(null);
  const lastTipWorld = useRef(new THREE.Vector3(2.5, 0, 0));
  const tipWorld = useRef(new THREE.Vector3());

  useFrame((_state, dt) => {
    const sword = swordRef.current;
    if (!sword) return;

    const p = state.current;
    const guard = p.guardActive;

    if (!guard) {
      sword.rotation.z = THREE.MathUtils.lerp(
        sword.rotation.z,
        p.targetAngle,
        SWORD_LERP,
      );
    }

    const tipLocal = new THREE.Vector3(2.7, 0, 0);
    tipWorld.current.copy(tipLocal).applyEuler(sword.rotation);
    const v = tipWorld.current.distanceTo(lastTipWorld.current) / Math.max(dt, 0.001);
    lastTipWorld.current.copy(tipWorld.current);

    const recentSpike = performance.now() - p.motionSpikeAt < 250;
    const swing = !guard && (v > SWING_VELOCITY_THRESHOLD || recentSpike);

    onState({ guard, tipVelocity: v, swing });

    sword.children.forEach((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.userData.isBlade) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.set(guard ? "#54a0ff" : swing ? "#fff176" : "#e5e7eb");
        mat.emissive.set(guard ? "#1e40af" : swing ? "#fbc02d" : "#000000");
        mat.emissiveIntensity = guard ? 0.5 : swing ? 0.7 : 0.0;
      }
    });
  });

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 5, 4]} intensity={1.0} />
      <mesh>
        <circleGeometry args={[0.5, 32]} />
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

export function SwordPrototype() {
  const [mode, setMode] = useState<InputMode>("touch");
  const [permStatus, setPermStatus] = useState<GyroPermStatus>("idle");
  const [hud, setHud] = useState({ guard: false, tipVelocity: 0, swing: false });

  const stateRef = useRef<PointerState>({
    targetAngle: Math.PI / 2,
    guardActive: false,
    motionSpikeAt: 0,
  });

  const activePointers = useRef<Set<number>>(new Set());
  const primaryPointerId = useRef<number | null>(null);
  const gyroOffsetRef = useRef<{ gamma: number; beta: number } | null>(null);
  const gyroLatestRef = useRef<{ gamma: number; beta: number }>({
    gamma: 0,
    beta: 0,
  });

  useEffect(() => {
    const onTouch = isTouchDevice();

    const recomputeGuard = () => {
      let g = false;
      if (mode === "gyro") {
        g = activePointers.current.size > 0;
      } else if (onTouch) {
        g = activePointers.current.size >= 2;
      } else {
        g = activePointers.current.size > 0;
      }
      stateRef.current.guardActive = g;
    };

    const updateAngleFromPointer = (clientX: number, clientY: number) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = clientX - cx;
      const dy = -(clientY - cy);
      stateRef.current.targetAngle = Math.atan2(dy, dx);
    };

    const onMove = (e: PointerEvent) => {
      if (mode !== "touch") return;
      if (!onTouch || e.pointerId === primaryPointerId.current) {
        updateAngleFromPointer(e.clientX, e.clientY);
      }
    };
    const onDown = (e: PointerEvent) => {
      activePointers.current.add(e.pointerId);
      if (primaryPointerId.current === null) {
        primaryPointerId.current = e.pointerId;
      }
      if (
        mode === "touch" &&
        (!onTouch || e.pointerId === primaryPointerId.current)
      ) {
        updateAngleFromPointer(e.clientX, e.clientY);
      }
      recomputeGuard();
    };
    const onUp = (e: PointerEvent) => {
      activePointers.current.delete(e.pointerId);
      if (primaryPointerId.current === e.pointerId) {
        const next = activePointers.current.values().next().value;
        primaryPointerId.current = next ?? null;
      }
      recomputeGuard();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "gyro") return;

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      const gamma = e.gamma;
      const beta = e.beta;
      gyroLatestRef.current = { gamma, beta };
      if (gyroOffsetRef.current === null) {
        gyroOffsetRef.current = { gamma, beta };
      }
      const offsetGamma = gamma - gyroOffsetRef.current.gamma;
      stateRef.current.targetAngle = Math.PI / 2 - (offsetGamma * Math.PI) / 180;
    };

    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.acceleration;
      if (!a) return;
      const ax = a.x ?? 0;
      const ay = a.y ?? 0;
      const az = a.z ?? 0;
      const mag = Math.sqrt(ax * ax + ay * ay + az * az);
      if (mag > ACCEL_SWING_THRESHOLD) {
        stateRef.current.motionSpikeAt = performance.now();
      }
    };

    window.addEventListener("deviceorientation", onOrientation);
    window.addEventListener("devicemotion", onMotion);
    return () => {
      window.removeEventListener("deviceorientation", onOrientation);
      window.removeEventListener("devicemotion", onMotion);
    };
  }, [mode]);

  const handleEnableGyro = async () => {
    setPermStatus("checking");
    const result = await requestGyroPermission();
    setPermStatus(result);
    if (result === "granted") {
      gyroOffsetRef.current = null;
      setMode("gyro");
    }
  };

  const handleRecenter = () => {
    gyroOffsetRef.current = { ...gyroLatestRef.current };
  };

  const handleSwitchToTouch = () => {
    setMode("touch");
    gyroOffsetRef.current = null;
  };

  const onTouchDevice = isTouchDevice();
  const onGyroDevice = hasGyroSupport();
  const guardHelp =
    mode === "gyro"
      ? "Tap-and-hold screen → guard"
      : onTouchDevice
      ? "Second finger anywhere → guard (1st finger = sword)"
      : "Click-and-hold mouse → guard";

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
        camera={{ zoom: 90, position: [0, 0, 10] }}
        gl={{ antialias: true }}
      >
        <Scene state={stateRef} onState={setHud} />
      </Canvas>

      <div
        style={{
          position: "absolute",
          left: 16,
          top: 16,
          padding: "12px 14px",
          background: "rgba(0,0,0,0.65)",
          color: "white",
          borderRadius: 10,
          fontSize: 13,
          lineHeight: 1.55,
          maxWidth: 360,
          pointerEvents: "none",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6 }}>
          Sword Prototype — chambara input
        </div>
        <div>
          {mode === "gyro"
            ? "Tilt phone left/right → sword angle"
            : onTouchDevice
            ? "Drag finger → sword follows"
            : "Move mouse → sword follows"}
        </div>
        <div style={{ marginTop: 4 }}>{guardHelp}</div>
        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 8,
            fontSize: 12,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 999,
              background: hud.guard ? "#1e40af" : "rgba(255,255,255,0.1)",
              color: hud.guard ? "#a5b4fc" : "#9ca3af",
              fontWeight: 600,
            }}
          >
            {hud.guard ? "GUARD" : "WIELD"}
          </span>
          {hud.swing && (
            <span
              style={{
                padding: "3px 8px",
                borderRadius: 999,
                background: "#fbbf24",
                color: "#78350f",
                fontWeight: 600,
              }}
            >
              SWING
            </span>
          )}
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.08)",
              fontVariantNumeric: "tabular-nums",
              color:
                hud.tipVelocity > SWING_VELOCITY_THRESHOLD
                  ? "#fbbf24"
                  : "#9ca3af",
            }}
          >
            tip v {hud.tipVelocity.toFixed(1)}
          </span>
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.05)",
              color: "#9ca3af",
              fontSize: 11,
            }}
          >
            mode: {mode}
          </span>
        </div>
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
        {mode === "touch" && onGyroDevice && (
          <button
            onClick={handleEnableGyro}
            disabled={permStatus === "checking"}
            style={modeButtonStyle(permStatus !== "checking")}
          >
            {permStatus === "checking" ? "Requesting…" : "📱 Use phone tilt"}
          </button>
        )}
        {mode === "gyro" && (
          <>
            <button onClick={handleSwitchToTouch} style={modeButtonStyle(true)}>
              🖱 Switch to touch
            </button>
            <button
              onClick={handleRecenter}
              style={modeButtonStyle(true, "#ff5470")}
            >
              🎯 Recenter
            </button>
          </>
        )}
        {permStatus === "denied" && (
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
            Gyro permission denied. iOS requires HTTPS — reload over https or
            try Chrome Android over LAN.
          </div>
        )}
      </div>
    </div>
  );
}
