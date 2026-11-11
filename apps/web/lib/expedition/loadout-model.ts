import { BALANCE_DISPLAY, type ExpeditionSeatView, type ExpeditionShopView } from "@games/rules";
import { sourceName } from "./source-text";
import { shopInfoObjectId, shopObjectId } from "./expedition-ids";
import { rarityItemLabel, rarityOf, type ItemRarity } from "./rarity";

/**
 * The shop before a shop camp: the shared stock, then your character's
 * upgrades. A buy only calls the worker, which decides.
 */

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

/** The upgrade line's detail: names the whisper only while an upgrade still adds one. */
function upgradeDetail(whispers: number): string {
  return whispers > 0 ? `Upgrade, +${whispers} whisper${whispers === 1 ? "" : "s"}` : "Upgrade";
}
const UPGRADE_DETAIL = upgradeDetail(BALANCE_DISPLAY.whispersPerUpgrade);

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
  rarity: ItemRarity;
  /** Null once it is sold or owned. */
  price: number | null;
  buy: ShopBuy;
}

/** A teammate you can hand a coin of your share to. */
export interface ShopGive {
  seatId: string;
  name: string;
  /** Their share now. */
  share: number;
  /** Your share has a coin to give and you are not ready. */
  enabled: boolean;
}

export interface ShopPanel {
  purse: number;
  /** Your own share of the purse (0 for a spectator) and the crew pot. */
  share: number;
  pot: number;
  /** One per teammate; empty for a spectator. */
  give: ShopGive[];
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
  const spendable = shareOf(input) + input.shop.pot;
  if (spendable < price) return { kind: "disabled", reason: `Need ${price - spendable} more` };
  if (item && input.room === 0) return { kind: "full" };
  return { kind: "buy" };
}

/** Your own share, from the view's public share list. */
function shareOf(input: ShopInput): number {
  return input.you === undefined ? 0 : (input.shop.shares.find((s) => s.seatId === input.you!.seatId)?.coins ?? 0);
}

function itemEntry(stockId: string, sourceId: string, name: string, detail: string, price: number | null, buy: ShopBuy): ShopEntry {
  return {
    stockId,
    objectId: shopObjectId(stockId),
    infoId: shopInfoObjectId(stockId),
    sourceId,
    name,
    detail,
    rarity: rarityOf(sourceId),
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
        rarity: "common",
        price: entry.price,
        buy: buyState(entry.price, input, full ? { kind: "disabled", reason: "Full" } : null),
      };
    }
    const sold: ShopBuy | null = entry.soldTo === null ? null : { kind: "status", label: `Sold to ${input.nameOf(entry.soldTo)}` };
    const rarity = rarityItemLabel(rarityOf(what.itemId));
    return itemEntry(entry.stockId, what.itemId, sourceName(what.itemId), rarity, sold === null ? entry.price : null, buyState(entry.price, input, sold, true));
  });
  const upgrades = input.shop.yourUpgrades.map((offer) =>
    itemEntry(offer.stockId, offer.upgradeId, sourceName(offer.upgradeId), UPGRADE_DETAIL, offer.price, buyState(offer.price, input, null)),
  );
  const owned = input.you?.upgradeId ?? null;
  const ownedEntry = owned === null ? [] : [itemEntry(`upgrade:${owned}`, owned, sourceName(owned), UPGRADE_DETAIL, null, { kind: "status", label: "Owned" })];
  const share = shareOf(input);
  const give: ShopGive[] =
    input.you === undefined
      ? []
      : input.shop.shares.filter((s) => s.seatId !== input.you!.seatId).map((s) => ({ seatId: s.seatId, name: input.nameOf(s.seatId), share: s.coins, enabled: share >= 1 && !input.ready }));
  return { purse: input.purse, share, pot: input.shop.pot, give, entries: [...entries, ...upgrades, ...ownedEntry] };
}
