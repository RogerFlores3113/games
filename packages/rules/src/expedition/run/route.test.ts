import { describe, expect, it } from "vitest";
import { campIndex, drawPlan } from "./plan";
import { campSpecAt, firstCampSpec, routeOptions, slotKindsFor } from "./route";
import { createRun } from "./lifecycle";
import { CATALOG } from "./catalog";
import { testCatalog } from "./run-test-support";
import { defineMod } from "../content/mods/mod-def";
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
      const options = routeOptions(draftAfter(`seed-${n}`, "standard", 1), CATALOG);
      counts.add(options.length);
      expect(options.map((o) => o.id)).toEqual(["a", "b", "c"].slice(0, options.length));
    }
    expect([...counts].sort()).toEqual([2, 3]);
  });

  it("before camp 4 every option is all win-card at the ramp's count, with the stub event", () => {
    for (const option of routeOptions(draftAfter("s", "long", 2), CATALOG)) {
      expect(option.next).toMatchObject({ index: 3, event: "event", slots: [{ kind: "win-card" }, { kind: "win-card" }, { kind: "win-card" }] });
    }
  });

  it("is the same for the same seed", () => {
    expect(routeOptions(draftAfter("same", "short", 3), CATALOG)).toEqual(routeOptions(draftAfter("same", "short", 3), CATALOG));
  });

  it("draws every weighted location and weather, and fair about 80% of the time away from the clifftop", () => {
    const places = Array.from({ length: 400 }, (_, n) => routeOptions(draftAfter(`place-${n}`, "standard", 1), CATALOG)).flat().map((o) => o.next);
    expect(new Set(places.map((p) => p.location))).toEqual(new Set(["clearing", "jungle", "clifftop"]));
    expect(new Set(places.map((p) => p.weather))).toEqual(new Set(["fair", "rain", "thunderstorm"]));
    const fairShare = (location: string) => {
      const here = places.filter((p) => p.location === location);
      return here.filter((p) => p.weather === "fair").length / here.length;
    };
    expect(fairShare("jungle")).toBeGreaterThan(0.7);
    expect(fairShare("jungle")).toBeLessThan(0.9);
    expect(fairShare("clifftop")).toBeGreaterThan(0.4);
    expect(fairShare("clifftop")).toBeLessThan(0.6);
  });

  it("never draws a weight-0 def by weight, and falls back to fair when no weather is left", () => {
    const calm = testCatalog({ mods: { rain: { ...CATALOG.mods.rain!, weight: 0 }, thunderstorm: { ...CATALOG.mods.thunderstorm!, weight: 0 } } });
    const weathers = Array.from({ length: 50 }, (_, n) => routeOptions(draftAfter(`calm-${n}`, "standard", 1), calm)).flat().map((o) => o.next.weather);
    expect(new Set(weathers)).toEqual(new Set(["fair"]));
  });

  it("a slots layer on the stack shows in the preview's objective types", () => {
    const capybara = defineMod({ id: "jungle", kind: "location", name: "Jungle", weight: 1, text: "Two more cards.", full: { slots: (prev) => [...prev, { kind: "win-card" }, { kind: "win-card" }] } });
    const run = draftAfter("slots", "standard", 1);
    const spec = firstCampSpec("standard");
    expect(slotKindsFor(run, spec, testCatalog({ mods: { jungle: capybara } }))).toEqual(["win-card", "win-card", "win-card", "win-card"]);
    expect(slotKindsFor(run, spec, CATALOG)).toEqual(["win-card", "win-card"]);
  });

  it("a mix with both an ordered pair and a trick count fills camp 7 of a long run (5 slots)", () => {
    const seen = new Set<string>();
    for (let n = 0; n < 60; n++) {
      const run = draftAfter(`mix-${n}`, "long", 6);
      for (const option of routeOptions(run, CATALOG)) {
        expect(option.next.slots).toHaveLength(5);
        seen.add(slotKindsFor(run, option.next, CATALOG).join(","));
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
    expect(campSpecAt("s", "short", campIndex(1), CATALOG)).toEqual(firstCampSpec("short"));
    expect(campSpecAt("s", "short", campIndex(3), CATALOG)).toEqual(routeOptions(draftAfter("s", "short", 2), CATALOG)[0]!.next);
  });
});
