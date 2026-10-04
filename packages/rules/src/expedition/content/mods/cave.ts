import { defineMod } from "./mod-def";

export const cave = defineMod({
  id: "cave",
  kind: "location",
  name: "Cave",
  weight: 1,
  text: "In the dark, cards are played face down and flip when the trick ends.",
  full: {
    rules: () => ({
      hides: (prev) => (run, viewerSeatId, subject) => prev(run, viewerSeatId, subject) || (subject.kind === "play" && subject.seatId !== viewerSeatId),
    }),
  },
});
