// Camouflage (Plan 10-09, spec §5.1's ✦ downside, GEAR-02, D-11). D-11:
//   - The dropped objective is REMOVED FROM PLAY entirely: it no longer
//     needs completing and cannot fail the camp. The toolkit's
//     `remove-objective` op (toolkit.ts) does exactly this — it filters the
//     objective out of `camp.objectives`, so no later evaluateObjective call
//     ever sees it again.
//   - Camouflage stays unusable once the owner has won a trick this camp
//     (spec's own guard, kept): `canUse` refuses with "You have already won
//     a trick this camp" once `countTricksWon(camp, self) > 0`.
//   - The "win any trick this camp -> camp fails" check is stated over the
//     WHOLE camp (spec wording), which the guard above makes EQUIVALENT to
//     "from activation onward": once used, a second use is impossible, so
//     the only way countTricksWon(state, owner) can become positive after
//     activation is a trick won AFTER this gear was used. This was the
//     owner's clarification, option 2.
//
// `effectModifier` wraps `failureChecks`: for every CampState it is asked to
// evaluate, it appends "ghost-broke-cover" the instant
// `countTricksWon(state, effect.seatId) > 0`, on top of whatever the
// previous layer already reported.

import { countTricksWon } from "../objectives";
import type { GearDef } from "./gear-def";

export const ghost: GearDef = {
  id: "ghost",
  name: "Camouflage",
  size: 1,
  window: "between-tricks",
  text: "Drop one of your unresolved objectives.",
  downside: "From then on, if you win any trick this camp, the camp fails.",
  targets: [{ kind: "own-objective" }],
  canUse(ctx) {
    if (ctx.camp !== null && countTricksWon(ctx.camp, ctx.self) > 0) {
      return "You have already won a trick this camp";
    }
    return true;
  },
  apply(ctx) {
    return [{ op: "remove-objective", objectiveId: ctx.targets[0]! }, { op: "add-modifier", lasts: "attempt", params: {}, audience: "public" }];
  },
  effectModifier(effect) {
    return {
      failureChecks(prev) {
        return (state) => {
          if (countTricksWon(state, effect.seatId) > 0) {
            return [...prev(state), "ghost-broke-cover"];
          }
          return prev(state);
        };
      },
    };
  },
};
