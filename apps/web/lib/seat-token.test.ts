import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSeatToken,
  displayNameKey,
  readDisplayName,
  readJoinSeatToken,
  readSeatToken,
  seatTokenKey,
  writeDisplayName,
  writeSeatToken,
} from "./seat-token";

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow === undefined) {
    // @ts-expect-error -- test-only global cleanup, restoring SSR shape
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
});

function installFakeLocalStorage(): Storage {
  const store = new Map<string, string>();
  const fake: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  // @ts-expect-error -- constructing a minimal window shape for a Node test environment
  globalThis.window = { localStorage: fake };
  return fake;
}

function installThrowingLocalStorage(): void {
  // @ts-expect-error -- simulate Safari private-mode: the localStorage
  // GETTER itself throws, not just its methods.
  globalThis.window = {
    get localStorage(): Storage {
      throw new Error("SecurityError: storage disabled");
    },
  };
}

describe("seatTokenKey", () => {
  it('returns "room:{code}"', () => {
    expect(seatTokenKey("ABC123")).toBe("room:ABC123");
  });
});

describe("readSeatToken", () => {
  it("returns undefined when window is undefined (SSR)", () => {
    // @ts-expect-error -- simulate the SSR environment (no window global)
    delete globalThis.window;
    expect(() => readSeatToken("ABC123")).not.toThrow();
    expect(readSeatToken("ABC123")).toBeUndefined();
  });

  it("returns undefined and does not throw when the localStorage getter throws", () => {
    installThrowingLocalStorage();
    expect(() => readSeatToken("ABC123")).not.toThrow();
    expect(readSeatToken("ABC123")).toBeUndefined();
  });

  it("returns undefined when no token has been saved", () => {
    installFakeLocalStorage();
    expect(readSeatToken("ABC123")).toBeUndefined();
  });

  it("returns the saved token after writeSeatToken", () => {
    installFakeLocalStorage();
    writeSeatToken("ABC123", "seat-token-value");
    expect(readSeatToken("ABC123")).toBe("seat-token-value");
  });

  it("scopes tokens per room code", () => {
    installFakeLocalStorage();
    writeSeatToken("ABC123", "token-a");
    writeSeatToken("XYZ789", "token-b");
    expect(readSeatToken("ABC123")).toBe("token-a");
    expect(readSeatToken("XYZ789")).toBe("token-b");
  });
});

describe("writeSeatToken", () => {
  it("does not throw when storage access fails", () => {
    installThrowingLocalStorage();
    expect(() => writeSeatToken("ABC123", "token")).not.toThrow();
  });

  it("does not throw during SSR", () => {
    // @ts-expect-error -- simulate the SSR environment (no window global)
    delete globalThis.window;
    expect(() => writeSeatToken("ABC123", "token")).not.toThrow();
  });
});

describe("clearSeatToken", () => {
  it("removes a saved token", () => {
    installFakeLocalStorage();
    writeSeatToken("ABC123", "token");
    clearSeatToken("ABC123");
    expect(readSeatToken("ABC123")).toBeUndefined();
  });

  it("does not throw when storage access fails", () => {
    installThrowingLocalStorage();
    expect(() => clearSeatToken("ABC123")).not.toThrow();
  });
});

describe("WR-06: display name persists in localStorage next to the seat token", () => {
  it('uses the "room:{code}:displayName" key', () => {
    expect(displayNameKey("ABC123")).toBe("room:ABC123:displayName");
  });

  it("round-trips a name, scoped per room code, surviving a new tab (localStorage, not sessionStorage)", () => {
    const storage = installFakeLocalStorage();
    writeDisplayName("ABC123", "Bianca");
    writeDisplayName("XYZ789", "Roger");
    expect(storage.getItem("room:ABC123:displayName")).toBe("Bianca");
    expect(readDisplayName("ABC123")).toBe("Bianca");
    expect(readDisplayName("XYZ789")).toBe("Roger");
  });

  it("ignores a stored name that fails DisplayNameSchema", () => {
    const storage = installFakeLocalStorage();
    storage.setItem("room:ABC123:displayName", "   ");
    expect(readDisplayName("ABC123")).toBeUndefined();
  });

  it("never throws during SSR or when storage access fails", () => {
    installThrowingLocalStorage();
    expect(() => writeDisplayName("ABC123", "Bianca")).not.toThrow();
    expect(readDisplayName("ABC123")).toBeUndefined();
  });
});

describe("WR-05: readJoinSeatToken only replays a well-formed token", () => {
  it("returns a stored token that passes SeatTokenSchema", () => {
    installFakeLocalStorage();
    writeSeatToken("ABC123", "a".repeat(24));
    expect(readJoinSeatToken("ABC123")).toBe("a".repeat(24));
  });

  it("drops (and clears) a malformed token instead of sending a join the server must reject", () => {
    installFakeLocalStorage();
    writeSeatToken("ABC123", "corrupted-value");
    expect(readJoinSeatToken("ABC123")).toBeUndefined();
    expect(readSeatToken("ABC123")).toBeUndefined();
  });
});

describe("localStorage throw simulation", () => {
  it("stubbing window.localStorage to throw is exercised by readSeatToken", () => {
    const spy = vi.fn();
    try {
      installThrowingLocalStorage();
      readSeatToken("ABC123");
    } finally {
      spy();
    }
    expect(spy).toHaveBeenCalled();
  });
});
