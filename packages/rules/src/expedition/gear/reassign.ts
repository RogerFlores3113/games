// Trail Map (Plan 10-09, spec §5.1 as amended by D-10, GEAR-02). D-10
// replaces the spec's `player-pair` target with a single `teammate` target:
// Trail Map always swaps between the USER and one chosen teammate, never an
// arbitrary pair of other seats. Only PENDING objectives move — the
// toolkit's `swap-objectives` op (toolkit.ts) already enforces that an
// already-done objective stays with its owner (D-10's second clause); this
// file only supplies the GEAR-06 "nothing to swap" reason.
//
// WR-02 (10-REVIEW.md, spec §5.3/§6.4 "each player sees only their own"):
// under Thick Fog (face-down objective assignment), canTarget must never
// condition its answer on a TEAMMATE's hidden objective ownership. A
// refused use costs nothing and is not logged, so a legality rule that
// reads another seat's hidden state is a free oracle — even if the reason
// string itself is hidden from the UI, the accept/refuse split alone
// (surfaced as `gear_unavailable` vs `ok`) leaks who holds an objective.
// The fix: when ctx.rules.objectiveAssignment(ctx.run) is "face-down",
// skip the pending-objective check entirely and always allow the use. A
// self-only check would still forbid an objective-less seat from taking a
// teammate's objective, which the face-up rule allows — so the least
// restrictive legality that leaks nothing is to always allow it. This
// makes a swap where neither seat holds a pending objective a legal no-op
// that still spends the gear; that is an accepted consequence of the fog
// (10-REVIEW.md WR-02, T-10-57).

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
    if (ctx.rules.objectiveAssignment(ctx.run) === "face-down") {
      // WR-02: never read hidden objective ownership under Thick Fog.
      return true;
    }
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
