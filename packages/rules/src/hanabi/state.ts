// Shared type vocabulary for the Hanabi engine (Plans 02-05 compile against
// these names — do not rename without updating those plans). Mirrors
// forehead-card.ts's type-block pattern: state types are readonly everywhere
// (immutability is structural, not just convention); view types are
// deliberately non-readonly plain Array/object literals so HanabiView stays
// assignable to Phase 4's z.infer type (same split forehead-card.ts uses,
// see forehead-card.ts:69-70).

import type { Variant } from "../adapter";
import type { Rank, Suit } from "./variant";

export type HanabiCard = { readonly id: string; readonly suit: Suit; readonly rank: Rank };

export type Clue =
  | { readonly type: "color"; readonly value: Suit }
  | { readonly type: "rank"; readonly value: Rank };

export type ClueFacts = {
  readonly possibleSuits: readonly Suit[];
  readonly possibleRanks: readonly Rank[];
  readonly positiveClues: readonly Clue[];
  readonly negativeClues: readonly Clue[];
};

export type HandSlot = { readonly card: HanabiCard; readonly facts: ClueFacts };
export type Hand = { readonly seatId: string; readonly slots: readonly HandSlot[] };
export type StackEntry = { readonly suit: Suit; readonly topRank: number }; // 0 = empty stack

import type { HistoryEntry } from "./history";
export type { HistoryEntry } from "./history";

export type HanabiState = {
  readonly variant: Variant;
  readonly seatIds: readonly string[];
  readonly turnIndex: number;
  readonly hands: readonly Hand[];
  readonly deck: readonly HanabiCard[];
  readonly stacks: readonly StackEntry[];
  readonly discard: readonly HanabiCard[];
  /** D-23/D-28: the shared, player-arranged order of the discard pile. Always
   * an exact permutation of `discard`'s ids — every seat's projected view
   * carries the identical value (computed once in projection.ts's public
   * section, never per seat). A newly discarded card (deliberate discard or
   * misplay) always appends to the END of this array, never disturbing the
   * existing arrangement. Mutated only by `reorderDiscard`; every other
   * action branch carries it forward unchanged except where a new discard
   * append is required. */
  readonly discardOrder: readonly string[];
  readonly clueTokens: number;
  readonly fuses: number;
  readonly finalTurnsRemaining: number | null;
  readonly history: readonly HistoryEntry[];
};

export type HanabiAction =
  | { readonly type: "play"; readonly cardId: string }
  | { readonly type: "discard"; readonly cardId: string }
  | { readonly type: "clue"; readonly targetSeatId: string; readonly clue: Clue }
  | { readonly type: "reorder"; readonly cardIds: readonly string[] }
  | { readonly type: "reorderDiscard"; readonly cardIds: readonly string[] };

// View types are deliberately NON-readonly plain objects/arrays so HanabiView
// stays assignable to Phase 4's z.infer type (same split forehead-card.ts's
// ForeheadCardView uses).
export type HanabiCardView =
  | { id: string; hidden: true; facts: ClueFactsView }
  | { id: string; hidden: false; suit: Suit; rank: Rank; facts: ClueFactsView };

export type ClueFactsView = {
  possibleSuits: Suit[];
  possibleRanks: Rank[];
  positiveClues: Array<{ type: "color" | "rank"; value: Suit | Rank }>;
  negativeClues: Array<{ type: "color" | "rank"; value: Suit | Rank }>;
};

// Non-readonly, plain-Array view mirror of HistoryEntry (same split as every
// other *View type in this file): a history entry never crosses the wire
// with more identity than HistoryEntry itself carries (D-19) — this type
// exists only to relax readonly/array-shape for Phase 4's z.infer
// assignability, not to add or remove fields.
export type HistoryEntryView =
  | {
      turn: number;
      type: "play";
      seatId: string;
      cardId: string;
      suit: Suit;
      rank: Rank;
      success: boolean;
    }
  | {
      turn: number;
      type: "discard";
      seatId: string;
      cardId: string;
      suit: Suit;
      rank: Rank;
    }
  | {
      turn: number;
      type: "clue";
      seatId: string;
      targetSeatId: string;
      clue: { type: "color" | "rank"; value: Suit | Rank };
      touchedCardIds: string[];
    }
  | {
      turn: number;
      type: "draw";
      seatId: string;
      cardId: string;
    };

export type HanabiView = {
  variant: Variant;
  yourSeatId: string | null;
  yourHand: HanabiCardView[];
  otherHands: Array<{ seatId: string; cards: HanabiCardView[] }>;
  stacks: Array<{ suit: Suit; topRank: number }>;
  discard: Array<{ id: string; suit: Suit; rank: Rank }>;
  discardOrder: string[];
  clueTokens: number;
  fuses: number;
  deckCount: number;
  finalTurnsRemaining: number | null;
  activeSeatId: string;
  isYourTurn: boolean;
  score: number;
  history: HistoryEntryView[];
};
