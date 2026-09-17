import type { HistoryEntry } from "./hanabi-visual-logic";

/**
 * D-29 boundary: this is the ONE place "which history entries are live"
 * gets decided — both the fly-to animation (06.1-13) and the audio cue
 * selector (this plan) must go through it rather than each re-deriving
 * their own "is this entry new" check.
 *
 * Callers MUST pass `null` for `prevHistory` on the first view a client
 * ever renders after mount, after a page refresh, and after any reconnect
 * (the caller resets its baseline to `null` the moment `reconnecting`
 * becomes `true`, then starts tracking again from the next view it
 * receives). Passing the empty array `[]` instead of `null` is wrong: an
 * empty array would diff against the FULL history array on the very next
 * view, replaying the entire game's history as a burst of live entries —
 * exactly the "catch-up" behavior D-29 forbids.
 */
export function liveHistoryEntries(
  prevHistory: readonly HistoryEntry[] | null,
  nextHistory: readonly HistoryEntry[],
): HistoryEntry[] {
  if (prevHistory === null) return [];
  if (nextHistory.length <= prevHistory.length) return [];
  return nextHistory.slice(prevHistory.length);
}
