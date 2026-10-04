import { TORNADO } from "../../run/balance";
import type { ToolkitOp } from "../../run/toolkit";
import type { CampState } from "../../state";
import { defineBoss, type ModBody, type StatusPart } from "./mod-def";

const ID = "tornado";

/** Tricks still to finish, this one included, before the next gust; null
 * when no gust remains, since none blows after the final trick. */
function untilGust(camp: CampState, every: number): number | null {
  const done = camp.completedTricks.length;
  const gustAt = (Math.floor(done / every) + 1) * every;
  return gustAt < camp.totalTricks ? gustAt - done : null;
}

/** The player on the right is the previous seat in turn order. */
function rightOf(seatIds: readonly string[], seatId: string): string {
  return seatIds[(seatIds.indexOf(seatId) + seatIds.length - 1) % seatIds.length]!;
}

const body = (every: number): ModBody => ({
  on: {
    "trick-completed": (ctx) => {
      if ((ctx.event.trickIndex + 1) % every !== 0) return [];
      // Every hand's cards are drawn before any moves, so no card blows twice.
      const sent = ctx.camp.seatIds.map((seatId) => ({ seatId, cardIds: ctx.randomCards(seatId, TORNADO.cards) }));
      const ops: ToolkitOp[] = [{ op: "log", event: "gust", subjectSeatIds: [], audience: "public" }];
      for (const { seatId, cardIds } of sent) for (const cardId of cardIds) ops.push({ op: "reveal", cardId, audience: [seatId] });
      for (const { seatId, cardIds } of sent) {
        for (const cardId of cardIds) ops.push({ op: "move-card", cardId, fromSeatId: seatId, toSeatId: rightOf(ctx.camp.seatIds, seatId) });
      }
      return ops;
    },
  },
  status: (ctx): readonly StatusPart[] => {
    const tricks = ctx.camp === null ? null : untilGust(ctx.camp, every);
    return tricks === null ? [] : [{ kind: "countdown", tricks }];
  },
});

export const tornado = defineBoss({
  id: ID,
  kind: "disaster",
  name: "Tornado",
  weight: 1,
  text: "After every third trick a tornado blows three random cards from each hand to the player on the right.",
  full: body(TORNADO.every),
  half: body(TORNADO.every * 2),
});
