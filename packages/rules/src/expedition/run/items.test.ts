// Item instances in the loadout: equip and its refusals, the ready re-check,
// what is live, and upgrades' extra whisper.

import { describe, expect, it } from "vitest";
import { defineCharacter, defineItem, defineUpgrade, itemAbility } from "../content/source-def";
import { attemptOf } from "./attempt";
import { rulesFor } from "./compose";
import { advanceTo, plainItem, setupRun, testCatalog } from "./run-test-support";
import { applyRunAction } from "./stages/registry";
import type { RunState, SeatRun } from "./types";

const cramped = defineCharacter({
  id: "cramped",
  name: "Cramped",
  theme: "Small pockets",
  power: "None",
  text: "You have one fewer item slot.",
  passive: { modifier: (owner) => ({ itemSlots: (prev) => (run, seatId) => prev(run, seatId) - (seatId === owner.seatId ? 1 : 0) }) },
  upgrades: [defineUpgrade({ id: "cramped.a", name: "A", text: "Nothing happens." }), defineUpgrade({ id: "cramped.b", name: "B", text: "Nothing happens." })],
});

const catalog = testCatalog({
  characters: { cramped },
  items: {
    "item-a": plainItem("item-a"),
    "item-b": plainItem("item-b"),
    "item-c": plainItem("item-c"),
    loud: defineItem({
      id: "loud",
      name: "Loud",
      rarity: "common",
      price: 2,
      text: "You may whisper once more each camp.",
      passive: { modifier: (owner) => ({ whispersPerCamp: (prev) => (run, seatId) => prev(run, seatId) + (seatId === owner.seatId ? 1 : 0) }) },
    }),
    flare: defineItem({
      id: "flare",
      name: "Flare",
      rarity: "common",
      price: 2,
      uses: { kind: "single-use" },
      text: "Nothing happens.",
      active: itemAbility({ window: "between-tricks", targets: [], apply: () => [] }),
    }),
  },
});
const SEATS = ["p0", "p1", "p2"];

function loadout(items: Record<string, readonly string[]>, extra: { characters?: Record<string, string>; upgrades?: Record<string, string> } = {}): RunState {
  return setupRun({ seatIds: SEATS, seed: "items", catalog, items, ...extra });
}

function act(run: RunState, seatId: string, action: Parameters<typeof applyRunAction>[2]): RunState {
  const result = applyRunAction(run, seatId, action, catalog);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const seat0 = (run: RunState): SeatRun => run.seats[0]!;

describe("equip", () => {
  it("mints into free slots first, then the backpack", () => {
    const run = loadout({ p0: ["item-a", "item-b", "item-c"] });
    expect(seat0(run).equipped).toEqual(["it0", "it1"]);
    expect(seat0(run).items.map((item) => item.uid)).toEqual(["it0", "it1", "it2"]);
  });

  it("replaces the equipped set, in the order given", () => {
    expect(seat0(act(loadout({ p0: ["item-a", "item-b", "item-c"] }), "p0", { type: "equip", itemUids: ["it2", "it0"] })).equipped).toEqual(["it2", "it0"]);
    expect(seat0(act(loadout({ p0: ["item-a"] }), "p0", { type: "equip", itemUids: [] })).equipped).toEqual([]);
  });

  it("converges when repeated", () => {
    const once = act(loadout({ p0: ["item-a", "item-b", "item-c"] }), "p0", { type: "equip", itemUids: ["it2"] });
    expect(act(once, "p0", { type: "equip", itemUids: ["it2"] })).toEqual(once);
  });

  it("refuses a uid the seat does not own, or a uid twice, as not_owned_item", () => {
    const run = loadout({ p0: ["item-a"], p1: ["item-b"] });
    for (const itemUids of [["it9"], ["it1"], ["it0", "it0"], ["toString"]]) {
      expect(applyRunAction(run, "p0", { type: "equip", itemUids }, catalog)).toEqual({ ok: false, error: "not_owned_item" });
    }
  });

  it("refuses more items than the slots as too_many_items, slots read through the composed rules", () => {
    expect(applyRunAction(loadout({ p0: ["item-a", "item-b", "item-c"] }), "p0", { type: "equip", itemUids: ["it0", "it1", "it2"] }, catalog)).toEqual({
      ok: false,
      error: "too_many_items",
    });
    const run = loadout({ p0: ["item-a", "item-b"] }, { characters: { p0: "cramped" } });
    expect(seat0(run).equipped).toEqual(["it0"]);
    expect(applyRunAction(run, "p0", { type: "equip", itemUids: ["it0", "it1"] }, catalog)).toEqual({ ok: false, error: "too_many_items" });
  });

  it("ready re-checks the count against the slots of this camp", () => {
    const carried = loadout({ p0: ["item-a", "item-b"] }, { characters: { p0: "cramped" } });
    const over = { ...carried, seats: carried.seats.map((s) => (s.seatId === "p0" ? { ...s, equipped: ["it0", "it1"] } : s)) };
    expect(applyRunAction(over, "p0", { type: "ready" }, catalog)).toEqual({ ok: false, error: "too_many_items" });
    expect(act(act(over, "p0", { type: "equip", itemUids: ["it1"] }), "p0", { type: "ready" }).stage).toMatchObject({ tag: "loadout", ready: { p0: true } });
  });

  it("refuses equip after the seat's ready as already_ready, and outside the loadout as wrong_stage", () => {
    const ready = act(loadout({ p0: ["item-a"] }), "p0", { type: "ready" });
    expect(applyRunAction(ready, "p0", { type: "equip", itemUids: [] }, catalog)).toEqual({ ok: false, error: "already_ready" });
    const camp = advanceTo(loadout({ p0: ["item-a"] }), "objective-pick", catalog);
    expect(applyRunAction(camp, "p0", { type: "equip", itemUids: [] }, catalog)).toEqual({ ok: false, error: "wrong_stage" });
  });
});

describe("what is live", () => {
  it("a backpack item's passive does nothing; equipped, it applies", () => {
    const run = loadout({ p0: ["item-a", "item-b", "loud"] });
    expect(seat0(run).equipped).toEqual(["it0", "it1"]);
    expect(rulesFor(run, catalog).whispersPerCamp(run, "p0")).toBe(1);
    const worn = act(run, "p0", { type: "equip", itemUids: ["it2"] });
    expect(rulesFor(worn, catalog).whispersPerCamp(worn, "p0")).toBe(2);
  });

  it("a backpack item's ability cannot be used", () => {
    const run = advanceTo(act(loadout({ p0: ["flare"] }), "p0", { type: "equip", itemUids: [] }), "between-tricks", catalog);
    expect(applyRunAction(run, "p0", { type: "use-ability", sourceKey: "it0", targets: [] }, catalog)).toEqual({ ok: false, error: "not_owned" });
  });

  it("an upgrade gives its owner one more whisper per camp", () => {
    const run = loadout({}, { upgrades: { p0: "plain-1.a" } });
    expect(SEATS.map((seatId) => rulesFor(run, catalog).whispersPerCamp(run, seatId))).toEqual([2, 1, 1]);
  });

  it("two instances of one item spend their uses apart", () => {
    const run = advanceTo(loadout({ p0: ["flare", "flare"] }), "between-tricks", catalog);
    const used = act(run, "p0", { type: "use-ability", sourceKey: "it0", targets: [] });
    expect(seat0(used).items).toEqual([{ uid: "it1", itemId: "flare" }]);
    expect(seat0(used).equipped).toEqual(["it1"]);
    expect(attemptOf(used)!.log.map((entry) => entry.sourceId)).toEqual(["flare"]);
    expect(applyRunAction(used, "p0", { type: "use-ability", sourceKey: "it1", targets: [] }, catalog).ok).toBe(true);
  });
});
