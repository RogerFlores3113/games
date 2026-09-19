// Phase 1 tuning constants. Every discretionary number CONTEXT.md delegated to
// planning (D-02 idle GC, D-07 host-transfer grace, D-12 seat-release grace)
// is fixed HERE as a single named export set. Later plans (04-09) import from
// this file rather than re-deciding any of these values.
//
// Phase 5 D-04 heartbeat/zombie-sweep timing values are fixed HERE too (see
// the "Phase 5 (D-02/D-03/D-04)" block below) — 05-02/05-03 import them
// rather than re-deciding any of these values.

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
 * than being handed to the Hanabi adapter.
 *
 * Bumped to 4 in Phase 7 plan 10 (owner gap closure, UAT gap 3) when
 * `StackEntry` changed from `{suit, topRank}` to `{suit, playedRanks}`: a
 * persisted pre-change game blob resets to an empty lobby rather than
 * re-entering the engine with a stack shape it no longer understands. */
export const ROOM_SCHEMA_VERSION = 4;

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

/** Owner request (2026-09-18): every room — lobby, in-progress, or ended —
 * is garbage-collected 24 hours after its LAST ACTIVITY, never from
 * creation. `computeRoomTimers` (scheduler.ts) derives `idle_gc` from
 * `state.lastActivityAt` for every status, so an ended room with nobody
 * watching the end screen is swept exactly like an idle lobby. WR-02 still
 * holds: a room with a live seated socket is never idle (`deferIdleGc`
 * restarts this clock from `now`), so an active game is never deleted
 * mid-play. Previously 1 hour (lobby) / 12 hours (in-progress); both
 * collapsed into one 24-hour constant used for every status. */
export const IDLE_GC_LOBBY_MS = 24 * 60 * 60 * 1000;

/** See `IDLE_GC_LOBBY_MS` — kept as a distinct export (rather than deleting
 * it and inlining one constant) so `scheduler.ts`'s per-status branch and
 * any caller that still imports both names by status keeps compiling; both
 * now resolve to the same 24-hour window. */
export const IDLE_GC_IN_PROGRESS_MS = 24 * 60 * 60 * 1000;

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

// Phase 5 (D-02/D-03/D-04): hibernation-safe heartbeat and zombie-sweep
// timing. These are raw, non-JSON text frames answered by the Durable
// Object's setWebSocketAutoResponse — they sit outside ClientMessageSchema/
// ServerMessageSchema, carry no state, and must match byte-for-byte (D-02,
// RESEARCH.md Pitfall 2), so JSON.stringify must never be applied to them.

/** D-02: raw ping literal the client sends on its heartbeat interval.
 * Answered by the runtime's setWebSocketAutoResponse without waking the DO
 * or invoking onMessage — never JSON.stringify'd, never routed through
 * #send. Must byte-for-byte match the registered request literal. */
export const HEARTBEAT_PING = "__ping__";

/** D-02: raw pong literal the runtime answers HEARTBEAT_PING with. Never
 * constructed by application code — the Cloudflare runtime emits this
 * directly via setWebSocketAutoResponse. */
export const HEARTBEAT_PONG = "__pong__";

/** D-04: client ping cadence while the tab is visible. Chosen so a dead
 * half-open socket is detected well within "about a minute" once combined
 * with HEARTBEAT_PONG_TIMEOUT_MS and SOCKET_STALE_MS below. */
export const HEARTBEAT_INTERVAL_MS = 20_000;

/** D-04: if no pong (or any other frame) arrives within this long after a
 * ping, the client force-reconnects rather than trusting a half-open
 * socket. Deliberately shorter than HEARTBEAT_INTERVAL_MS so a single
 * missed pong is caught before the next ping would even go out. */
export const HEARTBEAT_PONG_TIMEOUT_MS = 10_000;

/** D-04: server-side threshold against getWebSocketAutoResponseTimestamp — a
 * seated socket with no auto-response/bind within this long is a zombie.
 * Chrome's intensive throttling fires hidden-tab chained timers at most
 * once per minute, so a threshold <= 60s would falsely disconnect a
 * desktop player who alt-tabbed to the voice call; 75s is the smallest
 * value with margin, giving teammates "disconnected" in 75-90s ("about a
 * minute", D-04's intent). */
export const SOCKET_STALE_MS = 75_000;

/** D-03/D-04: grid step for the alarm-driven zombie_sweep timer (05-02).
 * Re-derived on every computeRoomTimers call; the actual staleness
 * decision happens at sweep time against the live auto-response
 * timestamp, not against whether the alarm "fired on schedule"
 * (RESEARCH.md Pitfall 3). */
export const ZOMBIE_SWEEP_INTERVAL_MS = 15_000;

/** D-03: WebSocket close code used when the zombie sweep closes a stale
 * socket. Deliberately NON-terminal — unlike SUPERSEDED_CLOSE_CODE/
 * ROOM_ABANDONED_CLOSE_CODE, a socket closed by a false-positive sweep must
 * reconnect on its own, so this code must never be added to
 * isTerminalCloseCode. */
export const STALE_SOCKET_CLOSE_CODE = 4003;
