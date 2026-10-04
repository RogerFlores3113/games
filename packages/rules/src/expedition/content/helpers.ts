// Pure helpers shared by catalogue effects.

import { identitiesEqual } from "../deck";
import { rankOf } from "../trick";
import type { CampState, CardIdentity, TrickPlay } from "../state";
import type { CoreRules } from "../rules";
import type { RuleModifier } from "../run/run-rules";
import type { RunState } from "../run/types";

/** The previous trickWinner, decided as if the excluded plays were never
 * made, for the same led identity. When stacked effects have already
 * excluded every other play, this exclusion is ignored, so `prev` never sees
 * an empty trick and always names a seat that played (WR-05). */
export function winnerExcluding(
  prev: CoreRules["trickWinner"],
  plays: readonly TrickPlay[],
  led: CardIdentity,
  excluded: (play: TrickPlay) => boolean,
): string {
  const eligible = plays.filter((play) => !excluded(play));
  return prev(eligible.length > 0 ? eligible : plays, led);
}

/** The seat whose card of the led suit has the lowest printed rank. A joker
 * lead makes the jokers the led suit. With no card of the led suit kept,
 * the lowest card wins. */
export function lowestOfLedSuit(plays: readonly TrickPlay[], led: CardIdentity): string {
  const matching = plays.filter((play) => {
    const identity = play.card.identity;
    return led.kind === "joker" ? identity.kind === "joker" : identity.kind === "standard" && identity.suit === led.suit;
  });
  const following = matching.length > 0 ? matching : plays;
  return following.reduce((low, play) => (rankOf(play.card) < rankOf(low.card) ? play : low)).seatId;
}

/** True while some objective-deck identity is still in a hand, so a failed
 * objective can become a fresh win-card objective. */
export function freshObjectiveAvailable(camp: CampState | null): boolean {
  if (camp === null) return false;
  return camp.objectiveDeck.some((identity) => camp.hands.some((hand) => hand.cards.some((card) => identitiesEqual(card.identity, identity))));
}

/** True when the seat holds a pending objective in this camp. */
export function hasPendingObjective(camp: CampState, seatId: string, rules: CoreRules): boolean {
  return camp.objectives.some((o) => o.ownerSeatId === seatId && rules.objectiveStatus(camp, o) === "pending");
}

/** This attempt's whispers by `fromSeatId` that named `toSeatId`. */
export function whisperedTo(run: RunState, fromSeatId: string, toSeatId: string): boolean {
  return (run.attempt?.log ?? []).some(
    (entry) => entry.event === "whisper" && entry.actorSeatId === fromSeatId && entry.subjectSeatIds.includes(toSeatId),
  );
}

/** A layer granting `seatId`, or every seat when null, one more whisper. */
export function extraWhisper(seatId: string | null): RuleModifier {
  return {
    whispersPerCamp: (prev) => (run, who) => prev(run, who) + (seatId === null || who === seatId ? 1 : 0),
  };
}

/** A layer that makes one card count as `rank` while `seatId` holds it or
 * after `seatId` played it. A card that moves to another hand reads its
 * printed rank there, so the private change neither follows nor leaks. */
export function shiftedRank(run: RunState, seatId: string, cardId: string, rank: number): RuleModifier {
  const camp = run.attempt?.camp ?? null;
  if (camp === null || !heldOrPlayedBy(camp, seatId, cardId)) return {};
  return { rankOf: (prev) => (card) => (card.id === cardId ? rank : prev(card)) };
}

function heldOrPlayedBy(camp: CampState, seatId: string, cardId: string): boolean {
  const held = camp.hands.some((hand) => hand.seatId === seatId && hand.cards.some((card) => card.id === cardId));
  const plays = [...camp.completedTricks.flatMap((trick) => trick.plays), ...camp.currentTrick.plays];
  return held || plays.some((play) => play.seatId === seatId && play.card.id === cardId);
}
