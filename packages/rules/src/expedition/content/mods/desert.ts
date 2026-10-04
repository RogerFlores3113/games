import type { CampState } from "../../state";
import { defineMod, type ModCtx } from "./mod-def";

/** The objective the mirage hides, until the first trick completes. */
function mirageObjectiveId(ctx: ModCtx, camp: CampState | null): string | null {
  if (camp === null || camp.completedTricks.length > 0 || camp.objectives.length === 0) return null;
  return camp.objectives[ctx.roll("mirage", camp.objectives.length)]!.id;
}

export const desert = defineMod({
  id: "desert",
  kind: "location",
  name: "Desert",
  weight: 1,
  text: "A mirage hides one objective from everyone until the first trick is won.",
  full: {
    rules: (ctx) => ({
      hides: (prev) => (run, viewerSeatId, subject) =>
        prev(run, viewerSeatId, subject) || (subject.kind === "objective" && subject.objectiveId === mirageObjectiveId(ctx, ctx.camp)),
    }),
  },
});
