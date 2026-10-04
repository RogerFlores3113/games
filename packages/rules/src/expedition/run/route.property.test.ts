import { describe, expect, it } from "vitest";
import { defineMod } from "../content/mods/mod-def";
import { createRun } from "./lifecycle";
import { campIndex, drawPlan } from "./plan";
import { routeOptions } from "./route";
import { testCatalog } from "./run-test-support";
import type { RunAt } from "./types";

const cave = defineMod({ id: "cave", kind: "location", name: "Cave", weight: 3, text: "Dark.", full: {} });
const catalog = testCatalog({
  mods: { cave },
  pairings: [
    { location: "cave", weathers: ["rain"], result: "never" },
    { location: "clifftop", weathers: ["thunderstorm", "rain"], result: "never" },
  ],
});

function draftAfter(seed: string): RunAt<"draft"> {
  return { ...createRun({ seatIds: ["p0", "p1", "p2"], seed }), plan: drawPlan("long"), stage: { tag: "draft", cleared: campIndex(2), payout: 5 } };
}

describe("property: route weather", () => {
  it("never pairs a location with a weather a pairing rules out, over 500 seeds", () => {
    const next = Array.from({ length: 500 }, (_, n) => routeOptions(draftAfter(`never-${n}`), catalog)).flat().map((o) => o.next);
    const pairs = new Set(next.map((spec) => `${spec.location}+${spec.weather}`));
    expect(pairs.has("cave+rain")).toBe(false);
    expect(pairs.has("clifftop+rain")).toBe(false);
    expect(pairs.has("clifftop+thunderstorm")).toBe(false);
    expect(pairs.has("cave+thunderstorm")).toBe(true);
    expect(pairs.has("jungle+rain")).toBe(true);
    expect(next.filter((spec) => spec.location === "clifftop").every((spec) => spec.weather === "fair")).toBe(true);
  });
});
