import { afterEach, describe, expect, it } from "vitest";
import type { RoomView } from "@games/schema";
import {
  clearPendingConfig,
  clearPendingGame,
  configToApply,
  pendingGameKey,
  readPendingConfig,
  readPendingGame,
  writePendingConfig,
  writePendingGame,
} from "./pending-room";

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow === undefined) {
    // @ts-expect-error -- test-only global cleanup, restoring SSR shape
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
});

function installFakeLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const fake = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  // @ts-expect-error -- constructing a minimal window shape for a Node test environment
  globalThis.window = { localStorage: fake };
  return store;
}

function makeView(overrides: Partial<RoomView> = {}): RoomView {
  return {
    code: "ABCDEF" as RoomView["code"],
    gameId: "hanabi",
    gameDisplayName: "Hanabi",
    config: "base",
    limits: { min: 2, max: 5 },
    status: "lobby",
    hostSeatId: "seat-1",
    youSeatId: "seat-1",
    seats: [{ seatId: "seat-1", displayLabel: "Roger", connected: true, isHost: true }],
    game: null,
    ...overrides,
  };
}

describe("pending game storage (D-02)", () => {
  it("round-trips a game under room:{code}:game and clears it", () => {
    const store = installFakeLocalStorage();
    writePendingGame("ABCDEF", "hanabi");
    expect(store.get(pendingGameKey("ABCDEF"))).toBe("hanabi");
    expect(readPendingGame("ABCDEF")).toBe("hanabi");
    clearPendingGame("ABCDEF");
    expect(readPendingGame("ABCDEF")).toBeUndefined();
  });

  it("ignores a stored value that is not a registered GameId", () => {
    const store = installFakeLocalStorage();
    store.set(pendingGameKey("ABCDEF"), "innovation");
    expect(readPendingGame("ABCDEF")).toBeUndefined();
    store.set(pendingGameKey("ABCDEF"), "garbage");
    expect(readPendingGame("ABCDEF")).toBeUndefined();
  });

  it("a stored 'expedition' reads back as 'expedition' (registered as of Phase 11)", () => {
    const store = installFakeLocalStorage();
    store.set(pendingGameKey("ABCDEF"), "expedition");
    expect(readPendingGame("ABCDEF")).toBe("expedition");
  });

  it("every function no-ops during SSR (no window)", () => {
    // @ts-expect-error -- simulate the SSR environment (no window global)
    delete globalThis.window;
    expect(() => writePendingGame("ABCDEF", "hanabi")).not.toThrow();
    expect(readPendingGame("ABCDEF")).toBeUndefined();
    expect(() => clearPendingGame("ABCDEF")).not.toThrow();
  });
});

describe("pending config storage (D-02)", () => {
  it("round-trips a string config and clears it", () => {
    installFakeLocalStorage();
    writePendingConfig("ABCDEF", "rainbow");
    expect(readPendingConfig("ABCDEF")).toBe("rainbow");
    clearPendingConfig("ABCDEF");
    expect(readPendingConfig("ABCDEF")).toBeUndefined();
  });

  it("round-trips an object config", () => {
    installFakeLocalStorage();
    writePendingConfig("ABCDEF", { rounds: 2 });
    expect(readPendingConfig("ABCDEF")).toEqual({ rounds: 2 });
  });

  it("reads undefined for malformed JSON", () => {
    const store = installFakeLocalStorage();
    store.set("room:ABCDEF:config", "{not json");
    expect(readPendingConfig("ABCDEF")).toBeUndefined();
  });

  it("every function no-ops during SSR (no window)", () => {
    // @ts-expect-error -- simulate the SSR environment (no window global)
    delete globalThis.window;
    expect(() => writePendingConfig("ABCDEF", "rainbow")).not.toThrow();
    expect(readPendingConfig("ABCDEF")).toBeUndefined();
    expect(() => clearPendingConfig("ABCDEF")).not.toThrow();
  });
});

describe("configToApply (D-04)", () => {
  it("returns the creator's chosen config once the host is seated in a lobby still on another config", () => {
    expect(configToApply(makeView(), "rainbow")).toBe("rainbow");
  });

  it("round-trips an object config through JSON.stringify equality", () => {
    expect(configToApply(makeView({ config: { rounds: 1 } }), { rounds: 2 })).toEqual({ rounds: 2 });
    expect(configToApply(makeView({ config: { rounds: 2 } }), { rounds: 2 })).toBeNull();
  });

  it("returns null when nothing is pending, the config already matches, the viewer is not host, or the game started", () => {
    expect(configToApply(makeView(), undefined)).toBeNull();
    expect(configToApply(makeView({ config: "rainbow" }), "rainbow")).toBeNull();
    expect(configToApply(makeView({ youSeatId: "seat-2" }), "rainbow")).toBeNull();
    expect(configToApply(makeView({ status: "in_progress" }), "rainbow")).toBeNull();
  });
});
