import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { CATALOG } from "./catalog";
import { createRun } from "./lifecycle";
import { campIndex, drawPlan } from "./plan";
import { campSpecAt, routeOptions, type RouteOption } from "./route";
import type { RunAt } from "./types";

function draftAfter(seed: string): RunAt<"draft"> {
  return { ...createRun({ seatIds: ["p0", "p1", "p2"], seed }), plan: drawPlan(seed, "long", CATALOG), stage: { tag: "draft", next: campIndex(3) } };
}

describe("property: route weather", () => {
  it("never pairs a location with a weather a pairing rules out, over 500 seeds", () => {
    const next = Array.from({ length: 500 }, (_, n) => routeOptions(draftAfter(`never-${n}`), campIndex(2), CATALOG)).flat().map((o) => o.next);
    const pairs = new Set(next.map((spec) => `${spec.location}+${spec.weather}`));
    expect(pairs.has("cave+night")).toBe(false);
    expect(pairs.has("desert+rain")).toBe(false);
    expect(pairs.has("cave+rain")).toBe(true);
    expect(pairs.has("desert+night")).toBe(true);
    expect(pairs.has("magma+rain")).toBe(true);
  });
});

describe("property: route options", () => {
  const sameOption = (a: RouteOption, b: RouteOption) =>
    a.next.location === b.next.location && a.next.weather === b.next.weather && JSON.stringify(a.next.slots) === JSON.stringify(b.next.slots) && JSON.stringify(a.swapBoss) === JSON.stringify(b.swapBoss);

  it("never offers two identical options in one vote, at every camp of a long run, over 300 seeds", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), fc.integer({ min: 1, max: 7 }), (seed, cleared) => {
        const options = routeOptions(draftAfter(seed), campIndex(cleared), CATALOG);
        for (let i = 0; i < options.length; i++) for (let j = i + 1; j < options.length; j++) expect(sameOption(options[i]!, options[j]!)).toBe(false);
      }),
      { numRuns: 300, seed: 5 },
    );
  });

  it("is the same for the same seed, and keeps the first option as it was drawn", () => {
    for (let n = 0; n < 50; n++) {
      const run = draftAfter(`dedupe-${n}`);
      const options = routeOptions(run, campIndex(2), CATALOG);
      expect(routeOptions(run, campIndex(2), CATALOG)).toEqual(options);
      expect(options[0]!.next).toEqual(campSpecAt(`dedupe-${n}`, "long", campIndex(3), CATALOG));
    }
  });
});
