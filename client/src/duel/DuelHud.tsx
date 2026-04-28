import type { DuelHudState, MatchState } from "./useDuelLoop";

interface DuelHudProps {
  hud: React.MutableRefObject<DuelHudState>;
  /** Reactivity hook — pass a value that changes ~10 Hz so this re-renders. */
  tickKey: number;
  onResetMatch: () => void;
}

export function DuelHud({ hud, tickKey, onResetMatch }: DuelHudProps) {
  void tickKey;
  const s = hud.current;
  const match = s.match;

  return (
    <>
      <TopBar match={match} phaseRemainingMs={s.phaseTimeRemainingMs} />
      <PhaseOverlay match={match} phaseRemainingMs={s.phaseTimeRemainingMs} onResetMatch={onResetMatch} />
      <PlayerStatus state={s} />
      <OutcomeFlash outcome={s.lastOutcome} />
      <ControlsHint />
    </>
  );
}

function TopBar({
  match,
  phaseRemainingMs,
}: {
  match: MatchState;
  phaseRemainingMs: number;
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
        gap: 16,
        alignItems: "center",
        padding: "8px 18px",
        background: "rgba(15,23,42,0.78)",
        borderRadius: 12,
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui",
        backdropFilter: "blur(6px)",
      }}
    >
      <FlagDots count={match.playerWins} color="#3b82f6" />
      <div style={{ fontWeight: 700, fontSize: 14, opacity: 0.9 }}>
        Round {match.roundNumber}
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
      <FlagDots count={match.opponentWins} color="#ef4444" reverse />
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
}: {
  match: MatchState;
  phaseRemainingMs: number;
  onResetMatch: () => void;
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
    return (
      <Overlay>
        <div style={{ fontSize: 24, opacity: 0.8, marginBottom: 8 }}>
          Round {match.roundNumber}
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color:
              winner === "player"
                ? "#60a5fa"
                : winner === "opponent"
                ? "#f87171"
                : "#94a3b8",
          }}
        >
          {winner === "player"
            ? "You win"
            : winner === "opponent"
            ? "Opponent wins"
            : "Draw"}
        </div>
      </Overlay>
    );
  }
  if (match.phase === "matchOver") {
    return (
      <Overlay>
        <div style={{ fontSize: 24, opacity: 0.8 }}>Match Over</div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: match.matchWinner === "player" ? "#60a5fa" : "#f87171",
            marginTop: 8,
          }}
        >
          {match.matchWinner === "player" ? "Victory" : "Defeat"}
        </div>
        <div style={{ fontSize: 18, marginTop: 16, opacity: 0.7 }}>
          {match.playerWins} – {match.opponentWins}
        </div>
        <button
          onClick={onResetMatch}
          style={{
            marginTop: 24,
            padding: "10px 20px",
            fontSize: 16,
            fontWeight: 700,
            background: "#1d4ed8",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          New match
        </button>
      </Overlay>
    );
  }
  return null;
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
