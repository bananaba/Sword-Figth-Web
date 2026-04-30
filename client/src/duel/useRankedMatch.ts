import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PLASMA_BLADE,
  type AttackEvent,
  createBladeTipPredictor,
  type FighterState,
  type GuardSnapshot,
  updateBladeTipPrediction,
  type Vec2,
  type WeaponStats,
} from "@vibejam/shared";
import type {
  AttackVisualState,
  FighterVisualState,
} from "./Fighter";
import type { MouseAttack } from "./useMouseInput";
import {
  buildPerpendicularGuard,
  mouseToAttackEvent,
  type DuelHudState,
  type MatchPhase,
  type MatchState,
  type RoundReason,
  type RoundWinner,
  type UseDuelLoop,
} from "./useDuelLoop";
import { dispatchImpactFx } from "./dispatchImpactFx";
import { useFlash } from "./stores/useFlash";
import { useImpacts } from "./stores/useImpacts";
import { useShake } from "./stores/useShake";
import { useTimeScale } from "./stores/useTimeScale";
import { RankedClient, roomWsUrl } from "./network/RankedClient";
import {
  getOrCreatePlayerId,
  getWorkerUrl,
  pollUntilMatched,
  readStoredRating,
  writeStoredRating,
} from "./network/matchmake";
import type {
  DuelSide,
  FighterNetState,
  MatchRatings,
  ServerMatchPhase,
  ServerMessage,
} from "./network/types";

const SHOULDER_Y = 1.15;
const COUNTDOWN_MS = 3000;
const ROUND_DURATION_MS = 45_000;
const ROUND_OVER_DISPLAY_MS = 2200;

/**
 * Server-state-driven counterpart to `useDuelLoop`. Same return shape so
 * `Duel.tsx`'s rendering can mount either hook based on `identity.mode`.
 *
 * Authority differences from solo:
 *  - **No physics tick.** Visual `worldZ` lerps toward the latest server
 *    `posX`; we don't run `tickFighter`.
 *  - **No resolver.** Outcomes arrive as `impact` messages and route through
 *    the same `dispatchImpactFx` (Phase 10a integration point).
 *  - **No ringout/timeout detection.** Server emits `round_over` with the
 *    authoritative `winner`/`reason`.
 *  - **Match phase machine** is rebuilt from `match_state`/`round_over`/
 *    `match_over` messages instead of timing locally.
 *  - **Player attacks animate optimistically** (local AttackVisualState ring
 *    so the swing is visible immediately) but the resolver outcome comes
 *    from the server. A failed attack just doesn't dispatch FX.
 *  - **Opponent's blade has no wind-up animation** — server doesn't send
 *    pendingAttack telegraph yet (Phase 11.5 candidate). Their blade just
 *    sits in guard pose until an `impact` arrives.
 */

export type RankedConnectionStatus =
  | "matchmaking"
  | "queued"
  | "connecting"
  | "waitingForOpponent"
  | "in_match"
  | "match_over"
  | "disconnected"
  | "error";

export interface RankedSummary {
  status: RankedConnectionStatus;
  /** Estimated # of players ahead of us in the queue (worker reports `queueSize`). */
  queueSize: number;
  /** Side assigned by server once `hello` is acknowledged. */
  side: DuelSide | null;
  /** Opponent display info (filled once both players are in `room_state`). */
  opponent: {
    name: string;
    rating: number;
    saberColor: string;
  } | null;
  /** Final match result + rating delta (filled on `match_over`). */
  matchOver: {
    winner: "player" | "opponent";
    ratings: MatchRatings | null;
  } | null;
  /** Soft error string if matchmake or WS failed. */
  errorMessage: string | null;
}

export interface UseRankedMatchOptions {
  initialPlayerZ: number;
  initialOpponentZ: number;
  identity: { name: string; saberColor: string };
  roomId?: string;
  recordResult?: boolean;
}

export interface UseRankedMatchResult extends UseDuelLoop {
  summary: RankedSummary;
  /** Disconnect + go back to title screen (or whatever caller does). */
  leaveMatch: () => void;
}

// Visual smoothing — fraction of the gap closed per frame at ~60fps. Higher
// = snappier (more raw teleports), lower = smoother (more visual lag).
// 0.32 hides 30Hz state quantization while keeping reactions feel fast.
const POSITION_LERP = 0.18;
// Throttle outgoing guard updates to ~30Hz. The render loop ticks 60+Hz so
// without this we'd flood the WS with redundant guard packets.
const GUARD_SEND_INTERVAL_MS = 33;

const NEUTRAL_BODY = "#64748b";

function freshFighter(initX: number): FighterState {
  return {
    posX: initX,
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

function initialVisual(
  z: number,
  facing: number,
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
    bodyColor: NEUTRAL_BODY,
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

/** Map server's `waiting`/`countdown`/`fighting`/`roundOver`/`matchOver`
 *  to client's `MatchPhase`. The `waiting` lobby state is presented as a
 *  client-side `countdown` so HUD rendering doesn't need to know. */
function mapPhase(serverPhase: ServerMatchPhase): MatchPhase {
  if (serverPhase === "waiting") return "countdown";
  return serverPhase;
}

export function useRankedMatch(opts: UseRankedMatchOptions): UseRankedMatchResult {
  const playerVisual = useRef<FighterVisualState>(
    initialVisual(opts.initialPlayerZ, +1, true),
  );
  const opponentVisual = useRef<FighterVisualState>(
    initialVisual(opts.initialOpponentZ, -1, false),
  );

  // Keep a "fighter state" mirror for `readFighters` consumers (AI tick is
  // skipped in ranked mode but the contract still expects this).
  const playerFighter = useRef<FighterState>(freshFighter(opts.initialPlayerZ));
  const opponentFighter = useRef<FighterState>(freshFighter(opts.initialOpponentZ));

  const weaponRef = useRef<WeaponStats>({ ...PLASMA_BLADE });

  // Latest fighter snapshots from server `state` (target for interpolation).
  const targetPlayer = useRef<FighterNetState | null>(null);
  const targetOpponent = useRef<FighterNetState | null>(null);
  const opponentBladeTipPredictor = useRef(
    createBladeTipPredictor({ x: 0, y: SHOULDER_Y + 0.6 }),
  );

  // Server clock anchoring — `currentServerNow = lastServerNow + (now - lastServerNowAt)`.
  // Used to compute remaining stun/cooldown/phase ms in server-time.
  const lastServerNow = useRef<number>(0);
  const lastServerNowAt = useRef<number>(performance.now());

  // Match phase mirror (drives HUD).
  const matchRef = useRef<MatchState>(initialMatch(performance.now()));
  // `phaseEndsAt` is in server-clock ms — converted to remainingMs each tick.
  const phaseEndsAtServer = useRef<number>(0);

  // Local player attack ref so the blade animates immediately on input
  // (server-roundtrip would feel laggy). Cleared after cooldownEndAt OR
  // earlier if the server didn't ack with an `impact` within roundtrip.
  const localPlayerAttack = useRef<AttackVisualState | null>(null);
  // Set true when an `impact` for our side arrives (any outcome — hit,
  // pierce, block, miss, rejected). Server broadcasts impact for every
  // resolved attack, so absence within ~RTT means the request never
  // reached fighting state (network drop or `not_fighting` error).
  const localPlayerAttackConfirmed = useRef<boolean>(false);
  // Server-driven opponent swing visual. Populated when the server broadcasts
  // an `attack_telegraph` for the *other* side; cleared after cooldownEndAt
  // so we don't render a ghost swing.
  const opponentAttack = useRef<AttackVisualState | null>(null);

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

  const [summary, setSummary] = useState<RankedSummary>({
    status: "matchmaking",
    queueSize: 0,
    side: null,
    opponent: null,
    matchOver: null,
    errorMessage: null,
  });
  const summaryRef = useRef(summary);
  summaryRef.current = summary;
  const updateSummary = useCallback((patch: Partial<RankedSummary>) => {
    setSummary((prev) => ({ ...prev, ...patch }));
  }, []);

  // Side gets assigned only after server `hello` ack — store as ref so
  // outgoing guards/attacks can know which side we are without re-render.
  const ourSide = useRef<DuelSide | null>(null);

  // WS client + abort signal for the matchmake polling loop.
  const clientRef = useRef<RankedClient | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const lastGuardSentAt = useRef<number>(0);
  const lastTipSentAt = useRef<number>(0);

  // ── Server message handler ─────────────────────────────────────────────
  const handleServerMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.t) {
        case "hello": {
          ourSide.current = msg.side;
          writeStoredRating(msg.rating);
          updateSummary({ side: msg.side, status: "waitingForOpponent" });
          // Auto-ready the moment we know our side. Both clients ready ⇒
          // server flips to `countdown` and `match_state` follows.
          clientRef.current?.send({ t: "ready", now: Date.now() });
          break;
        }
        case "room_state": {
          const opponentEntry = msg.players.find(
            (p) => p.side !== ourSide.current,
          );
          if (opponentEntry) {
            updateSummary({
              opponent: {
                name: opponentEntry.name,
                rating: opponentEntry.rating,
                saberColor: opponentEntry.saberColor,
              },
            });
          }
          break;
        }
        case "match_state": {
          const phase = mapPhase(msg.phase);
          const localNow = performance.now();
          const wins = winsForSide(ourSide.current, msg.playerWins, msg.opponentWins);
          matchRef.current = {
            ...matchRef.current,
            phase,
            phaseStartedAt: localNow,
            roundNumber: msg.roundNumber,
            playerWins: wins.ours,
            opponentWins: wins.theirs,
          };
          phaseEndsAtServer.current = msg.phaseEndsAt;
          if (phase === "fighting" || phase === "countdown") {
            updateSummary({ status: "in_match" });
          }
          break;
        }
        case "round_over": {
          // Server's `winner` is in server-side terms (player = side "player").
          // Rewrite to our local frame so HUD copy reads naturally regardless
          // of which slot we got assigned.
          const localWinner = winnerForSide(ourSide.current, msg.winner);
          const wins = winsForSide(ourSide.current, msg.playerWins, msg.opponentWins);
          matchRef.current = {
            ...matchRef.current,
            phase: "roundOver",
            phaseStartedAt: performance.now(),
            lastRoundWinner: localWinner,
            lastRoundReason: msg.reason as RoundReason,
            playerWins: wins.ours,
            opponentWins: wins.theirs,
          };
          phaseEndsAtServer.current = msg.phaseEndsAt;
          break;
        }
        case "match_over": {
          const localWinner = msg.winner === ourSide.current ? "player" : "opponent";
          matchRef.current = {
            ...matchRef.current,
            phase: "matchOver",
            phaseStartedAt: performance.now(),
            matchWinner: localWinner,
          };
          // Persist the new rating so the next session opens with the right
          // matchmaking range (worker `RankedQueue` matches within ±200).
          if (msg.ratings && opts.recordResult !== false) {
            const ourRating =
              ourSide.current === "player"
                ? msg.ratings.player.after
                : msg.ratings.opponent.after;
            writeStoredRating(ourRating);
          }
          // Mirror ratings to local frame: `ratings.player` should always be
          // *us*, regardless of which slot we got assigned. Without this the
          // overlay shows the winner's rating change to the loser and vice
          // versa.
          let localRatings = msg.ratings;
          if (
            localRatings &&
            ourSide.current === "opponent"
          ) {
            localRatings = {
              player: localRatings.opponent,
              opponent: localRatings.player,
            };
          }
          updateSummary({
            status: "match_over",
            matchOver: {
              winner: localWinner,
              ratings: opts.recordResult === false ? null : localRatings,
            },
          });
          break;
        }
        case "state": {
          const localNow = performance.now();
          lastServerNow.current = msg.serverNow;
          lastServerNowAt.current = localNow;
          if (ourSide.current === "opponent") {
            // Server labels are in server's own frame: `player` = side
            // "player" (worldZ -1.6, facing +1) and `opponent` = side
            // "opponent" (worldZ +1.6, facing -1). We mirror BOTH the slot
            // assignment AND the world-axis sign so our local frame is always
            // "player at -1.6, opponent at +1.6, camera behind us looking +Z".
            // Without the negate the camera would sit on the wrong side and
            // both fighters would render at server's far end.
            targetPlayer.current = {
              ...msg.opponent,
              posX: -msg.opponent.posX,
              velX: -msg.opponent.velX,
            };
            targetOpponent.current = {
              ...msg.player,
              posX: -msg.player.posX,
              velX: -msg.player.velX,
            };
          } else {
            targetPlayer.current = msg.player;
            targetOpponent.current = msg.opponent;
          }
          if (targetOpponent.current) {
            const opponentTipTarget = targetOpponent.current.bladeTip
              ?? (targetOpponent.current.guard.active
                ? targetOpponent.current.guard.tip
                : { x: 0, y: SHOULDER_Y + 0.6 });
            opponentBladeTipPredictor.current = updateBladeTipPrediction(
              opponentBladeTipPredictor.current,
              {
                kind: "snapshot",
                tip: opponentTipTarget,
                receivedAtMs: localNow,
              },
            );
          }
          break;
        }
        case "impact": {
          // Server outcome → same dispatcher as solo. The `attackerIsPlayer`
          // flag tells `dispatchImpactFx` which side to anchor the impact
          // ring on; rewrite to our local frame.
          const attackerIsPlayer = msg.attackerSide === ourSide.current;
          // Confirm our optimistic visual regardless of outcome — even
          // miss/rejected proves the server saw and processed the attack,
          // so the visual should run its full cooldown lifecycle.
          if (attackerIsPlayer) {
            localPlayerAttackConfirmed.current = true;
          }
          const defenderTarget = attackerIsPlayer
            ? targetOpponent.current
            : targetPlayer.current;
          const worldZ = defenderTarget?.posX ?? 0;
          const kind = msg.outcome.kind;
          if (kind === "hit" || kind === "pierce" || kind === "block") {
            dispatchImpactFx(kind, {
              attackerIsPlayer,
              worldZ,
              worldY: SHOULDER_Y,
              now: performance.now(),
            });
            hud.current.lastOutcome = {
              kind,
              at: performance.now(),
              attackerIsPlayer,
            };
          }
          break;
        }
        case "attack_telegraph": {
          // Server tells us a swing started — render it on whichever side it
          // came from. Our own side is already optimistically visualised, so
          // skip the self-echo to avoid restarting the swing mid-flight.
          if (msg.side === ourSide.current) break;
          const dragEnd = {
            x: msg.origin.x + msg.direction.x * msg.reach,
            y: msg.origin.y + msg.direction.y * msg.reach,
          };
          opponentAttack.current = {
            inputAt: msg.inputAt,
            impactAt: msg.impactAt,
            swingEndAt: msg.swingEndAt,
            cooldownEndAt: msg.cooldownEndAt,
            start: msg.origin,
            end: dragEnd,
            kind: msg.kind,
          };
          break;
        }
        case "error":
          // Server-level rejection (e.g. invalid attack). Surface for now;
          // full UI for these is out-of-scope for jam.
          updateSummary({ errorMessage: `server_error_${msg.error}` });
          break;
      }
    },
    [opts.recordResult, updateSummary],
  );

  // ── Connect once on mount ──────────────────────────────────────────────
  useEffect(() => {
    const abort = new AbortController();
    abortRef.current = abort;
    const playerId = getOrCreatePlayerId();
    const rating = readStoredRating();
    const workerUrl = getWorkerUrl();

    let cancelled = false;
    (async () => {
      try {
        updateSummary({
          status: opts.roomId ? "connecting" : "matchmaking",
          errorMessage: null,
        });
        const roomId =
          opts.roomId ??
          (await pollUntilMatched(
            workerUrl,
            {
              playerId,
              name: opts.identity.name,
              rating,
              saberColor: opts.identity.saberColor,
            },
            (queueSize) => {
              if (!cancelled) updateSummary({ status: "queued", queueSize });
            },
            abort.signal,
          ));
        if (cancelled) return;
        updateSummary({ status: "connecting" });
        const url = roomWsUrl(workerUrl, roomId, {
          record: opts.recordResult === false ? "0" : "1",
        });
        const client = new RankedClient({
          url,
          onMessage: handleServerMessage,
          onStatusChange: (status) => {
            if (status === "open") {
              client.send({
                t: "hello",
                player: {
                  playerId,
                  name: opts.identity.name,
                  rating,
                  saberColor: opts.identity.saberColor,
                },
              });
            }
            if (status === "closed" || status === "errored") {
              if (summaryRef.current.status !== "match_over") {
                updateSummary({ status: "disconnected" });
              }
            }
          },
          onError: (err) => {
            updateSummary({ errorMessage: err.message });
          },
        });
        clientRef.current = client;
        client.connect();
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        if (message !== "matchmake_aborted") {
          updateSummary({ status: "error", errorMessage: message });
        }
      }
    })();

    return () => {
      cancelled = true;
      abort.abort();
      clientRef.current?.close();
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.identity.name, opts.identity.saberColor, opts.recordResult, opts.roomId]);

  // ── Input handlers ─────────────────────────────────────────────────────
  const handlePlayerAttack = useCallback(
    (atk: MouseAttack) => {
      if (matchRef.current.phase !== "fighting") return;
      const event = mouseToAttackEvent(atk, weaponRef.current);
      const now = performance.now();
      // Optimistic blade animation (local-only). Server outcome routes
      // through `impact` and triggers FX via dispatcher.
      const weapon = weaponRef.current;
      const windUp = atk.kind === "slice" ? weapon.windUpMs : weapon.thrustChargeMs;
      const impactAt = now + windUp;
      const swingEndAt = impactAt + weapon.swingDurationMs;
      const cooldownEndAt = Math.max(now + weapon.attackCooldownMs, swingEndAt + 80);
      const chest: Vec2 = { x: 0, y: SHOULDER_Y };
      let start: Vec2;
      let end: Vec2;
      if (atk.kind === "slice") {
        start = atk.start;
        end = {
          x: event.origin.x + event.direction.x * event.reach,
          y: event.origin.y + event.direction.y * event.reach,
        };
      } else {
        const fullReach = weapon.bladeLength + event.reach;
        start = { x: chest.x + event.direction.x * 0.15, y: chest.y + event.direction.y * 0.15 };
        end = {
          x: chest.x + event.direction.x * fullReach,
          y: chest.y + event.direction.y * fullReach,
        };
      }
      localPlayerAttack.current = {
        inputAt: now,
        impactAt,
        swingEndAt,
        cooldownEndAt,
        start,
        end,
        kind: atk.kind,
      };
      localPlayerAttackConfirmed.current = false;
      // Server's `parseAttack` reads kind/origin/direction/reach from the
      // top-level message — flatten the AttackEvent so the wire format matches.
      clientRef.current?.send({
        t: "attack",
        kind: event.kind,
        origin: event.origin,
        direction: event.direction,
        reach: event.reach,
        now: Date.now(),
      });
    },
    [],
  );

  const handleOpponentAttack = useCallback((_event: AttackEvent) => {
    /* AI is disabled in ranked mode; server runs the opposing fighter. */
  }, []);

  const setPlayerGuard = useCallback((active: boolean, pointer: Vec2) => {
    const now = performance.now();
    const guard = buildPerpendicularGuard(active, pointer, weaponRef.current.bladeLength);
    // Local instant feedback so the player's own guard renders without
    // server roundtrip.
    playerVisual.current.guard = guard;
    if (now - lastGuardSentAt.current >= GUARD_SEND_INTERVAL_MS) {
      lastGuardSentAt.current = now;
      // Server's `parseGuard` reads active/grip/tip from the top-level
      // message object — flatten to match the wire format (same pattern as
      // the `attack` message).
      clientRef.current?.send({
        t: "guard",
        active: guard.active,
        grip: guard.grip,
        tip: guard.tip,
      });
    }
  }, []);

  const setOpponentGuard = useCallback((_guard: GuardSnapshot) => {
    /* AI no-op. Opponent guard arrives via server `state`. */
  }, []);

  const setPlayerBladeTip = useCallback((tip: Vec2) => {
    playerVisual.current.bladeTipBladePlane = tip;
    // Throttle outgoing tip updates to ~30 Hz (same cadence as guard).
    const now = performance.now();
    if (now - lastTipSentAt.current >= GUARD_SEND_INTERVAL_MS) {
      lastTipSentAt.current = now;
      clientRef.current?.send({ t: "tip", tip });
    }
  }, []);

  const readFighters = useCallback(
    () => ({
      player: playerFighter.current,
      opponent: opponentFighter.current,
    }),
    [],
  );

  const updateWeapon = useCallback((patch: Partial<WeaponStats>) => {
    weaponRef.current = { ...weaponRef.current, ...patch };
  }, []);

  const leaveMatch = useCallback(() => {
    abortRef.current?.abort();
    clientRef.current?.close();
    clientRef.current = null;
    useImpacts.getState().clear();
    useShake.getState().reset();
    useFlash.getState().reset();
    // useTimeScale has no `reset` — directly snap to idle/1.0.
    useTimeScale.setState({ envelope: { kind: "idle" }, scale: 1 });
  }, []);

  const resetMatch = useCallback(() => {
    // In ranked the only "reset" gesture is to leave and re-queue (or go
    // back to title). Caller wires this through `leaveMatch` if it wants
    // to surface a "back to title" button.
    leaveMatch();
  }, [leaveMatch]);

  // ── Per-frame tick ─────────────────────────────────────────────────────
  const tick = useCallback((dt: number, now: number) => {
    void dt;
    const tp = targetPlayer.current;
    const to = targetOpponent.current;
    // Server clock is anchored at the most recent `state` message. Before
    // any state arrives, we have no calibration — comparing local Date.now()
    // against absolute server timestamps (stunUntil, attackCooldownUntil)
    // would produce arbitrary offsets, manifesting as huge spurious "stun
    // remaining" values in the HUD. Use a sentinel and clamp downstream.
    const haveServerClock = lastServerNow.current !== 0;
    const serverNow = haveServerClock
      ? lastServerNow.current + (now - lastServerNowAt.current)
      : 0;

    // Position lerp toward latest server target. Visual posX is what the
    // camera follows; logical fighter mirror tracks the server snapshot.
    if (tp) {
      // Pure visual lerp toward the latest server snapshot — no dead
      // reckoning. Combining client-side integration with periodic snapshot
      // overrides produced jitter where every 30 Hz tick "popped" the target
      // forward. A slow lerp absorbs that snap so the camera glides instead.
      playerVisual.current.worldZ = lerp(
        playerVisual.current.worldZ,
        tp.posX,
        POSITION_LERP,
      );
      // NOTE: guard is intentionally NOT overwritten from the server snapshot.
      // Local input is authoritative for the player's own visual; otherwise
      // the round of "client presses RMB → server hasn't acked yet → snapshot
      // arrives with guard=false → visual flickers off" makes guard feel
      // broken right after a phase transition.
      playerVisual.current.stunned = haveServerClock && serverNow < tp.stunUntil;
      playerVisual.current.cooldown = haveServerClock && serverNow < tp.attackCooldownUntil;
      playerVisual.current.tradeImmune = false;
      playerVisual.current.speed = Math.abs(tp.velX);
      playerVisual.current.attack = localPlayerAttack.current;
      playerFighter.current = {
        posX: tp.posX,
        velX: tp.velX,
        attackCooldownUntil: tp.attackCooldownUntil,
        stunUntil: tp.stunUntil,
        counterUntil: tp.counterUntil,
        tradeImmuneUntil: 0,
        guard: tp.guard,
      };
    }
    if (to) {
      opponentVisual.current.worldZ = lerp(
        opponentVisual.current.worldZ,
        to.posX,
        POSITION_LERP,
      );
      opponentVisual.current.guard = to.guard;
      // Live opponent blade tip — server broadcasts it at ~30 Hz. Predict a
      // short distance along the latest measured cursor velocity so the sword
      // keeps moving between packets, while the shared predictor clamps lead
      // time/distance to avoid wild overshoot when packets stall.
      opponentBladeTipPredictor.current = updateBladeTipPrediction(
        opponentBladeTipPredictor.current,
        { kind: "frame", dtSeconds: dt, nowMs: now },
      );
      opponentVisual.current.bladeTipBladePlane =
        opponentBladeTipPredictor.current.rendered;
      opponentVisual.current.stunned = haveServerClock && serverNow < to.stunUntil;
      opponentVisual.current.cooldown = haveServerClock && serverNow < to.attackCooldownUntil;
      opponentVisual.current.tradeImmune = false;
      opponentVisual.current.speed = Math.abs(to.velX);
      // Drive opponent attack visual from the latest telegraph the server
      // broadcast — clear once its cooldown elapses so we don't render a
      // ghost swing.
      const oa = opponentAttack.current;
      if (oa && now >= oa.cooldownEndAt) opponentAttack.current = null;
      opponentVisual.current.attack = opponentAttack.current;
      opponentFighter.current = {
        posX: to.posX,
        velX: to.velX,
        attackCooldownUntil: to.attackCooldownUntil,
        stunUntil: to.stunUntil,
        counterUntil: to.counterUntil,
        tradeImmuneUntil: 0,
        guard: to.guard,
      };
    }

    // Clear local optimistic attack. Two terminating conditions:
    //   1. Cooldown elapsed — normal lifecycle end (server acked OR didn't,
    //      either way the visual has run its course).
    //   2. Server never acked within REJECT_TIMEOUT_MS past the expected
    //      impact moment — the attack never reached fighting state (network
    //      stall or `not_fighting` error). Don't keep a phantom swing on
    //      screen; clear early so the next input feels responsive.
    const REJECT_TIMEOUT_MS = 220;
    const a = localPlayerAttack.current;
    if (a) {
      const past = now >= a.cooldownEndAt;
      const unacked =
        !localPlayerAttackConfirmed.current && now >= a.impactAt + REJECT_TIMEOUT_MS;
      if (past || unacked) {
        localPlayerAttack.current = null;
        localPlayerAttackConfirmed.current = false;
      }
    }

    const phaseDeadline =
      matchRef.current.phase === "countdown"
        ? COUNTDOWN_MS
        : matchRef.current.phase === "fighting"
        ? ROUND_DURATION_MS
        : matchRef.current.phase === "roundOver"
        ? ROUND_OVER_DISPLAY_MS
        : Infinity;
    // Phase remaining = server `phaseEndsAt` - server clock estimate. Falls
    // back to a deadline-from-phaseStarted estimate if we haven't received
    // the timestamp yet (first frames).
    const remaining =
      phaseEndsAtServer.current > 0 && haveServerClock
        ? Math.max(0, phaseEndsAtServer.current - serverNow)
        : Math.max(0, phaseDeadline - (now - matchRef.current.phaseStartedAt));

    hud.current.match = matchRef.current;
    hud.current.phaseTimeRemainingMs = remaining;
    hud.current.playerStunMs =
      tp && haveServerClock ? Math.max(0, tp.stunUntil - serverNow) : 0;
    hud.current.playerCooldownMs =
      tp && haveServerClock ? Math.max(0, tp.attackCooldownUntil - serverNow) : 0;
    hud.current.playerCounterMs =
      tp && haveServerClock ? Math.max(0, tp.counterUntil - serverNow) : 0;
    hud.current.opponentStunMs =
      to && haveServerClock ? Math.max(0, to.stunUntil - serverNow) : 0;
    hud.current.playerWorldZ = playerVisual.current.worldZ;
    hud.current.opponentWorldZ = opponentVisual.current.worldZ;

    useImpacts.getState().prune(now, 800);
  }, []);

  const result = useMemo<UseRankedMatchResult>(
    () => ({
      playerVisual,
      opponentVisual,
      hud,
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
      summary,
      leaveMatch,
    }),
    [
      handleOpponentAttack,
      handlePlayerAttack,
      leaveMatch,
      readFighters,
      resetMatch,
      setOpponentGuard,
      setPlayerBladeTip,
      setPlayerGuard,
      summary,
      tick,
      updateWeapon,
    ],
  );

  return result;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Server reports `playerWins` / `opponentWins` from its own slot frame
 * (slot called "player" is fixed). If we got assigned the "opponent" slot,
 * the server's `opponentWins` are OUR wins. Always present OUR count first.
 */
function winsForSide(
  ourSide: DuelSide | null,
  serverPlayerWins: number,
  serverOpponentWins: number,
): { ours: number; theirs: number } {
  if (ourSide === "opponent") {
    return { ours: serverOpponentWins, theirs: serverPlayerWins };
  }
  return { ours: serverPlayerWins, theirs: serverOpponentWins };
}

/**
 * Convert server-frame winner to local frame. "draw" passes through.
 * Otherwise the server-side that matches `ourSide` becomes our `player`.
 */
function winnerForSide(
  ourSide: DuelSide | null,
  serverWinner: "player" | "opponent" | "draw",
): RoundWinner {
  if (serverWinner === "draw") return "draw";
  return serverWinner === ourSide ? "player" : "opponent";
}
