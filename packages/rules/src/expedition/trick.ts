// The trick-taking heart of Expedition (Phase 9, Plan 02; hardened Phase 10,
// Plan 01 — WR-03): follow-suit legality and the trick winner are now the
// DEFAULT-PREDICATE case of a generic trump rule. Both trickWinner and
// legalPlaysFor take an optional last `isTrumpFn` parameter (defaulting to
// this file's `isTrump`, i.e. "Sun and Moon are trump"); Phase 10's
// composed rule layers can supply a different predicate (e.g. a boss twist
// that makes a suit trump) and both ranking and follow-suit legality honor
// it uniformly. The Sun-over-Moon precedence and the joker two-card suit
// are the default predicate's specific behavior, not hardcoded in the
// resolvers themselves.
//
// legalPlaysFor is the ONE shared follow-suit resolver: canPlayCard
// (Plan 05), the base legalPlays hook (Plan 04) and any future UI dimming
// must call it, never re-derive follow-suit (RESEARCH.md, T-09-04). The
// trump branch is checked BEFORE the follow-suit filter (RESEARCH Pitfall
// 1): trump cards have no "led suit" and must never fall through a
// `followKey ===` filter.

import type { CardIdentity, ExpeditionCard, TrickPlay } from "./state";

/** plays[0]'s identity, or null when the trick has not started. */
export function ledIdentity(plays: readonly TrickPlay[]): CardIdentity | null {
  return plays.length === 0 ? null : plays[0]!.card.identity;
}

/** True for the Sun and Moon jokers only (the DEFAULT predicate for the
 * §6.1 isTrump hook). Phase 10 composes other predicates on top of this. */
export function isTrump(identity: CardIdentity): boolean {
  return identity.kind === "joker";
}

/** The DEFAULT rank of a card for the §6.1 rankOf hook: Sun beats Moon
 * beats every standard card (ranked by its own rank). A composed rankOf may
 * shift a card's rank, so two plays can tie; a tie goes to the earliest
 * play. */
export function rankOf(card: ExpeditionCard): number {
  const identity = card.identity;
  if (identity.kind === "joker") {
    return identity.joker === "sun" ? 16 : 15;
  }
  return identity.rank;
}

/** The non-trump "suit" a card follows: a standard card's own suit, or the
 * literal string "joker" for either joker (so a non-trump joker still forms
 * its own two-card suit, matching Phase 9's Sun/Moon-follows-itself rule
 * under the default predicate). */
function followKey(identity: CardIdentity): string {
  return identity.kind === "joker" ? "joker" : identity.suit;
}

/** Deep-equality for CardIdentity. Every identity in a single deck is
 * unique, so a hand can never hold two cards equal to this under real play
 * — but legalPlaysFor must still exclude the exact led identity from its
 * own "held trump"/"held other joker" check, since callers may (as fast-
 * check's property suite does) pass the STATIC dealt hand rather than one
 * with the already-played led card already removed. */
function identityEquals(a: CardIdentity, b: CardIdentity): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "joker" && b.kind === "joker" ? a.joker === b.joker : a.kind === "standard" && b.kind === "standard" && a.suit === b.suit && a.rank === b.rank;
}

/** The set of cards in `hand` that are legal to play given `led`, under
 * `isTrumpFn` (defaults to the base Sun/Moon predicate).
 *
 * - led === null (leading): every card in hand is legal.
 * - isTrumpFn(led) is true (a trump was led): the trump cards in hand are
 *   legal; if the hand holds none, the whole hand is legal (void of trump).
 * - Otherwise (a non-trump card was led): the cards in hand whose
 *   followKey matches led's AND that are not trump are legal; if none, the
 *   whole hand is legal (void of that suit, spec §3: "play anything,
 *   including the Sun or Moon").
 *
 * Hand order is preserved in every branch. */
export function legalPlaysFor(
  hand: readonly ExpeditionCard[],
  led: CardIdentity | null,
  isTrumpFn: (identity: CardIdentity) => boolean = isTrump,
): ExpeditionCard[] {
  if (led === null) return [...hand];

  if (isTrumpFn(led)) {
    const trumps = hand.filter((c) => isTrumpFn(c.identity) && !identityEquals(c.identity, led));
    return trumps.length > 0 ? trumps : [...hand];
  }

  const ledKey = followKey(led);
  const sameSuit = hand.filter((c) => !isTrumpFn(c.identity) && followKey(c.identity) === ledKey);
  return sameSuit.length > 0 ? sameSuit : [...hand];
}

/** The winning seatId of a completed trick, under `isTrumpFn` and
 * `rankOfFn` (defaulting to the base Sun/Moon predicate and `rankOf`).
 *
 * - If any play is trump, the trump play with the highest rankOfFn wins
 *   (Sun beats Moon beats a trump standard card, by the default ranks).
 * - Otherwise, among plays whose followKey matches the led card's, the
 *   highest rankOfFn wins.
 * - Equal ranks go to the earliest play.
 *
 * Throws on empty plays, or when the trick is malformed (nothing follows
 * the led card and no trump was played). */
export function trickWinner(
  plays: readonly TrickPlay[],
  isTrumpFn: (identity: CardIdentity) => boolean = isTrump,
  rankOfFn: (card: ExpeditionCard) => number = rankOf,
): string {
  if (plays.length === 0) {
    throw new Error("trickWinner: plays must not be empty");
  }

  const trumpPlays = plays.filter((p) => isTrumpFn(p.card.identity));
  if (trumpPlays.length > 0) {
    let winner = trumpPlays[0]!;
    let bestStrength = rankOfFn(winner.card);
    for (const play of trumpPlays.slice(1)) {
      const strength = rankOfFn(play.card);
      if (strength > bestStrength) {
        bestStrength = strength;
        winner = play;
      }
    }
    return winner.seatId;
  }

  const led = ledIdentity(plays)!;
  const ledKey = followKey(led);

  let winner: TrickPlay | null = null;
  let bestStrength = -Infinity;
  for (const play of plays) {
    if (followKey(play.card.identity) === ledKey) {
      const strength = rankOfFn(play.card);
      if (strength > bestStrength) {
        bestStrength = strength;
        winner = play;
      }
    }
  }

  if (winner === null) {
    throw new Error("trickWinner: malformed trick — no play follows the led suit");
  }
  return winner.seatId;
}
