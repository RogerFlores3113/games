import { afterEach, describe, expect, it } from "vitest";
import type { RoomView } from "@games/schema";
import {
  clearPendingVariant,
  readPendingVariant,
  variantToApply,
  writePendingVariant,
} from "./pending-variant";

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
    variant: "base",
    status: "lobby",
    hostSeatId: "seat-1",
    youSeatId: "seat-1",
    seats: [{ seatId: "seat-1", displayLabel: "Roger", connected: true, isHost: true }],
    game: null,
    ...overrides,
  };
}

describe("variantToApply (WR-04)", () => {
  it("returns the creator's chosen variant once the host is seated in a lobby still on another variant", () => {
    expect(variantToApply(makeView(), "rainbow")).toBe("rainbow");
  });

  it("returns null when nothing is pending, the variant already matches, the viewer is not host, or the game started", () => {
    expect(variantToApply(makeView(), undefined)).toBeNull();
    expect(variantToApply(makeView({ variant: "rainbow" }), "rainbow")).toBeNull();
    expect(variantToApply(makeView({ youSeatId: "seat-2" }), "rainbow")).toBeNull();
    expect(variantToApply(makeView({ status: "in_progress" }), "rainbow")).toBeNull();
  });
});

describe("pending variant storage (WR-04)", () => {
  it("round-trips a variant under room:{code}:variant and clears it", () => {
    const store = installFakeLocalStorage();
    writePendingVariant("ABCDEF", "black");
    expect(store.get("room:ABCDEF:variant")).toBe("black");
    expect(readPendingVariant("ABCDEF")).toBe("black");
    clearPendingVariant("ABCDEF");
    expect(readPendingVariant("ABCDEF")).toBeUndefined();
  });

  it("ignores a stored value that is not a known variant", () => {
    const store = installFakeLocalStorage();
    store.set("room:ABCDEF:variant", "purple");
    expect(readPendingVariant("ABCDEF")).toBeUndefined();
  });

  it("never throws during SSR", () => {
    // @ts-expect-error -- simulate the SSR environment (no window global)
    delete globalThis.window;
    expect(() => writePendingVariant("ABCDEF", "black")).not.toThrow();
    expect(readPendingVariant("ABCDEF")).toBeUndefined();
  });
});
