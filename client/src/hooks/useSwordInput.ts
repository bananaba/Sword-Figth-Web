import { useEffect, useRef, useState } from "react";

const ACCEL_SWING_THRESHOLD = 18;

export type InputMode = "touch" | "gyro";
export type GyroPermStatus =
  | "idle"
  | "checking"
  | "granted"
  | "denied"
  | "unsupported";

export interface PointerState {
  targetAngle: number;
  guardActive: boolean;
  motionSpikeAt: number;
}

export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

export function hasGyroSupport(): boolean {
  if (typeof window === "undefined") return false;
  return "DeviceOrientationEvent" in window;
}

export async function requestGyroPermission(): Promise<GyroPermStatus> {
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

export function useSwordInput() {
  const [mode, setMode] = useState<InputMode>("touch");
  const [permStatus, setPermStatus] = useState<GyroPermStatus>("idle");

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
      stateRef.current.targetAngle =
        Math.PI / 2 - (offsetGamma * Math.PI) / 180;
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

  const enableGyro = async () => {
    setPermStatus("checking");
    const result = await requestGyroPermission();
    setPermStatus(result);
    if (result === "granted") {
      gyroOffsetRef.current = null;
      setMode("gyro");
    }
  };

  const recenter = () => {
    gyroOffsetRef.current = { ...gyroLatestRef.current };
  };

  const switchToTouch = () => {
    setMode("touch");
    gyroOffsetRef.current = null;
  };

  return {
    stateRef,
    mode,
    permStatus,
    onTouchDevice: isTouchDevice(),
    onGyroDevice: hasGyroSupport(),
    enableGyro,
    recenter,
    switchToTouch,
  };
}
