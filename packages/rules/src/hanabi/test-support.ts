// Test-only helpers for Hanabi's property tests (plan 05, D-20/D-22). This
// module is held to the same zero-Node/zero-Worker purity standard as every
// other file in this package (see adapter.test.ts's purity file list).
//
// CONSTRAINT (T-03-24): enumerateLegalActions builds CANDIDATE actions and
// filters them through legality.ts's exported canPlay/canDiscard/canClue
// predicates ONLY. It never re-derives Hanabi's rules locally. A private
// re-implementation of legality here would make every property test that
// drives games through this helper self-confirming — it would prove the
// test's own copy of the rules is internally consistent, not that the real
// engine is correct. If a legality predicate is wrong, this helper must
// reproduce that same wrongness, not silently correct it.

import { activeSeatId, canClue, canDiscard, canPlay } from "./legality";
import { RANKS, variantConfig } from "./variant";
import type { HanabiAction, HanabiState } from "./state";

/** The seat whose turn it currently is — a thin re-export of legality.ts's
 * activeSeatId so property tests need only import from this module. */
export function currentActorSeatId(state: HanabiState): string {
  return activeSeatId(state);
}

/** Every action currently legal for the active seat, derived from the
 * exported legality predicates. Returns `[]` once the game has ended (every
 * candidate fails its predicate's game_over check). Covers all three action
 * types: every own-hand card's play/discard candidacy, and one clue
 * candidate per (target seat, cluable color) and per (target seat, rank) —
 * only the ones that actually pass canClue (i.e. touch at least one card)
 * are included. */
export function enumerateLegalActions(state: HanabiState): HanabiAction[] {
  const actorSeatId = activeSeatId(state);
  const actions: HanabiAction[] = [];

  const ownHand = state.hands.find((h) => h.seatId === actorSeatId);
  if (ownHand !== undefined) {
    for (const slot of ownHand.slots) {
      if (canPlay(state, actorSeatId, slot.card.id).legal) {
        actions.push({ type: "play", cardId: slot.card.id });
      }
      if (canDiscard(state, actorSeatId, slot.card.id).legal) {
        actions.push({ type: "discard", cardId: slot.card.id });
      }
    }
  }

  const config = variantConfig(state.variant);
  for (const targetSeatId of state.seatIds) {
    if (targetSeatId === actorSeatId) continue;

    for (const color of config.cluableColors) {
      const clue = { type: "color" as const, value: color };
      if (canClue(state, actorSeatId, targetSeatId, clue).legal) {
        actions.push({ type: "clue", targetSeatId, clue });
      }
    }

    for (const rank of RANKS) {
      const clue = { type: "rank" as const, value: rank };
      if (canClue(state, actorSeatId, targetSeatId, clue).legal) {
        actions.push({ type: "clue", targetSeatId, clue });
      }
    }
  }

  return actions;
}

/** Every card minted for this game, located exactly once: "deck" | "hand" |
 * "discard" | "stack". Returns a map from card id to location. Played
 * cards have no surviving minted id in state (a stack only tracks
 * `{suit, topRank}`), so this function represents each played card with a
 * synthetic, collision-free id (`${suit}:stack:${rank}`) rather than
 * omitting it from the count — omitting played cards would make the total
 * located count silently shrink as a game progresses, defeating the whole
 * point of a conservation check. If any REAL card id is recorded twice (a
 * conservation bug), its map value is the "+"-joined list of every location
 * it was seen in, so a caller can detect the collision without this helper
 * throwing mid-walk. */
export function locateAllCards(state: HanabiState): Map<string, string> {
  const locations = new Map<string, string>();
  const record = (id: string, location: string): void => {
    const existing = locations.get(id);
    locations.set(id, existing === undefined ? location : `${existing}+${location}`);
  };

  for (const card of state.deck) record(card.id, "deck");
  for (const hand of state.hands) {
    for (const slot of hand.slots) record(slot.card.id, "hand");
  }
  for (const card of state.discard) record(card.id, "discard");
  for (const stack of state.stacks) {
    for (let rank = 1; rank <= stack.topRank; rank++) {
      record(`${stack.suit}:stack:${rank}`, "stack");
    }
  }

  return locations;
}
