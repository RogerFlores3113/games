import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { KEEP_HINTS_KEY, readKeepHintsPref, writeKeepHintsPref } from "./keep-hints-pref";
import {
  TILE_COLOR_KEY,
  TILE_COLOR_PRESETS,
  readTileColorPref,
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
  it("TILE_COLOR_PRESETS has exactly the five expected ids, each with a label and cssValue", () => {
    expect(TILE_COLOR_PRESETS.map((preset) => preset.id)).toEqual([
      "slate",
      "warm-sand",
      "cool-teal",
      "plum",
      "charcoal",
    ]);
    for (const preset of TILE_COLOR_PRESETS) {
      expect(typeof preset.label).toBe("string");
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.cssValue).toMatch(/var\(--color-|color-mix\(/);
    }
  });

  it("readTileColorPref returns slate when nothing is stored", () => {
    installFakeLocalStorage();
    expect(readTileColorPref()).toBe("slate");
  });

  it("readTileColorPref returns slate when the stored id is not a known preset", () => {
    const fake = installFakeLocalStorage();
    fake.setItem(TILE_COLOR_KEY, "not-a-real-preset");
    expect(readTileColorPref()).toBe("slate");
  });

  it("round-trips each known preset id", () => {
    installFakeLocalStorage();
    for (const preset of TILE_COLOR_PRESETS) {
      writeTileColorPref(preset.id);
      expect(readTileColorPref()).toBe(preset.id);
    }
  });

  it("UAT gap 7: every preset's cssValue is a translucent color-mix ending in transparent)", () => {
    for (const preset of TILE_COLOR_PRESETS) {
      expect(preset.cssValue).toMatch(/^color-mix\(.*transparent\)$/);
      expect(preset.cssValue).not.toContain("#");
    }
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
