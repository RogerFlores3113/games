import { describe, expect, it } from "vitest";
import { SOCKET_STALE_MS, ZOMBIE_SWEEP_INTERVAL_MS } from "@games/schema";
import { isSocketStale, resolveHeartbeatTiming, socketLastSeenAt } from "./heartbeat";

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
