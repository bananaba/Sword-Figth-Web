import { useState } from "react";
import type { WeaponId } from "@vibejam/shared";

/**
 * Title-screen identity capture. Three axes — name + character + weapon —
 * which Beat Saber + .io games show is the right "felt personalization 90%"
 * minimum for a jam release (`research_character_weapon_customization_20260429.md`
 * §4.3). Saved to localStorage so returning players skip this screen, and
 * shipped to the server as `joinOptions: { name, saberColor, weaponId }`.
 *
 * Saber color is now derived from the chosen character (X bot → cyan/blue,
 * Y bot → magenta/pink) instead of being a separate picker. Two reasons:
 *   1. Switch Sports' chambara skins each ship a fixed body+blade pairing,
 *      so the silhouette and the slash trail read as one identity.
 *   2. Removes a redundant choice (the player who picked X bot rarely also
 *      wanted to override the blade to magenta — the colors *belong* to
 *      their characters).
 *
 * Red is intentionally absent — Sith-coded IP risk
 * (`research_character_weapon_customization_20260429.md` §7.4).
 */

export type CharacterId = "alpha" | "beta";

export interface CharacterPreset {
  id: CharacterId;
  label: string;
  modelUrl: string;
  /** Saber color shipped with this character (replaces the standalone picker). */
  saberColor: string;
  /** Body silhouette tint shown on the title-screen card. */
  cardTint: string;
}

// Mixamo's two stock mannequins: Alpha (blue/cyan tint) ships inside
// `/models/Y Bot.fbx` (`Alpha_*` materials), Beta (pink/lavender tint) ships
// inside `/models/X Bot.fbx` (`Beta_*` materials). The pack's filenames are
// historical Mixamo handles — we surface the actual character names + saber
// colours that match the body tint.
export const CHARACTER_PRESETS: readonly CharacterPreset[] = [
  {
    id: "alpha",
    label: "Alpha",
    modelUrl: "/models/Y Bot.fbx",
    saberColor: "#38bdf8", // cyan/blue — matches Alpha mannequin tint
    cardTint: "#38bdf8",
  },
  {
    id: "beta",
    label: "Beta",
    modelUrl: "/models/X Bot.fbx",
    saberColor: "#e879f9", // magenta/pink — matches Beta mannequin tint
    cardTint: "#e879f9",
  },
] as const;

export interface WeaponPreset {
  id: WeaponId;
  label: string;
  /** One-line tradeoff shown on the card — explains the stat swap. */
  blurb: string;
}

export const WEAPON_PICKER_OPTIONS: readonly WeaponPreset[] = [
  {
    id: "basic",
    label: "BASIC",
    blurb: "balanced",
  },
  {
    id: "charge",
    label: "CHARGE",
    blurb: "counter specialist",
  },
  {
    id: "rapier",
    label: "RAPIER",
    blurb: "thrust specialist",
  },
] as const;

export const NAME_KEY = "chambara.name";
export const CHARACTER_KEY = "chambara.character";
export const WEAPON_KEY = "chambara.weapon";
const MAX_NAME_LEN = 16;
const DEFAULT_NAME = "Duelist";
const DEFAULT_CHARACTER: CharacterId = "alpha";
const DEFAULT_WEAPON: WeaponId = "basic";

export type DuelMode = "solo" | "ranked" | "private";

export interface Identity {
  name: string;
  characterId: CharacterId;
  weaponId: WeaponId;
  /** Derived from characterId — kept on the identity so consumers don't all need the lookup. */
  saberColor: string;
  /** Mode is chosen each session — not persisted. */
  mode: DuelMode;
  roomCode?: string;
}

function findCharacter(id: string | null): CharacterPreset {
  return (
    CHARACTER_PRESETS.find((c) => c.id === id) ??
    CHARACTER_PRESETS.find((c) => c.id === DEFAULT_CHARACTER)!
  );
}

function findWeapon(id: string | null): WeaponPreset {
  return (
    WEAPON_PICKER_OPTIONS.find((w) => w.id === id) ??
    WEAPON_PICKER_OPTIONS.find((w) => w.id === DEFAULT_WEAPON)!
  );
}

/**
 * Read stored identity if all fields exist; otherwise return `null` so the
 * caller knows to mount the title screen. Mode always starts unset so the
 * player chooses Solo vs Ranked each time.
 */
export function readStoredIdentity(): Omit<Identity, "mode"> | null {
  try {
    const name = localStorage.getItem(NAME_KEY);
    const characterId = localStorage.getItem(CHARACTER_KEY);
    const weaponId = localStorage.getItem(WEAPON_KEY);
    if (!name || !characterId || !weaponId) return null;
    const character = findCharacter(characterId);
    const weapon = findWeapon(weaponId);
    return {
      name,
      characterId: character.id,
      weaponId: weapon.id,
      saberColor: character.saberColor,
    };
  } catch {
    return null;
  }
}

interface TitleScreenProps {
  onStart: (identity: Identity) => void;
  onShowLeaderboard?: () => void;
}

export function TitleScreen({ onStart, onShowLeaderboard }: TitleScreenProps) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [characterId, setCharacterId] = useState<CharacterId>(() => {
    try {
      return findCharacter(localStorage.getItem(CHARACTER_KEY)).id;
    } catch {
      return DEFAULT_CHARACTER;
    }
  });
  const [weaponId, setWeaponId] = useState<WeaponId>(() => {
    try {
      return findWeapon(localStorage.getItem(WEAPON_KEY)).id;
    } catch {
      return DEFAULT_WEAPON;
    }
  });
  const [roomCode, setRoomCode] = useState("");
  const [generatedPrivateCode] = useState(makeRoomCode);

  const character = findCharacter(characterId);
  const accent = character.saberColor;

  const handleStart = (mode: DuelMode, code?: string): void => {
    const trimmed = name.trim().slice(0, MAX_NAME_LEN);
    const finalName = trimmed || DEFAULT_NAME;
    try {
      localStorage.setItem(NAME_KEY, finalName);
      localStorage.setItem(CHARACTER_KEY, characterId);
      localStorage.setItem(WEAPON_KEY, weaponId);
    } catch {
      /* localStorage may be disabled — proceed without persisting */
    }
    onStart({
      name: finalName,
      characterId,
      weaponId,
      saberColor: character.saberColor,
      mode,
      roomCode: code,
    });
  };

  const normalizedPrivateCode = normalizeRoomCode(roomCode);

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
          animation: "titlePulse 3.6s ease-in-out infinite",
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
        plasma blade · 1v1 · mouse-only
      </div>

      <div
        style={{
          marginTop: 36,
          padding: 24,
          background: "rgba(15,23,42,0.78)",
          borderRadius: 14,
          backdropFilter: "blur(6px)",
          minWidth: 420,
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
              if (e.key === "Enter") handleStart("solo");
            }}
            style={{
              padding: "10px 12px",
              fontSize: 18,
              fontWeight: 600,
              background: "rgba(2,6,23,0.6)",
              border: `1px solid ${accent}`,
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
            CHARACTER
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            {CHARACTER_PRESETS.map((c) => {
              const selected = c.id === characterId;
              return (
                <button
                  key={c.id}
                  onClick={() => setCharacterId(c.id)}
                  style={{
                    flex: 1,
                    padding: "14px 12px",
                    border: selected
                      ? `2px solid ${c.cardTint}`
                      : "2px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    background: selected
                      ? `linear-gradient(180deg, rgba(2,6,23,0.6), ${c.cardTint}22)`
                      : "rgba(2,6,23,0.55)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    transition: "border-color 120ms, background 120ms",
                  }}
                >
                  <CharacterGlyph color={c.cardTint} active={selected} />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      letterSpacing: 2,
                      color: selected ? c.cardTint : "#cbd5e1",
                      textTransform: "uppercase",
                    }}
                  >
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#94a3b8", letterSpacing: 1 }}>
            WEAPON
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {WEAPON_PICKER_OPTIONS.map((w) => {
              const selected = w.id === weaponId;
              return (
                <button
                  key={w.id}
                  onClick={() => setWeaponId(w.id)}
                  style={{
                    flex: 1,
                    padding: "12px 10px",
                    border: selected
                      ? `2px solid ${accent}`
                      : "2px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    background: selected
                      ? `linear-gradient(180deg, rgba(2,6,23,0.6), ${accent}22)`
                      : "rgba(2,6,23,0.55)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    transition: "border-color 120ms, background 120ms",
                  }}
                >
                  <WeaponGlyph weaponId={w.id} accent={accent} active={selected} />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      letterSpacing: 2,
                      color: selected ? accent : "#cbd5e1",
                      textTransform: "uppercase",
                    }}
                  >
                    {w.label}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: "#94a3b8",
                      lineHeight: 1.3,
                      textAlign: "center",
                    }}
                  >
                    {w.blurb}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button
            onClick={() => handleStart("solo")}
            style={{
              flex: 1,
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: 2,
              color: "#e2e8f0",
              background: "rgba(2,6,23,0.6)",
              border: `1px solid ${accent}`,
              borderRadius: 8,
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            Solo (vs AI)
          </button>
          <button
            onClick={() => handleStart("ranked")}
            style={{
              flex: 1,
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: 2,
              color: "#0b1424",
              background: accent,
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              textTransform: "uppercase",
              boxShadow: `0 0 24px ${accent}`,
            }}
          >
            Ranked Online
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 10,
            alignItems: "end",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#94a3b8", letterSpacing: 1 }}>
              PRIVATE ROOM
            </span>
            <input
              type="text"
              value={roomCode}
              maxLength={12}
              placeholder={generatedPrivateCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleStart("private", normalizedPrivateCode || generatedPrivateCode);
                }
              }}
              style={inputStyle(accent)}
            />
          </label>
          <button
            onClick={() => handleStart("private", normalizedPrivateCode || generatedPrivateCode)}
            style={secondaryButtonStyle(accent)}
          >
            Join
          </button>
        </div>

        <button
          disabled
          title="Tournament brackets are disabled until automatic winner tracking ships."
          style={{
            ...secondaryButtonStyle("#475569"),
            cursor: "not-allowed",
            opacity: 0.45,
          }}
        >
          Tournament Coming Soon
        </button>
      </div>

      {onShowLeaderboard && (
        <button
          onClick={onShowLeaderboard}
          style={{
            marginTop: 18,
            padding: "8px 18px",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 2,
            color: "#94a3b8",
            background: "transparent",
            border: "1px solid #334155",
            borderRadius: 6,
            cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          View Leaderboard
        </button>
      )}

      <div
        style={{
          marginTop: 22,
          padding: "12px 18px",
          background: "rgba(2,6,23,0.5)",
          border: "1px solid rgba(125, 211, 252, 0.15)",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontSize: 12,
          letterSpacing: 1,
        }}
      >
        <div style={{ color: "#94a3b8", letterSpacing: 3, fontSize: 10 }}>
          HOW TO PLAY
        </div>
        <ControlRow icon="L" hint="drag" action="slice" accent="#7dd3fc" />
        <ControlRow icon="dbl" hint="click" action="thrust" accent="#fda4af" />
        <ControlRow icon="R" hint="hold" action="guard" accent="#bfdbfe" />
        <div
          style={{
            color: "#64748b",
            fontSize: 10,
            marginTop: 4,
            letterSpacing: 0.5,
          }}
        >
          first to 2 rounds wins · ringout = K.O.
        </div>
      </div>

      <style>{`
        @keyframes titlePulse {
          0%, 100% { text-shadow: 0 0 28px #38bdf8, 0 0 64px #38bdf8; }
          50% { text-shadow: 0 0 36px #38bdf8, 0 0 96px #38bdf8; }
        }
      `}</style>
    </div>
  );
}

function ControlRow({
  icon,
  hint,
  action,
  accent,
}: {
  icon: string;
  hint: string;
  action: string;
  accent: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
      }}
    >
      <span
        style={{
          minWidth: 32,
          display: "inline-block",
          padding: "2px 6px",
          background: "rgba(2,6,23,0.7)",
          border: `1px solid ${accent}`,
          borderRadius: 4,
          color: accent,
          fontFamily: "ui-monospace, monospace",
          fontWeight: 700,
          fontSize: 11,
          textAlign: "center",
        }}
      >
        {icon}
      </span>
      <span style={{ color: "#94a3b8", fontSize: 12 }}>{hint}</span>
      <span style={{ color: "#cbd5e1", fontWeight: 600 }}>→ {action}</span>
    </div>
  );
}

/**
 * Stylised humanoid silhouette per character — kept SVG-only so the title
 * screen does not have to mount a second R3F canvas just for picker
 * thumbnails. The accent color shows on the saber so each card previews
 * the body+blade pairing the player will be locked into.
 */
function CharacterGlyph({ color, active }: { color: string; active: boolean }) {
  const opacity = active ? 1 : 0.55;
  return (
    <svg width="56" height="64" viewBox="0 0 56 64" style={{ opacity }}>
      {/* head */}
      <circle cx="28" cy="14" r="6" fill="#cbd5e1" />
      {/* torso */}
      <rect x="20" y="22" width="16" height="22" rx="3" fill="#94a3b8" />
      {/* legs */}
      <rect x="21" y="44" width="6" height="16" rx="1.5" fill="#64748b" />
      <rect x="29" y="44" width="6" height="16" rx="1.5" fill="#64748b" />
      {/* sword arm */}
      <rect x="36" y="24" width="4" height="14" rx="1" fill="#94a3b8" />
      {/* saber tinted by character color */}
      <rect
        x="42"
        y="6"
        width="3"
        height="34"
        rx="1.5"
        fill={color}
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />
    </svg>
  );
}

/**
 * Per-weapon SVG glyph for the picker. Kept abstract — the renderer in
 * `Fighter.tsx` is the source of truth for the in-game model; this is just a
 * silhouette hint at the family (long, charged, narrow).
 */
function WeaponGlyph({
  weaponId,
  accent,
  active,
}: {
  weaponId: WeaponId;
  accent: string;
  active: boolean;
}) {
  const opacity = active ? 1 : 0.6;
  const grip = "#475569";
  const guard = "#94a3b8";
  if (weaponId === "basic") {
    return (
      <svg width="52" height="48" viewBox="0 0 52 48" style={{ opacity }}>
        {/* pommel */}
        <circle cx="26" cy="42" r="3" fill={guard} />
        {/* grip */}
        <rect x="24.5" y="34" width="3" height="8" fill={grip} />
        {/* crossguard */}
        <rect x="16" y="32" width="20" height="3" rx="1" fill={guard} />
        {/* blade */}
        <rect
          x="24.5"
          y="6"
          width="3"
          height="26"
          fill={accent}
          style={{ filter: `drop-shadow(0 0 3px ${accent})` }}
        />
        <polygon
          points="24.5,6 27.5,6 26,2"
          fill={accent}
          style={{ filter: `drop-shadow(0 0 3px ${accent})` }}
        />
      </svg>
    );
  }
  if (weaponId === "charge") {
    return (
      <svg width="52" height="48" viewBox="0 0 52 48" style={{ opacity }}>
        <circle cx="26" cy="42" r="3" fill={guard} />
        <rect x="24" y="34" width="4" height="8" fill={grip} />
        {/* heavier crossguard */}
        <rect x="13" y="31" width="26" height="4" rx="1.5" fill={guard} />
        {/* outer blade — wider */}
        <rect x="22" y="6" width="8" height="25" fill="#3f4753" />
        {/* glowing inner core */}
        <rect
          x="24.5"
          y="6"
          width="3"
          height="25"
          fill={accent}
          style={{ filter: `drop-shadow(0 0 5px ${accent})` }}
        />
        {/* energy node halfway up the blade */}
        <circle cx="26" cy="20" r="2.4" fill={accent} />
      </svg>
    );
  }
  // rapier — slim blade, ornate basket
  return (
    <svg width="52" height="48" viewBox="0 0 52 48" style={{ opacity }}>
      <circle cx="26" cy="44" r="2.5" fill={guard} />
      <rect x="25" y="36" width="2" height="8" fill={grip} />
      {/* basket guard */}
      <path
        d="M 14 33 Q 26 24 38 33"
        stroke={guard}
        strokeWidth="2.5"
        fill="none"
      />
      <rect x="14" y="32" width="24" height="2.5" rx="1" fill={guard} />
      {/* slim blade */}
      <rect
        x="25.5"
        y="3"
        width="1.5"
        height="29"
        fill={accent}
        style={{ filter: `drop-shadow(0 0 3px ${accent})` }}
      />
      <polygon
        points="25.5,3 27,3 26.25,0"
        fill={accent}
      />
    </svg>
  );
}

function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 18);
}

function makeRoomCode(): string {
  const bytes = new Uint8Array(3);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .toUpperCase()
    .slice(0, 6);
}

function inputStyle(accent: string): React.CSSProperties {
  return {
    padding: "10px 12px",
    fontSize: 16,
    fontWeight: 700,
    background: "rgba(2,6,23,0.6)",
    border: `1px solid ${accent}`,
    borderRadius: 8,
    color: "#f1f5f9",
    outline: "none",
    fontFamily: "ui-sans-serif, system-ui",
  };
}

function secondaryButtonStyle(accent: string): React.CSSProperties {
  return {
    padding: "10px 14px",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 1.5,
    color: "#e2e8f0",
    background: "rgba(2,6,23,0.6)",
    border: `1px solid ${accent}`,
    borderRadius: 8,
    cursor: "pointer",
    textTransform: "uppercase",
  };
}
