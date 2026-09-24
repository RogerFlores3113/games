// Expedition leader computation (Phase 9, Plan 02, XRULE-04). Written
// generically — the Sun absent from every hand for ANY reason falls back
// to the A♠ holder — so Phase 10's Eclipse twist (which removes the Sun
// from play) reuses this function unchanged; core code never names a boss
// id. This function does NOT decide who picks first or leads first;
// createCamp (Plan 04) seeds both from this single value.

import type { Hand } from "./state";

const A_OF_SPADES_RANK = 14;

/** Returns the seatId of the hand containing the Sun joker; otherwise the
 * seatId of the hand containing the standard A♠ (spec: "If the Sun is not
 * in play (see Eclipse), the holder of A♠ is the leader"); otherwise
 * throws. */
export function leaderFor(hands: readonly Hand[]): string {
  const sunHolder = hands.find((h) =>
    h.cards.some((c) => c.identity.kind === "joker" && c.identity.joker === "sun"),
  );
  if (sunHolder) return sunHolder.seatId;

  const aceOfSpadesHolder = hands.find((h) =>
    h.cards.some(
      (c) => c.identity.kind === "standard" && c.identity.suit === "spades" && c.identity.rank === A_OF_SPADES_RANK,
    ),
  );
  if (aceOfSpadesHolder) return aceOfSpadesHolder.seatId;

  throw new Error("leaderFor: no Sun and no A♠ in any hand — deck is malformed");
}
