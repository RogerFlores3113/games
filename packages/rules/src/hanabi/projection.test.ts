import { describe, expect, it } from "vitest";
import type { Variant } from "../adapter";
import { hanabiGame } from "./adapter";
import { dealInitialHands } from "./deck";
import { toHanabiPlayerView } from "./projection";
import { variantConfig } from "./variant";
import type { HanabiState } from "./state";

const VARIANTS: Variant[] = ["base", "rainbow", "black"];
const SEAT_IDS = ["seat-a", "seat-b", "seat-c", "seat-d"];
const SEED = "0123456789abcdef0123456789abcdef";

function buildState(variant: Variant): HanabiState {
  const config = variantConfig(variant);
  const { hands, deck } = dealInitialHands({ config, seatIds: SEAT_IDS, seed: SEED });
  return {
    variant,
    seatIds: [...SEAT_IDS],
    turnIndex: 0,
    hands,
    deck,
    stacks: config.suits.map((suit) => ({ suit, topRank: 0 })),
    discard: [],
    clueTokens: 8,
    fuses: 0,
    finalTurnsRemaining: null,
    history: [],
  };
}

describe("toHanabiPlayerView", () => {
  for (const variant of VARIANTS) {
    describe(`variant: ${variant}`, () => {
      it("every own-hand card structurally lacks suit and rank; other hands carry full identity", () => {
        const state = buildState(variant);
        let seatsChecked = 0;
        for (const seatId of state.seatIds) {
          seatsChecked++;
          const view = toHanabiPlayerView(state, seatId);
          let ownCardsChecked = 0;
          for (const card of view.yourHand) {
            ownCardsChecked++;
            expect(card.hidden).toBe(true);
            expect("suit" in card).toBe(false);
            expect("rank" in card).toBe(false);
            expect("id" in card).toBe(true);
            expect("facts" in card).toBe(true);
          }
          expect(ownCardsChecked).toBeGreaterThan(0);

          let otherCardsChecked = 0;
          for (const hand of view.otherHands) {
            for (const card of hand.cards) {
              otherCardsChecked++;
              expect(card.hidden).toBe(false);
              expect("suit" in card).toBe(true);
              expect("rank" in card).toBe(true);
              expect("id" in card).toBe(true);
              expect("facts" in card).toBe(true);
            }
          }
          expect(otherCardsChecked).toBeGreaterThan(0);
        }
        expect(seatsChecked).toBeGreaterThan(0);
        expect(seatsChecked).toBe(state.seatIds.length);
      });

      it("public fields are identical across all seats' views for the same state", () => {
        const state = buildState(variant);
        const views = state.seatIds.map((seatId) => toHanabiPlayerView(state, seatId));
        expect(views.length).toBeGreaterThan(0);
        for (const view of views) {
          expect(view.stacks).toEqual(views[0]!.stacks);
          expect(view.discard).toEqual(views[0]!.discard);
          expect(view.clueTokens).toBe(views[0]!.clueTokens);
          expect(view.fuses).toBe(views[0]!.fuses);
          expect(view.deckCount).toBe(views[0]!.deckCount);
          expect(view.finalTurnsRemaining).toBe(views[0]!.finalTurnsRemaining);
          expect(view.activeSeatId).toBe(views[0]!.activeSeatId);
          expect(view.variant).toBe(views[0]!.variant);
          expect(view.score).toBe(views[0]!.score);
          expect(view.history).toEqual(views[0]!.history);
        }
      });

      it("carries no seed field and no deck contents — deckCount is a number only", () => {
        const state = buildState(variant);
        const view = toHanabiPlayerView(state, state.seatIds[0]!);
        expect(typeof view.deckCount).toBe("number");
        expect("deck" in view).toBe(false);
        expect("seed" in view).toBe(false);
        expect(JSON.stringify(view)).not.toContain(SEED);
      });

      it("isYourTurn is true only for the active seat", () => {
        const state = buildState(variant);
        let activeChecked = 0;
        for (const seatId of state.seatIds) {
          const view = toHanabiPlayerView(state, seatId);
          if (seatId === state.seatIds[state.turnIndex]) {
            expect(view.isYourTurn).toBe(true);
            activeChecked++;
          } else {
            expect(view.isYourTurn).toBe(false);
          }
        }
        expect(activeChecked).toBe(1);
      });

      it("is pure: calling it twice returns deep-equal views and never the state object itself", () => {
        const state = buildState(variant);
        for (const seatId of state.seatIds) {
          const view1 = toHanabiPlayerView(state, seatId);
          const view2 = toHanabiPlayerView(state, seatId);
          expect(view1).toEqual(view2);
          expect(view1).not.toBe(view2);
          expect(view1).not.toBe(state);
        }
      });
    });
  }

  it("an unseated viewer gets yourSeatId null, an empty yourHand, and every hand hidden with no suit/rank", () => {
    const state = buildState("base");
    const view = toHanabiPlayerView(state, "seat-does-not-exist");
    expect(view.yourSeatId).toBeNull();
    expect(view.yourHand).toEqual([]);
    expect(view.isYourTurn).toBe(false);

    let handsChecked = 0;
    let cardsChecked = 0;
    for (const hand of view.otherHands) {
      handsChecked++;
      for (const card of hand.cards) {
        cardsChecked++;
        expect(card.hidden).toBe(true);
        expect("suit" in card).toBe(false);
        expect("rank" in card).toBe(false);
      }
    }
    expect(handsChecked).toBe(state.seatIds.length);
    expect(cardsChecked).toBeGreaterThan(0);
  });

  describe("reorder projection", () => {
    it("a NON-active seat's reversed reorder is reflected in the actor's own view and every other seat's view, in submitted order", () => {
      const state = buildState("base");
      const actorSeatId = state.seatIds[0]!; // active seat (turnIndex 0)
      const reorderSeatId = state.seatIds[1]!; // deliberately NOT the active seat
      expect(reorderSeatId).not.toBe(actorSeatId);

      const reorderHand = state.hands.find((h) => h.seatId === reorderSeatId)!;
      const originalIds = reorderHand.slots.map((s) => s.card.id);
      const reversedIds = [...originalIds].reverse();
      const originalCardsById = new Map(reorderHand.slots.map((s) => [s.card.id, s.card]));

      const result = hanabiGame.applyAction(state, reorderSeatId, {
        type: "reorder",
        cardIds: reversedIds,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // The reordering seat's own view: yourHand lists the reversed ids, all
      // hidden, with structurally no suit/rank key (D-07/D-15 still hold).
      const ownView = toHanabiPlayerView(result.state, reorderSeatId);
      expect(ownView.yourHand.map((c) => c.id)).toEqual(reversedIds);
      for (const card of ownView.yourHand) {
        expect(card.hidden).toBe(true);
        expect("suit" in card).toBe(false);
        expect("rank" in card).toBe(false);
      }

      // Every OTHER seat's view carries the same submitted order, with full
      // identity matching the pre-reorder cards (D-22: order is information,
      // identity is unchanged by a reorder).
      for (const observerSeatId of result.state.seatIds) {
        if (observerSeatId === reorderSeatId) continue;
        const observerView = toHanabiPlayerView(result.state, observerSeatId);
        const reorderedEntry = observerView.otherHands.find((h) => h.seatId === reorderSeatId)!;
        expect(reorderedEntry.cards.map((c) => c.id)).toEqual(reversedIds);
        for (const card of reorderedEntry.cards) {
          expect(card.hidden).toBe(false);
          const originalCard = originalCardsById.get(card.id)!;
          if (!card.hidden) {
            expect(card.suit).toBe(originalCard.suit);
            expect(card.rank).toBe(originalCard.rank);
          }
        }
      }
    });

    it("a slot-preserving discard by the active seat shows the drawn card at the vacated index in every observer's view", () => {
      const state = buildState("base");
      const actorSeatId = state.seatIds[0]!;
      // clueTokens starts at MAX (8) in buildState, so spend one via a clue
      // first to make discard legal.
      const targetSeatId = state.seatIds[1]!;
      const targetCard = state.hands.find((h) => h.seatId === targetSeatId)!.slots[0]!.card;
      const afterClue = hanabiGame.applyAction(state, actorSeatId, {
        type: "clue",
        targetSeatId,
        clue: { type: "rank", value: targetCard.rank },
      });
      expect(afterClue.ok).toBe(true);
      if (!afterClue.ok) return;

      const nextActorSeatId = afterClue.state.seatIds[afterClue.state.turnIndex]!;
      const preDiscardHand = afterClue.state.hands.find((h) => h.seatId === nextActorSeatId)!;
      const discardedCardId = preDiscardHand.slots[0]!.card.id;
      const vacatedIndex = 0;

      const afterDiscard = hanabiGame.applyAction(afterClue.state, nextActorSeatId, {
        type: "discard",
        cardId: discardedCardId,
      });
      expect(afterDiscard.ok).toBe(true);
      if (!afterDiscard.ok) return;

      const drawEntry = afterDiscard.state.history[afterDiscard.state.history.length - 1]!;
      expect(drawEntry.type).toBe("draw");
      if (drawEntry.type !== "draw") return;

      for (const observerSeatId of afterDiscard.state.seatIds) {
        const observerView = toHanabiPlayerView(afterDiscard.state, observerSeatId);
        const cards =
          observerSeatId === nextActorSeatId
            ? observerView.yourHand
            : observerView.otherHands.find((h) => h.seatId === nextActorSeatId)!.cards;
        expect(cards[vacatedIndex]!.id).toBe(drawEntry.cardId);
      }
    });
  });

  it("an unseated viewer never sees more than the least-privileged seated seat", () => {
    const state = buildState("base");
    const unseatedView = toHanabiPlayerView(state, "seat-does-not-exist");
    const seatedView = toHanabiPlayerView(state, state.seatIds[0]!);
    // The unseated view must not expose any identity the seated viewer's own
    // hand (least-privileged real seat) also keeps hidden.
    const seatedOwnCardCount = seatedView.yourHand.length;
    expect(seatedOwnCardCount).toBeGreaterThan(0);
    expect(unseatedView.otherHands.every((h) => h.cards.every((c) => c.hidden === true))).toBe(
      true,
    );
  });
});
