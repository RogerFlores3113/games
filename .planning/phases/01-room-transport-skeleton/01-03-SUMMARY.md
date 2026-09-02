---
phase: 01-room-transport-skeleton
plan: 03
subsystem: schema
tags: [zod, wire-protocol, branded-types, room-state, security-boundary]

# Dependency graph
requires:
  - phase: 01-room-transport-skeleton
    provides: "npm-workspaces monorepo skeleton, packages/schema workspace package depending only on zod@4.5.4"
provides:
  - "packages/schema/src/constants.ts: every phase tuning constant (schema version, room-code alphabet/length, seat-token length, player bounds, GC/grace-period timings, superseded close code, display-name bounds)"
  - "packages/schema/src/room.ts: branded RoomCode/SeatToken schemas, persisted Seat/RoomState schemas, independently-declared client-facing PublicSeat/RoomView types, RefusalReason enum"
  - "packages/schema/src/messages.ts: closed, strict, non-throwing ClientMessage/ServerMessage discriminated unions plus parseClientMessage/encodeServerMessage"
affects: [01-04-worker-wiring, 01-05-reconnect, 01-06-room-durable-object, 01-07, 01-08, 01-09-lobby-and-game-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Room code and seat token are two distinct z.brand()-ed string schemas (RoomCode vs SeatToken) — assigning one where the other is expected is a TS2322 compile error, proven by a @ts-expect-error test, not just a naming convention"
    - "Client-facing view schemas (PublicSeat, RoomView) are declared as their OWN z.object() literals, never derived via .omit() from the persisted schemas — a field added later to SeatSchema/RoomStateSchema (including seatToken) cannot leak into the wire by default"
    - "parseClientMessage(raw: string) never throws: JSON.parse wrapped in try/catch, then ClientMessageSchema.safeParse — this is the sole entry gate the Durable Object's onMessage calls, and an escaping exception would tear down every connection in the room"
    - "encodeServerMessage validates with ServerMessageSchema.parse before stringifying, so a server-side shape bug is caught at the send site"
    - "z.strictObject() (not the default z.object(), which strips unknown keys silently) is required to reject rather than silently drop unrecognized keys on every message variant"

key-files:
  created:
    - packages/schema/src/constants.ts
    - packages/schema/src/room.ts
    - packages/schema/src/room.test.ts
    - packages/schema/src/messages.ts
    - packages/schema/src/messages.test.ts
  modified:
    - packages/schema/src/index.ts

key-decisions:
  - "Task 1 and Task 2 commits keep index.ts re-exporting only what exists at that point in the sequence (constants+room, then +messages) so each task's commit is independently buildable rather than referencing a not-yet-committed messages.ts"
  - "SeatTokenSchema/RoomCodeSchema use zod4's z.brand<'Tag'>() rather than a hand-rolled nominal-typing trick — it is the library-native mechanism and composes directly with z.infer<>"
  - "z.strictObject() used for every message variant (not z.object().strict() chained, functionally identical but the direct constructor is zod4's documented idiom) to reject unknown keys before dispatch (ASVS V5)"

requirements-completed: [ROOM-02, ROOM-05, ROOM-07, RT-07]

# Metrics
duration: ~12min
completed: 2026-09-02
---

# Phase 1 Plan 3: Room & Transport Skeleton — Wire Protocol & Room-State Schema Summary

**Defined the entire client<->server wire protocol (5 client message types, 5 server message types) as one closed, strict, non-throwing Zod discriminated union, and the persisted room/seat state shape with a `z.brand()`-enforced compile-time wall between the speakable 6-char room code and the 24-char unguessable seat token — the RT-07 seat-hijack boundary made a build failure, not a code-review reminder.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-09-02T07:56:09Z
- **Tasks:** 2 (both auto)
- **Files modified:** 6 (5 created, 1 modified)

## Accomplishments
- `packages/schema/src/constants.ts` centralizes every phase 1 tuning number CONTEXT.md delegated to planning discretion (D-02, D-07, D-12 timings) as the single source later plans (04-09) import from
- `RoomCodeSchema` and `SeatTokenSchema` are distinct `z.brand()`-ed types with different lengths (6 vs 24), different alphabets (32-char speakable vs nanoid's 64-char default), proven mutually non-assignable by a `@ts-expect-error` compile-time test
- `PublicSeatSchema`/`RoomViewSchema` are declared independently of the persisted `SeatSchema`/`RoomStateSchema` (never `.omit()`), verified by a test that parses input containing `seatToken`/`displayName` and asserts the output key set is exactly `["seatId","displayLabel","connected","isHost"]`
- `ClientMessageSchema`/`ServerMessageSchema` are `z.discriminatedUnion("type", ...)` over `z.strictObject()` members — unknown keys are rejected outright, verified by a test asserting a `join` message carrying a client-asserted `seatId` is rejected
- `parseClientMessage` is proven never to throw across 200 fast-check-generated arbitrary strings, and `encodeServerMessage` is proven to reject a malformed server message at the send site rather than let it reach the wire
- `seatToken` confirmed by test to appear in exactly the `join` client message and the `joined` server message — no other server message variant leaks it

## Task Commits

Each task was committed atomically:

1. **Task 1: Declare every phase constant and the room/seat state schemas** — `08bf4ce` (feat)
2. **Task 2: Define the client<->server message protocol as closed Zod unions** — `6f283f4` (feat)

## Files Created/Modified
- `packages/schema/src/constants.ts` — `ROOM_SCHEMA_VERSION`, `ROOM_CODE_ALPHABET`/`ROOM_CODE_LENGTH`, `SEAT_TOKEN_LENGTH`, `MIN_PLAYERS`/`MAX_PLAYERS`, `IDLE_GC_LOBBY_MS`/`IDLE_GC_IN_PROGRESS_MS`, `HOST_TRANSFER_GRACE_MS`, `LOBBY_SEAT_RELEASE_GRACE_MS`, `SUPERSEDED_CLOSE_CODE`, display-name length bounds
- `packages/schema/src/room.ts` — `VariantSchema`, `RoomStatusSchema`, `RefusalReasonSchema`, branded `RoomCodeSchema`/`SeatTokenSchema`, `DisplayNameSchema`, persisted `SeatSchema`/`RoomStateSchema`, client-facing `PublicSeatSchema`/`RoomViewSchema`
- `packages/schema/src/room.test.ts` — constant-value assertions, room-code accept/reject cases (lowercase, excluded letter, wrong length), seat-token length, `PublicSeatSchema` exact-key-set proof, `@ts-expect-error` brand-assignability test
- `packages/schema/src/messages.ts` — `ClientMessageSchema`/`ServerMessageSchema` discriminated unions, `parseClientMessage`, `encodeServerMessage`
- `packages/schema/src/messages.test.ts` — strict-mode rejection, seat-id-assertion rejection, `game_action` arbitrary-payload acceptance, fast-check non-throwing property (200 runs), `seatToken` containment proof, union member-count assertions
- `packages/schema/src/index.ts` — re-exports `constants`, `room`, and `messages` alongside `SCHEMA_SMOKE`

## Wire Protocol Reference (for Plans 04-09)

```ts
type ClientMessage =
  | { type: "join"; displayName: DisplayName; seatToken?: SeatToken }
  | { type: "set_variant"; variant: Variant }
  | { type: "start_game" }
  | { type: "game_action"; request: unknown }
  | { type: "leave" };

type ServerMessage =
  | { type: "joined"; seatId: string; seatToken: SeatToken; view: RoomView }
  | { type: "state"; view: RoomView }
  | { type: "refused"; reason: RefusalReason }
  | { type: "superseded" }
  | { type: "error"; code: RefusalReason; detail?: string };

type RefusalReason = "full" | "in_progress" | "invalid_name" | "not_host" | "not_seated" | "bad_request";
```

## Constants Reference (for Plans 04-09)

`ROOM_SCHEMA_VERSION=1`, `ROOM_CODE_LENGTH=6`, `SEAT_TOKEN_LENGTH=24`, `MIN_PLAYERS=2`, `MAX_PLAYERS=5`, `IDLE_GC_LOBBY_MS=3_600_000`, `IDLE_GC_IN_PROGRESS_MS=43_200_000`, `HOST_TRANSFER_GRACE_MS=45_000`, `LOBBY_SEAT_RELEASE_GRACE_MS=30_000`, `SUPERSEDED_CLOSE_CODE=4001`, `MAX_DISPLAY_NAME_LENGTH=24`, `MIN_DISPLAY_NAME_LENGTH=1`.

## Decisions Made
- **Sequenced `index.ts` re-exports to match task order.** Task 1's commit re-exports only `constants`+`room` (matching that task's `files_modified`); Task 2's commit adds the `messages` re-export. Keeps each task's commit independently checkoutable/buildable rather than Task 1's commit referencing a not-yet-created `messages.ts`.
- **`z.brand()` for nominal typing, zod4's native mechanism**, rather than a hand-rolled tagged-type pattern — composes directly with `z.infer<>` per the project's shared-types strategy (CLAUDE.md).
- **`z.strictObject()`** used for every message variant to reject (not silently strip) unknown keys before dispatch, satisfying ASVS V5 / threat T-1-03.

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria (constant values, room-code accept/reject cases, `PublicSeatSchema` exact key set, brand non-assignability, `SCHEMA_SMOKE` survival, discriminated-union count, seat-id-assertion rejection, fast-check non-throwing property, `seatToken` containment) verified directly against the plan's own `<verify>`/`<acceptance_criteria>` blocks.

## Issues Encountered

None.

## Next Phase Readiness

- `@games/schema` now exports the full wire protocol and room/seat state contract; Plan 04 (worker wiring the counter game through `partyserver`) and Plan 07 (the real Durable Object) can import `ClientMessageSchema`/`ServerMessageSchema`/`parseClientMessage`/`encodeServerMessage`/`RoomStateSchema`/`RoomViewSchema` directly.
- `packages/rules`' locally-duplicated `Variant` type (Plan 02) can now be checked for mutual assignability against `@games/schema`'s canonical `VariantSchema`-derived `Variant` — noted in Plan 02's summary as deferred to a later plan.
- Test command for downstream plans: `npx vitest run --project schema`.

---
*Phase: 01-room-transport-skeleton*
*Completed: 2026-09-02*

## Self-Check: PASSED
All 6 created/modified files verified present on disk. Both commit hashes (08bf4ce, 6f283f4) verified in git log.
