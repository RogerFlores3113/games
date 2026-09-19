import { afterEach, describe, expect, it } from "vitest";
import { groupDiscardsBySuit, readDiscardViewPref, writeDiscardViewPref } from "./hanabi-discard-logic";

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

describe("groupDiscardsBySuit", () => {
  it("returns one entry per variant suit in variantConfig order, zero-count suits included", () => {
    const groups = groupDiscardsBySuit([], "base");
    expect(groups.map((g) => g.suit)).toEqual(["red", "yellow", "green", "blue", "white"]);
    for (const group of groups) {
      expect(group.total).toBe(0);
      expect(group.countsByRank).toEqual([0, 0, 0, 0, 0]);
    }
  });

  it("counts per-rank within a suit and computes total", () => {
    const discard = [
      { id: "c1", suit: "red" as const, rank: 1 as const },
      { id: "c2", suit: "red" as const, rank: 1 as const },
      { id: "c3", suit: "red" as const, rank: 3 as const },
      { id: "c4", suit: "blue" as const, rank: 5 as const },
    ];
    const groups = groupDiscardsBySuit(discard, "base");
    const red = groups.find((g) => g.suit === "red")!;
    expect(red.countsByRank).toEqual([2, 0, 1, 0, 0]);
    expect(red.total).toBe(3);
    const blue = groups.find((g) => g.suit === "blue")!;
    expect(blue.countsByRank).toEqual([0, 0, 0, 0, 1]);
    expect(blue.total).toBe(1);
    const green = groups.find((g) => g.suit === "green")!;
    expect(green.total).toBe(0);
  });

  it("includes rainbow/black suits in variant order for those variants", () => {
    expect(groupDiscardsBySuit([], "rainbow").map((g) => g.suit)).toEqual([
      "red",
      "yellow",
      "green",
      "blue",
      "white",
      "rainbow",
    ]);
    expect(groupDiscardsBySuit([], "black").map((g) => g.suit)).toEqual([
      "red",
      "yellow",
      "green",
      "blue",
      "white",
      "rainbow",
      "black",
    ]);
  });
});

describe("readDiscardViewPref / writeDiscardViewPref", () => {
  it('defaults to "compact" when nothing stored', () => {
    installFakeLocalStorage();
    expect(readDiscardViewPref()).toBe("compact");
  });

  it('persists "expanded" and reads it back', () => {
    installFakeLocalStorage();
    writeDiscardViewPref("expanded");
    expect(readDiscardViewPref()).toBe("expanded");
  });

  it('an unrecognised stored value reads as "compact"', () => {
    const storage = installFakeLocalStorage();
    storage.setItem("hanabi-discard-view", "garbled-value");
    expect(readDiscardViewPref()).toBe("compact");
  });

  it("never throws when storage access fails", () => {
    installThrowingLocalStorage();
    expect(() => writeDiscardViewPref("expanded")).not.toThrow();
    expect(readDiscardViewPref()).toBe("compact");
  });
});
