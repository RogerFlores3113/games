import { describe, expect, it } from "vitest";
import { SOCKET_STALE_MS, ZOMBIE_SWEEP_INTERVAL_MS } from "@games/schema";
import {
  isSocketStale,
  orphanedConnectedSeatIds,
  resolveAlarmWrite,
  resolveHeartbeatTiming,
  socketLastSeenAt,
} from "./heartbeat";

describe("orphanedConnectedSeatIds (CR-02)", () => {
  it("reports a connected seat with no bound socket (the post-eviction case)", () => {
    const seats = [
      { seatId: "a", connected: true },
      { seatId: "b", connected: true },
    ];
    expect(orphanedConnectedSeatIds(seats, { a: "conn-a" })).toEqual(["b"]);
  });

  it("never reports a disconnected seat, or a connected seat that has a binding", () => {
    const seats = [
      { seatId: "a", connected: true },
      { seatId: "b", connected: false },
    ];
    expect(orphanedConnectedSeatIds(seats, { a: "conn-a" })).toEqual([]);
  });

  it("reports every connected seat when no socket is bound at all", () => {
    const seats = [
      { seatId: "a", connected: true },
      { seatId: "b", connected: true },
    ];
    expect(orphanedConnectedSeatIds(seats, {})).toEqual(["a", "b"]);
  });
});

describe("resolveAlarmWrite (CR-01/WR-01)", () => {
  const now = 10_000;

  it("deletes a pending alarm when nothing is scheduled, and keeps an empty slot empty", () => {
    expect(resolveAlarmWrite(null, 12_000, now, { inAlarmHandler: false })).toEqual({ kind: "delete" });
    expect(resolveAlarmWrite(null, null, now, { inAlarmHandler: false })).toEqual({ kind: "keep" });
  });

  it("Pitfall 2: never re-writes an unchanged future target", () => {
    expect(resolveAlarmWrite(12_000, 12_000, now, { inAlarmHandler: false })).toEqual({ kind: "keep" });
  });

  it("arms an empty slot and moves a future alarm to a different target", () => {
    expect(resolveAlarmWrite(12_000, null, now, { inAlarmHandler: false })).toEqual({ kind: "set", at: 12_000 });
    expect(resolveAlarmWrite(11_000, 12_000, now, { inAlarmHandler: false })).toEqual({ kind: "set", at: 11_000 });
  });

  it("WR-01: outside the handler, an overdue pending alarm is never pushed later by a recomputed boundary", () => {
    // A hibernation wake at now=10_000 recomputes the NEXT grid boundary
    // (11_000) while the 9_000 alarm has not been delivered yet.
    expect(resolveAlarmWrite(11_000, 9_000, now, { inAlarmHandler: false })).toEqual({ kind: "keep" });
    expect(resolveAlarmWrite(11_000, now, now, { inAlarmHandler: false })).toEqual({ kind: "keep" });
  });

  it("CR-01: inside the handler, the next target is always armed even if getAlarm() still reports the firing alarm", () => {
    expect(resolveAlarmWrite(11_000, 9_000, now, { inAlarmHandler: true })).toEqual({ kind: "set", at: 11_000 });
    expect(resolveAlarmWrite(11_000, null, now, { inAlarmHandler: true })).toEqual({ kind: "set", at: 11_000 });
  });
});

describe("resolveHeartbeatTiming", () => {
  it("falls back to the schema constants when env is empty", () => {
    expect(resolveHeartbeatTiming({})).toEqual({
      socketStaleMs: SOCKET_STALE_MS,
      zombieSweepIntervalMs: ZOMBIE_SWEEP_INTERVAL_MS,
    });
  });

  it("honors valid finite-integer overrides >= 500", () => {
    expect(
      resolveHeartbeatTiming({ SOCKET_STALE_MS: "4000", ZOMBIE_SWEEP_INTERVAL_MS: "1000" }),
    ).toEqual({ socketStaleMs: 4000, zombieSweepIntervalMs: 1000 });
  });

  it.each(["", "abc", "0", "-5", "12.5", "499"])(
    "falls back to the constant for an invalid override %j",
    (raw) => {
      const result = resolveHeartbeatTiming({ SOCKET_STALE_MS: raw });
      expect(result.socketStaleMs).toBe(SOCKET_STALE_MS);
    },
  );

  it("500 is the smallest accepted override", () => {
    expect(resolveHeartbeatTiming({ SOCKET_STALE_MS: "500" }).socketStaleMs).toBe(500);
  });
});

describe("socketLastSeenAt", () => {
  it("returns 0 when both inputs are missing", () => {
    expect(socketLastSeenAt(null, undefined)).toBe(0);
  });

  it("returns the max of autoResponseAt and boundAt", () => {
    expect(socketLastSeenAt(new Date(5000), 3000)).toBe(5000);
    expect(socketLastSeenAt(null, 7000)).toBe(7000);
    expect(socketLastSeenAt(new Date(1000), 9000)).toBe(9000);
  });
});

describe("isSocketStale", () => {
  it("is not stale exactly at the boundary (now - lastSeenAt === staleMs)", () => {
    expect(isSocketStale(1000, 1000 + 5000, 5000)).toBe(false);
  });

  it("is stale one ms past the boundary", () => {
    expect(isSocketStale(1000, 1001 + 5000, 5000)).toBe(true);
  });
});
