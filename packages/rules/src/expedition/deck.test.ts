import { describe, expect, it } from "vitest";
import {
  RANK_ACE,
  STANDARD_RANKS,
  SUITS,
  assertPlayerCount,
  baseDeckFor,
  buildFullDeck,
  buildObjectiveDeck,
  cardLabel,
  complementOf,
  dealHands,
  identitiesEqual,
  removedCardsFor,
} from "./deck";
import type { CardIdentity, PlayerCount, StandardIdentity } from "./state";

function isStandard(identity: CardIdentity): identity is StandardIdentity {
  return identity.kind === "standard";
}

describe("buildFullDeck", () => {
  it("has length 54 with no two entries identitiesEqual", () => {
    const deck = buildFullDeck();
    expect(deck.length).toBe(54);
    for (let i = 0; i < deck.length; i++) {
      for (let j = i + 1; j < deck.length; j++) {
        expect(identitiesEqual(deck[i]!, deck[j]!)).toBe(false);
      }
    }
  });

  it("has exactly 1 Sun and 1 Moon", () => {
    const deck = buildFullDeck();
    const suns = deck.filter((c) => c.kind === "joker" && c.joker === "sun");
    const moons = deck.filter((c) => c.kind === "joker" && c.joker === "moon");
    expect(suns.length).toBe(1);
    expect(moons.length).toBe(1);
  });

  it("has 13 cards per suit with ranks 2..14", () => {
    const deck = buildFullDeck();
    for (const suit of SUITS) {
      const bySuit = deck.filter((c) => isStandard(c) && c.suit === suit) as StandardIdentity[];
      expect(bySuit.length).toBe(13);
      const ranks = bySuit.map((c) => c.rank).sort((a, b) => a - b);
      expect(ranks).toEqual([...STANDARD_RANKS].sort((a, b) => a - b));
    }
  });
});

describe("removedCardsFor", () => {
  it("is [] for 3 players", () => {
    expect(removedCardsFor(3)).toEqual([]);
  });

  it("is exactly {2 clubs, 2 diamonds} for 4 players", () => {
    const removed = removedCardsFor(4);
    expect(removed.length).toBe(2);
    expect(removed).toContainEqual({ kind: "standard", suit: "clubs", rank: 2 });
    expect(removed).toContainEqual({ kind: "standard", suit: "diamonds", rank: 2 });
  });

  it("is exactly the four 2s for 5 players", () => {
    const removed = removedCardsFor(5);
    expect(removed.length).toBe(4);
    for (const suit of SUITS) {
      expect(removed).toContainEqual({ kind: "standard", suit, rank: 2 });
    }
  });
});

describe("baseDeckFor / complementOf", () => {
  it("baseDeckFor lengths are 54 / 52 / 50 for 3/4/5 players", () => {
    expect(baseDeckFor(3).length).toBe(54);
    expect(baseDeckFor(4).length).toBe(52);
    expect(baseDeckFor(5).length).toBe(50);
  });

  it("complementOf(baseDeckFor(n)) equals removedCardsFor(n) as a set", () => {
    for (const n of [3, 4, 5] as const) {
      const complement = complementOf(baseDeckFor(n));
      const removed = removedCardsFor(n);
      expect(complement.length).toBe(removed.length);
      for (const identity of removed) {
        expect(complement.some((c) => identitiesEqual(c, identity))).toBe(true);
      }
    }
  });
});

describe("dealHands", () => {
  const SEAT_COUNTS: readonly PlayerCount[] = [3, 4, 5];
  const EXPECTED_HAND_SIZE: Record<PlayerCount, number> = { 3: 18, 4: 13, 5: 10 };

  it("gives hand sizes 18/13/10 for 3/4/5 players, every hand the same size", () => {
    for (const n of SEAT_COUNTS) {
      const seatIds = Array.from({ length: n }, (_, i) => `seat-${i}`);
      const { hands, handSize } = dealHands({ seatIds, seed: "seed-a", deck: baseDeckFor(n) });
      expect(handSize).toBe(EXPECTED_HAND_SIZE[n]);
      for (const hand of hands) {
        expect(hand.cards.length).toBe(EXPECTED_HAND_SIZE[n]);
      }
    }
  });

  it("every dealt card id is unique and 8 lowercase letters", () => {
    const seatIds = ["a", "b", "c", "d"];
    const { hands } = dealHands({ seatIds, seed: "seed-b", deck: baseDeckFor(4) });
    const allIds: string[] = [];
    for (const hand of hands) for (const card of hand.cards) allIds.push(card.id);
    expect(allIds.length).toBe(52);
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const id of allIds) {
      expect(id).toMatch(/^[a-z]{8}$/);
    }
  });

  it("union of dealt identities equals the input deck as a multiset", () => {
    const seatIds = ["a", "b", "c"];
    const deck = baseDeckFor(3);
    const { hands } = dealHands({ seatIds, seed: "seed-c", deck });
    const dealtIdentities = hands.flatMap((h) => h.cards.map((c) => c.identity));
    expect(dealtIdentities.length).toBe(deck.length);
    for (const identity of deck) {
      const inDeckCount = deck.filter((c) => identitiesEqual(c, identity)).length;
      const dealtCount = dealtIdentities.filter((c) => identitiesEqual(c, identity)).length;
      expect(dealtCount).toBe(inDeckCount);
    }
  });

  it("is deterministic: same (seatIds, seed, deck) gives deep-equal output", () => {
    const seatIds = ["a", "b", "c"];
    const deck = baseDeckFor(3);
    const first = dealHands({ seatIds, seed: "same-seed", deck });
    const second = dealHands({ seatIds, seed: "same-seed", deck });
    expect(first).toEqual(second);
  });

  it("two different seeds give different hands", () => {
    const seatIds = ["a", "b", "c"];
    const deck = baseDeckFor(3);
    const first = dealHands({ seatIds, seed: "seed-one", deck });
    const second = dealHands({ seatIds, seed: "seed-two", deck });
    expect(first).not.toEqual(second);
  });

  it("throws for 2 or 6 seats", () => {
    expect(() => dealHands({ seatIds: ["a", "b"], seed: "s", deck: buildFullDeck() })).toThrow();
    expect(() =>
      dealHands({
        seatIds: ["a", "b", "c", "d", "e", "f"],
        seed: "s",
        deck: buildFullDeck(),
      }),
    ).toThrow();
  });

  it("throws for a deck whose length is not divisible by the seat count", () => {
    const seatIds = ["a", "b", "c"];
    const deck = baseDeckFor(3).slice(0, 53); // 53 not divisible by 3
    expect(() => dealHands({ seatIds, seed: "s", deck })).toThrow();
  });
});

describe("buildObjectiveDeck", () => {
  it("contains exactly the standard identities of deck, no Sun/Moon", () => {
    const deck = baseDeckFor(3);
    const objectiveDeck = buildObjectiveDeck({ deck, seed: "seed-a" });
    const expectedStandard = deck.filter(isStandard);
    expect(objectiveDeck.length).toBe(expectedStandard.length);
    for (const identity of expectedStandard) {
      expect(objectiveDeck.some((c) => identitiesEqual(c, identity))).toBe(true);
    }
    expect(objectiveDeck.every((c) => c.kind === "standard")).toBe(true);
  });

  it("order differs from the play-deck shuffle order for the same seed (separate stream)", () => {
    const deck = baseDeckFor(3);
    const objectiveDeck = buildObjectiveDeck({ deck, seed: "shared-seed" });
    const { hands } = dealHands({ seatIds: ["a", "b", "c"], seed: "shared-seed", deck });
    const playOrderIdentities = hands.flatMap((h) => h.cards.map((c) => c.identity)).filter(isStandard);
    // Compare the first N standard identities in each order; independent
    // streams should not produce the identical sequence.
    const objLabels = objectiveDeck.map(cardLabel);
    const playLabels = playOrderIdentities.map(cardLabel).slice(0, objLabels.length);
    expect(objLabels).not.toEqual(playLabels);
  });
});

describe("assertPlayerCount", () => {
  it("throws for non 3-5 player counts", () => {
    expect(() => assertPlayerCount(2)).toThrow();
    expect(() => assertPlayerCount(6)).toThrow();
  });

  it("returns the same value for 3/4/5", () => {
    expect(assertPlayerCount(3)).toBe(3);
    expect(assertPlayerCount(4)).toBe(4);
    expect(assertPlayerCount(5)).toBe(5);
  });
});

describe("cardLabel", () => {
  it("gives A♠, 10♥, Q♦, 2♣, Sun, Moon", () => {
    expect(cardLabel({ kind: "standard", suit: "spades", rank: RANK_ACE })).toBe("A♠");
    expect(cardLabel({ kind: "standard", suit: "hearts", rank: 10 })).toBe("10♥");
    expect(cardLabel({ kind: "standard", suit: "diamonds", rank: 12 })).toBe("Q♦");
    expect(cardLabel({ kind: "standard", suit: "clubs", rank: 2 })).toBe("2♣");
    expect(cardLabel({ kind: "joker", joker: "sun" })).toBe("Sun");
    expect(cardLabel({ kind: "joker", joker: "moon" })).toBe("Moon");
  });
});
