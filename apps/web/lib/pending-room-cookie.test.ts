import { afterEach, describe, expect, it } from "vitest";
import { consumePendingRoomCookie, pendingRoomCookieName } from "./pending-room-cookie";
import { readDisplayName } from "./seat-token";
import { readPendingConfig, readPendingGame } from "./pending-room";

// This project's "web" vitest project runs in a Node (non-jsdom) environment
// (see vitest.config.ts) — writeDisplayName/writePendingGame/writePendingConfig
// need a `window.localStorage` to actually persist, mirroring
// pending-room.test.ts's/seat-token.test.ts's own pattern.
const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow === undefined) {
    // @ts-expect-error -- test-only global cleanup, restoring SSR shape
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
});

function installFakeLocalStorage(): void {
  const store = new Map<string, string>();
  const fake = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  // @ts-expect-error -- constructing a minimal window shape for a Node test environment
  globalThis.window = { localStorage: fake };
}

/** A minimal fake `document` — only `.cookie` is read/written by the module
 * under test, matching its `Pick<Document, "cookie">` parameter. */
function fakeDoc(initial = ""): { cookie: string } {
  return { cookie: initial };
}

function setCookie(doc: { cookie: string }, code: string, value: unknown): void {
  doc.cookie = `${pendingRoomCookieName(code)}=${encodeURIComponent(JSON.stringify(value))}`;
}

describe("consumePendingRoomCookie (D-17)", () => {
  it("with a valid cookie: writes display name (trimmed), pending game and config, expires the cookie, returns true", () => {
    installFakeLocalStorage();
    const code = "AAAAAA";
    const doc = fakeDoc();
    setCookie(doc, code, { gameId: "hanabi", displayName: "  Roger  ", config: "rainbow" });

    const result = consumePendingRoomCookie(code, doc);

    expect(result).toBe(true);
    expect(readDisplayName(code)).toBe("Roger");
    expect(readPendingGame(code)).toBe("hanabi");
    expect(readPendingConfig(code)).toBe("rainbow");
    expect(doc.cookie).toContain("Max-Age=0");
    expect(doc.cookie).toContain(`Path=/room/${code}`);
  });

  it("with a malformed cookie: writes nothing, still expires it, returns false", () => {
    installFakeLocalStorage();
    const code = "BBBBBB";
    const doc = fakeDoc();
    doc.cookie = `${pendingRoomCookieName(code)}=not-valid-json%`;

    const before = readPendingGame(code);
    const result = consumePendingRoomCookie(code, doc);

    expect(result).toBe(false);
    expect(readPendingGame(code)).toBe(before);
    expect(doc.cookie).toContain("Max-Age=0");
  });

  it("with a schema-invalid cookie: writes nothing, still expires it, returns false", () => {
    installFakeLocalStorage();
    const code = "CCCCCC";
    const doc = fakeDoc();
    setCookie(doc, code, { gameId: "expedition", displayName: "Roger", config: "purple" });

    const result = consumePendingRoomCookie(code, doc);

    expect(result).toBe(false);
    expect(readPendingGame(code)).toBeUndefined();
    expect(doc.cookie).toContain("Max-Age=0");
  });

  it("with no cookie: returns false and writes nothing, and does not set one", () => {
    installFakeLocalStorage();
    const code = "DDDDDD";
    const doc = fakeDoc();

    const result = consumePendingRoomCookie(code, doc);

    expect(result).toBe(false);
    expect(doc.cookie).toBe("");
  });

  it("ignores a cookie for another room code", () => {
    installFakeLocalStorage();
    const code = "EEEEEE";
    const otherCode = "FFFFFF";
    const doc = fakeDoc();
    setCookie(doc, otherCode, { gameId: "hanabi", displayName: "Roger", config: "base" });

    const result = consumePendingRoomCookie(code, doc);

    expect(result).toBe(false);
    expect(readPendingGame(code)).toBeUndefined();
    // The other code's cookie is left untouched — only `code`'s own cookie
    // name is ever read or expired.
    expect(doc.cookie).toContain(pendingRoomCookieName(otherCode));
    expect(doc.cookie).not.toContain("Max-Age=0");
  });
});
