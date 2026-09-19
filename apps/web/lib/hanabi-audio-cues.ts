import type { HanabiView, Suit } from "@games/rules";
import { newlyCompletedStacks } from "./hanabi-visual-logic";
import type { HistoryEntry } from "./hanabi-visual-logic";
import { liveHistoryEntries } from "./hanabi-live-history";

/**
 * D-24/D-25/D-27/D-28/D-29 boundary: pure cue selection, no React, no Web
 * Audio. `cueForEntry` is ONE precedence chain (fuse > stack-complete >
 * play) per RESEARCH.md Pitfall 4 — never three independent boolean checks
 * that could each fire their own sound for the same entry.
 */
export type Cue = "clue" | "play" | "discard" | "fuse" | "stack-complete";

/** D-24/D-28: exactly one cue (or null for a silent entry like "draw") per
 * history entry. `completedSuits` is the output of
 * `newlyCompletedStacks(prevStacks, nextStacks)` — callers must derive it
 * from that shared function, never re-derive stack completion here. */
export function cueForEntry(entry: HistoryEntry, completedSuits: readonly Suit[]): Cue | null {
  switch (entry.type) {
    case "play": {
      if (!entry.success) return "fuse"; // D-24: misplay -> fuse cue, never "play"
      // D-28: direction-agnostic. A successful play that completed its stack
      // triggers "stack-complete" regardless of rank -- a descending (Black)
      // stack completes on its 1, not its 5, so this must not assume rank 5.
      if (completedSuits.includes(entry.suit)) return "stack-complete";
      return "play";
    }
    case "discard":
      return "discard";
    case "clue":
      return "clue";
    case "draw":
      return null;
    default:
      return null;
  }
}

type TransitionSnapshot = {
  history: readonly HistoryEntry[];
  stacks: HanabiView["stacks"];
};

/** D-29: cues to play for a state transition. `prev === null` means this is
 * the first view the client has ever seen (mount/refresh/reconnect
 * catch-up) — always []. Delegates "which entries are new" to
 * `liveHistoryEntries` (shared with the fly-to animation) and "which
 * stacks just completed" to `newlyCompletedStacks` (shared with the
 * visual flash) so there is exactly one derivation of each fact. */
export function cuesForTransition(
  prev: TransitionSnapshot | null,
  next: TransitionSnapshot,
): Cue[] {
  if (prev === null) return [];
  const liveEntries = liveHistoryEntries(prev.history, next.history);
  const completedSuits = newlyCompletedStacks(prev.stacks, next.stacks);
  const cues: Cue[] = [];
  for (const entry of liveEntries) {
    const cue = cueForEntry(entry, completedSuits);
    if (cue !== null) cues.push(cue);
  }
  return cues;
}
