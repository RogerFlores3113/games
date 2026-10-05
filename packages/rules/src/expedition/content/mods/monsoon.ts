import { riverBody } from "./flooding";
import { defineBoss } from "./mod-def";

export const monsoon = defineBoss({
  id: "monsoon",
  kind: "disaster",
  name: "Monsoon",
  weight: 1,
  text: "The river rises with every trick and ends the camp when it floods, so every objective must be done by then.",
  full: riverBody(0),
  half: riverBody(1),
});
