import { safeGetItem, safeSetItem } from "./safe-storage";

/**
 * D-13/D-14 (TILE-03): the tile-colour preset palette and the per-player
 * preference for which preset is active. Browser-local only, persisted
 * exclusively through `safe-storage.ts` — this module never imports the
 * websocket connection layer, the server-synced client state cache, or
 * an id-generation utility; nothing here can reach the wire.
 *
 * The five presets are a FIXED set (UI-SPEC "Tile-colour preset palette"):
 * each preset's `cssValue` is a `var(--color-*)` token reference, never a
 * raw hex literal — slate derives from the existing `--color-surface`
 * token via `color-mix`; the other four reference the `--color-tile-preset-*`
 * `@theme` tokens added by 06.2-02. These are decorative personal-
 * preference fills only, never a suit/hint/accent signal colour.
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
    cssValue: "color-mix(in srgb, var(--color-surface) 100%, transparent)",
  },
  {
    id: "warm-sand",
    label: "Warm sand",
    cssValue: "var(--color-tile-preset-warm-sand)",
  },
  {
    id: "cool-teal",
    label: "Cool teal",
    cssValue: "var(--color-tile-preset-cool-teal)",
  },
  {
    id: "plum",
    label: "Plum",
    cssValue: "var(--color-tile-preset-plum)",
  },
  {
    id: "charcoal",
    label: "Charcoal",
    cssValue: "var(--color-tile-preset-charcoal)",
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
