// Events on the trail: drawn from EVENT_POOL by the run's seed, their effect
// applied once as the event stage opens.

import { describe, expect, it } from "vitest";
import { EVENTS, EVENT_POOL } from "../content/events/registry";
import { NO_GAINS } from "../content/events/event-def";
import { BACKPACK_SIZE, SUPPLIES_MAX } from "./balance";
import { applyEvent, drawEventId } from "./events";
import { openLeg } from "./lifecycle";
import { campIndex } from "./plan";
import { plainItem, setupRun, testCatalog } from "./run-test-support";
import { applyRunAction } from "./stages/registry";
import type { RunAt, RunState } from "./types";

const catalog = testCatalog({
  items: { "c-1": plainItem("c-1"), "c-2": plainItem("c-2"), "r-1": plainItem("r-1", { rarity: "rare" }) },
});
const SEATS = ["p0", "p1", "p2"];
const next = campIndex(2);

function run(opts: { purse?: number; supplies?: number; items?: Record<string, string[]> } = {}): RunState {
  return setupRun({ seatIds: SEATS, seed: "events", catalog, ...opts });
}

describe("the event pool", () => {
  it("draws only the real events, never Quiet trail, and each of them for some seed", () => {
    expect(EVENT_POOL).not.toContain("event");
    for (const id of EVENT_POOL) expect(EVENTS[id].effect).toBeDefined();
    const drawn = new Set(Array.from({ length: 60 }, (_, i) => drawEventId(`seed-${i}`, next)));
    expect([...drawn].sort()).toEqual([...EVENT_POOL].sort());
  });

  it("draws the same event for the same seed and camp", () => {
    expect(drawEventId("same", campIndex(4))).toBe(drawEventId("same", campIndex(4)));
  });
});

describe("applyEvent", () => {
  it("Quiet trail gives nothing", () => {
    const before = run();
    expect(applyEvent(before, EVENTS.event, next, catalog)).toEqual({ run: before, gains: NO_GAINS });
  });

  it("Abandoned camp: the purse gains 4 coins", () => {
    const { run: after, gains } = applyEvent(run({ purse: 3 }), EVENTS["abandoned-camp"], next, catalog);
    expect([after.purse, gains]).toEqual([7, { coins: 4, supplies: 0, items: [] }]);
  });

  it("Fresh spring: one supply back, or 3 coins with supplies full", () => {
    const low = applyEvent(run({ supplies: 2, purse: 1 }), EVENTS["fresh-spring"], next, catalog);
    expect([low.run.supplies, low.run.purse, low.gains]).toEqual([3, 1, { coins: 0, supplies: 1, items: [] }]);
    const full = applyEvent(run({ supplies: SUPPLIES_MAX, purse: 1 }), EVENTS["fresh-spring"], next, catalog);
    expect([full.run.supplies, full.run.purse, full.gains]).toEqual([SUPPLIES_MAX, 4, { coins: 3, supplies: 0, items: [] }]);
  });

  it("Dropped pack: each seat with room gets one common item; a full pack gets nothing", () => {
    const full = Array.from({ length: 2 + BACKPACK_SIZE }, () => "c-1");
    const { run: after, gains } = applyEvent(run({ items: { p1: full } }), EVENTS["dropped-pack"], next, catalog);
    expect(gains.items.map((i) => i.seatId)).toEqual(["p0", "p2"]);
    for (const { itemId } of gains.items) expect(catalog.items[itemId]!.rarity).toBe("common");
    expect(after.seats.map((s) => s.items.length)).toEqual([1, full.length, 1]);
    expect(after.seats[0]!.items[0]!.itemId).toBe(gains.items[0]!.itemId);
  });
});

describe("the event stage", () => {
  it("applies its effect once as it opens, and readying does not apply it again", () => {
    const before = { ...run({ purse: 0 }), seats: run().seats.map((s) => ({ ...s, offers: [] })) };
    let event = openLeg(before, next, "event", catalog) as RunAt<"event">;
    const id = event.stage.event as keyof typeof EVENTS;
    const expected = applyEvent(before, EVENTS[id], next, catalog);
    expect(event.stage.gains).toEqual(expected.gains);
    expect([event.purse, event.supplies]).toEqual([expected.run.purse, expected.run.supplies]);
    let after: RunState = event;
    for (const seatId of SEATS) {
      const result = applyRunAction(after, seatId, { type: "ready" }, catalog);
      if (!result.ok) throw new Error(result.error);
      after = result.state;
    }
    expect(after.stage.tag).toBe("route");
    expect([after.purse, after.supplies, after.itemSerial]).toEqual([event.purse, event.supplies, event.itemSerial]);
    event = openLeg(before, next, "event", catalog) as RunAt<"event">;
    expect(event.stage.event).toBe(id);
  });
});
