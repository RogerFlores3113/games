import { defineMod } from "./mod-def";

/** Never drawn by weight: a route rolls fair at its location's chance. */
export const fair = defineMod({
  id: "fair",
  kind: "weather",
  name: "Fair",
  weight: 0,
  text: "Clear skies, so nothing changes.",
  full: {},
});
