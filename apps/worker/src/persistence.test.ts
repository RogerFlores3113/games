import { describe, expect, it } from "vitest";
import type { RoomCode, RoomState } from "@games/schema";
import { ROOM_SCHEMA_VERSION } from "@games/schema";
import { loadRoom, loadTimers, saveRoom, STORAGE_KEYS } from "./persistence";
import type { RoomStorage } from "./persistence";
import type { TimerEvent } from "./scheduler";

const ROOM_CODE = "ABCDEF" as RoomCode;

function fallbackRoom(): RoomState {
  return {
    code: ROOM_CODE,
    variant: "base",
    status: "lobby",
    hostSeatId: null,
    seats: [],
    adapterId: "counter",
    game: null,
    createdAt: 0,
    lastActivityAt: 0,
  };
}

/**
 * In-memory Map-backed fake storage instrumented to record every `get` call
 * by key, so tests can assert an old blob was never even read (D-17).
 */
function makeFakeStorage() {
  const map = new Map<string, unknown>();
  const getCalls: string[] = [];

  const storage: RoomStorage = {
    async get<T>(key: string): Promise<T | undefined> {
      getCalls.push(key);
      return map.get(key) as T | undefined;
    },
    async put(key: string, value: unknown): Promise<void> {
      map.set(key, value);
    },
    async delete(key: string): Promise<boolean> {
      return map.delete(key);
    },
    async deleteAll(): Promise<void> {
      map.clear();
    },
  };

  return { storage, map, getCalls };
}

describe("loadRoom: fresh storage", () => {
  it("WR-08: returns the fallback room in memory with wasReset: true and performs NO storage writes", async () => {
    const { storage, map } = makeFakeStorage();
    let writes = 0;
    const counting: RoomStorage = {
      ...storage,
      async put(key, value) {
        writes++;
        return storage.put(key, value);
      },
      async deleteAll() {
        writes++;
        return storage.deleteAll();
      },
    };

    const result = await loadRoom(counting, fallbackRoom);

    expect(result.wasReset).toBe(true);
    expect(result.room).toEqual(fallbackRoom());
    // A request for a room nobody has joined yet must not burn row writes.
    expect(writes).toBe(0);
    expect(map.size).toBe(0);
  });
});

describe("saveRoom + loadRoom: round trip", () => {
  it("WR-08: the first saveRoom persists ROOM_SCHEMA_VERSION, so the next load does not reset", async () => {
    const { storage, map } = makeFakeStorage();
    const room = { ...fallbackRoom(), lastActivityAt: 42 };

    await saveRoom(storage, room, []);

    expect(map.get(STORAGE_KEYS.schemaVersion)).toBe(ROOM_SCHEMA_VERSION);
    const result = await loadRoom(storage, fallbackRoom);
    expect(result.wasReset).toBe(false);
    expect(result.room).toEqual(room);
  });

  it("returns wasReset: false and a deep-equal room after a save", async () => {
    const { storage } = makeFakeStorage();
    // Seed a valid version + room via a normal reset/save cycle first.
    await loadRoom(storage, fallbackRoom);

    const timers: TimerEvent[] = [{ type: "idle_gc", dueAt: 12345 }];
    const room = { ...fallbackRoom(), lastActivityAt: 999 };
    await saveRoom(storage, room, timers);

    const result = await loadRoom(storage, fallbackRoom);
    expect(result.wasReset).toBe(false);
    expect(result.room).toEqual(room);

    const loadedTimers = await loadTimers(storage);
    expect(loadedTimers).toEqual(timers);
  });
});

describe("D-17: version mismatch resets without reading the old blob", () => {
  it("D-17: version mismatch resets without reading the old blob", async () => {
    const { storage, map, getCalls } = makeFakeStorage();
    map.set(STORAGE_KEYS.schemaVersion, 0);
    map.set(STORAGE_KEYS.room, {
      thisKeyDoesNotExist: true,
      anotherGarbageKey: [1, 2, 3],
    });
    getCalls.length = 0; // reset the instrumentation after seeding

    const result = await loadRoom(storage, fallbackRoom);

    expect(result.wasReset).toBe(true);
    expect(result.room).toEqual(fallbackRoom());
    expect(result.room.seats).toHaveLength(0);
    expect(getCalls).not.toContain(STORAGE_KEYS.room);
    // The stale blob is wiped; the fresh lobby is persisted on its first save.
    expect(map.has(STORAGE_KEYS.room)).toBe(false);
  });
});

describe("corrupt-but-versioned storage", () => {
  it("returns wasReset: true rather than throwing when the room blob fails RoomStateSchema", async () => {
    const { storage, map } = makeFakeStorage();
    map.set(STORAGE_KEYS.schemaVersion, ROOM_SCHEMA_VERSION);
    map.set(STORAGE_KEYS.room, { garbage: "not a room" });

    const result = await loadRoom(storage, fallbackRoom);

    expect(result.wasReset).toBe(true);
    expect(result.room).toEqual(fallbackRoom());
  });
});

describe("idempotent wake", () => {
  it("calling loadRoom three times in a row on a healthy room returns identical results and performs no writes after the first", async () => {
    const { storage, map } = makeFakeStorage();
    await saveRoom(storage, fallbackRoom(), []); // first save establishes the room

    const snapshotBefore = new Map(map);
    const results = [];
    for (let i = 0; i < 3; i++) {
      results.push(await loadRoom(storage, fallbackRoom));
    }

    for (const r of results) {
      expect(r.wasReset).toBe(false);
      expect(r.room).toEqual(fallbackRoom());
    }
    expect(map).toEqual(snapshotBefore);
  });
});

describe("saveRoom with a malformed room", () => {
  it("throws before writing anything, leaving storage unchanged", async () => {
    const { storage, map } = makeFakeStorage();
    await loadRoom(storage, fallbackRoom);
    const snapshotBefore = new Map(map);

    const malformed = { not: "a room" } as unknown as RoomState;

    await expect(saveRoom(storage, malformed, [])).rejects.toThrow();
    expect(map).toEqual(snapshotBefore);
  });
});
