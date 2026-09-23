import { CreateRoomRequestSchema } from "@games/schema";
import { writeDisplayName } from "./seat-token";
import { writePendingConfig, writePendingGame } from "./pending-room";

/**
 * D-17: the short-lived hand-off cookie `/api/room`'s native form path sets
 * (`pending_room_{code}`, scoped to `Path=/room/{code}`, `Max-Age=120`) so a
 * pre-hydration create never touches the shareable room link. Read exactly
 * once, on the room page's mount, and always expired immediately after —
 * whether or not it parsed — so it can never be replayed or linger past the
 * page load that consumed it.
 */

/** `pending_room_{code}` */
export function pendingRoomCookieName(code: string): string {
  return `pending_room_${code}`;
}

function readRawCookie(name: string, doc: Pick<Document, "cookie">): string | undefined {
  const cookies = doc.cookie ? doc.cookie.split("; ") : [];
  for (const entry of cookies) {
    const eq = entry.indexOf("=");
    if (eq === -1) continue;
    if (entry.slice(0, eq) === name) {
      return entry.slice(eq + 1);
    }
  }
  return undefined;
}

function expireCookie(code: string, doc: Pick<Document, "cookie">): void {
  try {
    doc.cookie = `${pendingRoomCookieName(code)}=; Path=/room/${code}; Max-Age=0`;
  } catch {
    // No-op — nothing further can be done if cookie access itself throws.
  }
}

/** Reads and consumes the `pending_room_{code}` cookie: on a schema-valid
 * cookie, writes the display name (trimmed), pending game and pending
 * config for `code` and returns `true`. On a missing, malformed or
 * schema-invalid cookie, writes nothing and returns `false`. Either way,
 * always expires the cookie (same `Path`) when one was present. SSR-safe
 * (returns `false` when `document` is undefined) and never throws. */
export function consumePendingRoomCookie(
  code: string,
  doc: Pick<Document, "cookie"> = typeof document === "undefined" ? ({ cookie: "" } as Document) : document,
): boolean {
  let raw: string | undefined;
  try {
    raw = readRawCookie(pendingRoomCookieName(code), doc);
  } catch {
    return false;
  }
  if (raw === undefined) {
    return false;
  }
  // Always expire once a cookie was present, whether or not it turns out to
  // be valid — it is never replayed either way.
  expireCookie(code, doc);
  try {
    const json: unknown = JSON.parse(decodeURIComponent(raw));
    const parsed = CreateRoomRequestSchema.safeParse(json);
    if (!parsed.success) {
      return false;
    }
    writeDisplayName(code, parsed.data.displayName.trim());
    writePendingGame(code, parsed.data.gameId);
    writePendingConfig(code, parsed.data.config);
    return true;
  } catch {
    return false;
  }
}
