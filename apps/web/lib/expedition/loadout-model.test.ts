import { describe, expect, it } from "vitest";
import type { ExpeditionSeatView, ExpeditionShopView } from "@games/rules";
import { buildShop, type ShopInput } from "./loadout-model";

function seat(equipped: string[], backpack: string[], over: Partial<ExpeditionSeatView> = {}): ExpeditionSeatView {
  const item = (uid: string) => ({ uid, itemId: "bait", remaining: { kind: "uses" as const, left: 1, of: 1 } });
  return {
    seatId: "s1",
    characterId: "explorer",
    upgradeId: null,
    items: { equipped: equipped.map(item), backpack: backpack.map(item), concealed: false },
    usage: [],
    ...over,
  };
}

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
    room: 3,
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

  it("sends you to your backpack for an item it has no room for", () => {
    expect(buys({ room: 0 })).toEqual([
      ["supplies", { kind: "buy" }],
      ["item0", { kind: "full" }],
    ]);
  });

  it("shows the upgrade you bought as owned", () => {
    const entries = buildShop(input({ you: seat([], [], { upgradeId: "leader.open-ears" }) })).entries;
    expect(entries.at(-1)).toEqual({
      stockId: "upgrade:leader.open-ears",
      objectId: "shop:upgrade:leader.open-ears",
      infoId: "shop-info:upgrade:leader.open-ears",
      sourceId: "leader.open-ears",
      name: "Open Ears",
      detail: "Upgrade, +1 whisper",
      rare: false,
      price: null,
      buy: { kind: "status", label: "Owned" },
    });
  });
});
