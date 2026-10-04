import { describe, expect, it } from "vitest";
import type { ExpeditionView } from "@games/rules";
import { initialLocalUi } from "./local-ui";
import { buildPopupShop } from "./popup-shop-model";

const SHOP = "businessman.pop-up-shop";
const choices = ["option:buy:0:bait:4:p0", "option:buy:0:bait:4:p1", "option:buy:2:trail-map:9:p0", "option:buy:2:trail-map:9:p1", "option:refresh:2"];
const view = {
  yourSeatId: "p0",
  purse: 13,
  seats: [{ seatId: "p0", characterId: "businessman", upgradeId: SHOP, items: { equipped: [], backpack: [], concealed: false }, usage: [] }],
  yourAbilities: [{ sourceKey: SHOP, usableNow: true, reason: null, steps: [{ kind: "option", prompt: "Buy an item for a player, or refresh the stock", choices }] }],
} as unknown as ExpeditionView;
const names = (seatId: string) => ({ p1: "Bob" })[seatId] ?? seatId;

describe("the Pop-up Shop panel", () => {
  it("rows the stock with prices and a button per player, then the refresh with its price", () => {
    const ui = { ...initialLocalUi(), targeting: { mode: "ability" as const, sourceKey: SHOP, selected: [], heldId: null } };
    expect(buildPopupShop(view, ui, names)).toEqual({
      title: "Pop-up Shop",
      purse: 13,
      rows: [
        {
          itemId: "bait",
          name: "Bait",
          price: 4,
          rare: false,
          infoId: "popup-info:0",
          buys: [
            { choiceId: choices[0], objectId: "popup:buy:0:bait:4:p0", label: "You", selected: false },
            { choiceId: choices[1], objectId: "popup:buy:0:bait:4:p1", label: "Bob", selected: false },
          ],
        },
        {
          itemId: "trail-map",
          name: "Trail Map",
          price: 9,
          rare: true,
          infoId: "popup-info:2",
          buys: [
            { choiceId: choices[2], objectId: "popup:buy:2:trail-map:9:p0", label: "You", selected: false },
            { choiceId: choices[3], objectId: "popup:buy:2:trail-map:9:p1", label: "Bob", selected: false },
          ],
        },
      ],
      refresh: { choiceId: "option:refresh:2", objectId: "popup:refresh:2", label: "Refresh, 2 coins", selected: false },
    });
  });

  it("is closed unless the shop is the power being used", () => {
    expect(buildPopupShop(view, initialLocalUi(), names)).toBeNull();
  });
});
