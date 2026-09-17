import type { HanabiView, Suit, Variant } from "@games/rules";
import { RANKS, variantConfig } from "@games/rules";
import { safeGetItem, safeSetItem } from "./safe-storage";

/**
 * D-13: discard pile grouping (per suit, per-rank counts, in variant suit
 * order — matching the box game's compact discard tray) plus the
 * compact/expanded view preference, persisted per browser via
 * `safe-storage.ts` (T-06.1-11: an unrecognised stored value degrades to
 * the "compact" default rather than trusting an arbitrary string).
 */

export type DiscardView = "compact" | "expanded";

export interface DiscardSuitGroup {
  suit: Suit;
  total: number;
  countsByRank: number[];
}

/** One entry per variant suit, in `variantConfig(variant).suits` order —
 * zero-count suits are included with `total: 0` so the compact view always
 * shows every suit's slot. */
export function groupDiscardsBySuit(
  discard: HanabiView["discard"],
  variant: Variant,
): DiscardSuitGroup[] {
  const config = variantConfig(variant);
  return config.suits.map((suit) => {
    const countsByRank = RANKS.map(
      (rank) => discard.filter((card) => card.suit === suit && card.rank === rank).length,
    );
    const total = countsByRank.reduce((sum, count) => sum + count, 0);
    return { suit, total, countsByRank };
  });
}

const DISCARD_VIEW_KEY = "hanabi-discard-view";

/** Defaults to "compact" (D-13). An unrecognised stored value (tampered,
 * corrupted, or from a future/older version) also reads as "compact". */
export function readDiscardViewPref(): DiscardView {
  const stored = safeGetItem(DISCARD_VIEW_KEY);
  return stored === "expanded" ? "expanded" : "compact";
}

/** Persists the compact/expanded toggle preference. Never throws. */
export function writeDiscardViewPref(view: DiscardView): void {
  safeSetItem(DISCARD_VIEW_KEY, view);
}
