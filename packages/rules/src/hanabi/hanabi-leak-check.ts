// D-21/WR-03: this checker generalizes forehead-card-leak-check.ts's
// recursive structural walk for Hanabi. Hanabi identities are the integers
// 1-5 and a small suit vocabulary, which legitimately collide with clue
// tokens, fuses, scores and stack heights, so a raw substring scan for a
// rank would produce both false positives (a fuse count of "3" is not a
// leaked rank) and false negatives (a leaked rank can be re-encoded any
// number of ways). Detection is therefore STRUCTURAL (key presence on
// own-hand and own-id-bearing objects, via the `in` operator — never
// truthiness, since JSON.stringify drops undefined-valued keys) PLUS a
// TYPED MULTISET comparison (an excess count of a {suit,rank} pair proves a
// leak; duplicate identities legitimately exist in a Hanabi deck, so only an
// excess count is meaningful). Raw-string scanning is retained ONLY for the
// server seed (D-14), which cannot legitimately appear in any view.
//
// Type-only import from "./state"/"./variant" — this module stays
// zero-runtime-dependency, per packages/rules' FDN-02 rule.

import type { HanabiState } from "./state";
import type { Rank, Suit } from "./variant";

export interface HanabiSeatSecrets {
  /** The viewer's own cards — identity that must never appear in their view. */
  readonly ownCards: readonly { readonly id: string; readonly suit: Suit; readonly rank: Rank }[];
  /** The {suit,rank} pairs the viewer MAY legitimately see (other seats'
   * hands, the discard pile, played stacks), as a multiset of "suit:rank"
   * keys. */
  readonly allowedIdentityCounts: Readonly<Record<string, number>>;
  /** Raw strings that must never appear in the serialized view (the server
   * seed). */
  readonly forbiddenTokens: readonly string[];
}

function identityKey(suit: unknown, rank: unknown): string {
  return `${String(suit)}:${String(rank)}`;
}

/** Derives the secrets a given seat's view must never leak: its own cards'
 * identities, and the multiset of {suit,rank} pairs it MAY legitimately see
 * elsewhere (every other seat's hand, the whole discard pile, one entry per
 * played card implied by each stack's topRank). `ownCards` is empty for a
 * seat that is not (or no longer) seated. */
export function secretsForHanabiSeat(
  state: HanabiState,
  seatId: string,
  seed?: string,
): HanabiSeatSecrets {
  const hand = state.hands.find((h) => h.seatId === seatId);
  const ownCards =
    hand === undefined
      ? []
      : hand.slots.map((slot) => ({ id: slot.card.id, suit: slot.card.suit, rank: slot.card.rank }));

  const counts: Record<string, number> = {};
  const bump = (suit: Suit, rank: Rank): void => {
    const key = identityKey(suit, rank);
    counts[key] = (counts[key] ?? 0) + 1;
  };

  for (const otherHand of state.hands) {
    if (otherHand.seatId === seatId) continue;
    for (const slot of otherHand.slots) bump(slot.card.suit, slot.card.rank);
  }
  for (const card of state.discard) bump(card.suit, card.rank);
  for (const stack of state.stacks) {
    for (let rank = 1; rank <= stack.topRank; rank++) bump(stack.suit, rank as Rank);
  }

  const forbiddenTokens = seed !== undefined ? [seed] : [];

  return { ownCards, allowedIdentityCounts: counts, forbiddenTokens };
}

/** Recursively walks `subtree`, collecting structural leak reasons. Uses the
 * `in` operator (key presence), never a truthiness/undefined comparison —
 * JSON.stringify silently drops undefined-valued keys, so a truthiness
 * check would miss a card built with `suit: undefined` instead of correctly
 * omitted. `inYourHand` tracks whether the current subtree is reachable
 * under a `yourHand` key (propagated to every nested object once set). */
function walkStructural(
  subtree: unknown,
  secrets: HanabiSeatSecrets,
  reasons: Set<string>,
  inYourHand: boolean,
): void {
  if (Array.isArray(subtree)) {
    for (const item of subtree) walkStructural(item, secrets, reasons, inYourHand);
    return;
  }
  if (subtree === null || typeof subtree !== "object") return;

  const obj = subtree as Record<string, unknown>;
  const hasIdentityKey = "suit" in obj || "rank" in obj;

  if (inYourHand && hasIdentityKey) {
    reasons.add("structural:your-hand-entry-has-identity");
  }
  if (obj.hidden === true && hasIdentityKey) {
    reasons.add("structural:hidden-card-has-identity");
  }
  if (
    typeof obj.id === "string" &&
    secrets.ownCards.some((card) => card.id === obj.id) &&
    hasIdentityKey
  ) {
    reasons.add("structural:own-card-id-has-identity");
  }

  for (const [key, value] of Object.entries(obj)) {
    walkStructural(value, secrets, reasons, inYourHand || key === "yourHand");
  }
}

/** Separate pass (per D-21): collects every object reachable in `subtree`
 * that carries BOTH a `suit` and a `rank` key (both `in`-checked) into a
 * multiset keyed `"{suit}:{rank}"`. Duplicate identities legitimately exist
 * in a Hanabi deck, so raw presence proves nothing — only an observed count
 * that EXCEEDS `secrets.allowedIdentityCounts` proves a leak. */
function collectIdentityCounts(subtree: unknown, counts: Map<string, number>): void {
  if (Array.isArray(subtree)) {
    for (const item of subtree) collectIdentityCounts(item, counts);
    return;
  }
  if (subtree === null || typeof subtree !== "object") return;

  const obj = subtree as Record<string, unknown>;
  if ("suit" in obj && "rank" in obj) {
    const key = identityKey(obj.suit, obj.rank);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  for (const value of Object.values(obj)) {
    collectIdentityCounts(value, counts);
  }
}

/** Checks a projected Hanabi view for leaks of `secrets`: structurally (own
 * hand / hidden / own-id key presence, walked recursively over the
 * pre-stringify object), by typed multiset (an excess {suit,rank} count),
 * and via a raw substring scan of `serialized` for forbidden tokens (the
 * seed). Returns an empty array when clean. Reasons are deduplicated, in
 * first-seen order. */
export function checkHanabiViewForLeaks(input: {
  view: unknown;
  serialized: string;
  secrets: HanabiSeatSecrets;
}): string[] {
  const reasons = new Set<string>();
  walkStructural(input.view, input.secrets, reasons, false);

  const counts = new Map<string, number>();
  collectIdentityCounts(input.view, counts);
  for (const [key, count] of counts.entries()) {
    const allowed = input.secrets.allowedIdentityCounts[key] ?? 0;
    if (count > allowed) {
      reasons.add(`typed:identity-count-exceeded:${key}`);
    }
  }

  for (const token of input.secrets.forbiddenTokens) {
    if (token.length === 0) continue;
    if (input.serialized.includes(token)) {
      reasons.add(`string:forbidden-token:${token}`);
    }
  }

  return [...reasons];
}
