import type { AdapterResult } from "../../../adapter";
import type { Catalog, PerSeat, RunAction, RunAt, RunError, RunState, SeatId, StageTag } from "../types";

export type StageResult = AdapterResult<RunState, RunError>;
export type Handler<T extends StageTag, A extends RunAction> = (run: RunAt<T>, seatId: SeatId, action: A, catalog: Catalog) => StageResult;

/** A stage accepts exactly the action types it has a handler for; any other
 * type is refused wrong_stage before a handler runs. */
export type StageDef<T extends StageTag> = {
  readonly on: { readonly [K in RunAction["type"]]?: Handler<T, Extract<RunAction, { type: K }>> };
  /** Idempotent: returns run unchanged until the stage is done. */
  advance(run: RunAt<T>, catalog: Catalog): RunState;
};

export function ok(state: RunState): StageResult {
  return { ok: true, state };
}

export function err(error: RunError): StageResult {
  return { ok: false, error };
}

export function everySeat<V>(run: RunState, perSeat: PerSeat<V>): boolean {
  return run.seatIds.every((seatId) => Object.hasOwn(perSeat, seatId));
}

/** The ready set with `seatId` added, or null when it already was. */
export function readied(ready: PerSeat<true>, seatId: SeatId): PerSeat<true> | null {
  return Object.hasOwn(ready, seatId) ? null : { ...ready, [seatId]: true };
}
