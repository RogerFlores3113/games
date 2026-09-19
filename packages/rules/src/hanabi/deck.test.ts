import { describe, expect, it } from "vitest";
import { buildDeck, dealInitialHands } from "./deck";
import { handSizeFor, variantConfig } from "./variant";
import type { Variant } from "../adapter";
import type { Rank } from "./variant";

const VARIANTS: readonly Variant[] = ["base", "rainbow", "black"] as const;
const EXPECTED_TOTALS: Record<Variant, number> = { base: 50, rainbow: 60, black: 65 };
const SEAT_COUNTS = [2, 3, 4, 5];

describe("deck composition", () => {
  it("buildDeck yields the correct total card count per variant (50 / 60 / 65)", () => {
    for (const variant of VARIANTS) {
      const config = variantConfig(variant);
      expect(buildDeck(config).length).toBe(EXPECTED_TOTALS[variant]);
    }
  });

  it("base: exactly three rank-1, two each of ranks 2/3/4, one rank-5 per suit", () => {
    const config = variantConfig("base");
    const deck = buildDeck(config);
    let checked = 0;
    for (const suit of config.suits) {
      const bySuit = deck.filter((c) => c.suit === suit);
      const rankCounts: Record<Rank, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const c of bySuit) rankCounts[c.rank]++;
      expect(rankCounts).toEqual({ 1: 3, 2: 2, 3: 2, 4: 2, 5: 1 });
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("black variant: the black suit contributes exactly one card of each rank (5 total)", () => {
    const config = variantConfig("black");
    const deck = buildDeck(config);
    const blackCards = deck.filter((c) => c.suit === "black");
    expect(blackCards.length).toBe(5);
    const ranks = blackCards.map((c) => c.rank).sort();
    expect(ranks).toEqual([1, 2, 3, 4, 5]);
  });

  it("black variant: every non-black suit (five colours + rainbow) contributes 10 cards", () => {
    const config = variantConfig("black");
    const deck = buildDeck(config);
    let checked = 0;
    for (const suit of config.suits) {
      if (suit === "black") continue;
      expect(deck.filter((c) => c.suit === suit).length).toBe(10);
      checked++;
    }
    expect(checked).toBe(6);
  });

  it("black variant: the rainbow suit keeps its unchanged 3/2/2/2/1 distribution", () => {
    const config = variantConfig("black");
    const deck = buildDeck(config);
    const rainbowCards = deck.filter((c) => c.suit === "rainbow");
    expect(rainbowCards.length).toBe(10);
    const rankCounts: Record<Rank, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const c of rainbowCards) rankCounts[c.rank]++;
    expect(rankCounts).toEqual({ 1: 3, 2: 2, 3: 2, 4: 2, 5: 1 });
  });

  it("rainbow variant: the rainbow suit contributes a full 10-card distribution", () => {
    const config = variantConfig("rainbow");
    const deck = buildDeck(config);
    const rainbowCards = deck.filter((c) => c.suit === "rainbow");
    expect(rainbowCards.length).toBe(10);
    const rankCounts: Record<Rank, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const c of rainbowCards) rankCounts[c.rank]++;
    expect(rankCounts).toEqual({ 1: 3, 2: 2, 3: 2, 4: 2, 5: 1 });
  });

  it("dealInitialHands gives every seat the correct hand size across all variants and seat counts", () => {
    let checked = 0;
    for (const variant of VARIANTS) {
      const config = variantConfig(variant);
      for (const seatCount of SEAT_COUNTS) {
        const seatIds = Array.from({ length: seatCount }, (_, i) => `seat-${i}`);
        const { hands } = dealInitialHands({ config, seatIds, seed: "seed-a" });
        const expectedSize = handSizeFor(seatCount);
        for (const hand of hands) {
          expect(hand.slots.length).toBe(expectedSize);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("dealInitialHands leaves deck.length === buildDeck(config).length - (seatCount * handSize)", () => {
    let checked = 0;
    for (const variant of VARIANTS) {
      const config = variantConfig(variant);
      for (const seatCount of SEAT_COUNTS) {
        const seatIds = Array.from({ length: seatCount }, (_, i) => `seat-${i}`);
        const { deck } = dealInitialHands({ config, seatIds, seed: "seed-b" });
        const expectedRemaining = buildDeck(config).length - seatCount * handSizeFor(seatCount);
        expect(deck.length).toBe(expectedRemaining);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("every dealt and undealt card id is unique, 8 lowercase letters, and contains no digit", () => {
    const config = variantConfig("rainbow");
    const seatIds = ["a", "b", "c", "d"];
    const { hands, deck } = dealInitialHands({ config, seatIds, seed: "seed-c" });
    const allIds: string[] = [];
    for (const hand of hands) {
      for (const slot of hand.slots) allIds.push(slot.card.id);
    }
    for (const card of deck) allIds.push(card.id);

    expect(allIds.length).toBeGreaterThan(0);
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const id of allIds) {
      expect(id).toMatch(/^[a-z]{8}$/);
      expect(id).not.toMatch(/[0-9]/);
    }
  });

  it("two dealInitialHands calls with the same (config, seatIds, seed) are deep-equal", () => {
    const config = variantConfig("black");
    const seatIds = ["a", "b", "c"];
    const first = dealInitialHands({ config, seatIds, seed: "same-seed" });
    const second = dealInitialHands({ config, seatIds, seed: "same-seed" });
    expect(first).toEqual(second);
  });

  it("different seeds produce different deck orders", () => {
    const config = variantConfig("black");
    const seatIds = ["a", "b", "c"];
    const first = dealInitialHands({ config, seatIds, seed: "seed-one" });
    const second = dealInitialHands({ config, seatIds, seed: "seed-two" });
    expect(first).not.toEqual(second);
  });

  it("no card id equals the stringified index of its position in the unshuffled deck", () => {
    const config = variantConfig("base");
    const seatIds = ["a", "b"];
    const { hands, deck } = dealInitialHands({ config, seatIds, seed: "seed-d" });
    const allIds: string[] = [];
    for (const hand of hands) for (const slot of hand.slots) allIds.push(slot.card.id);
    for (const card of deck) allIds.push(card.id);

    const totalCards = buildDeck(config).length;
    let checked = 0;
    for (let i = 0; i < totalCards; i++) {
      expect(allIds).not.toContain(String(i));
      checked++;
    }
    expect(checked).toBe(totalCards);
  });
});
