/**
 * D-05: the seat token is a server-minted bearer credential persisted in
 * `localStorage`, keyed by room code, and replayed on EVERY connect — first
 * join and every reconnect take the same path (RT-03 groundwork).
 *
 * Every function here must be SSR-safe (`typeof window === "undefined"`
 * guard) and must degrade to "no saved seat" rather than crash if
 * `localStorage` throws — Safari private mode and storage-disabled
 * browsers both throw on access, not just on quota exceeded.
 */

/** `room:{code}` — the localStorage key a room's seat token lives under. */
export function seatTokenKey(code: string): string {
  return `room:${code}`;
}

function getLocalStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    return window.localStorage;
  } catch {
    // Private-mode Safari / storage disabled — treat as "no storage".
    return undefined;
  }
}

/** Returns the saved seat token for this room code, or `undefined` if none
 * exists, storage is unavailable, or storage access throws. Never throws. */
export function readSeatToken(code: string): string | undefined {
  const storage = getLocalStorage();
  if (!storage) {
    return undefined;
  }
  try {
    return storage.getItem(seatTokenKey(code)) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Persists a seat token for this room code. No-ops (never throws) if
 * storage is unavailable or access fails. */
export function writeSeatToken(code: string, token: string): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(seatTokenKey(code), token);
  } catch {
    // Degrade to "seat not saved" — the player will re-enter their name
    // on the next visit rather than crash the page.
  }
}

/** Removes a saved seat token for this room code. No-ops on any failure. */
export function clearSeatToken(code: string): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(seatTokenKey(code));
  } catch {
    // No-op — nothing further can be done if storage access itself throws.
  }
}
