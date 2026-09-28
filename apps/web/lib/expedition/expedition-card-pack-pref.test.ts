import { afterEach, describe, expect, it } from "vitest";
import { CARD_PACK_LABELS, isCardPackId } from "./card-pack-ids";
import { EXPEDITION_CARD_PACK_KEY, readCardPackPref, writeCardPackPref } from "./expedition-card-pack-pref";

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

describe("expedition-card-pack-pref", () => {
  it("with no window (SSR shape): reads the default and write never throws", () => {
    // @ts-expect-error -- simulate SSR: no window global at all
    delete globalThis.window;
    expect(readCardPackPref()).toBe("big-index");
    expect(() => writeCardPackPref("classic")).not.toThrow();
  });

  it("empty storage reads the default", () => {
    installFakeLocalStorage();
    expect(readCardPackPref()).toBe("big-index");
  });

  it("round-trips a written preference", () => {
    const fake = installFakeLocalStorage();
    writeCardPackPref("classic");
    expect(fake.getItem(EXPEDITION_CARD_PACK_KEY)).toBe("classic");
    expect(readCardPackPref()).toBe("classic");
  });

  it.each(["neon", ""])("a tampered stored value (%j) degrades to the default", (tampered) => {
    const fake = installFakeLocalStorage();
    fake.setItem(EXPEDITION_CARD_PACK_KEY, tampered);
    expect(readCardPackPref()).toBe("big-index");
  });

  it("a localStorage whose getItem throws reads the default", () => {
    installFakeLocalStorage();
    globalThis.window.localStorage.getItem = () => {
      throw new Error("boom");
    };
    expect(readCardPackPref()).toBe("big-index");
  });

  it("isCardPackId accepts only the exact known ids", () => {
    expect(isCardPackId("classic")).toBe(true);
    expect(isCardPackId("big-index")).toBe(true);
    expect(isCardPackId("Classic")).toBe(false);
    expect(isCardPackId(3)).toBe(false);
  });

  it("CARD_PACK_LABELS has the expected display names", () => {
    expect(CARD_PACK_LABELS["big-index"]).toBe("Big Index");
    expect(CARD_PACK_LABELS.classic).toBe("Classic");
  });
});
