// A disconnected seat the game is waiting on is passed for after a grace
// period, so a gated decision never holds the table forever. Driven through
// the toy game (its active seat is the one it waits on) with an injected
// registry, plus the scheduler's timer for the same rule.

import { describe, expect, it } from "vitest";
import type { RoomCode, RoomState, SeatToken } from "@games/schema";
import { ABSENT_SEAT_PASS_GRACE_MS } from "@games/schema";
import { autoPassAbsentSeats, awaitedSeatIds, createEmptyRoom, joinRoom, markConnected, seatsToAutoPass, startGame, toSeatView } from "./room-state";
import { computeRoomTimers } from "./scheduler";
import { TEST_GAME_REGISTRY, TOY_GAME_ID } from "../test/toy-game";

const ROOM_CODE = "ABCDEF" as RoomCode;
const LEFT_AT = 1_000;

function startedRoom(gameId?: typeof TOY_GAME_ID): RoomState {
  let state = createEmptyRoom(ROOM_CODE, 0, TEST_GAME_REGISTRY);
  for (let i = 1; i <= 3; i++) {
    const joined = joinRoom(
      state,
      {
        displayName: `Player ${i}`,
        now: i,
        mintSeatId: () => `s${i}`,
        mintSeatToken: () => `t${i}` as unknown as SeatToken,
        ...(i === 1 && gameId !== undefined ? { gameId } : {}),
      },
      TEST_GAME_REGISTRY,
    );
    if (!joined.ok) throw new Error(`join ${i}: ${joined.reason}`);
    state = joined.state;
  }
  const started = startGame(state, "s1", 10, "seed-1", TEST_GAME_REGISTRY);
  if (!started.ok) throw new Error(`start: ${started.reason}`);
  return started.state;
}

const toyRoom = () => startedRoom(TOY_GAME_ID);
const turnSeat = (state: RoomState) => (toSeatView(state, "s2", TEST_GAME_REGISTRY).game as { turnSeatId: string }).turnSeatId;

describe("awaitedSeatIds", () => {
  it("lists the seats the game waits on, and none for a game without the hook", () => {
    expect(awaitedSeatIds(toyRoom(), TEST_GAME_REGISTRY)).toEqual(["s1"]);
    expect(awaitedSeatIds(startedRoom(), TEST_GAME_REGISTRY)).toEqual([]);
  });
});

describe("seatsToAutoPass", () => {
  it("names an awaited seat once it has been disconnected for the grace period", () => {
    const gone = markConnected(toyRoom(), "s1", false, LEFT_AT);
    expect(seatsToAutoPass(gone, LEFT_AT + ABSENT_SEAT_PASS_GRACE_MS - 1, TEST_GAME_REGISTRY)).toEqual([]);
    expect(seatsToAutoPass(gone, LEFT_AT + ABSENT_SEAT_PASS_GRACE_MS, TEST_GAME_REGISTRY)).toEqual(["s1"]);
  });

  it("never names a seat the game is not waiting on, or one that reconnected", () => {
    const later = LEFT_AT + ABSENT_SEAT_PASS_GRACE_MS;
    const both = markConnected(markConnected(toyRoom(), "s1", false, LEFT_AT), "s2", false, LEFT_AT);
    expect(seatsToAutoPass(both, later, TEST_GAME_REGISTRY)).toEqual(["s1"]);
    const back = markConnected(markConnected(toyRoom(), "s1", false, LEFT_AT), "s1", true, LEFT_AT + 5_000);
    expect(seatsToAutoPass(back, later, TEST_GAME_REGISTRY)).toEqual([]);
  });
});

describe("autoPassAbsentSeats", () => {
  it("submits the game's pass for the absent seat, and the game moves on", () => {
    const gone = markConnected(toyRoom(), "s1", false, LEFT_AT);
    expect(turnSeat(gone)).toBe("s1");
    const passed = autoPassAbsentSeats(gone, LEFT_AT + ABSENT_SEAT_PASS_GRACE_MS, TEST_GAME_REGISTRY);
    expect(turnSeat(passed)).toBe("s2");
    expect(autoPassAbsentSeats(passed, LEFT_AT + ABSENT_SEAT_PASS_GRACE_MS, TEST_GAME_REGISTRY)).toBe(passed);
  });

  it("leaves the room alone inside the grace period", () => {
    const gone = markConnected(toyRoom(), "s1", false, LEFT_AT);
    expect(autoPassAbsentSeats(gone, LEFT_AT + 1_000, TEST_GAME_REGISTRY)).toBe(gone);
  });
});

describe("computeRoomTimers: auto_pass", () => {
  it("schedules an awaited disconnected seat at the end of its grace period", () => {
    const gone = markConnected(toyRoom(), "s1", false, LEFT_AT);
    const timers = computeRoomTimers(gone, LEFT_AT, { awaitedSeatIds: ["s1"] });
    expect(timers.filter((t) => t.type === "auto_pass")).toEqual([
      { type: "auto_pass", seatId: "s1", dueAt: LEFT_AT + ABSENT_SEAT_PASS_GRACE_MS },
    ]);
  });

  it("schedules nothing for a connected awaited seat or a disconnected seat nobody waits on", () => {
    const idle = markConnected(toyRoom(), "s2", false, LEFT_AT);
    const timers = computeRoomTimers(idle, LEFT_AT, { awaitedSeatIds: ["s1"] });
    expect(timers.filter((t) => t.type === "auto_pass")).toEqual([]);
    expect(timers.filter((t) => t.type === "zombie_sweep")).toHaveLength(1);
  });
});
