import { create } from "zustand";
import type { DevCommand, ServerMessage } from "@games/schema";

export type DevStateFrame = Extract<ServerMessage, { type: "dev_state" }>;
export type DevResultFrame = Extract<ServerMessage, { type: "dev_result" }>;

export interface DevStoreState {
  state: DevStateFrame | null;
  /** The answer to the last command the user ran. A routine snapshot's
   * success never replaces it, so an autoplay summary stays readable. */
  result: DevResultFrame | null;
  /** Kinds of the commands sent and not yet answered, oldest first. One
   * socket answers in order, so each `dev_result` matches the head. */
  pending: DevCommand["kind"][];
  sent: (kind: DevCommand["kind"]) => void;
  receive: (message: DevStateFrame | DevResultFrame) => void;
}

export const useDevStore = create<DevStoreState>((set, get) => ({
  state: null,
  result: null,
  pending: [],
  sent: (kind) => set({ pending: [...get().pending, kind] }),
  receive: (message) => {
    if (message.type === "dev_state") {
      set({ state: message });
      return;
    }
    const [kind, ...pending] = get().pending;
    if (kind === "snapshot" && message.ok) {
      set({ pending });
      return;
    }
    set({ result: message, pending });
  },
}));
