import { defineMod } from "./mod-def";

export const fog = defineMod({
  id: "fog",
  kind: "weather",
  name: "Heavy fog",
  weight: 3,
  text: "Thick fog hides what your teammates carry until they use it.",
  full: {
    rules: () => ({
      hides: (prev) => (run, viewerSeatId, subject) => prev(run, viewerSeatId, subject) || (subject.kind === "loadout" && subject.seatId !== viewerSeatId),
    }),
  },
});
