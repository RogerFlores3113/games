import type { ExpeditionItemView, ExpeditionView } from "@games/rules";
import { BALANCE_DISPLAY, SOURCE_DISPLAY } from "@games/rules";
import { packCellObjectId, packObjectId, slotObjectId } from "./expedition-ids";
import { choiceFor, currentStep, type LocalUiState } from "./local-ui";
import { sourceName, usesLabel, yourSourceId } from "./source-text";

/**
 * Your backpack and item slots, as the inventory window shows them. Every
 * change to the slots is one `equip` with the whole new set and every
 * discard one `discard-item`; the moves here only compute those, and the
 * worker decides.
 */

export interface InventoryItem {
  uid: string;
  itemId: string;
  objectId: string;
  name: string;
  /** What it does. */
  text: string;
  /** What is left: "Single use", "Once per camp", "1 of 2 charges", "Always on". */
  uses: string;
  rare: boolean;
  /** A choice of the power you are aiming (a sale, a gift). */
  targetable: boolean;
  /** What picking it gives you ("+2" for a sale). */
  tag: string | null;
}

/** An item slot or a backpack patch, and what is in it. */
export interface InventoryCell {
  objectId: string;
  item: InventoryItem | null;
}

export interface Inventory {
  /** Shown: opened from the backpack button, or a power aimed at an item. */
  open: boolean;
  /** Equipped uids in slot order: slot i holds `equipped[i]`. */
  equipped: string[];
  slots: InventoryCell[];
  /** The backpack's items in order, then its empty patches: at least
   * `capacity` cells, more when a camp rule pushed it past its size. */
  backpack: InventoryCell[];
  capacity: number;
  /** Items in the backpack. */
  stored: number;
  /** Ready, or not between camps: nothing moves. */
  locked: boolean;
  /** What to pick while a power is aimed at one of your items; null otherwise. */
  aiming: string | null;
  /** The item waiting for "Discard for good?". */
  discard: { uid: string; name: string } | null;
}

export type ItemMove = { uid: string; to: { kind: "slot"; index: number } | { kind: "backpack" } };

const BETWEEN_CAMPS: ReadonlySet<string> = new Set(["shop", "draft", "event", "route", "loadout"]);

function readied(view: ExpeditionView): boolean {
  const stage = view.stage;
  return "readySeatIds" in stage && view.yourSeatId !== null && stage.readySeatIds.includes(view.yourSeatId);
}

function itemOf(view: ExpeditionView, ui: LocalUiState, item: ExpeditionItemView, objectId: string, selling: boolean): InventoryItem {
  const targetable = choiceFor(ui, view, "item", item.uid) !== null;
  const display = SOURCE_DISPLAY[item.itemId];
  const sellsFor = display?.item?.sellsFor;
  return {
    uid: item.uid,
    itemId: item.itemId,
    objectId,
    name: sourceName(item.itemId),
    text: display?.text ?? "",
    uses: usesLabel(item.itemId, item.remaining).full,
    rare: display?.item?.rarity === "rare",
    targetable,
    tag: targetable && selling && sellsFor !== undefined ? `+${sellsFor}` : null,
  };
}

/** Your inventory, or null for a spectator. */
export function buildInventory(view: ExpeditionView, ui: LocalUiState): Inventory | null {
  const you = view.seats.find((s) => s.seatId === view.yourSeatId);
  if (you === undefined) return null;
  const step = currentStep(ui, view);
  const aiming = step?.kind === "item" ? step.prompt : null;
  const selling = aiming !== null && ui.targeting?.mode === "ability" && yourSourceId(view, ui.targeting.sourceKey) === "businessman";
  const equipped = you.items.equipped;
  const stored = you.items.backpack ?? [];
  const capacity = BALANCE_DISPLAY.backpackSize;
  const slotCount = Math.max(view.yourItemSlots, equipped.length);
  const discarded = [...equipped, ...stored].find((item) => item.uid === ui.discardUid);
  return {
    open: ui.inventoryOpen !== null || aiming !== null,
    equipped: equipped.map((item) => item.uid),
    slots: Array.from({ length: slotCount }, (_, i) => {
      const item = equipped[i];
      return { objectId: slotObjectId(i), item: item === undefined ? null : itemOf(view, ui, item, slotObjectId(i), selling) };
    }),
    backpack: Array.from({ length: Math.max(capacity, stored.length) }, (_, i) => {
      const item = stored[i];
      return item === undefined ? { objectId: packCellObjectId(i), item: null } : { objectId: packObjectId(item.uid), item: itemOf(view, ui, item, packObjectId(item.uid), selling) };
    }),
    capacity,
    stored: stored.length,
    locked: !BETWEEN_CAMPS.has(view.stage.tag) || readied(view),
    aiming,
    discard: discarded === undefined ? null : { uid: discarded.uid, name: sourceName(discarded.itemId) },
  };
}

/** How many new items fit: free slots, then room left in the backpack. */
export function roomFor(inventory: Inventory): number {
  const free = inventory.slots.length - inventory.equipped.length;
  return Math.max(0, free) + Math.max(0, inventory.capacity - inventory.stored);
}

/** The equipped set after `move`, or null when it changes nothing or does
 * not fit. A full slot swaps: its item goes to the backpack, or to the
 * dragged item's old slot. Empty slots are always the last ones; the
 * backpack takes an item only while it has room. */
export function equipAfter(inventory: Inventory, move: ItemMove): string[] | null {
  const equipped = inventory.equipped;
  const from = equipped.indexOf(move.uid);
  if (move.to.kind === "backpack") {
    if (from === -1 || inventory.stored >= inventory.capacity) return null;
    return equipped.filter((uid) => uid !== move.uid);
  }
  const to = move.to.index;
  if (from !== -1) {
    if (to === from || to >= equipped.length) return null;
    const next = [...equipped];
    [next[from], next[to]] = [next[to]!, next[from]!];
    return next;
  }
  if (to < equipped.length) return equipped.map((uid, i) => (i === to ? move.uid : uid));
  return equipped.length < inventory.slots.length ? [...equipped, move.uid] : null;
}

/** A click on an item: an equipped one goes to the backpack, a backpack
 * one to the first free slot. The new equipped set, or why it can't move. */
export function clickMove(inventory: Inventory, uid: string): { itemUids: string[] } | { notice: string } {
  const equipped = inventory.equipped.includes(uid);
  const move: ItemMove = equipped ? { uid, to: { kind: "backpack" } } : { uid, to: { kind: "slot", index: inventory.equipped.length } };
  const itemUids = equipAfter(inventory, move);
  if (itemUids !== null) return { itemUids };
  return { notice: equipped ? "Your backpack is full. Discard an item to make room." : "Your item slots are full. Drag onto a slot to swap." };
}
