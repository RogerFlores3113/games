// Unit tests (RED phase) for leaderFor (XRULE-04): the Sun holder is
// leader; the A♠ holder is the fallback when no hand holds the Sun; a
// malformed deal (neither Sun nor A♠) throws.

import { describe, expect, it } from "vitest";
import { baseDeckFor, dealHands } from "./deck";
import { leaderFor } from "./leader";
import type { Hand } from "./state";

function seatIdsFor(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `seat-${i}`);
}

describe("leaderFor: Sun holder", () => {
  it.each([
    [3, "seed-a"],
    [3, "seed-b"],
    [4, "seed-c"],
    [4, "seed-d"],
    [5, "seed-e"],
    [5, "seed-f"],
  ] as const)("for %i players with seed %s, returns the Sun holder's seatId", (playerCount, seed) => {
    const seatIds = seatIdsFor(playerCount);
    const deck = baseDeckFor(playerCount);
    const { hands } = dealHands({ seatIds, seed, deck });

    const sunHolder = hands.find((h) =>
      h.cards.some((c) => c.identity.kind === "joker" && c.identity.joker === "sun"),
    )!;

    expect(leaderFor(hands)).toBe(sunHolder.seatId);
  });
});

describe("leaderFor: A♠ fallback", () => {
  it("returns the A♠ holder when no hand holds the Sun (Moon present)", () => {
    const hands: Hand[] = [
      {
        seatId: "seat-a",
        cards: [{ id: "c1", identity: { kind: "standard", suit: "hearts", rank: 3 } }],
      },
      {
        seatId: "seat-b",
        cards: [
          { id: "c2", identity: { kind: "standard", suit: "spades", rank: 14 } },
          { id: "c3", identity: { kind: "joker", joker: "moon" } },
        ],
      },
    ];
    expect(leaderFor(hands)).toBe("seat-b");
  });

  it("returns the A♠ holder when no hand holds the Sun (no Moon either)", () => {
    const hands: Hand[] = [
      {
        seatId: "seat-a",
        cards: [{ id: "c1", identity: { kind: "standard", suit: "spades", rank: 14 } }],
      },
      {
        seatId: "seat-b",
        cards: [{ id: "c2", identity: { kind: "standard", suit: "hearts", rank: 3 } }],
      },
    ];
    expect(leaderFor(hands)).toBe("seat-a");
  });
});

describe("leaderFor: malformed deal", () => {
  it("throws an Error mentioning 'malformed' when neither Sun nor A♠ is present", () => {
    const hands: Hand[] = [
      {
        seatId: "seat-a",
        cards: [{ id: "c1", identity: { kind: "standard", suit: "hearts", rank: 3 } }],
      },
      {
        seatId: "seat-b",
        cards: [{ id: "c2", identity: { kind: "joker", joker: "moon" } }],
      },
    ];
    expect(() => leaderFor(hands)).toThrow(/malformed/);
  });
});
