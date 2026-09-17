import type { Clue, HanabiCardView, HanabiView, Rank, Suit, Variant } from "@games/rules";
import { MAX_FUSES, RANKS, maxScoreFor, variantConfig } from "@games/rules";
import { clueTouchCountForTarget, isDiscardDisabled } from "./hanabi-board-logic";

/**
 * D-23 / D-15 boundary: every derivation below is a pure function over the
 * redacted `HanabiView` (or a piece of it) — no DOM types, no React imports,
 * no network/storage access. The own-hand helpers (`luminosityStepFor`,
 * `candidateDisplayFor`) accept ONLY `CardFacts` — a type with no
 * `suit`/`rank` fields — because that is the entire own-hand identity
 * boundary (D-15, carried from Phase 4): if a helper ever needs a card's
 * actual suit/rank to render an own-hand slot, stop, because that is exactly
 * the leak this file exists to make structurally impossible. Teammates'
 * face-up cards may pass a discriminated `HanabiCardView` to callers that
 * need full identity, but these two functions never do.
 */

export type CardFacts = HanabiCardView["facts"];
export type HistoryEntry = HanabiView["history"][number];

export type LuminosityStep = "unclued" | "touched" | "known";

/** D-08: three discrete steps derived from a card's facts alone.
 * "Known" fires whenever both candidate arrays have narrowed to exactly one
 * entry, even if that narrowing came entirely from negative clues (no
 * positive clues at all) — see the state's own docs on negative-clue
 * narrowing. "Touched" requires at least one positive clue. Negative-only
 * narrowing without any positive clue stays "unclued" (D-08 anti-goal): a
 * card nobody pointed at must not look chosen. */
export function luminosityStepFor(facts: CardFacts): LuminosityStep {
  if (facts.possibleSuits.length === 1 && facts.possibleRanks.length === 1) {
    return "known";
  }
  if (facts.positiveClues.length > 0) {
    return "touched";
  }
  return "unclued";
}

export interface CandidateDisplay {
  suits: Array<{ suit: Suit; possible: boolean }>;
  ranks: Array<{ rank: Rank; possible: boolean }>;
  confirmedSuit: Suit | null;
  confirmedRank: Rank | null;
  positiveMarks: Array<{ type: "color"; suit: Suit } | { type: "rank"; rank: Rank }>;
}

/** D-12: lists exactly the variant's suits (so Rainbow shows rainbow, Black
 * shows black) and ranks 1-5, each flagged possible/ruled-out, plus the
 * confirmed suit/rank only once narrowed to exactly one candidate. */
export function candidateDisplayFor(facts: CardFacts, variant: Variant): CandidateDisplay {
  const config = variantConfig(variant);

  const suits = config.suits.map((suit) => ({
    suit,
    possible: facts.possibleSuits.includes(suit),
  }));

  const ranks = RANKS.map((rank) => ({
    rank,
    possible: facts.possibleRanks.includes(rank),
  }));

  const confirmedSuit = facts.possibleSuits.length === 1 ? (facts.possibleSuits[0] ?? null) : null;
  const confirmedRank = facts.possibleRanks.length === 1 ? (facts.possibleRanks[0] ?? null) : null;

  const positiveMarks: CandidateDisplay["positiveMarks"] = [];
  const seen = new Set<string>();
  for (const clue of facts.positiveClues) {
    const mark =
      clue.type === "color"
        ? ({ type: "color", suit: clue.value as Suit } as const)
        : ({ type: "rank", rank: clue.value as Rank } as const);
    const key = `${mark.type}:${mark.type === "color" ? mark.suit : mark.rank}`;
    if (seen.has(key)) continue;
    seen.add(key);
    positiveMarks.push(mark);
  }

  return { suits, ranks, confirmedSuit, confirmedRank, positiveMarks };
}

/** D-14: the touched-card ids of the last clue entry at or after `sinceIndex`
 * in `history`, or [] when no such clue entry exists. Scans backwards from
 * the end so trailing play/discard/draw entries after the clue do not hide
 * it. */
export function touchedCardIdsFromLatestClue(history: HistoryEntry[], sinceIndex = 0): string[] {
  for (let i = history.length - 1; i >= sinceIndex; i -= 1) {
    const entry = history[i];
    if (entry !== undefined && entry.type === "clue") {
      return [...entry.touchedCardIds];
    }
  }
  return [];
}

/** D-11: suits whose stack went from below the max rank to exactly the max
 * rank between two stack snapshots. Uses `RANKS`' own last entry as the
 * "complete" rank rather than a bare literal 5. */
export function newlyCompletedStacks(
  prev: HanabiView["stacks"],
  next: HanabiView["stacks"],
): Suit[] {
  const maxRank = RANKS[RANKS.length - 1];
  const prevBySuit = new Map(prev.map((entry) => [entry.suit, entry.topRank]));
  const completed: Suit[] = [];
  for (const entry of next) {
    if (entry.topRank !== maxRank) continue;
    const prevRank = prevBySuit.get(entry.suit) ?? 0;
    if (prevRank < maxRank) {
      completed.push(entry.suit);
    }
  }
  return completed;
}

/** UI-SPEC durations (D-14 transient clue-touch highlight, D-11 stack-complete flash). */
export const CLUE_HIGHLIGHT_MS = 2000;
export const STACK_FLASH_MS = 600;

// ---------------------------------------------------------------------------
// D-18 / D-20 / D-04 / D-01: action, end-reason, deck-text and turn-order
// derivations. These never call the engine's full-legality checks (they need
// the complete HanabiState, which the client never has) — they dispatch
// through the same
// two client-safe predicates hanabi-board-logic.ts already exposes
// (isDiscardDisabled, clueTouchCountForTarget), keeping one touch/disable
// rule shared across both files (RULES-11, T-06-02).
// ---------------------------------------------------------------------------

export type ActionIntent =
  | { kind: "play"; selectedCardId: string | null }
  | { kind: "discard"; selectedCardId: string | null }
  | { kind: "clue"; targetSeatId: string | null; clue: Clue | null };

export interface ActionContext {
  reconnecting: boolean;
  ended: boolean;
  labelFor?: (seatId: string) => string;
}

/** D-18: a short reason string for every disabled play/discard/clue state,
 * or null when the action is allowed. Check order (fixed, matches
 * behavior spec): ended, then reconnecting, then not-your-turn, then
 * per-kind reasons. */
export function disabledReasonFor(view: HanabiView, intent: ActionIntent, ctx: ActionContext): string | null {
  if (ctx.ended) return "The game has ended";
  if (ctx.reconnecting) return "Reconnecting — actions paused";
  if (!view.isYourTurn) return "Not your turn";

  if (intent.kind === "play") {
    if (!intent.selectedCardId) return "Select a card in your hand first";
    return null;
  }

  if (intent.kind === "discard") {
    if (isDiscardDisabled(view)) return "Clue tokens are full — you can't discard";
    if (!intent.selectedCardId) return "Select a card in your hand first";
    return null;
  }

  // intent.kind === "clue"
  if (view.clueTokens <= 0) return "No clue tokens left";
  if (!intent.targetSeatId) return "Choose a teammate to clue";
  if (!intent.clue) return "Choose a color or rank";
  if (clueTouchCountForTarget(view, intent.targetSeatId, intent.clue) === 0) {
    const labelFor = ctx.labelFor ?? (() => "…");
    return `That clue wouldn't touch any of ${labelFor(intent.targetSeatId)}'s cards`;
  }
  return null;
}

export type EndReason = "fuses_exhausted" | "all_stacks_complete" | "final_round_elapsed";

/** D-20: mirrors checkHanabiGameEnd's fixed order over the redacted view —
 * fuses_exhausted, then all_stacks_complete, then final_round_elapsed, else
 * null. Uses the engine's own MAX_FUSES/maxScoreFor/variantConfig, never a
 * client-side re-derivation of the thresholds. */
export function endReasonForView(view: HanabiView): EndReason | null {
  if (view.fuses >= MAX_FUSES) return "fuses_exhausted";
  if (view.score === maxScoreFor(variantConfig(view.variant))) return "all_stacks_complete";
  if (view.finalTurnsRemaining === 0) return "final_round_elapsed";
  return null;
}

export const END_REASON_COPY: Record<EndReason, string> = {
  fuses_exhausted: "Three fuses were lost.",
  all_stacks_complete: "Every stack was completed!",
  final_round_elapsed: "The deck ran out and the final round elapsed.",
};

/** D-04: the deck-count caption, full-swap to the final-round message once
 * the deck has run out (see UI-SPEC — "0 cards left in deck" during the
 * final round is exactly the confusing state this exists to fix). */
export function deckCountText(view: Pick<HanabiView, "deckCount" | "finalTurnsRemaining">): string {
  if (view.finalTurnsRemaining !== null) {
    return `Final round — ${view.finalTurnsRemaining} turns left`;
  }
  return `${view.deckCount} cards left in deck`;
}

/** D-01: orders `otherHands` starting with the seat immediately after the
 * viewer in room seat order, wrapping around. Falls back to the original
 * order when `yourSeatId` is null or not present in `seatOrder`. A hand
 * whose seatId is missing from `seatOrder` is appended at the end, in its
 * original relative order. */
export function teammatesInTurnOrder<T extends { seatId: string }>(
  otherHands: T[],
  seatOrder: readonly string[],
  yourSeatId: string | null,
): T[] {
  if (yourSeatId === null) return otherHands;
  const yourIndex = seatOrder.indexOf(yourSeatId);
  if (yourIndex === -1) return otherHands;

  const orderIndexOf = (seatId: string): number => {
    const idx = seatOrder.indexOf(seatId);
    if (idx === -1) return Number.POSITIVE_INFINITY;
    // Rotate so the seat right after yourIndex sorts first.
    return (idx - yourIndex - 1 + seatOrder.length) % seatOrder.length;
  };

  return [...otherHands].sort((a, b) => orderIndexOf(a.seatId) - orderIndexOf(b.seatId));
}
