import { describe, expect, it } from "vitest";
import { withSeatLabels } from "./seat-labels";

const seats = [
  { seatId: "s1", displayLabel: "Ada" },
  { seatId: "s10", displayLabel: "Grace" },
];

describe("withSeatLabels", () => {
  it("replaces every occurrence, preferring the longest id", () => {
    expect(withSeatLabels("s1 hand: [a]; s10 hand: [b]; s1 again", seats)).toBe(
      "Ada hand: [a]; Grace hand: [b]; Ada again",
    );
  });
  it("escapes regex characters in ids", () => {
    expect(withSeatLabels("a.b x axb", [{ seatId: "a.b", displayLabel: "Bot" }])).toBe("Bot x axb");
  });
  it("returns the text unchanged with no seats", () => {
    expect(withSeatLabels("s1", [])).toBe("s1");
  });
});
