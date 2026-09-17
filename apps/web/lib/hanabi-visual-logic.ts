import type { HanabiCardView, HanabiView, Rank, Suit, Variant } from "@games/rules";
import { RANKS, variantConfig } from "@games/rules";

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
