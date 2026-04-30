import { Howler } from "howler";

import type { WeaponId } from "@vibejam/shared";

export type SaberSide = "player" | "opponent";

interface WeaponHumProfile {
  baseFreq: number;
  saw2x: number;
  triangle3x: number;
  lowpass: number;
  q: number;
  lfoHz: number;
  lfoDepth: number;
  masterGain: number;
  subFreq: number | null;
}

const WEAPON_PROFILES: Record<WeaponId, WeaponHumProfile> = {
  basic: {
    baseFreq: 65,
    saw2x: 130,
    triangle3x: 195,
    lowpass: 800,
    q: 1.2,
    lfoHz: 5,
    lfoDepth: 0.04,
    masterGain: 0.07,
    subFreq: null,
  },
  charge: {
    baseFreq: 60,
    saw2x: 120,
    triangle3x: 180,
    lowpass: 720,
    q: 1.6,
    lfoHz: 7,
    lfoDepth: 0.05,
    masterGain: 0.08,
    subFreq: 32,
  },
  rapier: {
    baseFreq: 90,
    saw2x: 180,
    triangle3x: 270,
    lowpass: 1100,
    q: 1.8,
    lfoHz: 5,
    lfoDepth: 0.03,
    masterGain: 0.06,
    subFreq: null,
  },
};

export interface SaberHum {
  setActive(active: boolean): void;
  setGuard(guarding: boolean): void;
  setStunned(stunned: boolean): void;
  setTimeScale(scale: number): void;
  pulseClash(): void;
  dispose(): void;
}

export function createSaberHum(opts: {
  weaponId: WeaponId;
  side: SaberSide;
}): SaberHum {
  const ctx = Howler.ctx as AudioContext | undefined;
  if (!ctx) {
    return makeNoopHum();
  }

  const profile = WEAPON_PROFILES[opts.weaponId];
  const sideOffset = opts.side === "opponent" ? 5 : 0;

  const now = ctx.currentTime;

  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.value = profile.baseFreq + sideOffset;

  const osc2 = ctx.createOscillator();
  osc2.type = "sawtooth";
  osc2.frequency.value = profile.saw2x + sideOffset * 2;

  const osc3 = ctx.createOscillator();
  osc3.type = "triangle";
  osc3.frequency.value = profile.triangle3x + sideOffset * 3;

  const subOsc = profile.subFreq != null ? ctx.createOscillator() : null;
  if (subOsc && profile.subFreq != null) {
    subOsc.type = "sine";
    subOsc.frequency.value = profile.subFreq;
  }

  const lfo = ctx.createOscillator();
  lfo.frequency.value = profile.lfoHz;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = profile.lfoDepth;
  lfo.connect(lfoGain);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = profile.lowpass;
  filter.Q.value = profile.q;

  const subGain = ctx.createGain();
  subGain.gain.value = subOsc ? 0.4 : 0;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.0;

  // LFO modulates the master gain (tremolo)
  lfoGain.connect(masterGain.gain);

  osc1.connect(filter);
  osc2.connect(filter);
  osc3.connect(filter);
  filter.connect(masterGain);
  if (subOsc) {
    subOsc.connect(subGain);
    subGain.connect(masterGain);
  }
  masterGain.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc3.start(now);
  if (subOsc) subOsc.start(now);
  lfo.start(now);

  let active = false;
  let guarding = false;
  let stunned = false;
  let timeScale = 1.0;

  const target = (): { gain: number; lpf: number; lfo: number } => {
    if (!active) return { gain: 0, lpf: profile.lowpass, lfo: profile.lfoHz };
    if (stunned) {
      return {
        gain: profile.masterGain * 0.55,
        lpf: 600,
        lfo: profile.lfoHz * 0.7 * timeScale,
      };
    }
    const guardLpf = guarding ? profile.lowpass + 400 : profile.lowpass;
    const guardLfoBoost = guarding ? 1.5 : 1.0;
    return {
      gain: profile.masterGain,
      lpf: guardLpf,
      lfo: profile.lfoHz * guardLfoBoost * timeScale,
    };
  };

  const apply = (): void => {
    const t = target();
    const at = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(at);
    masterGain.gain.setTargetAtTime(t.gain, at, 0.05);
    filter.frequency.cancelScheduledValues(at);
    filter.frequency.setTargetAtTime(t.lpf, at, 0.1);
    lfo.frequency.cancelScheduledValues(at);
    lfo.frequency.setTargetAtTime(t.lfo, at, 0.15);
  };

  return {
    setActive(next) {
      if (next === active) return;
      active = next;
      apply();
    },
    setGuard(next) {
      if (next === guarding) return;
      guarding = next;
      apply();
    },
    setStunned(next) {
      if (next === stunned) return;
      stunned = next;
      apply();
    },
    setTimeScale(scale) {
      const clamped = Math.max(0.05, Math.min(2.0, scale));
      if (Math.abs(clamped - timeScale) < 0.02) return;
      timeScale = clamped;
      apply();
    },
    pulseClash() {
      const at = ctx.currentTime;
      filter.frequency.cancelScheduledValues(at);
      filter.frequency.setValueAtTime(1500, at);
      filter.frequency.setTargetAtTime(target().lpf, at + 0.05, 0.08);
    },
    dispose() {
      try {
        osc1.stop();
        osc2.stop();
        osc3.stop();
        if (subOsc) subOsc.stop();
        lfo.stop();
      } catch {
        /* may already be stopped */
      }
      try {
        masterGain.disconnect();
        filter.disconnect();
        lfoGain.disconnect();
      } catch {
        /* may already be disconnected */
      }
    },
  };
}

function makeNoopHum(): SaberHum {
  return {
    setActive() {},
    setGuard() {},
    setStunned() {},
    setTimeScale() {},
    pulseClash() {},
    dispose() {},
  };
}
