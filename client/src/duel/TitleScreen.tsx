import { useState } from "react";

/**
 * Title-screen identity capture. Two axes — name + plasma-blade color —
 * which Beat Saber + .io games show is the right "felt personalization 90%"
 * minimum for a jam release (`research_character_weapon_customization_20260429.md`
 * §4.3). Saved to localStorage so returning players skip this screen, and
 * later (Phase 11) shipped to the server as `joinOptions: { name, saberColor }`.
 *
 * Red is intentionally absent from the preset palette — Sith-coded IP risk
 * (§7.4). Magenta covers the "purple-ish" want without trademark collision.
 */
export interface SaberPreset {
  id: string;
  color: string;
  label: string;
}

export const SABER_PRESETS: readonly SaberPreset[] = [
  { id: "cyan", color: "#38bdf8", label: "Cyan" },
  { id: "green", color: "#4ade80", label: "Green" },
  { id: "purple", color: "#a78bfa", label: "Purple" },
  { id: "magenta", color: "#e879f9", label: "Magenta" },
  { id: "yellow", color: "#facc15", label: "Yellow" },
] as const;

export const NAME_KEY = "chambara.name";
export const SABER_KEY = "chambara.saber";
const MAX_NAME_LEN = 16;
const DEFAULT_NAME = "Duelist";
const DEFAULT_SABER = "#38bdf8";

export interface Identity {
  name: string;
  saberColor: string;
}

/**
 * Read stored identity if both fields exist; otherwise return `null` so the
 * caller knows to mount the title screen.
 */
export function readStoredIdentity(): Identity | null {
  try {
    const name = localStorage.getItem(NAME_KEY);
    const saber = localStorage.getItem(SABER_KEY);
    if (!name || !saber) return null;
    if (!SABER_PRESETS.some((p) => p.color === saber)) return null;
    return { name, saberColor: saber };
  } catch {
    return null;
  }
}

interface TitleScreenProps {
  onStart: (identity: Identity) => void;
}

export function TitleScreen({ onStart }: TitleScreenProps) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [saberColor, setSaberColor] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(SABER_KEY);
      if (stored && SABER_PRESETS.some((p) => p.color === stored)) return stored;
    } catch {
      /* fall through */
    }
    return DEFAULT_SABER;
  });

  const handleStart = (): void => {
    const trimmed = name.trim().slice(0, MAX_NAME_LEN);
    const finalName = trimmed || DEFAULT_NAME;
    try {
      localStorage.setItem(NAME_KEY, finalName);
      localStorage.setItem(SABER_KEY, saberColor);
    } catch {
      /* localStorage may be disabled — proceed without persisting */
    }
    onStart({ name: finalName, saberColor });
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(ellipse at center, #0f1f3a 0%, #050913 70%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui",
        zIndex: 50,
      }}
    >
      <div
        style={{
          fontSize: 48,
          fontWeight: 900,
          letterSpacing: 8,
          color: "#7dd3fc",
          textShadow: "0 0 28px #38bdf8, 0 0 64px #38bdf8",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        CHAMBARA DUEL
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 14,
          letterSpacing: 4,
          color: "#94a3b8",
          textTransform: "uppercase",
        }}
      >
        plasma blade · 1v1
      </div>

      <div
        style={{
          marginTop: 48,
          padding: 24,
          background: "rgba(15,23,42,0.78)",
          borderRadius: 14,
          backdropFilter: "blur(6px)",
          minWidth: 360,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#94a3b8", letterSpacing: 1 }}>
            NAME
          </span>
          <input
            type="text"
            value={name}
            maxLength={MAX_NAME_LEN}
            placeholder={DEFAULT_NAME}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleStart();
            }}
            style={{
              padding: "10px 12px",
              fontSize: 18,
              fontWeight: 600,
              background: "rgba(2,6,23,0.6)",
              border: `1px solid ${saberColor}`,
              borderRadius: 8,
              color: "#f1f5f9",
              outline: "none",
              fontFamily: "ui-sans-serif, system-ui",
            }}
            autoFocus
          />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#94a3b8", letterSpacing: 1 }}>
            PLASMA BLADE
          </span>
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
            {SABER_PRESETS.map((p) => {
              const selected = p.color === saberColor;
              return (
                <button
                  key={p.id}
                  onClick={() => setSaberColor(p.color)}
                  title={p.label}
                  style={{
                    flex: 1,
                    height: 56,
                    border: selected
                      ? `2px solid ${p.color}`
                      : "2px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    background: "rgba(2,6,23,0.55)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "border-color 120ms",
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 36,
                      background: p.color,
                      borderRadius: 3,
                      boxShadow: `0 0 12px ${p.color}, 0 0 24px ${p.color}`,
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={handleStart}
          style={{
            marginTop: 8,
            padding: "12px 20px",
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: 2,
            color: "#0b1424",
            background: saberColor,
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            textTransform: "uppercase",
            boxShadow: `0 0 24px ${saberColor}`,
          }}
        >
          Start Duel
        </button>
      </div>

      <div
        style={{
          marginTop: 24,
          fontSize: 11,
          color: "#64748b",
          letterSpacing: 1,
        }}
      >
        L-drag → slice · dbl/middle-click → thrust · R hold → guard
      </div>
    </div>
  );
}
