import { safeGetItem, safeSetItem } from "./safe-storage";

/**
 * D-05/HINT-03: the "keep hints visible" toggle. Per-player, browser-local,
 * persisted exclusively through `safe-storage.ts` (the one storage wrapper
 * — mirrors `hanabi-discard-logic.ts`'s `readDiscardViewPref` pair). Scoped
 * per player only, NOT per room or per card, so the preference survives
 * across rooms.
 *
 * Default is **off** (T-06.2-07: an unrecognised/tampered stored value also
 * degrades to the "off" default, never trusting an arbitrary string).
 */

export const KEEP_HINTS_KEY = "hanabi-keep-hints";

const TRUE_VALUE = "true";
const FALSE_VALUE = "false";

/** Returns `false` (hints clear after each move) when nothing is stored or
 * the stored value is not the exact recognised "true" string. Never
 * throws. */
export function readKeepHintsPref(): boolean {
  return safeGetItem(KEEP_HINTS_KEY) === TRUE_VALUE;
}

/** Persists the keep-hints-visible preference. Never throws. */
export function writeKeepHintsPref(value: boolean): void {
  safeSetItem(KEEP_HINTS_KEY, value ? TRUE_VALUE : FALSE_VALUE);
}
