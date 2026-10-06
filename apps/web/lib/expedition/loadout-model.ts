import type { ExpeditionSeatView, ExpeditionShopView } from "@games/rules";
import { SOURCE_DISPLAY } from "@games/rules";
import { shopInfoObjectId, shopObjectId } from "./expedition-ids";
import { sourceName } from "./source-text";

/**
 * The shop before a boss camp: the shared stock, then your character's
 * upgrades. A buy only calls the worker, which decides.
 */

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

/** `buy`: the button is live. `disabled`: a dimmed button saying why it
 * can't be bought now ("Need 2 more", "Full", "Locked"). `full`: an item
 * your backpack has no room for; its button opens the backpack. `status`:
 * no button, just what happened to it ("Sold to Bob", "Owned"); empty for
 * a spectator. */
export type ShopBuy = { kind: "buy" } | { kind: "disabled"; reason: string } | { kind: "full" } | { kind: "status"; label: string };

export interface ShopEntry {
  stockId: string;
  /** The buy button. */
  objectId: string;
  /** The name and icon, for its rules on hover; null for supplies. */
  infoId: string | null;
  /** The def id for the icon and the rules; null for supplies. */
  sourceId: string | null;
  name: string;
  detail: string;
  rare: boolean;
  /** Null once it is sold or owned. */
  price: number | null;
  buy: ShopBuy;
}

export interface ShopPanel {
  purse: number;
  entries: ShopEntry[];
}

export interface ShopInput {
  shop: ExpeditionShopView;
  purse: number;
  supplies: { count: number; max: number };
  /** Your seat, or undefined for a spectator. */
  you: ExpeditionSeatView | undefined;
  ready: boolean;
  /** How many more items you can carry (`roomFor`). */
  room: number;
  nameOf(seatId: string): string;
}

/** The entry's own refusal first, so a sold or full line says so even once
 * you are ready; then ready, then the purse, then room for an item. */
function buyState(price: number, input: ShopInput, refusal: ShopBuy | null, item = false): ShopBuy {
  if (refusal !== null) return refusal;
  if (input.you === undefined) return { kind: "status", label: "" };
  if (input.ready) return { kind: "disabled", reason: "Locked" };
  if (input.purse < price) return { kind: "disabled", reason: `Need ${price - input.purse} more` };
  if (item && input.room === 0) return { kind: "full" };
  return { kind: "buy" };
}

function itemEntry(stockId: string, sourceId: string, name: string, detail: string, price: number | null, buy: ShopBuy): ShopEntry {
  return {
    stockId,
    objectId: shopObjectId(stockId),
    infoId: shopInfoObjectId(stockId),
    sourceId,
    name,
    detail,
    rare: SOURCE_DISPLAY[sourceId]?.item?.rarity === "rare",
    price,
    buy,
  };
}

/** Supplies, then the items, then your character's upgrades: the ones on
 * sale while you own none, or the one you bought. */
export function buildShop(input: ShopInput): ShopPanel {
  const entries = input.shop.stock.map((entry): ShopEntry => {
    const what = entry.what;
    if (what.kind === "supplies") {
      const full = input.supplies.count >= input.supplies.max;
      return {
        stockId: entry.stockId,
        objectId: shopObjectId(entry.stockId),
        infoId: null,
        sourceId: null,
        name: `Supplies ${input.supplies.count} of ${input.supplies.max}`,
        detail: "One per failed camp",
        rare: false,
        price: entry.price,
        buy: buyState(entry.price, input, full ? { kind: "disabled", reason: "Full" } : null),
      };
    }
    const sold: ShopBuy | null = entry.soldTo === null ? null : { kind: "status", label: `Sold to ${input.nameOf(entry.soldTo)}` };
    const rarity = SOURCE_DISPLAY[what.itemId]?.item?.rarity === "rare" ? "Rare item" : "Common item";
    return itemEntry(entry.stockId, what.itemId, sourceName(what.itemId), rarity, sold === null ? entry.price : null, buyState(entry.price, input, sold, true));
  });
  const upgrades = input.shop.yourUpgrades.map((offer) =>
    itemEntry(offer.stockId, offer.upgradeId, sourceName(offer.upgradeId), "Upgrade, +1 whisper", offer.price, buyState(offer.price, input, null)),
  );
  const owned = input.you?.upgradeId ?? null;
  const ownedEntry = owned === null ? [] : [itemEntry(`upgrade:${owned}`, owned, sourceName(owned), "Upgrade, +1 whisper", null, { kind: "status", label: "Owned" })];
  return { purse: input.purse, entries: [...entries, ...upgrades, ...ownedEntry] };
}
