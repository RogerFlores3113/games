import { defineMod } from "./mod-def";

export const fog = defineMod({
  id: "fog",
  kind: "weather",
  name: "Heavy fog",
  weight: 1,
  text: "You can't see the items other players took until they use them.",
  full: {
    rules: () => ({
      hides: (prev) => (run, viewerSeatId, subject) => prev(run, viewerSeatId, subject) || (subject.kind === "loadout" && subject.seatId !== viewerSeatId),
    }),
  },
});
