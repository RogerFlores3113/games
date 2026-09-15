// Versioned load/save of RoomState with D-17 reset-on-mismatch.
//
// Operates against a narrow injected storage interface rather than
// `ctx.storage` directly, so unit tests use an in-memory Map and the real
// Durable Object (Plan 07) passes `this.ctx.storage`. Nothing Cloudflare-
// specific is imported here.
//
// `schemaVersion` lives under its OWN top-level storage key, read BEFORE
// the room blob is ever touched (RESEARCH.md Pitfall 3). A version mismatch
// means the room resets to an empty lobby WITHOUT deserializing the old
// blob at all — D-17's explicit preference: a friend group can re-click a
// link, a corrupted mid-game state is worse.
//
// WR-08: a room that has never been saved is held in memory only. Loading
// it writes nothing — the first `saveRoom` (the first successful join)
// persists the version and the room together. Otherwise every request for
// an arbitrary room name would burn Free-plan row writes before anyone
// joined.
//
// `loadRoom` is safe to call on EVERY hibernation wake: it only reads and
// returns, and it never arms an alarm. `onStart` (Plan 07) is exactly where
// the tempting mistake of unconditionally calling `setAlarm` lives
// (RESEARCH.md Pitfall 2) — this module gives it nothing to trip on.

import type { RoomState } from "@games/schema";
import { ROOM_SCHEMA_VERSION, RoomStateSchema } from "@games/schema";
import type { TimerEvent } from "./scheduler";

export type RoomStorage = {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  deleteAll(): Promise<void>;
};

export const STORAGE_KEYS = {
  schemaVersion: "schemaVersion",
  room: "room",
  timers: "timers",
} as const;

export type LoadRoomResult = {
  room: RoomState;
  /** True whenever `room` is the fallback rather than persisted state —
   * i.e. nothing for this room is in storage right now. */
  wasReset: boolean;
};

/**
 * Loads persisted room state. Returns the fallback lobby, held in memory
 * only, when nothing has been saved yet (WR-08). Resets to the fallback
 * (D-17) if the stored schema version does not match `ROOM_SCHEMA_VERSION`,
 * or if the room blob fails validation despite a matching version (corrupt
 * storage).
 *
 * Safe to call on every hibernation wake — read-only aside from the reset
 * path, and NEVER arms an alarm. Do not add `setAlarm` here or in any
 * caller that treats this as part of "startup" (RESEARCH.md Pitfall 2).
 */
export async function loadRoom(
  storage: RoomStorage,
  fallback: () => RoomState,
): Promise<LoadRoomResult> {
  const storedVersion = await storage.get<number>(STORAGE_KEYS.schemaVersion);

  if (storedVersion === undefined) {
    // Fresh room: nothing to reset and nothing to write yet.
    return { room: fallback(), wasReset: true };
  }

  if (storedVersion !== ROOM_SCHEMA_VERSION) {
    // Mismatched (old deploy's shape) — do NOT read or parse the room blob
    // at all. Reset unconditionally.
    return resetRoom(storage, fallback);
  }

  const rawRoom = await storage.get<unknown>(STORAGE_KEYS.room);
  const parsed = RoomStateSchema.safeParse(rawRoom);
  if (!parsed.success) {
    // Matching version but unparseable blob: storage is corrupt. Same reset
    // path — D-17 prefers a clean lobby over throwing inside a DO wake.
    return resetRoom(storage, fallback);
  }

  return { room: parsed.data, wasReset: false };
}

/** Wipes the stale room and hands back the in-memory fallback. Nothing is
 * rewritten here: the next wake sees no version and takes the fresh-room
 * path, and the first `saveRoom` persists the new room. */
async function resetRoom(
  storage: RoomStorage,
  fallback: () => RoomState,
): Promise<LoadRoomResult> {
  await storage.deleteAll();
  return { room: fallback(), wasReset: true };
}

/**
 * Persists the schema version, the room blob, and the timer table.
 * Validates `room` with `RoomStateSchema.parse` FIRST (throws on a
 * server-side shape bug) so a malformed write is caught at the write site
 * rather than discovered on a later load.
 */
export async function saveRoom(
  storage: RoomStorage,
  room: RoomState,
  timers: TimerEvent[],
): Promise<void> {
  const validated = RoomStateSchema.parse(room);
  await storage.put(STORAGE_KEYS.schemaVersion, ROOM_SCHEMA_VERSION);
  await storage.put(STORAGE_KEYS.room, validated);
  await storage.put(STORAGE_KEYS.timers, timers);
}

/** Returns the persisted timer table, or `[]` when none has been saved yet. */
export async function loadTimers(storage: RoomStorage): Promise<TimerEvent[]> {
  const timers = await storage.get<TimerEvent[]>(STORAGE_KEYS.timers);
  return timers ?? [];
}
