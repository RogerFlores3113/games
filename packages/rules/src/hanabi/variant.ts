// The Hanabi variant-parametrization layer (D-08/D-09). This module is the
// ONLY place in `packages/rules/src/hanabi/` that declares a suit list, a
// rank-count table, or a deck-size number. Every later module (deck, legality,
// actions, projection) reads its suit/rank truth from the `VariantConfig`
// objects exported here, never from a hardcoded literal — that is what lets
// Phase 7 enable Rainbow and Black without restructuring the engine.
//
// Resolved open question (RESEARCH.md "Open Questions — RESOLVED", #1):
// Black is a normally color-cluable suit — "black" is a nameable clue color,
// exactly like red or blue, matching the physical box product. Rainbow, by
// contrast, is touched by every color clue and is NEVER itself a nameable
// clue color (it never appears in `cluableColors`).
//
// Rainbow inference consequence (RESEARCH.md Pitfall 3), recorded beside
// `colorClueTouches` because it explains behavior this predicate produces:
// because rainbow is touched by every color, a positive color clue does NOT
// resolve a card to exactly one candidate suit (it could be the named color
// OR rainbow) — callers deriving `possibleSuits` must filter the full suit
// list through this predicate rather than assigning the named color
// directly. A negative color clue, conversely, DOES rule out rainbow: a card
// untouched by a color clue can never be rainbow, since rainbow is touched by
// every color clue.
//
// Zero runtime dependencies (FDN-02): this file brings in nothing but types.

import type { Variant } from "../adapter";

export const ALL_SUITS = [
  "red",
  "yellow",
  "green",
  "blue",
  "white",
  "rainbow",
  "black",
] as const;
export type Suit = (typeof ALL_SUITS)[number];

export const RANKS = [1, 2, 3, 4, 5] as const;
export type Rank = (typeof RANKS)[number];

/** Standard 10-card-per-suit distribution: three 1s, two each of 2/3/4, one 5. */
export const BASE_RANK_COUNTS: Readonly<Record<Rank, number>> = {
  1: 3,
  2: 2,
  3: 2,
  4: 2,
  5: 1,
};

/** Black's 5-card-per-suit distribution: exactly one copy of each rank. */
export const SINGLE_RANK_COUNTS: Readonly<Record<Rank, number>> = {
  1: 1,
  2: 1,
  3: 1,
  4: 1,
  5: 1,
};

const BASE_SUITS: readonly Suit[] = ["red", "yellow", "green", "blue", "white"];

export interface VariantConfig {
  readonly variant: Variant;
  readonly suits: readonly Suit[];
  readonly cluableColors: readonly Suit[];
  rankCountsFor(suit: Suit): Readonly<Record<Rank, number>>;
  colorClueTouches(suit: Suit, clueColor: Suit): boolean;
  rankClueTouches(rank: Rank, clueRank: Rank): boolean;
}

function rankClueTouches(rank: Rank, clueRank: Rank): boolean {
  return rank === clueRank;
}

const BASE_CONFIG: VariantConfig = Object.freeze({
  variant: "base",
  suits: BASE_SUITS,
  cluableColors: BASE_SUITS,
  rankCountsFor(_suit: Suit): Readonly<Record<Rank, number>> {
    return BASE_RANK_COUNTS;
  },
  colorClueTouches(suit: Suit, clueColor: Suit): boolean {
    return suit === clueColor;
  },
  rankClueTouches,
});

const RAINBOW_SUITS: readonly Suit[] = [...BASE_SUITS, "rainbow"];

const RAINBOW_CONFIG: VariantConfig = Object.freeze({
  variant: "rainbow",
  suits: RAINBOW_SUITS,
  // Rainbow is never itself a nameable clue color (resolved open question).
  cluableColors: BASE_SUITS,
  rankCountsFor(_suit: Suit): Readonly<Record<Rank, number>> {
    // Rainbow is a full 10-card suit, same distribution as any normal suit.
    return BASE_RANK_COUNTS;
  },
  colorClueTouches(suit: Suit, clueColor: Suit): boolean {
    // Every color clue touches rainbow cards, regardless of which color was
    // named (Pitfall 3 above) — this is the "touched by every color" rule.
    if (suit === "rainbow") return true;
    return suit === clueColor;
  },
  rankClueTouches,
});

const BLACK_SUITS: readonly Suit[] = [...BASE_SUITS, "black"];

const BLACK_CONFIG: VariantConfig = Object.freeze({
  variant: "black",
  suits: BLACK_SUITS,
  // Black IS a normal, color-cluable suit (resolved open question).
  cluableColors: BLACK_SUITS,
  rankCountsFor(suit: Suit): Readonly<Record<Rank, number>> {
    return suit === "black" ? SINGLE_RANK_COUNTS : BASE_RANK_COUNTS;
  },
  colorClueTouches(suit: Suit, clueColor: Suit): boolean {
    // Black behaves like any normal suit for color-clue purposes — no
    // special case needed here beyond the exact-match rule every other suit
    // already uses.
    return suit === clueColor;
  },
  rankClueTouches,
});

/** Resolves a variant name to its `VariantConfig`. Exhaustive over the closed
 * `Variant` union — an unrecognized value throws rather than silently
 * returning a partial config (T-03-03). */
export function variantConfig(variant: Variant): VariantConfig {
  switch (variant) {
    case "base":
      return BASE_CONFIG;
    case "rainbow":
      return RAINBOW_CONFIG;
    case "black":
      return BLACK_CONFIG;
    default: {
      const exhaustiveCheck: never = variant;
      throw new Error(`Unrecognized Hanabi variant: ${String(exhaustiveCheck)}`);
    }
  }
}

/** RULES-01: hand size is 5 for 2-3 players, 4 for 4-5 players, in every
 * variant — no box variant in scope alters hand size. */
export function handSizeFor(playerCount: number): number {
  return playerCount <= 3 ? 5 : 4;
}

/** Max achievable score is five points per suit (one per completed stack). */
export function maxScoreFor(config: VariantConfig): number {
  return config.suits.length * 5;
}
