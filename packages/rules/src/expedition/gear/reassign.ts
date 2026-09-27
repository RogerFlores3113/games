// Trail Map (Plan 10-09, spec §5.1 as amended by D-10, GEAR-02). D-10
// replaces the spec's `player-pair` target with a single `teammate` target:
// Trail Map always swaps between the USER and one chosen teammate, never an
// arbitrary pair of other seats. Only PENDING objectives move — the
// toolkit's `swap-objectives` op (toolkit.ts) already enforces that an
// already-done objective stays with its owner (D-10's second clause); this
// file only supplies the GEAR-06 "nothing to swap" reason.

import { evaluateObjective } from "../objectives";
import type { CampState } from "../state";
import type { GearDef } from "./gear-def";

function hasPendingObjective(camp: CampState, seatId: string): boolean {
  return camp.objectives.some((o) => o.ownerSeatId === seatId && evaluateObjective(camp, o) === "pending");
}

export const reassign: GearDef = {
  id: "reassign",
  name: "Trail Map",
  size: 3,
  window: "between-tricks",
  text: "Swap your unresolved objectives with a teammate's. Completed objectives stay.",
  targets: [{ kind: "teammate" }],
  canTarget(ctx) {
    const camp = ctx.camp!; // window === "between-tricks" guarantees a camp
    const target = ctx.targets[0]!;
    if (!hasPendingObjective(camp, ctx.self) && !hasPendingObjective(camp, target)) {
      return "Neither of you has an unresolved objective";
    }
    return true;
  },
  apply(ctx) {
    return [{ op: "swap-objectives", seatA: ctx.self, seatB: ctx.targets[0]! }];
  },
};
