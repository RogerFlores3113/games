import { defineMod } from "./mod-def";

export const desert = defineMod({
  id: "desert",
  kind: "location",
  name: "Desert",
  weight: 1,
  text: "A mirage hides one objective from everyone until the first trick is won.",
  full: {
    on: {
      // The mirage is fixed by id at the deal, so an objective dropped or
      // added before the first trick never moves it onto another one.
      "camp-dealt": (ctx) => {
        const objectives = ctx.camp.objectives;
        if (objectives.length === 0) return [];
        return [{ op: "add-modifier", lasts: "attempt", audience: "public", params: { objectiveId: objectives[ctx.roll("mirage", objectives.length)]!.id } }];
      },
    },
    effect: (effect, ctx) => ({
      hides: (prev) => (run, viewerSeatId, subject) =>
        prev(run, viewerSeatId, subject) ||
        (subject.kind === "objective" && subject.objectiveId === effect.params.objectiveId && ctx.camp !== null && ctx.camp.completedTricks.length === 0),
    }),
  },
});
