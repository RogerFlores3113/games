import { defineMod } from "./mod-def";

export const night = defineMod({
  id: "night",
  kind: "weather",
  name: "Night",
  weight: 3,
  text: "By moonlight you see only suits: every card stays face down until the trick ends.",
  full: {
    rules: () => ({
      hides: (prev) => (run, viewerSeatId, subject) => prev(run, viewerSeatId, subject) || (subject.kind === "play" && subject.seatId !== viewerSeatId),
    }),
  },
});
