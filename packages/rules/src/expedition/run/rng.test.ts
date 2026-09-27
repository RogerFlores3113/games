import { describe, expect, it } from "vitest";
import { attemptSeed, STREAMS, seededIndex } from "./rng";

describe("attemptSeed", () => {
  it("builds the {seed}:camp{N}:attempt{A} stream name", () => {
    expect(attemptSeed("s", 3, 2)).toBe("s:camp3:attempt2");
  });
});

describe("STREAMS distinctness (A1)", () => {
  it("produces pairwise-distinct names across the full draw-site grid", () => {
    const names: string[] = [];
    const camps = [1, 2, 3, 4, 5, 6] as const;
    const attempts = [1, 2, 3];
    const seats = ["p0", "p1", "p2", "p3", "p4"];
    const useIndices = [0, 1, 2, 3];
    const gearIds = ["gear-a", "gear-b"];
    const purposes = ["reveal", "index"];

    for (const camp of camps) {
      names.push(STREAMS.boss(camp));
      for (const seat of seats) {
        names.push(STREAMS.draft(camp, seat));
      }
      for (const attempt of attempts) {
        names.push(STREAMS.trickCountKind(camp, attempt));
        names.push(STREAMS.trickCountN(camp, attempt));
        names.push(STREAMS.faceDown(camp, attempt));
        for (const useIndex of useIndices) {
          for (const gearId of gearIds) {
            for (const seat of seats) {
              for (const purpose of purposes) {
                names.push(STREAMS.gear(camp, attempt, useIndex, gearId, seat, purpose));
              }
            }
          }
        }
      }
    }

    expect(new Set(names).size).toBe(names.length);
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
