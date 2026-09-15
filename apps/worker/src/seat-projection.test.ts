// D-07/HIDE-03: seat-projection.ts is the fail-closed gate between
// toSeatView (which never validates) and anything the worker sends over a
// socket. These tests prove: a clean projection passes through unchanged;
// every leak shape this suite can construct is rejected with `null`, never
// the raw view; and the console.error emitted on rejection never contains
// the leaked value, the game view, or the room seed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomView } from "@games/schema";
import { createEmptyRoom, joinRoom, startGame, toSeatView } from "./room-state";
import type { JoinInput } from "./room-state";
import { mintSeatToken } from "./seat-identity";
import { projectSeatView, validateGameView } from "./seat-projection";
import type { RoomCode } from "@games/schema";

const ROOM_CODE = "ABCDEF" as RoomCode;
const SEED = "0123456789abcdef0123456789abcdef";

function makeMinter() {
  let seatCounter = 0;
  return {
    mintSeatId: () => `s${++seatCounter}`,
    mintSeatToken,
  };
}

function join(state: ReturnType<typeof createEmptyRoom>, displayName: string, now: number, minter: ReturnType<typeof makeMinter>) {
  const input: JoinInput = {
    displayName,
    now,
    mintSeatId: minter.mintSeatId,
    mintSeatToken: minter.mintSeatToken,
  };
  return joinRoom(state, input);
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("projectSeatView: lobby room", () => {
  it("returns a non-null view whose game is null", () => {
    const minter = makeMinter();
    const room = createEmptyRoom(ROOM_CODE, "base", 0);
    const hostJoin = join(room, "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");

    const projected = projectSeatView(hostJoin.state, hostJoin.seatId);
    expect(projected).not.toBeNull();
    expect(projected?.game).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("projectSeatView: started room", () => {
  it("returns a non-null view for every seat, each yourCard sorted keys [\"hidden\",\"id\"]", () => {
    const minter = makeMinter();
    let state = createEmptyRoom(ROOM_CODE, "base", 0);
    const hostJoin = join(state, "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    state = hostJoin.state;
    const guestJoin = join(state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");
    state = guestJoin.state;

    const started = startGame(state, hostJoin.seatId, 3, SEED);
    if (!started.ok) throw new Error("unreachable");
    state = started.state;

    for (const seatId of [hostJoin.seatId, guestJoin.seatId]) {
      const projected = projectSeatView(state, seatId);
      expect(projected).not.toBeNull();
      const game = projected?.game as { yourCard: { id: string; hidden: true } };
      expect(Object.keys(game.yourCard).sort()).toEqual(["hidden", "id"]);
    }
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("validateGameView: accepts a real clean projection", () => {
  it("returns non-null for a rebuilt real view with yourCard { id, hidden: true }", () => {
    const minter = makeMinter();
    let state = createEmptyRoom(ROOM_CODE, "base", 0);
    const hostJoin = join(state, "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    state = hostJoin.state;
    const guestJoin = join(state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");
    state = guestJoin.state;
    const started = startGame(state, hostJoin.seatId, 3, SEED);
    if (!started.ok) throw new Error("unreachable");
    state = started.state;

    const realView = toSeatView(state, hostJoin.seatId);
    const result = validateGameView(realView);
    expect(result).not.toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("validateGameView: fails closed on every leak shape", () => {
  function baseGame(): Record<string, unknown> {
    return {
      yourCard: { id: "c1", hidden: true },
      otherCards: [{ seatId: "s2", card: { id: "c2", hidden: false, value: "Sirius" } }],
      revealed: [],
      deckCount: 10,
      activeSeatId: "s1",
      isYourTurn: true,
      score: 0,
    };
  }

  function leakyView(game: unknown): RoomView {
    return {
      code: ROOM_CODE,
      variant: "base",
      status: "in_progress",
      hostSeatId: "s1",
      youSeatId: "s1",
      seats: [
        { seatId: "s1", displayLabel: "Host", connected: true, isHost: true },
        { seatId: "s2", displayLabel: "Guest", connected: true, isHost: false },
      ],
      game,
    };
  }

  it("rejects yourCard with value: undefined present", () => {
    const game = { ...baseGame(), yourCard: { id: "c1", hidden: true, value: undefined } };
    const result = validateGameView(leakyView(game));
    expect(result).toBeNull();
  });

  it("rejects yourCard with value: null", () => {
    const game = { ...baseGame(), yourCard: { id: "c1", hidden: true, value: null } };
    const result = validateGameView(leakyView(game));
    expect(result).toBeNull();
  });

  it("rejects yourCard with the own value actually present", () => {
    const game = { ...baseGame(), yourCard: { id: "c1", hidden: true, value: "Altair" } };
    const result = validateGameView(leakyView(game));
    expect(result).toBeNull();
  });

  it("rejects an extra top-level game key (seed)", () => {
    const game = { ...baseGame(), seed: "0123456789abcdef0123456789abcdef" };
    const result = validateGameView(leakyView(game));
    expect(result).toBeNull();
  });

  it("rejects an otherCards card with hidden: true but a value key present", () => {
    const game = {
      ...baseGame(),
      otherCards: [{ seatId: "s2", card: { id: "c2", hidden: true, value: "Sirius" } }],
    };
    const result = validateGameView(leakyView(game));
    expect(result).toBeNull();
  });

  it("never returns the input object when it fails — result is strictly null", () => {
    const game = { ...baseGame(), yourCard: { id: "c1", hidden: true, value: "Altair" } };
    const input = leakyView(game);
    const result = validateGameView(input);
    expect(result).toBe(null);
    expect(result).not.toBe(input);
  });
});

describe("validateGameView: console.error on failure never leaks secrets", () => {
  it("logs exactly once, first argument mentions HIDE-03, and no argument contains the leaked value or the room seed", () => {
    const leakedValue = "Altair";
    const seed = "0123456789abcdef0123456789abcdef";
    const game = {
      yourCard: { id: "c1", hidden: true, value: leakedValue },
      otherCards: [],
      revealed: [],
      deckCount: 10,
      activeSeatId: "s1",
      isYourTurn: true,
      score: 0,
    };
    const view: RoomView = {
      code: ROOM_CODE,
      variant: "base",
      status: "in_progress",
      hostSeatId: "s1",
      youSeatId: "s1",
      seats: [{ seatId: "s1", displayLabel: "Host", connected: true, isHost: true }],
      game,
    };

    const result = validateGameView(view);
    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const call = errorSpy.mock.calls[0]!;
    expect(String(call[0])).toContain("HIDE-03");

    const serializedArgs = JSON.stringify(call);
    expect(serializedArgs).not.toContain(leakedValue);
    expect(serializedArgs).not.toContain(seed);
  });
});
