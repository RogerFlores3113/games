// The Hanabi turn engine (RULES-04/05/06/07/12/13, HIDE-05, D-11, D-12). This
// is where the two silent failure modes the roadmap names actually live — a
// token economy that drifts, and (together with endgame.ts) a game that
// never ends — so every branch below is written to be structurally incapable
// of drifting: turn-end bookkeeping (turn index, final-round counter) is one
// shared helper reused by all three action branches, and token/fuse math is
// the only place those counters are touched.
//
// HIDE-05/D-12 whitelist-construction discipline, extended from
// forehead-card.ts:14-19 to STATE construction, not just views: every
// returned `HanabiState` below is built as a named field-by-field literal,
// never object-spread of the input state — a spread could silently carry a
// stale field forward if this type ever grows a member. Every request guard
// uses an
// EXACT own-key count (`keys.length !== N`, never `>=`), so a payload
// carrying an extra key (e.g. `{ type: "play", cardId, resultingScore: 999 }`
// asserting resulting state) is rejected before any field is even read
// (T-03-09). D-11: actions name cards by opaque id, never a hand index —
// `applyHanabiAction` resolves every id through `findOwnSlot` on the ACTOR'S
// OWN hand only, so a client can never assert knowledge of another seat's
// card (T-03-10).

import type { AdapterResult } from "../adapter";
import { appendHistory } from "./history";
import { applyClueToSlotFacts, initialClueFacts } from "./clue-facts";
import { canPlay, canDiscard, canClue, findOwnSlot, MAX_CLUE_TOKENS } from "./legality";
// Imported under a namespace on purpose: the clue-touch resolver must be
// resolved exactly once in this file and reused for both the clue-fact
// update and the history entry, never resolved twice (RESEARCH.md Pitfall 2).
import * as legalityNs from "./legality";
import { variantConfig } from "./variant";
import { ALL_SUITS, RANKS } from "./variant";
import type {
  Clue,
  Hand,
  HandSlot,
  HanabiAction,
  HanabiCard,
  HanabiState,
  HistoryEntry,
  StackEntry,
} from "./state";

/** Accepts ONLY an object whose own keys are exactly "type" and "cardId",
 * with type === "play" and cardId a string. Any extra own key (e.g. a
 * payload asserting `resultingScore`) makes the payload invalid — mirrors
 * forehead-card.ts:87-94's exact-own-key discipline. */
export function isPlayRequest(request: unknown): request is { type: "play"; cardId: string } {
  if (typeof request !== "object" || request === null) return false;
  const keys = Object.keys(request);
  if (keys.length !== 2 || !keys.includes("type") || !keys.includes("cardId")) return false;
  const r = request as { type: unknown; cardId: unknown };
  return r.type === "play" && typeof r.cardId === "string";
}

/** Same exact-own-key discipline as `isPlayRequest`, for discard. */
export function isDiscardRequest(
  request: unknown,
): request is { type: "discard"; cardId: string } {
  if (typeof request !== "object" || request === null) return false;
  const keys = Object.keys(request);
  if (keys.length !== 2 || !keys.includes("type") || !keys.includes("cardId")) return false;
  const r = request as { type: unknown; cardId: unknown };
  return r.type === "discard" && typeof r.cardId === "string";
}

function isClueValueValid(clue: { type: unknown; value: unknown }): clue is Clue {
  if (clue.type === "color") {
    return typeof clue.value === "string" && (ALL_SUITS as readonly string[]).includes(clue.value);
  }
  if (clue.type === "rank") {
    return typeof clue.value === "number" && (RANKS as readonly number[]).includes(clue.value);
  }
  return false;
}

/** Accepts ONLY an object whose own keys are exactly "type", "targetSeatId"
 * and "clue", nesting a SECOND exact-own-key check on the `clue` sub-object
 * (exactly "type" and "value"). Whether the named color/rank is actually
 * cluable in the active variant (e.g. "rainbow" is never nameable) is left
 * to `canClue`'s touch-check downstream — a clue naming a color the active
 * variant does not use touches zero cards and is rejected with
 * `clue_touches_nothing`, so this generic guard only needs to know the value
 * is A suit or A rank, not which variant is active (this guard has no state
 * parameter to consult). */
export function isClueRequest(
  request: unknown,
): request is { type: "clue"; targetSeatId: string; clue: Clue } {
  if (typeof request !== "object" || request === null) return false;
  const keys = Object.keys(request);
  if (
    keys.length !== 3 ||
    !keys.includes("type") ||
    !keys.includes("targetSeatId") ||
    !keys.includes("clue")
  ) {
    return false;
  }
  const r = request as { type: unknown; targetSeatId: unknown; clue: unknown };
  if (r.type !== "clue" || typeof r.targetSeatId !== "string") return false;
  if (typeof r.clue !== "object" || r.clue === null) return false;
  const clueKeys = Object.keys(r.clue);
  if (clueKeys.length !== 2 || !clueKeys.includes("type") || !clueKeys.includes("value")) {
    return false;
  }
  const c = r.clue as { type: unknown; value: unknown };
  return isClueValueValid(c);
}

/** Dispatches across the three request guards; `null` for every payload none
 * of them accept. */
export function parseHanabiRequest(request: unknown): HanabiAction | null {
  if (isPlayRequest(request)) return request;
  if (isDiscardRequest(request)) return request;
  if (isClueRequest(request)) return request;
  return null;
}

/** Shared turn-end bookkeeping (D-14), used identically by all three action
 * branches so they cannot drift apart: the turn index always advances by
 * one seat, and the final-round counter is either decremented (a final
 * round is already running) or set to `seatIds.length` the instant `deck`
 * becomes empty — never inferred from deck length at a later render. */
function advanceTurn(
  state: HanabiState,
  deck: readonly HanabiCard[],
): { turnIndex: number; finalTurnsRemaining: number | null } {
  const turnIndex = (state.turnIndex + 1) % state.seatIds.length;
  const finalTurnsRemaining =
    state.finalTurnsRemaining !== null
      ? state.finalTurnsRemaining - 1
      : deck.length === 0
        ? state.seatIds.length
        : null;
  return { turnIndex, finalTurnsRemaining };
}

/** Draws one card for `seatId` from `deck`'s next slot, appended to the end
 * of their hand with all-possibilities initial clue facts (D-05), UNLESS the
 * final round has already started or the deck is empty (RULES-16). Returns
 * the drawn card's id (for the history entry) or `null` when no draw
 * occurred. */
function drawCard(input: {
  config: ReturnType<typeof variantConfig>;
  seatId: string;
  hands: readonly Hand[];
  deck: readonly HanabiCard[];
  finalTurnsRemainingBeforeThisTurn: number | null;
}): { hands: Hand[]; deck: readonly HanabiCard[]; drawnCardId: string | null } {
  const { config, seatId, hands, deck, finalTurnsRemainingBeforeThisTurn } = input;
  if (finalTurnsRemainingBeforeThisTurn !== null || deck.length === 0) {
    return { hands: hands.map((h) => h), deck, drawnCardId: null };
  }
  const drawnCard = deck[0]!;
  const nextDeck = deck.slice(1);
  const nextHands = hands.map((hand) => {
    if (hand.seatId !== seatId) return hand;
    const newSlot: HandSlot = { card: drawnCard, facts: initialClueFacts(config) };
    return { seatId: hand.seatId, slots: [...hand.slots, newSlot] };
  });
  return { hands: nextHands, deck: nextDeck, drawnCardId: drawnCard.id };
}

function removeFromHand(
  hands: readonly Hand[],
  actorSeatId: string,
  cardId: string,
): Hand[] {
  return hands.map((hand) => {
    if (hand.seatId !== actorSeatId) return hand;
    return { seatId: hand.seatId, slots: hand.slots.filter((s) => s.card.id !== cardId) };
  });
}

function applyPlay(
  state: HanabiState,
  actorSeatId: string,
  cardId: string,
): AdapterResult<HanabiState> {
  const legality = canPlay(state, actorSeatId, cardId);
  if (!legality.legal) return { ok: false, error: legality.reason };

  const config = variantConfig(state.variant);
  const slot = findOwnSlot(state, actorSeatId, cardId)!;
  const card = slot.card;
  const stackIndex = state.stacks.findIndex((s) => s.suit === card.suit);
  const stack = state.stacks[stackIndex]!;
  const success = card.rank === stack.topRank + 1;

  const handsAfterRemoval = removeFromHand(state.hands, actorSeatId, cardId);

  let stacks: readonly StackEntry[] = state.stacks;
  let discard: readonly HanabiCard[] = state.discard;
  let fuses = state.fuses;
  let clueTokens = state.clueTokens;

  if (success) {
    stacks = state.stacks.map((s, i) =>
      i === stackIndex ? { suit: s.suit, topRank: card.rank } : s,
    );
    // RULES-13: completing a stack with a 5 refunds a token, UNLESS clue
    // tokens are already at the cap — the bonus is forfeit, never pushing
    // the count above MAX_CLUE_TOKENS.
    if (card.rank === 5 && clueTokens < MAX_CLUE_TOKENS) {
      clueTokens = clueTokens + 1;
    }
  } else {
    // RULES-12: a misplay costs a fuse and sends the card to the discard pile.
    fuses = state.fuses + 1;
    discard = [...state.discard, card];
  }

  const drawResult = drawCard({
    config,
    seatId: actorSeatId,
    hands: handsAfterRemoval,
    deck: state.deck,
    finalTurnsRemainingBeforeThisTurn: state.finalTurnsRemaining,
  });
  const { turnIndex, finalTurnsRemaining } = advanceTurn(state, drawResult.deck);

  const playEntry: HistoryEntry = {
    turn: state.history.length + 1,
    type: "play",
    seatId: actorSeatId,
    cardId: card.id,
    suit: card.suit,
    rank: card.rank,
    success,
  };
  let history = appendHistory(state.history, playEntry);
  if (drawResult.drawnCardId !== null) {
    history = appendHistory(history, {
      turn: history.length + 1,
      type: "draw",
      seatId: actorSeatId,
      cardId: drawResult.drawnCardId,
    });
  }

  return {
    ok: true,
    state: {
      variant: state.variant,
      seatIds: state.seatIds,
      turnIndex,
      hands: drawResult.hands,
      deck: drawResult.deck,
      stacks,
      discard,
      clueTokens,
      fuses,
      finalTurnsRemaining,
      history,
    },
  };
}

function applyDiscard(
  state: HanabiState,
  actorSeatId: string,
  cardId: string,
): AdapterResult<HanabiState> {
  const legality = canDiscard(state, actorSeatId, cardId);
  if (!legality.legal) return { ok: false, error: legality.reason };

  const config = variantConfig(state.variant);
  const slot = findOwnSlot(state, actorSeatId, cardId)!;
  const card = slot.card;

  const handsAfterRemoval = removeFromHand(state.hands, actorSeatId, cardId);
  const discard = [...state.discard, card];
  const clueTokens = Math.min(state.clueTokens + 1, MAX_CLUE_TOKENS);

  const drawResult = drawCard({
    config,
    seatId: actorSeatId,
    hands: handsAfterRemoval,
    deck: state.deck,
    finalTurnsRemainingBeforeThisTurn: state.finalTurnsRemaining,
  });
  const { turnIndex, finalTurnsRemaining } = advanceTurn(state, drawResult.deck);

  const discardEntry: HistoryEntry = {
    turn: state.history.length + 1,
    type: "discard",
    seatId: actorSeatId,
    cardId: card.id,
    suit: card.suit,
    rank: card.rank,
  };
  let history = appendHistory(state.history, discardEntry);
  if (drawResult.drawnCardId !== null) {
    history = appendHistory(history, {
      turn: history.length + 1,
      type: "draw",
      seatId: actorSeatId,
      cardId: drawResult.drawnCardId,
    });
  }

  return {
    ok: true,
    state: {
      variant: state.variant,
      seatIds: state.seatIds,
      turnIndex,
      hands: drawResult.hands,
      deck: drawResult.deck,
      stacks: state.stacks,
      discard,
      clueTokens,
      fuses: state.fuses,
      finalTurnsRemaining,
      history,
    },
  };
}

function applyClue(
  state: HanabiState,
  actorSeatId: string,
  targetSeatId: string,
  clue: Clue,
): AdapterResult<HanabiState> {
  const legality = canClue(state, actorSeatId, targetSeatId, clue);
  if (!legality.legal) return { ok: false, error: legality.reason };

  const config = variantConfig(state.variant);
  const targetHand = state.hands.find((h) => h.seatId === targetSeatId)!;
  // Resolved ONCE, reused for both the clue-fact update below and the
  // history entry (RESEARCH.md Pitfall 2) — never resolve touch twice.
  const touchedIds = legalityNs.cardsTouchedByClue(config, targetHand.slots, clue);

  const hands = state.hands.map((hand) => {
    if (hand.seatId !== targetSeatId) return hand;
    const slots = hand.slots.map((slot) => ({
      card: slot.card,
      facts: applyClueToSlotFacts(config, slot.facts, clue, touchedIds.includes(slot.card.id)),
    }));
    return { seatId: hand.seatId, slots };
  });

  const clueTokens = state.clueTokens - 1;
  // A clue never draws a card, so the deck it advances the turn against is
  // unchanged.
  const { turnIndex, finalTurnsRemaining } = advanceTurn(state, state.deck);

  const clueEntry: HistoryEntry = {
    turn: state.history.length + 1,
    type: "clue",
    seatId: actorSeatId,
    targetSeatId,
    clue,
    touchedCardIds: touchedIds,
  };
  const history = appendHistory(state.history, clueEntry);

  return {
    ok: true,
    state: {
      variant: state.variant,
      seatIds: state.seatIds,
      turnIndex,
      hands,
      deck: state.deck,
      stacks: state.stacks,
      discard: state.discard,
      clueTokens,
      fuses: state.fuses,
      finalTurnsRemaining,
      history,
    },
  };
}

/** Parses `request` first (any payload no guard accepts is rejected with
 * `invalid_action`, never thrown), then dispatches to the matching branch.
 * Every legality refusal comes from `legality.ts`'s exported predicates —
 * this function never re-derives a check locally. */
export function applyHanabiAction(
  state: HanabiState,
  actorSeatId: string,
  request: unknown,
): AdapterResult<HanabiState> {
  const action = parseHanabiRequest(request);
  if (action === null) return { ok: false, error: "invalid_action" };

  if (action.type === "play") return applyPlay(state, actorSeatId, action.cardId);
  if (action.type === "discard") return applyDiscard(state, actorSeatId, action.cardId);
  return applyClue(state, actorSeatId, action.targetSeatId, action.clue);
}
