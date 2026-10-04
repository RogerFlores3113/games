import { describe, expect, it } from "vitest";
import { attemptSeed, STREAMS, seededIndex } from "./rng";

describe("attemptSeed", () => {
  it("builds the {seed}:camp{N}:attempt{A} stream name", () => {
    expect(attemptSeed("s", 3, 2)).toBe("s:camp3:attempt2");
  });
});

describe("STREAMS distinctness (A1)", () => {
  it("produces pairwise-distinct names across the full draw-site grid", () => {
    const names: string[] = [STREAMS.lengthVote()];
    const camps = [1, 2, 3, 4, 5, 6, 7, 8];
    const attempts = [1, 2, 3];
    const seats = ["p0", "p1", "p2", "p3", "p4"];
    const useIndices = [0, 1, 2, 3];
    const draws = [0, 1, 2];
    const options = [0, 1, 2];
    const fields = ["event", "mix"] as const;
    const parts = ["rarity", "pick"] as const;

    for (const camp of camps) {
      names.push(STREAMS.routeVote(camp), STREAMS.routeCount(camp));
      for (const reroll of [0, 1]) {
        for (const option of options) {
          for (const field of fields) names.push(STREAMS.routeField(camp, reroll, option, field));
        }
      }
      for (const seat of seats) {
        for (const offer of [0, 1]) {
          for (const bundle of options) {
            for (const item of [0, 1]) {
              for (const part of parts) names.push(STREAMS.draftItem(camp, seat, offer, bundle, item, part));
            }
          }
        }
      }
      for (const item of options) {
        for (const part of parts) names.push(STREAMS.shopItem(camp, item, part));
      }
      for (const attempt of attempts) {
        names.push(STREAMS.trickCountKind(camp, attempt));
        names.push(STREAMS.trickCountN(camp, attempt));
        for (const useIndex of useIndices) {
          for (const seat of seats) {
            for (const draw of draws) {
              names.push(STREAMS.ability(camp, attempt, seat, useIndex, draw));
            }
          }
        }
      }
    }

    expect(new Set(names).size).toBe(names.length);
  });
});

describe("STREAMS names", () => {
  it("builds the documented stream names", () => {
    expect(STREAMS.lengthVote()).toBe("expedition-vote:length");
    expect(STREAMS.routeVote(4)).toBe("expedition-vote:route:camp4");
    expect(STREAMS.routeCount(4)).toBe("expedition-route:camp4:count");
    expect(STREAMS.routeField(4, 0, 2, "mix")).toBe("expedition-route:camp4:reroll0:option2:mix");
    expect(STREAMS.draftItem(2, "p1", 0, 2, 1, "rarity")).toBe("expedition-draft:camp2:seatp1:offer0:bundle2:item1:rarity");
    expect(STREAMS.shopItem(3, 1, "pick")).toBe("expedition-shop:camp3:item1:pick");
    expect(STREAMS.ability(3, 2, "p0", 1, 0)).toBe("expedition-ability:camp3:attempt2:seatp0:use1:draw0");
  });
});

describe("seededIndex", () => {
  it("is deterministic for the same inputs", () => {
    const a = seededIndex("seed-1", "stream-1", 10);
    const b = seededIndex("seed-1", "stream-1", 10);
    expect(a).toBe(b);
  });

  it("always returns an integer in [0, n)", () => {
    for (let i = 0; i < 50; i++) {
      const value = seededIndex(`seed-${i}`, `stream-${i}`, 7);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
    }
  });

  it("throws for n <= 0 or a non-integer n", () => {
    expect(() => seededIndex("seed", "stream", 0)).toThrow();
    expect(() => seededIndex("seed", "stream", -1)).toThrow();
    expect(() => seededIndex("seed", "stream", 1.5)).toThrow();
  });
});
