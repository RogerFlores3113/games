// Unit tests (RED phase) for trick.ts's follow-suit resolver, trump check
// and trick winner. Hand-written example cases from the plan's <behavior>
// block; fast-check property coverage lives in trick.property.test.ts.

import { describe, expect, it } from "vitest";
import { isTrump, ledIdentity, legalPlaysFor, trickWinner } from "./trick";
import type { CardIdentity, ExpeditionCard, TrickPlay } from "./state";

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

describe("ledIdentity", () => {
  it("returns null for an empty trick", () => {
    expect(ledIdentity([])).toBeNull();
  });

  it("returns the first play's identity", () => {
    const plays: TrickPlay[] = [
      { seatId: "seat-a", card: heartsFive },
      { seatId: "seat-b", card: heartsKing },
    ];
    expect(ledIdentity(plays)).toEqual(heartsFive.identity);
  });
});

describe("trickWinner", () => {
  it("throws on empty plays", () => {
    expect(() => trickWinner([])).toThrow();
  });

  it("[5♥ led, K♥, A♠] → K♥'s seat (off-suit Ace loses)", () => {
    const plays: TrickPlay[] = [
      { seatId: "seat-a", card: heartsFive },
      { seatId: "seat-b", card: heartsKing },
      { seatId: "seat-c", card: spadesKing },
    ];
    expect(trickWinner(plays)).toBe("seat-b");
  });

  it("[2♥ led, Moon, A♥] → Moon's seat", () => {
    const heartsTwo = card("c11", { kind: "standard", suit: "hearts", rank: 2 });
    const plays: TrickPlay[] = [
      { seatId: "seat-a", card: heartsTwo },
      { seatId: "seat-b", card: moon },
      { seatId: "seat-c", card: heartsAce },
    ];
    expect(trickWinner(plays)).toBe("seat-b");
  });

  it("[Moon led, Sun] → Sun's seat", () => {
    const plays: TrickPlay[] = [
      { seatId: "seat-a", card: moon },
      { seatId: "seat-b", card: sun },
    ];
    expect(trickWinner(plays)).toBe("seat-b");
  });

  it("[Sun led, Moon] → Sun's seat", () => {
    const plays: TrickPlay[] = [
      { seatId: "seat-a", card: sun },
      { seatId: "seat-b", card: moon },
    ];
    expect(trickWinner(plays)).toBe("seat-a");
  });

  it("[2♦ led, Sun, Moon] → Sun's seat", () => {
    const plays: TrickPlay[] = [
      { seatId: "seat-a", card: diamondsTwo },
      { seatId: "seat-b", card: sun },
      { seatId: "seat-c", card: moon },
    ];
    expect(trickWinner(plays)).toBe("seat-b");
  });

  it("never compares a joker by rank: highest led-suit standard card wins when no joker played", () => {
    const plays: TrickPlay[] = [
      { seatId: "seat-a", card: heartsThree },
      { seatId: "seat-b", card: heartsFive },
      { seatId: "seat-c", card: heartsKing },
      { seatId: "seat-d", card: spadesKing },
    ];
    expect(trickWinner(plays)).toBe("seat-c");
  });
});
