import { create } from "zustand";
import type { DevCommand, ServerMessage } from "@games/schema";

export type DevStateFrame = Extract<ServerMessage, { type: "dev_state" }>;
export type DevResultFrame = Extract<ServerMessage, { type: "dev_result" }>;

/** What the dev tools sent: a command the user asked for, or one they send
 * on their own. A `quiet` snapshot keeps the tools current and its answer
 * never shows; `bots` is bot autoplay, shown only when a move is refused. */
export type DevSent = DevCommand["kind"] | "quiet" | "bots";

/** A right-click on the game's table: the game thing under the pointer
 * (`kind: null` when there was none), at page coordinates. */
export type DevPick = { readonly kind: string | null; readonly id: string; readonly x: number; readonly y: number };

export interface DevStoreState {
  state: DevStateFrame | null;
  /** The answer to the last command the user ran. A routine answer never
   * replaces it, so an autoplay summary stays readable. */
  result: DevResultFrame | null;
  /** What was sent and not yet answered, oldest first. One socket answers
   * in order, so each `dev_result` matches the head. */
  pending: DevSent[];
  picked: DevPick | null;
  sent: (kind: DevSent) => void;
  receive: (message: DevStateFrame | DevResultFrame) => void;
  pick: (pick: DevPick | null) => void;
}

export const useDevStore = create<DevStoreState>((set, get) => ({
  state: null,
  result: null,
  pending: [],
  picked: null,
  sent: (kind) => set({ pending: [...get().pending, kind] }),
  receive: (message) => {
    if (message.type === "dev_state") {
      set({ state: message });
      return;
    }
    const [kind, ...pending] = get().pending;
    if (kind === "quiet" || ((kind === "snapshot" || kind === "bots") && message.ok)) {
      set({ pending });
      return;
    }
    set({ result: message, pending });
  },
  pick: (picked) => set({ picked }),
}));
