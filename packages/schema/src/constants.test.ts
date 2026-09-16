import { describe, expect, it } from "vitest";
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_PING,
  HEARTBEAT_PONG,
  HEARTBEAT_PONG_TIMEOUT_MS,
  ROOM_ABANDONED_CLOSE_CODE,
  SOCKET_STALE_MS,
  STALE_SOCKET_CLOSE_CODE,
  SUPERSEDED_CLOSE_CODE,
  ZOMBIE_SWEEP_INTERVAL_MS,
} from "./constants";

describe("Phase 5 (D-02/D-03/D-04) heartbeat constants", () => {
  it("SOCKET_STALE_MS exceeds 60s (Chrome hidden-tab once-per-minute timer throttle)", () => {
    expect(SOCKET_STALE_MS).toBeGreaterThan(60_000);
  });

  it("SOCKET_STALE_MS exceeds 2x HEARTBEAT_INTERVAL_MS", () => {
    expect(SOCKET_STALE_MS).toBeGreaterThan(2 * HEARTBEAT_INTERVAL_MS);
  });

  it("HEARTBEAT_PONG_TIMEOUT_MS is shorter than HEARTBEAT_INTERVAL_MS", () => {
    expect(HEARTBEAT_PONG_TIMEOUT_MS).toBeLessThan(HEARTBEAT_INTERVAL_MS);
  });

  it("ZOMBIE_SWEEP_INTERVAL_MS is shorter than SOCKET_STALE_MS", () => {
    expect(ZOMBIE_SWEEP_INTERVAL_MS).toBeLessThan(SOCKET_STALE_MS);
  });

  it("HEARTBEAT_PING and HEARTBEAT_PONG are distinct, non-empty, non-JSON literals", () => {
    expect(HEARTBEAT_PING).not.toBe(HEARTBEAT_PONG);
    expect(HEARTBEAT_PING.length).toBeGreaterThan(0);
    expect(HEARTBEAT_PONG.length).toBeGreaterThan(0);
    expect(() => JSON.parse(HEARTBEAT_PING)).toThrow();
    expect(() => JSON.parse(HEARTBEAT_PONG)).toThrow();
  });

  it("STALE_SOCKET_CLOSE_CODE is 4003 and distinct from the other close codes", () => {
    expect(STALE_SOCKET_CLOSE_CODE).toBe(4003);
    expect(STALE_SOCKET_CLOSE_CODE).not.toBe(SUPERSEDED_CLOSE_CODE);
    expect(STALE_SOCKET_CLOSE_CODE).not.toBe(ROOM_ABANDONED_CLOSE_CODE);
  });
});
