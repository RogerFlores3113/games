"use client";

import { useState } from "react";
import { Palette } from "lucide-react";
import { TILE_COLOR_PRESETS, type TileColorId } from "../../lib/tile-color-pref";
import { CONTROLS_ROW_PX } from "../../lib/layout-budget";

export interface TileColorPickerProps {
  value: TileColorId;
  onChange: (id: TileColorId) => void;
}

const PRESET_LABEL_SUFFIX: Record<TileColorId, string> = {
  slate: "Slate tile colour",
  "warm-sand": "Warm sand tile colour",
  "cool-teal": "Cool teal tile colour",
  plum: "Plum tile colour",
  charcoal: "Charcoal tile colour",
};

/**
 * D-13/D-14 (TILE-03): an icon-only button that opens a small swatch grid
 * of `TILE_COLOR_PRESETS`. The choice is a purely client-side, personal
 * rendering preference — this component never imports anything that could
 * reach the wire, and the chosen id is threaded back to the caller via
 * `onChange`, which `HanabiBoard.tsx` persists through
 * `writeTileColorPref` (never sent to the server).
 *
 * Colours here are the fixed preset palette only — no accent colour beyond
 * the existing reserved focus-ring use (UI-SPEC "reserved accent uses").
 */
export function TileColorPicker({ value, onChange }: TileColorPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-flex">
      <span
        className="relative inline-flex items-center justify-center rounded-md"
        style={{ height: CONTROLS_ROW_PX, width: CONTROLS_ROW_PX }}
      >
        <button
          type="button"
          data-testid="tile-color-picker-toggle"
          aria-label="Choose tile colour"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] bg-transparent text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          style={{ width: 28, height: 28 }}
        >
          <Palette size={16} aria-hidden="true" color="var(--color-text-muted)" />
        </button>
        {/* Out-of-flow touch target — visible glyph stays small, invisible
            hit area reaches the CONTROLS_ROW_PX/44px minimum. */}
        <span aria-hidden="true" className="absolute" style={{ inset: "-8px" }} />
      </span>

      {open && (
        <div
          data-testid="tile-color-picker-panel"
          role="group"
          aria-label="Tile colour presets"
          className="absolute bottom-full left-1/2 mb-[length:var(--space-xs)] flex -translate-x-1/2 gap-[length:var(--space-xs)] rounded-md p-[length:var(--space-xs)]"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          {TILE_COLOR_PRESETS.map((preset) => (
            <span
              key={preset.id}
              className="relative inline-flex items-center justify-center"
              style={{ width: 28, height: 28 }}
            >
              <button
                type="button"
                data-testid={`tile-color-swatch-${preset.id}`}
                aria-label={PRESET_LABEL_SUFFIX[preset.id]}
                aria-pressed={value === preset.id}
                onClick={() => {
                  onChange(preset.id);
                  setOpen(false);
                }}
                className="inline-flex items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                style={{
                  width: 24,
                  height: 24,
                  backgroundColor: preset.cssValue,
                  border:
                    value === preset.id
                      ? "2px solid var(--color-text)"
                      : "1px solid var(--color-border)",
                }}
              />
              <span aria-hidden="true" className="absolute" style={{ inset: "-10px" }} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
