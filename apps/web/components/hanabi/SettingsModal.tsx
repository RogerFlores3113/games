"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Trash2, X } from "lucide-react";
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
  /** Owner request (2026-09-18): only the host ever sees the "Delete room"
   * control below. Hiding it is a UX nicety, not the security boundary — the
   * worker independently refuses `delete_room` from a non-host with
   * `not_host` regardless of what any client renders. */
  isHost?: boolean;
  /** Absent for a non-host render (defensive: even if `isHost` were ever
   * wrong, there is no handler to wire the button to). */
  onDeleteRoom?: () => void;
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
  isHost = false,
  onDeleteRoom,
}: SettingsModalProps) {
  // Owner request: deleting a room "cannot be undone and it ends the game
  // for everyone" — a plain click must not fire it. Two-step disclosure
  // inside the SAME modal (mirrors the confirm-then-commit shape used
  // elsewhere in the app) rather than a native `window.confirm`, which the
  // Playwright e2e suite cannot reliably drive across browsers.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!open) setConfirmingDelete(false);
  }, [open]);

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

        {isHost && onDeleteRoom && (
          <div
            className="flex flex-col gap-[length:var(--space-xs)] border-t pt-[length:var(--space-md)]"
            style={{ borderColor: "var(--color-border)" }}
          >
            <span
              className="text-[length:var(--text-label)]"
              style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
            >
              Host
            </span>
            {!confirmingDelete ? (
              <button
                type="button"
                data-testid="delete-room-button"
                onClick={() => setConfirmingDelete(true)}
                className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border transition-colors hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                style={{
                  minHeight: "var(--size-touch-min)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                <Trash2 aria-hidden="true" size={16} />
                Delete room
              </button>
            ) : (
              <div className="flex flex-col gap-[length:var(--space-xs)]">
                <p
                  data-testid="delete-room-confirm-copy"
                  className="text-[length:var(--text-label)]"
                  style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
                >
                  This ends the game for everyone and cannot be undone.
                </p>
                <div className="flex gap-[length:var(--space-sm)]">
                  <button
                    type="button"
                    data-testid="delete-room-confirm-button"
                    onClick={onDeleteRoom}
                    className="inline-flex cursor-pointer items-center justify-center rounded-md font-semibold transition-colors hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                    style={{
                      minHeight: "var(--size-touch-min)",
                      flex: 1,
                      backgroundColor: "var(--color-destructive)",
                      color: "var(--color-bg)",
                    }}
                  >
                    Delete for everyone
                  </button>
                  <button
                    type="button"
                    data-testid="delete-room-cancel-button"
                    onClick={() => setConfirmingDelete(false)}
                    className="inline-flex cursor-pointer items-center justify-center rounded-md border transition-colors hover:bg-[var(--color-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                    style={{
                      minHeight: "var(--size-touch-min)",
                      flex: 1,
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
