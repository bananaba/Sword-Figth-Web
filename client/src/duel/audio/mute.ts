import { create } from "zustand";

import { applyAmbientMute } from "./ambient";
import { applyBgmMute } from "./bgm";
import { applySfxMute } from "./sfx";

const BGM_KEY = "chambara.bgmMuted";
const SFX_KEY = "chambara.sfxMuted";

function readBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* localStorage may be disabled */
  }
}

interface MuteState {
  bgmMuted: boolean;
  sfxMuted: boolean;
  toggleBgm: () => void;
  toggleSfx: () => void;
}

export const useAudioMute = create<MuteState>((set, get) => ({
  bgmMuted: readBool(BGM_KEY),
  sfxMuted: readBool(SFX_KEY),
  toggleBgm: () => {
    const next = !get().bgmMuted;
    writeBool(BGM_KEY, next);
    applyBgmMute(next);
    applyAmbientMute(next);
    set({ bgmMuted: next });
  },
  toggleSfx: () => {
    const next = !get().sfxMuted;
    writeBool(SFX_KEY, next);
    applySfxMute(next);
    set({ sfxMuted: next });
  },
}));

// Apply persisted mute state on module import so refreshes keep the user's
// last preference.
applySfxMute(useAudioMute.getState().sfxMuted);
// BGM/ambient are mutated via fades on the live Howl, so they pick up the
// initial mute state when the first track starts; we still seed both
// modules' internal flags so the very first fade-in honors the toggle.
applyBgmMute(useAudioMute.getState().bgmMuted);
applyAmbientMute(useAudioMute.getState().bgmMuted);

export function isBgmMuted(): boolean {
  return useAudioMute.getState().bgmMuted;
}

export function isSfxMuted(): boolean {
  return useAudioMute.getState().sfxMuted;
}
