import { Howl } from "howler";

interface AmbientTrack {
  howl: Howl;
  id: number;
  baseVolume: number;
}

const CHAMBER = { src: "/audio/ambient_chamber.ogg", baseVolume: 0.35 };

let chamber: AmbientTrack | null = null;
let muted = false;

export function applyAmbientMute(next: boolean): void {
  muted = next;
  if (!chamber) return;
  chamber.howl.fade(
    chamber.howl.volume(chamber.id) as number,
    next ? 0 : chamber.baseVolume,
    200,
    chamber.id,
  );
}

export function startArenaAmbient(fadeMs = 800): void {
  if (chamber) return;
  const howl = new Howl({
    src: [CHAMBER.src],
    loop: true,
    volume: 0,
    // html5:false — same fade-stuck-at-zero issue as BGM, file is 210KB so
    // Web Audio buffering is fine.
    html5: false,
  });
  const id = howl.play();
  howl.fade(0, muted ? 0 : CHAMBER.baseVolume, fadeMs, id);
  chamber = { howl, id, baseVolume: CHAMBER.baseVolume };
}

export function stopArenaAmbient(fadeMs = 600): void {
  if (!chamber) return;
  chamber.howl.fade(chamber.howl.volume(chamber.id) as number, 0, fadeMs, chamber.id);
  const c = chamber;
  setTimeout(() => c.howl.stop(c.id), fadeMs + 30);
  chamber = null;
}
