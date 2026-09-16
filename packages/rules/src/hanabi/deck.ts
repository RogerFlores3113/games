// Deterministic, variant-parametrized dealer (D-04/D-18). Reuses shuffle.ts
// UNCHANGED — no new PRNG, no new id scheme — with two Hanabi-specific
// stream names, one for the shuffle order and one for opaque id minting
// (named at their call sites below). Both streams are independent,
// uncorrelated generators derived from the same seed (seedToRngState's own
// guarantee).
//
// WR-01 residual risk (accepted, not re-engineered): shuffle.ts's seeded
// PRNG is scoped to defend against SEED brute-force (128-bit state, matching
// the 128-bit server seed secret) and is explicitly NOT hardened against a
// theoretical PRNG internal-state-recovery attack from observed shuffle
// output. That residual risk is accepted for this project: a cooperative
// game played among trusted friends with no adversarial incentive to try to
// predict undealt cards. This closes WR-01 by documentation rather than by
// swapping the generator. Revisit before this deployment ever serves public
// rooms, where the trust assumption above no longer holds.
//
// Every card id in a deal is minted up front, in one pass over the whole
// shuffled deck, rather than carrying an idRng field inside HanabiState (the
// forehead-card toy's approach). This is deliberate: once dealing is done,
// draws need no further RNG, so HanabiState never carries any PRNG state at
// all — there is nothing a projection bug could leak, because there is
// nothing to leak (T-03-01).

import { mintCardId, seedToRngState, shuffleWithSeed } from "../shuffle";
import { RANKS, handSizeFor, type Rank, type Suit, type VariantConfig } from "./variant";
import type { Hand, HandSlot, HanabiCard } from "./state";

type UnmintedCard = { readonly suit: Suit; readonly rank: Rank };

/** Builds the ordered, unshuffled card list for a variant. Every suit and
 * every per-suit rank count comes from `config` — nothing here names a
 * specific suit or a specific deck-size literal. */
export function buildDeck(config: VariantConfig): UnmintedCard[] {
  const cards: UnmintedCard[] = [];
  for (const suit of config.suits) {
    const counts = config.rankCountsFor(suit);
    for (const rank of RANKS) {
      const count = counts[rank];
      for (let i = 0; i < count; i++) {
        cards.push({ suit, rank });
      }
    }
  }
  return cards;
}

function initialFacts(config: VariantConfig) {
  return {
    possibleSuits: config.suits,
    possibleRanks: RANKS,
    positiveClues: [],
    negativeClues: [],
  };
}

/** Shuffles a fresh deck for `config`, mints every card's opaque id up
 * front, and deals hands round-robin (one card per seat per round, matching
 * how a physical deck is actually dealt) until every seat holds
 * `handSizeFor(seatIds.length)` cards. The remainder is the draw deck, with
 * index 0 as the next card to draw. Same (config, seatIds, seed) always
 * produces a deep-equal result (RULES-19). */
export function dealInitialHands(input: {
  config: VariantConfig;
  seatIds: readonly string[];
  seed: string;
}): { hands: Hand[]; deck: HanabiCard[] } {
  const { config, seatIds, seed } = input;

  const unminted = shuffleWithSeed(buildDeck(config), seed, "hanabi-deck");

  let idRng = seedToRngState(seed, "hanabi-card-ids");
  const takenIds = new Set<string>();
  const idCards: HanabiCard[] = [];
  for (const card of unminted) {
    const minted = mintCardId(idRng, takenIds);
    idRng = minted.rng;
    takenIds.add(minted.id);
    idCards.push({ id: minted.id, suit: card.suit, rank: card.rank });
  }

  const handSize = handSizeFor(seatIds.length);
  const perSeatSlots: HandSlot[][] = seatIds.map(() => []);
  let cardIndex = 0;
  for (let round = 0; round < handSize; round++) {
    for (let seatIndex = 0; seatIndex < seatIds.length; seatIndex++) {
      const card = idCards[cardIndex]!;
      cardIndex++;
      perSeatSlots[seatIndex]!.push({ card, facts: initialFacts(config) });
    }
  }

  const hands: Hand[] = seatIds.map((seatId, i) => ({
    seatId,
    slots: perSeatSlots[i]!,
  }));

  const deck = idCards.slice(cardIndex);

  return { hands, deck };
}
