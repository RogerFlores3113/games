import { beforeEach, describe, expect, it } from "vitest";
import type { RoomView, SeatToken, ServerMessage } from "@games/schema";
import { useRoomStore } from "./room-store";

const FAKE_SEAT_TOKEN = "a".repeat(24) as SeatToken;

function makeView(overrides: Partial<RoomView> = {}): RoomView {
  return {
    code: "ABC123" as RoomView["code"],
    variant: "base",
    status: "lobby",
    hostSeatId: "seat-1",
    youSeatId: "seat-1",
    seats: [
      { seatId: "seat-1", displayLabel: "Roger", connected: true, isHost: true },
    ],
    game: null,
    ...overrides,
  };
}

beforeEach(() => {
  useRoomStore.getState().reset();
});

describe("room-store", () => {
  it("starts in the connecting status with no view", () => {
    const state = useRoomStore.getState();
    expect(state.status).toBe("connecting");
    expect(state.view).toBeNull();
    expect(state.seatId).toBeNull();
    expect(state.refusalReason).toBeNull();
  });

  it("setStatus updates only the status field", () => {
    useRoomStore.getState().setStatus("joining");
    expect(useRoomStore.getState().status).toBe("joining");
    expect(useRoomStore.getState().view).toBeNull();
  });

  describe("applyServerMessage", () => {
    it('"joined" sets view, seatId and status to seated', () => {
      const view = makeView();
      const message: ServerMessage = {
        type: "joined",
        seatId: "seat-1",
        seatToken: FAKE_SEAT_TOKEN,
        view,
      };
      useRoomStore.getState().applyServerMessage(message);
      const state = useRoomStore.getState();
      expect(state.view).toEqual(view);
      expect(state.seatId).toBe("seat-1");
      expect(state.status).toBe("seated");
      expect(state.refusalReason).toBeNull();
    });

    it('"state" replaces the view and sets status to seated', () => {
      const firstView = makeView();
      useRoomStore.getState().applyServerMessage({
        type: "state",
        view: firstView,
      });
      expect(useRoomStore.getState().view).toEqual(firstView);
      expect(useRoomStore.getState().status).toBe("seated");

      const secondView = makeView({
        seats: [
          { seatId: "seat-1", displayLabel: "Roger", connected: true, isHost: true },
          { seatId: "seat-2", displayLabel: "Alex", connected: true, isHost: false },
        ],
      });
      useRoomStore.getState().applyServerMessage({ type: "state", view: secondView });
      expect(useRoomStore.getState().view).toEqual(secondView);
    });

    it('"refused" clears view to null and records the reason', () => {
      // Seed a view first, to prove refusal clears stale state rather than
      // leaving a partial table visible (ROOM-07/D-14).
      useRoomStore.getState().applyServerMessage({ type: "state", view: makeView() });
      expect(useRoomStore.getState().view).not.toBeNull();

      useRoomStore.getState().applyServerMessage({ type: "refused", reason: "in_progress" });
      const state = useRoomStore.getState();
      expect(state.view).toBeNull();
      expect(state.status).toBe("refused");
      expect(state.refusalReason).toBe("in_progress");
    });

    it('"superseded" sets status without touching the view', () => {
      const view = makeView();
      useRoomStore.getState().applyServerMessage({ type: "state", view });
      useRoomStore.getState().applyServerMessage({ type: "superseded" });
      const state = useRoomStore.getState();
      expect(state.status).toBe("superseded");
      expect(state.view).toEqual(view);
    });

    it('"error" does not mutate view, status, or seatId', () => {
      const view = makeView();
      useRoomStore.getState().applyServerMessage({ type: "joined", seatId: "seat-1", seatToken: FAKE_SEAT_TOKEN, view });
      const before = useRoomStore.getState();

      useRoomStore.getState().applyServerMessage({ type: "error", code: "not_host" });

      const after = useRoomStore.getState();
      expect(after.view).toEqual(before.view);
      expect(after.status).toBe(before.status);
      expect(after.seatId).toBe(before.seatId);
    });
  });

  describe("WR-05: a server error while joining is a failed join, not silence", () => {
    it('"error" while joining sets status join_failed and records the code', () => {
      useRoomStore.getState().setStatus("joining");
      useRoomStore.getState().applyServerMessage({ type: "error", code: "bad_request" });
      const state = useRoomStore.getState();
      expect(state.status).toBe("join_failed");
      expect(state.joinError).toBe("bad_request");
      expect(state.view).toBeNull();
    });

    it('"error" after being seated still leaves status untouched', () => {
      useRoomStore.getState().applyServerMessage({ type: "state", view: makeView() });
      useRoomStore.getState().applyServerMessage({ type: "error", code: "not_host" });
      expect(useRoomStore.getState().status).toBe("seated");
      expect(useRoomStore.getState().joinError).toBeNull();
    });
  });

  it("reset returns the store to its initial shape", () => {
    useRoomStore.getState().applyServerMessage({ type: "state", view: makeView() });
    useRoomStore.getState().reset();
    const state = useRoomStore.getState();
    expect(state.view).toBeNull();
    expect(state.status).toBe("connecting");
    expect(state.seatId).toBeNull();
    expect(state.refusalReason).toBeNull();
  });
});
