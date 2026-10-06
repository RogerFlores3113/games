// Item instances: minting from the draft, the shop or the dev panel, the
// equipped set a seat carries into camp, and the backpack beside it.

import { BACKPACK_SIZE } from "./balance";
import { rulesFor } from "./compose";
import type { Catalog, ItemInstance, RunError, RunState, SeatId } from "./types";
import { backpackOf, seatOf } from "./usage";

/** How many more items the seat can take: its free slots plus the room left
 * in its backpack. */
export function roomFor(run: RunState, seatId: SeatId, catalog: Catalog): number {
  const seat = seatOf(run, seatId);
  const slots = Math.max(0, rulesFor(run, catalog).itemSlots(run, seatId) - seat.equipped.length);
  return slots + Math.max(0, BACKPACK_SIZE - backpackOf(seat).length);
}

/** One new instance per id, uids from run.itemSerial. A new instance is
 * equipped while the seat has a free slot, else it goes to the backpack, so
 * a player who never opens the backpack still carries what they took.
 * POLICY A3: callers check roomFor first; more than fits throws. */
export function mintItems(run: RunState, seatId: SeatId, itemIds: readonly string[], catalog: Catalog): RunState {
  const room = roomFor(run, seatId, catalog);
  if (itemIds.length > room) throw new Error(`mintItems: ${seatId} has room for ${room} more items, not ${itemIds.length}`);
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

/** Only a camp rule that takes a slot (Rats) can push a backpack past
 * BACKPACK_SIZE. Once the camp is over the slot is back, and the backpack's
 * first items fill it until the backpack fits again. */
export function refitSlots(run: RunState, catalog: Catalog): RunState {
  const rules = rulesFor(run, catalog);
  const seats = run.seats.map((seat) => {
    const over = backpackOf(seat).length - BACKPACK_SIZE;
    const free = rules.itemSlots(run, seat.seatId) - seat.equipped.length;
    const moved = backpackOf(seat).slice(0, Math.max(0, Math.min(over, free))).map((item) => item.uid);
    return moved.length > 0 ? { ...seat, equipped: [...seat.equipped, ...moved] } : seat;
  });
  return seats.some((seat, i) => seat !== run.seats[i]) ? { ...run, seats } : run;
}

/** The seat without one of its items, equipped or not. */
export function discardItem(run: RunState, seatId: SeatId, uid: string): RunState | RunError {
  const seat = seatOf(run, seatId);
  if (!seat.items.some((item) => item.uid === uid)) return "not_owned_item";
  const seats = run.seats.map((s) => (s.seatId === seatId ? { ...s, items: s.items.filter((item) => item.uid !== uid), equipped: s.equipped.filter((e) => e !== uid) } : s));
  return { ...run, seats };
}
