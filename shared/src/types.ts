export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  position: Vec3;
  rotation: Quat;
  velocity: Vec3;
  health: number;
  score: number;
  lastInputSeq: number;
}

export interface InputCommand {
  seq: number;
  pitch: number;
  yaw: number;
  roll: number;
  throttle: number;
  fire: boolean;
  dt: number;
}

export const PROTOCOL_VERSION = 1 as const;
export const TICK_RATE_HZ = 20 as const;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE_HZ;
