// Hold on: between tricks, a seat that is not on lead may ask the table to
// wait, so a whisper or a between-tricks power is not lost to a quick lead.
// While any hold stands the next lead is refused waiting_on_hold. A hold
// ends when its seat whispers, uses an ability or lets go (skip-window); a
// seat that is gone past the room's grace lets go through absent.ts.
//
// Each seat holds at most once per gap between tricks: the hold and its end
// are `held` and `released` ledger entries at the gap's stamp
// (completedTricks.length), so a new gap starts clean and nothing is
// stored beside the ledger. The seat on lead never holds the table: its own
// lead is its act.

import { currentActorSeatId } from "../camp";
import type { AdapterResult } from "../../adapter";
import { attemptOf } from "./attempt";
import { rulesFor } from "./compose";
import type { Catalog, LedgerEntry, RunError, RunState, SeatRun, Stamp } from "./types";
import { currentStamp, sameStamp } from "./usage";
import { currentWindow } from "./windows";

/** The open gap's stamp and the seat on lead; null outside between-tricks. */
function gap(run: RunState, catalog: Catalog): { readonly at: Stamp; readonly leader: string | null } | null {
  const attempt = attemptOf(run);
  const rules = rulesFor(run, catalog);
  if (attempt === null || currentWindow(run, rules) !== "between-tricks") return null;
  const at = currentStamp(run);
  return at === null ? null : { at, leader: currentActorSeatId(attempt.camp, rules) };
}

const atGap = (seat: SeatRun, kind: "held" | "released", at: Stamp): boolean => seat.ledger.some((entry) => entry.kind === kind && sameStamp(entry.at, at));

/** Seats whose hold stands in the open gap, in seat order: each held at
 * this stamp, has not let go, and is not on lead. [] outside between-tricks. */
export function holdingSeatIds(run: RunState, catalog: Catalog): readonly string[] {
  const open = gap(run, catalog);
  if (open === null) return [];
  return run.seats.filter((seat) => seat.seatId !== open.leader && atGap(seat, "held", open.at) && !atGap(seat, "released", open.at)).map((seat) => seat.seatId);
}

/** Order: wrong_window (not between tricks) -> hold_unavailable (on lead, or
 * already held in this gap). */
export function holdLegality(run: RunState, seatId: string, catalog: Catalog): { legal: true } | { legal: false; reason: RunError } {
  const open = gap(run, catalog);
  if (open === null) return { legal: false, reason: "wrong_window" };
  const seat = run.seats.find((s) => s.seatId === seatId);
  if (seat === undefined || seatId === open.leader || atGap(seat, "held", open.at)) return { legal: false, reason: "hold_unavailable" };
  return { legal: true };
}

function append(run: RunState, seatId: string, entry: LedgerEntry): RunState {
  return { ...run, seats: run.seats.map((s) => (s.seatId === seatId ? { ...s, ledger: [...s.ledger, entry] } : s)) };
}

export function applyHold(run: RunState, seatId: string, catalog: Catalog): AdapterResult<RunState, RunError> {
  const legality = holdLegality(run, seatId, catalog);
  if (!legality.legal) return { ok: false, error: legality.reason };
  return { ok: true, state: append(run, seatId, { kind: "held", at: currentStamp(run)! }) };
}

/** `after` with `seatId`'s hold in `before`'s gap let go; `after` itself
 * when the seat was not holding there. An action taken in a gap is read
 * against the gap it was taken in, whatever it changed. */
export function releasedAfter(before: RunState, after: RunState, seatId: string, catalog: Catalog): RunState {
  if (!holdingSeatIds(before, catalog).includes(seatId)) return after;
  return append(after, seatId, { kind: "released", at: currentStamp(before)! });
}
