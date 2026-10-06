// What the table does for a seat that has been gone past the room's grace,
// so a dropped player never holds the others: the room submits it as that
// seat's own action.

import { attemptOf } from "./attempt";
import { BACKPACK_SIZE } from "./balance";
import { rulesFor } from "./compose";
import { firstFreeCharacter } from "./crew";
import { roomFor } from "./items";
import { backpackOf } from "./usage";
import type { Catalog, RunAction, RunState } from "./types";
import { gatedPendingSeatIds } from "./windows";

/** Muster: the first character nobody has, in registry order, then an
 * abstention, then a lock-in. A route vote: an abstention. Shop and event:
 * ready. Loadout: ready, once a set over its slots is cut to its first items
 * (or its last discarded while the backpack has no room). Draft: the head
 * offer's first bundle, after discarding its last backpack items while that
 * bundle does not fit. A gated window: a pass. null when the table is not
 * waiting on the seat. */
export function absentSeatAction(run: RunState, seatId: string, catalog: Catalog): RunAction | null {
  const seat = run.seats.find((s) => s.seatId === seatId);
  if (seat === undefined) return null;
  const stage = run.stage;
  switch (stage.tag) {
    case "muster": {
      if (seat.characterId === null) {
        const free = firstFreeCharacter(run, catalog);
        if (free !== null) return { type: "pick-character", characterId: free };
      }
      if (!Object.hasOwn(stage.ballots, seatId)) return { type: "vote", choice: null };
      return Object.hasOwn(stage.locked, seatId) ? null : { type: "lock-in" };
    }
    case "route":
      return Object.hasOwn(stage.ballots, seatId) ? null : { type: "vote", choice: null };
    case "loadout": {
      if (Object.hasOwn(stage.ready, seatId)) return null;
      const slots = Math.max(0, rulesFor(run, catalog).itemSlots(run, seatId));
      if (seat.equipped.length <= slots) return { type: "ready" };
      // Unequipping must not grow a backpack past its size (outfit.ts), so the
      // last equipped item goes instead.
      const stored = seat.items.length - slots;
      return stored > Math.max(BACKPACK_SIZE, backpackOf(seat).length) ? { type: "discard-item", itemUid: seat.equipped.at(-1)! } : { type: "equip", itemUids: seat.equipped.slice(0, slots) };
    }
    case "shop":
    case "event":
      return Object.hasOwn(stage.ready, seatId) ? null : { type: "ready" };
    case "draft": {
      const first = seat.offers[0]?.bundles[0];
      if (first === undefined) return null;
      const last = backpackOf(seat).at(-1);
      return first.length > roomFor(run, seatId, catalog) && last !== undefined ? { type: "discard-item", itemUid: last.uid } : { type: "pick-bundle", bundle: 0 };
    }
    case "camp":
      return attemptOf(run) !== null && gatedPendingSeatIds(run, catalog).includes(seatId) ? { type: "skip-window" } : null;
    case "ended":
      return null;
  }
}
