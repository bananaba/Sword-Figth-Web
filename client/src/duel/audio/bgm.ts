import { Howl } from "howler";

type BgmTrack = "title" | "match" | "victory" | "defeat";

interface TrackDef {
  src: string;
  loop: boolean;
  volume: number;
}

const TRACKS: Record<BgmTrack, TrackDef> = {
  title: { src: "/audio/bgm_title.ogg", loop: true, volume: 0.5 },
  match: { src: "/audio/bgm_match.ogg", loop: true, volume: 0.5 },
  // 7s stingers, looped — the result screen sits open until the player taps
  // "Back to Title", and an empty silence after the sting felt awkward.
  // Looping keeps the result mood alive without forcing a hard cut to the
  // title bed.
  victory: { src: "/audio/bgm_victory.ogg", loop: true, volume: 0.7 },
  defeat: { src: "/audio/bgm_defeat.ogg", loop: true, volume: 0.6 },
};

const howls = new Map<BgmTrack, Howl>();
let current: { track: BgmTrack; id: number } | null = null;
let muted = false;

export function applyBgmMute(next: boolean): void {
  muted = next;
  if (!current) return;
  const howl = howls.get(current.track);
  if (!howl) return;
  const def = TRACKS[current.track];
  howl.fade(howl.volume(current.id) as number, next ? 0 : def.volume, 200, current.id);
}

function getHowl(track: BgmTrack): Howl {
  const cached = howls.get(track);
  if (cached) return cached;
  const def = TRACKS[track];
  // html5:false (Web Audio) — html5:true silently dropped the fade-in volume
  // ramp on some browsers, leaving BGM at 0 forever. Files are 100KB–1.7MB so
  // memory streaming is fine.
  const howl = new Howl({
    src: [def.src],
    loop: def.loop,
    volume: 0,
    preload: true,
    html5: false,
  });
  howls.set(track, howl);
  return howl;
}

export function preloadBgm(): void {
  for (const track of Object.keys(TRACKS) as BgmTrack[]) {
    getHowl(track);
  }
}

export function playBgm(track: BgmTrack, fadeMs = 600): void {
  if (current?.track === track) return;
  const next = getHowl(track);
  const def = TRACKS[track];

  if (current) {
    const prev = getHowl(current.track);
    prev.fade(prev.volume(current.id) as number, 0, fadeMs, current.id);
    const prevId = current.id;
    setTimeout(() => prev.stop(prevId), fadeMs + 30);
  }

  const id = next.play();
  next.volume(0, id);
  next.fade(0, muted ? 0 : def.volume, fadeMs, id);
  current = { track, id };
}

export function stopBgm(fadeMs = 400): void {
  if (!current) return;
  const howl = getHowl(current.track);
  const id = current.id;
  howl.fade(howl.volume(id) as number, 0, fadeMs, id);
  setTimeout(() => howl.stop(id), fadeMs + 30);
  current = null;
}

export function duckBgm(targetVolume: number, durationMs = 800): void {
  if (!current) return;
  const howl = getHowl(current.track);
  const def = TRACKS[current.track];
  howl.fade(howl.volume(current.id) as number, targetVolume, 200, current.id);
  setTimeout(() => {
    if (current && howl === getHowl(current.track)) {
      howl.fade(howl.volume(current.id) as number, def.volume, 400, current.id);
    }
  }, durationMs);
}
