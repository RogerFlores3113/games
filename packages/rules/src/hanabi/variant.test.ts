import { describe, expect, it } from "vitest";
import {
  BASE_RANK_COUNTS,
  RANKS,
  SINGLE_RANK_COUNTS,
  handSizeFor,
  maxScoreFor,
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

  it("black variant's cluableColors has 6 entries, includes black, and excludes rainbow (resolved open question)", () => {
    const config = variantConfig("black");
    expect(config.cluableColors.length).toBe(6);
    expect(config.cluableColors).toContain("black");
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

  it("black: a black clue touches black cards", () => {
    const config = variantConfig("black");
    expect(config.colorClueTouches("black", "black")).toBe(true);
  });

  it("black: a red clue does not touch black cards", () => {
    const config = variantConfig("black");
    expect(config.colorClueTouches("black", "red")).toBe(false);
  });

  it("black: every nameable colour, including black, touches rainbow", () => {
    const config = variantConfig("black");
    let checked = 0;
    for (const color of config.cluableColors) {
      expect(config.colorClueTouches("rainbow", color)).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    expect(config.colorClueTouches("rainbow", "black")).toBe(true);
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
        const expected = variant === "black" && suit === "black" ? SINGLE_RANK_COUNTS : BASE_RANK_COUNTS;
        expect(config.rankCountsFor(suit)).toEqual(expected);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
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
