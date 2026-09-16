// Phase 1 tuning constants. Every discretionary number CONTEXT.md delegated to
// planning (D-02 idle GC, D-07 host-transfer grace, D-12 seat-release grace)
// is fixed HERE as a single named export set. Later plans (04-09) import from
// this file rather than re-deciding any of these values.

/** D-17: persisted room state carries this version. On mismatch, reset to an
 * empty lobby rather than deserializing state written by an incompatible
 * deploy (see RESEARCH.md Pitfall 3 — stored as its own top-level storage
 * key by Plan 06, checked BEFORE parsing the room blob).
 *
 * Bumped to 2 in Phase 2 when the D-15 counter adapter was replaced by the
 * forehead-card toy (RESEARCH.md Pitfall 1): persisted adapterId counter
 * rooms must reset, not deserialize into a different game.
 *
 * Bumped to 3 in Phase 4 when the forehead-card toy adapter was replaced by
 * the real Hanabi engine (D-06): a persisted room carrying toy-shaped `game`
 * state and `adapterId: "forehead-card"` resets to an empty lobby rather
 * than being handed to the Hanabi adapter. */
export const ROOM_SCHEMA_VERSION = 3;

/** D-01: 32 uppercase-safe characters — no `I`, `O`, `0`, `1` — because the
 * room code is read aloud over a voice call. Do not add lowercase. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** D-01: keyspace 32^6 ≈ 1.07e9. */
export const ROOM_CODE_LENGTH = 6;

/** A DIFFERENT, long, unguessable nanoid over nanoid's default 64-character
 * alphabet (~143 bits). Deliberately not the room-code alphabet and
 * deliberately not 6 characters — conflating the two is the RT-07
 * seat-hijack failure mode (see RESEARCH.md Security Domain). */
export const SEAT_TOKEN_LENGTH = 24;

/** ROOM-06, D-10 */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

/** D-02: 1 hour idle for a lobby that never started. */
export const IDLE_GC_LOBBY_MS = 60 * 60 * 1000;

/** D-02: 12 hours idle for a room with a game in progress. */
export const IDLE_GC_IN_PROGRESS_MS = 12 * 60 * 60 * 1000;

/** D-07: host auto-transfers to the next connected seat after 20s
 * disconnected, in the lobby only. Must stay SHORTER than
 * `LOBBY_SEAT_RELEASE_GRACE_MS` (WR-09): the host's seat is released at
 * that deadline, which removes the host_transfer timer with it, so a longer
 * host grace would never run. */
export const HOST_TRANSFER_GRACE_MS = 20_000;

/** D-12: a disconnected lobby seat is freed for someone else after 30s.
 * In-progress seats are NEVER auto-released in this phase. */
export const LOBBY_SEAT_RELEASE_GRACE_MS = 30_000;

/** D-08: WebSocket close code used when a newer tab takes over a seat. */
export const SUPERSEDED_CLOSE_CODE = 4001;

/** D-02 / WR-01: WebSocket close code used when idle GC deletes the room.
 * Terminal for the client — reconnecting would only mint a fresh empty
 * lobby under the same code. */
export const ROOM_ABANDONED_CLOSE_CODE = 4002;

export const MAX_DISPLAY_NAME_LENGTH = 24;
export const MIN_DISPLAY_NAME_LENGTH = 1;
