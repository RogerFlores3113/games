"use client";

import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import { useStore } from "zustand";
import { audioPrefsStore, type AudioPrefs } from "../../lib/expedition/audio/audio-prefs";
import { playCue } from "../../lib/expedition/audio/cue-bus";
import { CARD_PACK_IDS, CARD_PACK_LABELS, type CardPackId } from "../../lib/expedition/card-pack-ids";

export interface ExpeditionSettingsModalProps {
  open: boolean;
  onClose: () => void;
  cardPackId: CardPackId;
  onCardPackChange: (id: CardPackId) => void;
  /** Owner pattern (mirrors Hanabi's SettingsModal): hiding this is a UX
   * nicety, not the security boundary — the worker independently re-checks
   * host on every `delete_room`/`restart_lobby` regardless of what any
   * client renders (T-12-25). */
  isHost?: boolean;
  onDeleteRoom?: () => void;
  /** Host-only AND the run has ended (`runStatus !== "in_progress"`). */
  canRestart?: boolean;
  onRestartLobby?: () => void;
}

/**
 * D-05: the Expedition table's only HTML chrome besides the reconnect
 * banner — a corner gear button (ExpeditionBoard.tsx) opens this modal.
 * Ports `SettingsModal.tsx`'s proven shell (fixed backdrop, centred
 * `role="dialog"`, Escape-to-close, backdrop click closes, panel click
 * stops propagation, two-step delete disclosure) verbatim, swapping in the
 * Expedition-specific controls: a card-pack picker (SCENE-08), a no-op mute
 * toggle (D-07), host-only restart, and a plain Leave link (D-05, closes
 * Phase 11 review WR-05).
 */
const VOLUME_SLIDERS: { key: Exclude<keyof AudioPrefs, "muted">; label: string }[] = [
  { key: "music", label: "Music" },
  { key: "ambience", label: "Ambience" },
  { key: "sfx", label: "Effects" },
];

export function ExpeditionSettingsModal({
  open,
  onClose,
  cardPackId,
  onCardPackChange,
  isHost = false,
  onDeleteRoom,
  canRestart = false,
  onRestartLobby,
}: ExpeditionSettingsModalProps) {
  // Owner request (ported verbatim from SettingsModal.tsx): deleting a room
  // "cannot be undone and it ends the game for everyone" — a plain click
  // must not fire it. Two-step disclosure inside the same modal.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const prefs = useStore(audioPrefsStore);

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
        data-testid="expedition-settings-modal"
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
            data-testid="expedition-settings-close"
            aria-label="Close settings"
            onClick={() => {
              playCue("sfx-ui-click");
              onClose();
            }}
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

        <fieldset className="flex flex-col gap-[length:var(--space-xs)] border-0 p-0 m-0">
          <legend
            className="text-[length:var(--text-label)]"
            style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
          >
            Card pack
          </legend>
          <div className="flex flex-col gap-[length:var(--space-xs)]" role="radiogroup" aria-label="Card pack">
            {CARD_PACK_IDS.map((id) => (
              <label
                key={id}
                className="inline-flex cursor-pointer items-center gap-[length:var(--space-xs)]"
                style={{ color: "var(--color-text)" }}
              >
                <input
                  type="radio"
                  name="card-pack"
                  value={id}
                  checked={cardPackId === id}
                  onChange={() => {
                    playCue("sfx-ui-click");
                    onCardPackChange(id);
                  }}
                />
                {CARD_PACK_LABELS[id]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-[length:var(--space-xs)]">
          <span
            className="text-[length:var(--text-label)]"
            style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
          >
            Sound
          </span>
          <button
            type="button"
            data-testid="expedition-mute-toggle"
            aria-label={prefs.muted ? "Unmute" : "Mute"}
            aria-pressed={prefs.muted}
            onClick={() => {
              playCue("sfx-ui-click");
              audioPrefsStore.setState((state) => ({ muted: !state.muted }));
            }}
            className="inline-flex cursor-pointer items-center justify-center self-start rounded-md border transition-colors hover:bg-[var(--color-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            style={{
              minHeight: "var(--size-touch-min)",
              minWidth: "var(--size-touch-min)",
              borderColor: "var(--color-border)",
              color: "var(--color-text)",
              paddingLeft: "var(--space-md)",
              paddingRight: "var(--space-md)",
            }}
          >
            {prefs.muted ? "Unmute (M)" : "Mute (M)"}
          </button>
          {VOLUME_SLIDERS.map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between gap-[length:var(--space-md)]" style={{ color: "var(--color-text)" }}>
              {label}
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(prefs[key] * 100)}
                data-testid={`expedition-volume-${key}`}
                aria-label={`${label} volume`}
                disabled={prefs.muted}
                onChange={(event) => audioPrefsStore.setState({ [key]: Number(event.target.value) / 100 })}
                onPointerUp={() => key === "sfx" && playCue("sfx-ui-click")}
                style={{ width: "10rem" }}
              />
            </label>
          ))}
        </div>

        {isHost && (canRestart || onDeleteRoom) && (
          <div
            className="flex flex-col gap-[length:var(--space-md)] border-t pt-[length:var(--space-md)]"
            style={{ borderColor: "var(--color-border)" }}
          >
            <span
              className="text-[length:var(--text-label)]"
              style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
            >
              Host
            </span>

            {isHost && canRestart && onRestartLobby && (
              <button
                type="button"
                data-testid="expedition-restart-button"
                onClick={onRestartLobby}
                className="inline-flex cursor-pointer items-center justify-center rounded-md border transition-colors hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                style={{
                  minHeight: "var(--size-touch-min)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                Restart
              </button>
            )}

            {isHost && onDeleteRoom && (
              <>
                {!confirmingDelete ? (
                  <button
                    type="button"
                    data-testid="expedition-delete-room-button"
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
                      data-testid="expedition-delete-room-confirm-copy"
                      className="text-[length:var(--text-label)]"
                      style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
                    >
                      This ends the game for everyone and cannot be undone.
                    </p>
                    <div className="flex gap-[length:var(--space-sm)]">
                      <button
                        type="button"
                        data-testid="expedition-delete-room-confirm-button"
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
                        data-testid="expedition-delete-room-cancel-button"
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
              </>
            )}
          </div>
        )}

        <div
          className="flex flex-col gap-[length:var(--space-xs)] border-t pt-[length:var(--space-md)]"
          style={{ borderColor: "var(--color-border)" }}
        >
          <a
            href="/"
            data-testid="expedition-leave-link"
            className="inline-flex cursor-pointer items-center justify-center rounded-md border transition-colors hover:bg-[var(--color-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            style={{
              minHeight: "var(--size-touch-min)",
              borderColor: "var(--color-border)",
              color: "var(--color-text)",
            }}
          >
            Leave table
          </a>
          <p
            className="text-[length:var(--text-label)]"
            style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
          >
            Your seat stays yours - reopen the room link to come back.
          </p>
        </div>
      </div>
    </div>
  );
}
