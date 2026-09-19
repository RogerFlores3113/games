import { describe, expect, it } from "vitest";
import {
  ALL_SUITS,
  BASE_RANK_COUNTS,
  DESCENDING_RANK_COUNTS,
  RANKS,
  handSizeFor,
  isStackComplete,
  maxScoreFor,
  nextPlayableRank,
  playOrderFor,
  variantConfig,
} from "./variant";
import type { Variant } from "../adapter";

const VARIANTS: readonly Variant[] = ["base", "rainbow", "black"] as const;

describe("variant config", () => {
  it("base variant has 5 suits, excluding rainbow and black", () => {
    const config = variantConfig("base");
    expect(config.suits.length).toBe(5);
    expect(config.suits).not.toContain("rainbow");
    expect(config.suits).not.toContain("black");
  });

  it("rainbow variant has 6 suits, including rainbow", () => {
    const config = variantConfig("rainbow");
    expect(config.suits.length).toBe(6);
    expect(config.suits).toContain("rainbow");
  });

  it("black variant has 7 suits, including rainbow and black", () => {
    const config = variantConfig("black");
    expect(config.suits.length).toBe(7);
    expect(config.suits).toContain("rainbow");
    expect(config.suits).toContain("black");
  });

  it("base variant's cluableColors equals its 5 suits", () => {
    const config = variantConfig("base");
    expect([...config.cluableColors].sort()).toEqual([...config.suits].sort());
  });

  it("rainbow variant's cluableColors has 5 entries and excludes rainbow", () => {
    const config = variantConfig("rainbow");
    expect(config.cluableColors.length).toBe(5);
    expect(config.cluableColors).not.toContain("rainbow");
  });

  it("black variant's cluableColors has 5 entries and excludes both rainbow and black (owner gap closure, 2026-09-18)", () => {
    const config = variantConfig("black");
    expect([...config.cluableColors]).toEqual(["red", "yellow", "green", "blue", "white"]);
    expect(config.cluableColors).not.toContain("black");
    expect(config.cluableColors).not.toContain("rainbow");
  });

  it("rainbow: every color clue touches the rainbow suit", () => {
    const config = variantConfig("rainbow");
    let checked = 0;
    for (const color of config.cluableColors) {
      expect(config.colorClueTouches("rainbow", color)).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("rainbow: a color clue does not touch a mismatched normal suit", () => {
    const config = variantConfig("rainbow");
    expect(config.colorClueTouches("red", "blue")).toBe(false);
  });

  it("black: no colour clue touches a black card, in any variant (owner gap closure, 2026-09-18)", () => {
    let checked = 0;
    for (const variant of VARIANTS) {
      const config = variantConfig(variant);
      for (const color of ALL_SUITS) {
        expect(config.colorClueTouches("black", color)).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("black: a red clue does not touch black cards", () => {
    const config = variantConfig("black");
    expect(config.colorClueTouches("black", "red")).toBe(false);
  });

  it("black: every nameable colour touches rainbow, but a black clue never touches rainbow (black is never nameable)", () => {
    const config = variantConfig("black");
    let checked = 0;
    for (const color of config.cluableColors) {
      expect(config.colorClueTouches("rainbow", color)).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    expect(config.colorClueTouches("rainbow", "black")).toBe(false);
  });

  it("black: rankCountsFor(rainbow) is BASE_RANK_COUNTS (rainbow tile count unchanged)", () => {
    const config = variantConfig("black");
    expect(config.rankCountsFor("rainbow")).toEqual(BASE_RANK_COUNTS);
  });

  it("rankClueTouches is true exactly when rank matches clue rank, in all three variants", () => {
    let checked = 0;
    for (const variant of VARIANTS) {
      const config = variantConfig(variant);
      for (const rank of RANKS) {
        for (const clueRank of RANKS) {
          expect(config.rankClueTouches(rank, clueRank)).toBe(rank === clueRank);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("rankCountsFor returns BASE_RANK_COUNTS for every suit except black-in-black-variant", () => {
    let checked = 0;
    for (const variant of VARIANTS) {
      const config = variantConfig(variant);
      for (const suit of config.suits) {
        const expected = variant === "black" && suit === "black" ? DESCENDING_RANK_COUNTS : BASE_RANK_COUNTS;
        expect(config.rankCountsFor(suit)).toEqual(expected);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("black: rankCountsFor(black) is the reversed 3/2/2/2/1 distribution (owner gap closure, UAT gap 3)", () => {
    const config = variantConfig("black");
    expect(config.rankCountsFor("black")).toEqual({ 1: 1, 2: 2, 3: 2, 4: 2, 5: 3 });
  });

  it("direction: black is descending, every other suit in every variant is ascending", () => {
    let checked = 0;
    for (const variant of VARIANTS) {
      const config = variantConfig(variant);
      for (const suit of config.suits) {
        const expected = suit === "black" ? "descending" : "ascending";
        expect(config.suitRule(suit).direction).toBe(expected);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("playOrderFor: black plays 5 -> 1, red plays 1 -> 5", () => {
    const config = variantConfig("black");
    expect(playOrderFor(config, "black")).toEqual([5, 4, 3, 2, 1]);
    expect(playOrderFor(config, "red")).toEqual([1, 2, 3, 4, 5]);
  });

  it("nextPlayableRank: black counts down from 5, red counts up from 1, null once complete", () => {
    const config = variantConfig("black");
    expect(nextPlayableRank(config, { suit: "black", playedRanks: [] })).toBe(5);
    expect(nextPlayableRank(config, { suit: "black", playedRanks: [5, 4] })).toBe(3);
    expect(nextPlayableRank(config, { suit: "black", playedRanks: [5, 4, 3, 2, 1] })).toBeNull();
    expect(nextPlayableRank(config, { suit: "red", playedRanks: [] })).toBe(1);
  });

  it("isStackComplete: true once every rank in play order is played, regardless of direction", () => {
    expect(isStackComplete({ playedRanks: [5, 4, 3, 2, 1] })).toBe(true);
    expect(isStackComplete({ playedRanks: [5, 4, 3, 2] })).toBe(false);
    expect(isStackComplete({ playedRanks: [1, 2, 3, 4, 5] })).toBe(true);
    expect(isStackComplete({ playedRanks: [] })).toBe(false);
  });

  it("hand size is 5 for 2-3 players and 4 for 4-5 players", () => {
    expect(handSizeFor(2)).toBe(5);
    expect(handSizeFor(3)).toBe(5);
    expect(handSizeFor(4)).toBe(4);
    expect(handSizeFor(5)).toBe(4);
  });

  it("maxScoreFor: base 25, rainbow 30, black 35", () => {
    expect(maxScoreFor(variantConfig("base"))).toBe(25);
    expect(maxScoreFor(variantConfig("rainbow"))).toBe(30);
    expect(maxScoreFor(variantConfig("black"))).toBe(35);
  });
});
