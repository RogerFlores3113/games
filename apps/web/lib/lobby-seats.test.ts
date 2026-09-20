import { describe, expect, it } from "vitest";
import { MAX_PLAYERS, type RoomView } from "@games/schema";
import { lobbySlots } from "./lobby-seats";

function seat(seatId: string): RoomView["seats"][number] {
  return {
    seatId,
    displayLabel: seatId,
    connected: true,
    isHost: seatId === "s1",
  } as RoomView["seats"][number];
}

describe("lobbySlots", () => {
  it("pads an empty room out to MAX_PLAYERS open slots", () => {
    const slots = lobbySlots([]);
    expect(slots).toHaveLength(MAX_PLAYERS);
    expect(slots.every((slot) => slot.kind === "open")).toBe(true);
  });

  it("keeps real seats first, in server order, then pads the rest", () => {
    const slots = lobbySlots([seat("s1"), seat("s2")]);
    expect(slots).toHaveLength(MAX_PLAYERS);
    expect(slots.slice(0, 2).map((slot) => (slot.kind === "seat" ? slot.seat.seatId : null))).toEqual([
      "s1",
      "s2",
    ]);
    expect(slots.slice(2).every((slot) => slot.kind === "open")).toBe(true);
  });

  it("emits no open slots once the room is full", () => {
    const seats = Array.from({ length: MAX_PLAYERS }, (_, i) => seat(`s${i}`));
    const slots = lobbySlots(seats);
    expect(slots).toHaveLength(MAX_PLAYERS);
    expect(slots.some((slot) => slot.kind === "open")).toBe(false);
  });

  it("never drops a real seat, even past max", () => {
    const seats = Array.from({ length: MAX_PLAYERS + 2 }, (_, i) => seat(`s${i}`));
    expect(lobbySlots(seats)).toHaveLength(MAX_PLAYERS + 2);
  });

  it("gives open slots distinct keys", () => {
    const open = lobbySlots([seat("s1")]).filter((slot) => slot.kind === "open");
    const indexes = open.map((slot) => (slot.kind === "open" ? slot.index : -1));
    expect(new Set(indexes).size).toBe(indexes.length);
  });
});
