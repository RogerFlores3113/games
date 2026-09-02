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
  | "superseded";

export interface RoomStoreState {
  view: RoomView | null;
  status: RoomConnectionStatus;
  refusalReason: RefusalReason | null;
  seatId: string | null;
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
};

export const useRoomStore = create<RoomStoreState & RoomStoreActions>((set) => ({
  ...initialState,

  applyServerMessage: (message) => {
    switch (message.type) {
      case "joined":
        set({
          view: message.view,
          seatId: message.seatId,
          status: "seated",
          refusalReason: null,
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
        // Non-fatal protocol error (e.g. `not_host` from an unauthorized
        // action attempt) — the server's own state broadcast is still the
        // source of truth, so this deliberately does not mutate `view`.
        return;
      default:
        return;
    }
  },

  setStatus: (status) => set({ status }),

  reset: () => set(initialState),
}));
