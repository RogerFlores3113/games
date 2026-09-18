import type { Rank, Suit } from "@games/rules";
import type { CardFacts, HistoryEntry } from "./hanabi-visual-logic";

/**
 * D-05/D-06/D-07 (HINT-01..04): the hint indicator system's data derivation.
 *
 * Own-hand-safe (D-15 identity boundary): `hintDisplayFor` accepts ONLY
 * `CardFacts` — never a card object, never a `suit`/`rank` field — so a
 * hint can be computed for the viewer's own hidden hand without leaking
 * card identity. It reads `facts.positiveClues` exclusively; per D-07
 * (owner-confirmed 2026-09-17, "Let it go"), ruled-out/negative clue
 * information (`negativeClues`, `possibleSuits`, `possibleRanks` narrowing)
 * is deliberately absent from the hint display shape and must never be
 * reintroduced here — there is no hover/click reveal, no partial exposure,
 * nothing. If a future task wants that information back, that is a new
 * owner decision, not a bug fix to this file.
 *
 * D-06 OVERTURNED (UAT sixth owner review, gap 34, 2026-09-18): hints no
 * longer accumulate. A card's display shows ONLY what its MOST RECENT clue
 * said — telling a card "2" after it was earlier told "blue" now shows the
 * 2 alone, not both. `facts.positiveClues` is populated by
 * `clue-facts.ts` via `[...facts.positiveClues, clue]` (append-only, never
 * reordered or pruned — see `packages/rules/src/hanabi/clue-facts.ts`), so
 * its LAST element is always the chronologically most recent clue that
 * touched this specific card; `hintDisplayFor` reads only that last
 * element rather than folding over the whole array.
 *
 * Hint LIFETIME (`hintsVisibleForCard`, D-05/HINT-03) is TURN-based, never
 * time-based. This is deliberately NOT modeled with a delayed-clear timer,
 * a mutable-cell clear-timer, or an effect-cleanup callback —
 * `HanabiBoard.tsx`'s existing `justCluedIds` 2000ms flash uses exactly
 * that timer pattern, but it is solving a genuinely time-based problem (a
 * transient clue-touch flash) and `game` being a brand-new object on every
 * partysocket frame is precisely why that pattern needs a mutable cell in
 * the first place (06.1 CR-01). Hint persistence has no time component at
 * all: it is a pure function of `history` (has any later play/discard/clue
 * entry followed the clue that touched this card?), so it is derived
 * synchronously on every render with no timer, no mutable cell, and no
 * stored derived state whatsoever.
 */

export interface HintDisplay {
  colorHints: Suit[];
  numberHints: Rank[];
}

/** D-06 (overturned by UAT gap 34): a card's hint display reflects only its
 * MOST RECENT clue — never an accumulation across every clue it has ever
 * received. A single clue is always exactly one type (colour or rank), so
 * the returned display carries at most one channel populated: the latest
 * clue's own type. Derived only from `facts.positiveClues`'s last entry
 * (chronological append order — see this file's header comment). Ignores
 * `negativeClues`, `possibleSuits` and `possibleRanks` entirely (D-07). */
export function hintDisplayFor(facts: CardFacts): HintDisplay {
  const latest = facts.positiveClues[facts.positiveClues.length - 1];
  if (latest === undefined) return { colorHints: [], numberHints: [] };

  if (latest.type === "color") {
    return { colorHints: [latest.value as Suit], numberHints: [] };
  }
  return { colorHints: [], numberHints: [latest.value as Rank] };
}

export interface HintVisibilityOptions {
  keepVisible: boolean;
}

/** D-05/HINT-03: whether `cardId`'s hints should currently render.
 *
 * `keepVisible: true` — hints persist for the card's whole life in the
 * hand: true whenever `cardId` has ever been touched by any clue entry in
 * `history`.
 *
 * `keepVisible: false` (default) — hints clear once the next player has
 * acted: true only when the most recent history entry that is NOT a draw
 * is a clue entry whose `touchedCardIds` includes `cardId`. A `draw` never
 * counts as "the next player acting" (drawing is a side effect of another
 * player's play/discard, not an action of its own), so trailing draw
 * entries after a qualifying clue do not clear the hint. Any later play,
 * discard, or clue entry does clear it. */
export function hintsVisibleForCard(
  history: HistoryEntry[],
  cardId: string,
  options: HintVisibilityOptions,
): boolean {
  if (options.keepVisible) {
    return history.some(
      (entry) => entry.type === "clue" && entry.touchedCardIds.includes(cardId),
    );
  }

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (entry === undefined || entry.type === "draw") continue;
    return entry.type === "clue" && entry.touchedCardIds.includes(cardId);
  }
  return false;
}
