// D-07 per-seat whitelist projection — the single most load-bearing
// correctness pattern in this phase (see forehead-card.ts:14-19, the
// template this file follows near-verbatim). The spread operator in object
// literals, `delete`, `Object.assign`, any omit helper, and assigning
// null/undefined to a `suit`/`rank` key are all FORBIDDEN in this file.
// Every returned object is built field-by-field from named values so a card
// in the viewer's own hand structurally cannot carry a `suit` or `rank` key
// — not because it was stripped, but because the object literal never
// mentions them.
//
// Three-part structure, matching forehead-card.ts's toPlayerView exactly:
//   1. Compute the public fields ONCE, before any branch — they are
//      identical for every seat (stacks, discard, tokens, deck count, turn,
//      final-round counter, history, score).
//   2. A FAIL-CLOSED branch for a viewer whose seat is not found (unseated,
//      stale token, spectator): every hand — including what would have been
//      the viewer's own — renders hidden, and yourSeatId is null. An
//      unseated viewer must never see more than the least-privileged seat.
//   3. The SEATED branch: the viewer's own slots map to `{ id, hidden: true,
//      facts }` literals (no suit/rank key ever written); every other seat's
//      slots map to `{ id, hidden: false, suit, rank, facts }` literals.

import { currentScore } from "./endgame";
import type {
  ClueFacts,
  ClueFactsView,
  HanabiCardView,
  HanabiState,
  HanabiView,
  HandSlot,
  HistoryEntryView,
} from "./state";
import { withDiscardOrderFallback } from "./state";
import type { HistoryEntry } from "./history";

function toClueFactsView(facts: ClueFacts): ClueFactsView {
  return {
    possibleSuits: Array.from(facts.possibleSuits),
    possibleRanks: Array.from(facts.possibleRanks),
    positiveClues: facts.positiveClues.map((clue) => ({ type: clue.type, value: clue.value })),
    negativeClues: facts.negativeClues.map((clue) => ({ type: clue.type, value: clue.value })),
  };
}

/** Own-hand card view: structurally lacks `suit` and `rank` — the literal
 * below never mentions either key. */
function toOwnCardView(slot: HandSlot): HanabiCardView {
  return { id: slot.card.id, hidden: true, facts: toClueFactsView(slot.facts) };
}

/** Other-seat card view: full identity, per D-07. */
function toOtherCardView(slot: HandSlot): HanabiCardView {
  return {
    id: slot.card.id,
    hidden: false,
    suit: slot.card.suit,
    rank: slot.card.rank,
    facts: toClueFactsView(slot.facts),
  };
}

function toHistoryEntryView(entry: HistoryEntry): HistoryEntryView {
  if (entry.type === "play") {
    return {
      turn: entry.turn,
      type: "play",
      seatId: entry.seatId,
      cardId: entry.cardId,
      suit: entry.suit,
      rank: entry.rank,
      success: entry.success,
    };
  }
  if (entry.type === "discard") {
    return {
      turn: entry.turn,
      type: "discard",
      seatId: entry.seatId,
      cardId: entry.cardId,
      suit: entry.suit,
      rank: entry.rank,
    };
  }
  if (entry.type === "clue") {
    return {
      turn: entry.turn,
      type: "clue",
      seatId: entry.seatId,
      targetSeatId: entry.targetSeatId,
      clue: { type: entry.clue.type, value: entry.clue.value },
      touchedCardIds: Array.from(entry.touchedCardIds),
    };
  }
  return {
    turn: entry.turn,
    type: "draw",
    seatId: entry.seatId,
    cardId: entry.cardId,
  };
}

/** Projects `state` for exactly one seat. Pure: calling this twice for the
 * same (state, seatId) returns deep-equal views and never returns `state`
 * itself or any of its nested arrays by reference. */
export function toHanabiPlayerView(rawState: HanabiState, seatId: string): HanabiView {
  // Tolerate a room persisted before `discardOrder` existed — see
  // `withDiscardOrderFallback`'s doc comment. Must run before the
  // `state.discardOrder` spread below.
  const state = withDiscardOrderFallback(rawState);
  const activeSeatId = state.seatIds[state.turnIndex] as string;
  // Wire field is `playedRanks`: the ranks played on this stack, in the
  // order they were played. Direction-agnostic -- a descending (Black)
  // stack's playedRanks starts at 5 and counts down, an ascending stack's
  // starts at 1 and counts up. Identical for every seat (stacks are public).
  const stacks = state.stacks.map((s) => ({ suit: s.suit, playedRanks: [...s.playedRanks] }));
  const discard = state.discard.map((c) => ({ id: c.id, suit: c.suit, rank: c.rank }));
  // D-28: computed ONCE here and reused verbatim in BOTH return literals
  // below — never recomputed per branch, so every seat's projected view is
  // identical (the whole point of a shared discard arrangement).
  const discardOrder = [...state.discardOrder];
  const history = state.history.map(toHistoryEntryView);
  const score = currentScore(state);

  const ownHand = state.hands.find((h) => h.seatId === seatId);

  if (ownHand === undefined) {
    // Fails closed: an unseated/unknown/stale viewer sees strictly less than
    // any real seat, never more — every hand, including seats that are not
    // the viewer, renders fully hidden.
    const otherHands = state.hands.map((h) => ({
      seatId: h.seatId,
      cards: h.slots.map(toOwnCardView),
    }));
    return {
      variant: state.variant,
      yourSeatId: null,
      yourHand: [],
      otherHands,
      stacks,
      discard,
      discardOrder,
      clueTokens: state.clueTokens,
      fuses: state.fuses,
      deckCount: state.deck.length,
      finalTurnsRemaining: state.finalTurnsRemaining,
      activeSeatId,
      isYourTurn: false,
      score,
      history,
    };
  }

  const yourHand = ownHand.slots.map(toOwnCardView);
  const otherHands = state.hands
    .filter((h) => h.seatId !== seatId)
    .map((h) => ({ seatId: h.seatId, cards: h.slots.map(toOtherCardView) }));

  return {
    variant: state.variant,
    yourSeatId: seatId,
    yourHand,
    otherHands,
    stacks,
    discard,
    discardOrder,
    clueTokens: state.clueTokens,
    fuses: state.fuses,
    deckCount: state.deck.length,
    finalTurnsRemaining: state.finalTurnsRemaining,
    activeSeatId,
    isYourTurn: activeSeatId === seatId,
    score,
    history,
  };
}
