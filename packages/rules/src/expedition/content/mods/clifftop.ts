import { defineMod } from "./mod-def";

export const clifftop = defineMod({
  id: "clifftop",
  kind: "location",
  name: "Clifftop",
  weight: 1,
  normalWeatherChance: 50,
  exposed: true,
  text: "Exposed to the elements up here: weather hits harder.",
  full: {},
});
