import { describe, expect, it } from "vitest";
import type { RoomView } from "@games/schema";
import { lobbySlots } from "./lobby-seats";

// D-05: this test no longer imports the (deleted from web) global
// MIN_PLAYERS/MAX_PLAYERS constants — `lobbySlots` takes `max` as a required
// parameter, sourced from `view.limits.max` at every real call site.
const HANABI_MAX_PLAYERS = 5;

function seat(seatId: string): RoomView["seats"][number] {
  return {
    seatId,
    displayLabel: seatId,
    connected: true,
    isHost: seatId === "s1",
  } as RoomView["seats"][number];
}

describe("lobbySlots", () => {
  it("pads an empty room out to max open slots", () => {
    const slots = lobbySlots([], HANABI_MAX_PLAYERS);
    expect(slots).toHaveLength(HANABI_MAX_PLAYERS);
    expect(slots.every((slot) => slot.kind === "open")).toBe(true);
  });

  it("keeps real seats first, in server order, then pads the rest", () => {
    const slots = lobbySlots([seat("s1"), seat("s2")], HANABI_MAX_PLAYERS);
    expect(slots).toHaveLength(HANABI_MAX_PLAYERS);
    expect(slots.slice(0, 2).map((slot) => (slot.kind === "seat" ? slot.seat.seatId : null))).toEqual([
      "s1",
      "s2",
    ]);
    expect(slots.slice(2).every((slot) => slot.kind === "open")).toBe(true);
  });

  it("emits no open slots once the room is full", () => {
    const seats = Array.from({ length: HANABI_MAX_PLAYERS }, (_, i) => seat(`s${i}`));
    const slots = lobbySlots(seats, HANABI_MAX_PLAYERS);
    expect(slots).toHaveLength(HANABI_MAX_PLAYERS);
    expect(slots.some((slot) => slot.kind === "open")).toBe(false);
  });

  it("never drops a real seat, even past max", () => {
    const seats = Array.from({ length: HANABI_MAX_PLAYERS + 2 }, (_, i) => seat(`s${i}`));
    expect(lobbySlots(seats, HANABI_MAX_PLAYERS)).toHaveLength(HANABI_MAX_PLAYERS + 2);
  });

  it("gives open slots distinct keys", () => {
    const open = lobbySlots([seat("s1")], HANABI_MAX_PLAYERS).filter((slot) => slot.kind === "open");
    const indexes = open.map((slot) => (slot.kind === "open" ? slot.index : -1));
    expect(new Set(indexes).size).toBe(indexes.length);
  });
});
