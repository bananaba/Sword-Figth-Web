import { Howl } from "howler";

import type { ImpactKind } from "../stores/useImpacts";

let muted = false;
export function applySfxMute(next: boolean): void {
  muted = next;
}
export function isSfxCurrentlyMuted(): boolean {
  return muted;
}

type SfxName =
  | "block_a"
  | "block_b"
  | "pierce"
  | "hit_a"
  | "hit_b"
  | "windup"
  | "counter_open"
  | "saber_swing_a"
  | "saber_swing_b"
  | "saber_swing_c"
  | "footstep_a"
  | "footstep_b"
  | "footstep_c"
  | "bell_round_start"
  | "countdown_beep"
  | "pit_impale"
  | "ui_hover"
  | "ui_click"
  | "ui_back"
  | "ui_match_found";

interface SfxDef {
  src: string;
  volume: number;
  pitchVar: number;
}

const DEFS: Record<SfxName, SfxDef> = {
  block_a: { src: "/audio/block_a.ogg", volume: 0.85, pitchVar: 0.06 },
  block_b: { src: "/audio/block_b.ogg", volume: 0.85, pitchVar: 0.06 },
  pierce: { src: "/audio/pierce.ogg", volume: 0.95, pitchVar: 0.05 },
  hit_a: { src: "/audio/hit_a.ogg", volume: 0.9, pitchVar: 0.06 },
  hit_b: { src: "/audio/hit_b.ogg", volume: 0.9, pitchVar: 0.06 },
  windup: { src: "/audio/windup.ogg", volume: 0.55, pitchVar: 0.04 },
  counter_open: { src: "/audio/counter_open.ogg", volume: 0.65, pitchVar: 0.03 },
  saber_swing_a: { src: "/audio/saber_swing_a.ogg", volume: 0.32, pitchVar: 0.1 },
  saber_swing_b: { src: "/audio/saber_swing_b.ogg", volume: 0.32, pitchVar: 0.1 },
  saber_swing_c: { src: "/audio/saber_swing_c.ogg", volume: 0.35, pitchVar: 0.08 },
  footstep_a: { src: "/audio/footstep_a.ogg", volume: 0.4, pitchVar: 0.12 },
  footstep_b: { src: "/audio/footstep_b.ogg", volume: 0.4, pitchVar: 0.12 },
  footstep_c: { src: "/audio/footstep_c.ogg", volume: 0.4, pitchVar: 0.12 },
  bell_round_start: { src: "/audio/bell_round_start.ogg", volume: 0.85, pitchVar: 0 },
  countdown_beep: { src: "/audio/countdown_beep.ogg", volume: 0.75, pitchVar: 0 },
  pit_impale: { src: "/audio/pit_impale.ogg", volume: 1.0, pitchVar: 0.04 },
  ui_hover: { src: "/audio/ui_hover.ogg", volume: 0.4, pitchVar: 0.04 },
  ui_click: { src: "/audio/ui_click.ogg", volume: 0.6, pitchVar: 0.03 },
  ui_back: { src: "/audio/ui_back.ogg", volume: 0.55, pitchVar: 0.03 },
  ui_match_found: { src: "/audio/ui_match_found.ogg", volume: 0.8, pitchVar: 0 },
};

const howls = new Map<SfxName, Howl>();

function getHowl(name: SfxName): Howl {
  const cached = howls.get(name);
  if (cached) return cached;
  const def = DEFS[name];
  const howl = new Howl({
    src: [def.src],
    volume: def.volume,
    preload: true,
    html5: false,
  });
  howls.set(name, howl);
  return howl;
}

export function preloadAllSfx(): void {
  for (const name of Object.keys(DEFS) as SfxName[]) {
    getHowl(name);
  }
}

export function playSfx(name: SfxName, volumeScale = 1.0): void {
  if (muted) return;
  const howl = getHowl(name);
  const def = DEFS[name];
  const id = howl.play();
  if (def.pitchVar > 0) {
    const rate = 1.0 + (Math.random() - 0.5) * 2 * def.pitchVar;
    howl.rate(rate, id);
  }
  if (volumeScale !== 1.0) {
    howl.volume(Math.max(0, Math.min(1, def.volume * volumeScale)), id);
  }
}

const BLOCK_VARIANTS: SfxName[] = ["block_a", "block_b"];
const HIT_VARIANTS: SfxName[] = ["hit_a", "hit_b"];
const SWING_VARIANTS: SfxName[] = ["saber_swing_a", "saber_swing_b", "saber_swing_c"];
const FOOT_VARIANTS: SfxName[] = ["footstep_a", "footstep_b", "footstep_c"];

function pickVariant<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function playOutcomeSfx(kind: ImpactKind): void {
  switch (kind) {
    case "block":
      playSfx(pickVariant(BLOCK_VARIANTS));
      break;
    case "hit":
      playSfx(pickVariant(HIT_VARIANTS));
      break;
    case "pierce":
      playSfx("pierce");
      break;
    case "ko":
      playSfx("pit_impale");
      break;
  }
}

export function playSwingSfx(): void {
  playSfx(pickVariant(SWING_VARIANTS));
}

export function playFootstepSfx(): void {
  playSfx(pickVariant(FOOT_VARIANTS), 0.8);
}

export function playWindupSfx(): void {
  playSfx("windup");
}

export function playCounterOpenSfx(): void {
  playSfx("counter_open");
}

export function playRoundBellSfx(): void {
  playSfx("bell_round_start");
}

export function playCountdownBeepSfx(pitch: number): void {
  if (muted) return;
  const howl = getHowl("countdown_beep");
  const id = howl.play();
  howl.rate(pitch, id);
}

export function playUiHoverSfx(): void {
  playSfx("ui_hover");
}

export function playUiClickSfx(): void {
  playSfx("ui_click");
}

export function playUiBackSfx(): void {
  playSfx("ui_back");
}

export function playMatchFoundSfx(): void {
  playSfx("ui_match_found");
}
