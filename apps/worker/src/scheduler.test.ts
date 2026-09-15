import { describe, expect, it } from "vitest";
import type { RoomCode, RoomState, Seat, SeatToken } from "@games/schema";
import {
  HOST_TRANSFER_GRACE_MS,
  IDLE_GC_IN_PROGRESS_MS,
  IDLE_GC_LOBBY_MS,
  LOBBY_SEAT_RELEASE_GRACE_MS,
} from "@games/schema";
import { computeRoomTimers, dueTimers, nextDueAt, upsertTimer, cancelTimer } from "./scheduler";
import type { TimerEvent } from "./scheduler";

// ---------------------------------------------------------------------------
// Deterministic fixture helpers — no Date.now(), every timestamp explicit.
// ---------------------------------------------------------------------------

const ROOM_CODE = "ABCDEF" as RoomCode;

function makeSeat(overrides: Partial<Seat>): Seat {
  return {
    seatId: "s1",
    seatToken: "seat-token-000000000001" as unknown as SeatToken,
    displayName: "Roger",
    displayLabel: "Roger",
    connected: true,
    joinedAt: 0,
    disconnectedAt: null,
    ...overrides,
  };
}

function makeRoom(overrides: Partial<RoomState>): RoomState {
  return {
    code: ROOM_CODE,
    variant: "base",
    status: "lobby",
    hostSeatId: null,
    seats: [],
    adapterId: "counter",
    game: null,
    createdAt: 0,
    lastActivityAt: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// upsertTimer / cancelTimer / nextDueAt / dueTimers — mechanical primitives
// ---------------------------------------------------------------------------

describe("upsertTimer", () => {
  it("adds a new timer and keeps the array sorted ascending by dueAt", () => {
    let timers: TimerEvent[] = [];
    timers = upsertTimer(timers, { type: "idle_gc", dueAt: 30 });
    timers = upsertTimer(timers, { type: "host_transfer", dueAt: 10 });
    expect(timers.map((t) => t.dueAt)).toEqual([10, 30]);
  });

  it("replaces an existing timer with the same type+seatId key rather than duplicating it", () => {
    let timers: TimerEvent[] = [];
    timers = upsertTimer(timers, { type: "seat_release", dueAt: 100, seatId: "s1" });
    timers = upsertTimer(timers, { type: "seat_release", dueAt: 50, seatId: "s1" });
    expect(timers).toHaveLength(1);
    expect(timers[0]?.dueAt).toBe(50);
  });

  it("does not mutate the input array", () => {
    const original: TimerEvent[] = [{ type: "idle_gc", dueAt: 5 }];
    const next = upsertTimer(original, { type: "host_transfer", dueAt: 1 });
    expect(original).toHaveLength(1);
    expect(next).toHaveLength(2);
  });
});

describe("cancelTimer", () => {
  it("removes only the matching type+seatId key", () => {
    let timers: TimerEvent[] = [];
    timers = upsertTimer(timers, { type: "seat_release", dueAt: 10, seatId: "s1" });
    timers = upsertTimer(timers, { type: "seat_release", dueAt: 20, seatId: "s2" });
    timers = cancelTimer(timers, "seat_release", "s1");
    expect(timers).toHaveLength(1);
    expect(timers[0]?.seatId).toBe("s2");
  });
});

describe("nextDueAt", () => {
  it("returns null for an empty table", () => {
    expect(nextDueAt([])).toBeNull();
  });

  it("returns the minimum dueAt across all timers", () => {
    const timers: TimerEvent[] = [
      { type: "idle_gc", dueAt: 100 },
      { type: "host_transfer", dueAt: 10 },
      { type: "seat_release", dueAt: 50, seatId: "s1" },
    ];
    expect(nextDueAt(timers)).toBe(10);
  });
});

describe("dueTimers", () => {
  it("partitions into due (dueAt <= now) and remaining", () => {
    const timers: TimerEvent[] = [
      { type: "idle_gc", dueAt: 10 },
      { type: "host_transfer", dueAt: 20 },
      { type: "seat_release", dueAt: 30, seatId: "s1" },
    ];
    const { due, remaining } = dueTimers(timers, 25);
    expect(due.map((t) => t.dueAt)).toEqual([10, 20]);
    expect(remaining.map((t) => t.dueAt)).toEqual([30]);
  });
});

// ---------------------------------------------------------------------------
// RESEARCH.md Pitfall 1 — the central regression test.
// ---------------------------------------------------------------------------

describe("unified scheduler: host transfer does not clobber idle GC (RESEARCH Pitfall 1)", () => {
  it("unified scheduler: host transfer does not clobber idle GC (RESEARCH Pitfall 1)", () => {
    const now = 60 * 60 * 1000; // 1h after epoch
    const lastActivityAt = now - 59 * 60 * 1000; // 59 minutes ago — idle_gc not yet due, but pending
    const hostDisconnectedAt = now - HOST_TRANSFER_GRACE_MS; // exactly due right now

    const host = makeSeat({
      seatId: "host",
      connected: false,
      disconnectedAt: hostDisconnectedAt,
    });
    const state = makeRoom({
      status: "lobby",
      hostSeatId: "host",
      seats: [host],
      lastActivityAt,
    });

    const timers = computeRoomTimers(state, now);

    const idleGc = timers.find((t) => t.type === "idle_gc");
    const hostTransfer = timers.find((t) => t.type === "host_transfer");
    expect(idleGc).toBeDefined();
    expect(hostTransfer).toBeDefined();
    // The disconnected host is ALSO a disconnected lobby seat, so a
    // seat_release timer legitimately coexists too — three independent
    // timers all surviving together is exactly the point of this test.
    expect(timers).toHaveLength(3);

    // The soonest of the three is the one passed to setAlarm (a disconnected
    // host is also a disconnected lobby seat, so seat_release fires too,
    // after host_transfer — see the WR-09 test below).
    const seatRelease = timers.find((t) => t.type === "seat_release");
    expect(seatRelease).toBeDefined();
    expect(nextDueAt(timers)).toBe(Math.min(idleGc!.dueAt, hostTransfer!.dueAt, seatRelease!.dueAt));
    expect(hostTransfer!.dueAt).toBeLessThan(idleGc!.dueAt);

    // Simulate onAlarm processing the host-transfer event: recompute the
    // table again (as the real DO would after mutating state to perform the
    // transfer, then re-deriving timers) and assert idle_gc is UNTOUCHED —
    // recomputing from state, not incrementally mutating, cannot clobber it.
    const recomputed = computeRoomTimers(state, now);
    const idleGcAfter = recomputed.find((t) => t.type === "idle_gc");
    expect(idleGcAfter).toBeDefined();
    expect(idleGcAfter!.dueAt).toBe(idleGc!.dueAt);
  });
});

// ---------------------------------------------------------------------------
// D-02: idle GC thresholds — 1h lobby / 12h in-progress, from lastActivityAt.
// ---------------------------------------------------------------------------

describe("D-02: idle GC thresholds", () => {
  it("a lobby room idle for 59m59s yields no due idle_gc timer", () => {
    const lastActivityAt = 0;
    const now = IDLE_GC_LOBBY_MS - 1000;
    const state = makeRoom({ status: "lobby", lastActivityAt });
    const timers = computeRoomTimers(state, now);
    const { due } = dueTimers(timers, now);
    expect(due.find((t) => t.type === "idle_gc")).toBeUndefined();
  });

  it("a lobby room idle for exactly IDLE_GC_LOBBY_MS has idle_gc due", () => {
    const lastActivityAt = 0;
    const now = IDLE_GC_LOBBY_MS;
    const state = makeRoom({ status: "lobby", lastActivityAt });
    const timers = computeRoomTimers(state, now);
    const { due } = dueTimers(timers, now);
    expect(due.find((t) => t.type === "idle_gc")).toBeDefined();
  });

  it("an in_progress room idle for IDLE_GC_IN_PROGRESS_MS - 1s yields no due idle_gc timer", () => {
    const lastActivityAt = 0;
    const now = IDLE_GC_IN_PROGRESS_MS - 1000;
    const state = makeRoom({ status: "in_progress", lastActivityAt });
    const timers = computeRoomTimers(state, now);
    const { due } = dueTimers(timers, now);
    expect(due.find((t) => t.type === "idle_gc")).toBeUndefined();
  });

  it("an in_progress room idle for exactly IDLE_GC_IN_PROGRESS_MS has idle_gc due", () => {
    const lastActivityAt = 0;
    const now = IDLE_GC_IN_PROGRESS_MS;
    const state = makeRoom({ status: "in_progress", lastActivityAt });
    const timers = computeRoomTimers(state, now);
    const { due } = dueTimers(timers, now);
    expect(due.find((t) => t.type === "idle_gc")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// D-07: host-transfer grace — lobby only, +20s, scoped to disconnected host.
// ---------------------------------------------------------------------------

describe("D-07: host-transfer grace", () => {
  it("a disconnected lobby host produces a host_transfer timer at exactly +HOST_TRANSFER_GRACE_MS", () => {
    const disconnectedAt = 1000;
    const host = makeSeat({ seatId: "host", connected: false, disconnectedAt });
    const state = makeRoom({ status: "lobby", hostSeatId: "host", seats: [host] });
    const timers = computeRoomTimers(state, disconnectedAt);
    const hostTransfer = timers.find((t) => t.type === "host_transfer");
    expect(hostTransfer).toBeDefined();
    expect(hostTransfer!.dueAt).toBe(disconnectedAt + HOST_TRANSFER_GRACE_MS);
  });

  it("WR-09: a disconnected lobby host's host_transfer comes due BEFORE that seat's own seat_release", () => {
    // Otherwise D-07 never runs: releasing the seat first removes the host
    // seat, and the host_transfer timer disappears with it.
    const disconnectedAt = 1000;
    const host = makeSeat({ seatId: "host", connected: false, disconnectedAt });
    const state = makeRoom({ status: "lobby", hostSeatId: "host", seats: [host] });
    const timers = computeRoomTimers(state, disconnectedAt);
    const hostTransfer = timers.find((t) => t.type === "host_transfer");
    const seatRelease = timers.find((t) => t.type === "seat_release" && t.seatId === "host");
    expect(hostTransfer!.dueAt).toBeLessThan(seatRelease!.dueAt);
  });

  it("a disconnected host in an in_progress room produces NO host_transfer timer", () => {
    const disconnectedAt = 1000;
    const host = makeSeat({ seatId: "host", connected: false, disconnectedAt });
    const state = makeRoom({ status: "in_progress", hostSeatId: "host", seats: [host] });
    const timers = computeRoomTimers(state, disconnectedAt);
    expect(timers.find((t) => t.type === "host_transfer")).toBeUndefined();
  });

  it("a connected lobby host produces no host_transfer timer", () => {
    const host = makeSeat({ seatId: "host", connected: true, disconnectedAt: null });
    const state = makeRoom({ status: "lobby", hostSeatId: "host", seats: [host] });
    const timers = computeRoomTimers(state, 0);
    expect(timers.find((t) => t.type === "host_transfer")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// D-12: lobby seat-release grace — lobby only, +30s, per disconnected seat.
// ---------------------------------------------------------------------------

describe("D-12: lobby seat-release grace", () => {
  it("a disconnected lobby seat produces a seat_release timer at +LOBBY_SEAT_RELEASE_GRACE_MS", () => {
    const disconnectedAt = 500;
    const seat = makeSeat({ seatId: "s1", connected: false, disconnectedAt });
    const state = makeRoom({ status: "lobby", seats: [seat] });
    const timers = computeRoomTimers(state, disconnectedAt);
    const release = timers.find((t) => t.type === "seat_release" && t.seatId === "s1");
    expect(release).toBeDefined();
    expect(release!.dueAt).toBe(disconnectedAt + LOBBY_SEAT_RELEASE_GRACE_MS);
  });

  it("a disconnected in_progress seat produces no seat_release timer", () => {
    const seat = makeSeat({ seatId: "s1", connected: false, disconnectedAt: 500 });
    const state = makeRoom({ status: "in_progress", seats: [seat] });
    const timers = computeRoomTimers(state, 500);
    expect(timers.find((t) => t.type === "seat_release")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Idempotency — Pitfall 2's failure mode: a hibernation wake must never
// push a deadline forward.
// ---------------------------------------------------------------------------

describe("idempotency across repeated hibernation wakes", () => {
  it("calling computeRoomTimers twice on the same state returns deep-equal arrays", () => {
    const host = makeSeat({ seatId: "host", connected: false, disconnectedAt: 1000 });
    const seat2 = makeSeat({ seatId: "s2", connected: false, disconnectedAt: 2000 });
    const state = makeRoom({
      status: "lobby",
      hostSeatId: "host",
      seats: [host, seat2],
      lastActivityAt: 500,
    });

    const first = computeRoomTimers(state, 3000);
    const second = computeRoomTimers(state, 3000);
    expect(second).toEqual(first);
    expect(nextDueAt(second)).toBe(nextDueAt(first));
  });

  it("nextDueAt is stable across repeated calls — a wake can never push the deadline forward", () => {
    const host = makeSeat({ seatId: "host", connected: false, disconnectedAt: 1000 });
    const state = makeRoom({ status: "lobby", hostSeatId: "host", seats: [host] });

    const calls = [0, 1, 2].map(() => nextDueAt(computeRoomTimers(state, 5000)));
    expect(calls[0]).toBe(calls[1]);
    expect(calls[1]).toBe(calls[2]);
  });
});
