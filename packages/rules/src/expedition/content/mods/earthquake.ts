import type { ToolkitOp } from "../../run/toolkit";
import type { CampState } from "../../state";
import { defineBoss, type ModBody, type ReactionCtx } from "./mod-def";

const ID = "earthquake";

/** The quake strikes once this many tricks are complete. */
const quakeAt = (camp: CampState): number => Math.floor(camp.totalTricks / 2);

/** The open objectives dealt out again: each keeps an owner from the same
 * list of owners, so every seat keeps its count. */
function shuffleOpen(ctx: ReactionCtx<"trick-completed">): readonly ToolkitOp[] {
  const open = ctx.camp.objectives.filter((o) => o.ownerSeatId !== null && ctx.rules.objectiveStatus(ctx.camp, o) === "pending");
  const owners = open.map((o) => o.ownerSeatId!);
  const order = open.map((o) => o.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = ctx.draw(i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order.flatMap((objectiveId, i) => {
    const from = open.find((o) => o.id === objectiveId)!.ownerSeatId;
    return from === owners[i] ? [] : [{ op: "reassign-objective" as const, objectiveId, toSeatId: owners[i]! }];
  });
}

/** Two random seats trade their open objectives. */
function swapTwo(ctx: ReactionCtx<"trick-completed">): readonly ToolkitOp[] {
  const seatIds = ctx.camp.seatIds;
  const a = ctx.draw(seatIds.length);
  const b = (a + 1 + ctx.draw(seatIds.length - 1)) % seatIds.length;
  return [{ op: "swap-objectives", seatA: seatIds[a]!, seatB: seatIds[b]! }];
}

const body = (quake: (ctx: ReactionCtx<"trick-completed">) => readonly ToolkitOp[]): ModBody => ({
  on: {
    "trick-completed": (ctx) =>
      ctx.event.trickIndex + 1 !== quakeAt(ctx.camp) ? [] : [{ op: "log", event: "quake", subjectSeatIds: [], audience: "public" }, ...quake(ctx)],
  },
  status: (ctx) => {
    if (ctx.camp === null) return [];
    const tricks = quakeAt(ctx.camp) - ctx.camp.completedTricks.length;
    return tricks > 0 ? [{ kind: "countdown", tricks }] : [];
  },
});

export const earthquake = defineBoss({
  id: ID,
  kind: "disaster",
  name: "Earthquake",
  weight: 1,
  text: "Halfway through the camp an earthquake deals the open objectives out again, and each player keeps as many as they had.",
  full: body(shuffleOpen),
  half: body(swapTwo),
});
