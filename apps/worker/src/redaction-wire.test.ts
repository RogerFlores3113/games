// D-11 layer 2 / D-12 / D-14: this layer checks the ENCODED JSON STRING that
// would actually be sent over the wire — not the in-memory view object — and
// it reuses the SAME `checkSeatViewForLeaks` checker from `@games/rules`
// that layer 1 (packages/rules/src/forehead-card.property.test.ts) uses, so
// the canary evidence for the checker extends to this layer too.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { checkSeatViewForLeaks, FOREHEAD_CARD_VALUES, secretsForSeat } from "@games/rules";
import type { RoomView } from "@games/schema";
import { encodeServerMessage } from "@games/schema";
import { createEmptyRoom, joinRoom, startGame, applyGameAction, toSeatView } from "./room-state";
import type { JoinInput } from "./room-state";
import type { RoomCode } from "@games/schema";
import { mintSeatToken } from "./seat-identity";
import { projectSeatView, validateGameView } from "./seat-projection";
import type { ActiveGameState } from "./game-registration";

const ROOM_CODE = "ABCDEF" as RoomCode;

function buildStartedRoom(seatCount: number, seed: string) {
  let state = createEmptyRoom(ROOM_CODE, "base", 0);
  const seatIds: string[] = [];
  let now = 1;
  for (let i = 0; i < seatCount; i++) {
    const input: JoinInput = {
      displayName: `Player${i}`,
      now: now++,
      mintSeatId: () => `seat-${i}`,
      mintSeatToken,
    };
    const result = joinRoom(state, input);
    if (!result.ok) throw new Error("unreachable: join failed building fixture");
    state = result.state;
    seatIds.push(result.seatId);
  }

  const hostSeatId = seatIds[0]!;
  const started = startGame(state, hostSeatId, now++, seed);
  if (!started.ok) throw new Error("unreachable: startGame failed building fixture");
  return { state: started.state, seatIds };
}

/** Asserts, for every seat, that BOTH a `state` frame and a `joined` frame
 * encode to a string with zero leak reasons, per `checkSeatViewForLeaks`
 * run on the parsed object AND on the raw string. */
function assertNoWireLeaksForEveryState(
  room: ReturnType<typeof buildStartedRoom>["state"],
  seatIds: readonly string[],
) {
  expect(room.seed).toBeDefined();
  expect(room.seed!.length).toBeGreaterThan(0);

  for (const seatId of seatIds) {
    const projected = projectSeatView(room, seatId);
    expect(projected).not.toBeNull();
    const view = projected as unknown as RoomView;

    const secrets = secretsForSeat(room.game as ActiveGameState, seatId, room.seed);

    const stateFrame = encodeServerMessage({ type: "state", view });
    const joinedFrame = encodeServerMessage({
      type: "joined",
      seatId,
      seatToken: mintSeatToken(),
      view,
    });

    for (const frame of [stateFrame, joinedFrame]) {
      const parsedReasons = checkSeatViewForLeaks({
        view: JSON.parse(frame),
        serialized: frame,
        secrets,
      });
      expect(parsedReasons).toEqual([]);

      const inMemoryReasons = checkSeatViewForLeaks({
        view,
        serialized: frame,
        secrets,
      });
      expect(inMemoryReasons).toEqual([]);
    }
  }
}

describe("D-11 layer 2: the encoded wire string never leaks own value, deck contents, or seed", () => {
  it("holds over 100 random games (2-5 seats, random seed, random guess sequence)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        fc.stringMatching(/^[0-9a-f]{32}$/),
        fc.array(fc.nat({ max: 15 }), { maxLength: 16 }),
        (seatCount, seed, guessIndexes) => {
          const { state: initial, seatIds } = buildStartedRoom(seatCount, seed);
          let room = initial;
          assertNoWireLeaksForEveryState(room, seatIds);

          for (const index of guessIndexes) {
            if (room.status !== "in_progress") break;
            const game = room.game as ActiveGameState;
            const activeSeatId = game.seatIds[game.turnIndex]!;
            const result = applyGameAction(
              room,
              activeSeatId,
              { type: "guess", value: FOREHEAD_CARD_VALUES[index] },
              room.lastActivityAt + 1,
            );
            if (result.ok) room = result.state;
            assertNoWireLeaksForEveryState(room, seatIds);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("a 5-seat room played to status 'ended' produces leak-free state frames for every seat at the final state", () => {
    const seed = "fedcba9876543210fedcba9876543210";
    const { state: initial, seatIds } = buildStartedRoom(5, seed);
    let room = initial;
    assertNoWireLeaksForEveryState(room, seatIds);

    let guesses = 0;
    while (room.status === "in_progress") {
      const game = room.game as ActiveGameState;
      const activeSeatId = game.seatIds[game.turnIndex]!;
      const hand = game.hands.find((h) => h.seatId === activeSeatId)!;
      const result = applyGameAction(
        room,
        activeSeatId,
        { type: "guess", value: hand.card.value },
        room.lastActivityAt + 1,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      room = result.state;
      guesses++;
      assertNoWireLeaksForEveryState(room, seatIds);
    }

    expect(room.status).toBe("ended");
    expect(guesses).toBe(11);
    assertNoWireLeaksForEveryState(room, seatIds);
  });

  it("wire canary: a leaky view (own value present) is rejected by validateGameView, but would encode successfully and be caught by checkSeatViewForLeaks — proving the strict game gate, not RoomViewSchema, is what blocks the leak", () => {
    const seed = "0123456789abcdef0123456789abcdef";
    const { state: room, seatIds } = buildStartedRoom(2, seed);
    const seatId = seatIds[0]!;
    const cleanView = toSeatView(room, seatId);
    const secretsBefore = secretsForSeat(room.game as ActiveGameState, seatId, room.seed);
    if (secretsBefore.ownCard === null) throw new Error("unreachable: seated player has no own card");

    // Force a leak: the seat's own card is given its real value.
    const cleanGame = cleanView.game as { yourCard: { id: string; hidden: true } };
    const leakyGame = {
      ...cleanGame,
      yourCard: { ...cleanGame.yourCard, hidden: true, value: secretsBefore.ownCard.value },
    };
    const leakyView: RoomView = { ...cleanView, game: leakyGame };

    // The strict game gate rejects it.
    expect(validateGameView(leakyView)).toBeNull();

    // But RoomViewSchema.game is z.unknown(), so encodeServerMessage (which
    // only validates ServerMessageSchema / RoomViewSchema, not the game
    // schema) encodes it successfully — proving the room schema alone would
    // NOT have blocked this leak.
    const frame = encodeServerMessage({ type: "state", view: leakyView });
    expect(typeof frame).toBe("string");

    const secrets = secretsForSeat(room.game as ActiveGameState, seatId, room.seed);
    const reasons = checkSeatViewForLeaks({ view: JSON.parse(frame), serialized: frame, secrets });
    expect(reasons).toContain("string:own-value");
  });
});
