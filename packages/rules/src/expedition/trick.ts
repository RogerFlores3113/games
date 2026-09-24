// The trick-taking heart of Expedition (Phase 9, Plan 02): follow-suit
// legality including the Sun/Moon two-card joker suit, and the trick
// winner with joker precedence. Base-layer implementations of spec §6.1's
// isTrump/trickWinner hooks and the pure hand-level legalPlays resolver.
//
// legalPlaysFor is the ONE shared follow-suit resolver: canPlayCard
// (Plan 05), the base legalPlays hook (Plan 04) and any future UI dimming
// must call it, never re-derive follow-suit (RESEARCH.md, T-09-04). The
// joker branch is checked BEFORE the suit filter (RESEARCH Pitfall 1):
// jokers have no suit and must never fall through a `suit ===` filter.

import type { CardIdentity, ExpeditionCard, TrickPlay } from "./state";

/** plays[0]'s identity, or null when the trick has not started. */
export function ledIdentity(plays: readonly TrickPlay[]): CardIdentity | null {
  return plays.length === 0 ? null : plays[0]!.card.identity;
}

/** True for the Sun and Moon jokers only (base layer of the §6.1 isTrump
 * hook). */
export function isTrump(identity: CardIdentity): boolean {
  return identity.kind === "joker";
}

/** The set of cards in `hand` that are legal to play given `led`.
 *
 * - led === null (leading): every card in hand is legal.
 * - led is a joker: if hand holds the OTHER joker, that card alone is
 *   legal (spec §3: the Sun/Moon joker suit forces its holder to follow);
 *   otherwise (void of the other joker) the whole hand is legal.
 * - led is standard: cards whose identity is standard with the led suit;
 *   if the hand holds none (void), the whole hand is legal, including the
 *   Sun and Moon (spec §3: "If you can't, play anything, including the
 *   Sun or Moon").
 *
 * Hand order is preserved in every branch. */
export function legalPlaysFor(
  hand: readonly ExpeditionCard[],
  led: CardIdentity | null,
): ExpeditionCard[] {
  if (led === null) return [...hand];

  if (led.kind === "joker") {
    const otherJoker = led.joker === "sun" ? "moon" : "sun";
    const holds = hand.find((c) => c.identity.kind === "joker" && c.identity.joker === otherJoker);
    return holds ? [holds] : [...hand];
  }

  const sameSuit = hand.filter((c) => c.identity.kind === "standard" && c.identity.suit === led.suit);
  return sameSuit.length > 0 ? sameSuit : [...hand];
}

/** The winning seatId of a completed trick. Sun play wins, else Moon play,
 * else the highest rank among plays whose identity is standard with the
 * led suit. Jokers are checked FIRST (RESEARCH Pitfall 2): a joker must
 * never be compared by rank. Throws on empty plays. */
export function trickWinner(plays: readonly TrickPlay[]): string {
  if (plays.length === 0) {
    throw new Error("trickWinner: plays must not be empty");
  }

  const sunPlay = plays.find((p) => p.card.identity.kind === "joker" && p.card.identity.joker === "sun");
  if (sunPlay) return sunPlay.seatId;

  const moonPlay = plays.find((p) => p.card.identity.kind === "joker" && p.card.identity.joker === "moon");
  if (moonPlay) return moonPlay.seatId;

  const led = ledIdentity(plays);
  // Reachable only when led is standard: if led were a joker it would be
  // the Sun or Moon and would already have been returned above.
  if (led === null || led.kind !== "standard") {
    throw new Error("trickWinner: malformed trick — no Sun/Moon play and no standard led identity");
  }
  const ledSuit = led.suit;

  let winner: TrickPlay | null = null;
  let bestRank = -1;
  for (const play of plays) {
    const identity = play.card.identity;
    if (identity.kind === "standard" && identity.suit === ledSuit && identity.rank > bestRank) {
      bestRank = identity.rank;
      winner = play;
    }
  }

  if (winner === null) {
    throw new Error("trickWinner: malformed trick — no play follows the led suit");
  }
  return winner.seatId;
}
