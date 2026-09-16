// Accumulated clue-fact candidate narrowing (D-06). The engine — not Phase
// 6's UI — owns "what does this player know about this card," because it is
// engine state, not something safely re-derivable later from history alone.
//
// Derivation rule (RESEARCH.md Pitfall 3 — the whole reason this module is
// separate from actions.ts): candidate narrowing is computed by FILTERING
// the current candidate set through the variant's clue-touch predicate,
// keeping only entries whose predicate result equals `wasTouched`. Never
// assign a suit/rank directly from a clue value — in Rainbow, a positive
// color clue does not resolve a card to exactly one candidate suit (it could
// be the named color OR rainbow, since rainbow is touched by every color),
// so `card.suit = clue.value`-style shortcuts would silently produce a wrong,
// overconfident candidate set the moment Rainbow is enabled.

import type { Clue, ClueFacts } from "./state";
import type { Rank, Suit, VariantConfig } from "./variant";
import { RANKS } from "./variant";

/** All suits/ranks possible, no clues given yet. */
export function initialClueFacts(config: VariantConfig): ClueFacts {
  return {
    possibleSuits: config.suits,
    possibleRanks: RANKS,
    positiveClues: [],
    negativeClues: [],
  };
}

/** Narrows `facts` for one card in the target hand after a clue is given.
 * `wasTouched` is whether THIS card was touched by `clue` (per
 * `cardsTouchedByClue`/the variant's clue-touch predicates) — every card in
 * the target's hand gets a call to this function, touched and untouched
 * alike, so both positive and negative information accumulate. */
export function applyClueToSlotFacts(
  config: VariantConfig,
  facts: ClueFacts,
  clue: Clue,
  wasTouched: boolean,
): ClueFacts {
  if (clue.type === "color") {
    const possibleSuits: readonly Suit[] = facts.possibleSuits.filter(
      (suit) => config.colorClueTouches(suit, clue.value) === wasTouched,
    );
    return {
      possibleSuits,
      possibleRanks: facts.possibleRanks,
      positiveClues: wasTouched ? [...facts.positiveClues, clue] : facts.positiveClues,
      negativeClues: wasTouched ? facts.negativeClues : [...facts.negativeClues, clue],
    };
  }

  const possibleRanks: readonly Rank[] = facts.possibleRanks.filter(
    (rank) => config.rankClueTouches(rank, clue.value) === wasTouched,
  );
  return {
    possibleSuits: facts.possibleSuits,
    possibleRanks,
    positiveClues: wasTouched ? [...facts.positiveClues, clue] : facts.positiveClues,
    negativeClues: wasTouched ? facts.negativeClues : [...facts.negativeClues, clue],
  };
}
