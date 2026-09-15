// D-06/D-07/D-09: the fail-closed projection gate. Once Plan 04 lands, this
// module's `projectSeatView` becomes the ONE call site of `toSeatView` in
// the worker: room-do.ts's #viewFor -> projectSeatView -> toSeatView ->
// adapter.toPlayerView -> the strict game view schema. `toSeatView` itself
// never validates (it stays zod-free, per FDN-01); this module is where the
// projected view is checked before it is allowed anywhere near a socket.
//
// D-07 fail-closed: a view that fails the active game's strict schema
// produces `null`, never a fallback to the raw/unvalidated object. The
// caller (room-do.ts's #viewFor, Plan 04) turns a `null` into an `error`
// frame with `detail: "view_unavailable"` — never a `state`/`joined` frame.

import type { RoomState, RoomView, ServerMessage } from "@games/schema";
import { activeGame } from "./game-registration";
import { toSeatView } from "./room-state";

declare const brand: unique symbol;

/** A `RoomView` that has passed `validateGameView`. The brand is a
 * type-level guard on top of the runtime check: a `joined`/`state` frame's
 * `view` field can only type-check if it went through this module. */
export type ProjectedRoomView = RoomView & { readonly [brand]: true };

type ServerMessageWithoutView = Exclude<ServerMessage, { type: "joined" } | { type: "state" }>;
type JoinedMessage = Extract<ServerMessage, { type: "joined" }>;
type StateMessage = Extract<ServerMessage, { type: "state" }>;
type ErrorMessage = Extract<ServerMessage, { type: "error" }>;

/** The set of frames the worker's single send chokepoint may hand to
 * `encodeServerMessage`: every `ServerMessage` member EXCEPT `joined`/`state`
 * (whose `view` is widened to `ProjectedRoomView`, the only shape this
 * module ever hands back), plus an `error` member whose `detail` stays
 * optional. */
export type OutboundFrame =
  | ServerMessageWithoutView
  | (Omit<JoinedMessage, "view"> & { view: ProjectedRoomView })
  | (Omit<StateMessage, "view"> & { view: ProjectedRoomView })
  | (Omit<ErrorMessage, "detail"> & { detail?: ErrorMessage["detail"] });

/** Runs the active game's strict view schema against `view.game`. On
 * success, returns the ORIGINAL view (branded) — never a schema-reconstructed
 * copy, so nothing here can silently coerce/strip fields the schema didn't
 * see. On failure (D-07), logs only `seatId` and each issue's `code`/`path`
 * — never the view, the game, issue messages, or received values — and
 * returns `null`. */
export function validateGameView(view: RoomView): ProjectedRoomView | null {
  if (view.game === null) {
    return view as ProjectedRoomView;
  }

  const result = activeGame.viewSchema.safeParse(view.game);
  if (result.success) {
    return view as ProjectedRoomView;
  }

  console.error("HIDE-03: projected game view failed strict schema validation", {
    seatId: view.youSeatId,
    issues: result.error.issues.map((issue) => ({ code: issue.code, path: issue.path })),
  });
  return null;
}

/** The ONE call site of `toSeatView` in the worker once Plan 04 lands.
 * Projects `room` for `seatId` and validates the result, returning `null`
 * on any schema failure (D-07 fail-closed). */
export function projectSeatView(room: RoomState, seatId: string): ProjectedRoomView | null {
  return validateGameView(toSeatView(room, seatId));
}
