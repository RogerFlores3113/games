import { buildFullDeck } from "../../deck";
import type { CardIdentity, PlayerCount, Suit } from "../../state";
import { defineMod } from "./mod-def";

/** The order the heat takes the 4s in, until the deck deals evenly. */
const FOURS_ORDER: readonly Suit[] = ["clubs", "diamonds", "hearts", "spades"];

/** No 2s or 3s, then 4s until every seat gets the same number of cards:
 * 45, 44 and 45 cards at 3, 4 and 5 players. */
export function heatDeck(playerCount: PlayerCount): CardIdentity[] {
  const deck = buildFullDeck().filter((card) => card.kind === "joker" || card.rank > 3);
  for (const suit of FOURS_ORDER) {
    if (deck.length % playerCount === 0) break;
    deck.splice(deck.findIndex((card) => card.kind === "standard" && card.suit === suit && card.rank === 4), 1);
  }
  return deck;
}

export const magma = defineMod({
  id: "magma",
  kind: "location",
  name: "Magma pool",
  weight: 1,
  text: "The heat burns off every 2, every 3 and a few 4s, so the camp runs shorter.",
  full: {
    rules: () => ({ deckFor: () => (playerCount) => heatDeck(playerCount) }),
  },
});
