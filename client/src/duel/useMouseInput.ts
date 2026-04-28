import { useEffect, useRef, useState } from "react";
import type { Vec2 } from "@vibejam/shared";

export type AttackKind = "slice" | "thrust";

export interface MouseAttack {
  kind: AttackKind;
  /**
   * For slice: mousedown world position (wind-up).
   * For thrust: world position when middle-click / dblclick fired.
   */
  start: Vec2;
  /**
   * For slice: mouseup world position.
   * For thrust: equal to start (the resolver extends along the orientation
   * direction by `weapon.thrustReach`).
   */
  end: Vec2;
  timestamp: number;
}

/** Inputs that downstream rendering / resolver code reads each frame. */
export interface MouseInputSnapshot {
  mouseScreen: Vec2;
  mouseWorld: Vec2;
  guardActive: boolean;
  /** When non-null the player is in the middle of drawing a slice. */
  windUpStart: Vec2 | null;
}

export interface UseMouseInputOptions {
  /** Convert raw screen pixel coordinates to world (blade plane) coords. */
  toWorld: (screen: Vec2) => Vec2;
  /** Slices below this drag distance (world units) are discarded as taps. */
  minSliceDist: number;
  /** Fired when an attack input commits. */
  onAttack: (attack: MouseAttack) => void;
}

/**
 * Mouse-only input for chambara duel:
 *   - move          → blade tip follows cursor (orientation only, length is fixed by weapon)
 *   - left drag     → wind-up; on release, slice from start→end (drag-release model)
 *   - middle click  → thrust along current orientation
 *   - dblclick      → thrust (fallback for users without a middle button)
 *   - right hold    → guard (current orientation = guard segment)
 *   - guard preempts attack: while right is held, left/middle/dbl are ignored
 */
export function useMouseInput(opts: UseMouseInputOptions): MouseInputSnapshot {
  const [snapshot, setSnapshot] = useState<MouseInputSnapshot>({
    mouseScreen: { x: 0, y: 0 },
    mouseWorld: { x: 0, y: 0 },
    guardActive: false,
    windUpStart: null,
  });

  const optsRef = useRef(opts);
  optsRef.current = opts;
  const guardRef = useRef(false);
  const windUpRef = useRef<Vec2 | null>(null);

  useEffect(() => {
    const update = (
      mut: (prev: MouseInputSnapshot) => MouseInputSnapshot,
    ): void => setSnapshot(mut);

    const onMove = (e: MouseEvent): void => {
      const screen = { x: e.clientX, y: e.clientY };
      const world = optsRef.current.toWorld(screen);
      update((prev) => ({ ...prev, mouseScreen: screen, mouseWorld: world }));
    };

    const onMouseDown = (e: MouseEvent): void => {
      const screen = { x: e.clientX, y: e.clientY };
      const world = optsRef.current.toWorld(screen);

      if (e.button === 2) {
        e.preventDefault();
        guardRef.current = true;
        windUpRef.current = null;
        update((prev) => ({
          ...prev,
          guardActive: true,
          windUpStart: null,
        }));
        return;
      }

      if (guardRef.current) return;

      if (e.button === 0) {
        windUpRef.current = world;
        update((prev) => ({ ...prev, windUpStart: world }));
        return;
      }

      if (e.button === 1) {
        e.preventDefault();
        optsRef.current.onAttack({
          kind: "thrust",
          start: world,
          end: world,
          timestamp: performance.now(),
        });
      }
    };

    const onMouseUp = (e: MouseEvent): void => {
      const screen = { x: e.clientX, y: e.clientY };
      const world = optsRef.current.toWorld(screen);

      if (e.button === 2) {
        guardRef.current = false;
        update((prev) => ({ ...prev, guardActive: false }));
        return;
      }

      if (e.button === 0) {
        const start = windUpRef.current;
        windUpRef.current = null;
        update((prev) => ({ ...prev, windUpStart: null }));
        if (!start) return;
        const dx = world.x - start.x;
        const dy = world.y - start.y;
        const dist = Math.hypot(dx, dy);
        if (dist < optsRef.current.minSliceDist) return;
        optsRef.current.onAttack({
          kind: "slice",
          start,
          end: world,
          timestamp: performance.now(),
        });
      }
    };

    const onDblClick = (e: MouseEvent): void => {
      if (guardRef.current) return;
      if (e.button !== 0) return;
      e.preventDefault();
      const world = optsRef.current.toWorld({ x: e.clientX, y: e.clientY });
      optsRef.current.onAttack({
        kind: "thrust",
        start: world,
        end: world,
        timestamp: performance.now(),
      });
    };

    const onContextMenu = (e: MouseEvent): void => e.preventDefault();
    const onAuxClick = (e: MouseEvent): void => {
      if (e.button === 1) e.preventDefault();
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("dblclick", onDblClick);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("auxclick", onAuxClick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("dblclick", onDblClick);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("auxclick", onAuxClick);
    };
  }, []);

  return snapshot;
}
