"use client";

import { useEffect } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { AudioControls } from "./AudioControls";
import { TileColorPicker } from "./TileColorPicker";

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  muted: boolean;
  volume: number;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  keepHints: boolean;
  onToggleKeepHints: () => void;
  /** UAT gap 30 (overturns D-14): `null` means no custom colour chosen —
   * the default tint applies. */
  tileColorHex: string | null;
  onTileColorChange: (hex: string) => void;
}

/**
 * Gap-closure 06.2-13 (TILE-03/HINT-03/UI-11): the owner's verbatim
 * instruction — "move the settings to a settings modal … center-justified
 * settings modal with card/tile color, volume slider, and hint
 * persistence" plus the follow-up "move everything in… mute joins the
 * volume slider inside the modal" — holds every non-play preference
 * control that previously lived in the bottom-controls-row. Renders
 * nothing when closed, so it costs zero flow height; the gear trigger that
 * opens it lives in `HanabiBoard.tsx`.
 *
 * Mirrors `DiscardOverlay.tsx`'s fixed-backdrop + centred `role="dialog"`
 * panel shape rather than inventing a second dialog pattern: Escape closes,
 * a backdrop click closes, a click inside the panel does not.
 *
 * None of the preference STATE moves here — `audio`, `keepHints`,
 * `tileColorHex` and their handlers stay owned by `HanabiBoard`; this
 * component only renders them in a new location.
 */
export function SettingsModal({
  open,
  onClose,
  muted,
  volume,
  onToggleMute,
  onVolumeChange,
  keepHints,
  onToggleKeepHints,
  tileColorHex,
  onTileColorChange,
}: SettingsModalProps) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-[length:var(--space-md)]"
      style={{ background: "rgba(11, 15, 26, 0.7)", zIndex: 30 }}
      onClick={onClose}
    >
      <div
        data-testid="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="mx-auto flex w-full max-w-sm flex-col gap-[length:var(--space-md)] rounded-lg border-2 p-[length:var(--space-lg)]"
        style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-[length:var(--space-md)]">
          <h2
            className="font-semibold"
            style={{
              color: "var(--color-text)",
              fontSize: "var(--text-heading)",
              lineHeight: "var(--text-heading--line-height)",
            }}
          >
            Settings
          </h2>
          <button
            type="button"
            data-testid="settings-close"
            aria-label="Close settings"
            onClick={onClose}
            className="inline-flex cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-[var(--color-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            style={{
              minHeight: "var(--size-touch-min)",
              minWidth: "var(--size-touch-min)",
              color: "var(--color-text)",
            }}
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-[length:var(--space-xs)]">
          <span
            className="text-[length:var(--text-label)]"
            style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
          >
            Tile colour
          </span>
          <TileColorPicker value={tileColorHex} onChange={onTileColorChange} />
        </div>

        <div className="flex flex-col gap-[length:var(--space-xs)]">
          <span
            className="text-[length:var(--text-label)]"
            style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
          >
            Sound
          </span>
          <AudioControls
            muted={muted}
            volume={volume}
            onToggleMute={onToggleMute}
            onVolumeChange={onVolumeChange}
          />
        </div>

        <div className="flex flex-col gap-[length:var(--space-xs)]">
          <span
            className="text-[length:var(--text-label)]"
            style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
          >
            Hints
          </span>
          <span
            className="relative inline-flex items-center justify-center rounded-md"
            style={{ height: 44, width: 44 }}
          >
            <button
              type="button"
              data-testid="keep-hints-toggle"
              aria-label={keepHints ? "Clear hints after each move" : "Keep hints visible"}
              aria-pressed={keepHints}
              onClick={onToggleKeepHints}
              className="relative inline-flex cursor-pointer items-center justify-center rounded-md border border-[var(--color-border)] bg-transparent text-[var(--color-text)] transition-colors hover:border-[var(--color-text-muted)] hover:bg-[var(--color-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
              style={{ width: 28, height: 28 }}
            >
              {keepHints ? (
                <Eye size={16} aria-hidden="true" color="var(--color-text)" />
              ) : (
                <EyeOff size={16} aria-hidden="true" color="var(--color-text-muted)" />
              )}
              {/* fix(06.2-10), preserved verbatim: the enlarged touch-target
                  span must be a DESCENDANT of the button, not a sibling — a
                  sibling span painted after the button sits on top of it
                  (same stacking context, no z-index), silently swallowing
                  every pointer click at the button's own visual location. */}
              <span aria-hidden="true" className="absolute" style={{ inset: "-8px" }} />
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
