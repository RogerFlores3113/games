// Eclipse boss twist (Plan 10-12, BOSS-01). PROVISIONAL placeholder (owner
// note, 10-CONTEXT.md, 2026-09-26): too close to The Crew's own "no sun"
// twist. Replacing it later touches only this file plus the Plan 10-14
// catalogue registry line — nothing else names "eclipse".
//
// PITFALL 6 (10-RESEARCH.md): Eclipse's removed-card table is its OWN,
// distinct from deck.ts's base player-count removal table, even though both
// tables "remove more at higher player counts" by coincidence-adjacent
// reasoning. Spec §5.3's stated sizes are 3p->51 (17 each), 4p->52 (13
// each), 5p->50 (10 each); composing the base deck builder with "also strip
// jokers" gives the WRONG sizes (52/50/48) because that base table already
// strips different cards. eclipseDeckFor therefore builds straight from
// buildFullDeck() and never reuses deck.ts's base table.
//
// No isTrump/trickWinner override is needed: eclipseDeckFor drops both
// jokers entirely, so the base isTrump predicate (Sun/Moon only) already
// finds no trump card anywhere in an Eclipse deck, and trickWinner's own
// "no trump play -> highest card of the led suit wins" branch is exactly
// spec §5.3's rule with zero extra code. leaderFor (leader.ts) is also left
// untouched: it already falls back to the A♠ holder whenever no hand holds
// the Sun, for any reason, which is precisely Eclipse's case.

import { buildFullDeck, identitiesEqual } from "../deck";
import type { BossDef } from "./boss-def";
import type { CardIdentity, PlayerCount } from "../state";

/** Eclipse's own removal table (spec §5.3): 3p removes 2♣ only; 4p removes
 * nothing; 5p removes 2♣ and 2♦. Distinct from deck.ts's base player-count
 * removal table. */
export function eclipseRemovedCards(playerCount: PlayerCount): CardIdentity[] {
  if (playerCount === 3) {
    return [{ kind: "standard", suit: "clubs", rank: 2 }];
  }
  if (playerCount === 4) {
    return [];
  }
  return [
    { kind: "standard", suit: "clubs", rank: 2 },
    { kind: "standard", suit: "diamonds", rank: 2 },
  ];
}

/** buildFullDeck() with both jokers and eclipseRemovedCards(playerCount)
 * filtered out: 51/52/50 cards for 3/4/5 players (17/13/10 each). */
export function eclipseDeckFor(playerCount: PlayerCount): CardIdentity[] {
  const removed = eclipseRemovedCards(playerCount);
  return buildFullDeck().filter(
    (card) => card.kind !== "joker" && !removed.some((r) => identitiesEqual(r, card)),
  );
}

export const eclipse: BossDef = {
  id: "eclipse",
  name: "Eclipse",
  text: "The Sun and Moon are out, and the A♠ holder leads.",
  modifiers: {
    deckFor: () => eclipseDeckFor,
  },
};
