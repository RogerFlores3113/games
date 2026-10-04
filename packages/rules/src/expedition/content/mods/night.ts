import { defineMod } from "./mod-def";

export const night = defineMod({
  id: "night",
  kind: "weather",
  name: "Night",
  weight: 1,
  text: "The leader's card stays face down until the trick ends.",
  full: {
    rules: () => ({
      hides: (prev) => (run, viewerSeatId, subject) =>
        prev(run, viewerSeatId, subject) || (subject.kind === "play" && subject.position === 0 && subject.seatId !== viewerSeatId),
    }),
  },
});
