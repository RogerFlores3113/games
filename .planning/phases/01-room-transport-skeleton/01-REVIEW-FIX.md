---
phase: 01-room-transport-skeleton
fixed_at: 2026-09-15T17:30:00Z
review_path: .planning/phases/01-room-transport-skeleton/01-REVIEW.md
iteration: 1
findings_in_scope: 12
fixed: 12
skipped: 0
status: all_fixed
---

# Phase 1: Code Review Fix Report

**Fixed at:** 2026-09-15T17:30:00Z
**Source review:** .planning/phases/01-room-transport-skeleton/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 12 (3 Critical, 9 Warning; Info out of scope)
- Fixed: 12
- Skipped: 0

Every finding checked out against the code; none were wrong. Each fix started with a regression test that failed, then the fix. For CR-01, both halves of the test failed before the fix: the seat showed `connected: false`, and past the 30s grace the alarm deleted the seat (`set_variant` returned `error`).

**Final verification** (in the isolated worktree, at the final commit):
- `npx vitest run`: 22 files, 195 tests passed (baseline was 158)
- `npm run build:worker`: passed (wrangler dry-run)
- `npm run build:web`: passed
- `npx playwright test` against local dev servers: 13/13 passed. It ran with `CI=1` so it could not reuse a stale server, and without `PLAYWRIGHT_BASE_URL`.
- `tsc --noEmit` passed for `apps/worker` and `apps/web`.
- Nothing was deployed or pushed.

## Fixed Issues

### CR-01: A superseded or stale connection's `onClose` marks the live seat disconnected, and the lobby then releases it

**Files modified:** `apps/worker/src/room-do.ts`, `apps/worker/src/room-do.test.ts`
**Commit:** 2d6938a
**Applied fix:**
- `#handleJoin` calls `superseded.setState(null)` before sending `superseded` and closing.
- `onClose` returns early when `this.bindings` shows a different live connection holding the seat. This also covers the half-dead-socket reconnect race.
- Replaced the incorrect "cannot clobber a newer connection" comment.
- New integration test: join, reclaim from a second socket, and wait for the close. It asserts every frame shows the seat `connected: true`. It then waits past `LOBBY_SEAT_RELEASE_GRACE_MS` and asserts that the survivor is still host and still connected.

### CR-02: A non-canonical room code in the URL makes every write throw, and the client hangs forever on "Connecting…"

**Files modified:** `apps/web/lib/room-code.ts`, `apps/web/lib/room-code.test.ts`, `apps/web/app/room/[code]/page.tsx`, `apps/worker/src/index.ts`, `apps/worker/src/index.test.ts` (new)
**Commit:** 0812bf1
**Applied fix:**
- A new pure `parseRoomCodeParam` classifies the URL segment as ok, redirect, or invalid.
- `RoomPage` redirects lowercase codes to uppercase and calls `notFound()` for anything else. `generateMetadata` uses the same parse.
- The Worker returns 404 for any `/parties/<party>/<name>` whose decoded name fails `RoomCodeSchema`, including malformed `%` escapes. This happens before `routePartykitRequest`, so no Durable Object is created.

### CR-03: `leave` is accepted during a game, which removes a seat the game still has in its turn order and stalls the game permanently

**Files modified:** `apps/worker/src/room-state.ts`, `apps/worker/src/room-state.test.ts`, `apps/worker/src/room-do.ts`, `apps/worker/src/room-do.test.ts` (plus the WR-09 files below)
**Commit:** 36c420f (shared with WR-09)
**Applied fix:**
- `releaseSeat` now returns a `RoomResult` and refuses outside the lobby with `bad_request`. The guard lives in the pure function, not only at the call site.
- The `leave` handler replies `error` and leaves the attachment alone.
- `onAlarm`'s `seat_release` branch drops a refused release, as defense in depth.
- Tests: a unit refusal test, plus an integration test where a mid-game `leave` is refused and the next turn still passes to that seat.

### WR-01: An idle-GC'd room brings itself back through `onClose` and re-arms its alarm

**Files modified:** `packages/schema/src/constants.ts`, `apps/worker/src/room-do.ts`, `apps/web/lib/close-codes.ts` (new), `apps/web/lib/close-codes.test.ts` (new), `apps/web/lib/room-socket.ts`, `apps/web/lib/room-store.ts`, `apps/web/app/room/[code]/RoomClient.tsx`
**Commit:** 0dcb0fe
**Status:** fixed: requires human verification
**Applied fix:**
- New `ROOM_ABANDONED_CLOSE_CODE = 4002`. Idle GC clears each connection's attachment before closing it with 4002.
- `onClose` returns early when nothing is persisted or the seat no longer exists, so a close can never write a fresh room back.
- The client never reconnects after 4001 or 4002. On 4002 it clears the dead seat token and shows "This room closed after sitting idle."
- The client's terminal-code decision is unit-tested. The server GC path only fires after an hour idle, so no automated test covers it. Verification there is typecheck plus the existing integration suite.

### WR-02: A lobby with connected players is deleted after 1 hour with no state changes

**Files modified:** `apps/worker/src/room-state.ts`, `apps/worker/src/room-state.test.ts`, `apps/worker/src/room-do.ts`
**Commit:** 2c0d2a7
**Status:** fixed: requires human verification
**Applied fix:**
- When `idle_gc` comes due while any seated socket is open, `onAlarm` calls the new pure `deferIdleGc` instead of deleting the room. `deferIdleGc` restarts `lastActivityAt`, so the room is re-checked an hour later.
- **Deviation from the review's suggestion:** the check reads the DO's actual open sockets, not the persisted `connected` flags. A flag left stale by a missed close could otherwise keep a room, and its storage, alive forever.
- `setVariant` now takes `now` and updates `lastActivityAt`.
- `deferIdleGc` and `setVariant` are unit-tested. The DO branch needs an hour to fire, so no automated test covers it.

### WR-03: A second `join` on an already-seated connection leaves a ghost seat that never releases

**Files modified:** `apps/worker/src/room-do.ts`, `apps/worker/src/room-do.test.ts`
**Commit:** 13f05bc
**Applied fix:**
- `#handleJoin` replies `error bad_request` when the connection's attachment already holds a seat that still exists.
- Integration test: before the fix, a second `join` minted a "Mallory" ghost seat. It is now refused, and the next joiner sees exactly `["Alice", "Bob"]`.

### WR-04: The variant chosen when creating a room is silently discarded

**Files modified:** `apps/web/lib/pending-variant.ts` (new), `apps/web/lib/pending-variant.test.ts` (new), `apps/web/app/page.tsx`, `apps/web/app/room/[code]/RoomClient.tsx`, `e2e/create-room.spec.ts`
**Commit:** 2fcee18
**Applied fix:**
- The create flow stores the chosen variant under `room:{code}:variant`.
- On the first seated view, `ConnectedRoom` sends a single `set_variant` when the pure `variantToApply` says it's needed: the viewer is host, the room is in the lobby, and the variant still differs. It clears the pending value either way. The server stays authoritative.
- Unit tests cover the decision and the storage. `create-room.spec.ts` now also asserts that a room created with Rainbow shows Rainbow selected in the lobby.

### WR-05: Server `error` frames are ignored, so a rejected `join` leaves the client stuck on "Connecting…" and retrying forever

**Files modified:** `apps/web/lib/room-store.ts`, `apps/web/lib/room-store.test.ts`, `apps/web/lib/seat-token.ts`, `apps/web/lib/seat-token.test.ts`, `apps/web/lib/room-socket.ts`, `apps/web/app/room/[code]/RoomClient.tsx`, `apps/web/components/JoinForm.tsx`
**Commit:** ce7dbf4 (shared with WR-06)
**Status:** fixed: requires human verification (the RoomClient fallback flow has no dedicated e2e test)
**Applied fix:**
- An `error` frame that arrives while `status === "joining"` now sets the new `join_failed` status and `joinError`. Errors after seating are still ignored.
- The socket stops reconnecting. `RoomClient` resets the store, clears the stored name, and shows `JoinForm` with an error message.
- `readJoinSeatToken` validates the stored token with `SeatTokenSchema`, and drops and clears a malformed one before sending.
- **Deviation from the review's suggestion:** the seat token is not cleared on a failed join. It was already validated before sending, so it cannot be the cause of the rejection. Keeping it lets the player re-enter a name and still reclaim the seat.

### WR-06: Joiners' names are never persisted, so a lobby seat released after a sleeping tab rejoins as "Player"

**Files modified:** `apps/web/lib/seat-token.ts`, `apps/web/lib/seat-token.test.ts`, `apps/web/app/page.tsx`, `apps/web/app/room/[code]/RoomClient.tsx`
**Commit:** ce7dbf4 (shared with WR-05)
**Applied fix:**
- The name is now kept in localStorage under `room:{code}:displayName` by both the create flow and `JoinForm`, and validated with `DisplayNameSchema` on read.
- The old sessionStorage key is still read as a fallback, for tabs opened before the deploy.
- **Partial by choice:** the review's second suggestion was to show `JoinForm` when the server mints a different seat than the stored token implied. It was not implemented. With the name persisted, that new seat already gets the right name. Showing the form after the join would leave a ghost seat. The only remaining "Player" case is a token-only legacy entry from before this change.

### WR-07: The game seed is the public room code, which will leak the deck order once the Hanabi shuffle uses it

**Files modified:** `apps/worker/src/seat-identity.ts`, `apps/worker/src/seat-identity.test.ts`, `apps/worker/src/room-state.ts`, `apps/worker/src/room-state.test.ts`, `packages/schema/src/room.ts`, `apps/worker/src/room-do.ts`
**Commit:** e7695b9
**Applied fix:**
- New `mintGameSeed()`: 128 bits from `crypto.getRandomValues`, hex-encoded. `start_game` passes it instead of `this.name`.
- `startGame` persists it as `RoomState.seed`. The field is optional, so rooms persisted before this change still parse without a version bump. It has no field in `RoomViewSchema`.
- A test asserts that the seed never appears in any seat's `toSeatView` JSON.
- No Hanabi code was added.

### WR-08: Anyone can create unlimited Durable Objects and storage writes with arbitrary room names

**Files modified:** `apps/worker/src/index.ts`, `apps/worker/src/index.test.ts`, `apps/worker/src/persistence.ts`, `apps/worker/src/persistence.test.ts`, `apps/worker/src/room-do.ts`
**Commit:** d26f6f7 (name validation itself landed in CR-02, 0812bf1)
**Applied fix:**
- The Worker returns 404 for non-WebSocket requests to room paths.
- `loadRoom` keeps a never-saved room in memory and writes nothing. A version mismatch or corrupt blob only deletes; nothing is rewritten.
- `saveRoom` now also writes `schemaVersion`, so the first successful join persists the version, room, and timers together.
- The DO tracks `#persisted`. It arms no alarm for an unpersisted room, and `onAlarm` never saves one.
- Two existing persistence tests assumed eager writes on first load and were updated. The D-17 kill/restart integration test still passes.

### WR-09: `host_transfer` (D-07) effectively never runs, and releasing the host can hand host to a disconnected seat

**Files modified:** `apps/worker/src/room-state.ts`, `apps/worker/src/room-state.test.ts`, `apps/worker/src/scheduler.ts`, `apps/worker/src/scheduler.test.ts`, `packages/schema/src/constants.ts`
**Commit:** 36c420f (shared with CR-03)
**Status:** fixed: requires human verification (tuning value changed)
**Applied fix:**
- When the released seat was host, `releaseSeat` now gives host to the earliest connected remaining seat, falling back to the earliest seat.
- **Owner-visible tuning change:** `HOST_TRANSFER_GRACE_MS` dropped from 45s to 20s, below the 30s `LOBBY_SEAT_RELEASE_GRACE_MS`, so D-07's transfer actually runs before the seat is released. CONTEXT.md leaves the exact value to the planner ("short grace period"). If the owner prefers removing the lobby `host_transfer` timer instead, this constant is the place to change.
- Tests: a scheduler ordering test, plus unit tests for the connected-preference rule and the fallback.

---

_Fixed: 2026-09-15T17:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
