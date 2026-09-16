import { describe, expect, it } from "vitest";
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_PONG_TIMEOUT_MS, SOCKET_STALE_MS } from "@games/schema";
import { isPongOverdue, resolveClientHeartbeatTiming, resumeAction } from "./heartbeat";

describe("resolveClientHeartbeatTiming (D-15)", () => {
  it("defaults to the real HEARTBEAT constants when both args are undefined", () => {
    expect(resolveClientHeartbeatTiming(undefined, undefined)).toEqual({
      intervalMs: HEARTBEAT_INTERVAL_MS,
      pongTimeoutMs: HEARTBEAT_PONG_TIMEOUT_MS,
    });
  });

  it("uses valid overrides verbatim", () => {
    expect(resolveClientHeartbeatTiming("2000", "1500")).toEqual({
      intervalMs: 2000,
      pongTimeoutMs: 1500,
    });
  });

  it.each(["", "x", "0", "-1", "1.5", "249"])("falls back to the real constant for %j", (raw) => {
    expect(resolveClientHeartbeatTiming(raw, raw)).toEqual({
      intervalMs: HEARTBEAT_INTERVAL_MS,
      pongTimeoutMs: HEARTBEAT_PONG_TIMEOUT_MS,
    });
  });
});

describe("resumeAction (D-01)", () => {
  const timing = { intervalMs: HEARTBEAT_INTERVAL_MS, pongTimeoutMs: HEARTBEAT_PONG_TIMEOUT_MS };

  it("never fires while latched (D-11), regardless of socket state", () => {
    expect(
      resumeAction({ latched: true, readyState: 3, lastHeardAt: 0, now: 999_999, timing }),
    ).toBe("none");
  });

  it.each([2, 3])("reconnects when the socket is CLOSING/CLOSED (readyState %i)", (readyState) => {
    expect(
      resumeAction({ latched: false, readyState, lastHeardAt: 100, now: 100, timing }),
    ).toBe("reconnect");
  });

  it("WR-05: does nothing while a handshake is already in flight (CONNECTING)", () => {
    expect(
      resumeAction({ latched: false, readyState: 0, lastHeardAt: 0, now: 999_999, timing }),
    ).toBe("none");
  });

  it("WR-02: only pings an OPEN socket after a throttled ~60s alt-tab gap, letting the pong timeout decide", () => {
    const now = 1_000_000;
    expect(
      resumeAction({ latched: false, readyState: 1, lastHeardAt: now - 60_000, now, timing }),
    ).toBe("ping");
    expect(
      resumeAction({
        latched: false,
        readyState: 1,
        lastHeardAt: now - SOCKET_STALE_MS,
        now,
        timing,
      }),
    ).toBe("ping");
  });

  it("reconnects an OPEN socket immediately once the gap exceeds the server's stale threshold", () => {
    const now = 1_000_000;
    expect(
      resumeAction({ latched: false, readyState: 1, lastHeardAt: now - SOCKET_STALE_MS - 1, now, timing }),
    ).toBe("reconnect");
    expect(
      resumeAction({ latched: false, readyState: 1, lastHeardAt: now - 5001, now, timing, socketStaleMs: 5000 }),
    ).toBe("reconnect");
  });

  it("pings when OPEN and recently heard from", () => {
    const now = 1_000_000;
    expect(
      resumeAction({ latched: false, readyState: 1, lastHeardAt: now - 1000, now, timing }),
    ).toBe("ping");
  });
});

describe("isPongOverdue (D-02)", () => {
  const pongTimeoutMs = HEARTBEAT_PONG_TIMEOUT_MS;

  it("is true once now passes pingSentAt + pongTimeoutMs with nothing heard since the ping", () => {
    expect(
      isPongOverdue({ pingSentAt: 1000, lastHeardAt: 999, now: 1000 + pongTimeoutMs + 1, pongTimeoutMs }),
    ).toBe(true);
  });

  it("is false if any frame arrived at or after the ping was sent", () => {
    expect(
      isPongOverdue({ pingSentAt: 1000, lastHeardAt: 1000, now: 1000 + pongTimeoutMs + 1, pongTimeoutMs }),
    ).toBe(false);
  });

  it("is false before the timeout has actually elapsed", () => {
    expect(
      isPongOverdue({ pingSentAt: 1000, lastHeardAt: 999, now: 1000 + pongTimeoutMs, pongTimeoutMs }),
    ).toBe(false);
  });
});
