import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog";
import { createRun } from "./lifecycle";
import { campIndex, drawPlan } from "./plan";
import { routeOptions } from "./route";
import type { RunAt } from "./types";

function draftAfter(seed: string): RunAt<"draft"> {
  return { ...createRun({ seatIds: ["p0", "p1", "p2"], seed }), plan: drawPlan(seed, "long", CATALOG), stage: { tag: "draft", cleared: campIndex(2), payout: 5 } };
}

describe("property: route weather", () => {
  it("never pairs a location with a weather a pairing rules out, over 500 seeds", () => {
    const next = Array.from({ length: 500 }, (_, n) => routeOptions(draftAfter(`never-${n}`), CATALOG)).flat().map((o) => o.next);
    const pairs = new Set(next.map((spec) => `${spec.location}+${spec.weather}`));
    expect(pairs.has("cave+night")).toBe(false);
    expect(pairs.has("desert+rain")).toBe(false);
    expect(pairs.has("cave+rain")).toBe(true);
    expect(pairs.has("desert+night")).toBe(true);
    expect(pairs.has("magma+rain")).toBe(true);
  });
});
