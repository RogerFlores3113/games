import { BACKPACK_SIZE } from "../balance";
import { discardItem, equipError } from "../items";
import { backpackOf } from "../usage";
import type { Catalog, RunAction, RunState, SeatId } from "../types";
import { err, ok, type StageResult } from "./stage-def";

type Equip = Extract<RunAction, { type: "equip" }>;
type Discard = Extract<RunAction, { type: "discard-item" }>;

function hasReadied(run: RunState, seatId: SeatId): boolean {
  const stage = run.stage;
  return "ready" in stage && Object.hasOwn(stage.ready, seatId);
}

/** Moving items between backpack and slots, and discarding them: open in
 * every stage between camps, until the seat readies where the stage has a
 * ready. */
export const OUTFIT = {
  equip(run: RunState, seatId: SeatId, action: Equip, catalog: Catalog): StageResult {
    if (hasReadied(run, seatId)) return err("already_ready");
    const error = equipError(run, seatId, action.itemUids, catalog);
    if (error !== null) return err(error);
    // A camp rule may already have pushed the backpack past its size (Rats);
    // an equip may keep it there but never grow it.
    const seat = run.seats.find((s) => s.seatId === seatId)!;
    const stored = seat.items.length - action.itemUids.length;
    if (stored > Math.max(BACKPACK_SIZE, backpackOf(seat).length)) return err("backpack_full");
    return ok({ ...run, seats: run.seats.map((s) => (s.seatId === seatId ? { ...s, equipped: [...action.itemUids] } : s)) });
  },
  "discard-item"(run: RunState, seatId: SeatId, action: Discard): StageResult {
    if (hasReadied(run, seatId)) return err("already_ready");
    const discarded = discardItem(run, seatId, action.itemUid);
    return typeof discarded === "string" ? err(discarded) : ok(discarded);
  },
};
