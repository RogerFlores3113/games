// D-07/HIDE-03: seat-projection.ts is the fail-closed gate between
// toSeatView (which never validates) and anything the worker sends over a
// socket. These tests prove: a clean projection passes through unchanged;
// every leak shape this suite can construct is rejected with `null`, never
// the raw view; and the console.error emitted on rejection never contains
// the leaked value, the game view, or the room seed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomView } from "@games/schema";
import type { HanabiCardView } from "@games/rules";
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
  it("returns a non-null view for every seat, each hidden yourHand entry sorted keys [\"facts\",\"hidden\",\"id\"]", () => {
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
      const game = projected?.game as { yourHand: HanabiCardView[] };

      // Non-vacuousness: a 2-seat base game deals 5 cards per seat.
      expect(game.yourHand.length).toBeGreaterThan(0);

      for (const card of game.yourHand) {
        expect(card.hidden).toBe(true);
        expect(Object.keys(card).sort()).toEqual(["facts", "hidden", "id"]);
        expect("suit" in card).toBe(false);
        expect("rank" in card).toBe(false);
      }
    }
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("validateGameView: accepts a real clean projection", () => {
  it("returns non-null for a rebuilt real view with hidden yourHand entries { id, hidden: true, facts }", () => {
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
  const ownFacts = {
    possibleSuits: ["red", "yellow"],
    possibleRanks: [1, 2, 3, 4, 5],
    positiveClues: [],
    negativeClues: [],
  };

  const otherFacts = {
    possibleSuits: ["blue"],
    possibleRanks: [3],
    positiveClues: [],
    negativeClues: [],
  };

  /** A complete, valid Hanabi view — the shape's template is `baseValidView`
   * from packages/schema/src/games/hanabi.test.ts. */
  function baseGame(): Record<string, unknown> {
    return {
      variant: "base",
      yourSeatId: "s1",
      yourHand: [{ id: "c1", hidden: true, facts: ownFacts }],
      otherHands: [
        {
          seatId: "s2",
          cards: [{ id: "c2", hidden: false, suit: "blue", rank: 3, facts: otherFacts }],
        },
      ],
      stacks: [{ suit: "red", topRank: 2 }],
      discard: [{ id: "c3", suit: "white", rank: 1 }],
      clueTokens: 7,
      fuses: 0,
      deckCount: 30,
      finalTurnsRemaining: null,
      activeSeatId: "s1",
      isYourTurn: true,
      score: 2,
      history: [],
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

  // CRITICAL positive control (D-07/HIDE-03/T-04-38): without this, every
  // rejection test below would pass for the WRONG reason post-swap — a
  // toy-shaped fixture would fail HanabiViewSchema as a whole-shape
  // mismatch, proving nothing about the specific leak each test injects.
  // This asserts the unleaked fixture validates, so a rejection below can
  // only be attributed to the specific mutation each test makes.
  it("positive control: the unleaked baseGame() fixture validates non-null", () => {
    const result = validateGameView(leakyView(baseGame()));
    expect(result).not.toBeNull();
  });

  it("rejects a hidden own-hand card with suit: undefined present", () => {
    const game = {
      ...baseGame(),
      yourHand: [{ id: "c1", hidden: true, suit: undefined, facts: ownFacts }],
    };
    const result = validateGameView(leakyView(game));
    expect(result).toBeNull();
  });

  it("rejects a hidden own-hand card with suit: null", () => {
    const game = {
      ...baseGame(),
      yourHand: [{ id: "c1", hidden: true, suit: null, facts: ownFacts }],
    };
    const result = validateGameView(leakyView(game));
    expect(result).toBeNull();
  });

  it("rejects a hidden own-hand card with the real suit and rank actually present", () => {
    const game = {
      ...baseGame(),
      yourHand: [{ id: "c1", hidden: true, suit: "red", rank: 4, facts: ownFacts }],
    };
    const result = validateGameView(leakyView(game));
    expect(result).toBeNull();
  });

  it("rejects an extra top-level game key (seed)", () => {
    const game = { ...baseGame(), seed: "0123456789abcdef0123456789abcdef" };
    const result = validateGameView(leakyView(game));
    expect(result).toBeNull();
  });

  it("rejects an otherHands card with hidden: true but a suit key present", () => {
    const game = {
      ...baseGame(),
      otherHands: [
        {
          seatId: "s2",
          cards: [{ id: "c2", hidden: true, suit: "blue", facts: otherFacts }],
        },
      ],
    };
    const result = validateGameView(leakyView(game));
    expect(result).toBeNull();
  });

  it("never returns the input object when it fails — result is strictly null", () => {
    const game = {
      ...baseGame(),
      yourHand: [{ id: "c1", hidden: true, suit: "red", rank: 4, facts: ownFacts }],
    };
    const input = leakyView(game);
    const result = validateGameView(input);
    expect(result).toBe(null);
    expect(result).not.toBe(input);
  });
});

describe("validateGameView: console.error on failure never leaks secrets", () => {
  it("logs exactly once, first argument mentions HIDE-03, and no argument contains the leaked identity or the room seed", () => {
    const leakedSuit = "red";
    const leakedRank = 4;
    const seed = "0123456789abcdef0123456789abcdef";
    const game = {
      variant: "base",
      yourSeatId: "s1",
      yourHand: [
        {
          id: "c1",
          hidden: true,
          suit: leakedSuit,
          rank: leakedRank,
          facts: {
            possibleSuits: ["red", "yellow"],
            possibleRanks: [1, 2, 3, 4, 5],
            positiveClues: [],
            negativeClues: [],
          },
        },
      ],
      otherHands: [],
      stacks: [],
      discard: [],
      clueTokens: 8,
      fuses: 0,
      deckCount: 30,
      finalTurnsRemaining: null,
      activeSeatId: "s1",
      isYourTurn: true,
      score: 0,
      history: [],
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
    expect(serializedArgs).not.toContain(leakedSuit);
    expect(serializedArgs).not.toContain(String(leakedRank));
    expect(serializedArgs).not.toContain(seed);
  });
});
