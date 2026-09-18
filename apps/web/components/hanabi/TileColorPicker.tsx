"use client";

import { useId } from "react";
import { isValidHexColor } from "../../lib/tile-color-pref";

export interface TileColorPickerProps {
  /** The player's stored custom hex colour, or `null` for the default
   * translucent wash. `null` never reaches the native input as a literal —
   * see the component doc comment below. */
  value: string | null;
  onChange: (hex: string) => void;
}

/**
 * D-13, UAT gap 30 (fifth owner review, OVERTURNS D-14): a real colour
 * picker — a native `<input type="color">` — replaces the five-swatch
 * preset grid D-14 originally chose. `<input type="color">` is keyboard-
 * and screen-reader-accessible for free (it is a standard form control with
 * its own OS/browser colour-picker UI), so no custom popover/keyboard-nav
 * logic is needed, unlike the deleted swatch grid.
 *
 * D-14's underlying CONCERN — every option must stay inside contrast limits
 * against suit colours, glyphs and hint tints — does not disappear just
 * because the palette is now unbounded; it is satisfied structurally
 * instead of by restricting the palette. `resolveTileColorCss` in
 * tile-color-pref.ts always wraps whatever hex the player picks in the SAME
 * low-alpha `color-mix()` the old presets used (UAT gap 7's requirement),
 * so even a fully-saturated colour, pure white, or pure black only ever
 * tints/darkens the card — it can never replace or hide the card surface
 * outright, which is the actual property D-14 was protecting.
 *
 * Uncontrolled by design (`defaultValue`, not `value`): the browser's own
 * colour-picker UI owns the live in-progress selection while it's open;
 * forcing this input controlled would fight that native UI on every
 * keystroke/drag inside the OS colour dialog. `key={value}` remounts the
 * input (refreshing its displayed swatch) whenever the external preference
 * changes from OUTSIDE this component — e.g. the very first paint after
 * `readTileColorPref()` resolves on mount. When `value` is `null` (no
 * custom colour chosen yet), `defaultValue` is left `undefined` rather than
 * a hardcoded literal fallback hex — the browser supplies its own built-in
 * default per the HTML spec, so this file authors zero hex literals,
 * matching tile-color-pref.ts's own "no hex outside @theme" source-scan
 * discipline.
 */
export function TileColorPicker({ value, onChange }: TileColorPickerProps) {
  const inputId = useId();

  return (
    <div className="flex items-center gap-[length:var(--space-sm)]">
      <input
        id={inputId}
        key={value ?? "default"}
        type="color"
        data-testid="tile-color-input"
        aria-label="Tile colour"
        defaultValue={value ?? undefined}
        onChange={(event) => {
          const hex = event.target.value;
          if (isValidHexColor(hex)) onChange(hex);
        }}
        className="cursor-pointer rounded-md border border-[var(--color-border)] bg-transparent p-0"
        style={{ width: 44, height: 32 }}
      />
      <label
        htmlFor={inputId}
        className="text-[length:var(--text-label)]"
        style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
      >
        Choose a tile colour
      </label>
    </div>
  );
}
