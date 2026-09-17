import type { Rank, Suit } from "@games/rules";
import type { HistoryEntry } from "./hanabi-visual-logic";
import { liveHistoryEntries } from "./hanabi-live-history";

/**
 * D-21/D-23 boundary: pure event derivation, no DOM. `flyToEventsForTransition`
 * decides WHICH departing cards fly and WHERE — the component (FlyToLayer,
 * 06.1-13 Task 2) is the only place that turns an event into a ghost element.
 * "Live" is delegated entirely to `liveHistoryEntries` (the shared D-29
 * no-catch-up boundary, 06.1-04) so mount/refresh/reconnect never replay a
 * fly-to animation, matching the audio-cue selector's own contract.
 */
export interface FlyToEvent {
  cardId: string;
  seatId: string;
  suit: Suit;
  rank: Rank;
  destination: "stack" | "discard";
}

/**
 * D-21: one event per live play/misplay/discard history entry, in history
 * order. A successful play flies to its stack; a misplay or a plain discard
 * flies to the discard pile (misplayed cards are discarded by the engine).
 * Clue and draw entries never produce an event. `suppressedCardIds` is the
 * dragging player's own drop set (useHandDrag's `droppedCardIdsRef`) — a
 * card the viewer themselves just dragged onto a zone is excluded, since
 * that player already saw the card leave their hand under their own pointer.
 */
export function flyToEventsForTransition(
  prevHistory: readonly HistoryEntry[] | null,
  nextHistory: readonly HistoryEntry[],
  suppressedCardIds: ReadonlySet<string>,
): FlyToEvent[] {
  const liveEntries = liveHistoryEntries(prevHistory, nextHistory);
  const events: FlyToEvent[] = [];
  for (const entry of liveEntries) {
    if (entry.type !== "play" && entry.type !== "discard") continue;
    if (suppressedCardIds.has(entry.cardId)) continue;
    events.push({
      cardId: entry.cardId,
      seatId: entry.seatId,
      suit: entry.suit,
      rank: entry.rank,
      destination: entry.type === "play" && entry.success ? "stack" : "discard",
    });
  }
  return events;
}
