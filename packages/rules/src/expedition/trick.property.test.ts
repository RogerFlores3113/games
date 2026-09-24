// fast-check proof of follow-suit and trick-winner across deck sizes
// (XRULE-02/03, T-09-04, T-09-05). Card selection for playing a trick
// always goes through legalPlaysFor — there is no second, hand-written
// follow-suit implementation in this file. Seeds via
// fc.stringMatching(/^[0-9a-f]{32}$/), numRuns: 200 (repo convention, see
// hanabi/conservation.property.test.ts).

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { baseDeckFor, dealHands } from "./deck";
import { legalPlaysFor, trickWinner } from "./trick";
import type { CardIdentity, ExpeditionCard, Hand, TrickPlay } from "./state";

function seatIdsFor(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `seat-${i}`);
}

function buildHands(playerCount: 3 | 4 | 5, seed: string): { hands: Hand[] } {
  const seatIds = seatIdsFor(playerCount);
  const deck = baseDeckFor(playerCount);
  return dealHands({ seatIds, seed, deck });
}

describe("property: legalPlaysFor follow-suit", () => {
  it("legal output is always a non-empty subset of the hand, and honors follow-suit / void / joker rules", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(3, 4, 5),
        fc.stringMatching(/^[0-9a-f]{32}$/),
        fc.nat(),
        fc.nat(),
        (playerCount, seed, leaderIndex, responderIndex) => {
          const { hands } = buildHands(playerCount as 3 | 4 | 5, seed);
          const leaderHand = hands[leaderIndex % hands.length]!;
          const responderHand = hands[responderIndex % hands.length]!;
          const led = leaderHand.cards[leaderIndex % leaderHand.cards.length]!.identity;

          const legal = legalPlaysFor(responderHand.cards, led);

          // Non-empty subset of the hand.
          expect(legal.length).toBeGreaterThan(0);
          for (const c of legal) {
            expect(responderHand.cards).toContainEqual(c);
          }

          if (led.kind === "standard") {
            const sameSuit = responderHand.cards.filter(
              (c) => c.identity.kind === "standard" && c.identity.suit === led.suit,
            );
            if (sameSuit.length > 0) {
              // Every legal card has the led suit, and every same-suit card is legal.
              for (const c of legal) {
                expect(c.identity.kind === "standard" && c.identity.suit === led.suit).toBe(true);
              }
              for (const c of sameSuit) {
                expect(legal).toContainEqual(c);
              }
            } else {
              // Void: legal equals hand.
              expect(legal).toEqual(responderHand.cards);
            }
          } else {
            const otherJoker = led.joker === "sun" ? "moon" : "sun";
            const holds = responderHand.cards.find(
              (c) => c.identity.kind === "joker" && c.identity.joker === otherJoker,
            );
            if (holds) {
              expect(legal).toEqual([holds]);
            } else {
              expect(legal).toEqual(responderHand.cards);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("forced joker lead (both directions exercised on every run): the leader always leads Sun or Moon", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(3, 4, 5),
        fc.stringMatching(/^[0-9a-f]{32}$/),
        fc.nat(),
        (playerCount, seed, responderIndex) => {
          const { hands } = buildHands(playerCount as 3 | 4 | 5, seed);

          // Find a hand holding the Sun and a hand holding the Moon; lead
          // each in turn so both directions run every property iteration.
          const sunHolder = hands.find((h) =>
            h.cards.some((c) => c.identity.kind === "joker" && c.identity.joker === "sun"),
          )!;
          const moonHolder = hands.find((h) =>
            h.cards.some((c) => c.identity.kind === "joker" && c.identity.joker === "moon"),
          )!;

          for (const [holder, jokerName] of [
            [sunHolder, "sun"],
            [moonHolder, "moon"],
          ] as const) {
            const led: CardIdentity = { kind: "joker", joker: jokerName };
            const responderHand = hands[responderIndex % hands.length]!;
            const legal = legalPlaysFor(responderHand.cards, led);
            const otherJoker = jokerName === "sun" ? "moon" : "sun";
            const holdsOther = responderHand.cards.find(
              (c) => c.identity.kind === "joker" && c.identity.joker === otherJoker,
            );
            if (holdsOther) {
              expect(legal).toEqual([holdsOther]);
            } else {
              expect(legal).toEqual(responderHand.cards);
            }
            // Sanity: the lead itself is a member of the holder's hand.
            expect(holder.cards.some((c) => c.identity.kind === "joker" && c.identity.joker === jokerName)).toBe(
              true,
            );
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("property: trickWinner", () => {
  it("winner matches the spec rule (Sun > Moon > highest led-suit standard) and is always a trick participant", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(3, 4, 5),
        fc.stringMatching(/^[0-9a-f]{32}$/),
        (playerCount, seed) => {
          const { hands } = buildHands(playerCount as 3 | 4 | 5, seed);

          // Build a trick: each seat plays a card chosen from
          // legalPlaysFor, in seat order, using a shrinking working hand.
          const workingHands: Map<string, ExpeditionCard[]> = new Map(
            hands.map((h) => [h.seatId, [...h.cards]]),
          );
          const plays: TrickPlay[] = [];
          let led: CardIdentity | null = null;

          for (const hand of hands) {
            const remaining = workingHands.get(hand.seatId)!;
            const legal = legalPlaysFor(remaining, led);
            const chosen = legal[0]!;
            plays.push({ seatId: hand.seatId, card: chosen });
            if (led === null) led = chosen.identity;
            workingHands.set(
              hand.seatId,
              remaining.filter((c) => c.id !== chosen.id),
            );
          }

          const winnerSeatId = trickWinner(plays);

          // The winner is always one of the trick's seats.
          expect(plays.some((p) => p.seatId === winnerSeatId)).toBe(true);

          const sunPlay = plays.find((p) => p.card.identity.kind === "joker" && p.card.identity.joker === "sun");
          const moonPlay = plays.find((p) => p.card.identity.kind === "joker" && p.card.identity.joker === "moon");

          if (sunPlay) {
            expect(winnerSeatId).toBe(sunPlay.seatId);
          } else if (moonPlay) {
            expect(winnerSeatId).toBe(moonPlay.seatId);
          } else {
            const ledIdentity = plays[0]!.card.identity;
            expect(ledIdentity.kind).toBe("standard");
            const ledSuit = ledIdentity.kind === "standard" ? ledIdentity.suit : null;
            const sameSuitPlays = plays.filter(
              (p) => p.card.identity.kind === "standard" && p.card.identity.suit === ledSuit,
            );
            const maxRank = Math.max(
              ...sameSuitPlays.map((p) => (p.card.identity.kind === "standard" ? p.card.identity.rank : -1)),
            );
            const expectedWinner = sameSuitPlays.find(
              (p) => p.card.identity.kind === "standard" && p.card.identity.rank === maxRank,
            )!;
            expect(winnerSeatId).toBe(expectedWinner.seatId);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
