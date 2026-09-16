import type { HanabiView, Clue, Suit } from "@games/rules";
import { variantConfig, maxScoreFor, scoreBand } from "@games/rules";

/**
 * D-12 boundary: these four predicates are the ONLY client-side disabling
 * permitted this phase, because they are the only cases the redacted
 * `HanabiView` makes unambiguous — not your turn, no clue tokens left,
 * discard at 8 tokens, and a clue that touches zero visible cards. The
 * engine's `canPlay`/`canDiscard`/`canClue` need the full `HanabiState`,
 * which the client never has (that's the point of redaction), and the
 * complete RULES-11 treatment is Phase 6's. If you find yourself adding a
 * fifth disabling rule here, stop — it was cut.
 *
 * `bandForView` is NOT a client-side re-derivation of the band table: the
 * thresholds live in the engine (D-13) and this module only calls the
 * engine's own `scoreBand`/`maxScoreFor`/`variantConfig` functions.
 */

const MAX_CLUE_TOKENS = 8;

/** Counts how many of a target seat's VISIBLE cards a given clue touches,
 * dispatching through the variant config's own predicates rather than
 * hand-rolling a touch rule in the client. */
export function clueTouchCountForTarget(view: HanabiView, targetSeatId: string, clue: Clue): number {
  const target = view.otherHands.find((hand) => hand.seatId === targetSeatId);
  if (!target) return 0;

  const config = variantConfig(view.variant);
  let count = 0;
  for (const card of target.cards) {
    if (card.hidden) continue; // not visible to us — cannot count it
    if (clue.type === "color") {
      if (config.colorClueTouches(card.suit, clue.value)) count += 1;
    } else {
      if (config.rankClueTouches(card.rank, clue.value)) count += 1;
    }
  }
  return count;
}

export function isPlayDisabled(view: HanabiView): boolean {
  return !view.isYourTurn;
}

export function isDiscardDisabled(view: HanabiView): boolean {
  return !view.isYourTurn || view.clueTokens >= MAX_CLUE_TOKENS;
}

export function isGiveClueDisabled(view: HanabiView, targetSeatId: string, clue: Clue): boolean {
  if (!view.isYourTurn) return true;
  if (view.clueTokens <= 0) return true;
  return clueTouchCountForTarget(view, targetSeatId, clue) === 0;
}

/** The engine's band string for the view's current score and its variant's
 * maximum achievable score — never re-derived client-side. */
export function bandForView(view: HanabiView): string {
  return scoreBand(view.score, maxScoreFor(variantConfig(view.variant)));
}

/** The variant's nameable colours — never includes "rainbow" in the
 * rainbow variant (rainbow is touched by every colour clue but is never
 * itself a nameable clue colour). */
export function cluableColorsForView(view: HanabiView): readonly Suit[] {
  return variantConfig(view.variant).cluableColors;
}
