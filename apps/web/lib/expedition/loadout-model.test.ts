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
    shares: [],
    pot: 10,
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
    expect(buys({ supplies: { count: 4, max: 4 }, shop: { ...shop, pot: 0 } })).toEqual([
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

  it("reads affordability from your share plus the crew pot, not the whole purse", () => {
    const split: ExpeditionShopView = { ...shop, shares: [{ seatId: "s1", coins: 1 }, { seatId: "s2", coins: 5 }], pot: 1 };
    // You hold 1 and the pot 1: 2 buys the item (2), not the supplies (6), though the purse holds 7.
    expect(buys({ shop: split, purse: 7 })).toEqual([
      ["supplies", { kind: "disabled", reason: "Need 4 more" }],
      ["item0", { kind: "buy" }],
    ]);
    const panel = buildShop(input({ shop: split, purse: 7 }));
    expect([panel.share, panel.pot]).toEqual([1, 1]);
    expect(panel.give).toEqual([{ seatId: "s2", name: "s2", share: 5, enabled: true }]);
  });

  it("offers no Give to a spectator, and dims it once you are ready or hold nothing", () => {
    const split: ExpeditionShopView = { ...shop, shares: [{ seatId: "s1", coins: 0 }, { seatId: "s2", coins: 5 }], pot: 0 };
    expect(buildShop(input({ shop: split, you: undefined })).give).toEqual([]);
    expect(buildShop(input({ shop: split })).give.map((g) => g.enabled)).toEqual([false]);
    const rich: ExpeditionShopView = { ...split, shares: [{ seatId: "s1", coins: 3 }, { seatId: "s2", coins: 5 }] };
    expect(buildShop(input({ shop: rich, ready: true })).give.map((g) => g.enabled)).toEqual([false]);
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
