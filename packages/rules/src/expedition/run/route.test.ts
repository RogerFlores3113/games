import { describe, expect, it } from "vitest";
import { campIndex, drawPlan } from "./plan";
import { campSpecAt, firstCampSpec, routeOptions, slotKindsFor } from "./route";
import { createRun } from "./lifecycle";
import type { RunAt, RunLength } from "./types";

function draftAfter(seed: string, length: RunLength, cleared: number): RunAt<"draft"> {
  const run = createRun({ seatIds: ["p0", "p1", "p2"], seed });
  return { ...run, plan: drawPlan(length), stage: { tag: "draft", cleared: campIndex(cleared), payout: 5 } };
}

describe("firstCampSpec", () => {
  it("is the Jungle in fair weather with the ramp's first slot count, all win-card", () => {
    expect(firstCampSpec("long")).toEqual({ index: 1, location: "jungle", weather: "fair", event: null, slots: [{ kind: "win-card" }, { kind: "win-card" }] });
  });
});

describe("routeOptions", () => {
  it("offers 2 or 3 options, both counts occurring, lettered from a", () => {
    const counts = new Set<number>();
    for (let n = 0; n < 40; n++) {
      const options = routeOptions(draftAfter(`seed-${n}`, "standard", 1));
      counts.add(options.length);
      expect(options.map((o) => o.id)).toEqual(["a", "b", "c"].slice(0, options.length));
    }
    expect([...counts].sort()).toEqual([2, 3]);
  });

  it("before camp 4 every option is all win-card at the ramp's count, with the stub event", () => {
    for (const option of routeOptions(draftAfter("s", "long", 2))) {
      expect(option.next).toEqual({ index: 3, location: "jungle", weather: "fair", event: "event", slots: [{ kind: "win-card" }, { kind: "win-card" }, { kind: "win-card" }] });
    }
  });

  it("is the same for the same seed", () => {
    expect(routeOptions(draftAfter("same", "short", 3))).toEqual(routeOptions(draftAfter("same", "short", 3)));
  });

  it("a mix with both an ordered pair and a trick count fills camp 7 of a long run (5 slots)", () => {
    const seen = new Set<string>();
    for (let n = 0; n < 60; n++) {
      for (const option of routeOptions(draftAfter(`mix-${n}`, "long", 6))) {
        expect(option.next.slots).toHaveLength(5);
        seen.add(slotKindsFor(option.next).join(","));
      }
    }
    expect([...seen].sort()).toEqual([
      "ordered,ordered,win-card,win-card,trick-count",
      "ordered,ordered,win-card,win-card,win-card",
      "win-card,win-card,win-card,win-card,trick-count",
      "win-card,win-card,win-card,win-card,win-card",
    ]);
  });
});

describe("campSpecAt", () => {
  it("is camp 1's spec at 1 and route a's spec after", () => {
    expect(campSpecAt("s", "short", campIndex(1))).toEqual(firstCampSpec("short"));
    expect(campSpecAt("s", "short", campIndex(3))).toEqual(routeOptions(draftAfter("s", "short", 2))[0]!.next);
  });
});
