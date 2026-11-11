import { describe, expect, it } from "vitest";
import { campIndex, drawPlan } from "./plan";
import { campSpecAt, firstCampSpec, routeOptions, slotKindsFor } from "./route";
import { seatObjectivesAt } from "./balance";
import { createRun } from "./lifecycle";
import { CATALOG } from "./catalog";
import { testCatalog } from "./run-test-support";
import { defineMod } from "../content/mods/mod-def";
import type { Catalog, RunAt, RunLength } from "./types";

function draftAfter(seed: string, length: RunLength, cleared: number, players = 3): RunAt<"draft"> {
  const run = createRun({ seatIds: Array.from({ length: players }, (_, i) => `p${i}`), seed });
  return { ...run, plan: drawPlan(seed, length, CATALOG), stage: { tag: "draft", next: campIndex(cleared + 1) } };
}

/** The route options to the camp after `run`'s draft. */
function optionsOf(run: RunAt<"draft">, catalog: Catalog): ReturnType<typeof routeOptions> {
  return routeOptions(run, campIndex(run.stage.next - 1), catalog);
}

describe("firstCampSpec", () => {
  it("is the Jungle in fair weather with the ramp's first slot count, all win-card", () => {
    expect(firstCampSpec("long", 3)).toEqual({ index: 1, location: "jungle", weather: "fair", slots: [{ kind: "win-card" }, { kind: "win-card" }] });
  });

  it("deals camp 1's extras by crew size: none at 3 and 4 players, one at 5, in a Short run", () => {
    expect([3, 4, 5].map((players) => firstCampSpec("short", players).slots.length)).toEqual([2, 2, 3]);
    expect(firstCampSpec("short", 5).slots.every((slot) => slot.kind === "win-card")).toBe(true);
  });
});

describe("routeOptions", () => {
  it("offers 2 or 3 options, both counts occurring, lettered from a", () => {
    const counts = new Set<number>();
    for (let n = 0; n < 40; n++) {
      const options = optionsOf(draftAfter(`seed-${n}`, "standard", 1), CATALOG);
      counts.add(options.length);
      expect(options.map((o) => o.id)).toEqual(["a", "b", "c"].slice(0, options.length));
    }
    expect([...counts].sort()).toEqual([2, 3]);
  });

  it("before camp 4 every option is all win-card at the ramp's count", () => {
    for (const option of optionsOf(draftAfter("s", "long", 2), CATALOG)) {
      expect(option.next).toMatchObject({ index: 3, slots: [{ kind: "win-card" }, { kind: "win-card" }, { kind: "win-card" }] });
    }
  });

  it("adds each crew size's extras at the camps EXTRA_OBJECTIVES names, never past MAX_SEAT_OBJECTIVES", () => {
    for (const [players, expected] of [[3, 2], [4, 2], [5, 4]] as const) {
      expect(seatObjectivesAt("standard", 2, players)).toBe(expected);
      for (const option of optionsOf(draftAfter("crew", "standard", 1, players), CATALOG)) expect(option.next.slots).toHaveLength(expected);
    }
    for (const players of [3, 4, 5]) {
      for (const option of optionsOf(draftAfter("crew", "long", 6, players), CATALOG)) expect(option.next.slots).toHaveLength(seatObjectivesAt("long", 7, players));
    }
    expect(seatObjectivesAt("long", 7, 5)).toBe(5);
  });

  it("mixes from camp 3 at 4 or more players, and keeps camp 3 plain at 3", () => {
    const mixed = (players: number) =>
      Array.from({ length: 60 }, (_, n) => optionsOf(draftAfter(`early-${n}`, "standard", 2, players), CATALOG))
        .flat()
        .some((option) => option.next.slots.some((slot) => slot.kind !== "win-card"));
    expect(mixed(3)).toBe(false);
    expect(mixed(4)).toBe(true);
    expect(mixed(5)).toBe(true);
  });

  it("is the same for the same seed", () => {
    expect(optionsOf(draftAfter("same", "short", 3), CATALOG)).toEqual(optionsOf(draftAfter("same", "short", 3), CATALOG));
  });

  it("draws every weighted location and weather, fair about 80% of the time away from the clifftop and never on it", () => {
    const places = Array.from({ length: 400 }, (_, n) => optionsOf(draftAfter(`place-${n}`, "standard", 1), CATALOG)).flat().map((o) => o.next);
    expect(new Set(places.map((p) => p.location))).toEqual(new Set(["clearing", "jungle", "clifftop", "desert", "cave", "magma"]));
    expect(new Set(places.map((p) => p.weather))).toEqual(new Set(["fair", "rain", "downpour", "thunderstorm", "fog", "night"]));
    const fairShare = (location: string) => {
      const here = places.filter((p) => p.location === location);
      return here.filter((p) => p.weather === "fair").length / here.length;
    };
    expect(fairShare("jungle")).toBeGreaterThan(0.7);
    expect(fairShare("jungle")).toBeLessThan(0.9);
    expect(fairShare("clifftop")).toBe(0);
  });

  it("never draws a weight-0 def by weight, and falls back to fair when no weather is left", () => {
    const stormy = Object.values(CATALOG.mods).filter((def) => def.kind === "weather" && def.id !== "fair");
    const calm = testCatalog({ mods: Object.fromEntries(stormy.map((def) => [def.id, { ...def, weight: 0 }])) });
    const weathers = Array.from({ length: 50 }, (_, n) => optionsOf(draftAfter(`calm-${n}`, "standard", 1), calm)).flat().map((o) => o.next.weather);
    expect(new Set(weathers)).toEqual(new Set(["fair"]));
  });

  it("a slots layer on the stack shows in the preview's objective types", () => {
    const capybara = defineMod({ id: "jungle", kind: "location", name: "Jungle", weight: 1, text: "Two more cards.", full: { slots: (prev) => [...prev, { kind: "win-card" }, { kind: "win-card" }] } });
    const run = draftAfter("slots", "standard", 1);
    const spec = firstCampSpec("standard", 3);
    expect(slotKindsFor(run, spec, testCatalog({ mods: { jungle: capybara } }))).toEqual(["win-card", "win-card", "win-card", "win-card"]);
    expect(slotKindsFor(run, spec, CATALOG)).toEqual(["win-card", "win-card"]);
  });

  it("a mix with both an ordered pair and a trick count fills camp 7 of a long run (5 slots)", () => {
    const seen = new Set<string>();
    for (let n = 0; n < 60; n++) {
      const run = draftAfter(`mix-${n}`, "long", 6);
      for (const option of optionsOf(run, CATALOG)) {
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
    expect(campSpecAt("s", "short", campIndex(1), CATALOG, 3)).toEqual(firstCampSpec("short", 3));
    expect(campSpecAt("s", "short", campIndex(3), CATALOG, 3)).toEqual(optionsOf(draftAfter("s", "short", 2), CATALOG)[0]!.next);
    expect(campSpecAt("s", "short", campIndex(3), CATALOG, 4)).toEqual(optionsOf(draftAfter("s", "short", 2, 4), CATALOG)[0]!.next);
  });
});
