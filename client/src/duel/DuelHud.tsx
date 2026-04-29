import { useMemo } from "react";
import type { DuelHudState, MatchState } from "./useDuelLoop";

interface DuelHudProps {
  hud: React.MutableRefObject<DuelHudState>;
  /** Reactivity hook — pass a value that changes ~10 Hz so this re-renders. */
  tickKey: number;
  onResetMatch: () => void;
  /** Player display name (from `localStorage["chambara.name"]` via TitleScreen). */
  playerName: string;
  /** Player side identity color (their plasma blade hex). */
  playerAccent: string;
  /** Opponent display name (jam: "AI Bot"; Phase 11: from server payload). */
  opponentName: string;
  /** Opponent side identity color. Static `#e879f9` magenta for now. */
  opponentAccent: string;
}

export function DuelHud({
  hud,
  tickKey,
  onResetMatch,
  playerName,
  playerAccent,
  opponentName,
  opponentAccent,
}: DuelHudProps) {
  void tickKey;
  const s = hud.current;
  const match = s.match;

  return (
    <>
      <TopBar
        match={match}
        phaseRemainingMs={s.phaseTimeRemainingMs}
        playerName={playerName}
        playerAccent={playerAccent}
        opponentName={opponentName}
        opponentAccent={opponentAccent}
      />
      <PhaseOverlay
        match={match}
        phaseRemainingMs={s.phaseTimeRemainingMs}
        onResetMatch={onResetMatch}
        playerName={playerName}
        playerAccent={playerAccent}
        opponentName={opponentName}
        opponentAccent={opponentAccent}
      />
      <PlayerStatus state={s} />
      <OutcomeFlash outcome={s.lastOutcome} />
      <ControlsHint />
      <HudAnnouncement
        match={match}
        playerName={playerName}
        opponentName={opponentName}
      />
    </>
  );
}

/**
 * Off-screen live region so screen-reader users hear round/match results.
 * Only announces on phase transitions — `useMemo` deps deliberately omit
 * frame-level fields (phaseTimeRemainingMs, etc.) so the assistive layer
 * isn't spammed during fighting frames. `aria-live="polite"` waits for the
 * user to pause speaking before announcing, which fits a Bo3 cadence.
 */
function HudAnnouncement({
  match,
  playerName,
  opponentName,
}: {
  match: MatchState;
  playerName: string;
  opponentName: string;
}) {
  const message = useMemo(() => {
    switch (match.phase) {
      case "countdown":
        return `Round ${match.roundNumber} starting`;
      case "roundOver": {
        if (match.lastRoundWinner === "draw" || !match.lastRoundWinner) {
          return `Round ${match.roundNumber}: draw`;
        }
        const winnerName =
          match.lastRoundWinner === "player" ? playerName : opponentName;
        const verb =
          match.lastRoundReason === "ringout"
            ? "knocked out the opponent"
            : "won the round";
        return `${winnerName} ${verb}`;
      }
      case "matchOver": {
        if (!match.matchWinner) return "Match over";
        const winnerName =
          match.matchWinner === "player" ? playerName : opponentName;
        return `Match over. ${winnerName} wins ${match.playerWins} to ${match.opponentWins}`;
      }
      default:
        return "";
    }
  }, [
    match.phase,
    match.roundNumber,
    match.lastRoundWinner,
    match.lastRoundReason,
    match.matchWinner,
    match.playerWins,
    match.opponentWins,
    playerName,
    opponentName,
  ]);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
      {message}
    </div>
  );
}

const SR_ONLY: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

function TopBar({
  match,
  phaseRemainingMs,
  playerName,
  playerAccent,
  opponentName,
  opponentAccent,
}: {
  match: MatchState;
  phaseRemainingMs: number;
  playerName: string;
  playerAccent: string;
  opponentName: string;
  opponentAccent: string;
}) {
  const seconds = Math.ceil(phaseRemainingMs / 1000);
  const showTimer = match.phase === "fighting";
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: 14,
        alignItems: "center",
        padding: "8px 18px",
        background: "rgba(15,23,42,0.78)",
        borderRadius: 12,
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui",
        backdropFilter: "blur(6px)",
      }}
    >
      <NameTag name={playerName} accent={playerAccent} align="right" />
      <FlagDots count={match.playerWins} color={playerAccent} />
      <div style={{ fontWeight: 700, fontSize: 13, opacity: 0.7 }}>
        R{match.roundNumber}
      </div>
      <div
        style={{
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          fontSize: 22,
          minWidth: 48,
          textAlign: "center",
          color: showTimer && seconds <= 10 ? "#facc15" : "#e2e8f0",
        }}
      >
        {showTimer ? `${seconds}s` : "—"}
      </div>
      <FlagDots count={match.opponentWins} color={opponentAccent} reverse />
      <NameTag name={opponentName} accent={opponentAccent} align="left" />
    </div>
  );
}

function NameTag({
  name,
  accent,
  align,
}: {
  name: string;
  accent: string;
  align: "left" | "right";
}) {
  return (
    <div
      style={{
        fontWeight: 700,
        fontSize: 14,
        color: accent,
        textShadow: `0 0 8px ${accent}`,
        maxWidth: 140,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        textAlign: align,
        letterSpacing: 0.5,
      }}
    >
      {name}
    </div>
  );
}

function FlagDots({
  count,
  color,
  reverse = false,
}: {
  count: number;
  color: string;
  reverse?: boolean;
}) {
  const dots = [0, 1].map((i) => i < count);
  if (reverse) dots.reverse();
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {dots.map((on, i) => (
        <div
          key={i}
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: on ? color : "rgba(255,255,255,0.15)",
            border: `1px solid ${on ? color : "rgba(255,255,255,0.25)"}`,
          }}
        />
      ))}
    </div>
  );
}

function PhaseOverlay({
  match,
  phaseRemainingMs,
  onResetMatch,
  playerName,
  playerAccent,
  opponentName,
  opponentAccent,
}: {
  match: MatchState;
  phaseRemainingMs: number;
  onResetMatch: () => void;
  playerName: string;
  playerAccent: string;
  opponentName: string;
  opponentAccent: string;
}) {
  if (match.phase === "countdown") {
    const seconds = Math.max(1, Math.ceil(phaseRemainingMs / 1000));
    return (
      <Overlay>
        <div style={{ fontSize: 28, marginBottom: 4, opacity: 0.85 }}>
          Round {match.roundNumber}
        </div>
        <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1 }}>{seconds}</div>
      </Overlay>
    );
  }
  if (match.phase === "roundOver") {
    const winner = match.lastRoundWinner;
    if (match.lastRoundReason === "ringout") {
      return (
        <KoSplash
          winner={winner}
          phaseStartedAt={match.phaseStartedAt}
          roundNumber={match.roundNumber}
          playerName={playerName}
          playerAccent={playerAccent}
          opponentName={opponentName}
          opponentAccent={opponentAccent}
        />
      );
    }
    const winnerName =
      winner === "player"
        ? playerName
        : winner === "opponent"
        ? opponentName
        : null;
    const winnerAccent =
      winner === "player"
        ? playerAccent
        : winner === "opponent"
        ? opponentAccent
        : "#94a3b8";
    return (
      <Overlay>
        <div style={{ fontSize: 24, opacity: 0.8, marginBottom: 8 }}>
          Round {match.roundNumber}
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: winnerAccent,
            textShadow: winnerName ? `0 0 24px ${winnerAccent}` : undefined,
          }}
        >
          {winnerName ? `${winnerName} wins` : "Draw"}
        </div>
      </Overlay>
    );
  }
  if (match.phase === "matchOver") {
    const isPlayerWin = match.matchWinner === "player";
    const winnerName = isPlayerWin ? playerName : opponentName;
    const winnerAccent = isPlayerWin ? playerAccent : opponentAccent;
    const titleColor = isPlayerWin ? "#fbbf24" : "#f87171";
    const titleGlow = isPlayerWin ? "#f59e0b" : "#dc2626";
    return (
      <Overlay>
        <div
          style={{
            fontSize: 18,
            opacity: 0.8,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          Match Over
        </div>
        <div
          style={{
            fontSize: 84,
            fontWeight: 900,
            color: titleColor,
            textShadow: `0 0 28px ${titleGlow}, 0 0 56px ${titleGlow}`,
            letterSpacing: 12,
            fontFamily: "ui-monospace, monospace",
            marginTop: 8,
            animation: "matchOverPopIn 360ms ease-out both",
          }}
        >
          {isPlayerWin ? "VICTORY" : "DEFEAT"}
        </div>
        <div
          style={{
            fontSize: 22,
            marginTop: 14,
            opacity: 0.95,
            color: winnerAccent,
            textShadow: `0 0 12px ${winnerAccent}`,
            letterSpacing: 1,
          }}
        >
          {winnerName}
        </div>
        <div
          style={{
            fontSize: 32,
            marginTop: 16,
            fontFamily: "ui-monospace, monospace",
            fontVariantNumeric: "tabular-nums",
            color: "#cbd5e1",
            letterSpacing: 4,
          }}
        >
          <span style={{ color: playerAccent }}>{match.playerWins}</span>
          <span style={{ opacity: 0.5, margin: "0 12px" }}>–</span>
          <span style={{ color: opponentAccent }}>{match.opponentWins}</span>
        </div>
        <button
          onClick={onResetMatch}
          style={{
            marginTop: 28,
            padding: "12px 28px",
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: 2,
            color: "#e2e8f0",
            background: "rgba(2,6,23,0.6)",
            border: "1px solid #475569",
            borderRadius: 8,
            cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          New Match
        </button>
        <style>{`
          @keyframes matchOverPopIn {
            0% { transform: scale(0.6); opacity: 0; }
            70% { transform: scale(1.08); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </Overlay>
    );
  }
  return null;
}

function KoSplash({
  winner,
  phaseStartedAt,
  roundNumber,
  playerName,
  playerAccent,
  opponentName,
  opponentAccent,
}: {
  winner: import("./useDuelLoop").RoundWinner | null;
  phaseStartedAt: number;
  roundNumber: number;
  playerName: string;
  playerAccent: string;
  opponentName: string;
  opponentAccent: string;
}) {
  const age = performance.now() - phaseStartedAt;
  // Pop-in (0–180ms): scale 0.5→1.1; settle (180–360ms): scale 1.1→1.0; hold; fade out at end.
  let scale = 0.5;
  let textOpacity = 0;
  if (age < 180) {
    const t = age / 180;
    scale = 0.5 + (1.1 - 0.5) * easeOut(t);
    textOpacity = t;
  } else if (age < 360) {
    const t = (age - 180) / 180;
    scale = 1.1 - 0.1 * t;
    textOpacity = 1;
  } else {
    scale = 1.0;
    textOpacity = 1;
  }
  const fadeOut = age > 1800 ? Math.max(0, 1 - (age - 1800) / 380) : 1;
  textOpacity *= fadeOut;

  const isDraw = winner === "draw" || winner === null;
  const headline = isDraw ? "DOUBLE K.O." : "K.O.!";
  const subline = isDraw
    ? "Both fighters out"
    : winner === "player"
    ? `${playerName} knocked out ${opponentName}`
    : `${opponentName} knocked out ${playerName}`;
  const accent = isDraw
    ? "#f1f5f9"
    : winner === "player"
    ? playerAccent
    : opponentAccent;

  return (
    <Overlay>
      <div style={{ fontSize: 18, opacity: 0.7 * fadeOut, letterSpacing: 4 }}>
        ROUND {roundNumber}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 132,
          fontWeight: 900,
          letterSpacing: 6,
          lineHeight: 1,
          color: accent,
          textShadow: `0 0 28px ${accent}, 0 0 56px ${accent}`,
          transform: `scale(${scale})`,
          opacity: textOpacity,
          fontFamily: "ui-monospace, monospace",
        }}
      >
        {headline}
      </div>
      <div
        style={{
          marginTop: 18,
          fontSize: 22,
          fontWeight: 600,
          color: "#e2e8f0",
          opacity: 0.85 * fadeOut,
          letterSpacing: 1,
        }}
      >
        {subline}
      </div>
    </Overlay>
  );
}

function easeOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) * (1 - x);
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        color: "white",
        textAlign: "center",
        background: "rgba(2,6,23,0.35)",
        pointerEvents: "auto",
        fontFamily: "ui-sans-serif, system-ui",
      }}
    >
      {children}
    </div>
  );
}

function PlayerStatus({ state }: { state: DuelHudState }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 16,
        bottom: 16,
        padding: 12,
        background: "rgba(15,23,42,0.78)",
        color: "#e2e8f0",
        borderRadius: 10,
        fontSize: 12,
        minWidth: 220,
        fontFamily: "ui-sans-serif, system-ui",
        backdropFilter: "blur(6px)",
      }}
    >
      <Bar label="cooldown" valueMs={state.playerCooldownMs} max={650} color="#fb923c" />
      <Bar label="stun" valueMs={state.playerStunMs} max={850} color="#facc15" />
      <Bar
        label="counter window"
        valueMs={state.playerCounterMs}
        max={650}
        color="#22c55e"
      />
    </div>
  );
}

function Bar({
  label,
  valueMs,
  max,
  color,
}: {
  label: string;
  valueMs: number;
  max: number;
  color: string;
}) {
  const pct = Math.min(1, valueMs / max);
  return (
    <div style={{ marginBottom: 6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "#94a3b8",
        }}
      >
        <span>{label}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{valueMs.toFixed(0)} ms</span>
      </div>
      <div
        style={{
          height: 5,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 3,
          overflow: "hidden",
          marginTop: 3,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct * 100}%`,
            background: color,
            transition: "width 100ms linear",
          }}
        />
      </div>
    </div>
  );
}

function OutcomeFlash({
  outcome,
}: {
  outcome: DuelHudState["lastOutcome"];
}) {
  if (!outcome) return null;
  const age = performance.now() - outcome.at;
  if (age > 900) return null;
  const colorMap: Record<string, string> = {
    hit: "#ef4444",
    pierce: "#f97316",
    block: "#3b82f6",
    miss: "#94a3b8",
    rejected: "#64748b",
  };
  const tag = `${outcome.attackerIsPlayer ? "" : "opp "}${outcome.kind.toUpperCase()}`;
  return (
    <div
      style={{
        position: "absolute",
        right: 24,
        top: "50%",
        transform: "translateY(-50%)",
        fontSize: 28,
        fontWeight: 800,
        color: colorMap[outcome.kind] ?? "#fff",
        opacity: 1 - age / 900,
        textShadow: "0 1px 12px rgba(0,0,0,0.7)",
        fontFamily: "ui-monospace, monospace",
        pointerEvents: "none",
      }}
    >
      {tag}
    </div>
  );
}

function ControlsHint() {
  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        bottom: 16,
        padding: 10,
        background: "rgba(15,23,42,0.7)",
        color: "#94a3b8",
        borderRadius: 8,
        fontSize: 11,
        fontFamily: "ui-sans-serif, system-ui",
        lineHeight: 1.6,
        maxWidth: 260,
        backdropFilter: "blur(6px)",
      }}
    >
      <div style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}>controls</div>
      <div>L-drag &amp; release → slice</div>
      <div>Dbl-click / middle-click → thrust</div>
      <div>R hold → guard</div>
    </div>
  );
}
