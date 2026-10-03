// Expedition deck module (Phase 9, Plan 01). Reuses shuffle.ts UNCHANGED —
// no new PRNG, no new id scheme — with Expedition-only stream names
// ("expedition-deck", "expedition-card-ids", "expedition-objective-deck"),
// independent uncorrelated generators derived from the same seed
// (seedToRngState's own guarantee, same pattern as hanabi/deck.ts).
//
// Every card id is minted up front, in one pass over the whole shuffled
// deck. No PRNG state is returned or stored anywhere in this module's
// outputs, so a projection bug has nothing to leak (T-09-01).

import { mintCardId, seedToRngState, shuffleWithSeed } from "../shuffle";
import type { CardIdentity, ExpeditionCard, Hand, PlayerCount, StandardIdentity, StandardRank, Suit } from "./state";

export const SUITS: readonly Suit[] = ["spades", "hearts", "diamonds", "clubs"] as const;

export const STANDARD_RANKS: readonly StandardRank[] = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
] as const;

export const RANK_ACE: StandardRank = 14;

function isStandard(identity: CardIdentity): identity is StandardIdentity {
  return identity.kind === "standard";
}

/** Structural equality; joker vs standard never equal. */
export function identitiesEqual(a: CardIdentity, b: CardIdentity): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "joker" && b.kind === "joker") return a.joker === b.joker;
  if (a.kind === "standard" && b.kind === "standard") {
    return a.suit === b.suit && a.rank === b.rank;
  }
  return false;
}

const RANK_LABELS: Record<StandardRank, string> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

/** Cheap seam for the Phase 12 test bridge ids like hand:Q♥. */
export function cardLabel(identity: CardIdentity): string {
  if (identity.kind === "joker") {
    return identity.joker === "sun" ? "Sun" : "Moon";
  }
  return `${RANK_LABELS[identity.rank]}${SUIT_SYMBOLS[identity.suit]}`;
}

/** For each suit in SUITS, ranks ascending, then Sun, then Moon. */
export function buildFullDeck(): CardIdentity[] {
  const deck: CardIdentity[] = [];
  for (const suit of SUITS) {
    for (const rank of STANDARD_RANKS) {
      deck.push({ kind: "standard", suit, rank });
    }
  }
  deck.push({ kind: "joker", joker: "sun" });
  deck.push({ kind: "joker", joker: "moon" });
  return deck;
}

export function assertPlayerCount(n: number): PlayerCount {
  if (n === 3 || n === 4 || n === 5) return n;
  throw new Error(`Expedition supports 3-5 players, got ${n}`);
}

/** 3: []; 4: [2 clubs, 2 diamonds]; 5: [2 clubs, 2 diamonds, 2 hearts, 2
 * spades] (spec §3: "4 players: remove 2♣ 2♦"). */
export function removedCardsFor(playerCount: PlayerCount): CardIdentity[] {
  if (playerCount === 3) return [];
  if (playerCount === 4) {
    return [
      { kind: "standard", suit: "clubs", rank: 2 },
      { kind: "standard", suit: "diamonds", rank: 2 },
    ];
  }
  return [
    { kind: "standard", suit: "clubs", rank: 2 },
    { kind: "standard", suit: "diamonds", rank: 2 },
    { kind: "standard", suit: "hearts", rank: 2 },
    { kind: "standard", suit: "spades", rank: 2 },
  ];
}

/** buildFullDeck() filtered to exclude removedCardsFor(playerCount). This is
 * the base-layer implementation of the §6.1 deckFor hook; it must never
 * reference a boss or source id. */
export function baseDeckFor(playerCount: PlayerCount): CardIdentity[] {
  const removed = removedCardsFor(playerCount);
  return buildFullDeck().filter((card) => !removed.some((r) => identitiesEqual(r, card)));
}

/** buildFullDeck() entries not present in deck (the public removed-cards
 * list; generic so a future deckFor override yields the right removed list
 * automatically). */
export function complementOf(deck: readonly CardIdentity[]): CardIdentity[] {
  return buildFullDeck().filter((card) => !deck.some((c) => identitiesEqual(c, card)));
}

/** Deals hands round-robin (card i goes to seat i % seatCount), shuffling
 * with shuffleWithSeed and minting ids via mintCardId (copies
 * hanabi/deck.ts's loop). Same (seatIds, seed, deck) always produces a
 * deep-equal result. */
export function dealHands(input: {
  seatIds: readonly string[];
  seed: string;
  deck: readonly CardIdentity[];
}): { hands: Hand[]; handSize: number } {
  const { seatIds, seed, deck } = input;
  assertPlayerCount(seatIds.length);
  if (deck.length % seatIds.length !== 0) {
    throw new Error(
      `Expedition deck length ${deck.length} is not divisible by seat count ${seatIds.length}`,
    );
  }

  const shuffled = shuffleWithSeed(deck, seed, "expedition-deck");

  let idRng = seedToRngState(seed, "expedition-card-ids");
  const takenIds = new Set<string>();
  const idCards: ExpeditionCard[] = [];
  for (const identity of shuffled) {
    const minted = mintCardId(idRng, takenIds);
    idRng = minted.rng;
    takenIds.add(minted.id);
    idCards.push({ id: minted.id, identity });
  }

  const handSize = deck.length / seatIds.length;
  const perSeatCards: ExpeditionCard[][] = seatIds.map(() => []);
  for (let i = 0; i < idCards.length; i++) {
    const seatIndex = i % seatIds.length;
    perSeatCards[seatIndex]!.push(idCards[i]!);
  }

  const hands: Hand[] = seatIds.map((seatId, i) => ({
    seatId,
    cards: perSeatCards[i]!,
  }));

  return { hands, handSize };
}

/** Filters deck to standard identities (drops Sun/Moon), then shuffles on
 * its own stream (spec §3: "a second, separately shuffled deck of the same
 * card identities as the play deck, minus removed cards and minus the Sun
 * and Moon"). */
export function buildObjectiveDeck(input: {
  deck: readonly CardIdentity[];
  seed: string;
}): StandardIdentity[] {
  const { deck, seed } = input;
  const standardOnly = deck.filter(isStandard);
  return shuffleWithSeed(standardOnly, seed, "expedition-objective-deck");
}
