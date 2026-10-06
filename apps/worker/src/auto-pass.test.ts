// A disconnected seat the game is waiting on is passed for after a grace
// period, so a gated decision never holds the table forever. Driven through
// the toy game (its active seat is the one it waits on) with an injected
// registry, plus the scheduler's timer for the same rule.

import { describe, expect, it } from "vitest";
import type { RoomCode, RoomState, SeatToken } from "@games/schema";
import { ABSENT_SEAT_PASS_GRACE_MS } from "@games/schema";
import type { RunState } from "@games/rules";
import { EXPEDITION_GAME_ID } from "@games/schema/games/expedition";
import { applyGameAction, autoPassAbsentSeats, awaitedSeatIds, createEmptyRoom, joinRoom, markConnected, seatsToAutoPass, startGame, toSeatView } from "./room-state";
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

describe("autoPassAbsentSeats: Expedition", () => {
  const DUE = LEFT_AT + ABSENT_SEAT_PASS_GRACE_MS;

  function expeditionRoom(): RoomState {
    let state = createEmptyRoom(ROOM_CODE, 0);
    for (let i = 0; i < 3; i++) {
      const joined = joinRoom(state, {
        displayName: `Player ${i}`,
        now: i + 1,
        mintSeatId: () => `e${i}`,
        mintSeatToken: () => `et${i}` as unknown as SeatToken,
        ...(i === 0 ? { gameId: EXPEDITION_GAME_ID } : {}),
      });
      if (!joined.ok) throw new Error(`join ${i}: ${joined.reason}`);
      state = joined.state;
    }
    const started = startGame(state, "e0", 10, "seed-expedition");
    if (!started.ok) throw new Error(`start: ${started.reason}`);
    return started.state;
  }

  function act(state: RoomState, seatId: string, request: unknown, now: number): RoomState {
    const result = applyGameAction(state, seatId, `${seatId}:${now}`, request, now);
    if (!result.ok) throw new Error(`${seatId}: ${result.reason}`);
    return result.state;
  }

  /** The room's auto-pass alarm firing, a moment apart, until nobody absent is due. */
  function alarms(state: RoomState): RoomState {
    let current = state;
    for (let i = 0; i < 10; i++) {
      const next = autoPassAbsentSeats(current, DUE + i);
      if (next === current) return current;
      current = next;
    }
    return current;
  }

  const run = (state: RoomState) => state.game as RunState;

  it("picks a character, abstains and locks in for a seat that dropped at the muster, then readies it into camp 1", () => {
    let state = markConnected(expeditionRoom(), "e2", false, LEFT_AT);
    state = act(state, "e0", { type: "pick-character", characterId: "leader" }, 20);
    state = act(state, "e1", { type: "pick-character", characterId: "hermit" }, 21);
    state = act(state, "e0", { type: "vote", choice: "short" }, 22);
    state = act(state, "e1", { type: "vote", choice: "short" }, 23);
    state = act(state, "e0", { type: "lock-in" }, 24);
    state = act(state, "e1", { type: "lock-in" }, 25);
    expect(run(state).stage.tag).toBe("muster");

    state = alarms(state);
    expect(run(state).stage.tag).toBe("loadout");
    expect(run(state).seats.map((seat) => seat.characterId)).toEqual(["leader", "hermit", "jd"]);

    state = act(state, "e0", { type: "ready" }, 26);
    state = act(state, "e1", { type: "ready" }, 27);
    state = alarms(state);
    expect(run(state).stage.tag).toBe("camp");
  });

  it("never acts for a bot seat, which has no disconnect time", () => {
    const room = expeditionRoom();
    const botted: RoomState = { ...room, seats: room.seats.map((seat) => (seat.seatId === "e2" ? { ...seat, connected: false, disconnectedAt: null, bot: true } : seat)) };
    expect(autoPassAbsentSeats(botted, DUE)).toBe(botted);
  });
});
