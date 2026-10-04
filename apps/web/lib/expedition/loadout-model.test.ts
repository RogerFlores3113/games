import { describe, expect, it } from "vitest";
import type { ExpeditionSeatView, ExpeditionShopView } from "@games/rules";
import { buildGear, buildShop, equipAfter, tapMove, type ShopInput } from "./loadout-model";

function seat(equipped: string[], backpack: string[], over: Partial<ExpeditionSeatView> = {}): ExpeditionSeatView {
  const item = (uid: string) => ({ uid, itemId: "bait", remaining: { kind: "uses" as const, left: 1, of: 1 } });
  return {
    seatId: "s1",
    characterId: "scout",
    upgradeId: null,
    items: { equipped: equipped.map(item), backpack: backpack.map(item), concealed: false },
    pool: null,
    usage: [],
    ...over,
  };
}

describe("equipAfter", () => {
  it("fills the first free slot", () => {
    expect(equipAfter(["it1"], 2, { uid: "it2", to: { kind: "slot", index: 1 } })).toEqual(["it1", "it2"]);
  });

  it("swaps a backpack item into a full slot, sending the old one back", () => {
    expect(equipAfter(["it1", "it2"], 2, { uid: "it3", to: { kind: "slot", index: 0 } })).toEqual(["it3", "it2"]);
  });

  it("swaps two equipped items' slots", () => {
    expect(equipAfter(["it1", "it2"], 2, { uid: "it2", to: { kind: "slot", index: 0 } })).toEqual(["it2", "it1"]);
  });

  it("sends an equipped item to the backpack", () => {
    expect(equipAfter(["it1", "it2"], 2, { uid: "it1", to: { kind: "backpack" } })).toEqual(["it2"]);
  });

  it("changes nothing for a drop where the item already is, or past full slots", () => {
    expect(equipAfter(["it1"], 2, { uid: "it1", to: { kind: "slot", index: 0 } })).toBeNull();
    expect(equipAfter(["it1"], 2, { uid: "it3", to: { kind: "backpack" } })).toBeNull();
    expect(equipAfter(["it1", "it2"], 2, { uid: "it3", to: { kind: "slot", index: 2 } })).toBeNull();
  });
});

describe("tapMove", () => {
  it("sends an equipped item back and a backpack item to the next free slot", () => {
    const gear = buildGear(seat(["it1"], ["it2"]), 2, false, 0);
    expect(tapMove(gear, "it1")).toEqual({ uid: "it1", to: { kind: "backpack" } });
    expect(equipAfter(gear.equipped, 2, tapMove(gear, "it2"))).toEqual(["it1", "it2"]);
  });

  it("does nothing for a backpack item when the slots are full", () => {
    const gear = buildGear(seat(["it1", "it2"], ["it3"]), 2, false, 0);
    expect(equipAfter(gear.equipped, 2, tapMove(gear, "it3"))).toBeNull();
  });
});

describe("buildGear", () => {
  it("shows empty slots after the equipped ones, and keeps an item carried over lowered slots", () => {
    expect(buildGear(seat(["it1"], []), 3, false, 0).slots.map((s) => [s.objectId, s.item?.uid ?? null])).toEqual([
      ["slot:0", "it1"],
      ["slot:1", null],
      ["slot:2", null],
    ]);
    expect(buildGear(seat(["it1", "it2"], []), 1, false, 0).slots.map((s) => s.item?.uid)).toEqual(["it1", "it2"]);
  });
});

describe("buildShop", () => {
  const shop: ExpeditionShopView = {
    stock: [
      { stockId: "supplies", what: { kind: "supplies" }, price: 6, soldTo: null },
      { stockId: "item0", what: { kind: "item", itemId: "bait" }, price: 2, soldTo: null },
    ],
    yourUpgrades: [],
  };
  const input = (over: Partial<ShopInput> = {}): ShopInput => ({
    shop,
    purse: 10,
    supplies: { count: 3, max: 4 },
    you: seat([], []),
    ready: false,
    nameOf: (id) => id,
    ...over,
  });
  const buys = (over: Partial<ShopInput> = {}) => buildShop(input(over)).entries.map((e) => [e.stockId, e.buy]);

  it("lets you buy what the purse covers", () => {
    expect(buys()).toEqual([
      ["supplies", { kind: "buy" }],
      ["item0", { kind: "buy" }],
    ]);
  });

  it("marks supplies Full at the cap before checking the purse", () => {
    expect(buys({ supplies: { count: 4, max: 4 }, purse: 0 })).toEqual([
      ["supplies", { kind: "disabled", reason: "Full" }],
      ["item0", { kind: "disabled", reason: "Need 2 more" }],
    ]);
  });

  it("locks every buy once you are ready, and offers a spectator no button", () => {
    expect(buys({ ready: true })).toEqual([
      ["supplies", { kind: "disabled", reason: "Locked" }],
      ["item0", { kind: "disabled", reason: "Locked" }],
    ]);
    expect(buys({ you: undefined })).toEqual([
      ["supplies", { kind: "status", label: "" }],
      ["item0", { kind: "status", label: "" }],
    ]);
  });

  it("shows the upgrade you bought as owned", () => {
    const entries = buildShop(input({ you: seat([], [], { upgradeId: "scout.keen-eye" }) })).entries;
    expect(entries.at(-1)).toEqual({
      stockId: "upgrade:scout.keen-eye",
      objectId: "shop:upgrade:scout.keen-eye",
      infoId: "shop-info:upgrade:scout.keen-eye",
      sourceId: "scout.keen-eye",
      name: "Keen Eye",
      detail: "Upgrade, +1 whisper",
      rare: false,
      price: null,
      buy: { kind: "status", label: "Owned" },
    });
  });
});
