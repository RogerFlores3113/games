import { describe, expect, it } from "vitest";
import { fitLabel, wrapWords } from "./text-fit";

describe("fitLabel", () => {
  it("keeps a name that fits, falls back to its last word, then truncates", () => {
    expect(fitLabel("Spyglass", 8)).toBe("Spyglass");
    expect(fitLabel("Signal Whistle", 8)).toBe("Whistle");
    expect(fitLabel("Camouflage", 6)).toBe("Camou…");
  });
});

describe("wrapWords", () => {
  it("wraps on word boundaries", () => {
    expect(wrapWords("Swap a card of your choice for a random card", 16)).toEqual(["Swap a card of", "your choice for", "a random card"]);
  });
});
