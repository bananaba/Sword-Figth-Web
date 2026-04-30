import { useAudioMute } from "./audio";

const BUTTON_BASE: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1.2,
  fontFamily: "ui-monospace, monospace",
  color: "#cbd5e1",
  background: "rgba(2, 6, 23, 0.6)",
  border: "1px solid #334155",
  borderRadius: 6,
  cursor: "pointer",
  textTransform: "uppercase",
  backdropFilter: "blur(4px)",
};

const BUTTON_OFF: React.CSSProperties = {
  color: "#64748b",
  borderColor: "#1e293b",
  background: "rgba(2, 6, 23, 0.45)",
};

interface AudioToggleProps {
  /** Optional style overrides — defaults to fixed top-right. */
  style?: React.CSSProperties;
}

/**
 * Twin BGM / SFX mute buttons. Mounted globally above the canvas so the
 * player can hush either channel from any screen (title / match / leaderboard
 * / result overlay). State is persisted in localStorage via `useAudioMute`.
 */
export function AudioToggle({ style }: AudioToggleProps) {
  const bgmMuted = useAudioMute((s) => s.bgmMuted);
  const sfxMuted = useAudioMute((s) => s.sfxMuted);
  const toggleBgm = useAudioMute((s) => s.toggleBgm);
  const toggleSfx = useAudioMute((s) => s.toggleSfx);

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        display: "flex",
        gap: 6,
        zIndex: 300,
        pointerEvents: "auto",
        ...style,
      }}
    >
      <button
        type="button"
        onClick={toggleBgm}
        title={bgmMuted ? "Music: muted" : "Music: on"}
        style={{ ...BUTTON_BASE, ...(bgmMuted ? BUTTON_OFF : null) }}
      >
        {bgmMuted ? "Music Off" : "Music On"}
      </button>
      <button
        type="button"
        onClick={toggleSfx}
        title={sfxMuted ? "Sound: muted" : "Sound: on"}
        style={{ ...BUTTON_BASE, ...(sfxMuted ? BUTTON_OFF : null) }}
      >
        {sfxMuted ? "Sound Off" : "Sound On"}
      </button>
    </div>
  );
}
