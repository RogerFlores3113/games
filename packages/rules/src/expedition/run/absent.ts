// What the table does for a seat that has been gone past the room's grace,
// so a dropped player never holds the others: the room submits it as that
// seat's own action.

import { attemptOf } from "./attempt";
import type { Catalog, RunAction, RunState } from "./types";
import { gatedPendingSeatIds } from "./windows";

/** Muster: the first character nobody has, in registry order, then an
 * abstention. A route vote: an abstention. Loadout and event: ready with the
 * gear it has. Draft: the head offer's first bundle. A gated window: a pass.
 * null when the table is not waiting on the seat. */
export function absentSeatAction(run: RunState, seatId: string, catalog: Catalog): RunAction | null {
  const seat = run.seats.find((s) => s.seatId === seatId);
  if (seat === undefined) return null;
  const stage = run.stage;
  switch (stage.tag) {
    case "muster": {
      if (seat.characterId === null) {
        const taken = new Set(run.seats.map((s) => s.characterId));
        const free = Object.keys(catalog.characters).find((id) => !taken.has(id));
        if (free !== undefined) return { type: "pick-character", characterId: free };
      }
      return Object.hasOwn(stage.ballots, seatId) ? null : { type: "vote", choice: null };
    }
    case "route":
      return Object.hasOwn(stage.ballots, seatId) ? null : { type: "vote", choice: null };
    case "loadout":
    case "event":
      return Object.hasOwn(stage.ready, seatId) ? null : { type: "ready" };
    case "draft":
      return (seat.offers[0]?.bundles.length ?? 0) > 0 ? { type: "pick-bundle", bundle: 0 } : null;
    case "camp":
      return attemptOf(run) !== null && gatedPendingSeatIds(run, catalog).includes(seatId) ? { type: "skip-window" } : null;
    case "ended":
      return null;
  }
}
