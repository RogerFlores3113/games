import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listSnapshots, removeSnapshot, saveSnapshot } from "./dev-snapshots";

const backing = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => backing.get(k) ?? null,
  setItem: (k: string, v: string) => void backing.set(k, v),
  removeItem: (k: string) => void backing.delete(k),
  key: (i: number) => [...backing.keys()][i] ?? null,
  get length() {
    return backing.size;
  },
};

beforeEach(() => {
  backing.clear();
  (globalThis as { window?: unknown }).window = { localStorage: fakeStorage };
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("dev snapshots", () => {
  it("lists newest first, keyed per game", () => {
    saveSnapshot("g1", "old", { n: 1 }, 100);
    saveSnapshot("g1", "new", { n: 2 }, 200);
    saveSnapshot("g2", "other", { n: 3 }, 300);
    expect(listSnapshots("g1").map((s) => s.name)).toEqual(["new", "old"]);
    expect(listSnapshots("g2").map((s) => s.name)).toEqual(["other"]);
  });

  it("replaces a snapshot saved under the same name", () => {
    saveSnapshot("g1", "a", { n: 1 }, 100);
    saveSnapshot("g1", "a", { n: 2 }, 200);
    expect(listSnapshots("g1")).toEqual([{ name: "a", savedAt: 200, state: { n: 2 } }]);
  });

  it("removes by name", () => {
    saveSnapshot("g1", "a", 1, 100);
    saveSnapshot("g1", "b", 2, 200);
    removeSnapshot("g1", "a");
    expect(listSnapshots("g1").map((s) => s.name)).toEqual(["b"]);
    removeSnapshot("g1", "b");
    expect(listSnapshots("g1")).toEqual([]);
  });

  it("treats corrupt storage as empty", () => {
    backing.set("games:dev-snapshots:g1", "{nope");
    expect(listSnapshots("g1")).toEqual([]);
  });
});
