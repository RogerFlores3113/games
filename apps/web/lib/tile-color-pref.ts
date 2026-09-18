import { safeGetItem, safeSetItem } from "./safe-storage";

/**
 * D-13/D-14 (TILE-03): the tile-colour preset palette and the per-player
 * preference for which preset is active. Browser-local only, persisted
 * exclusively through `safe-storage.ts` — this module never imports the
 * websocket connection layer, the server-synced client state cache, or
 * an id-generation utility; nothing here can reach the wire.
 *
 * UAT gap 7 (06.2-17): a preset is no longer an opaque tile fill — it is a
 * TRANSLUCENT wash painted ON TOP of the card art (see OwnHandCard.tsx /
 * TeammateCard.tsx's overlay span), so changing the preference tints and
 * darkens the card underneath rather than hiding it entirely. The five
 * presets are a FIXED set (UI-SPEC "Tile-colour preset palette"): each
 * preset's `cssValue` is a `color-mix(in srgb, var(--color-*) N%,
 * transparent)` expression, never a raw hex literal and never a fully
 * opaque value — slate derives from the existing `--color-surface` token;
 * the other four reference the `--color-tile-preset-*` `@theme` tokens
 * added by 06.2-02. The N% alpha strength was chosen so the art beneath
 * stays readable at every preset, reviewed by the owner at sign-off. These
 * are decorative personal-preference fills only, never a suit/hint/accent
 * signal colour.
 *
 * UAT gap 17 (06.2 third owner review, "the cards are dark"): slate is the
 * DEFAULT every player sees before ever opening the picker, so it must read
 * as "no visible tint," not just "translucent." Measured with a real
 * getComputedStyle probe against `own-hand-slot-1` at the OLD 45% alpha:
 * the overlay resolved to 45% of `--color-surface`, painted on top of the
 * card-back art's own `--color-border` picture-frame outline. Those two
 * tokens are close in luminance, so stacking a 45%-strength wash of one
 * over the other nearly halved the outline's already-subtle contrast
 * against the card's `--color-surface` container, which reads as a flat,
 * featureless dark rectangle exactly as the owner described — the
 * compounding is the DEFAULT overlay stacking on an already-dark neutral
 * card back (D-10), not an opacity/hiding regression (gap 7/12 already
 * fixed that separately). Dropping slate's alpha to 10% keeps it a real,
 * present translucent wash (never "none" — TILE-01 still wants every tile
 * to read as a raised, tinted object) while preserving roughly 90% of the
 * original border contrast, so the default reads clearly. The other four
 * presets keep their reviewed 55% strength: gap 7's "choosing a colour must
 * still tint and darken the card" behaviour is unchanged for anyone who
 * actually opens the picker.
 */

export type TileColorId = "slate" | "warm-sand" | "cool-teal" | "plum" | "charcoal";

export interface TileColorPreset {
  id: TileColorId;
  label: string;
  cssValue: string;
}

/** Picker order, matching the UI-SPEC's palette table. */
export const TILE_COLOR_PRESETS: TileColorPreset[] = [
  {
    id: "slate",
    label: "Slate",
    // UAT gap 17: 10 percent, not the other presets' reviewed 55 percent —
    // slate is the default every card renders with before a player ever
    // opens the picker, so it must read as "barely there," not a second
    // dark wash stacked on the already-dark neutral card back (see file
    // header).
    cssValue: "color-mix(in srgb, var(--color-surface) 10%, transparent)",
  },
  {
    id: "warm-sand",
    label: "Warm sand",
    cssValue: "color-mix(in srgb, var(--color-tile-preset-warm-sand) 55%, transparent)",
  },
  {
    id: "cool-teal",
    label: "Cool teal",
    cssValue: "color-mix(in srgb, var(--color-tile-preset-cool-teal) 55%, transparent)",
  },
  {
    id: "plum",
    label: "Plum",
    cssValue: "color-mix(in srgb, var(--color-tile-preset-plum) 55%, transparent)",
  },
  {
    id: "charcoal",
    label: "Charcoal",
    cssValue: "color-mix(in srgb, var(--color-tile-preset-charcoal) 55%, transparent)",
  },
];

const KNOWN_IDS = new Set<TileColorId>(TILE_COLOR_PRESETS.map((preset) => preset.id));

export const TILE_COLOR_KEY = "hanabi-tile-color";

const DEFAULT_TILE_COLOR_ID: TileColorId = "slate";

/** Returns `"slate"` when nothing is stored or the stored id is not one of
 * the five known presets (T-06.2-07: a tampered/legacy value degrades to
 * the documented default rather than being trusted). Never throws. */
export function readTileColorPref(): TileColorId {
  const stored = safeGetItem(TILE_COLOR_KEY);
  if (stored !== null && KNOWN_IDS.has(stored as TileColorId)) {
    return stored as TileColorId;
  }
  return DEFAULT_TILE_COLOR_ID;
}

/** Persists the tile-colour preference. Never throws. */
export function writeTileColorPref(id: TileColorId): void {
  safeSetItem(TILE_COLOR_KEY, id);
}
