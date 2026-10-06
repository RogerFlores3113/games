// The backpack (owner decisions, 2026-10-05): it stores BACKPACK_SIZE
// items beside the equipped slots, only equipped items act in camp, and an
// item that does not fit is refused until the seat discards one. Items are
// moved between backpack and slots, or discarded, in every stage between
// camps; never in camp (the Pack Rat's Pack Animal is the one way in).

import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../content/characters/registry";
import { absentSeatAction } from "./absent";
import { BACKPACK_SIZE } from "./balance";
import { dealCamp, settleCamp } from "./lifecycle";
import { plainItem, setupRun, testCatalog } from "./run-test-support";
import { applyRunAction } from "./stages/registry";
import { backpackOf } from "./usage";
import { campIndex } from "./plan";
import type { CampSpec, RunAction, RunAt, RunState } from "./types";

const ITEMS = ["c-1", "c-2", "c-3", "c-4", "c-5", "c-6", "c-7", "c-8", "c-9"];
const catalog = testCatalog({
  items: Object.fromEntries(ITEMS.map((id) => [id, plainItem(id)])),
  characters: { "pack-rat": CHARACTERS["pack-rat"]! },
});
const SEATS = ["p0", "p1", "p2"];

function act(run: RunState, seatId: string, action: RunAction): RunState {
  const result = applyRunAction(run, seatId, action, catalog);
  if (!result.ok) throw new Error(`${seatId} ${action.type}: ${result.error}`);
  return result.state;
}

/** The draft after camp 1 (before camp 2), p0 carrying `carried` items and
 * offered single items. */
function draftWith(carried: number, characters?: Record<string, string>): RunState {
  const run = setupRun({ seatIds: SEATS, seed: "backpack", catalog, camp: 1, characters, items: { p0: ITEMS.slice(0, carried) } });
  return settleCamp(dealCamp(run as RunAt<"loadout">, catalog), "cleared", catalog);
}

describe("the backpack", () => {
  it("holds six items", () => {
    expect(BACKPACK_SIZE).toBe(6);
  });

  it("two equipped items and six in the backpack is a full pack: a draft pick is refused backpack_full", () => {
    const run = draftWith(8);
    expect(run.seats[0]!.equipped).toHaveLength(2);
    expect(applyRunAction(run, "p0", { type: "pick-bundle", bundle: 0 }, catalog)).toEqual({ ok: false, error: "backpack_full" });
    expect(act(draftWith(7), "p0", { type: "pick-bundle", bundle: 0 }).seats[0]!.items).toHaveLength(8);
  });

  it("discarding an item makes room, and the pick then goes into the backpack", () => {
    const run = draftWith(8);
    const discarded = act(run, "p0", { type: "discard-item", itemUid: "it7" });
    expect(discarded.seats[0]!.items.map((i) => i.uid)).toEqual(["it0", "it1", "it2", "it3", "it4", "it5", "it6"]);
    const picked = act(discarded, "p0", { type: "pick-bundle", bundle: 0 });
    expect(picked.seats[0]!.items).toHaveLength(8);
    expect(picked.seats[0]!.equipped).toEqual(["it0", "it1"]);
  });

  it("the Pack Rat carries three equipped and six in the backpack", () => {
    const rat = { p0: "pack-rat" };
    expect(applyRunAction(draftWith(9, rat), "p0", { type: "pick-bundle", bundle: 0 }, catalog)).toEqual({ ok: false, error: "backpack_full" });
    expect(act(draftWith(8, rat), "p0", { type: "pick-bundle", bundle: 0 }).seats[0]!.items).toHaveLength(9);
  });

  it("the shop refuses an item that does not fit as backpack_full, but still sells supplies", () => {
    const run = setupRun({ seatIds: SEATS, seed: "backpack", catalog, camp: 2, purse: 30, supplies: 2, items: { p0: ITEMS.slice(0, 8) } });
    const shop = settleCamp(dealCamp(run as RunAt<"loadout">, catalog), "cleared", catalog);
    expect(shop.stage.tag).toBe("shop");
    expect(applyRunAction(shop, "p0", { type: "buy", stockId: "item0" }, catalog)).toEqual({ ok: false, error: "backpack_full" });
    expect(act(shop, "p0", { type: "buy", stockId: "supplies" }).supplies).toBe(3);
  });

  it("discard-item refuses an item the seat does not own as not_owned_item", () => {
    expect(applyRunAction(draftWith(2), "p0", { type: "discard-item", itemUid: "it9" }, catalog)).toEqual({ ok: false, error: "not_owned_item" });
    expect(applyRunAction(draftWith(2), "p1", { type: "discard-item", itemUid: "it0" }, catalog)).toEqual({ ok: false, error: "not_owned_item" });
  });

  it("discarding an equipped item frees its slot", () => {
    const run = act(draftWith(3), "p0", { type: "discard-item", itemUid: "it0" });
    expect(run.seats[0]!.items.map((i) => i.uid)).toEqual(["it1", "it2"]);
    expect(run.seats[0]!.equipped).toEqual(["it1"]);
  });

  it("items are moved and discarded in every stage between camps, never in camp or at the muster", () => {
    const loadout = setupRun({ seatIds: SEATS, seed: "backpack", catalog, camp: 2, items: { p0: ["c-1", "c-2", "c-3"] } });
    const accepts = (run: RunState) =>
      (["equip", "discard-item"] as const).filter((type) => {
        const action: RunAction = type === "equip" ? { type, itemUids: ["it2"] } : { type, itemUid: "it2" };
        const result = applyRunAction(run, "p0", action, catalog);
        return result.ok || result.error !== "wrong_stage";
      });
    expect(accepts(loadout)).toEqual(["equip", "discard-item"]);
    expect(accepts(dealCamp(loadout as RunAt<"loadout">, catalog))).toEqual([]);
    let run: RunState = settleCamp(dealCamp(setupRun({ seatIds: SEATS, seed: "backpack", catalog, camp: 1, items: { p0: ["c-1", "c-2", "c-3"] } }) as RunAt<"loadout">, catalog), "cleared", catalog);
    expect(run.stage.tag).toBe("draft");
    expect(accepts(run)).toEqual(["equip", "discard-item"]);
    for (const seatId of SEATS) run = act(run, seatId, { type: "pick-bundle", bundle: 0 });
    expect(run.stage.tag).toBe("event");
    expect(accepts(run)).toEqual(["equip", "discard-item"]);
    for (const seatId of SEATS) run = act(run, seatId, { type: "ready" });
    expect(run.stage.tag).toBe("route");
    expect(accepts(run)).toEqual(["equip", "discard-item"]);
    expect(act(run, "p0", { type: "equip", itemUids: ["it2"] }).seats[0]!.equipped).toEqual(["it2"]);
  });

  it("after its ready a seat can change nothing: equip and discard are already_ready", () => {
    const loadout = act(setupRun({ seatIds: SEATS, seed: "backpack", catalog, camp: 2, items: { p0: ["c-1"] } }), "p0", { type: "ready" });
    expect(applyRunAction(loadout, "p0", { type: "discard-item", itemUid: "it0" }, catalog)).toEqual({ ok: false, error: "already_ready" });
    expect(applyRunAction(loadout, "p0", { type: "equip", itemUids: [] }, catalog)).toEqual({ ok: false, error: "already_ready" });
  });

  it("a dropped seat with a full pack discards its last backpack item, then takes the first offer", () => {
    const run = draftWith(8);
    expect(absentSeatAction(run, "p0", catalog)).toEqual({ type: "discard-item", itemUid: "it7" });
    expect(absentSeatAction(act(run, "p0", { type: "discard-item", itemUid: "it7" }), "p0", catalog)).toEqual({ type: "pick-bundle", bundle: 0 });
  });
});

describe("a camp rule that takes a slot", () => {
  it("may push a full backpack to seven at the Rats' camp; equip never grows it, and the slot comes back after the camp", () => {
    const ratsCatalog = testCatalog({ items: catalog.items });
    const run = setupRun({ seatIds: SEATS, seed: "rats-pack", catalog: ratsCatalog, camp: 2, items: { p0: ITEMS.slice(0, 8) } });
    const next: CampSpec = { index: campIndex(3), location: "jungle", weather: "fair", slots: [{ kind: "win-card" }] };
    const atRoute: RunState = {
      ...run,
      plan: { ...run.plan!, bosses: [{ at: campIndex(3), tier: "animal", modId: "rats" }] },
      stage: { tag: "route", from: campIndex(2), options: [{ id: "a", next, reroll: 0, swapBoss: null }], ballots: {} },
    };
    const loadout = SEATS.reduce((acc, seatId) => {
      const result = applyRunAction(acc, seatId, { type: "vote", choice: "a" }, ratsCatalog);
      if (!result.ok) throw new Error(result.error);
      return result.state;
    }, atRoute);
    expect(loadout.seats[0]!.equipped).toEqual(["it0"]);
    expect(backpackOf(loadout.seats[0]!)).toHaveLength(7);
    expect(applyRunAction(loadout, "p0", { type: "equip", itemUids: [] }, ratsCatalog)).toEqual({ ok: false, error: "backpack_full" });
    expect(applyRunAction(loadout, "p0", { type: "equip", itemUids: ["it7"] }, ratsCatalog).ok).toBe(true);
    const failed = settleCamp(dealCamp(loadout as RunAt<"loadout">, ratsCatalog), "failed", ratsCatalog);
    expect(failed.stage.tag).toBe("shop");
    expect(failed.seats[0]!.equipped).toEqual(["it0", "it1"]);
    expect(backpackOf(failed.seats[0]!)).toHaveLength(6);
  });
});

describe("Pack Animal", () => {
  it("is the one way into the backpack in camp", () => {
    const upgrade = CHARACTERS["pack-rat"]!.upgrades.find((u) => u.id === "pack-rat.pack-animal")!;
    expect(upgrade.text).toBe("Open your backpack once each camp to swap items.");
  });
});
