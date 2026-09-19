// The Hanabi variant-parametrization layer (D-08/D-09). This module is the
// ONLY place in `packages/rules/src/hanabi/` that declares a suit list, a
// rank-count table, or a deck-size number. Every later module (deck, legality,
// actions, projection) reads its suit/rank truth from the `VariantConfig`
// objects exported here, never from a hardcoded literal — that is what lets
// Phase 7 enable Rainbow and Black without restructuring the engine.
//
// Owner gap closure round 2 (2026-09-18, UAT gap 2, supersedes 07-CONTEXT.md
// D-08 and the round-1 "Black is nameable" behaviour from plan 07-07): Black
// is NEVER a nameable colour clue, and NO colour clue ever touches a Black
// tile — the owner, verbatim: "black is not a color that accepts hints. You
// cannot hint at the color black." Only rank clues touch Black. Rainbow is
// unchanged by this: it is still touched by every nameable colour clue and
// is still never itself nameable.
//
// Every suit's colour-clue behaviour is declared once, per-suit, in
// `SUIT_RULES` below via a `ColorTouch` tag:
//   - "named": the suit is itself a nameable colour and is touched only by a
//     clue naming it exactly (red, yellow, green, blue, white).
//   - "every": touched by every nameable colour clue and never itself
//     nameable (rainbow).
//   - "never": touched by no colour clue and never itself nameable (black).
// `cluableColors`, `colorClueTouches`, and the per-variant configs are all
// derived generically from this one table — there is no `=== "black"`
// special case anywhere in this file's logic.
//
// Rainbow inference consequence (RESEARCH.md Pitfall 3), recorded beside
// `colorClueTouches` because it explains behavior this predicate produces:
// because rainbow is touched by every color, a positive color clue does NOT
// resolve a card to exactly one candidate suit (it could be the named color
// OR rainbow) — callers deriving `possibleSuits` must filter the full suit
// list through this predicate rather than assigning the named color
// directly. A negative color clue, conversely, DOES rule out rainbow: a card
// untouched by a color clue can never be rainbow, since rainbow is touched by
// every color clue. Black is untouched by every colour clue (positive or
// negative it never resolves anything about "black" as a candidate colour,
// since it can never be named), so a negative colour clue does NOT rule out
// black the way it rules out rainbow.
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

/** How a suit relates to colour clues (see file header). */
export type ColorTouch = "named" | "every" | "never";

/** Per-suit colour-touch behaviour plus its rank-count distribution. */
export interface SuitRule {
  readonly colorTouch: ColorTouch;
  readonly rankCounts: Readonly<Record<Rank, number>>;
}

/** Single frozen source of truth for every suit's colour-clue behaviour and
 * rank distribution (owner gap closure, 2026-09-18). Plan 07-10 changes
 * Black's `rankCounts` and adds a play direction; this table's `colorTouch`
 * values are not expected to change again. */
const SUIT_RULES: Readonly<Record<Suit, SuitRule>> = Object.freeze({
  red: { colorTouch: "named", rankCounts: BASE_RANK_COUNTS },
  yellow: { colorTouch: "named", rankCounts: BASE_RANK_COUNTS },
  green: { colorTouch: "named", rankCounts: BASE_RANK_COUNTS },
  blue: { colorTouch: "named", rankCounts: BASE_RANK_COUNTS },
  white: { colorTouch: "named", rankCounts: BASE_RANK_COUNTS },
  rainbow: { colorTouch: "every", rankCounts: BASE_RANK_COUNTS },
  black: { colorTouch: "never", rankCounts: SINGLE_RANK_COUNTS },
});

export interface VariantConfig {
  readonly variant: Variant;
  readonly suits: readonly Suit[];
  readonly cluableColors: readonly Suit[];
  rankCountsFor(suit: Suit): Readonly<Record<Rank, number>>;
  colorClueTouches(suit: Suit, clueColor: Suit): boolean;
  rankClueTouches(rank: Rank, clueRank: Rank): boolean;
  suitRule(suit: Suit): SuitRule;
}

function rankClueTouches(rank: Rank, clueRank: Rank): boolean {
  return rank === clueRank;
}

/** Builds a `VariantConfig` for the given suit list, deriving every field
 * generically from `SUIT_RULES` — no per-variant special-casing. */
function buildVariantConfig(variant: Variant, suits: readonly Suit[]): VariantConfig {
  const cluableColors = suits.filter((suit) => SUIT_RULES[suit].colorTouch === "named");

  return Object.freeze({
    variant,
    suits,
    cluableColors,
    rankCountsFor(suit: Suit): Readonly<Record<Rank, number>> {
      return SUIT_RULES[suit].rankCounts;
    },
    colorClueTouches(suit: Suit, clueColor: Suit): boolean {
      const touch = SUIT_RULES[suit].colorTouch;
      if (touch === "named") return suit === clueColor;
      if (touch === "every") return cluableColors.includes(clueColor);
      return false;
    },
    rankClueTouches,
    suitRule(suit: Suit): SuitRule {
      return SUIT_RULES[suit];
    },
  });
}

const RAINBOW_SUITS: readonly Suit[] = [...BASE_SUITS, "rainbow"];
const BLACK_SUITS: readonly Suit[] = [...BASE_SUITS, "rainbow", "black"];

const BASE_CONFIG: VariantConfig = buildVariantConfig("base", BASE_SUITS);
const RAINBOW_CONFIG: VariantConfig = buildVariantConfig("rainbow", RAINBOW_SUITS);
const BLACK_CONFIG: VariantConfig = buildVariantConfig("black", BLACK_SUITS);

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
