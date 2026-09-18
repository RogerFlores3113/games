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
 * UAT gap 36 (seventh owner review): this input is CONTROLLED
 * (`value`/`onChange`), not remounted per selection. An earlier revision
 * used `defaultValue` plus `key={value}` to dodge fighting the native OS
 * colour dialog's own in-progress state — but that `key` changes on every
 * `onChange`, which unmounts and replaces the DOM node on the FIRST colour
 * pick. The browser's native colour dialog keeps firing `input` events at
 * that same (now-detached) node for as long as it stays open — e.g. every
 * further drag on the OS colour wheel in one session — and a detached
 * node's events never reach React's root listener, so every colour picked
 * after the first is silently dropped. A plain controlled input has no
 * such remount: React only ever updates the node's `value` property
 * between renders, so the node stays identical (and still listening)
 * across an entire native-dialog session. `value` falls back to an empty
 * string (never a hardcoded hex) when no custom colour is chosen yet — the
 * one fallback a controlled colour input requires — which keeps this file
 * at zero hex literals per tile-color-pref.ts's source-scan discipline.
 */
export function TileColorPicker({ value, onChange }: TileColorPickerProps) {
  const inputId = useId();

  return (
    <div className="flex items-center gap-[length:var(--space-sm)]">
      <input
        id={inputId}
        type="color"
        data-testid="tile-color-input"
        aria-label="Tile colour"
        value={value ?? ""}
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
