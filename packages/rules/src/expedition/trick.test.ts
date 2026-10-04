// Unit tests for trick.ts's follow-suit resolver, trump check, trick winner
// and trick resolution. Hand-written example cases; fast-check property
// coverage lives in trick.property.test.ts.

import { describe, expect, it } from "vitest";
import { cardReading, isTrump, legalPlaysFor, rankOf, resolveTrick, trickWinner } from "./trick";
import { baseRules, baseRulesWith } from "./rules";
import type { CampState, CardIdentity, ExpeditionCard, TrickPlay } from "./state";

function card(id: string, identity: CardIdentity): ExpeditionCard {
  return { id, identity };
}

const heartsThree = card("c1", { kind: "standard", suit: "hearts", rank: 3 });
const spadesKing = card("c2", { kind: "standard", suit: "spades", rank: 13 });
const sun = card("c3", { kind: "joker", joker: "sun" });
const moon = card("c4", { kind: "joker", joker: "moon" });
const clubsTwo = card("c5", { kind: "standard", suit: "clubs", rank: 2 });
const heartsAce = card("c6", { kind: "standard", suit: "hearts", rank: 14 });
const spadesTwo = card("c7", { kind: "standard", suit: "spades", rank: 2 });
const heartsFive = card("c8", { kind: "standard", suit: "hearts", rank: 5 });
const heartsKing = card("c9", { kind: "standard", suit: "hearts", rank: 13 });
const diamondsTwo = card("c10", { kind: "standard", suit: "diamonds", rank: 2 });

describe("legalPlaysFor", () => {
  it("leading (led = null): every card in hand is legal", () => {
    const hand = [heartsThree, spadesKing, sun];
    expect(legalPlaysFor(hand, null)).toEqual(hand);
  });

  it("hearts led, hand has 3♥ and K♠ and Sun: legal = [3♥] only", () => {
    const hand = [heartsThree, spadesKing, sun];
    const led: CardIdentity = { kind: "standard", suit: "hearts", rank: 5 };
    expect(legalPlaysFor(hand, led)).toEqual([heartsThree]);
  });

  it("hearts led, hand has K♠, 2♣, Sun, Moon: legal = whole hand (jokers allowed when void)", () => {
    const hand = [spadesKing, clubsTwo, sun, moon];
    const led: CardIdentity = { kind: "standard", suit: "hearts", rank: 5 };
    expect(legalPlaysFor(hand, led)).toEqual(hand);
  });

  it("Sun led, hand has Moon, A♥, 2♠: legal = [Moon] exactly", () => {
    const hand = [moon, heartsAce, spadesTwo];
    const led: CardIdentity = { kind: "joker", joker: "sun" };
    expect(legalPlaysFor(hand, led)).toEqual([moon]);
  });

  it("Moon led, hand has Sun, A♥: legal = [Sun] exactly", () => {
    const hand = [sun, heartsAce];
    const led: CardIdentity = { kind: "joker", joker: "moon" };
    expect(legalPlaysFor(hand, led)).toEqual([sun]);
  });

  it("Sun led, hand has A♥, 2♠ (no joker): legal = whole hand", () => {
    const hand = [heartsAce, spadesTwo];
    const led: CardIdentity = { kind: "joker", joker: "sun" };
    expect(legalPlaysFor(hand, led)).toEqual(hand);
  });

  it("Moon led, hand has A♥, 2♠ (no joker): legal = whole hand", () => {
    const hand = [heartsAce, spadesTwo];
    const led: CardIdentity = { kind: "joker", joker: "moon" };
    expect(legalPlaysFor(hand, led)).toEqual(hand);
  });
});

describe("isTrump", () => {
  it("Sun and Moon are trump", () => {
    expect(isTrump(sun.identity)).toBe(true);
    expect(isTrump(moon.identity)).toBe(true);
  });

  it("standard cards are never trump", () => {
    expect(isTrump(heartsThree.identity)).toBe(false);
    expect(isTrump(spadesKing.identity)).toBe(false);
  });
});

const led = (plays: readonly TrickPlay[]): CardIdentity => plays[0]!.card.identity;

describe("trickWinner", () => {
  it("throws on empty plays", () => {
    expect(() => trickWinner([], heartsFive.identity)).toThrow();
  });

  it("[5♥ led, K♥, A♠] → K♥'s seat (off-suit Ace loses)", () => {
    const plays: TrickPlay[] = [
      { seatId: "seat-a", card: heartsFive },
      { seatId: "seat-b", card: heartsKing },
      { seatId: "seat-c", card: spadesKing },
    ];
    expect(trickWinner(plays, led(plays))).toBe("seat-b");
  });

  it("[2♥ led, Moon, A♥] → Moon's seat", () => {
    const heartsTwo = card("c11", { kind: "standard", suit: "hearts", rank: 2 });
    const plays: TrickPlay[] = [
      { seatId: "seat-a", card: heartsTwo },
      { seatId: "seat-b", card: moon },
      { seatId: "seat-c", card: heartsAce },
    ];
    expect(trickWinner(plays, led(plays))).toBe("seat-b");
  });

  it("[Moon led, Sun] → Sun's seat", () => {
    const plays: TrickPlay[] = [
      { seatId: "seat-a", card: moon },
      { seatId: "seat-b", card: sun },
    ];
    expect(trickWinner(plays, led(plays))).toBe("seat-b");
  });

  it("[Sun led, Moon] → Sun's seat", () => {
    const plays: TrickPlay[] = [
      { seatId: "seat-a", card: sun },
      { seatId: "seat-b", card: moon },
    ];
    expect(trickWinner(plays, led(plays))).toBe("seat-a");
  });

  it("[2♦ led, Sun, Moon] → Sun's seat", () => {
    const plays: TrickPlay[] = [
      { seatId: "seat-a", card: diamondsTwo },
      { seatId: "seat-b", card: sun },
      { seatId: "seat-c", card: moon },
    ];
    expect(trickWinner(plays, led(plays))).toBe("seat-b");
  });

  it("never compares a joker by rank: highest led-suit standard card wins when no joker played", () => {
    const plays: TrickPlay[] = [
      { seatId: "seat-a", card: heartsThree },
      { seatId: "seat-b", card: heartsFive },
      { seatId: "seat-c", card: heartsKing },
      { seatId: "seat-d", card: spadesKing },
    ];
    expect(trickWinner(plays, led(plays))).toBe("seat-c");
  });
});

describe("generic trump predicate (WR-03)", () => {
  const spadesTrump = cardReading({ isTrump: (identity: CardIdentity): boolean => identity.kind === "joker" || identity.suit === "spades" });

  it("default predicate: trick.test.ts's other describes prove base semantics are unchanged (no assertion here)", () => {
    expect(trickWinner([{ seatId: "s", card: sun }], sun.identity)).toBe("s");
  });

  it("spades-trump: [5♥ led, 2♠, A♥] → the only trump play (2♠) wins", () => {
    const plays: TrickPlay[] = [
      { seatId: "p0", card: heartsFive },
      { seatId: "p1", card: spadesTwo },
      { seatId: "p2", card: heartsAce },
    ];
    expect(trickWinner(plays, led(plays), spadesTrump)).toBe("p1");
  });

  it("spades-trump: two trumps played, the higher trump strength wins", () => {
    const plays: TrickPlay[] = [
      { seatId: "p0", card: heartsFive },
      { seatId: "p1", card: spadesTwo },
      { seatId: "p2", card: spadesKing },
    ];
    expect(trickWinner(plays, led(plays), spadesTrump)).toBe("p2");
  });

  it("spades-trump: hearts led, hand holds 3♥ and 9♠ — must follow suit with 3♥ only", () => {
    const nineSpades = card("c12", { kind: "standard", suit: "spades", rank: 9 });
    const hand = [heartsThree, nineSpades];
    const led: CardIdentity = { kind: "standard", suit: "hearts", rank: 5 };
    expect(legalPlaysFor(hand, led, spadesTrump)).toEqual([heartsThree]);
  });

  it("spades-trump: void of hearts, hand holds only spades and clubs — whole hand legal", () => {
    const hand = [spadesKing, clubsTwo];
    const led: CardIdentity = { kind: "standard", suit: "hearts", rank: 5 };
    expect(legalPlaysFor(hand, led, spadesTrump)).toEqual(hand);
  });

  it("spades-trump: a trump (9♠) led, hand holds a trump — must follow with a trump", () => {
    const nineSpades = card("c12", { kind: "standard", suit: "spades", rank: 9 });
    const hand = [heartsThree, nineSpades];
    const led: CardIdentity = { kind: "standard", suit: "spades", rank: 4 };
    expect(legalPlaysFor(hand, led, spadesTrump)).toEqual([nineSpades]);
  });

  it("spades-trump: a trump led, hand holds no trump — whole hand legal", () => {
    const hand = [heartsThree, clubsTwo];
    const led: CardIdentity = { kind: "standard", suit: "spades", rank: 9 };
    expect(legalPlaysFor(hand, led, spadesTrump)).toEqual(hand);
  });

  it("default predicate unchanged: a Sun lead still forces the Moon", () => {
    const hand = [moon, heartsAce];
    const led: CardIdentity = { kind: "joker", joker: "sun" };
    expect(legalPlaysFor(hand, led)).toEqual([moon]);
  });

  it("baseRulesWith(spadesTrump).legalPlays honors the predicate", () => {
    const rules = baseRulesWith(spadesTrump);
    const nineSpades = card("c12", { kind: "standard", suit: "spades", rank: 9 });
    const state: CampState = {
      seatIds: ["p0", "p1"],
      playerCount: 3,
      removedCards: [],
      totalTricks: 1,
      hands: [
        { seatId: "p0", cards: [heartsThree, nineSpades] },
        { seatId: "p1", cards: [] },
      ],
      expeditionLeaderSeatId: "p0",
      objectives: [],
      objectiveDeck: [],
      completedTricks: [],
      currentTrick: {
        index: 0,
        leaderSeatId: "p0",
        plays: [{ seatId: "p1", card: heartsFive }],
      },
      discards: [], voidedTricks: [],
    };
    expect(rules.legalPlays(state, "p0")).toEqual([heartsThree]);
  });

  it("baseRulesWith(spadesTrump).trickWinner honors the predicate", () => {
    const plays: TrickPlay[] = [
      { seatId: "p0", card: heartsFive },
      { seatId: "p1", card: spadesTwo },
    ];
    expect(baseRulesWith(spadesTrump).trickWinner(plays, led(plays))).toBe("p1");
  });
});

describe("rankOf hook", () => {
  const plays: TrickPlay[] = [
    { seatId: "p0", card: heartsFive },
    { seatId: "p1", card: heartsKing },
    { seatId: "p2", card: heartsThree },
  ];

  it("a shifted rank changes the trick winner", () => {
    const threeIsAce = cardReading({ rankOf: (c: ExpeditionCard) => (c.id === heartsThree.id ? 14 : rankOf(c)) });
    expect(trickWinner(plays, led(plays))).toBe("p1");
    expect(trickWinner(plays, led(plays), threeIsAce)).toBe("p2");
    expect(baseRulesWith(threeIsAce).trickWinner(plays, led(plays))).toBe("p2");
  });

  it("a rank tie goes to the earliest play", () => {
    const threeIsKing = cardReading({ rankOf: (c: ExpeditionCard) => (c.id === heartsThree.id ? 13 : rankOf(c)) });
    const kingLast: TrickPlay[] = [
      { seatId: "p0", card: heartsFive },
      { seatId: "p1", card: heartsThree },
      { seatId: "p2", card: heartsKing },
    ];
    expect(trickWinner(plays, led(plays), threeIsKing)).toBe("p1");
    expect(trickWinner(kingLast, led(kingLast), threeIsKing)).toBe("p1");
  });

  it("the default ranks Sun over Moon over the Ace", () => {
    expect([rankOf(sun), rankOf(moon), rankOf(heartsAce), rankOf(clubsTwo)]).toEqual([16, 15, 14, 2]);
  });
});

describe("resolveTrick", () => {
  const spadesNine = card("c12", { kind: "standard", suit: "spades", rank: 9 });
  const heartsSeven = card("c13", { kind: "standard", suit: "hearts", rank: 7 });
  const diamondsKing = card("c14", { kind: "standard", suit: "diamonds", rank: 13 });
  const spadesThree = card("c15", { kind: "standard", suit: "spades", rank: 3 });
  const burning = (...ids: string[]) => ({ ...baseRules, burns: () => ids });

  it("a burned card cannot win", () => {
    const plays: TrickPlay[] = [
      { seatId: "p0", card: heartsFive },
      { seatId: "p1", card: heartsKing },
      { seatId: "p2", card: heartsThree },
    ];
    const resolved = resolveTrick(plays, burning(heartsKing.id));
    expect(resolved.winnerSeatId).toBe("p0");
    expect(resolved.plays.map((p) => [p.seatId, p.burned, p.countsAs])).toEqual([
      ["p0", false, null],
      ["p1", true, null],
      ["p2", false, null],
    ]);
  });

  it("a counted-as identity follows its new suit", () => {
    const spadesAsHearts = (c: ExpeditionCard): CardIdentity =>
      c.identity.kind === "standard" && c.identity.suit === "spades" ? { kind: "standard", suit: "hearts", rank: c.identity.rank } : c.identity;
    const rules = baseRulesWith(cardReading({ identityOf: spadesAsHearts }));
    const plays: TrickPlay[] = [
      { seatId: "p0", card: heartsFive },
      { seatId: "p1", card: spadesNine },
      { seatId: "p2", card: heartsSeven },
    ];
    const resolved = resolveTrick(plays, rules);
    expect(resolved.winnerSeatId).toBe("p1");
    expect(resolved.plays.map((p) => p.countsAs)).toEqual([null, { kind: "standard", suit: "hearts", rank: 9 }, null]);
  });

  it("a burned lead keeps the led suit", () => {
    const plays: TrickPlay[] = [
      { seatId: "p0", card: heartsFive },
      { seatId: "p1", card: heartsThree },
      { seatId: "p2", card: spadesKing },
    ];
    expect(resolveTrick(plays, burning(heartsFive.id)).winnerSeatId).toBe("p1");
  });

  it("with no follower kept the highest kept card wins", () => {
    const plays: TrickPlay[] = [
      { seatId: "p0", card: heartsFive },
      { seatId: "p1", card: spadesThree },
      { seatId: "p2", card: diamondsKing },
    ];
    expect(resolveTrick(plays, burning(heartsFive.id)).winnerSeatId).toBe("p2");
  });

  it("throws when every play burns, or a burn names a card nobody played", () => {
    const plays: TrickPlay[] = [
      { seatId: "p0", card: heartsFive },
      { seatId: "p1", card: spadesThree },
    ];
    expect(() => resolveTrick(plays, burning(heartsFive.id, spadesThree.id))).toThrow("burns removed every play");
    expect(() => resolveTrick(plays, burning("nope"))).toThrow("burns named nope");
  });
});
