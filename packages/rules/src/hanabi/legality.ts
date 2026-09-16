// Typed legality predicates (D-13). These exist so Phase 6's UI can ask "is
// this action legal?" and disable illegal actions without ever calling
// `applyAction` — every predicate here is a pure function over state, and
// `applyAction` (plan 03) MUST call these same functions rather than
// re-implementing the checks, so the two can never drift apart.
//
// Guard order mirrors forehead-card.ts:128-138: turn check, then game-over
// check, then action-specific checks — kept consistent because
// adapter.test.ts's conformance suite exercises rejection paths in this
// order.
//
// `cardsTouchedByClue` is the single shared touch resolver used by BOTH
// clue types and by the zero-touch check (RESEARCH.md Pitfall 2): there is
// deliberately no per-clue-type pair of legality functions, because that
// split is exactly the asymmetry that lets a zero-touch bug slip through
// for one clue type and not the other.

import type { AdapterError } from "../adapter";
import type { Clue, HanabiState, HandSlot } from "./state";
import { variantConfig, type VariantConfig } from "./variant";

export const MAX_CLUE_TOKENS = 8;
export const MAX_FUSES = 3;

export type Legality = { legal: true } | { legal: false; reason: AdapterError };

function isGameOver(state: HanabiState): boolean {
  return state.fuses >= MAX_FUSES || state.finalTurnsRemaining === 0;
}

/** The seat whose turn it currently is. */
export function activeSeatId(state: HanabiState): string {
  return state.seatIds[state.turnIndex] as string;
}

/** Whether `actorSeatId` is the seat whose turn it currently is. */
export function isActorsTurn(state: HanabiState, actorSeatId: string): boolean {
  return activeSeatId(state) === actorSeatId;
}

/** Finds `cardId` inside `seatId`'s OWN hand only — never searches other
 * seats' hands. A miss (unknown id, or the card is held by a different seat)
 * returns null; callers turn that into `card_not_in_hand` (T-03-05). */
export function findOwnSlot(
  state: HanabiState,
  seatId: string,
  cardId: string,
): HandSlot | null {
  const hand = state.hands.find((h) => h.seatId === seatId);
  if (hand === undefined) return null;
  const slot = hand.slots.find((s) => s.card.id === cardId);
  return slot ?? null;
}

/** Returns exactly the ids of the slots `clue` touches, in slot order,
 * dispatching into the variant's color/rank predicate — the one place both
 * clue types and the zero-touch check share their touch logic. */
export function cardsTouchedByClue(
  config: VariantConfig,
  slots: readonly HandSlot[],
  clue: Clue,
): string[] {
  const touched: string[] = [];
  for (const slot of slots) {
    const isTouched =
      clue.type === "color"
        ? config.colorClueTouches(slot.card.suit, clue.value)
        : config.rankClueTouches(slot.card.rank, clue.value);
    if (isTouched) touched.push(slot.card.id);
  }
  return touched;
}

export function canPlay(state: HanabiState, actorSeatId: string, cardId: string): Legality {
  if (!isActorsTurn(state, actorSeatId)) return { legal: false, reason: "not_your_turn" };
  if (isGameOver(state)) return { legal: false, reason: "game_over" };
  if (findOwnSlot(state, actorSeatId, cardId) === null) {
    return { legal: false, reason: "card_not_in_hand" };
  }
  return { legal: true };
}

export function canDiscard(state: HanabiState, actorSeatId: string, cardId: string): Legality {
  if (!isActorsTurn(state, actorSeatId)) return { legal: false, reason: "not_your_turn" };
  if (isGameOver(state)) return { legal: false, reason: "game_over" };
  if (findOwnSlot(state, actorSeatId, cardId) === null) {
    return { legal: false, reason: "card_not_in_hand" };
  }
  // RESEARCH.md Pitfall 1: discarding at 8 tokens is ILLEGAL, not a no-op —
  // the bonus-forfeit rule (RULES-13) governs a different action (playing a
  // 5) and must not be conflated with this one.
  if (state.clueTokens >= MAX_CLUE_TOKENS) {
    return { legal: false, reason: "discard_at_max_clues" };
  }
  return { legal: true };
}

export function canClue(
  state: HanabiState,
  actorSeatId: string,
  targetSeatId: string,
  clue: Clue,
): Legality {
  if (!isActorsTurn(state, actorSeatId)) return { legal: false, reason: "not_your_turn" };
  if (isGameOver(state)) return { legal: false, reason: "game_over" };
  if (state.clueTokens <= 0) return { legal: false, reason: "no_clue_tokens" };
  if (targetSeatId === actorSeatId || !state.seatIds.includes(targetSeatId)) {
    return { legal: false, reason: "clue_target_invalid" };
  }
  const targetHand = state.hands.find((h) => h.seatId === targetSeatId);
  if (targetHand === undefined) {
    return { legal: false, reason: "clue_target_invalid" };
  }
  const config = variantConfig(state.variant);
  const touched = cardsTouchedByClue(config, targetHand.slots, clue);
  if (touched.length === 0) return { legal: false, reason: "clue_touches_nothing" };
  return { legal: true };
}
