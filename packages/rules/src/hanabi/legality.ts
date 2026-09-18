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

/** D-17: reorder is legal anytime, including off-turn — deliberately NO
 * `isActorsTurn` check. It spends no resource and changes no scored state,
 * so a client may permute its own hand order whenever it likes. Validates
 * `cardIds` is an EXACT permutation of the actor's current hand ids: same
 * length, no duplicates, every id present in the current hand. A partial
 * list, a duplicate id, or an id belonging to another seat is rejected —
 * this is the boundary that keeps a client from asserting a hand shape the
 * server never dealt (D-22). */
export function canReorder(
  state: HanabiState,
  actorSeatId: string,
  cardIds: readonly string[],
): Legality {
  if (isGameOver(state)) return { legal: false, reason: "game_over" };
  const hand = state.hands.find((h) => h.seatId === actorSeatId);
  if (hand === undefined) return { legal: false, reason: "card_not_in_hand" };
  const currentIds = hand.slots.map((s) => s.card.id);
  if (cardIds.length !== currentIds.length) {
    return { legal: false, reason: "card_not_in_hand" };
  }
  const currentSet = new Set(currentIds);
  const suppliedSet = new Set(cardIds);
  if (currentSet.size !== suppliedSet.size) {
    // Duplicate id supplied (length matched, but the set collapsed).
    return { legal: false, reason: "card_not_in_hand" };
  }
  for (const id of cardIds) {
    if (!currentSet.has(id)) return { legal: false, reason: "card_not_in_hand" };
  }
  return { legal: true };
}

/** D-24/D-25/D-26: any seated player may reorder the shared discard pile at
 * any time, off-turn included — deliberately NO `isActorsTurn` check and NO
 * per-seat hand lookup at all, since the discard pile belongs to no single
 * seat. Validates `cardIds` is an EXACT permutation of `state.discard`'s
 * current ids: same length, no duplicates, every id present in the current
 * pile. `card_not_in_hand` is the reused literal for a discard-set mismatch
 * (the wire's `AdapterError` enum is closed and deliberately not widened for
 * this reversible, shared-workspace action — see actions.ts's
 * applyReorderDiscard doc and RESEARCH.md). An actor not seated in the game
 * at all is rejected with `invalid_action`, since there is no hand to fall
 * back on the way `canReorder` falls back to `card_not_in_hand`. */
export function canReorderDiscard(
  state: HanabiState,
  actorSeatId: string,
  cardIds: readonly string[],
): Legality {
  if (isGameOver(state)) return { legal: false, reason: "game_over" };
  if (!state.seatIds.includes(actorSeatId)) {
    return { legal: false, reason: "invalid_action" };
  }
  const currentIds = state.discard.map((c) => c.id);
  if (cardIds.length !== currentIds.length) {
    return { legal: false, reason: "card_not_in_hand" };
  }
  const currentSet = new Set(currentIds);
  const suppliedSet = new Set(cardIds);
  if (currentSet.size !== suppliedSet.size) {
    // Duplicate id supplied (length matched, but the set collapsed).
    return { legal: false, reason: "card_not_in_hand" };
  }
  for (const id of cardIds) {
    if (!currentSet.has(id)) return { legal: false, reason: "card_not_in_hand" };
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
  // RULES-14/D-01/T-07-01: a colour clue naming a colour the active variant
  // does not name (e.g. "rainbow" in Rainbow, or "rainbow"/"black" in base)
  // is illegal, even though the touch predicate would otherwise accept it —
  // this closes a forged-frame cheating hole where a hand-crafted WebSocket
  // message could name "rainbow" as a colour. Checked before the touch
  // check, and reads only `config.cluableColors` — never a literal suit.
  if (clue.type === "color" && !config.cluableColors.includes(clue.value)) {
    return { legal: false, reason: "clue_color_not_nameable" };
  }
  const touched = cardsTouchedByClue(config, targetHand.slots, clue);
  if (touched.length === 0) return { legal: false, reason: "clue_touches_nothing" };
  return { legal: true };
}
