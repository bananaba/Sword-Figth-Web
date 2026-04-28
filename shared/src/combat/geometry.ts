import type { BodyHitbox, Vec2 } from "./types.js";

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function length(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function normalize(a: Vec2): Vec2 {
  const l = length(a);
  if (l < 1e-9) return { x: 0, y: 0 };
  return { x: a.x / l, y: a.y / l };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Returns true iff the open segments (p1→p2) and (p3→p4) cross. Collinear
 * overlap returns false on purpose — combat doesn't care about parallel
 * coincidence and the angle check downstream would reject it anyway.
 */
export function segmentsIntersect(
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  p4: Vec2,
): boolean {
  const r = sub(p2, p1);
  const s = sub(p4, p3);
  const rxs = cross(r, s);
  if (Math.abs(rxs) < 1e-9) return false;
  const qp = sub(p3, p1);
  const t = cross(qp, s) / rxs;
  const u = cross(qp, r) / rxs;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * Returns true iff the segment a→b touches or crosses the AABB. Used for the
 * "spatial validity" rule (point 2): an attack must actually pass through the
 * opponent's body silhouette to count.
 */
export function segmentIntersectsBox(
  a: Vec2,
  b: Vec2,
  box: BodyHitbox,
): boolean {
  const inside = (p: Vec2): boolean =>
    p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
  if (inside(a) || inside(b)) return true;
  const corners: Vec2[] = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ];
  for (let i = 0; i < 4; i++) {
    const c1 = corners[i]!;
    const c2 = corners[(i + 1) % 4]!;
    if (segmentsIntersect(a, b, c1, c2)) return true;
  }
  return false;
}

/**
 * Acute angle (radians, in [0, π/2]) between two undirected lines defined by
 * their direction vectors. 0 means parallel, π/2 means perpendicular. Sword
 * blades are bidirectional so we always reduce to the acute angle.
 */
export function acuteAngleBetween(d1: Vec2, d2: Vec2): number {
  const n1 = normalize(d1);
  const n2 = normalize(d2);
  if (length(n1) < 1e-9 || length(n2) < 1e-9) return 0;
  const c = clamp(Math.abs(dot(n1, n2)), 0, 1);
  return Math.acos(c);
}
