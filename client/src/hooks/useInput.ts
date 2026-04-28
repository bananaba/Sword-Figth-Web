import { useEffect, useRef } from "react";

interface InputState {
  pitch: number;
  yaw: number;
  roll: number;
  throttle: number;
  fire: boolean;
}

export function useInput(): InputState {
  const stateRef = useRef<InputState>({
    pitch: 0,
    yaw: 0,
    roll: 0,
    throttle: 0.5,
    fire: false,
  });
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const k = keys.current;
  stateRef.current.yaw =
    (k["KeyA"] || k["ArrowLeft"] ? -1 : 0) +
    (k["KeyD"] || k["ArrowRight"] ? 1 : 0);
  stateRef.current.pitch =
    (k["KeyW"] || k["ArrowUp"] ? -1 : 0) +
    (k["KeyS"] || k["ArrowDown"] ? 1 : 0);
  stateRef.current.throttle = k["Space"] ? 1 : 0.5;
  stateRef.current.fire = !!k["KeyF"];

  return stateRef.current;
}
