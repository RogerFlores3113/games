import { afterEach, describe, expect, it } from "vitest";
import { safeGetItem, safeKeysWithPrefix, safeRemoveItem, safeSetItem } from "./safe-storage";

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

function installThrowingMethods(): void {
  const throwing: Storage = {
    get length(): number {
      throw new Error("boom");
    },
    clear: () => {
      throw new Error("boom");
    },
    getItem: () => {
      throw new Error("boom");
    },
    key: () => {
      throw new Error("boom");
    },
    removeItem: () => {
      throw new Error("boom");
    },
    setItem: () => {
      throw new Error("boom");
    },
  };
  // @ts-expect-error -- constructing a minimal window shape for a Node test environment
  globalThis.window = { localStorage: throwing };
}

describe("safeGetItem", () => {
  it("returns null when window is undefined (SSR)", () => {
    // @ts-expect-error -- simulate the SSR environment (no window global)
    delete globalThis.window;
    expect(() => safeGetItem("k")).not.toThrow();
    expect(safeGetItem("k")).toBeNull();
  });

  it("returns null when the localStorage getter throws", () => {
    installThrowingLocalStorage();
    expect(() => safeGetItem("k")).not.toThrow();
    expect(safeGetItem("k")).toBeNull();
  });

  it("returns null when getItem itself throws", () => {
    installThrowingMethods();
    expect(() => safeGetItem("k")).not.toThrow();
    expect(safeGetItem("k")).toBeNull();
  });

  it("returns null when nothing stored", () => {
    installFakeLocalStorage();
    expect(safeGetItem("k")).toBeNull();
  });

  it("round-trips a value written by safeSetItem", () => {
    installFakeLocalStorage();
    safeSetItem("k", "v");
    expect(safeGetItem("k")).toBe("v");
  });
});

describe("safeSetItem", () => {
  it("does not throw during SSR", () => {
    // @ts-expect-error -- simulate the SSR environment (no window global)
    delete globalThis.window;
    expect(() => safeSetItem("k", "v")).not.toThrow();
  });

  it("does not throw when storage access fails", () => {
    installThrowingLocalStorage();
    expect(() => safeSetItem("k", "v")).not.toThrow();
  });

  it("does not throw when setItem itself throws", () => {
    installThrowingMethods();
    expect(() => safeSetItem("k", "v")).not.toThrow();
  });
});

describe("safeRemoveItem", () => {
  it("removes a stored value", () => {
    installFakeLocalStorage();
    safeSetItem("k", "v");
    safeRemoveItem("k");
    expect(safeGetItem("k")).toBeNull();
  });

  it("does not throw when storage access fails", () => {
    installThrowingLocalStorage();
    expect(() => safeRemoveItem("k")).not.toThrow();
  });

  it("does not throw when removeItem itself throws", () => {
    installThrowingMethods();
    expect(() => safeRemoveItem("k")).not.toThrow();
  });
});

describe("safeKeysWithPrefix", () => {
  it("lists keys starting with the prefix, in any order", () => {
    installFakeLocalStorage();
    safeSetItem("foo:a", "1");
    safeSetItem("foo:b", "2");
    safeSetItem("bar:c", "3");
    expect(new Set(safeKeysWithPrefix("foo:"))).toEqual(new Set(["foo:a", "foo:b"]));
  });

  it("returns [] when nothing matches", () => {
    installFakeLocalStorage();
    safeSetItem("bar:c", "3");
    expect(safeKeysWithPrefix("foo:")).toEqual([]);
  });

  it("returns [] during SSR", () => {
    // @ts-expect-error -- simulate the SSR environment (no window global)
    delete globalThis.window;
    expect(() => safeKeysWithPrefix("foo:")).not.toThrow();
    expect(safeKeysWithPrefix("foo:")).toEqual([]);
  });

  it("returns [] when the localStorage getter throws", () => {
    installThrowingLocalStorage();
    expect(() => safeKeysWithPrefix("foo:")).not.toThrow();
    expect(safeKeysWithPrefix("foo:")).toEqual([]);
  });

  it("returns [] when length/key themselves throw", () => {
    installThrowingMethods();
    expect(() => safeKeysWithPrefix("foo:")).not.toThrow();
    expect(safeKeysWithPrefix("foo:")).toEqual([]);
  });
});
