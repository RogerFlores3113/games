// The trick-taking heart of Expedition. Follow-suit legality and the trick
// winner read every card through a CardReading: what the card counts as
// (identityOf), whether that identity is trump (isTrump) and its strength
// (rankOf). The printed reading makes the Sun and Moon trump; composed rule
// layers supply other readings and both resolvers honor them uniformly
// (WR-03).
//
// legalPlaysFor is the ONE shared follow-suit resolver: canPlayCard, the
// base legalPlays hook and any UI dimming must call it, never re-derive
// follow-suit (T-09-04). The trump branch is checked BEFORE the follow-suit
// filter (RESEARCH Pitfall 1): trump cards have no "led suit" and must never
// fall through a `followKey ===` filter.
//
// resolveTrick is the one place a completed trick is resolved: the led
// identity is read from the lead, burned plays leave the trick, and the
// winner is decided among the plays kept. A trick is resolved once; no rule
// re-resolves history.

import type { CardIdentity, ExpeditionCard, ResolvedPlay, TrickPlay } from "./state";

/** True for the Sun and Moon jokers only (the DEFAULT predicate for the
 * isTrump hook). */
export function isTrump(identity: CardIdentity): boolean {
  return identity.kind === "joker";
}

/** The DEFAULT strength of an identity: Sun beats Moon beats every standard
 * card (ranked by its own rank). */
export function identityRank(identity: CardIdentity): number {
  if (identity.kind === "joker") {
    return identity.joker === "sun" ? 16 : 15;
  }
  return identity.rank;
}

/** A card's printed strength. A composed rankOf may shift a card's rank, so
 * two plays can tie; a tie goes to the earliest play. */
export function rankOf(card: ExpeditionCard): number {
  return identityRank(card.identity);
}

/** How the rules read a card. */
export type CardReading = {
  readonly identityOf: (card: ExpeditionCard) => CardIdentity;
  readonly isTrump: (identity: CardIdentity) => boolean;
  readonly rankOf: (card: ExpeditionCard) => number;
};

/** A reading with the given parts; the default rankOf reads the strength of
 * what the card counts as, so an identityOf change moves its rank too. */
export function cardReading(parts: Partial<CardReading> = {}): CardReading {
  const identityOf = parts.identityOf ?? ((card: ExpeditionCard) => card.identity);
  return {
    identityOf,
    isTrump: parts.isTrump ?? isTrump,
    rankOf: parts.rankOf ?? ((card) => identityRank(identityOf(card))),
  };
}

export const PRINTED: CardReading = cardReading();

/** The non-trump "suit" an identity follows: a standard card's own suit, or
 * "joker" for either joker, so a non-trump joker still forms its own
 * two-card suit. */
function followKey(identity: CardIdentity): string {
  return identity.kind === "joker" ? "joker" : identity.suit;
}

function identityEquals(a: CardIdentity, b: CardIdentity): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "joker" && b.kind === "joker" ? a.joker === b.joker : a.kind === "standard" && b.kind === "standard" && a.suit === b.suit && a.rank === b.rank;
}

/** The cards in `hand` that are legal to play given the `led` identity.
 *
 * - led === null (leading): every card in hand is legal.
 * - a trump was led: the trump cards in hand are legal; void of trump, the
 *   whole hand is.
 * - otherwise: the non-trump cards following the led suit are legal; void
 *   of that suit, the whole hand is ("play anything, including the Sun or
 *   Moon").
 *
 * A card equal to the led identity is never counted as a held trump, since
 * callers may pass a hand that still holds the led card. Hand order is
 * preserved in every branch. */
export function legalPlaysFor(hand: readonly ExpeditionCard[], led: CardIdentity | null, reading: CardReading = PRINTED): ExpeditionCard[] {
  if (led === null) return [...hand];

  if (reading.isTrump(led)) {
    const trumps = hand.filter((c) => {
      const identity = reading.identityOf(c);
      return reading.isTrump(identity) && !identityEquals(identity, led);
    });
    return trumps.length > 0 ? trumps : [...hand];
  }

  const ledKey = followKey(led);
  const sameSuit = hand.filter((c) => {
    const identity = reading.identityOf(c);
    return !reading.isTrump(identity) && followKey(identity) === ledKey;
  });
  return sameSuit.length > 0 ? sameSuit : [...hand];
}

/** The strongest play by rankOf; equal strength goes to the earliest. */
function strongest(plays: readonly TrickPlay[], reading: CardReading): TrickPlay {
  let winner = plays[0]!;
  let best = reading.rankOf(winner.card);
  for (const play of plays.slice(1)) {
    const strength = reading.rankOf(play.card);
    if (strength > best) {
      best = strength;
      winner = play;
    }
  }
  return winner;
}

/** The winning seat among `plays` for the `led` identity: the highest trump;
 * else the highest card following `led`; else the highest card. Equal
 * strength goes to the earliest play. Throws on empty plays. */
export function trickWinner(plays: readonly TrickPlay[], led: CardIdentity, reading: CardReading = PRINTED): string {
  if (plays.length === 0) {
    throw new Error("trickWinner: plays must not be empty");
  }
  const trumps = plays.filter((p) => reading.isTrump(reading.identityOf(p.card)));
  if (trumps.length > 0) return strongest(trumps, reading).seatId;

  const ledKey = followKey(led);
  const following = plays.filter((p) => followKey(reading.identityOf(p.card)) === ledKey);
  return strongest(following.length > 0 ? following : plays, reading).seatId;
}

/** The hooks resolveTrick reads. */
export type TrickRules = {
  identityOf(card: ExpeditionCard): CardIdentity;
  trickWinner(plays: readonly TrickPlay[], led: CardIdentity): string;
  burns(plays: readonly TrickPlay[], led: CardIdentity, winnerOf: (plays: readonly TrickPlay[]) => string): readonly string[];
};

/** Resolves a full trick: the led identity is what the lead counts as, the
 * plays `burns` names leave the trick, and the winner is decided among the
 * plays kept. Burning a card that was not played, burning every play, or a
 * winner outside the kept plays is a composition defect and throws (A3). */
export function resolveTrick(plays: readonly TrickPlay[], rules: TrickRules): { readonly plays: readonly ResolvedPlay[]; readonly winnerSeatId: string } {
  const led = rules.identityOf(plays[0]!.card);
  const burnedIds = rules.burns(plays, led, (p) => rules.trickWinner(p, led));
  for (const id of burnedIds) {
    if (!plays.some((p) => p.card.id === id)) throw new Error(`resolveTrick: burns named ${id}, which was not played`);
  }
  const kept = plays.filter((p) => !burnedIds.includes(p.card.id));
  if (kept.length === 0) throw new Error("resolveTrick: burns removed every play");
  const winnerSeatId = rules.trickWinner(kept, led);
  if (!kept.some((p) => p.seatId === winnerSeatId)) {
    throw new Error(`resolveTrick: trickWinner returned ${winnerSeatId}, which has no kept play`);
  }
  return {
    plays: plays.map((p) => {
      const identity = rules.identityOf(p.card);
      return { seatId: p.seatId, card: p.card, countsAs: identityEquals(identity, p.card.identity) ? null : identity, burned: burnedIds.includes(p.card.id) };
    }),
    winnerSeatId,
  };
}
