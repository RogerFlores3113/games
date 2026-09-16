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

// TODO(plan 02): replace this placeholder with `export type { HistoryEntry }
// from "./history"` once history.ts exists. Kept local here so state.ts
// compiles standalone for this plan.
export type HistoryEntry = unknown;

export type HanabiState = {
  readonly variant: Variant;
  readonly seatIds: readonly string[];
  readonly turnIndex: number;
  readonly hands: readonly Hand[];
  readonly deck: readonly HanabiCard[];
  readonly stacks: readonly StackEntry[];
  readonly discard: readonly HanabiCard[];
  readonly clueTokens: number;
  readonly fuses: number;
  readonly finalTurnsRemaining: number | null;
  readonly history: readonly HistoryEntry[];
};

export type HanabiAction =
  | { readonly type: "play"; readonly cardId: string }
  | { readonly type: "discard"; readonly cardId: string }
  | { readonly type: "clue"; readonly targetSeatId: string; readonly clue: Clue };

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

export type HanabiView = {
  variant: Variant;
  yourSeatId: string | null;
  yourHand: HanabiCardView[];
  otherHands: Array<{ seatId: string; cards: HanabiCardView[] }>;
  stacks: Array<{ suit: Suit; topRank: number }>;
  discard: Array<{ id: string; suit: Suit; rank: Rank }>;
  clueTokens: number;
  fuses: number;
  deckCount: number;
  finalTurnsRemaining: number | null;
  activeSeatId: string;
  isYourTurn: boolean;
  score: number;
  history: unknown[]; // HistoryEntryView[], concretized in plan 02
};
