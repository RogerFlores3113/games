import { describe, expect, it } from "vitest";
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_PONG_TIMEOUT_MS } from "@games/schema";
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

  it("reconnects when the socket is not OPEN", () => {
    expect(
      resumeAction({ latched: false, readyState: 0, lastHeardAt: 100, now: 100, timing }),
    ).toBe("reconnect");
  });

  it("reconnects when OPEN but nothing has been heard for longer than one full heartbeat cycle", () => {
    const now = 1_000_000;
    expect(
      resumeAction({
        latched: false,
        readyState: 1,
        lastHeardAt: now - (timing.intervalMs + timing.pongTimeoutMs) - 1,
        now,
        timing,
      }),
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
