// Framework-free package: carries the GameAdapter contract (adapter.ts) and
// the real Hanabi rules engine (Phase 3) with its own generalized leak
// checker. Declares ZERO dependencies (not even @games/schema) so it builds
// and tests in complete isolation, per FDN-02.

export const RULES_SMOKE = "rules-smoke-ok";

export type {
  AdapterError,
  AdapterResult,
  GameAdapter,
  GameEndResult,
  Variant,
} from "./adapter";

export { hanabiGame } from "./hanabi/adapter";
export {
  variantConfig,
  handSizeFor,
  maxScoreFor,
  ALL_SUITS,
  RANKS,
  DESCENDING_RANK_COUNTS,
  playOrderFor,
  nextPlayableRank,
  isStackComplete,
} from "./hanabi/variant";
export { canPlay, canDiscard, canClue, canReorder, cardsTouchedByClue, MAX_FUSES } from "./hanabi/legality";
export { currentScore, scoreBand } from "./hanabi/endgame";
export { checkHanabiViewForLeaks, secretsForHanabiSeat } from "./hanabi/hanabi-leak-check";
export type { HanabiAction, HanabiState, HanabiView, HanabiCardView, ClueFacts, Clue } from "./hanabi/state";
export type { Suit, Rank, VariantConfig, ColorTouch, SuitRule, StackDirection } from "./hanabi/variant";
export type { HanabiSeatSecrets } from "./hanabi/hanabi-leak-check";
