import { defineMod } from "./mod-def";

export const cave = defineMod({
  id: "cave",
  kind: "location",
  name: "Cave",
  weight: 1,
  text: "Pitch dark in here: every card goes down face down and flips when the trick ends.",
  full: {
    rules: () => ({
      hides: (prev) => (run, viewerSeatId, subject) => prev(run, viewerSeatId, subject) || (subject.kind === "play" && subject.seatId !== viewerSeatId),
    }),
  },
});
