// D-10: proves the game registry is genuinely generic by running a
// structurally different, test-only second game (apps/worker/test/toy-game.ts)
// through the SAME production room-state.ts/seat-projection.ts pure
// functions Hanabi uses, via the injectable `games: GameRegistry` parameter
// every registry-reading function takes. Nothing here reaches through the
// wire parser (`parseClientMessage`) for the toy — only the production
// isolation describe block at the bottom does, and only to prove the toy is
// REJECTED there.

import { describe, expect, it } from "vitest";
import type { RoomCode, RoomState, SeatToken } from "@games/schema";
import { GameIdSchema, parseClientMessage } from "@games/schema";
import { GAME_REGISTRY, resolveGame } from "./game-registration";
import { applyGameAction, createEmptyRoom, joinRoom, setConfig, startGame, toSeatView } from "./room-state";
import type { JoinInput } from "./room-state";
import { projectSeatView, validateGameView } from "./seat-projection";
import { LEAKY_TOY_REGISTRY, TEST_GAME_REGISTRY, TOY_GAME_ID } from "../test/toy-game";

const ROOM_CODE = "ABCDEF" as RoomCode;

function makeMinter() {
  let seatCounter = 0;
  let tokenCounter = 0;
  return {
    mintSeatId: () => `s${++seatCounter}`,
    mintSeatToken: () => `t${++tokenCounter}` as unknown as SeatToken,
  };
}

function join(
  state: RoomState,
  displayName: string,
  now: number,
  minter: ReturnType<typeof makeMinter>,
  extra?: Partial<JoinInput>,
) {
  const input: JoinInput = {
    displayName,
    now,
    mintSeatId: minter.mintSeatId,
    mintSeatToken: minter.mintSeatToken,
    ...extra,
  };
  return joinRoom(state, input, TEST_GAME_REGISTRY);
}

/** A fresh room whose FIRST join carries `gameId: TOY_GAME_ID`, locking it to
 * the toy game, then joins `seatCount` total seats (including the first). */
function freshToyRoom(seatCount: number, now = 0): RoomState {
  const minter = makeMinter();
  let state = createEmptyRoom(ROOM_CODE, now, TEST_GAME_REGISTRY);
  for (let i = 0; i < seatCount; i++) {
    const result = join(state, `Player ${i + 1}`, now + i, minter, i === 0 ? { gameId: TOY_GAME_ID } : {});
    if (!result.ok) throw new Error(`unreachable: join ${i} failed`);
    state = result.state;
  }
  return state;
}

function freshHanabiRoom(seatCount: number, now = 0): RoomState {
  const minter = makeMinter();
  let state = createEmptyRoom(ROOM_CODE, now, TEST_GAME_REGISTRY);
  for (let i = 0; i < seatCount; i++) {
    const result = join(state, `Player ${i + 1}`, now + i, minter);
    if (!result.ok) throw new Error(`unreachable: join ${i} failed`);
    state = result.state;
  }
  return state;
}

// ---------------------------------------------------------------------------
// D-10: per-game seat limit enforced on join (5th refused) and on start
// (2 -> bad_request, 3 -> ok)
// ---------------------------------------------------------------------------

describe("D-10: TEST_GAME_REGISTRY's toy game enforces its OWN seat limits (3-4), not Hanabi's (2-5)", () => {
  it("join: a 5th seat into a toy room (limit 4) is refused full, though Hanabi would accept a 5th", () => {
    const state = freshToyRoom(4);
    const minter = makeMinter();
    const fifth = join(state, "Player 5", 100, minter);
    expect(fifth.ok).toBe(false);
    if (fifth.ok) throw new Error("unreachable");
    expect(fifth.reason).toBe("full");
  });

  it("start: 2 seats in a toy room (min 3) is refused bad_request", () => {
    const state = freshToyRoom(2);
    const result = startGame(state, state.hostSeatId!, 200, "seed-1", TEST_GAME_REGISTRY);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("bad_request");
  });

  it("start: 3 seats in a toy room is accepted, producing a non-null game", () => {
    const state = freshToyRoom(3);
    const result = startGame(state, state.hostSeatId!, 200, "seed-1", TEST_GAME_REGISTRY);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.state.game).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D-10/MGR-03: per-game config validation, fail-closed in both directions
// ---------------------------------------------------------------------------

describe("D-10/MGR-03: per-game config validation is fail-closed in both directions", () => {
  it("a toy room accepts a well-shaped toy config", () => {
    const state = freshToyRoom(3);
    const result = setConfig(state, state.hostSeatId!, { rounds: 2 }, 300, TEST_GAME_REGISTRY);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.state.config).toEqual({ rounds: 2 });
  });

  it("a toy room refuses a Hanabi-shaped config (a bare variant string)", () => {
    const state = freshToyRoom(3);
    const result = setConfig(state, state.hostSeatId!, "rainbow", 300, TEST_GAME_REGISTRY);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("bad_request");
    expect(state.config).toEqual({ rounds: 1 });
  });

  it("a toy room refuses an out-of-union rounds value", () => {
    const state = freshToyRoom(3);
    const before = state.config;
    const result = setConfig(state, state.hostSeatId!, { rounds: 9 }, 300, TEST_GAME_REGISTRY);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("bad_request");
    expect(state.config).toEqual(before);
  });

  it("a toy room refuses a config with an extra key (strict schema)", () => {
    const state = freshToyRoom(3);
    const before = state.config;
    const result = setConfig(state, state.hostSeatId!, { rounds: 2, extra: 1 }, 300, TEST_GAME_REGISTRY);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("bad_request");
    expect(state.config).toEqual(before);
  });

  it("a Hanabi room refuses a toy-shaped config", () => {
    const state = freshHanabiRoom(2);
    const before = state.config;
    const result = setConfig(state, state.hostSeatId!, { rounds: 2 }, 300, TEST_GAME_REGISTRY);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("bad_request");
    expect(state.config).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// D-10/MGR-05: per-game view-schema dispatch, fail-closed
// ---------------------------------------------------------------------------

describe("D-10/MGR-05: per-game view-schema dispatch is fail-closed", () => {
  it("a started toy room's projected seat view passes ToyViewSchema and carries the toy's own limits/displayName", () => {
    let state = freshToyRoom(3);
    const started = startGame(state, state.hostSeatId!, 400, "seed-2", TEST_GAME_REGISTRY);
    if (!started.ok) throw new Error("unreachable");
    state = started.state;

    const seatId = state.seats[0]!.seatId;
    const projected = projectSeatView(state, seatId, TEST_GAME_REGISTRY);
    expect(projected).not.toBeNull();
    expect(projected!.gameId).toBe(TOY_GAME_ID);
    expect(projected!.gameDisplayName).toBe("Toy Test Game");
    expect(projected!.limits).toEqual({ min: 3, max: 4 });
    expect(projected!.game).toMatchObject({ you: seatId, rounds: 1 });
  });

  it("a leaky toy adapter's extra `secret` key fails closed to null, never a stripped/partial view", () => {
    let state = freshToyRoom(3);
    const started = startGame(state, state.hostSeatId!, 400, "seed-2", LEAKY_TOY_REGISTRY);
    if (!started.ok) throw new Error("unreachable");
    state = started.state;

    const seatId = state.seats[0]!.seatId;
    const projected = projectSeatView(state, seatId, LEAKY_TOY_REGISTRY);
    expect(projected).toBeNull();
  });

  it("a Hanabi-shaped game under the toy gameId fails closed to null (validateGameView)", () => {
    let toyState = freshToyRoom(3);
    const started = startGame(toyState, toyState.hostSeatId!, 400, "seed-2", TEST_GAME_REGISTRY);
    if (!started.ok) throw new Error("unreachable");
    toyState = started.state;

    const hanabiState = freshHanabiRoom(2);
    const hanabiView = toSeatView(hanabiState, hanabiState.seats[0]!.seatId, TEST_GAME_REGISTRY);

    // A view claiming the toy's gameId but carrying Hanabi's (lobby-null)
    // game shape — swap in the toy room's OWN started view's `game` shape is
    // unnecessary here; a null game short-circuits validateGameView, so use
    // the Hanabi room's real (non-toy-shaped) `game` field directly under a
    // toy gameId to prove the mismatch is rejected.
    const mismatchedView = { ...hanabiView, gameId: TOY_GAME_ID, game: { unexpectedShape: true } };
    expect(validateGameView(mismatchedView, TEST_GAME_REGISTRY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D-10/D-01: first join locks the room's game
// ---------------------------------------------------------------------------

describe("D-10/D-01: the first join's gameId locks a room to the toy game", () => {
  it("a first join with gameId TOY locks the room: gameId TOY, config = toy default, gameLocked true", () => {
    const minter = makeMinter();
    const state = createEmptyRoom(ROOM_CODE, 0, TEST_GAME_REGISTRY);
    const first = join(state, "Host", 1, minter, { gameId: TOY_GAME_ID });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");
    expect(first.state.gameId).toBe(TOY_GAME_ID);
    expect(first.state.config).toEqual({ rounds: 1 });
    expect(first.state.gameLocked).toBe(true);
  });

  it("a second join with gameId hanabi cannot unlock/change an already-toy-locked room", () => {
    const minter = makeMinter();
    let state = createEmptyRoom(ROOM_CODE, 0, TEST_GAME_REGISTRY);
    const first = join(state, "Host", 1, minter, { gameId: TOY_GAME_ID });
    if (!first.ok) throw new Error("unreachable");
    state = first.state;

    const second = join(state, "Guest", 2, minter, { gameId: "hanabi" as never });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("unreachable");
    expect(second.state.gameId).toBe(TOY_GAME_ID);
  });

  it("a reclaim (seatToken match) carrying gameId hanabi leaves the locked toy game unchanged", () => {
    const minter = makeMinter();
    let state = createEmptyRoom(ROOM_CODE, 0, TEST_GAME_REGISTRY);
    const first = join(state, "Host", 1, minter, { gameId: TOY_GAME_ID });
    if (!first.ok) throw new Error("unreachable");
    state = first.state;

    const reclaim = join(state, "Host", 2, minter, {
      seatToken: first.seatToken,
      gameId: "hanabi" as never,
    });
    expect(reclaim.ok).toBe(true);
    if (!reclaim.ok) throw new Error("unreachable");
    expect(reclaim.state.gameId).toBe(TOY_GAME_ID);
  });
});

// ---------------------------------------------------------------------------
// D-10: unknown game ids fail closed
// ---------------------------------------------------------------------------

describe("D-10: an unknown gameId is refused, and prototype-chain keys never resolve", () => {
  it("a first join whose gameId is absent from the injected registry is refused bad_request", () => {
    const minter = makeMinter();
    const state = createEmptyRoom(ROOM_CODE, 0, TEST_GAME_REGISTRY);
    const result = join(state, "Host", 1, minter, { gameId: "__not_registered__" as never });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("bad_request");
  });

  it("resolveGame('__proto__') and resolveGame('toString') are undefined against TEST_GAME_REGISTRY", () => {
    expect(resolveGame("__proto__", TEST_GAME_REGISTRY)).toBeUndefined();
    expect(resolveGame("toString", TEST_GAME_REGISTRY)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// D-10: a Hanabi room and a toy room coexist, each started and projected
// against its own game
// ---------------------------------------------------------------------------

describe("D-10: a Hanabi room and a toy room coexist against the SAME injected registry", () => {
  it("both start; each seat's projected view validates against its own game; each error is namespaced to its own gameId", () => {
    let hanabiState = freshHanabiRoom(2);
    const hanabiStarted = startGame(hanabiState, hanabiState.hostSeatId!, 500, "seed-h", TEST_GAME_REGISTRY);
    if (!hanabiStarted.ok) throw new Error("unreachable");
    hanabiState = hanabiStarted.state;

    let toyState = freshToyRoom(3);
    const toyStarted = startGame(toyState, toyState.hostSeatId!, 500, "seed-t", TEST_GAME_REGISTRY);
    if (!toyStarted.ok) throw new Error("unreachable");
    toyState = toyStarted.state;

    const hanabiSeatId = hanabiState.seats[0]!.seatId;
    const toySeatId = toyState.seats[0]!.seatId;

    const hanabiProjected = projectSeatView(hanabiState, hanabiSeatId, TEST_GAME_REGISTRY);
    const toyProjected = projectSeatView(toyState, toySeatId, TEST_GAME_REGISTRY);
    expect(hanabiProjected).not.toBeNull();
    expect(toyProjected).not.toBeNull();
    expect(hanabiProjected!.gameId).toBe("hanabi");
    expect(toyProjected!.gameId).toBe(TOY_GAME_ID);

    // Toy error: the active seat is toyState.seats[0]; have the non-active
    // seat attempt a pass out of turn.
    const toyOtherSeatId = toyState.seats[1]!.seatId;
    const toyActionResult = applyGameAction(toyState, toyOtherSeatId, "toy-action-1", { type: "pass" }, 600, TEST_GAME_REGISTRY);
    expect(toyActionResult.ok).toBe(false);
    if (toyActionResult.ok) throw new Error("unreachable");
    expect(toyActionResult.gameError).toEqual({ gameId: TOY_GAME_ID, code: "toy_not_your_turn" });

    // Hanabi error: the active seat is hanabiState.game's turnIndex seat; have
    // the OTHER seat attempt an action out of turn via a well-formed but
    // wrong-actor discard request (any hand card id refuses not_your_turn
    // before the card is even looked up).
    const hanabiGame = hanabiState.game as { turnIndex: number; seatIds: string[]; hands: { seatId: string; slots: { card: { id: string } }[] }[] };
    const activeSeatId = hanabiGame.seatIds[hanabiGame.turnIndex]!;
    const inactiveSeatId = hanabiState.seats.find((s) => s.seatId !== activeSeatId)!.seatId;
    const inactiveHand = hanabiGame.hands.find((h) => h.seatId === inactiveSeatId)!;
    const hanabiActionResult = applyGameAction(
      hanabiState,
      inactiveSeatId,
      "hanabi-action-1",
      { type: "discard", cardId: inactiveHand.slots[0]!.card.id },
      600,
      TEST_GAME_REGISTRY,
    );
    expect(hanabiActionResult.ok).toBe(false);
    if (hanabiActionResult.ok) throw new Error("unreachable");
    expect(hanabiActionResult.gameError).toEqual({ gameId: "hanabi", code: "not_your_turn" });
  });
});

// ---------------------------------------------------------------------------
// D-09/D-10: production isolation — the toy is unreachable outside tests
// ---------------------------------------------------------------------------

describe("D-09/D-10: the toy game is unreachable in production", () => {
  it("GameIdSchema is closed to hanabi only, and rejects the toy id", () => {
    expect(GameIdSchema.options).toEqual(["hanabi"]);
    expect(GameIdSchema.safeParse(TOY_GAME_ID).success).toBe(false);
  });

  it("the production GAME_REGISTRY has exactly one key: hanabi", () => {
    expect(Object.keys(GAME_REGISTRY)).toEqual(["hanabi"]);
  });

  it("a join frame carrying the toy gameId fails ClientMessageSchema parsing, bad_request", () => {
    const raw = JSON.stringify({
      type: "join",
      displayName: "Host",
      gameId: TOY_GAME_ID,
    });
    const result = parseClientMessage(raw);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("bad_request");
  });
});
