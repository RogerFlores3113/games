import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { markSoloRoom, readBotsPlay, takeSoloStart, writeBotsPlay } from "./dev-solo";

const backing = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => backing.get(k) ?? null,
  setItem: (k: string, v: string) => void backing.set(k, v),
  removeItem: (k: string) => void backing.delete(k),
};

beforeEach(() => {
  backing.clear();
  (globalThis as { window?: unknown }).window = { localStorage: fakeStorage };
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("dev solo rooms", () => {
  it("starts a solo room once, with its bots playing", () => {
    markSoloRoom("ABC123");
    expect(readBotsPlay("ABC123")).toBe(true);
    expect(takeSoloStart("ABC123")).toBe(true);
    expect(takeSoloStart("ABC123")).toBe(false);
  });

  it("leaves any other room alone, its bots idle until switched on", () => {
    expect(takeSoloStart("XYZ789")).toBe(false);
    expect(readBotsPlay("XYZ789")).toBe(false);
    writeBotsPlay("XYZ789", true);
    expect(readBotsPlay("XYZ789")).toBe(true);
  });
});
