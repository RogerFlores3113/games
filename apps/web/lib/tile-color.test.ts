import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { KEEP_HINTS_KEY, readKeepHintsPref, writeKeepHintsPref } from "./keep-hints-pref";
import {
  DEFAULT_TILE_COLOR_CSS,
  TILE_COLOR_KEY,
  isValidHexColor,
  readTileColorPref,
  resolveTileColorCss,
  tileColorCssFromHex,
  writeTileColorPref,
} from "./tile-color-pref";

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

describe("keep-hints-pref", () => {
  it("readKeepHintsPref returns false when nothing is stored", () => {
    installFakeLocalStorage();
    expect(readKeepHintsPref()).toBe(false);
  });

  it("readKeepHintsPref returns false when the stored value is unrecognised", () => {
    const fake = installFakeLocalStorage();
    fake.setItem(KEEP_HINTS_KEY, "not-a-boolean");
    expect(readKeepHintsPref()).toBe(false);
  });

  it("round-trips true", () => {
    installFakeLocalStorage();
    writeKeepHintsPref(true);
    expect(readKeepHintsPref()).toBe(true);
  });

  it("round-trips false", () => {
    installFakeLocalStorage();
    writeKeepHintsPref(true);
    writeKeepHintsPref(false);
    expect(readKeepHintsPref()).toBe(false);
  });
});

describe("tile-color-pref", () => {
  it("readTileColorPref returns null when nothing is stored", () => {
    installFakeLocalStorage();
    expect(readTileColorPref()).toBeNull();
  });

  it("readTileColorPref returns null when the stored value is not a well-formed hex (tampered/legacy preset id)", () => {
    const fake = installFakeLocalStorage();
    fake.setItem(TILE_COLOR_KEY, "slate");
    expect(readTileColorPref()).toBeNull();
  });

  it("round-trips a chosen hex colour", () => {
    installFakeLocalStorage();
    writeTileColorPref("#3388ff");
    expect(readTileColorPref()).toBe("#3388ff");
  });

  it("writing null clears the stored preference, reverting reads to null", () => {
    installFakeLocalStorage();
    writeTileColorPref("#3388ff");
    writeTileColorPref(null);
    expect(readTileColorPref()).toBeNull();
  });

  it("isValidHexColor accepts well-formed 6-digit hex and rejects everything else", () => {
    expect(isValidHexColor("#3388ff")).toBe(true);
    expect(isValidHexColor("#FFFFFF")).toBe(true);
    expect(isValidHexColor("#000000")).toBe(true);
    expect(isValidHexColor("slate")).toBe(false);
    expect(isValidHexColor("#fff")).toBe(false);
    expect(isValidHexColor("3388ff")).toBe(false);
    expect(isValidHexColor("")).toBe(false);
  });

  it("UAT gap 30 (overturns D-14): resolveTileColorCss falls back to the default translucent wash for null/invalid input", () => {
    expect(resolveTileColorCss(null)).toBe(DEFAULT_TILE_COLOR_CSS);
    expect(resolveTileColorCss("not-a-hex")).toBe(DEFAULT_TILE_COLOR_CSS);
  });

  it("UAT gap 7 + gap 30: any hex colour resolves to a translucent color-mix ending in transparent), never opaque", () => {
    // The three extremes the gap explicitly calls out: pure white, pure
    // black, and a saturated colour at full strength.
    for (const hex of ["#ffffff", "#000000", "#ff0000"]) {
      const css = resolveTileColorCss(hex);
      expect(css).toBe(tileColorCssFromHex(hex));
      expect(css).toMatch(/^color-mix\(.*transparent\)$/);
      expect(css).toContain(hex);
    }
  });

  it("the default (no custom colour) wash never contains a hex literal - token-only", () => {
    expect(DEFAULT_TILE_COLOR_CSS).not.toContain("#");
    expect(DEFAULT_TILE_COLOR_CSS).toMatch(/^color-mix\(.*transparent\)$/);
  });
});

describe("source scan: browser-local only, no hex literals", () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const files = ["keep-hints-pref.ts", "tile-color-pref.ts"];

  it("neither file contains a hex colour literal", () => {
    for (const file of files) {
      const path = join(currentDir, file);
      expect(existsSync(path)).toBe(true);
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
    }
  });

  it("neither file imports room-socket, room-store, or nanoid", () => {
    for (const file of files) {
      const path = join(currentDir, file);
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/room-socket|room-store|nanoid/);
    }
  });

  it("both files route storage access exclusively through safe-storage", () => {
    for (const file of files) {
      const path = join(currentDir, file);
      const source = readFileSync(path, "utf8");
      expect(source).toMatch(/from ["']\.\/safe-storage["']/);
    }
  });
});
