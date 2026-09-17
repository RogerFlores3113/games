"use client";

import { Volume2, VolumeX } from "lucide-react";

export interface AudioControlsProps {
  muted: boolean;
  volume: number;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
}

/**
 * D-26: icon-only mute toggle + volume slider for the bottom controls row.
 * Colours are --color-text / --color-text-muted / --color-border only —
 * accent is reserved for focus rings (UI-SPEC's reserved-use list), never
 * used decoratively here.
 */
export function AudioControls({ muted, volume, onToggleMute, onVolumeChange }: AudioControlsProps) {
  const percent = Math.round(volume * 100);

  return (
    <div className="flex items-center gap-[length:var(--space-xs)]">
      <button
        type="button"
        data-testid="audio-mute-toggle"
        aria-label={muted ? "Unmute sound" : "Mute sound"}
        aria-pressed={muted}
        onClick={onToggleMute}
        className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] bg-transparent text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        style={{ minWidth: "var(--size-touch-min)", minHeight: "var(--size-touch-min)" }}
      >
        {muted ? (
          <VolumeX size={20} aria-hidden="true" color="var(--color-text-muted)" />
        ) : (
          <Volume2 size={20} aria-hidden="true" color="var(--color-text)" />
        )}
      </button>

      <input
        type="range"
        data-testid="audio-volume"
        aria-label="Sound volume"
        min={0}
        max={100}
        value={percent}
        onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
        className="accent-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        style={{ minWidth: "var(--size-touch-min)", minHeight: "var(--size-touch-min)" }}
      />
    </div>
  );
}
