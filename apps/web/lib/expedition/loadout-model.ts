import type { ExpeditionItemView, ExpeditionSeatView, ExpeditionShopView } from "@games/rules";
import { SOURCE_DISPLAY } from "@games/rules";
import { packObjectId, shopInfoObjectId, shopObjectId, slotObjectId } from "./expedition-ids";
import { sourceName, usesLabel } from "./source-text";

/**
 * The loadout's gear (your slots and backpack) and the shop before a boss
 * camp. Every change to the slots is one `equip` with the whole new set;
 * the moves here only compute that set, and the worker decides.
 */

export interface GearItem {
  uid: string;
  itemId: string;
  objectId: string;
  name: string;
  /** What is left: "Single use", "Once per camp", "Used this camp",
   * "1 of 2 charges", "Always on". */
  uses: string;
  rare: boolean;
}

export interface GearSlot {
  index: number;
  objectId: string;
  item: GearItem | null;
}

export interface Gear {
  /** Equipped uids in slot order: slot i holds `equipped[i]`. */
  equipped: string[];
  slots: GearSlot[];
  backpack: GearItem[];
  /** The backpack page asked for; the scene clamps it to the pages it draws. */
  page: number;
  /** Ready: nothing can move until the camp is dealt. */
  locked: boolean;
}

export type GearMove = { uid: string; to: { kind: "slot"; index: number } | { kind: "backpack" } };

function gearItem(item: ExpeditionItemView, objectId: string): GearItem {
  return {
    uid: item.uid,
    itemId: item.itemId,
    objectId,
    name: sourceName(item.itemId),
    uses: usesLabel(item.itemId, item.remaining).full,
    rare: SOURCE_DISPLAY[item.itemId]?.item?.rarity === "rare",
  };
}

export function buildGear(seat: ExpeditionSeatView, slotCount: number, locked: boolean, page: number): Gear {
  const equipped = seat.items.equipped;
  const count = Math.max(slotCount, equipped.length);
  return {
    equipped: equipped.map((item) => item.uid),
    slots: Array.from({ length: count }, (_, i) => {
      const item = equipped[i];
      return { index: i, objectId: slotObjectId(i), item: item === undefined ? null : gearItem(item, slotObjectId(i)) };
    }),
    backpack: (seat.items.backpack ?? []).map((item) => gearItem(item, packObjectId(item.uid))),
    page,
    locked,
  };
}

/** The equipped set after `move`, or null when it changes nothing or the
 * slots are full. A full slot swaps: its item goes to the backpack, or to
 * the dragged item's old slot. Empty slots are always the last ones. */
export function equipAfter(equipped: readonly string[], slotCount: number, move: GearMove): string[] | null {
  const from = equipped.indexOf(move.uid);
  if (move.to.kind === "backpack") return from === -1 ? null : equipped.filter((uid) => uid !== move.uid);
  const to = move.to.index;
  if (from !== -1) {
    if (to === from || to >= equipped.length) return null;
    const next = [...equipped];
    [next[from], next[to]] = [next[to]!, next[from]!];
    return next;
  }
  if (to < equipped.length) return equipped.map((uid, i) => (i === to ? move.uid : uid));
  return equipped.length < slotCount ? [...equipped, move.uid] : null;
}

/** A tap: an equipped item goes back to the backpack; a backpack item
 * fills the first free slot, or nothing when the slots are full. */
export function tapMove(gear: Gear, uid: string): GearMove {
  return gear.equipped.includes(uid) ? { uid, to: { kind: "backpack" } } : { uid, to: { kind: "slot", index: gear.equipped.length } };
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

/** `buy`: the button is live. `disabled`: a dimmed button saying why it
 * can't be bought now ("Need 2 more", "Full", "Locked"). `status`: no
 * button, just what happened to it ("Sold to Bob", "Owned"); empty for a
 * spectator. */
export type ShopBuy = { kind: "buy" } | { kind: "disabled"; reason: string } | { kind: "status"; label: string };

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
  nameOf(seatId: string): string;
}

/** The entry's own refusal first, so a sold or full line says so even once
 * you are ready; then ready, then the purse. */
function buyState(price: number, input: ShopInput, refusal: ShopBuy | null): ShopBuy {
  if (refusal !== null) return refusal;
  if (input.you === undefined) return { kind: "status", label: "" };
  if (input.ready) return { kind: "disabled", reason: "Locked" };
  if (input.purse < price) return { kind: "disabled", reason: `Need ${price - input.purse} more` };
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
    return itemEntry(entry.stockId, what.itemId, sourceName(what.itemId), rarity, sold === null ? entry.price : null, buyState(entry.price, input, sold));
  });
  const upgrades = input.shop.yourUpgrades.map((offer) =>
    itemEntry(offer.stockId, offer.upgradeId, sourceName(offer.upgradeId), "Upgrade, +1 whisper", offer.price, buyState(offer.price, input, null)),
  );
  const owned = input.you?.upgradeId ?? null;
  const ownedEntry = owned === null ? [] : [itemEntry(`upgrade:${owned}`, owned, sourceName(owned), "Upgrade, +1 whisper", null, { kind: "status", label: "Owned" })];
  return { purse: input.purse, entries: [...entries, ...upgrades, ...ownedEntry] };
}
