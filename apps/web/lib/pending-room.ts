import { GameIdSchema, type GameId, type RoomView } from "@games/schema";
import { seatTokenKey } from "./seat-token";

/**
 * D-02: the game and variant/config a creator picked on the landing page.
 * `/api/room` only mints a code and the Durable Object always starts a room
 * on the default game/config, so both choices are carried here and applied
 * by the host's own client — the pending game rides the first `join` frame
 * as `gameId` (D-01, honoured only on the room's very first join), and the
 * pending config is applied afterward through the ordinary `set_config`
 * message (D-04), right after that first join. The server stays
 * authoritative: a non-host, a later join, or a started room is refused or
 * ignored there.
 *
 * SSR-safe and never throws, like `seat-token.ts`.
 */

/** `room:{code}:game` */
export function pendingGameKey(code: string): string {
  return `${seatTokenKey(code)}:game`;
}

/** `room:{code}:config` */
export function pendingConfigKey(code: string): string {
  return `${seatTokenKey(code)}:config`;
}

function getLocalStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** The pending game (D-02), or `undefined` if none is stored, storage is
 * unavailable, or the stored value is not a registered `GameId`. Never
 * throws. */
export function readPendingGame(code: string): GameId | undefined {
  const storage = getLocalStorage();
  if (!storage) {
    return undefined;
  }
  try {
    const parsed = GameIdSchema.safeParse(storage.getItem(pendingGameKey(code)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Persists the chosen game for this room code. No-ops (never throws) if
 * storage is unavailable or access fails. */
export function writePendingGame(code: string, gameId: GameId): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(pendingGameKey(code), gameId);
  } catch {
    // Degrade to the room's default game — D-01's first-join server default
    // still applies even if this client never sends a gameId.
  }
}

/** Removes the stored pending game for this room code. No-ops on any
 * failure. */
export function clearPendingGame(code: string): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(pendingGameKey(code));
  } catch {
    // No-op.
  }
}

/** The pending config (opaque — never validated against a game schema on
 * the client; the server's `set_config` is the fail-closed authority, D-04),
 * or `undefined` if none is stored, storage is unavailable, or the stored
 * value fails to parse as JSON. Never throws. */
export function readPendingConfig(code: string): unknown {
  const storage = getLocalStorage();
  if (!storage) {
    return undefined;
  }
  try {
    const raw = storage.getItem(pendingConfigKey(code));
    if (raw === null) {
      return undefined;
    }
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** Persists the pending config for this room code. No-ops (never throws) if
 * storage is unavailable or access fails. */
export function writePendingConfig(code: string, config: unknown): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(pendingConfigKey(code), JSON.stringify(config));
  } catch {
    // Degrade to the room's default config — the host can still pick in the
    // lobby.
  }
}

/** Removes the stored pending config for this room code. No-ops on any
 * failure. */
export function clearPendingConfig(code: string): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(pendingConfigKey(code));
  } catch {
    // No-op.
  }
}

/** The config the host's client should request now, or `null` when there is
 * nothing to do: nothing pending, the game hasn't started's lobby has
 * already moved on, this viewer is not the host, or the room is already on
 * that config. */
export function configToApply(view: RoomView, pending: unknown): unknown | null {
  if (pending === undefined) return null;
  if (view.status !== "lobby") return null;
  if (view.youSeatId !== view.hostSeatId) return null;
  if (JSON.stringify(view.config) === JSON.stringify(pending)) return null;
  return pending;
}
