// Public-facts-only turn history (D-19, RULES-20). The rule that makes this
// shape safe: an entry may record an identity only once that identity is
// already public to every seat. A played card is public the moment it is
// played (success or misplay, either way its suit/rank become visible in the
// stacks or the discard pile), and a clue's touched-card-ids and clue value
// are, by definition, spoken aloud to the whole table. A DRAW is the one
// action that is never public — the drawer's own hand stays hidden from
// them — so a "draw" entry carries only a card id, structurally lacking any
// `suit`/`rank` key. History is appended, never mutated: `appendHistory`
// always returns a new array via spread, never `push`.

import type { Clue } from "./state";
import type { Rank, Suit } from "./variant";

export type HistoryEntry =
  | {
      readonly turn: number;
      readonly type: "play";
      readonly seatId: string;
      readonly cardId: string;
      readonly suit: Suit;
      readonly rank: Rank;
      readonly success: boolean;
    }
  | {
      readonly turn: number;
      readonly type: "discard";
      readonly seatId: string;
      readonly cardId: string;
      readonly suit: Suit;
      readonly rank: Rank;
    }
  | {
      readonly turn: number;
      readonly type: "clue";
      readonly seatId: string;
      readonly targetSeatId: string;
      readonly clue: Clue;
      readonly touchedCardIds: readonly string[];
    }
  | {
      readonly turn: number;
      readonly type: "draw";
      readonly seatId: string;
      readonly cardId: string;
    };

/** Returns a NEW array with `entry` appended — the input array is never
 * mutated (D-19/RULES-20: history is append-only). */
export function appendHistory(
  history: readonly HistoryEntry[],
  entry: HistoryEntry,
): readonly HistoryEntry[] {
  return [...history, entry];
}
