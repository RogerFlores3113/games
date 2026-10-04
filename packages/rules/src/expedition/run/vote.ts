// Crew votes: the run length at muster and the route between camps.

import { seededIndex } from "./rng";
import type { PerSeat, SeatId } from "./types";

export type VoteResult<C extends string> = {
  readonly tally: readonly { readonly choice: C; readonly votes: number }[];
  readonly tied: readonly C[] | null; // non-null: settled by the seeded flip the view shows
  readonly winner: C;
};
export type VoteRecord = { readonly topic: "length" | "route"; readonly result: VoteResult<string> };

/** null until every seat has a ballot. Abstentions count for nothing, so
 * all abstaining ties every choice. A tie draws seededIndex over the tied
 * choices on `stream`. */
export function tally<C extends string>(
  seed: string,
  stream: string,
  choices: readonly C[],
  seatIds: readonly SeatId[],
  ballots: PerSeat<C | null>,
): VoteResult<C> | null {
  if (!seatIds.every((seatId) => Object.hasOwn(ballots, seatId))) return null;
  const counted = choices.map((choice) => ({ choice, votes: seatIds.filter((seatId) => ballots[seatId] === choice).length }));
  const most = Math.max(...counted.map((c) => c.votes));
  const leaders = counted.filter((c) => c.votes === most).map((c) => c.choice);
  if (leaders.length === 1) return { tally: counted, tied: null, winner: leaders[0]! };
  return { tally: counted, tied: leaders, winner: leaders[seededIndex(seed, stream, leaders.length)]! };
}
