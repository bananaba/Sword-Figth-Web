import { useCallback, useEffect, useRef, useState } from "react";
import {
  PLASMA_BLADE,
  applyOutcome,
  isInCounterWindow,
  isOnCooldown,
  isStunned,
  resolveAttack,
  tickFighter,
  type AttackEvent,
  type BodyHitbox,
  type FighterState,
  type GuardSnapshot,
  type Outcome,
  type Vec2,
} from "@vibejam/shared";
import { useMouseInput, type MouseAttack } from "./useMouseInput";

const PLAYER_X = -1.6;
const DUMMY_X = 1.6;
const BODY_HALF_W = 0.35;
const BODY_HEIGHT = 1.7;
const SHOULDER_Y = 1.15;
const FRICTION = 2.5;
const FLASH_MS = 700;

type DummyGuardMode = "off" | "highVertical" | "lowVertical" | "horizontal";

interface FlashState {
  outcome: Outcome;
  attackStart: Vec2;
  attackEnd: Vec2;
  attackKind: "slice" | "thrust";
  at: number;
}

interface Layout {
  scale: number;
  originX: number;
  originY: number;
}

function initialFighter(posX: number): FighterState {
  return {
    posX,
    velX: 0,
    attackCooldownUntil: 0,
    stunUntil: 0,
    counterUntil: 0,
    guard: { active: false, grip: { x: posX, y: SHOULDER_Y }, tip: { x: posX, y: SHOULDER_Y } },
  };
}

function bodyHitbox(centerX: number): BodyHitbox {
  return {
    minX: centerX - BODY_HALF_W,
    maxX: centerX + BODY_HALF_W,
    minY: 0,
    maxY: BODY_HEIGHT,
  };
}

function dummyGuardSegment(mode: DummyGuardMode): GuardSnapshot {
  const grip: Vec2 = { x: DUMMY_X, y: SHOULDER_Y };
  switch (mode) {
    case "off":
      return { active: false, grip, tip: grip };
    case "highVertical":
      return { active: true, grip, tip: { x: DUMMY_X, y: SHOULDER_Y + PLASMA_BLADE.bladeLength } };
    case "lowVertical":
      return { active: true, grip, tip: { x: DUMMY_X, y: SHOULDER_Y - PLASMA_BLADE.bladeLength } };
    case "horizontal":
      return {
        active: true,
        grip: { x: DUMMY_X - PLASMA_BLADE.bladeLength / 2, y: SHOULDER_Y },
        tip: { x: DUMMY_X + PLASMA_BLADE.bladeLength / 2, y: SHOULDER_Y },
      };
  }
}

function mouseAttackToEvent(attack: MouseAttack, weapon: typeof PLASMA_BLADE, playerGrip: Vec2): AttackEvent {
  if (attack.kind === "slice") {
    const dx = attack.end.x - attack.start.x;
    const dy = attack.end.y - attack.start.y;
    const reach = Math.hypot(dx, dy);
    const inv = reach > 1e-6 ? 1 / reach : 0;
    return {
      kind: "slice",
      origin: attack.start,
      direction: { x: dx * inv, y: dy * inv },
      reach,
      timestamp: attack.timestamp,
    };
  }
  // Thrust origin = grip (inside body silhouette), direction = grip→click.
  // See `useDuelLoop.mouseToAttackEvent` for the rationale — the resolver's
  // hit segment must pass through the body box, so anchoring at grip keeps
  // an endpoint inside the box; the click only sets aim direction.
  const dx = attack.start.x - playerGrip.x;
  const dy = attack.start.y - playerGrip.y;
  const len = Math.hypot(dx, dy);
  const ndx = len > 1e-6 ? dx / len : 0;
  const ndy = len > 1e-6 ? dy / len : 1;
  return {
    kind: "thrust",
    origin: playerGrip,
    direction: { x: ndx, y: ndy },
    reach: weapon.thrustReach,
    timestamp: attack.timestamp,
  };
}

function outcomeColor(kind: Outcome["kind"]): string {
  switch (kind) {
    case "hit": return "#ef4444";
    case "pierce": return "#f97316";
    case "block": return "#3b82f6";
    case "miss": return "#94a3b8";
    case "rejected": return "#64748b";
  }
}

function outcomeLabel(kind: Outcome["kind"]): string {
  switch (kind) {
    case "hit": return "HIT";
    case "pierce": return "PIERCE";
    case "block": return "BLOCK";
    case "miss": return "MISS";
    case "rejected": return "REJECTED";
  }
}

export function DuelInputDemo() {
  const [layout] = useState<Layout>(() => ({
    scale: Math.min(window.innerWidth / 5.5, window.innerHeight / 3.0),
    originX: window.innerWidth / 2,
    originY: window.innerHeight * 0.72,
  }));

  const toWorld = useCallback(
    (s: Vec2): Vec2 => ({
      x: (s.x - layout.originX) / layout.scale,
      y: (layout.originY - s.y) / layout.scale,
    }),
    [layout],
  );
  const toScreen = useCallback(
    (w: Vec2): Vec2 => ({
      x: layout.originX + w.x * layout.scale,
      y: layout.originY - w.y * layout.scale,
    }),
    [layout],
  );

  const playerRef = useRef<FighterState>(initialFighter(PLAYER_X));
  const dummyRef = useRef<FighterState>(initialFighter(DUMMY_X));
  const [, force] = useState(0);
  const tickRender = useCallback(() => force((v) => (v + 1) % 1024), []);

  const [dummyGuardMode, setDummyGuardMode] = useState<DummyGuardMode>("highVertical");
  const flashRef = useRef<FlashState | null>(null);

  // Sync dummy guard from mode
  useEffect(() => {
    dummyRef.current = { ...dummyRef.current, guard: dummyGuardSegment(dummyGuardMode) };
  }, [dummyGuardMode]);

  const handleAttack = useCallback(
    (atk: MouseAttack) => {
      const now = performance.now();
      const grip: Vec2 = { x: PLAYER_X, y: SHOULDER_Y };
      const event = mouseAttackToEvent(atk, PLASMA_BLADE, grip);
      const outcome = resolveAttack(
        playerRef.current,
        dummyRef.current,
        bodyHitbox(DUMMY_X),
        event,
        PLASMA_BLADE,
        now,
      );
      const facing = dummyRef.current.posX >= playerRef.current.posX ? +1 : -1;
      const next = applyOutcome(
        playerRef.current,
        dummyRef.current,
        outcome,
        facing,
        now,
        PLASMA_BLADE,
        event,
      );
      playerRef.current = next.attacker;
      dummyRef.current = next.defender;

      const attackEnd =
        atk.kind === "slice"
          ? atk.end
          : {
              x: atk.start.x + event.direction.x * PLASMA_BLADE.thrustReach,
              y: atk.start.y + event.direction.y * PLASMA_BLADE.thrustReach,
            };
      flashRef.current = {
        outcome,
        attackStart: atk.start,
        attackEnd,
        attackKind: atk.kind,
        at: now,
      };
      tickRender();
    },
    [tickRender],
  );

  const input = useMouseInput({
    toWorld,
    minSliceDist: PLASMA_BLADE.minSliceReach,
    onAttack: handleAttack,
  });

  // Update player guard segment from input
  const playerGrip: Vec2 = { x: PLAYER_X, y: SHOULDER_Y };
  const playerTip = input.mouseWorld;
  playerRef.current.guard = {
    active: input.guardActive && !isStunned(playerRef.current, performance.now()),
    grip: playerGrip,
    tip: playerTip,
  };

  // RAF tick: physics + flash expiry + re-render for HUD
  useEffect(() => {
    let last = performance.now();
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      playerRef.current = tickFighter(playerRef.current, dt, FRICTION);
      dummyRef.current = tickFighter(dummyRef.current, dt, FRICTION);
      if (flashRef.current && now - flashRef.current.at > FLASH_MS) {
        flashRef.current = null;
      }
      tickRender();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tickRender]);

  const now = performance.now();
  const player = playerRef.current;
  const dummy = dummyRef.current;
  const flash = flashRef.current;

  const playerScreen = toScreen({ x: player.posX, y: 0 });
  const dummyScreen = toScreen({ x: dummy.posX, y: 0 });
  const playerGripScreen = toScreen(playerGrip);
  const playerTipScreen = toScreen(playerTip);
  const dummyGuardGripScreen = toScreen(dummy.guard.grip);
  const dummyGuardTipScreen = toScreen(dummy.guard.tip);
  const groundY = toScreen({ x: 0, y: 0 }).y;

  const dummyBox = bodyHitbox(dummy.posX);
  const dummyTopLeft = toScreen({ x: dummyBox.minX, y: dummyBox.maxY });
  const dummyBottomRight = toScreen({ x: dummyBox.maxX, y: dummyBox.minY });

  const playerBox = bodyHitbox(player.posX);
  const playerTopLeft = toScreen({ x: playerBox.minX, y: playerBox.maxY });
  const playerBottomRight = toScreen({ x: playerBox.maxX, y: playerBox.minY });

  const windUpScreen = input.windUpStart ? toScreen(input.windUpStart) : null;

  const flashStart = flash ? toScreen(flash.attackStart) : null;
  const flashEnd = flash ? toScreen(flash.attackEnd) : null;
  const flashAge = flash ? (now - flash.at) / FLASH_MS : 1;

  const playerStunned = isStunned(player, now);
  const playerCooldown = isOnCooldown(player, now);
  const playerCounter = isInCounterWindow(player, now);
  const cdRemaining = Math.max(0, player.attackCooldownUntil - now);
  const stunRemaining = Math.max(0, player.stunUntil - now);
  const counterRemaining = Math.max(0, player.counterUntil - now);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#0f172a",
        userSelect: "none",
        cursor: input.guardActive ? "grab" : "crosshair",
        overflow: "hidden",
      }}
    >
      <svg
        width={window.innerWidth}
        height={window.innerHeight}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <line
          x1={0}
          y1={groundY}
          x2={window.innerWidth}
          y2={groundY}
          stroke="#1e293b"
          strokeWidth={2}
        />
        <rect
          x={playerTopLeft.x}
          y={playerTopLeft.y}
          width={playerBottomRight.x - playerTopLeft.x}
          height={playerBottomRight.y - playerTopLeft.y}
          fill="rgba(59,130,246,0.12)"
          stroke="#3b82f6"
          strokeDasharray="4 4"
          strokeWidth={1.5}
        />
        <rect
          x={dummyTopLeft.x}
          y={dummyTopLeft.y}
          width={dummyBottomRight.x - dummyTopLeft.x}
          height={dummyBottomRight.y - dummyTopLeft.y}
          fill="rgba(239,68,68,0.12)"
          stroke="#ef4444"
          strokeDasharray="4 4"
          strokeWidth={1.5}
        />
        <circle cx={playerScreen.x} cy={playerScreen.y - 4} r={5} fill="#3b82f6" />
        <circle cx={dummyScreen.x} cy={dummyScreen.y - 4} r={5} fill="#ef4444" />

        <line
          x1={playerGripScreen.x}
          y1={playerGripScreen.y}
          x2={playerTipScreen.x}
          y2={playerTipScreen.y}
          stroke={input.guardActive ? "#60a5fa" : "#e2e8f0"}
          strokeWidth={input.guardActive ? 6 : 4}
          strokeLinecap="round"
          opacity={playerStunned ? 0.3 : 1}
        />

        {dummy.guard.active && (
          <line
            x1={dummyGuardGripScreen.x}
            y1={dummyGuardGripScreen.y}
            x2={dummyGuardTipScreen.x}
            y2={dummyGuardTipScreen.y}
            stroke="#fb923c"
            strokeWidth={6}
            strokeLinecap="round"
          />
        )}

        {windUpScreen && (
          <>
            <circle cx={windUpScreen.x} cy={windUpScreen.y} r={6} fill="#fbbf24" />
            <line
              x1={windUpScreen.x}
              y1={windUpScreen.y}
              x2={input.mouseScreen.x}
              y2={input.mouseScreen.y}
              stroke="#fbbf24"
              strokeWidth={2}
              strokeDasharray="6 6"
              opacity={0.7}
            />
          </>
        )}

        {flash && flashStart && flashEnd && (
          <>
            <line
              x1={flashStart.x}
              y1={flashStart.y}
              x2={flashEnd.x}
              y2={flashEnd.y}
              stroke={outcomeColor(flash.outcome.kind)}
              strokeWidth={6}
              strokeLinecap="round"
              opacity={1 - flashAge}
            />
            <text
              x={(flashStart.x + flashEnd.x) / 2}
              y={Math.min(flashStart.y, flashEnd.y) - 14}
              textAnchor="middle"
              fill={outcomeColor(flash.outcome.kind)}
              fontFamily="ui-monospace, monospace"
              fontSize={20}
              fontWeight={700}
              opacity={1 - flashAge * 0.8}
            >
              {outcomeLabel(flash.outcome.kind)}
              {flash.outcome.knockback > 0 ? ` · +${flash.outcome.knockback.toFixed(1)}` : ""}
            </text>
          </>
        )}
      </svg>

      <div
        style={{
          position: "absolute",
          left: 16,
          top: 16,
          padding: 14,
          background: "rgba(15,23,42,0.85)",
          color: "#e2e8f0",
          borderRadius: 10,
          fontSize: 13,
          minWidth: 280,
          fontFamily: "ui-sans-serif, system-ui",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>
          Duel Input — drag to slice / dbl-click or middle-click to thrust / right-hold to guard
        </div>
        <Row label="player guard" value={input.guardActive ? "ACTIVE" : "off"} color={input.guardActive ? "#60a5fa" : "#64748b"} />
        <Row label="cooldown" value={`${cdRemaining.toFixed(0)} ms`} color={playerCooldown ? "#fb923c" : "#64748b"} />
        <Row label="stun" value={`${stunRemaining.toFixed(0)} ms`} color={playerStunned ? "#ef4444" : "#64748b"} />
        <Row label="counter window" value={`${counterRemaining.toFixed(0)} ms`} color={playerCounter ? "#22c55e" : "#64748b"} />
        <Row label="player vel" value={player.velX.toFixed(2)} color="#94a3b8" />
        <Row label="dummy vel" value={dummy.velX.toFixed(2)} color="#94a3b8" />
        <Row label="player pos" value={player.posX.toFixed(2)} color="#94a3b8" />
        <Row label="dummy pos" value={dummy.posX.toFixed(2)} color="#94a3b8" />
      </div>

      <div
        style={{
          position: "absolute",
          right: 16,
          top: 16,
          padding: 14,
          background: "rgba(15,23,42,0.85)",
          color: "#e2e8f0",
          borderRadius: 10,
          fontSize: 13,
          minWidth: 220,
          fontFamily: "ui-sans-serif, system-ui",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Dummy guard</div>
        {(["off", "highVertical", "lowVertical", "horizontal"] as DummyGuardMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setDummyGuardMode(m)}
            style={{
              display: "block",
              width: "100%",
              padding: "6px 10px",
              marginBottom: 4,
              borderRadius: 6,
              border: `1px solid ${dummyGuardMode === m ? "#fb923c" : "rgba(255,255,255,0.15)"}`,
              background: dummyGuardMode === m ? "rgba(251,146,60,0.18)" : "rgba(255,255,255,0.04)",
              color: "#e2e8f0",
              fontSize: 12,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            {m}
          </button>
        ))}
        <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>
          slice MUST cross the dashed body box AND avoid the orange guard segment to land. cross the guard near 90° → BLOCK + stun yourself.
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 3,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span style={{ color: "#94a3b8" }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
