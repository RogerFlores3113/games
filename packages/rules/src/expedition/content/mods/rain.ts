import { defineMod } from "./mod-def";

export const rain = defineMod({
  id: "rain",
  kind: "weather",
  name: "Rain",
  weight: 1,
  text: "The rain drowns out every whisper.",
  full: {
    rules: () => ({ whisperAllowed: () => () => false }),
  },
});
