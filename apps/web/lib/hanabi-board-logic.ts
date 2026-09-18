import type { HanabiView, Clue, Suit } from "@games/rules";
import { variantConfig, maxScoreFor, scoreBand, MAX_FUSES } from "@games/rules";

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
 *
 * D-17 (Phase 6): `clueTouchIdsForTarget` adds the ids form of the existing
 * `clueTouchCountForTarget`; it is still no new disabling rule in this file —
 * `clueTouchCountForTarget` is now defined in terms of it so there is one
 * touch rule, not two independently-maintained ones.
 */

const MAX_CLUE_TOKENS = 8;

/** Returns exactly the ids of a target seat's VISIBLE cards a given clue
 * would touch, dispatching through the variant config's own predicates
 * rather than hand-rolling a touch rule in the client. Hidden cards are
 * never included (we cannot know their identity to judge them), and an
 * unknown target seat returns []. */
export function clueTouchIdsForTarget(view: HanabiView, targetSeatId: string, clue: Clue): string[] {
  const target = view.otherHands.find((hand) => hand.seatId === targetSeatId);
  if (!target) return [];

  const config = variantConfig(view.variant);
  const ids: string[] = [];
  for (const card of target.cards) {
    if (card.hidden) continue; // not visible to us — cannot judge it
    if (clue.type === "color") {
      if (config.colorClueTouches(card.suit, clue.value)) ids.push(card.id);
    } else {
      if (config.rankClueTouches(card.rank, clue.value)) ids.push(card.id);
    }
  }
  return ids;
}

/** Counts how many of a target seat's VISIBLE cards a given clue touches. */
export function clueTouchCountForTarget(view: HanabiView, targetSeatId: string, clue: Clue): number {
  return clueTouchIdsForTarget(view, targetSeatId, clue).length;
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

/** `view.fuses` counts fuses USED on the wire (engine/schema semantics are
 * unchanged by this helper). This converts it to fuses remaining for
 * display only, the same kind of view-derived value as `bandForView`. */
export function fusesRemainingForView(view: HanabiView): number {
  return MAX_FUSES - view.fuses;
}

/** D-07: whether a seat is connected, per the server's already-redacted
 * `view.seats[].connected` flag. An unknown seat (not found in `seats`) is
 * treated as connected — the server view always includes every seat, so a
 * missing entry is never a real signal and must never render a false
 * "disconnected" alarm. */
export function isSeatConnected(
  seats: ReadonlyArray<{ seatId: string; connected: boolean }>,
  seatId: string,
): boolean {
  const seat = seats.find((s) => s.seatId === seatId);
  return seat === undefined ? true : seat.connected;
}

/** D-07/D-08: the turn indicator's exact copy. Display only — nothing here
 * changes whose turn it is or what actions are legal; a disconnected active
 * player still simply "waits," per D-08 (no skip, no auto-action). */
export function turnIndicatorText(
  game: Pick<HanabiView, "isYourTurn" | "activeSeatId">,
  seats: ReadonlyArray<{ seatId: string; connected: boolean }>,
  labelFor: (seatId: string) => string,
  ended = false,
): string {
  // WR-02: the engine advances turnIndex on the game-ending action too, so
  // an ended game's isYourTurn/activeSeatId name a turn that never comes.
  if (ended) {
    return "Game over";
  }
  if (game.isYourTurn) {
    return "Your turn";
  }
  const name = labelFor(game.activeSeatId);
  const connected = isSeatConnected(seats, game.activeSeatId);
  return connected ? `Waiting for ${name}` : `Waiting for ${name} — disconnected`;
}

/** UAT gap 37 (06.2, seventh owner review): the board-level "turn sign" copy
 * — a separate, larger-scale announcement from `turnIndicatorText`'s
 * existing small own-hand label, placed in the freed space below the
 * discard/token area (see Table.tsx). Reads "{name}'s turn" for a
 * teammate's turn, "Your turn!" for the viewer's own turn, and an empty
 * string once the game has ended — it must never claim it is anyone's turn
 * after the game is over, matching `turnIndicatorText`'s own `ended` rule. */
export function turnSignText(
  game: Pick<HanabiView, "isYourTurn" | "activeSeatId">,
  labelFor: (seatId: string) => string,
  ended = false,
): string {
  if (ended) return "";
  if (game.isYourTurn) return "Your turn!";
  return `${labelFor(game.activeSeatId)}'s turn`;
}

/** The variant's nameable colours — never includes "rainbow" in the
 * rainbow variant (rainbow is touched by every colour clue but is never
 * itself a nameable clue colour). */
export function cluableColorsForView(view: HanabiView): readonly Suit[] {
  return variantConfig(view.variant).cluableColors;
}
