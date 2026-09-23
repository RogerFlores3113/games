---
phase: 02-per-seat-redaction-contract
plan: 04
subsystem: worker
tags: [redaction, structural-test, chokepoint, fail-closed, wrangler-dev-integration]

# Dependency graph
requires:
  - phase: 02-per-seat-redaction-contract
    plan: 03
    provides: "apps/worker/src/game-registration.ts (activeGame), apps/worker/src/seat-projection.ts (projectSeatView/validateGameView/ProjectedRoomView/OutboundFrame)"
provides:
  - "apps/worker/src/source-structure.test.ts: a build-failing structural source audit (comment/string-literal-aware) enforcing exact call-site counts for .send(, encodeServerMessage(, toSeatView(, toPlayerView(, projectSeatView(, validateGameView(, and zero broadcast( across every non-test apps/worker/src file"
  - "apps/worker/src/room-do.ts: single #send(connection, frame) chokepoint for every outbound frame; #viewFor returns projectSeatView(room, seatId) | null, fail-closed to an error frame with detail view_unavailable"
  - "apps/worker/src/room-do.test.ts: D-11 layer 3 integration test proving real wrangler-dev frames across join/live-update/reconnect never leak a seat's own card or the undealt deck"
affects: [02-05 (apps/web toy UI — no room-do.ts changes expected), 02-06 (D-02 counter deletion, any remaining phase-close work)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Character-scanner comment stripper (not regex) for structural source tests, tracking code/single-quote/double-quote/template-literal state so prose mentioning enforced identifiers in comments/URLs never inflates a count"
    - "Exact-count assertions (not upper-bound) so both a bypass (too many) and a silently dropped path (too few) fail the build"
    - "Single #send(connection, OutboundFrame) chokepoint: every connection.send call in room-do.ts routes through it, and OutboundFrame's branded ProjectedRoomView view type makes a hand-constructed view fail to type-check there"
    - "#viewFor returns ProjectedRoomView | null (never throws, never falls back to an unvalidated view); both call sites (#handleJoin, #pushState) turn null into an error frame with detail view_unavailable and continue serving other seats/connections"
    - "D-11 layer 3 shares the exact same checkSeatViewForLeaks checker as layers 1/2 (packages/rules), run over real captured wire frames including a genuine seat-token reconnect"

key-files:
  created:
    - apps/worker/src/source-structure.test.ts
  modified:
    - apps/worker/src/room-do.ts
    - apps/worker/src/room-do.test.ts

key-decisions:
  - "source-structure.test.ts's SRC_DIR is derived via `new URL('./', import.meta.url).pathname` rather than `fileURLToPath`, because apps/worker's tsconfig loads both @cloudflare/workers-types and node types whose global URL and node:url's URL type are not mutually assignable — fileURLToPath(new URL(...)) fails tsc --noEmit under that combination"
  - "A view failure (projectSeatView returning null) on the JUST-JOINED connection in #handleJoin still runs #pushState() afterward, so other seats still receive the seat-list update even when this connection's own view failed to project — a view failure is reported to that one connection via an error frame, not treated as a join failure"
  - "D-11 layer 3's reconnect capture is asserted by object-identity (frame.parsed === reconnectJoined) rather than re-deriving a predicate, so the test fails loudly if the reconnect frame were ever filtered out of the checked set by an unrelated refactor"

requirements-completed: [HIDE-01, HIDE-02, HIDE-04]

# Metrics
duration: ~9min
completed: 2026-09-15
---

# Phase 2 Plan 4: Single Outbound Chokepoint, Fail-Closed View, and the Live-Wire Leak Test Summary

**Consolidated every RoomDO outbound frame behind one `#send` method and `#viewFor` → `projectSeatView` path, enforced both with a comment-stripping structural source test that fails the build on any bypass, and proved on a live `wrangler dev` worker — including a real seat-token reconnect — that no seat's own card or the undealt deck ever reaches the wire.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-09-15T19:42:23Z (first task commit)
- **Completed:** 2026-09-15T19:48:06Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `source-structure.test.ts`: a character-scanner (not regex) comment/string-literal stripper plus 10 exact-count assertions (A1–A10) over every non-test `.ts` file in `apps/worker/src`, proven against six helper canaries (doubled `.send(`, comment-only `.send(`, a `//` inside a string literal, a `//` inside a template literal) before ever touching real source
- Confirmed RED against the pre-refactor `room-do.ts` (A1/A2/A3/A4/A7 failing on the scattered `connection.send` sites), then GREEN after Task 2's refactor — all 16 tests pass
- `room-do.ts`: every prior `connection.send(encodeServerMessage(...))` call site (onMessage's bad_request/not_seated/set_variant/start_game/game_action/leave errors, `#handleJoin`'s bad_request/refused/superseded/joined, `#pushState`'s state push) now routes through the new private `#send(connection, frame: OutboundFrame)`; `#viewFor` now returns `projectSeatView(room, seatId) | null` instead of calling `toSeatView` directly, and both call sites (`#handleJoin`, `#pushState`) fail closed to an `error` frame with `detail: "view_unavailable"` on a `null` view, continuing to serve other seats
- Manually verified the structural test's bite: added a second `connection.send("x")` line to `room-do.ts`, confirmed `A1` failed (`2` matches instead of `1`), reverted before committing
- `room-do.test.ts`: new D-11 layer 3 integration test against a live `wrangler dev` instance — 3 real seats join, start a game, two live guess actions are driven to completion, Bob's socket is closed and reconnected via his saved seat token, and every captured frame (60+ raw frames across the run, at least 3 game-bearing frames per seat, including the reconnect `joined` frame) is checked with `@games/rules`' `checkSeatViewForLeaks` against that seat's own card value and every deck value never observed by any seat — a non-vacuous check (≥10 of the 16 possible values proven unseen)

## Task Commits

Each task was committed atomically:

1. **Task 1: D-09 structural chokepoint test (RED)** - `7addac8` (test)
2. **Task 2: Consolidate RoomDO outbound frames behind #send and fail-closed #viewFor (GREEN)** - `90f1d5c` (feat), plus `9f95607` (fix: `fileURLToPath`/`URL` type clash in the Task 1 test file, discovered while running `npx tsc -p apps/worker/tsconfig.json --noEmit` as part of Task 2's verify step)
3. **Task 3: D-11 layer 3 live-wire leak test** - `c3717cb` (test)

**Plan metadata:** (this commit, following this SUMMARY)

_TDD applied to Task 1 (`tdd="true"`): `source-structure.test.ts` was written and confirmed RED (5 of 16 assertions failing: A1/A2/A3/A4/A7) against the pre-refactor `room-do.ts` before Task 2 existed, then confirmed GREEN (16/16) after Task 2's consolidation. Task 3 is a new integration test with no prior implementation to make RED first — its correctness was proven by running it against the already-GREEN Task 2 code and inspecting that all leak-checker calls returned `[]` with the non-vacuous forbidden-token count holding._

## Files Created/Modified
- `apps/worker/src/source-structure.test.ts` - the D-09 structural chokepoint audit: `stripComments` (character scanner), `countMatches`, `listSourceFiles`, 6 helper canaries, and 10 exact-count real-source assertions (A1–A10)
- `apps/worker/src/room-do.ts` - single `#send` chokepoint; `#viewFor` switched from `toSeatView` to `projectSeatView`, fail-closed to an `error` frame with `detail: "view_unavailable"`; file-header comment rewritten to describe the three structurally-enforced invariants
- `apps/worker/src/room-do.test.ts` - added the D-11 layer 3 live-wire leak test (join/live-update/reconnect) immediately before the D-17 restart test, per the plan's ordering requirement (the D-17 test replaces the shared wrangler child and must stay last)

## Decisions Made
- `source-structure.test.ts`'s `SRC_DIR` uses `.pathname` on the `import.meta.url` `URL` object rather than `fileURLToPath`, to avoid a `tsc --noEmit` failure caused by `apps/worker/tsconfig.json` loading both `@cloudflare/workers-types` and `node` types (their respective global vs. `node:url` `URL` types are not mutually assignable) — documented inline in the test file
- A view-projection failure on the newly-joined connection in `#handleJoin` still triggers `#pushState()` for the rest of the room, so one connection's schema-validation failure cannot silently stall the seat-list update other seats are waiting on
- The D-11 layer 3 test asserts the reconnect frame was checked via object-identity (`frame.parsed === reconnectJoined`) rather than a re-derived predicate, so a future refactor that accidentally excludes the reconnect frame from the checked set fails loudly instead of passing by coincidence

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking issue] `fileURLToPath`/`URL` type mismatch under apps/worker's dual `@cloudflare/workers-types` + `node` tsconfig**
- **Found during:** Task 2's verification step (`npx tsc -p apps/worker/tsconfig.json --noEmit`), which failed on the Task 1 test file even though Task 1's own acceptance criteria (Vitest runs) had already passed — `tsc` type-checks in a way Vitest's transform does not.
- **Issue:** `fileURLToPath(new URL("./", import.meta.url))` failed to type-check: `@cloudflare/workers-types`'s global `URL` and `node:url`'s `URL` type are structurally close but not mutually assignable (their `searchParams` iterator types differ), and both type packages are loaded together in `apps/worker/tsconfig.json`.
- **Fix:** Replaced with `new URL("./", import.meta.url).pathname` — a plain string, sidestepping the type clash entirely. Behavior is identical on this platform (Linux, no `file://` URL-encoding edge cases in this path).
- **Files modified:** `apps/worker/src/source-structure.test.ts`
- **Commit:** `9f95607`

Or: all other tasks executed exactly as written — no other deviations.

## Issues Encountered
- An earlier draft of `source-structure.test.ts` used `dirname(fileURLToPath(new URL("./", import.meta.url)))`, which resolved `SRC_DIR` one level too high (`apps/worker` instead of `apps/worker/src`), causing `readdirSync`'s recursive entries to carry a spurious `src/` prefix and several assertions to compare `"src/room-do.ts"` against the expected bare `"room-do.ts"`. Caught immediately by the first structural-test run (before any commit) and fixed by removing the unnecessary `dirname` call; superseded entirely by the `.pathname` fix above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `apps/worker/src/room-do.ts` now has exactly one outbound socket writer and exactly one view source, both mechanically enforced by `source-structure.test.ts` on every future change to this file or any other non-test file in `apps/worker/src`.
- D-11's three-layer leak test suite is now complete: layer 1 (packages/rules fast-check), layer 2 (apps/worker wire-string property test, Plan 03), and layer 3 (this plan's live wrangler-dev integration test, including reconnect) all run in the standard `npm test`.
- Remaining phase-close items per Plan 03's summary and CONTEXT.md D-02: deleting `packages/rules/src/counter-game.ts` (+test), `apps/web/components/CounterGame.tsx`, and the counter exports from `packages/rules/src/index.ts`; updating `e2e/start-game.spec.ts`/`e2e/in-progress-arrival.spec.ts` to drive the toy instead of the counter. `room-do.ts` itself needs no further change for those — this plan's refactor is independent of the counter-deletion work.

---
*Phase: 02-per-seat-redaction-contract*
*Completed: 2026-09-15*

## Self-Check: PASSED

All 4 files (3 created/modified source files, this SUMMARY.md) verified present on disk; all 4 commit hashes (`7addac8`, `90f1d5c`, `9f95607`, `c3717cb`) verified in `git log`.
