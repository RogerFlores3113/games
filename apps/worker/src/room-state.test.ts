import { describe, expect, it } from "vitest";
import type { RoomCode, RoomState, SeatToken } from "@games/schema";
import { IDLE_GC_LOBBY_MS, MAX_PLAYERS, RoomStateSchema } from "@games/schema";
import type { HanabiAction, HanabiView } from "@games/rules";
import { RANKS } from "@games/rules";
import { computeRoomTimers } from "./scheduler";
import { activeGame } from "./game-registration";
import type { ActiveGameState } from "./game-registration";
import {
  applyGameAction,
  createEmptyRoom,
  deferIdleGc,
  deleteRoom,
  joinRoom,
  markConnected,
  releaseSeat,
  restartLobby,
  setVariant,
  startGame,
  toSeatView,
  transferHost,
} from "./room-state";
import type { JoinInput } from "./room-state";

// ---------------------------------------------------------------------------
// Deterministic fixture helpers
// ---------------------------------------------------------------------------

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
  seatToken?: SeatToken,
) {
  const input: JoinInput = {
    displayName,
    now,
    mintSeatId: minter.mintSeatId,
    mintSeatToken: minter.mintSeatToken,
    ...(seatToken !== undefined ? { seatToken } : {}),
  };
  return joinRoom(state, input);
}

function freshRoom(now = 0): RoomState {
  return createEmptyRoom(ROOM_CODE, "base", now);
}

/** Derives ONE legal Hanabi action for the active seat, in priority order:
 * a rank clue naming a card an other seat actually holds (cannot be refused
 * for touching nothing) when clue tokens are available; else a discard of
 * the actor's first card when below the token cap; else a play of the
 * actor's first card. */
function legalActionFor(game: ActiveGameState): HanabiAction {
  const activeSeatId = game.seatIds[game.turnIndex]!;
  const activeHand = game.hands.find((h) => h.seatId === activeSeatId)!;

  if (game.clueTokens > 0) {
    const otherHand = game.hands.find(
      (h) => h.seatId !== activeSeatId && h.slots.length > 0,
    );
    if (otherHand !== undefined) {
      const card = otherHand.slots[0]!.card;
      return {
        type: "clue",
        targetSeatId: otherHand.seatId,
        clue: { type: "rank", value: card.rank },
      };
    }
  }

  if (game.clueTokens < 8) {
    return { type: "discard", cardId: activeHand.slots[0]!.card.id };
  }

  return { type: "play", cardId: activeHand.slots[0]!.card.id };
}

// ---------------------------------------------------------------------------
// ROOM-03: duplicate display-name disambiguation
// ---------------------------------------------------------------------------

describe("ROOM-03: duplicate display names are disambiguated", () => {
  it("ROOM-03: two joins with the same name get distinct labels and seat ids", () => {
    const minter = makeMinter();
    let state = freshRoom();

    const first = join(state, "Roger", 1, minter);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");
    state = first.state;

    const second = join(state, "Roger", 2, minter);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("unreachable");
    state = second.state;

    expect(first.seatId).not.toBe(second.seatId);
    const seatA = state.seats.find((s) => s.seatId === first.seatId);
    const seatB = state.seats.find((s) => s.seatId === second.seatId);
    expect(seatA?.displayLabel).toBe("Roger");
    expect(seatB?.displayLabel).toBe("Roger (2)");

    // A third seat's view shows both distinct labels.
    const thirdJoin = join(state, "Alice", 3, minter);
    if (!thirdJoin.ok) throw new Error("unreachable");
    const view = toSeatView(thirdJoin.state, thirdJoin.seatId);
    const labels = view.seats.map((s) => s.displayLabel).sort();
    expect(labels).toEqual(["Alice", "Roger", "Roger (2)"].sort());
  });
});

// ---------------------------------------------------------------------------
// Join idempotency: a replayed tokenless join (reconnect before `joined`)
// ---------------------------------------------------------------------------

describe("join idempotency: a replayed join reclaims the seat it created", () => {
  const JOIN_ID_A = "joinid-aaaaaaaaaaaaaaaa";
  const JOIN_ID_B = "joinid-bbbbbbbbbbbbbbbb";

  function joinWithId(state: RoomState, displayName: string, now: number, minter: ReturnType<typeof makeMinter>, joinId: string) {
    return joinRoom(state, {
      displayName,
      now,
      joinId,
      mintSeatId: minter.mintSeatId,
      mintSeatToken: minter.mintSeatToken,
    });
  }

  it("a tokenless join replaying the same joinId returns the original seat and token, not a second seat", () => {
    const minter = makeMinter();
    const first = joinWithId(freshRoom(), "Eli", 1, minter, JOIN_ID_A);
    if (!first.ok) throw new Error("unreachable");

    const replay = joinWithId(first.state, "Eli", 2, minter, JOIN_ID_A);
    if (!replay.ok) throw new Error("unreachable");
    expect(replay.wasReclaim).toBe(true);
    expect(replay.seatId).toBe(first.seatId);
    expect(replay.seatToken).toBe(first.seatToken);
    expect(replay.state.seats).toHaveLength(1);
  });

  it("the replay reclaims even when the room is now full, instead of being refused full", () => {
    const minter = makeMinter();
    let state = freshRoom();
    const ids = ["joinid-1111111111111111", "joinid-2222222222222222", "joinid-3333333333333333", "joinid-4444444444444444"];
    for (const [i, id] of ids.entries()) {
      const r = joinWithId(state, `P${i}`, i, minter, id);
      if (!r.ok) throw new Error("unreachable");
      state = r.state;
    }
    const last = joinWithId(state, "Eli", 10, minter, JOIN_ID_A);
    if (!last.ok) throw new Error("unreachable");
    expect(last.state.seats).toHaveLength(MAX_PLAYERS);

    const replay = joinWithId(last.state, "Eli", 11, minter, JOIN_ID_A);
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error("unreachable");
    expect(replay.seatId).toBe(last.seatId);
  });

  it("the replay reclaims after the game has started, instead of being refused in_progress", () => {
    const minter = makeMinter();
    const host = joinWithId(freshRoom(), "Roger", 1, minter, JOIN_ID_A);
    if (!host.ok) throw new Error("unreachable");
    const guest = joinWithId(host.state, "Bianca", 2, minter, JOIN_ID_B);
    if (!guest.ok) throw new Error("unreachable");
    const started = startGame(guest.state, host.seatId, 3, "seed-1");
    if (!started.ok) throw new Error("unreachable");

    const replay = joinWithId(started.state, "Bianca", 4, minter, JOIN_ID_B);
    if (!replay.ok) throw new Error("unreachable");
    expect(replay.seatId).toBe(guest.seatId);
  });

  it("a different joinId is a different player and gets its own seat", () => {
    const minter = makeMinter();
    const first = joinWithId(freshRoom(), "Roger", 1, minter, JOIN_ID_A);
    if (!first.ok) throw new Error("unreachable");
    const second = joinWithId(first.state, "Roger", 2, minter, JOIN_ID_B);
    if (!second.ok) throw new Error("unreachable");
    expect(second.wasReclaim).toBe(false);
    expect(second.seatId).not.toBe(first.seatId);
    expect(second.state.seats).toHaveLength(2);
  });

  it("a join with no joinId never matches a seat created without one", () => {
    const minter = makeMinter();
    const first = join(freshRoom(), "Roger", 1, minter);
    if (!first.ok) throw new Error("unreachable");
    const second = join(first.state, "Roger", 2, minter);
    if (!second.ok) throw new Error("unreachable");
    expect(second.state.seats).toHaveLength(2);
  });

  it("the joinId is never part of a seat's client view", () => {
    const minter = makeMinter();
    const first = joinWithId(freshRoom(), "Roger", 1, minter, JOIN_ID_A);
    if (!first.ok) throw new Error("unreachable");
    expect(JSON.stringify(toSeatView(first.state, first.seatId))).not.toContain(JOIN_ID_A);
  });
});

// ---------------------------------------------------------------------------
// ROOM-05 / D-13: variant lock
// ---------------------------------------------------------------------------

describe("ROOM-05: variant lock", () => {
  it("ROOM-05: host can change variant repeatedly in the lobby", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    let state = hostJoin.state;

    const r1 = setVariant(state, hostJoin.seatId, "rainbow", 2);
    expect(r1.ok).toBe(true);
    if (!r1.ok) throw new Error("unreachable");
    expect(r1.state.variant).toBe("rainbow");
    state = r1.state;

    const r2 = setVariant(state, hostJoin.seatId, "black", 3);
    expect(r2.ok).toBe(true);
    if (!r2.ok) throw new Error("unreachable");
    expect(r2.state.variant).toBe("black");
  });

  it("WR-02: a variant change counts as lobby activity", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");

    const result = setVariant(hostJoin.state, hostJoin.seatId, "rainbow", 99);
    if (!result.ok) throw new Error("unreachable");
    expect(result.state.lastActivityAt).toBe(99);
  });

  it("ROOM-05: a non-host setVariant is refused not_host", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const guestJoin = join(hostJoin.state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");

    const result = setVariant(guestJoin.state, guestJoin.seatId, "rainbow", 3);
    expect(result).toEqual({ ok: false, reason: "not_host" });
  });

  it("ROOM-05 / D-13: setVariant after start is refused and the variant is unchanged", () => {
    const minter = makeMinter();
    let state = freshRoom();
    const hostJoin = join(state, "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    state = hostJoin.state;
    const guestJoin = join(state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");
    state = guestJoin.state;

    const started = startGame(state, hostJoin.seatId, 3, "seed-1");
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error("unreachable");
    state = started.state;

    const attempt = setVariant(state, hostJoin.seatId, "black", 4);
    expect(attempt).toEqual({ ok: false, reason: "bad_request" });
    expect(state.variant).toBe("base");
  });
});

// ---------------------------------------------------------------------------
// ROOM-06 / D-10: start gating, no ready state
// ---------------------------------------------------------------------------

describe("ROOM-06: start is gated only on seat count and host", () => {
  it("ROOM-06: startGame with 1 seat is refused bad_request", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");

    const result = startGame(hostJoin.state, hostJoin.seatId, 2, "seed");
    expect(result).toEqual({ ok: false, reason: "bad_request" });
  });

  it("ROOM-06: startGame with 2 seats succeeds", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const guestJoin = join(hostJoin.state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");

    const result = startGame(guestJoin.state, hostJoin.seatId, 3, "seed");
    expect(result.ok).toBe(true);
  });

  it("ROOM-06: startGame with 5 seats succeeds and a 6th join is refused full", () => {
    const minter = makeMinter();
    let state = freshRoom();
    let hostSeatId = "";
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const result = join(state, `Player${i}`, i + 1, minter);
      if (!result.ok) throw new Error("unreachable");
      state = result.state;
      if (i === 0) hostSeatId = result.seatId;
    }

    const started = startGame(state, hostSeatId, 100, "seed");
    expect(started.ok).toBe(true);

    // A 6th arrival to the (still-lobby, pre-start) room would be refused
    // full; verify against the pre-start state directly.
    const sixth = join(state, "Sixth", 200, minter);
    expect(sixth).toEqual({ ok: false, reason: "full" });
  });

  it("ROOM-06: a non-host startGame is refused not_host", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const guestJoin = join(hostJoin.state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");

    const result = startGame(guestJoin.state, guestJoin.seatId, 3, "seed");
    expect(result).toEqual({ ok: false, reason: "not_host" });
  });

  it("ROOM-06 / D-10: starting requires no ready signal of any kind", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const guestJoin = join(hostJoin.state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");

    // No ready toggle exists anywhere on Seat or RoomState — starting
    // immediately after two joins, with no intermediate step, must succeed.
    const result = startGame(guestJoin.state, hostJoin.seatId, 3, "seed");
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ROOM-07 / D-14 and D-06: refusals never leak partial state
// ---------------------------------------------------------------------------

describe("ROOM-07: refusals carry no room state", () => {
  it("ROOM-07 / D-14: a tokenless join at an in-progress room is refused in_progress with no leaked fields", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const guestJoin = join(hostJoin.state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");
    const started = startGame(guestJoin.state, hostJoin.seatId, 3, "seed");
    if (!started.ok) throw new Error("unreachable");

    const result = join(started.state, "Latecomer", 4, minter);
    expect(result).toEqual({ ok: false, reason: "in_progress" });
    expect(Object.keys(result).sort()).toEqual(["ok", "reason"]);
  });

  it("D-06: a join at MAX_PLAYERS is refused full with no leaked fields", () => {
    const minter = makeMinter();
    let state = freshRoom();
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const result = join(state, `Player${i}`, i + 1, minter);
      if (!result.ok) throw new Error("unreachable");
      state = result.state;
    }

    const result = join(state, "Overflow", 100, minter);
    expect(result).toEqual({ ok: false, reason: "full" });
    expect(Object.keys(result).sort()).toEqual(["ok", "reason"]);
  });
});

// ---------------------------------------------------------------------------
// D-12: leaving the lobby frees the seat
// ---------------------------------------------------------------------------

describe("D-12: releasing a lobby seat frees it", () => {
  it("D-12: releaseSeat removes the seat and a subsequent join re-fills the room", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const guestJoin = join(hostJoin.state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");

    const afterRelease = releaseSeat(guestJoin.state, guestJoin.seatId, 3);
    if (!afterRelease.ok) throw new Error("unreachable");
    expect(afterRelease.state.seats).toHaveLength(1);

    const rejoin = join(afterRelease.state, "NewGuest", 4, minter);
    if (!rejoin.ok) throw new Error("unreachable");
    expect(rejoin.state.seats).toHaveLength(2);
  });

  it("D-12: releasing the host reassigns hostSeatId to the earliest remaining seat", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const guestJoin = join(hostJoin.state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");
    const thirdJoin = join(guestJoin.state, "Third", 3, minter);
    if (!thirdJoin.ok) throw new Error("unreachable");

    const afterHostLeaves = releaseSeat(thirdJoin.state, hostJoin.seatId, 4);
    if (!afterHostLeaves.ok) throw new Error("unreachable");
    expect(afterHostLeaves.state.hostSeatId).toBe(guestJoin.seatId);
  });

  it("CR-03: releaseSeat refuses once the game has started, leaving seats and turn order intact", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const guestJoin = join(hostJoin.state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");
    const started = startGame(guestJoin.state, hostJoin.seatId, 3, "seed");
    if (!started.ok) throw new Error("unreachable");

    const attempt = releaseSeat(started.state, guestJoin.seatId, 4);
    expect(attempt).toEqual({ ok: false, reason: "bad_request" });
    expect(started.state.seats).toHaveLength(2);
  });

  it("WR-09: releasing the host skips a disconnected earliest seat and hands host to the earliest CONNECTED one", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const guestJoin = join(hostJoin.state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");
    const thirdJoin = join(guestJoin.state, "Third", 3, minter);
    if (!thirdJoin.ok) throw new Error("unreachable");
    const guestAway = markConnected(thirdJoin.state, guestJoin.seatId, false, 4);

    const afterHostLeaves = releaseSeat(guestAway, hostJoin.seatId, 5);
    if (!afterHostLeaves.ok) throw new Error("unreachable");
    expect(afterHostLeaves.state.hostSeatId).toBe(thirdJoin.seatId);
  });

  it("WR-09: with no connected seat left, host still falls back to the earliest remaining seat", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const guestJoin = join(hostJoin.state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");
    const guestAway = markConnected(guestJoin.state, guestJoin.seatId, false, 3);

    const afterHostLeaves = releaseSeat(guestAway, hostJoin.seatId, 4);
    if (!afterHostLeaves.ok) throw new Error("unreachable");
    expect(afterHostLeaves.state.hostSeatId).toBe(guestJoin.seatId);
  });
});

// ---------------------------------------------------------------------------
// D-07: host auto-transfer on disconnect grace expiry
// ---------------------------------------------------------------------------

describe("D-07: host transfer on disconnect", () => {
  it("D-07: transferHost moves host to the earliest connected seat after the host disconnects", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const guestJoin = join(hostJoin.state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");

    const disconnected = markConnected(guestJoin.state, hostJoin.seatId, false, 3);
    const hostSeat = disconnected.seats.find((s) => s.seatId === hostJoin.seatId);
    expect(hostSeat?.disconnectedAt).toBe(3);

    const transferred = transferHost(disconnected, 4);
    expect(transferred.hostSeatId).toBe(guestJoin.seatId);
  });

  it("D-07: transferHost is a no-op while the host is still connected", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const guestJoin = join(hostJoin.state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");

    const transferred = transferHost(guestJoin.state, 3);
    expect(transferred.hostSeatId).toBe(hostJoin.seatId);
  });

  it("D-07: transferHost is a no-op when no connected seat exists to hand off to", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const disconnected = markConnected(hostJoin.state, hostJoin.seatId, false, 2);

    const transferred = transferHost(disconnected, 3);
    expect(transferred.hostSeatId).toBe(hostJoin.seatId);
    expect(transferred).toBe(disconnected);
  });
});

// ---------------------------------------------------------------------------
// WR-02: idle GC never collects a room players are still connected to
// ---------------------------------------------------------------------------

describe("WR-02: deferring idle GC while connections are live", () => {
  it("deferIdleGc restarts the idle clock at now, pushing idle_gc a full threshold out", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const idleAt = hostJoin.state.lastActivityAt + IDLE_GC_LOBBY_MS;

    const deferred = deferIdleGc(hostJoin.state, idleAt);

    expect(deferred.seats).toEqual(hostJoin.state.seats);
    const idleGc = computeRoomTimers(deferred, idleAt).find((t) => t.type === "idle_gc");
    expect(idleGc?.dueAt).toBe(idleAt + IDLE_GC_LOBBY_MS);
  });
});

// ---------------------------------------------------------------------------
// D-02 / FDN-01: game action delegation through the registered adapter only
// ---------------------------------------------------------------------------

describe("D-02 / FDN-01: game actions are delegated to the registered adapter only", () => {
  it("D-02 / FDN-01: applyGameAction accepts the active seat's clue and refuses a repeat from the same seat", () => {
    const minter = makeMinter();
    let state = freshRoom();
    const hostJoin = join(state, "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    state = hostJoin.state;
    const guestJoin = join(state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");
    state = guestJoin.state;
    const thirdJoin = join(state, "Third", 3, minter);
    if (!thirdJoin.ok) throw new Error("unreachable");
    state = thirdJoin.state;

    const started = startGame(state, hostJoin.seatId, 4, "0123456789abcdef0123456789abcdef");
    if (!started.ok) throw new Error("unreachable");
    state = started.state;

    const game = state.game as ActiveGameState;
    const activeSeatId = game.seatIds[game.turnIndex]!;
    const action = legalActionFor(game);

    const activeAttempt = applyGameAction(state, activeSeatId, "action-1", action, 5);
    expect(activeAttempt.ok).toBe(true);
    if (!activeAttempt.ok) throw new Error("unreachable");
    state = activeAttempt.state;

    // The same seat going again with a NEW actionId (now off-turn) is refused.
    const wrongTurn = applyGameAction(state, activeSeatId, "action-2", action, 6);
    expect(wrongTurn.ok).toBe(false);

    // Exactly one seat's view reports isYourTurn === true.
    const yourTurnFlags = state.seats.map(
      (seat) => (toSeatView(state, seat.seatId).game as HanabiView).isYourTurn,
    );
    expect(yourTurnFlags.filter(Boolean)).toHaveLength(1);
  });

  it("D-02 / FDN-01: a 2-seat game played to the end refuses further actions, and every yourHand card has sorted keys [\"facts\",\"hidden\",\"id\"] when hidden", () => {
    const minter = makeMinter();
    let state = freshRoom();
    const hostJoin = join(state, "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    state = hostJoin.state;
    const guestJoin = join(state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");
    state = guestJoin.state;

    const started = startGame(state, hostJoin.seatId, 3, "fedcba9876543210fedcba9876543210");
    if (!started.ok) throw new Error("unreachable");
    state = started.state;

    let guard = 0;
    let lastActor = "";
    let lastAction: HanabiAction | null = null;
    while (state.status === "in_progress" && guard < 2000) {
      guard++;
      const game = state.game as ActiveGameState;
      lastActor = game.seatIds[game.turnIndex]!;
      lastAction = legalActionFor(game);
      const result = applyGameAction(state, lastActor, `action-${guard}`, lastAction, 10 + guard);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      state = result.state;
    }

    expect(state.status).toBe("ended");

    // WR-01: retrying the game-ENDING action's own actionId is an idempotent
    // success (dedup runs before the status gate), and changes nothing.
    const endedState = state;
    const retry = applyGameAction(endedState, lastActor, `action-${guard}`, lastAction, 9998);
    expect(retry.ok).toBe(true);
    if (!retry.ok) throw new Error("unreachable");
    expect(retry.state).toBe(endedState);

    const game = state.game as ActiveGameState;
    const stillActiveSeatId = game.seatIds[game.turnIndex]!;
    const further = applyGameAction(state, stillActiveSeatId, "action-final", legalActionFor(game), 9999);
    expect(further.ok).toBe(false);

    for (const seat of state.seats) {
      const view = toSeatView(state, seat.seatId).game as HanabiView;
      for (const card of view.yourHand) {
        if (card.hidden) {
          expect(Object.keys(card).sort()).toEqual(["facts", "hidden", "id"]);
        }
      }
    }
  });

  it("D-02: createEmptyRoom registers the active adapter's id", () => {
    expect(createEmptyRoom(ROOM_CODE, "base", 0).adapterId).toBe("hanabi");
  });

  it("D-06: activeGame.adapter.id matches the registered game view schema's game id", () => {
    expect(activeGame.adapter.id).toBe(activeGame.gameId);
  });
});

// ---------------------------------------------------------------------------
// HIDE-02 groundwork: toSeatView never leaks any minted seat token
// ---------------------------------------------------------------------------

describe("HIDE-02 groundwork: toSeatView never leaks a seat token", () => {
  it("no minted seat token appears in any seat's serialized view", () => {
    const minter = makeMinter();
    let state = freshRoom();
    const tokens: string[] = [];

    for (let i = 0; i < 3; i++) {
      const result = join(state, `Player${i}`, i + 1, minter);
      if (!result.ok) throw new Error("unreachable");
      state = result.state;
      tokens.push(result.seatToken as unknown as string);
    }

    for (const seat of state.seats) {
      const serialized = JSON.stringify(toSeatView(state, seat.seatId));
      for (const token of tokens) {
        expect(serialized.includes(token)).toBe(false);
      }
    }
  });
});

describe("WR-07: the game seed is persisted server-side and never projected", () => {
  it("startGame stores the secret seed in RoomState, and no seat's view carries it", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const guestJoin = join(hostJoin.state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");
    const secret = "0123456789abcdef0123456789abcdef";

    const started = startGame(guestJoin.state, hostJoin.seatId, 3, secret);
    if (!started.ok) throw new Error("unreachable");

    expect(started.state.seed).toBe(secret);
    for (const seat of started.state.seats) {
      expect(JSON.stringify(toSeatView(started.state, seat.seatId)).includes(secret)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Purity: no function mutates its input
// ---------------------------------------------------------------------------

describe("purity: room-state functions never mutate their input", () => {
  it("joinRoom, markConnected, releaseSeat, setVariant, startGame, applyGameAction, transferHost all leave the original input deep-equal", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const guestJoin = join(hostJoin.state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");
    const thirdJoin = join(guestJoin.state, "Third", 3, minter);
    if (!thirdJoin.ok) throw new Error("unreachable");
    const baseState = thirdJoin.state;

    const clone1 = structuredClone(baseState);
    joinRoom(clone1, {
      displayName: "Fourth",
      now: 4,
      mintSeatId: minter.mintSeatId,
      mintSeatToken: minter.mintSeatToken,
    });
    expect(clone1).toEqual(structuredClone(baseState));

    const clone2 = structuredClone(baseState);
    markConnected(clone2, hostJoin.seatId, false, 5);
    expect(clone2).toEqual(structuredClone(baseState));

    const clone3 = structuredClone(baseState);
    releaseSeat(clone3, guestJoin.seatId, 6);
    expect(clone3).toEqual(structuredClone(baseState));

    const clone4 = structuredClone(baseState);
    setVariant(clone4, hostJoin.seatId, "rainbow", 6);
    expect(clone4).toEqual(structuredClone(baseState));

    const clone5 = structuredClone(baseState);
    startGame(clone5, hostJoin.seatId, 7, "seed");
    expect(clone5).toEqual(structuredClone(baseState));

    const clone6 = structuredClone(baseState);
    transferHost(clone6, 8);
    expect(clone6).toEqual(structuredClone(baseState));

    const started = startGame(baseState, hostJoin.seatId, 9, "seed");
    if (!started.ok) throw new Error("unreachable");
    const startedGame = started.state.game as ActiveGameState;
    const startedActiveSeatId = startedGame.seatIds[startedGame.turnIndex]!;
    const clone7 = structuredClone(started.state);
    applyGameAction(clone7, startedActiveSeatId, "action-purity", legalActionFor(startedGame), 10);
    expect(clone7).toEqual(structuredClone(started.state));
  });
});

// ---------------------------------------------------------------------------
// RT-09 / D-08 / D-09: duplicate actionId dedup, and D-10 typed error detail
// ---------------------------------------------------------------------------

function startedThreeSeatRoom(seed: string, variant: "base" | "rainbow" | "black" = "base") {
  const minter = makeMinter();
  let state = freshRoom();
  const hostJoin = join(state, "Host", 1, minter);
  if (!hostJoin.ok) throw new Error("unreachable");
  state = hostJoin.state;
  const guestJoin = join(state, "Guest", 2, minter);
  if (!guestJoin.ok) throw new Error("unreachable");
  state = guestJoin.state;
  const thirdJoin = join(state, "Third", 3, minter);
  if (!thirdJoin.ok) throw new Error("unreachable");
  state = thirdJoin.state;

  if (variant !== "base") {
    const variantResult = setVariant(state, hostJoin.seatId, variant, 3);
    if (!variantResult.ok) throw new Error("unreachable");
    state = variantResult.state;
  }

  const started = startGame(state, hostJoin.seatId, 4, seed);
  if (!started.ok) throw new Error("unreachable");
  return { state: started.state, hostJoin, guestJoin, thirdJoin };
}

describe("D-09: a repeated CLUE actionId is not re-applied", () => {
  it("D-09: re-sending the same actionId for a CLUE does not spend a second clue token", () => {
    const { state } = startedThreeSeatRoom("0123456789abcdef0123456789abcdef");
    const game = state.game as ActiveGameState;
    const activeSeatId = game.seatIds[game.turnIndex]!;
    const action = legalActionFor(game);

    const first = applyGameAction(state, activeSeatId, "dupe-clue", action, 5);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");

    const firstGame = first.state.game as ActiveGameState;
    const historyLenAfterFirst = firstGame.history.length;

    const duplicate = applyGameAction(first.state, activeSeatId, "dupe-clue", action, 6);
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) throw new Error("unreachable");

    const dupeGame = duplicate.state.game as ActiveGameState;
    expect(dupeGame.clueTokens).toBe(firstGame.clueTokens);
    expect(dupeGame.history.length).toBe(historyLenAfterFirst);
    expect(dupeGame.turnIndex).toBe(firstGame.turnIndex);
    expect(duplicate.state.status).toBe("in_progress");
    expect(duplicate.state).toEqual(first.state);
  });

  it("a DIFFERENT actionId presented after a deduped send is applied normally", () => {
    const { state } = startedThreeSeatRoom("0123456789abcdef0123456789abcdef");
    const game = state.game as ActiveGameState;
    const activeSeatId = game.seatIds[game.turnIndex]!;
    const action = legalActionFor(game);

    const first = applyGameAction(state, activeSeatId, "action-a", action, 5);
    if (!first.ok) throw new Error("unreachable");
    const duplicate = applyGameAction(first.state, activeSeatId, "action-a", action, 6);
    if (!duplicate.ok) throw new Error("unreachable");

    // The turn is still the same seat's (clue does not advance turn in the
    // fixture's `legalActionFor` priority — but a discard/play would; either
    // way the actor whose turn it now is can act with a fresh id.
    const nextGame = duplicate.state.game as ActiveGameState;
    const nextActorSeatId = nextGame.seatIds[nextGame.turnIndex]!;
    const nextAction = legalActionFor(nextGame);

    const fresh = applyGameAction(duplicate.state, nextActorSeatId, "action-b", nextAction, 7);
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) throw new Error("unreachable");
    expect(fresh.state).not.toEqual(duplicate.state);
  });

  it("the actor's seat carries lastAppliedActionId after success, and no other seat's is set", () => {
    const { state } = startedThreeSeatRoom("0123456789abcdef0123456789abcdef");
    const game = state.game as ActiveGameState;
    const activeSeatId = game.seatIds[game.turnIndex]!;
    const action = legalActionFor(game);

    const result = applyGameAction(state, activeSeatId, "action-seat-record", action, 5);
    if (!result.ok) throw new Error("unreachable");

    for (const seat of result.state.seats) {
      if (seat.seatId === activeSeatId) {
        expect(seat.lastAppliedActionId).toBe("action-seat-record");
      } else {
        expect(seat.lastAppliedActionId ?? null).toBeNull();
      }
    }
  });

  it("a duplicate actionId presented by a DIFFERENT seat is applied normally (key is per-seat)", () => {
    const { state, hostJoin, guestJoin, thirdJoin } = startedThreeSeatRoom(
      "0123456789abcdef0123456789abcdef",
    );
    const game = state.game as ActiveGameState;
    const activeSeatId = game.seatIds[game.turnIndex]!;
    const action = legalActionFor(game);
    const sharedActionId = "shared-id";

    const first = applyGameAction(state, activeSeatId, sharedActionId, action, 5);
    if (!first.ok) throw new Error("unreachable");

    // Record the same id on the actor's seat; a DIFFERENT seat presenting the
    // identical id string when it becomes their turn must not be deduped.
    const otherSeatIds = [hostJoin.seatId, guestJoin.seatId, thirdJoin.seatId].filter(
      (id) => id !== activeSeatId,
    );
    const nextGame = first.state.game as ActiveGameState;
    const nextActorSeatId = nextGame.seatIds[nextGame.turnIndex]!;
    expect(otherSeatIds).toContain(nextActorSeatId);

    const nextAction = legalActionFor(nextGame);
    const second = applyGameAction(first.state, nextActorSeatId, sharedActionId, nextAction, 6);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("unreachable");
    expect(second.state).not.toEqual(first.state);
  });

  it("a duplicate actionId is still deduped after RoomStateSchema round-tripping (persisted-shape proof)", () => {
    const { state } = startedThreeSeatRoom("0123456789abcdef0123456789abcdef");
    const game = state.game as ActiveGameState;
    const activeSeatId = game.seatIds[game.turnIndex]!;
    const action = legalActionFor(game);

    const first = applyGameAction(state, activeSeatId, "action-persist", action, 5);
    if (!first.ok) throw new Error("unreachable");

    // SeatTokenSchema requires an exact length; the test fixture's minter
    // uses short placeholder tokens, so pad them to a schema-valid length
    // just for this round-trip proof — the dedup key under test is
    // `lastAppliedActionId`, not the seat token's shape.
    const serializable = {
      ...first.state,
      seats: first.state.seats.map((seat) => ({
        ...seat,
        seatToken: String(seat.seatToken).padEnd(24, "0"),
      })),
    };
    const roundTripped = RoomStateSchema.parse(
      JSON.parse(JSON.stringify(serializable)),
    ) as RoomState;
    const duplicate = applyGameAction(roundTripped, activeSeatId, "action-persist", action, 6);
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) throw new Error("unreachable");
    expect((duplicate.state.game as ActiveGameState).clueTokens).toBe(
      (first.state.game as ActiveGameState).clueTokens,
    );
  });
});

describe("D-10: every adapter refusal maps 1:1 onto a closed ErrorDetail", () => {
  it("an out-of-turn action returns bad_request with detail not_your_turn", () => {
    const { state, hostJoin, guestJoin, thirdJoin } = startedThreeSeatRoom(
      "0123456789abcdef0123456789abcdef",
    );
    const game = state.game as ActiveGameState;
    const activeSeatId = game.seatIds[game.turnIndex]!;
    const offTurnSeatId = [hostJoin.seatId, guestJoin.seatId, thirdJoin.seatId].find(
      (id) => id !== activeSeatId,
    )!;
    const action = legalActionFor(game);

    const result = applyGameAction(state, offTurnSeatId, "action-x", action, 5);
    expect(result).toMatchObject({ ok: false, reason: "bad_request", detail: "not_your_turn" });
  });

  it("a malformed payload with an extra asserted key returns detail invalid_action", () => {
    const { state } = startedThreeSeatRoom("0123456789abcdef0123456789abcdef");
    const game = state.game as ActiveGameState;
    const activeSeatId = game.seatIds[game.turnIndex]!;
    const activeHand = game.hands.find((h) => h.seatId === activeSeatId)!;
    const malformed = {
      type: "play",
      cardId: activeHand.slots[0]!.card.id,
      resultingScore: 999,
    };

    const result = applyGameAction(state, activeSeatId, "action-y", malformed, 5);
    expect(result).toMatchObject({ ok: false, reason: "bad_request", detail: "invalid_action" });
  });

  it("a discard at 8 clue tokens returns detail discard_at_max_clues", () => {
    const { state } = startedThreeSeatRoom("0123456789abcdef0123456789abcdef");
    const game = state.game as ActiveGameState;
    expect(game.clueTokens).toBe(8);
    const activeSeatId = game.seatIds[game.turnIndex]!;
    const activeHand = game.hands.find((h) => h.seatId === activeSeatId)!;

    const result = applyGameAction(
      state,
      activeSeatId,
      "action-z",
      { type: "discard", cardId: activeHand.slots[0]!.card.id },
      5,
    );
    expect(result).toMatchObject({
      ok: false,
      reason: "bad_request",
      detail: "discard_at_max_clues",
    });
  });

  it("a clue that touches zero cards returns detail clue_touches_nothing", () => {
    const { state } = startedThreeSeatRoom("0123456789abcdef0123456789abcdef");
    const game = state.game as ActiveGameState;
    const activeSeatId = game.seatIds[game.turnIndex]!;
    const targetHand = game.hands.find((h) => h.seatId !== activeSeatId)!;
    const presentRanks = new Set(targetHand.slots.map((slot) => slot.card.rank));
    const absentRank = RANKS.find((rank) => !presentRanks.has(rank));
    if (absentRank === undefined) throw new Error("fixture has no absent rank to clue");

    const result = applyGameAction(
      state,
      activeSeatId,
      "action-w",
      {
        type: "clue",
        targetSeatId: targetHand.seatId,
        clue: { type: "rank", value: absentRank },
      },
      5,
    );
    expect(result).toMatchObject({
      ok: false,
      reason: "bad_request",
      detail: "clue_touches_nothing",
    });
  });
});

describe("RULES-14 / T-07-01: a forged non-nameable colour clue frame is refused", () => {
  it.each([
    { variant: "rainbow" as const, value: "rainbow" as const },
    { variant: "base" as const, value: "black" as const },
    { variant: "black" as const, value: "rainbow" as const },
  ])("$variant room refuses a forged '$value' colour clue frame", ({ variant, value }) => {
    const { state } = startedThreeSeatRoom("0123456789abcdef0123456789abcdef", variant);
    const game = state.game as ActiveGameState;
    const activeSeatId = game.seatIds[game.turnIndex]!;
    const targetSeatId = game.seatIds.find((id) => id !== activeSeatId)!;
    const clueTokensBefore = game.clueTokens;

    const result = applyGameAction(
      state,
      activeSeatId,
      "forged-non-nameable",
      { type: "clue", targetSeatId, clue: { type: "color", value } },
      5,
    );

    expect(result).toEqual({
      ok: false,
      reason: "bad_request",
      detail: "clue_color_not_nameable",
    });
    expect((state.game as ActiveGameState).clueTokens).toBe(clueTokensBefore);
  });

  it("black room refuses a colour clue naming 'black' even when the target holds a Black tile (owner gap closure, 2026-09-18)", () => {
    const { state } = startedThreeSeatRoom("0123456789abcdef0123456789abcdef", "black");
    const game = state.game as ActiveGameState;
    const activeSeatId = game.seatIds[game.turnIndex]!;
    const targetHand = game.hands.find((h) => h.seatId !== activeSeatId)!;
    const targetSeatId = targetHand.seatId;
    const clueTokensBefore = game.clueTokens;

    // Force the target's first slot to hold a Black tile so the refusal is
    // provably NOT an incidental clue_touches_nothing.
    const craftedSlots = targetHand.slots.map((slot, i) =>
      i === 0 ? { ...slot, card: { ...slot.card, suit: "black" as const, rank: 1 as const } } : slot,
    );
    const craftedGame: ActiveGameState = {
      ...game,
      hands: game.hands.map((h) => (h.seatId === targetSeatId ? { ...h, slots: craftedSlots } : h)),
    };
    const craftedState = { ...state, game: craftedGame };

    const result = applyGameAction(
      craftedState,
      activeSeatId,
      "forged-black-colour",
      { type: "clue", targetSeatId, clue: { type: "color", value: "black" } },
      5,
    );

    expect(result).toEqual({
      ok: false,
      reason: "bad_request",
      detail: "clue_color_not_nameable",
    });
    expect((craftedState.game as ActiveGameState).clueTokens).toBe(clueTokensBefore);
  });
});

// ---------------------------------------------------------------------------
// D-22: reorder through the room layer — actionId idempotency and the
// status gate, proven at the room actor (not just the engine).
// ---------------------------------------------------------------------------

describe("D-22: reorder through the room layer", () => {
  it("an off-turn seat's reorder is accepted, leaves the turn unchanged, and records lastAppliedActionId", () => {
    const { state, hostJoin, guestJoin, thirdJoin } = startedThreeSeatRoom(
      "0123456789abcdef0123456789abcdef",
    );
    const game = state.game as ActiveGameState;
    const activeSeatId = game.seatIds[game.turnIndex]!;
    const offTurnSeatId = [hostJoin.seatId, guestJoin.seatId, thirdJoin.seatId].find(
      (id) => id !== activeSeatId,
    )!;
    const offTurnHand = game.hands.find((h) => h.seatId === offTurnSeatId)!;
    const reversedIds = offTurnHand.slots.map((s) => s.card.id).reverse();

    const result = applyGameAction(
      state,
      offTurnSeatId,
      "reorder-1",
      { type: "reorder", cardIds: reversedIds },
      5,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const resultGame = result.state.game as ActiveGameState;
    expect(resultGame.turnIndex).toBe(game.turnIndex);
    expect(resultGame.seatIds[resultGame.turnIndex]).toBe(activeSeatId);

    const offTurnSeat = result.state.seats.find((s) => s.seatId === offTurnSeatId)!;
    expect(offTurnSeat.lastAppliedActionId).toBe("reorder-1");

    const reorderedHand = resultGame.hands.find((h) => h.seatId === offTurnSeatId)!;
    expect(reorderedHand.slots.map((s) => s.card.id)).toEqual(reversedIds);
  });

  it("repeating the same actionId with a different order is deduped — not re-applied", () => {
    const { state, hostJoin, guestJoin, thirdJoin } = startedThreeSeatRoom(
      "0123456789abcdef0123456789abcdef",
    );
    const game = state.game as ActiveGameState;
    const activeSeatId = game.seatIds[game.turnIndex]!;
    const offTurnSeatId = [hostJoin.seatId, guestJoin.seatId, thirdJoin.seatId].find(
      (id) => id !== activeSeatId,
    )!;
    const offTurnHand = game.hands.find((h) => h.seatId === offTurnSeatId)!;
    const originalIds = offTurnHand.slots.map((s) => s.card.id);
    const reversedIds = [...originalIds].reverse();
    const rotatedIds = [...originalIds.slice(1), originalIds[0]!];

    const first = applyGameAction(
      state,
      offTurnSeatId,
      "reorder-1",
      { type: "reorder", cardIds: reversedIds },
      5,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const duplicate = applyGameAction(
      first.state,
      offTurnSeatId,
      "reorder-1",
      { type: "reorder", cardIds: rotatedIds },
      6,
    );
    expect(duplicate.ok).toBe(true);
    if (!duplicate.ok) return;

    // Dedup returns the FIRST result's state unchanged — the second
    // (different) order must never have been applied.
    expect(duplicate.state).toEqual(first.state);
    const dupeGame = duplicate.state.game as ActiveGameState;
    const dupeHand = dupeGame.hands.find((h) => h.seatId === offTurnSeatId)!;
    expect(dupeHand.slots.map((s) => s.card.id)).toEqual(reversedIds);
  });

  it("a cardIds array with a duplicate id is refused with detail card_not_in_hand", () => {
    const { state } = startedThreeSeatRoom("0123456789abcdef0123456789abcdef");
    const game = state.game as ActiveGameState;
    const activeSeatId = game.seatIds[game.turnIndex]!;
    const offTurnSeatId = game.seatIds.find((id) => id !== activeSeatId)!;
    const offTurnHand = game.hands.find((h) => h.seatId === offTurnSeatId)!;
    const duplicated = [
      offTurnHand.slots[0]!.card.id,
      offTurnHand.slots[0]!.card.id,
      ...offTurnHand.slots.slice(2).map((s) => s.card.id),
    ];

    const result = applyGameAction(
      state,
      offTurnSeatId,
      "reorder-dup",
      { type: "reorder", cardIds: duplicated },
      5,
    );
    expect(result).toMatchObject({
      ok: false,
      reason: "bad_request",
      detail: "card_not_in_hand",
    });
  });

  it("a reorder payload with an extra key is refused with detail invalid_action", () => {
    const { state } = startedThreeSeatRoom("0123456789abcdef0123456789abcdef");
    const game = state.game as ActiveGameState;
    const activeSeatId = game.seatIds[game.turnIndex]!;
    const offTurnSeatId = game.seatIds.find((id) => id !== activeSeatId)!;
    const offTurnHand = game.hands.find((h) => h.seatId === offTurnSeatId)!;
    const cardIds = offTurnHand.slots.map((s) => s.card.id);

    const result = applyGameAction(
      state,
      offTurnSeatId,
      "reorder-extra",
      { type: "reorder", cardIds, extra: true },
      5,
    );
    expect(result).toMatchObject({
      ok: false,
      reason: "bad_request",
      detail: "invalid_action",
    });
  });

  it("a room with status ended refuses a fresh reorder with reason bad_request", () => {
    const minter = makeMinter();
    let state = freshRoom();
    const hostJoin = join(state, "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    state = hostJoin.state;
    const guestJoin = join(state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");
    state = guestJoin.state;

    const started = startGame(state, hostJoin.seatId, 3, "fedcba9876543210fedcba9876543210");
    if (!started.ok) throw new Error("unreachable");
    state = started.state;

    let guard = 0;
    while (state.status === "in_progress" && guard < 2000) {
      guard++;
      const game = state.game as ActiveGameState;
      const actorSeatId = game.seatIds[game.turnIndex]!;
      const action = legalActionFor(game);
      const result = applyGameAction(state, actorSeatId, `action-${guard}`, action, 10 + guard);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      state = result.state;
    }
    expect(state.status).toBe("ended");

    const endedGame = state.game as ActiveGameState;
    const seatId = endedGame.seatIds[0]!;
    const hand = endedGame.hands.find((h) => h.seatId === seatId)!;
    const cardIds = hand.slots.map((s) => s.card.id);

    const result = applyGameAction(
      state,
      seatId,
      "reorder-after-end",
      { type: "reorder", cardIds },
      guard + 100,
    );
    expect(result).toMatchObject({ ok: false, reason: "bad_request" });
  });
});

// ---------------------------------------------------------------------------
// Owner request (2026-09-18): host-only delete_room / restart_lobby
// ---------------------------------------------------------------------------

/** Drives a fresh 2-seat lobby all the way to an "ended" room, reusing the
 * same legal-action loop `D-22`'s fixtures rely on elsewhere in this file. */
function endedTwoSeatRoom() {
  const minter = makeMinter();
  const hostJoin = join(freshRoom(), "Host", 1, minter);
  if (!hostJoin.ok) throw new Error("unreachable");
  const guestJoin = join(hostJoin.state, "Guest", 2, minter);
  if (!guestJoin.ok) throw new Error("unreachable");

  const started = startGame(guestJoin.state, hostJoin.seatId, 3, "seed-ended-room");
  if (!started.ok) throw new Error("unreachable");
  let state = started.state;

  let guard = 0;
  while (state.status === "in_progress" && guard < 2000) {
    guard++;
    const game = state.game as ActiveGameState;
    const actorSeatId = game.seatIds[game.turnIndex]!;
    const action = legalActionFor(game);
    const result = applyGameAction(state, actorSeatId, `end-action-${guard}`, action, 10 + guard);
    if (!result.ok) throw new Error("unreachable");
    state = result.state;
  }
  if (state.status !== "ended") throw new Error("fixture did not reach ended status");

  return { state, hostSeatId: hostJoin.seatId, guestSeatId: guestJoin.seatId };
}

describe("Owner request: deleteRoom (host-only teardown gate)", () => {
  it("host may request deletion from any room status", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");

    const result = deleteRoom(hostJoin.state, hostJoin.seatId, "del-1", 5);
    expect(result.ok).toBe(true);
  });

  it("a non-host's delete_room is refused not_host", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const guestJoin = join(hostJoin.state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");

    const result = deleteRoom(guestJoin.state, guestJoin.seatId, "del-2", 5);
    expect(result).toEqual({ ok: false, reason: "not_host" });
  });

  it("an ended room may still be deleted by its host", () => {
    const { state, hostSeatId } = endedTwoSeatRoom();
    const result = deleteRoom(state, hostSeatId, "del-3", 100);
    expect(result.ok).toBe(true);
  });

  it("a repeated actionId is idempotent", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");

    const first = deleteRoom(hostJoin.state, hostJoin.seatId, "del-dedup", 5);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = deleteRoom(first.state, hostJoin.seatId, "del-dedup", 999);
    expect(second).toEqual({ ok: true, state: first.state });
  });
});


describe("Owner request: restartLobby (host-only, ended-game-only)", () => {
  it("host may restart an ended game back to the lobby with the same seats/code/tokens", () => {
    const { state, hostSeatId, guestSeatId } = endedTwoSeatRoom();
    const before = state;

    const result = restartLobby(state, hostSeatId, "restart-1", 200);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.status).toBe("lobby");
    expect(result.state.game).toBeNull();
    expect(result.state.seed).toBeUndefined();
    expect(result.state.code).toBe(before.code);
    expect(result.state.hostSeatId).toBe(hostSeatId);
    expect(result.state.seats.map((s) => s.seatId).sort()).toEqual(
      before.seats.map((s) => s.seatId).sort(),
    );
    // Same seat tokens — a stored token still reclaims the same seat.
    for (const seat of before.seats) {
      const after = result.state.seats.find((s) => s.seatId === seat.seatId)!;
      expect(after.seatToken).toBe(seat.seatToken);
    }
    // A restarted room's ledger is clean for the next game.
    const guestAfter = result.state.seats.find((s) => s.seatId === guestSeatId)!;
    expect(guestAfter.lastAppliedActionId ?? null).toBeNull();
  });

  it("a non-host's restart_lobby is refused not_host", () => {
    const { state, guestSeatId } = endedTwoSeatRoom();
    const result = restartLobby(state, guestSeatId, "restart-2", 200);
    expect(result).toEqual({ ok: false, reason: "not_host" });
  });

  it("restart_lobby mid-game (wrong status) is refused bad_request", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const guestJoin = join(hostJoin.state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");
    const started = startGame(guestJoin.state, hostJoin.seatId, 3, "seed-mid-game");
    if (!started.ok) throw new Error("unreachable");

    const result = restartLobby(started.state, hostJoin.seatId, "restart-3", 10);
    expect(result).toEqual({ ok: false, reason: "bad_request" });
  });

  it("restart_lobby in the lobby (never started) is refused bad_request", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");

    const result = restartLobby(hostJoin.state, hostJoin.seatId, "restart-4", 10);
    expect(result).toEqual({ ok: false, reason: "bad_request" });
  });

  it("a repeated actionId is idempotent even after status has moved on", () => {
    const { state, hostSeatId } = endedTwoSeatRoom();

    const first = restartLobby(state, hostSeatId, "restart-dedup", 200);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.status).toBe("lobby");

    // The SAME actionId replayed after the room already moved to "lobby"
    // must still report success (WR-01 placement: dedup runs before the
    // status gate), not `bad_request` against the now-different status.
    const second = restartLobby(first.state, hostSeatId, "restart-dedup", 999);
    expect(second).toEqual({ ok: true, state: first.state });
  });
});

// ---------------------------------------------------------------------------
// Owner gap closure round 2, UAT gap 3: Black is a descending suit, proven
// through the room action path (07-10-PLAN.md Task 2) -- the server-side
// legality decision, not just the engine unit tests.
// ---------------------------------------------------------------------------

describe("Black plays in reverse through the room action path (owner gap closure, UAT gap 3)", () => {
  it("a black 5 on an empty black stack succeeds, then a black 4 succeeds", () => {
    const { state } = startedThreeSeatRoom("0123456789abcdef0123456789abcdef", "black");
    const game = state.game as ActiveGameState;
    const activeSeatId = game.seatIds[game.turnIndex]!;
    const activeHand = game.hands.find((h) => h.seatId === activeSeatId)!;

    // Force the active seat's first two slots to hold a black 5 and a black
    // 4, same craft pattern the forged-clue tests above use.
    const craftedSlots = activeHand.slots.map((slot, i) => {
      if (i === 0) return { ...slot, card: { ...slot.card, suit: "black" as const, rank: 5 as const } };
      if (i === 1) return { ...slot, card: { ...slot.card, suit: "black" as const, rank: 4 as const } };
      return slot;
    });
    const craftedGame: ActiveGameState = {
      ...game,
      hands: game.hands.map((h) => (h.seatId === activeSeatId ? { ...h, slots: craftedSlots } : h)),
    };
    const craftedState = { ...state, game: craftedGame };
    const firstCardId = craftedSlots[0]!.card.id;

    const firstPlay = applyGameAction(craftedState, activeSeatId, "black-5-play", {
      type: "play",
      cardId: firstCardId,
    }, 5);
    expect(firstPlay.ok).toBe(true);
    if (!firstPlay.ok) throw new Error("unreachable");
    const gameAfterFirst = firstPlay.state.game as ActiveGameState;
    expect(gameAfterFirst.stacks.find((s) => s.suit === "black")!.playedRanks).toEqual([5]);

    // Rewind turnIndex to the same active seat so the second play in this
    // test also comes from it -- turn order is not what this test exercises.
    const rewound = { ...firstPlay.state, game: { ...gameAfterFirst, turnIndex: game.turnIndex } };
    const secondCardId = craftedSlots[1]!.card.id;
    const secondPlay = applyGameAction(rewound, activeSeatId, "black-4-play", {
      type: "play",
      cardId: secondCardId,
    }, 6);
    expect(secondPlay.ok).toBe(true);
    if (!secondPlay.ok) throw new Error("unreachable");
    const gameAfterSecond = secondPlay.state.game as ActiveGameState;
    expect(gameAfterSecond.stacks.find((s) => s.suit === "black")!.playedRanks).toEqual([5, 4]);
  });

  it("a black 1 on an empty black stack is a misplay", () => {
    const { state } = startedThreeSeatRoom("fedcba9876543210fedcba9876543210", "black");
    const game = state.game as ActiveGameState;
    const activeSeatId = game.seatIds[game.turnIndex]!;
    const activeHand = game.hands.find((h) => h.seatId === activeSeatId)!;

    const craftedSlots = activeHand.slots.map((slot, i) =>
      i === 0 ? { ...slot, card: { ...slot.card, suit: "black" as const, rank: 1 as const } } : slot,
    );
    const craftedGame: ActiveGameState = {
      ...game,
      hands: game.hands.map((h) => (h.seatId === activeSeatId ? { ...h, slots: craftedSlots } : h)),
    };
    const craftedState = { ...state, game: craftedGame };
    const cardId = craftedSlots[0]!.card.id;
    const fusesBefore = game.fuses;

    const result = applyGameAction(craftedState, activeSeatId, "black-1-misplay", {
      type: "play",
      cardId,
    }, 5);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const gameAfter = result.state.game as ActiveGameState;
    expect(gameAfter.fuses).toBe(fusesBefore + 1);
    expect(gameAfter.stacks.find((s) => s.suit === "black")!.playedRanks).toEqual([]);
    expect(gameAfter.discard.some((c) => c.id === cardId)).toBe(true);
  });
});
