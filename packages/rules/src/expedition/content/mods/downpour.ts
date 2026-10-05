import { WASHES } from "../../run/balance";
import { defineMod } from "./mod-def";
import { washingBody } from "./rain";

export const downpour = defineMod({
  id: "downpour",
  kind: "weather",
  name: "Downpour",
  weight: 1,
  text: "Sheets of rain drown out the crew's first whispers, one for each player beyond the first.",
  full: washingBody(WASHES.downpour),
});
