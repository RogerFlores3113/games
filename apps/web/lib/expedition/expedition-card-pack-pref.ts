import { safeGetItem, safeSetItem } from "../safe-storage";
import { DEFAULT_CARD_PACK_ID, isCardPackId } from "./card-pack-ids";
import type { CardPackId } from "./card-pack-ids";

/**
 * SCENE-08: the card-pack choice is per-browser and local-only. It is never
 * sent to the server and never affects another seat's view — mirrors
 * `tile-color-pref.ts`'s shape exactly (module-level key constant, a guard
 * against a tampered/unrecognised stored value, read/write through
 * `safe-storage.ts` only).
 *
 * T-12-06: `readCardPackPref` validates the stored value against the
 * `CARD_PACK_IDS` allowlist (via `isCardPackId`) and falls back to
 * `DEFAULT_CARD_PACK_ID` for anything else — a tampered value degrades,
 * it never throws and is never trusted as-is.
 */

export const EXPEDITION_CARD_PACK_KEY = "expedition-card-pack";

/** Returns the stored card-pack preference, or `DEFAULT_CARD_PACK_ID` when
 * nothing is stored, the stored value is unrecognised/tampered, or storage
 * is unavailable. Never throws. */
export function readCardPackPref(): CardPackId {
  const stored = safeGetItem(EXPEDITION_CARD_PACK_KEY);
  return isCardPackId(stored) ? stored : DEFAULT_CARD_PACK_ID;
}

/** Persists the card-pack preference. Never throws. */
export function writeCardPackPref(id: CardPackId): void {
  safeSetItem(EXPEDITION_CARD_PACK_KEY, id);
}
