import { describe, expect, it } from "vitest";
import { tally } from "./vote";

const SEATS = ["p0", "p1", "p2"];
const CHOICES = ["a", "b", "c"] as const;

describe("tally", () => {
  it("is null until every seat has a ballot, abstentions included", () => {
    expect(tally("s", "stream", CHOICES, SEATS, { p0: "a", p1: null })).toBeNull();
  });

  it("a majority wins with no flip", () => {
    expect(tally("s", "stream", CHOICES, SEATS, { p0: "b", p1: "b", p2: "a" })).toEqual({
      tally: [{ choice: "a", votes: 1 }, { choice: "b", votes: 2 }, { choice: "c", votes: 0 }],
      tied: null,
      winner: "b",
    });
  });

  it("abstentions count for nothing: one ballot beats two abstentions", () => {
    expect(tally("s", "stream", CHOICES, SEATS, { p0: null, p1: "c", p2: null })?.winner).toBe("c");
  });

  it("a tie is settled by a seeded flip over the tied choices only", () => {
    const winners = new Set<string>();
    for (let n = 0; n < 40; n++) {
      const result = tally(`seed-${n}`, "stream", CHOICES, SEATS, { p0: "a", p1: "c", p2: null })!;
      expect(result.tied).toEqual(["a", "c"]);
      winners.add(result.winner);
    }
    expect([...winners].sort()).toEqual(["a", "c"]);
  });

  it("the flip is the same for the same seed and stream, and the stream changes it", () => {
    const ballots = { p0: "a", p1: "b", p2: "c" } as const;
    expect(tally("s", "x", CHOICES, SEATS, ballots)).toEqual(tally("s", "x", CHOICES, SEATS, ballots));
    const byStream = new Set(Array.from({ length: 30 }, (_, n) => tally("s", `stream-${n}`, CHOICES, SEATS, ballots)!.winner));
    expect(byStream.size).toBeGreaterThan(1);
  });

  it("every seat abstaining ties every choice", () => {
    expect(tally("s", "stream", CHOICES, SEATS, { p0: null, p1: null, p2: null })?.tied).toEqual(["a", "b", "c"]);
  });
});
