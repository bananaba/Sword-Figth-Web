import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { WeaponStats } from "@vibejam/shared";
import { BODY_HALF_WIDTH, BODY_HEIGHT } from "./Fighter";
import type { FighterVisualState } from "./Fighter";

/** Small wireframe box that follows a fighter so we can see the hit volume the resolver tests against. */
function HitboxWire({
  state,
  color,
}: {
  state: React.MutableRefObject<FighterVisualState>;
  color: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const geometry = useMemo(
    () =>
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(BODY_HALF_WIDTH * 2, BODY_HEIGHT, 0.001),
      ),
    [],
  );
  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }),
    [color],
  );

  // Dispose imperatively-built geometry/material when the debug panel
  // toggles off — three.js doesn't auto-dispose `useMemo`-backed resources
  // on unmount, only ones attached to JSX primitives by R3F.
  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(0, BODY_HEIGHT / 2, state.current.worldZ);
  });

  return (
    <group ref={groupRef}>
      <lineSegments geometry={geometry} material={material} />
    </group>
  );
}

export interface DuelDebugSceneProps {
  player: React.MutableRefObject<FighterVisualState>;
  opponent: React.MutableRefObject<FighterVisualState>;
}

export function DuelDebugScene({ player, opponent }: DuelDebugSceneProps) {
  return (
    <>
      <HitboxWire state={player} color="#3b82f6" />
      <HitboxWire state={opponent} color="#ef4444" />
    </>
  );
}

export interface DuelTuning {
  attackCooldownMs: number;
  guardAngleToleranceDeg: number;
  stunMs: number;
  sliceKnockback: number;
  thrustKnockback: number;
  counterKnockback: number;
  thrustReach: number;
  bladeLength: number;
  minSliceReach: number;
  attackerFollowFraction: number;
  motionImmunityVelocityThreshold: number;
  tradeImmuneMs: number;
  windUpMs: number;
  swingDurationMs: number;
  thrustChargeMs: number;
}

export function tuningFromWeapon(weapon: WeaponStats): DuelTuning {
  return {
    attackCooldownMs: weapon.attackCooldownMs,
    guardAngleToleranceDeg: (weapon.guardAngleTolerance * 180) / Math.PI,
    stunMs: weapon.stunMs,
    sliceKnockback: weapon.sliceKnockback,
    thrustKnockback: weapon.thrustKnockback,
    counterKnockback: weapon.counterKnockback,
    thrustReach: weapon.thrustReach,
    bladeLength: weapon.bladeLength,
    minSliceReach: weapon.minSliceReach,
    attackerFollowFraction: weapon.attackerFollowFraction,
    motionImmunityVelocityThreshold: weapon.motionImmunityVelocityThreshold,
    tradeImmuneMs: weapon.tradeImmuneMs,
    windUpMs: weapon.windUpMs,
    swingDurationMs: weapon.swingDurationMs,
    thrustChargeMs: weapon.thrustChargeMs,
  };
}

export function tuningToWeaponPatch(tuning: DuelTuning): Partial<WeaponStats> {
  return {
    attackCooldownMs: tuning.attackCooldownMs,
    guardAngleTolerance: (tuning.guardAngleToleranceDeg * Math.PI) / 180,
    stunMs: tuning.stunMs,
    sliceKnockback: tuning.sliceKnockback,
    thrustKnockback: tuning.thrustKnockback,
    counterKnockback: tuning.counterKnockback,
    thrustReach: tuning.thrustReach,
    bladeLength: tuning.bladeLength,
    minSliceReach: tuning.minSliceReach,
    attackerFollowFraction: tuning.attackerFollowFraction,
    motionImmunityVelocityThreshold: tuning.motionImmunityVelocityThreshold,
    tradeImmuneMs: tuning.tradeImmuneMs,
    windUpMs: tuning.windUpMs,
    swingDurationMs: tuning.swingDurationMs,
    thrustChargeMs: tuning.thrustChargeMs,
  };
}

export interface DuelDebugPanelProps {
  tuning: DuelTuning;
  onChange: (next: DuelTuning) => void;
  onReset: () => void;
}

export function DuelDebugPanel({ tuning, onChange, onReset }: DuelDebugPanelProps) {
  const update = <K extends keyof DuelTuning>(key: K, value: DuelTuning[K]): void => {
    onChange({ ...tuning, [key]: value });
  };

  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        top: 80,
        padding: 14,
        background: "rgba(15,23,42,0.85)",
        color: "#e2e8f0",
        borderRadius: 10,
        fontSize: 12,
        minWidth: 280,
        fontFamily: "ui-sans-serif, system-ui",
        backdropFilter: "blur(6px)",
        maxHeight: "70vh",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div style={{ fontWeight: 700 }}>Debug · Tuning (D)</div>
        <button
          onClick={onReset}
          style={{
            fontSize: 11,
            padding: "3px 9px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.05)",
            color: "#e2e8f0",
            cursor: "pointer",
          }}
        >
          reset
        </button>
      </div>
      <Slider
        label="attack cooldown"
        unit="ms"
        min={150}
        max={1500}
        step={25}
        value={tuning.attackCooldownMs}
        onChange={(v) => update("attackCooldownMs", v)}
      />
      <Slider
        label="guard angle tolerance"
        unit="°"
        min={5}
        max={60}
        step={1}
        value={tuning.guardAngleToleranceDeg}
        onChange={(v) => update("guardAngleToleranceDeg", v)}
      />
      <Slider
        label="stun / counter window"
        unit="ms"
        min={150}
        max={3000}
        step={25}
        value={tuning.stunMs}
        onChange={(v) => update("stunMs", v)}
      />
      <Slider
        label="slice knockback"
        unit=""
        min={0}
        max={20}
        step={0.5}
        value={tuning.sliceKnockback}
        onChange={(v) => update("sliceKnockback", v)}
      />
      <Slider
        label="thrust knockback"
        unit=""
        min={0}
        max={25}
        step={0.5}
        value={tuning.thrustKnockback}
        onChange={(v) => update("thrustKnockback", v)}
      />
      <Slider
        label="counter knockback"
        unit=""
        min={0}
        max={30}
        step={0.5}
        value={tuning.counterKnockback}
        onChange={(v) => update("counterKnockback", v)}
      />
      <Slider
        label="thrust reach"
        unit=""
        min={0.4}
        max={3.0}
        step={0.05}
        value={tuning.thrustReach}
        onChange={(v) => update("thrustReach", v)}
      />
      <Slider
        label="blade length"
        unit=""
        min={0.4}
        max={2.5}
        step={0.05}
        value={tuning.bladeLength}
        onChange={(v) => update("bladeLength", v)}
      />
      <Slider
        label="min slice drag"
        unit=""
        min={0.05}
        max={1.5}
        step={0.05}
        value={tuning.minSliceReach}
        onChange={(v) => update("minSliceReach", v)}
      />
      <Slider
        label="attacker follow"
        unit=""
        min={0}
        max={1}
        step={0.05}
        value={tuning.attackerFollowFraction}
        onChange={(v) => update("attackerFollowFraction", v)}
      />
      <Slider
        label="motion immune vel"
        unit=""
        min={0}
        max={4}
        step={0.1}
        value={tuning.motionImmunityVelocityThreshold}
        onChange={(v) => update("motionImmunityVelocityThreshold", v)}
      />
      <Slider
        label="trade immune"
        unit="ms"
        min={0}
        max={800}
        step={25}
        value={tuning.tradeImmuneMs}
        onChange={(v) => update("tradeImmuneMs", v)}
      />
      <Slider
        label="windUp (slice)"
        unit="ms"
        min={50}
        max={800}
        step={20}
        value={tuning.windUpMs}
        onChange={(v) => update("windUpMs", v)}
      />
      <Slider
        label="thrustCharge"
        unit="ms"
        min={50}
        max={800}
        step={20}
        value={tuning.thrustChargeMs}
        onChange={(v) => update("thrustChargeMs", v)}
      />
      <Slider
        label="swing duration"
        unit="ms"
        min={30}
        max={400}
        step={10}
        value={tuning.swingDurationMs}
        onChange={(v) => update("swingDurationMs", v)}
      />
    </div>
  );
}

function Slider({
  label,
  unit,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          marginBottom: 2,
        }}
      >
        <span style={{ color: "#94a3b8" }}>{label}</span>
        <span
          style={{
            color: "#e2e8f0",
            fontVariantNumeric: "tabular-nums",
            fontWeight: 600,
          }}
        >
          {Number.isInteger(step) ? value.toFixed(0) : value.toFixed(2)}
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
        style={{ width: "100%", accentColor: "#60a5fa" }}
      />
    </div>
  );
}
