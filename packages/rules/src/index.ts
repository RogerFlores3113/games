// Framework-free package: carries the GameAdapter contract (adapter.ts), the
// forehead-card toy (Phase 2's D-01 secret-holding game, deleted in Phase 4
// once the real Hanabi engine lands) and its shared leak checker, AND the
// real Hanabi rules engine (Phase 3) with its own generalized leak checker.
// Declares ZERO dependencies (not even @games/schema) so it builds and tests
// in complete isolation, per FDN-02.

export const RULES_SMOKE = "rules-smoke-ok";

export type {
  AdapterError,
  AdapterResult,
  GameAdapter,
  GameEndResult,
  Variant,
} from "./adapter";

export { FOREHEAD_CARD_VALUES, foreheadCardGame } from "./forehead-card";
export type {
  ForeheadCardAction,
  ForeheadCardState,
  ForeheadCardValue,
  ForeheadCardView,
  HiddenCardView,
  RevealedCard,
  VisibleCardView,
} from "./forehead-card";

export { checkSeatViewForLeaks, secretsForSeat } from "./forehead-card-leak-check";
export type { SeatSecrets } from "./forehead-card-leak-check";

export { hanabiGame } from "./hanabi/adapter";
export { variantConfig, handSizeFor, maxScoreFor, ALL_SUITS, RANKS } from "./hanabi/variant";
export { canPlay, canDiscard, canClue, cardsTouchedByClue } from "./hanabi/legality";
export { currentScore, scoreBand } from "./hanabi/endgame";
export { checkHanabiViewForLeaks, secretsForHanabiSeat } from "./hanabi/hanabi-leak-check";
export type { HanabiAction, HanabiState, HanabiView, HanabiCardView, ClueFacts, Clue } from "./hanabi/state";
export type { Suit, Rank, VariantConfig } from "./hanabi/variant";
export type { HanabiSeatSecrets } from "./hanabi/hanabi-leak-check";
