import { useEffect, useState } from "react";
import {
  fetchLeaderboard,
  fetchMe,
  type PlayerRow,
} from "./network/leaderboard";
import { getOrCreatePlayerId } from "./network/matchmake";

/**
 * Minimal Top-20 board screen. Mounted from the title screen as an
 * alternative to starting a duel. Single fetch on mount; no live tail.
 *
 * Phase 11c. Visual polish (medal icons, win-streak chips) is Phase 13.
 */
interface LeaderboardViewProps {
  onBack: () => void;
}

export function LeaderboardView({ onBack }: LeaderboardViewProps) {
  const [rows, setRows] = useState<PlayerRow[] | null>(null);
  const [me, setMe] = useState<PlayerRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const playerId = getOrCreatePlayerId();
    Promise.all([fetchLeaderboard(ac.signal), fetchMe(playerId, ac.signal)])
      .then(([top, mine]) => {
        setRows(top);
        setMe(mine);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => ac.abort();
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(ellipse at center, #0f1f3a 0%, #050913 70%)",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui",
        padding: "48px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        zIndex: 50,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          fontSize: 36,
          fontWeight: 900,
          letterSpacing: 6,
          color: "#7dd3fc",
          textShadow: "0 0 24px #38bdf8",
          fontFamily: "ui-monospace, monospace",
          marginBottom: 4,
        }}
      >
        LEADERBOARD
      </div>
      <div
        style={{
          fontSize: 12,
          color: "#94a3b8",
          letterSpacing: 2,
          textTransform: "uppercase",
          marginBottom: 24,
        }}
      >
        Top 20 · Ranked Duels
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 720,
          background: "rgba(15,23,42,0.78)",
          borderRadius: 14,
          backdropFilter: "blur(6px)",
          padding: 16,
          minHeight: 200,
        }}
      >
        {error ? (
          <ErrorState message={error} />
        ) : rows === null ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <Table rows={rows} highlightPlayerId={me?.playerId ?? null} />
        )}
      </div>

      {me && rows && !rows.some((r) => r.playerId === me.playerId) && (
        <div
          style={{
            marginTop: 18,
            width: "100%",
            maxWidth: 720,
            background: "rgba(15,23,42,0.78)",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#94a3b8",
              letterSpacing: 2,
              marginBottom: 6,
              textTransform: "uppercase",
            }}
          >
            Your record
          </div>
          <Row rank="—" row={me} highlight={true} />
        </div>
      )}

      <button
        onClick={onBack}
        style={{
          marginTop: 28,
          padding: "10px 28px",
          fontSize: 13,
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
        Back to Title
      </button>
    </div>
  );
}

function Table({
  rows,
  highlightPlayerId,
}: {
  rows: PlayerRow[];
  highlightPlayerId: string | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "48px 1fr 80px 80px",
          padding: "6px 12px",
          fontSize: 10,
          color: "#64748b",
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        <span>Rank</span>
        <span>Duelist</span>
        <span style={{ textAlign: "right" }}>Rating</span>
        <span style={{ textAlign: "right" }}>W / L</span>
      </div>
      {rows.map((row, i) => (
        <Row
          key={row.playerId}
          rank={String(i + 1)}
          row={row}
          highlight={row.playerId === highlightPlayerId}
        />
      ))}
    </div>
  );
}

function Row({
  rank,
  row,
  highlight,
}: {
  rank: string;
  row: PlayerRow;
  highlight: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "48px 1fr 80px 80px",
        alignItems: "center",
        padding: "10px 12px",
        background: highlight ? "rgba(56,189,248,0.12)" : "rgba(2,6,23,0.4)",
        border: highlight ? "1px solid #38bdf8" : "1px solid transparent",
        borderRadius: 8,
        fontSize: 14,
      }}
    >
      <span style={{ color: "#94a3b8", fontFamily: "ui-monospace, monospace" }}>
        {rank}
      </span>
      <span style={{ fontWeight: 600, color: "#f1f5f9" }}>{row.name}</span>
      <span
        style={{
          textAlign: "right",
          fontFamily: "ui-monospace, monospace",
          fontWeight: 700,
          color: "#7dd3fc",
        }}
      >
        {row.rating}
      </span>
      <span
        style={{
          textAlign: "right",
          color: "#94a3b8",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        {row.wins}/{row.losses}
      </span>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
      Loading rankings…
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
      No ranked matches played yet. Be first to claim the top spot.
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: 24,
        textAlign: "center",
        color: "#fca5a5",
        fontSize: 13,
      }}
    >
      Could not load leaderboard: {message}
    </div>
  );
}
