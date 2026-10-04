import type { CampState } from "../../state";
import { defineBoss, type ModBody } from "./mod-def";

/** The last trick's winner and how many tricks in a row they have won. */
function streakOf(camp: CampState): { readonly seatId: string; readonly count: number } | null {
  const done = camp.completedTricks;
  const last = done.at(-1);
  if (last === undefined) return null;
  let count = 0;
  while (count < done.length && done[done.length - 1 - count]!.winnerSeatId === last.winnerSeatId) count++;
  return { seatId: last.winnerSeatId, count };
}

/** The seat the tiger forces this lead, or null: a leader on a streak of
 * two or more, before the lead, on a trick the tiger hunts. */
function pounceOn(camp: CampState, every: number): string | null {
  const streak = streakOf(camp);
  const trick = camp.currentTrick;
  if (streak === null || streak.count < 2 || trick.plays.length > 0 || trick.index % every !== 0) return null;
  return trick.leaderSeatId === streak.seatId ? streak.seatId : null;
}

const body = (every: number): ModBody => ({
  rules: (ctx) => ({
    legalPlays: (prev) => (state, seatId) => {
      const legal = prev(state, seatId);
      if (pounceOn(state, every) !== seatId || legal.length === 0) return legal;
      return [legal[ctx.roll(`t${state.currentTrick.index}`, legal.length)]!];
    },
  }),
  status: (ctx) => {
    const streak = ctx.camp === null ? null : streakOf(ctx.camp);
    return streak === null ? [] : [{ kind: "streak", seatId: streak.seatId, count: streak.count }];
  },
});

export const tiger = defineBoss({
  id: "tiger",
  kind: "animal",
  name: "Tiger",
  weight: 1,
  text: "A player who wins two tricks in a row leads the next trick with a random card.",
  full: body(1),
  half: body(2),
});
