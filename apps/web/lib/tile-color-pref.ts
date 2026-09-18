import { safeGetItem, safeRemoveItem, safeSetItem } from "./safe-storage";

/**
 * D-13 (TILE-03): the per-player tile-colour preference. Browser-local
 * only, persisted exclusively through `safe-storage.ts` — this module never
 * imports the websocket connection layer, the server-synced client state
 * cache, or an id-generation utility; nothing here can reach the wire.
 *
 * UAT gap 30 (fifth owner review, OVERTURNS D-14): D-14 originally chose a
 * fixed five-preset palette specifically so every option stayed inside
 * contrast limits against suit colours, glyphs and hint tints. The owner
 * rejected that: "please give us a proper color picker, not just preset
 * options." The preference is now an arbitrary player-chosen hex colour (or
 * `null`, meaning "no custom colour chosen — use the default tint"),
 * entered via a native `<input type="color">` (TileColorPicker.tsx).
 *
 * D-14's underlying contrast CONCERN is preserved structurally rather than
 * by restricting the palette: every resolved tint — default or custom —
 * stays a TRANSLUCENT wash painted ON TOP of the card art (see
 * OwnHandCard.tsx/TeammateCard.tsx's overlay span), so it tints and darkens
 * the card underneath rather than ever hiding it entirely (UAT gap 7,
 * 06.2-17). `resolveTileColorCss` below is the ONE place that wraps a
 * chosen colour in that `color-mix()` wash — a fully-saturated colour, pure
 * white, or pure black all still only ever tint, never opaquely cover, the
 * card beneath (verified for those three extremes in tile-color.test.ts).
 *
 * UAT gap 17 (06.2 third owner review, "the cards are dark"): the DEFAULT
 * tint (no custom colour chosen) must read as "barely there," not a second
 * dark wash stacked on the already-dark neutral card back (D-10) — measured
 * against `--color-border`'s picture-frame outline on the card back, a
 * stronger default wash nearly halved that outline's already-subtle
 * contrast. `DEFAULT_TILE_COLOR_CSS` below keeps the same 10% strength that
 * fix landed at; a player-chosen custom colour keeps the stronger, still
 * fully-reviewed 55% strength the four non-default presets used.
 *
 * No hex literal appears anywhere in this file (enforced by the source-scan
 * test in tile-color.test.ts) — the default tint is expressed purely via
 * `var(--color-surface)`, and a player's custom colour is runtime DATA
 * (typed by them into a native colour input, or read back out of
 * `localStorage`), never a hardcoded value baked into source.
 */

export const TILE_COLOR_KEY = "hanabi-tile-color";

/** UAT gap 30: unchanged from the four non-default presets' reviewed
 * strength — the wash a player's own chosen colour is applied at. */
const CUSTOM_TINT_ALPHA_PERCENT = 55;

/** UAT gap 17: the default (no custom colour chosen) wash stays deliberately
 * faint so a fresh player never sees anything darker than "barely there". */
const DEFAULT_TINT_ALPHA_PERCENT = 10;

/** The tint every card renders with before a player ever picks a custom
 * colour — a faint wash of the existing neutral surface token, never a raw
 * hex literal. */
export const DEFAULT_TILE_COLOR_CSS = `color-mix(in srgb, var(--color-surface) ${DEFAULT_TINT_ALPHA_PERCENT}%, transparent)`;

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** True for a well-formed 6-digit `#rrggbb` string — the exact shape a
 * native `<input type="color">` always emits. */
export function isValidHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

/** Wraps a player-chosen hex colour in the same translucent `color-mix()`
 * wash every preset used (UAT gap 7: tint and darken, never hide, the card
 * art beneath). */
export function tileColorCssFromHex(hex: string): string {
  return `color-mix(in srgb, ${hex} ${CUSTOM_TINT_ALPHA_PERCENT}%, transparent)`;
}

/** The CSS value a caller should actually paint: the custom-colour wash
 * when `hex` is a valid stored/chosen colour, else the default wash. */
export function resolveTileColorCss(hex: string | null): string {
  return hex !== null && isValidHexColor(hex) ? tileColorCssFromHex(hex) : DEFAULT_TILE_COLOR_CSS;
}

/** Returns the stored custom hex colour, or `null` when nothing is stored
 * or the stored value is not a well-formed 6-digit hex (tampered/legacy
 * data degrades to "use the default tint" rather than being trusted — the
 * same fail-safe shape the old preset-id gate used). Never throws. */
export function readTileColorPref(): string | null {
  const stored = safeGetItem(TILE_COLOR_KEY);
  if (stored !== null && isValidHexColor(stored)) {
    return stored;
  }
  return null;
}

/** Persists the custom tile-colour preference. Passing `null` clears the
 * stored value, reverting every future read back to the default tint.
 * Never throws. */
export function writeTileColorPref(hex: string | null): void {
  if (hex === null) {
    safeRemoveItem(TILE_COLOR_KEY);
    return;
  }
  safeSetItem(TILE_COLOR_KEY, hex);
}
