import { create } from "zustand";
import type { RefusalReason, RoomView, ServerMessage } from "@games/schema";

/**
 * A thin cache of the last server-pushed view — the server is authoritative
 * and this store must never compute or patch room state locally. Every
 * field is either the most recent `RoomView` broadcast, or connection
 * bookkeeping about how we got there.
 */
export type RoomConnectionStatus =
  | "connecting"
  | "joining"
  | "seated"
  | "refused"
  | "superseded"
  /** D-05: a view has already been received and the socket dropped
   * non-terminally (network blip, half-open pong timeout, zombie-sweep
   * close). `view` is kept as-is for display only — it is never acted on —
   * so the player sees the last known table with a "Reconnecting…" banner
   * instead of dropping back to the full-screen "Connecting…" page.
   * Cleared by the next `joined`/`state` frame, same as "joining". */
  | "reconnecting"
  /** WR-01: the server garbage-collected the room and closed the socket
   * with `ROOM_ABANDONED_CLOSE_CODE`. Terminal — no reconnect. */
  | "abandoned"
  /** WR-05: the server answered our `join` with an `error` frame (e.g. a
   * stored name or token it rejects). Terminal for this attempt — the room
   * flow falls back to the join form rather than retrying the same frame. */
  | "join_failed";

export interface RoomStoreState {
  view: RoomView | null;
  status: RoomConnectionStatus;
  refusalReason: RefusalReason | null;
  seatId: string | null;
  /** WR-05: the error code that failed the last join, if any. */
  joinError: RefusalReason | null;
}

export interface RoomStoreActions {
  /** Applies one inbound `ServerMessage` to the store. This is the ONLY
   * way room state changes — there is no client-side derivation. */
  applyServerMessage: (message: ServerMessage) => void;
  /** Connection-lifecycle bookkeeping the socket layer drives directly
   * (e.g. "connecting" while the transport opens, "joining" once the
   * `join` frame has been sent but no reply has arrived yet). */
  setStatus: (status: RoomConnectionStatus) => void;
  /** Returns the store to its pre-connection shape — used when a fresh
   * connection attempt starts from scratch (e.g. a new room code). */
  reset: () => void;
}

const initialState: RoomStoreState = {
  view: null,
  status: "connecting",
  refusalReason: null,
  seatId: null,
  joinError: null,
};

export const useRoomStore = create<RoomStoreState & RoomStoreActions>((set, get) => ({
  ...initialState,

  applyServerMessage: (message) => {
    switch (message.type) {
      case "joined":
        set({
          view: message.view,
          seatId: message.seatId,
          status: "seated",
          refusalReason: null,
          joinError: null,
        });
        return;
      case "state":
        set({ view: message.view, status: "seated" });
        return;
      case "refused":
        // A refused arrival must not be left rendering stale seats.
        set({ view: null, status: "refused", refusalReason: message.reason });
        return;
      case "superseded":
        set({ status: "superseded" });
        return;
      case "error":
        // WR-05: while joining OR reconnecting, the only frame we have sent
        // on this fresh socket is `join` — an error here means the join
        // itself was rejected. Dropping it left the page on
        // "Connecting…"/"Reconnecting…" forever, replaying the same bad
        // frame on every reconnect.
        if (get().status === "joining" || get().status === "reconnecting") {
          set({ view: null, status: "join_failed", joinError: message.code });
          return;
        }
        // Otherwise a non-fatal protocol error (e.g. `not_host` from an
        // unauthorized action attempt) — the server's own state broadcast is
        // still the source of truth, so this deliberately does not mutate
        // `view`.
        return;
      default:
        return;
    }
  },

  setStatus: (status) => set({ status }),

  reset: () => set(initialState),
}));
