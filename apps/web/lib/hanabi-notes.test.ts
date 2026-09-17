import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  NOTE_MAX_LENGTH,
  clearNotesForRoom,
  deleteNote,
  noteKey,
  pruneNotesForSeat,
  readNote,
  writeNote,
} from "./hanabi-notes";

const HANABI_NOTES_PATH = fileURLToPath(new URL("./hanabi-notes.ts", import.meta.url));

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

describe("D-01: hanabi-notes.ts never imports a network path", () => {
  it("imports nothing from room-socket, room-store, or nanoid", () => {
    const source = readFileSync(HANABI_NOTES_PATH, "utf-8");
    expect(source).not.toMatch(/room-socket|room-store|nanoid/);
  });
});

describe("noteKey", () => {
  it('builds "hanabi-note:{room}:{seat}:{card}"', () => {
    expect(noteKey("ABCD", "s1", "c7")).toBe("hanabi-note:ABCD:s1:c7");
  });
});

describe("readNote / writeNote", () => {
  it("returns empty string when absent", () => {
    installFakeLocalStorage();
    expect(readNote("ABCD", "s1", "c7")).toBe("");
  });

  it("round-trips a written note", () => {
    installFakeLocalStorage();
    writeNote("ABCD", "s1", "c7", "chop");
    expect(readNote("ABCD", "s1", "c7")).toBe("chop");
  });

  it(`truncates to NOTE_MAX_LENGTH (${NOTE_MAX_LENGTH})`, () => {
    installFakeLocalStorage();
    const long = "x".repeat(NOTE_MAX_LENGTH + 10);
    writeNote("ABCD", "s1", "c7", long);
    expect(readNote("ABCD", "s1", "c7")).toBe("x".repeat(NOTE_MAX_LENGTH));
    expect(readNote("ABCD", "s1", "c7").length).toBe(NOTE_MAX_LENGTH);
  });

  it("writing an empty string removes the key", () => {
    const storage = installFakeLocalStorage();
    writeNote("ABCD", "s1", "c7", "chop");
    writeNote("ABCD", "s1", "c7", "");
    expect(readNote("ABCD", "s1", "c7")).toBe("");
    expect(storage.getItem(noteKey("ABCD", "s1", "c7"))).toBeNull();
  });

  it("never throws when storage access fails", () => {
    installThrowingLocalStorage();
    expect(() => writeNote("ABCD", "s1", "c7", "chop")).not.toThrow();
    expect(() => readNote("ABCD", "s1", "c7")).not.toThrow();
    expect(readNote("ABCD", "s1", "c7")).toBe("");
  });
});

describe("deleteNote", () => {
  it("removes a single note", () => {
    installFakeLocalStorage();
    writeNote("ABCD", "s1", "c7", "chop");
    deleteNote("ABCD", "s1", "c7");
    expect(readNote("ABCD", "s1", "c7")).toBe("");
  });

  it("never throws when storage access fails", () => {
    installThrowingLocalStorage();
    expect(() => deleteNote("ABCD", "s1", "c7")).not.toThrow();
  });
});

describe("pruneNotesForSeat", () => {
  it("deletes notes for cards no longer live, keeps live cards, other seats, other rooms", () => {
    installFakeLocalStorage();
    writeNote("ABCD", "s1", "c1", "keep");
    writeNote("ABCD", "s1", "c2", "keep");
    writeNote("ABCD", "s1", "c9", "gone");
    writeNote("ABCD", "s2", "c9", "other seat");
    writeNote("WXYZ", "s1", "c9", "other room");

    pruneNotesForSeat("ABCD", "s1", ["c1", "c2"]);

    expect(readNote("ABCD", "s1", "c1")).toBe("keep");
    expect(readNote("ABCD", "s1", "c2")).toBe("keep");
    expect(readNote("ABCD", "s1", "c9")).toBe("");
    expect(readNote("ABCD", "s2", "c9")).toBe("other seat");
    expect(readNote("WXYZ", "s1", "c9")).toBe("other room");
  });

  it("never throws when storage access fails", () => {
    installThrowingLocalStorage();
    expect(() => pruneNotesForSeat("ABCD", "s1", ["c1"])).not.toThrow();
  });
});

describe("clearNotesForRoom", () => {
  it("removes every note key for the room and nothing else", () => {
    installFakeLocalStorage();
    writeNote("ABCD", "s1", "c1", "a");
    writeNote("ABCD", "s2", "c2", "b");
    writeNote("WXYZ", "s1", "c3", "c");

    clearNotesForRoom("ABCD");

    expect(readNote("ABCD", "s1", "c1")).toBe("");
    expect(readNote("ABCD", "s2", "c2")).toBe("");
    expect(readNote("WXYZ", "s1", "c3")).toBe("c");
  });

  it("never throws when storage access fails", () => {
    installThrowingLocalStorage();
    expect(() => clearNotesForRoom("ABCD")).not.toThrow();
  });
});
