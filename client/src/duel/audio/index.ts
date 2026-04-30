import { Howler } from "howler";

import { preloadBgm } from "./bgm";
import { preloadAllSfx } from "./sfx";

let initialized = false;

/**
 * Browsers gate Web Audio behind a user gesture. Call this from the first
 * user click (e.g. TitleScreen "Start"). Resumes Howler's AudioContext and
 * preloads all SFX/BGM Howls so playback latency is near-zero on first use.
 */
export function initAudio(): void {
  if (initialized) return;
  initialized = true;
  const ctx = Howler.ctx as AudioContext | undefined;
  if (ctx && ctx.state !== "running") {
    void ctx.resume().catch(() => {
      /* some browsers reject without a fresh gesture — try again later */
      initialized = false;
    });
  }
  preloadAllSfx();
  preloadBgm();
}

export function isAudioInitialized(): boolean {
  return initialized;
}

export * from "./sfx";
export * from "./bgm";
export * from "./ambient";
export * from "./saberHum";
export * from "./credits";
export * from "./mute";
