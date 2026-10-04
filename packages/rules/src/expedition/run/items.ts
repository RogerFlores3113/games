// Item instances: minting from the draft, the shop or the dev panel, and
// the equipped set a seat carries into camp.

import { rulesFor } from "./compose";
import type { Catalog, ItemInstance, RunError, RunState, SeatId } from "./types";
import { seatOf } from "./usage";

/** One new instance per id, uids from run.itemSerial. A new instance is
 * equipped while the seat has a free slot, else it goes to the backpack, so
 * a player who never opens the backpack still carries what they took. */
export function mintItems(run: RunState, seatId: SeatId, itemIds: readonly string[], catalog: Catalog): RunState {
  const slots = rulesFor(run, catalog).itemSlots(run, seatId);
  const seat = seatOf(run, seatId);
  const minted: ItemInstance[] = itemIds.map((itemId, i) => ({ uid: `it${run.itemSerial + i}`, itemId }));
  const free = Math.max(0, slots - seat.equipped.length);
  const equipped = [...seat.equipped, ...minted.slice(0, free).map((item) => item.uid)];
  const seats = run.seats.map((s) => (s.seatId === seatId ? { ...s, items: [...s.items, ...minted], equipped } : s));
  return { ...run, itemSerial: run.itemSerial + minted.length, seats };
}

/** Why `uids` cannot be the seat's equipped set, or null: every uid owned
 * and distinct (not_owned_item), at most rules.itemSlots (too_many_items). */
export function equipError(run: RunState, seatId: SeatId, uids: readonly string[], catalog: Catalog): RunError | null {
  const seat = seatOf(run, seatId);
  if (new Set(uids).size !== uids.length || uids.some((uid) => !seat.items.some((item) => item.uid === uid))) return "not_owned_item";
  return uids.length > rulesFor(run, catalog).itemSlots(run, seatId) ? "too_many_items" : null;
}
