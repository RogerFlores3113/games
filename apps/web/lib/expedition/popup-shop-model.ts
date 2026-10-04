import type { ExpeditionView } from "@games/rules";
import { SOURCE_DISPLAY } from "@games/rules";
import type { LocalUiState } from "./local-ui";
import { currentStep } from "./local-ui";
import { sourceName, yourSourceId } from "./source-text";

/**
 * The Businessman's Pop-up Shop while it is open: its stock, each item with
 * a button per player it may go to, and the refresh. Its choices come from
 * the server's option step (`option:buy:<place>:<item>:<price>:<seat>`,
 * `option:refresh:<price>`); a click picks one, and Confirm buys it.
 */

export const POPUP_SHOP = "businessman.pop-up-shop";

export interface PopupPick {
  choiceId: string;
  objectId: string;
  label: string;
  selected: boolean;
}

export interface PopupShopModel {
  title: string;
  rows: { itemId: string; name: string; price: number; rare: boolean; infoId: string; buys: PopupPick[] }[];
  refresh: PopupPick | null;
  purse: number;
}

export function popupObjectId(choiceId: string): string {
  return `popup:${choiceId.slice("option:".length)}`;
}

export function buildPopupShop(view: ExpeditionView, ui: LocalUiState, nameOf: (seatId: string) => string): PopupShopModel | null {
  const targeting = ui.targeting;
  const step = currentStep(ui, view);
  if (targeting?.mode !== "ability" || step?.kind !== "option" || yourSourceId(view, targeting.sourceKey) !== POPUP_SHOP) return null;
  const pick = (choiceId: string, label: string): PopupPick => ({ choiceId, objectId: popupObjectId(choiceId), label, selected: targeting.selected.includes(choiceId) });
  const rows: PopupShopModel["rows"] = [];
  let refresh: PopupPick | null = null;
  for (const choiceId of step.choices) {
    const [, kind, ...rest] = choiceId.split(":");
    if (kind === "refresh") {
      const price = Number(rest[0]);
      refresh = pick(choiceId, `Refresh, ${price} ${price === 1 ? "coin" : "coins"}`);
      continue;
    }
    const [place, itemId, price, seatId] = rest as [string, string, string, string];
    let row = rows.find((r) => r.infoId === `popup-info:${place}`);
    if (row === undefined) {
      row = { itemId, name: sourceName(itemId), price: Number(price), rare: SOURCE_DISPLAY[itemId]?.item?.rarity === "rare", infoId: `popup-info:${place}`, buys: [] };
      rows.push(row);
    }
    row.buys.push(pick(choiceId, seatId === view.yourSeatId ? "You" : nameOf(seatId)));
  }
  return { title: "Pop-up Shop", rows, refresh, purse: view.purse };
}
