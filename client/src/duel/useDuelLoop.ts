import { useCallback, useRef } from "react";
import {
  BASIC_SWORD,
  applyOutcome,
  resolveAttack,
  tickFighter,
  type AttackEvent,
  type AttackKind,
  type BodyHitbox,
  type FighterState,
  type GuardSnapshot,
  type Outcome,
  type Vec2,
  type WeaponStats,
} from "@vibejam/shared";
export type { WeaponStats };
import type { AttackVisualState, FighterVisualState } from "./Fighter";
import type { MouseAttack } from "./useMouseInput";

/**
 * Internal record of an in-flight attack — what the resolver needs at impact
 * time plus the visual-only fields rendering needs. The duel loop owns these
 * (one per fighter); when `now >= impactAt` and `!resolved` we run the
 * resolver, when `now >= cooldownEndAt` we clear the slot.
 */
interface PendingAttack extends AttackVisualState {
  event: AttackEvent;
  resolved: boolean;
}

const FRICTION = 5.0;
const SHOULDER_Y = 1.15;
const BODY_HALF_W = 0.32;
const BODY_HEIGHT = 1.7;

const COUNTDOWN_MS = 3000;
const ROUND_DURATION_MS = 45_000;
const ROUND_OVER_DISPLAY_MS = 2200;
const WINS_TO_TAKE_MATCH = 2;

/**
 * The resolver's `posX` field is reused as world Z (the duel-line axis).
 * Knockbacks push fighters along Z; falling off is `|worldZ| > arenaRadius`.
 */

export type MatchPhase = "countdown" | "fighting" | "roundOver" | "matchOver";
export type RoundWinner = "player" | "opponent" | "draw";
export type RoundReason = "ringout" | "timeout" | null;

export interface MatchState {
  phase: MatchPhase;
  phaseStartedAt: number;
  roundNumber: number;
  playerWins: number;
  opponentWins: number;
  lastRoundWinner: RoundWinner | null;
  /** How the previous round ended — drives KO splash vs. timeout copy in HUD. */
  lastRoundReason: RoundReason;
  matchWinner: "player" | "opponent" | null;
}

export interface DuelHudState {
  match: MatchState;
  /** ms remaining in current phase (countdown / round timer / round-over). */
  phaseTimeRemainingMs: number;
  playerStunMs: number;
  playerCooldownMs: number;
  playerCounterMs: number;
  opponentStunMs: number;
  playerWorldZ: number;
  opponentWorldZ: number;
  lastOutcome: { kind: Outcome["kind"]; at: number; attackerIsPlayer: boolean } | null;
}

/**
 * Visual impact event — appended to a ring buffer when the resolver fires a
 * non-rejected outcome. Rendering layer (`ImpactRings`) and camera-shake
 * driver consume these by id.
 */
export interface ImpactEvent {
  id: number;
  kind: Outcome["kind"];
  attackerIsPlayer: boolean;
  worldZ: number;
  worldY: number;
  at: number;
}

export interface UseDuelLoopOptions {
  initialPlayerZ: number;
  initialOpponentZ: number;
  arenaRadius: number;
  initialWeapon?: Partial<WeaponStats>;
}

export interface UseDuelLoop {
  playerVisual: React.MutableRefObject<FighterVisualState>;
  opponentVisual: React.MutableRefObject<FighterVisualState>;
  hud: React.MutableRefObject<DuelHudState>;
  /** Ring buffer of recent impacts (rendering + camera shake). Pruned each tick. */
  impactEvents: React.MutableRefObject<ImpactEvent[]>;
  /** Live weapon stats — read by handlers each attack. Mutate via `updateWeapon`. */
  weapon: React.MutableRefObject<WeaponStats>;
  /** Patch weapon stats (e.g. tuning sliders). */
  updateWeapon: (patch: Partial<WeaponStats>) => void;
  /** Drive physics + match state. Call from inside `useFrame`. */
  tick: (dtSeconds: number, now: number) => void;
  /** Player slice/thrust input. Ignored unless we're in the `fighting` phase. */
  handlePlayerAttack: (atk: MouseAttack) => void;
  /** AI attack input (resolved attacker = opponent, defender = player). */
  handleOpponentAttack: (event: AttackEvent) => void;
  /** Update player guard from input each frame. */
  setPlayerGuard: (active: boolean, tipBladePlane: Vec2) => void;
  /** Set opponent guard each frame from AI. */
  setOpponentGuard: (guard: GuardSnapshot) => void;
  /** Update player blade tip used for visual rendering. */
  setPlayerBladeTip: (tip: Vec2) => void;
  /** Snapshot current fighter states (for AI tick read-only access). */
  readFighters: () => { player: FighterState; opponent: FighterState };
  /** Reset the whole match (start new bo3 from round 1). */
  resetMatch: () => void;
}

const DEFAULT_BODY: BodyHitbox = {
  minX: -BODY_HALF_W,
  maxX: BODY_HALF_W,
  minY: 0,
  maxY: BODY_HEIGHT,
};

function freshFighter(initZ: number): FighterState {
  return {
    posX: initZ,
    velX: 0,
    attackCooldownUntil: 0,
    stunUntil: 0,
    counterUntil: 0,
    tradeImmuneUntil: 0,
    guard: {
      active: false,
      grip: { x: 0, y: SHOULDER_Y },
      tip: { x: 0, y: SHOULDER_Y },
    },
  };
}

/**
 * Build a guard segment **centred on the chest** and oriented perpendicular
 * to the chest→pointer direction. Mouse position only chooses the guard's
 * angle, never its position — the segment always pivots around the body
 * centre so the visual stays compact and readable.
 *
 * Endpoints: `chest ± perp * (bladeLength / 2)` where
 * `perp = rotate90(normalize(pointer - chest))`.
 */
export function buildPerpendicularGuard(
  active: boolean,
  pointer: Vec2,
  bladeLength: number,
): GuardSnapshot {
  const chest: Vec2 = { x: 0, y: SHOULDER_Y };
  const dx = pointer.x - chest.x;
  const dy = pointer.y - chest.y;
  const len = Math.hypot(dx, dy);
  // Default to "vertical-up" pointer direction when target sits on chest —
  // yields a horizontal guard at chest level.
  const ndx = len > 1e-6 ? dx / len : 0;
  const ndy = len > 1e-6 ? dy / len : 1;
  const px = -ndy;
  const py = ndx;
  const half = bladeLength / 2;
  return {
    active,
    grip: { x: chest.x - px * half, y: chest.y - py * half },
    tip: { x: chest.x + px * half, y: chest.y + py * half },
  };
}

function initialVisual(
  z: number,
  facing: number,
  color: string,
  transparentWhenIdle: boolean,
): FighterVisualState {
  return {
    worldZ: z,
    facing,
    bladeTipBladePlane: { x: 0, y: SHOULDER_Y + 0.6 },
    guard: { active: false, grip: { x: 0, y: SHOULDER_Y }, tip: { x: 0, y: SHOULDER_Y } },
    attack: null,
    stunned: false,
    cooldown: false,
    tradeImmune: false,
    speed: 0,
    bodyColor: color,
    transparentWhenIdle,
  };
}

function initialMatch(now: number): MatchState {
  return {
    phase: "countdown",
    phaseStartedAt: now,
    roundNumber: 1,
    playerWins: 0,
    opponentWins: 0,
    lastRoundWinner: null,
    lastRoundReason: null,
    matchWinner: null,
  };
}

export function mouseToAttackEvent(atk: MouseAttack, weapon: WeaponStats): AttackEvent {
  if (atk.kind === "slice") {
    const dx = atk.end.x - atk.start.x;
    const dy = atk.end.y - atk.start.y;
    const reach = Math.hypot(dx, dy);
    const inv = reach > 1e-6 ? 1 / reach : 0;
    return {
      kind: "slice",
      origin: atk.start,
      direction: { x: dx * inv, y: dy * inv },
      reach,
      timestamp: atk.timestamp,
    };
  }
  const dx = atk.start.x;
  const dy = atk.start.y - SHOULDER_Y;
  const len = Math.hypot(dx, dy);
  const inv = len > 1e-6 ? 1 / len : 0;
  return {
    kind: "thrust",
    origin: atk.start,
    direction: { x: dx * inv, y: dy * inv },
    reach: weapon.thrustReach,
    timestamp: atk.timestamp,
  };
}

export function useDuelLoop(opts: UseDuelLoopOptions): UseDuelLoop {
  const playerStateRef = useRef<FighterState>(freshFighter(opts.initialPlayerZ));
  const opponentStateRef = useRef<FighterState>(freshFighter(opts.initialOpponentZ));
  const matchRef = useRef<MatchState>(initialMatch(performance.now()));
  const weaponRef = useRef<WeaponStats>({ ...BASIC_SWORD, ...(opts.initialWeapon ?? {}) });
  const pendingPlayerAttack = useRef<PendingAttack | null>(null);
  const pendingOpponentAttack = useRef<PendingAttack | null>(null);
  const impactEvents = useRef<ImpactEvent[]>([]);
  const nextImpactId = useRef<number>(0);

  const updateWeapon = useCallback((patch: Partial<WeaponStats>) => {
    weaponRef.current = { ...weaponRef.current, ...patch };
  }, []);

  const playerVisual = useRef<FighterVisualState>(
    initialVisual(opts.initialPlayerZ, +1, "#3b82f6", true),
  );
  const opponentVisual = useRef<FighterVisualState>(
    initialVisual(opts.initialOpponentZ, -1, "#ef4444", false),
  );

  const hud = useRef<DuelHudState>({
    match: matchRef.current,
    phaseTimeRemainingMs: COUNTDOWN_MS,
    playerStunMs: 0,
    playerCooldownMs: 0,
    playerCounterMs: 0,
    opponentStunMs: 0,
    playerWorldZ: opts.initialPlayerZ,
    opponentWorldZ: opts.initialOpponentZ,
    lastOutcome: null,
  });

  const isFighting = (): boolean => matchRef.current.phase === "fighting";

  /**
   * Build a PendingAttack record for an event. Returns null if the fighter
   * cannot start an attack right now (cooldown, stunned, or already winding
   * up another one). Locks `attackCooldownUntil` immediately so further
   * inputs during the lifecycle are rejected.
   *
   * Visual `start`/`end` differ per attack kind so the two animations read as
   * distinct motions:
   *  - **slice**: `start` = drag start, `end` = drag end. The blade pivots
   *    from grip and the tip arcs through the slice path.
   *  - **thrust**: `start` = ready pose just in front of the chest,
   *    `end` = fully extended (blade length + thrustReach forward). The blade
   *    visibly "stabs" forward instead of sweeping.
   */
  const commitPending = (
    selfRef: React.MutableRefObject<FighterState>,
    pendingRef: React.MutableRefObject<PendingAttack | null>,
    event: AttackEvent,
    kind: AttackKind,
    sliceDragStart: Vec2,
    now: number,
  ): PendingAttack | null => {
    const self = selfRef.current;
    const weapon = weaponRef.current;
    if (now < self.attackCooldownUntil) return null;
    if (now < self.stunUntil) return null;
    if (pendingRef.current) return null;
    if (Math.abs(self.velX) > weapon.motionImmunityVelocityThreshold) return null;

    const windUp = kind === "slice" ? weapon.windUpMs : weapon.thrustChargeMs;
    const impactAt = now + windUp;
    const swingEndAt = impactAt + weapon.swingDurationMs;
    const cooldownEndAt = Math.max(now + weapon.attackCooldownMs, swingEndAt + 80);

    const chest: Vec2 = { x: 0, y: SHOULDER_Y };
    let start: Vec2;
    let end: Vec2;
    if (kind === "slice") {
      start = sliceDragStart;
      end = {
        x: event.origin.x + event.direction.x * event.reach,
        y: event.origin.y + event.direction.y * event.reach,
      };
    } else {
      const dx = event.direction.x;
      const dy = event.direction.y;
      const fullReach = weapon.bladeLength + event.reach;
      // Ready pose: blade short, tip just in front of chest in thrust direction.
      start = { x: chest.x + dx * 0.15, y: chest.y + dy * 0.15 };
      // Fully extended: tip far ahead — visibly "stabs out".
      end = { x: chest.x + dx * fullReach, y: chest.y + dy * fullReach };
    }

    const pending: PendingAttack = {
      event,
      inputAt: now,
      impactAt,
      swingEndAt,
      cooldownEndAt,
      start,
      end,
      kind,
      resolved: false,
    };
    pendingRef.current = pending;
    selfRef.current = { ...self, attackCooldownUntil: cooldownEndAt };
    return pending;
  };

  const handlePlayerAttack = useCallback((atk: MouseAttack) => {
    if (!isFighting()) return;
    const now = performance.now();
    const event = mouseToAttackEvent(atk, weaponRef.current);
    commitPending(
      playerStateRef,
      pendingPlayerAttack,
      event,
      atk.kind,
      atk.start,
      now,
    );
  }, []);

  const handleOpponentAttack = useCallback((event: AttackEvent) => {
    if (!isFighting()) return;
    const now = performance.now();
    commitPending(
      opponentStateRef,
      pendingOpponentAttack,
      event,
      event.kind,
      event.origin,
      now,
    );
  }, []);

  /**
   * Resolve a fighter's pending attack at impact time and apply the outcome
   * to both fighters. Mutates the ref in place to keep `resolved = true`.
   */
  const resolvePending = (
    pendingRef: React.MutableRefObject<PendingAttack | null>,
    attackerRef: React.MutableRefObject<FighterState>,
    defenderRef: React.MutableRefObject<FighterState>,
    attackerIsPlayer: boolean,
    now: number,
  ): void => {
    const pending = pendingRef.current;
    if (!pending || pending.resolved || now < pending.impactAt) return;

    const weapon = weaponRef.current;
    const outcome = resolveAttack(
      attackerRef.current,
      defenderRef.current,
      DEFAULT_BODY,
      pending.event,
      weapon,
      now,
    );
    const facing =
      defenderRef.current.posX >= attackerRef.current.posX ? +1 : -1;
    const next = applyOutcome(
      attackerRef.current,
      defenderRef.current,
      outcome,
      facing,
      now,
      weapon,
    );
    attackerRef.current = next.attacker;
    defenderRef.current = next.defender;
    pending.resolved = true;
    hud.current.lastOutcome = { kind: outcome.kind, at: now, attackerIsPlayer };
    if (outcome.kind !== "rejected" && outcome.kind !== "miss") {
      impactEvents.current.push({
        id: nextImpactId.current++,
        kind: outcome.kind,
        attackerIsPlayer,
        worldZ: defenderRef.current.posX,
        worldY: SHOULDER_Y,
        at: now,
      });
    }
  };

  const setPlayerGuard = useCallback((active: boolean, pointer: Vec2) => {
    const now = performance.now();
    const stunned = isStunnedRaw(playerStateRef.current);
    // Committed to an attack → can't guard until lifecycle ends.
    const attacking =
      pendingPlayerAttack.current !== null &&
      now < pendingPlayerAttack.current.cooldownEndAt;
    const isActive = active && !stunned && !attacking;
    playerStateRef.current = {
      ...playerStateRef.current,
      guard: buildPerpendicularGuard(isActive, pointer, weaponRef.current.bladeLength),
    };
  }, []);

  const setOpponentGuard = useCallback((guard: GuardSnapshot) => {
    const now = performance.now();
    const stunned = isStunnedRaw(opponentStateRef.current);
    const attacking =
      pendingOpponentAttack.current !== null &&
      now < pendingOpponentAttack.current.cooldownEndAt;
    opponentStateRef.current = {
      ...opponentStateRef.current,
      guard: { ...guard, active: guard.active && !stunned && !attacking },
    };
  }, []);

  const setPlayerBladeTip = useCallback((tip: Vec2) => {
    playerVisual.current.bladeTipBladePlane = tip;
  }, []);

  const readFighters = useCallback(
    () => ({ player: playerStateRef.current, opponent: opponentStateRef.current }),
    [],
  );

  const resetForNextRound = useCallback(() => {
    playerStateRef.current = freshFighter(opts.initialPlayerZ);
    opponentStateRef.current = freshFighter(opts.initialOpponentZ);
    pendingPlayerAttack.current = null;
    pendingOpponentAttack.current = null;
    playerVisual.current.attack = null;
    opponentVisual.current.attack = null;
  }, [opts.initialPlayerZ, opts.initialOpponentZ]);

  const resetMatch = useCallback(() => {
    matchRef.current = initialMatch(performance.now());
    resetForNextRound();
    hud.current.lastOutcome = null;
    impactEvents.current = [];
  }, [resetForNextRound]);

  const tick = useCallback(
    (dt: number, now: number) => {
      // Advance match phase machine first
      const match = matchRef.current;
      const phaseElapsed = now - match.phaseStartedAt;

      switch (match.phase) {
        case "countdown":
          if (phaseElapsed >= COUNTDOWN_MS) {
            resetForNextRound();
            matchRef.current = { ...match, phase: "fighting", phaseStartedAt: now };
          }
          break;
        case "fighting": {
          const playerOut = Math.abs(playerStateRef.current.posX) > opts.arenaRadius;
          const oppOut = Math.abs(opponentStateRef.current.posX) > opts.arenaRadius;
          let winner: RoundWinner | null = null;
          let reason: RoundReason = null;
          if (playerOut && oppOut) {
            winner = "draw";
            reason = "ringout";
          } else if (oppOut) {
            winner = "player";
            reason = "ringout";
          } else if (playerOut) {
            winner = "opponent";
            reason = "ringout";
          } else if (phaseElapsed >= ROUND_DURATION_MS) {
            // Time-out: closer-to-center wins, tie if equal-ish
            const d1 = Math.abs(playerStateRef.current.posX);
            const d2 = Math.abs(opponentStateRef.current.posX);
            if (Math.abs(d1 - d2) < 0.05) winner = "draw";
            else winner = d1 < d2 ? "player" : "opponent";
            reason = "timeout";
          }
          if (winner) {
            const playerWins = match.playerWins + (winner === "player" ? 1 : 0);
            const opponentWins = match.opponentWins + (winner === "opponent" ? 1 : 0);
            matchRef.current = {
              ...match,
              phase: "roundOver",
              phaseStartedAt: now,
              lastRoundWinner: winner,
              lastRoundReason: reason,
              playerWins,
              opponentWins,
            };
          }
          break;
        }
        case "roundOver":
          if (phaseElapsed >= ROUND_OVER_DISPLAY_MS) {
            const m = matchRef.current;
            if (
              m.playerWins >= WINS_TO_TAKE_MATCH ||
              m.opponentWins >= WINS_TO_TAKE_MATCH
            ) {
              matchRef.current = {
                ...m,
                phase: "matchOver",
                phaseStartedAt: now,
                matchWinner: m.playerWins >= WINS_TO_TAKE_MATCH ? "player" : "opponent",
              };
            } else {
              matchRef.current = {
                ...m,
                phase: "countdown",
                phaseStartedAt: now,
                roundNumber: m.roundNumber + 1,
              };
              resetForNextRound();
            }
          }
          break;
        case "matchOver":
          break;
      }

      // Physics — only meaningful during fighting (positions/cooldowns frozen otherwise)
      if (matchRef.current.phase === "fighting") {
        playerStateRef.current = tickFighter(playerStateRef.current, dt, FRICTION);
        opponentStateRef.current = tickFighter(opponentStateRef.current, dt, FRICTION);

        // Fire pending attack resolutions at their impact moments. The resolver
        // uses the latest fighter state — including whatever guard the defender
        // adopted during the wind-up telegraph — which is the whole point of
        // the delay.
        resolvePending(pendingPlayerAttack, playerStateRef, opponentStateRef, true, now);
        resolvePending(pendingOpponentAttack, opponentStateRef, playerStateRef, false, now);

        // Clear pending records once the cooldown window has fully elapsed.
        if (
          pendingPlayerAttack.current &&
          now >= pendingPlayerAttack.current.cooldownEndAt
        ) {
          pendingPlayerAttack.current = null;
        }
        if (
          pendingOpponentAttack.current &&
          now >= pendingOpponentAttack.current.cooldownEndAt
        ) {
          pendingOpponentAttack.current = null;
        }
      } else {
        playerStateRef.current = { ...playerStateRef.current, velX: 0 };
        opponentStateRef.current = { ...opponentStateRef.current, velX: 0 };
      }

      const p = playerStateRef.current;
      const o = opponentStateRef.current;

      playerVisual.current.worldZ = p.posX;
      playerVisual.current.guard = p.guard;
      playerVisual.current.attack = pendingPlayerAttack.current;
      playerVisual.current.stunned = now < p.stunUntil;
      playerVisual.current.cooldown = now < p.attackCooldownUntil;
      playerVisual.current.tradeImmune = now < p.tradeImmuneUntil;
      playerVisual.current.speed = Math.abs(p.velX);

      opponentVisual.current.worldZ = o.posX;
      opponentVisual.current.bladeTipBladePlane = o.guard.active
        ? o.guard.tip
        : { x: 0, y: SHOULDER_Y + 0.6 };
      opponentVisual.current.guard = o.guard;
      opponentVisual.current.attack = pendingOpponentAttack.current;
      opponentVisual.current.stunned = now < o.stunUntil;
      opponentVisual.current.cooldown = now < o.attackCooldownUntil;
      opponentVisual.current.tradeImmune = now < o.tradeImmuneUntil;
      opponentVisual.current.speed = Math.abs(o.velX);

      const phaseDeadline =
        matchRef.current.phase === "countdown"
          ? COUNTDOWN_MS
          : matchRef.current.phase === "fighting"
          ? ROUND_DURATION_MS
          : matchRef.current.phase === "roundOver"
          ? ROUND_OVER_DISPLAY_MS
          : Infinity;

      hud.current.match = matchRef.current;
      hud.current.phaseTimeRemainingMs = Math.max(
        0,
        phaseDeadline - (now - matchRef.current.phaseStartedAt),
      );
      hud.current.playerStunMs = Math.max(0, p.stunUntil - now);
      hud.current.playerCooldownMs = Math.max(0, p.attackCooldownUntil - now);
      hud.current.playerCounterMs = Math.max(0, p.counterUntil - now);
      hud.current.opponentStunMs = Math.max(0, o.stunUntil - now);
      hud.current.playerWorldZ = p.posX;
      hud.current.opponentWorldZ = o.posX;

      // Prune stale impact events (keep ~700ms ring lifetime headroom).
      if (impactEvents.current.length > 0) {
        const cutoff = now - 800;
        impactEvents.current = impactEvents.current.filter((e) => e.at >= cutoff);
      }
    },
    [opts.arenaRadius, resetForNextRound],
  );

  return {
    playerVisual,
    opponentVisual,
    hud,
    impactEvents,
    weapon: weaponRef,
    updateWeapon,
    tick,
    handlePlayerAttack,
    handleOpponentAttack,
    setPlayerGuard,
    setOpponentGuard,
    setPlayerBladeTip,
    readFighters,
    resetMatch,
  };
}

function isStunnedRaw(state: FighterState): boolean {
  return performance.now() < state.stunUntil;
}
