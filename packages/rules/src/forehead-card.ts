// D-01 toy secret-holding game: "forehead card." Each seat holds one hidden
// card that every OTHER seat can see and its owner cannot — the same
// visibility shape Hanabi needs (visible-to-others-not-self), plus a
// hidden-from-all deck and a public-after-reveal pile. This file exists to
// give the redaction chokepoint something real to hide; it is deleted in
// Phase 4 once the real Hanabi engine lands (D-02/D-03).
//
// Values are unique per card instance on purpose (D-12): a seat's own value,
// and every undealt value, can then never legitimately appear anywhere in
// that seat's payload for an unrelated reason, so a raw-string leak scan is
// unambiguous — it cannot pass or fail by coincidence with some other
// legitimately-present number or string.
//
// D-05 whitelist-construction rule, enforced throughout this file: the
// spread operator in object literals, `delete`, `Object.assign`, any omit
// helper, and assigning null/undefined to a value key are all FORBIDDEN in
// `toPlayerView`. Every returned object is built field-by-field from named
// values so a hidden card structurally cannot carry a `value` key — not
// because it was stripped, but because the object literal never mentions it.

import type { GameAdapter } from "./adapter";
import { mintCardId, seedToRngState, shuffleWithSeed, type RngState } from "./shuffle";

export const FOREHEAD_CARD_VALUES = [
  "Altair",
  "Sirius",
  "Antares",
  "Pollux",
  "Castor",
  "Capella",
  "Arcturus",
  "Procyon",
  "Regulus",
  "Bellatrix",
  "Aldebaran",
  "Betelgeuse",
  "Achernar",
  "Canopus",
  "Fomalhaut",
  "Mimosa",
] as const;

export type ForeheadCardValue = (typeof FOREHEAD_CARD_VALUES)[number];

export type ForeheadCard = { readonly id: string; readonly value: ForeheadCardValue };

export type RevealedCard = {
  readonly id: string;
  readonly seatId: string;
  readonly value: ForeheadCardValue;
  readonly correct: boolean;
};

export type ForeheadCardState = {
  readonly seatIds: readonly string[];
  readonly turnIndex: number;
  readonly hands: readonly { readonly seatId: string; readonly card: ForeheadCard }[];
  readonly deck: readonly ForeheadCardValue[];
  readonly revealed: readonly RevealedCard[];
  readonly score: number;
  readonly idRng: RngState;
};

export type ForeheadCardAction = { type: "guess"; value: ForeheadCardValue };

export type HiddenCardView = { id: string; hidden: true };
export type VisibleCardView = { id: string; hidden: false; value: ForeheadCardValue };

// View types use plain mutable Array and non-readonly fields on purpose, so
// ForeheadCardView stays assignable to Plan 02's z.infer type.
export type ForeheadCardView = {
  yourCard: HiddenCardView;
  otherCards: Array<{ seatId: string; card: HiddenCardView | VisibleCardView }>;
  revealed: Array<{ id: string; seatId: string; value: ForeheadCardValue; correct: boolean }>;
  deckCount: number;
  activeSeatId: string;
  isYourTurn: boolean;
  score: number;
};

const VALUE_SET: ReadonlySet<string> = new Set(FOREHEAD_CARD_VALUES);

/** Accepts ONLY an object whose own keys are exactly "type" and "value",
 * with type === "guess" and value a member of FOREHEAD_CARD_VALUES. Any
 * extra own key makes the payload invalid — mirrors counter-game.ts's
 * isIncrementRequest exact-key-count guard. */
function isGuessRequest(request: unknown): request is ForeheadCardAction {
  if (typeof request !== "object" || request === null) return false;
  const keys = Object.keys(request);
  if (keys.length !== 2 || !keys.includes("type") || !keys.includes("value")) return false;
  const r = request as { type: unknown; value: unknown };
  if (r.type !== "guess") return false;
  return typeof r.value === "string" && VALUE_SET.has(r.value);
}

function allIdsInUse(state: ForeheadCardState): Set<string> {
  const ids = new Set<string>();
  for (const hand of state.hands) ids.add(hand.card.id);
  for (const entry of state.revealed) ids.add(entry.id);
  return ids;
}

export const foreheadCardGame: GameAdapter<ForeheadCardState, ForeheadCardAction> = {
  id: "forehead-card",

  createInitialState({ seatIds, seed }) {
    const deck = shuffleWithSeed(FOREHEAD_CARD_VALUES, seed, "deck");
    let idRng = seedToRngState(seed, "card-ids");
    const takenIds = new Set<string>();
    const hands: { seatId: string; card: ForeheadCard }[] = [];
    for (let i = 0; i < seatIds.length; i++) {
      const minted = mintCardId(idRng, takenIds);
      idRng = minted.rng;
      takenIds.add(minted.id);
      hands.push({ seatId: seatIds[i]!, card: { id: minted.id, value: deck[i]! } });
    }
    return {
      seatIds: [...seatIds],
      turnIndex: 0,
      hands,
      deck: deck.slice(seatIds.length),
      revealed: [],
      score: 0,
      idRng,
    };
  },

  applyAction(state, actorSeatId, request) {
    if (!isGuessRequest(request)) {
      return { ok: false, error: "invalid_action" };
    }
    if (actorSeatId !== state.seatIds[state.turnIndex]) {
      return { ok: false, error: "not_your_turn" };
    }
    if (state.deck.length === 0) {
      return { ok: false, error: "game_over" };
    }

    const ownHandIndex = state.hands.findIndex((h) => h.seatId === actorSeatId);
    const ownHand = state.hands[ownHandIndex]!;
    const correct = ownHand.card.value === request.value;

    const revealedEntry: RevealedCard = {
      id: ownHand.card.id,
      seatId: actorSeatId,
      value: ownHand.card.value,
      correct,
    };

    const minted = mintCardId(state.idRng, allIdsInUse(state));
    const newCard: ForeheadCard = { id: minted.id, value: state.deck[0]! };

    const hands = state.hands.map((h, i) => (i === ownHandIndex ? { seatId: h.seatId, card: newCard } : h));

    return {
      ok: true,
      state: {
        seatIds: state.seatIds,
        turnIndex: (state.turnIndex + 1) % state.seatIds.length,
        hands,
        deck: state.deck.slice(1),
        revealed: [...state.revealed, revealedEntry],
        score: state.score + (correct ? 1 : 0),
        idRng: minted.rng,
      },
    };
  },

  toPlayerView(state, seatId): ForeheadCardView {
    const activeSeatId = state.seatIds[state.turnIndex] as string;
    const revealed = state.revealed.map((entry) => ({
      id: entry.id,
      seatId: entry.seatId,
      value: entry.value,
      correct: entry.correct,
    }));
    const ownHand = state.hands.find((h) => h.seatId === seatId);

    if (ownHand === undefined) {
      // Fails closed: an unknown/unseated viewer sees less, never more — every
      // hand (including seats that are not the viewer) renders hidden.
      const otherCards = state.hands.map((h) => ({
        seatId: h.seatId,
        card: { id: h.card.id, hidden: true as const },
      }));
      return {
        yourCard: { id: "unseated", hidden: true },
        otherCards,
        revealed,
        deckCount: state.deck.length,
        activeSeatId,
        isYourTurn: false,
        score: state.score,
      };
    }

    const otherCards = state.hands
      .filter((h) => h.seatId !== seatId)
      .map((h) => ({
        seatId: h.seatId,
        card: { id: h.card.id, hidden: false as const, value: h.card.value },
      }));

    return {
      yourCard: { id: ownHand.card.id, hidden: true },
      otherCards,
      revealed,
      deckCount: state.deck.length,
      activeSeatId,
      isYourTurn: activeSeatId === seatId,
      score: state.score,
    };
  },

  checkGameEnd(state) {
    if (state.deck.length === 0) {
      return { score: state.score, reason: "deck_exhausted" };
    }
    return null;
  },
};
