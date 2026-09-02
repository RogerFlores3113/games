import { describe, expect, it } from "vitest";
import type { RoomCode, RoomState, SeatToken } from "@games/schema";
import { MAX_PLAYERS } from "@games/schema";
import {
  applyGameAction,
  createEmptyRoom,
  joinRoom,
  markConnected,
  releaseSeat,
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
// ROOM-05 / D-13: variant lock
// ---------------------------------------------------------------------------

describe("ROOM-05: variant lock", () => {
  it("ROOM-05: host can change variant repeatedly in the lobby", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    let state = hostJoin.state;

    const r1 = setVariant(state, hostJoin.seatId, "rainbow");
    expect(r1.ok).toBe(true);
    if (!r1.ok) throw new Error("unreachable");
    expect(r1.state.variant).toBe("rainbow");
    state = r1.state;

    const r2 = setVariant(state, hostJoin.seatId, "black");
    expect(r2.ok).toBe(true);
    if (!r2.ok) throw new Error("unreachable");
    expect(r2.state.variant).toBe("black");
  });

  it("ROOM-05: a non-host setVariant is refused not_host", () => {
    const minter = makeMinter();
    const hostJoin = join(freshRoom(), "Host", 1, minter);
    if (!hostJoin.ok) throw new Error("unreachable");
    const guestJoin = join(hostJoin.state, "Guest", 2, minter);
    if (!guestJoin.ok) throw new Error("unreachable");

    const result = setVariant(guestJoin.state, guestJoin.seatId, "rainbow");
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

    const attempt = setVariant(state, hostJoin.seatId, "black");
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
    expect(afterRelease.seats).toHaveLength(1);

    const rejoin = join(afterRelease, "NewGuest", 4, minter);
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
    expect(afterHostLeaves.hostSeatId).toBe(guestJoin.seatId);
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
// D-15 / FDN-01: game action delegation through the adapter only
// ---------------------------------------------------------------------------

describe("D-15 / FDN-01: game actions are delegated to the adapter only", () => {
  it("D-15 / FDN-01: applyGameAction increments the counter for the active seat and refuses others", () => {
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

    const started = startGame(state, hostJoin.seatId, 4, "seed");
    if (!started.ok) throw new Error("unreachable");
    state = started.state;

    // Active seat (join order = turn order for the counter game) succeeds.
    const activeAttempt = applyGameAction(state, hostJoin.seatId, { type: "increment" }, 5);
    expect(activeAttempt.ok).toBe(true);
    if (!activeAttempt.ok) throw new Error("unreachable");
    state = activeAttempt.state;

    // A non-active seat is refused.
    const wrongTurn = applyGameAction(state, hostJoin.seatId, { type: "increment" }, 6);
    expect(wrongTurn.ok).toBe(false);

    // Exactly one seat's view reports isYourTurn === true.
    const yourTurnFlags = state.seats.map(
      (seat) => (toSeatView(state, seat.seatId).game as { isYourTurn: boolean }).isYourTurn,
    );
    expect(yourTurnFlags.filter(Boolean)).toHaveLength(1);
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
    setVariant(clone4, hostJoin.seatId, "rainbow");
    expect(clone4).toEqual(structuredClone(baseState));

    const clone5 = structuredClone(baseState);
    startGame(clone5, hostJoin.seatId, 7, "seed");
    expect(clone5).toEqual(structuredClone(baseState));

    const clone6 = structuredClone(baseState);
    transferHost(clone6, 8);
    expect(clone6).toEqual(structuredClone(baseState));

    const started = startGame(baseState, hostJoin.seatId, 9, "seed");
    if (!started.ok) throw new Error("unreachable");
    const clone7 = structuredClone(started.state);
    applyGameAction(clone7, hostJoin.seatId, { type: "increment" }, 10);
    expect(clone7).toEqual(structuredClone(started.state));
  });
});
