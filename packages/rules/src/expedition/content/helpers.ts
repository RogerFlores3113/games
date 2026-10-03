// Pure helpers shared by catalogue effects.

import { identitiesEqual } from "../deck";
import { evaluateObjective } from "../objectives";
import { rankOf } from "../trick";
import type { CampState, TrickPlay } from "../state";
import type { RuleModifier } from "../run/run-rules";
import type { RunState } from "../run/types";

/** The previous trickWinner, decided as if the excluded plays were never
 * made. A trick has 3 to 5 plays and an effect excludes one, so `prev`
 * always sees a non-empty trick and names a seat that played (WR-05). */
export function winnerExcluding(
  prev: (plays: readonly TrickPlay[]) => string,
  plays: readonly TrickPlay[],
  excluded: (play: TrickPlay) => boolean,
): string {
  return prev(plays.filter((play) => !excluded(play)));
}

/** The seat whose card of the led suit has the lowest printed rank. A joker
 * lead makes the jokers the led suit. */
export function lowestOfLedSuit(plays: readonly TrickPlay[]): string {
  const led = plays[0]!.card.identity;
  const following = plays.filter((play) => {
    const identity = play.card.identity;
    return led.kind === "joker" ? identity.kind === "joker" : identity.kind === "standard" && identity.suit === led.suit;
  });
  return following.reduce((low, play) => (rankOf(play.card) < rankOf(low.card) ? play : low)).seatId;
}

/** True while some objective-deck identity is still in a hand, so a failed
 * objective can become a fresh win-card objective. */
export function freshObjectiveAvailable(camp: CampState | null): boolean {
  if (camp === null) return false;
  return camp.objectiveDeck.some((identity) => camp.hands.some((hand) => hand.cards.some((card) => identitiesEqual(card.identity, identity))));
}

/** True when the seat holds a pending objective in this camp. */
export function hasPendingObjective(camp: CampState, seatId: string): boolean {
  return camp.objectives.some((o) => o.ownerSeatId === seatId && evaluateObjective(camp, o) === "pending");
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

/** A layer that makes one card count as `rank`. */
export function shiftedRank(cardId: string, rank: number): RuleModifier {
  return { rankOf: (prev) => (card) => (card.id === cardId ? rank : prev(card)) };
}
