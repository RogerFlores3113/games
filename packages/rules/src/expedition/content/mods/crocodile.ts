import { guard } from "../../camp";
import { defineBoss, type ModBody, type ModCtx } from "./mod-def";

const ID = "crocodile";

/** The seat the crocodile faces on `trick`: it faces every `every`th trick,
 * starting at a rolled seat and shifting one seat per trick. */
function facing(ctx: ModCtx, trick: number, every: number): string | null {
  if (trick % every !== 0) return null;
  const seatIds = ctx.run.seatIds;
  return seatIds[(ctx.roll("start", seatIds.length) + trick) % seatIds.length]!;
}

const body = (every: number): ModBody => ({
  rules: (ctx) => ({
    goals: (prev) => (camp, statuses) => [
      ...prev(camp, statuses),
      guard(ID, camp.completedTricks.some((t) => t.winnerSeatId === facing(ctx, t.index, every))),
    ],
  }),
  status: (ctx) => {
    const seatId = ctx.camp === null ? null : facing(ctx, ctx.camp.currentTrick.index, every);
    return seatId === null ? [] : [{ kind: "facing", seatId }];
  },
});

export const crocodile = defineBoss({
  id: ID,
  kind: "animal",
  name: "Crocodile",
  weight: 1,
  text: "The crocodile watches one player each trick, and if they win it the camp is lost.",
  full: body(1),
  half: body(2),
});
