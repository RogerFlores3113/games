---
phase: 04-wire-engine-into-room-actor
plan: 05
subsystem: testing
tags: [websocket, wrangler-dev, integration-test, idempotency, durable-objects]

# Dependency graph
requires:
  - phase: 04-wire-engine-into-room-actor
    provides: "plan 04-04's persisted actionId dedup branch in room-state.ts's applyGameAction"
provides:
  - "RT-09 double-send proof on a live WebSocket against a real workerd instance"
  - "D-08 proof that the dedup key survives a genuine wrangler dev process kill/respawn"
affects: [04-wire-engine-into-room-actor, room-do-integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Duplicate-frame proof: build the game_action object ONCE with a fixed literal actionId, send it twice, and require the second matching frame's index in `parsed` to be at or beyond the pre-send `parsed.length` — never trust a waitFor predicate the first frame could already satisfy."
    - "Eviction proof: real persistence claims are only proven by killAndWait(child) + respawn (see D-17's existing pattern), never by a socket close alone, since the DO can satisfy in-memory-only behavior across a mere client disconnect."

key-files:
  created: []
  modified:
    - apps/worker/src/room-do.test.ts
    - apps/worker/package.json

key-decisions:
  - "Reused the existing single wrangler-dev harness (spawnWrangler/waitForReady/killAndWait/collectMessages) rather than building a second harness, per the plan's explicit no-second-harness directive."
  - "Fixed apps/worker's `test:integration` npm script (pre-existing break, unrelated to this plan's tasks) since it directly blocked verifying this plan's own acceptance criteria as written."

patterns-established:
  - "Positive-control assertion after a dedup-blocked duplicate: send a THIRD frame with a different actionId and assert the state actually advances, proving the seat isn't just frozen."

requirements-completed: [RT-09]

# Metrics
duration: 9min
completed: 2026-09-16
---

# Phase 4 Plan 05: RT-09 Exactly-Once Proofs on a Real Socket Summary

**Two new live-`wrangler dev` WebSocket tests prove a duplicated clue `game_action` applies exactly once, and that this holds even after a genuine Durable Object process kill/respawn — closing out RT-09/D-08/D-15.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-09-16T03:29:02Z (prior plan's completion commit)
- **Completed:** 2026-09-16T03:37:25Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- RT-09/D-15: a byte-identical duplicate clue frame (same literal `actionId`) applies exactly once — `clueTokens`, `history.length`, `activeSeatId`, `isYourTurn`, and `deckCount` are all unchanged by the resent frame, with a positive control proving the game still advances on a genuinely new action.
- D-08: the dedup key is proven to be persisted, not memory-resident — a retry of the same `actionId` after `killAndWait(child)` + respawn of the whole `wrangler dev` process tree does not re-apply the clue.
- Fixed apps/worker's broken `test:integration` script so it actually resolves the `worker` project's test files.

## Task Commits

Each task was committed atomically:

1. **Task 1: Prove a double-sent clue applies exactly once on the live wire** - `b148b33` (test)
2. **Task 2: Prove the dedup survives a genuine Durable Object eviction** - `94b4a11` (test, includes the `test:integration` script fix)

**Plan metadata:** (this commit)

## Files Created/Modified
- `apps/worker/src/room-do.test.ts` - Added the RT-09 double-send test and the D-08 forced-eviction retry test, reusing all existing harness helpers (`spawnWrangler`, `waitForReady`, `killAndWait`, `collectMessages`, `send`, `mintRoomCode`) and the Hanabi type shapes/`findActiveSeat`/`legalClueFrom` idioms already established in plan 04-03.
- `apps/worker/package.json` - `test:integration` now `cd`'s to the repo root before invoking `vitest run --project worker room-do`, since the `projects` config lives in the root `vitest.config.ts` and there is no vitest config under `apps/worker` itself.

## Decisions Made
- Both new tests live in the single existing `wrangler dev` + raw WebSocket harness file, per the plan's "no second harness" directive — no new test infrastructure was introduced.
- The duplicate-send assertion in Task 1 records `c.parsed.length` immediately before the second send and requires the matching `state` frame's index to be at or beyond that count, exactly mirroring the pre-existing "post-grace `set_variant`" idiom in the same file (CR-01 test, ~L311-316) — this is the documented defense against a `waitFor` predicate vacuously matching the already-received first response, since the dedup branch resends a byte-identical view.
- Task 2 reuses the exact `killAndWait(child)` / `child = spawnWrangler()` / `await waitForReady()` sequence the pre-existing D-17 test already established, with the same 40s extended timeout, since a genuine process kill is the only evidence that rules out an in-memory-only implementation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed broken `apps/worker` `test:integration` npm script**
- **Found during:** Task 1 (running the plan's own `<verify>` command)
- **Issue:** `npm run test:integration --workspace apps/worker` ran `vitest run --project worker room-do` with cwd `apps/worker`, but the `projects` config (which defines the `worker` project) lives only in the repo-root `vitest.config.ts`; there is no vitest config under `apps/worker`, so the script silently resolved zero test files and exited 1. This was called out by the orchestrator as a known pre-existing break before this plan started, with an explicit invitation to fix it if the fix stayed a one-liner.
- **Fix:** Changed the script to `cd ../.. && vitest run --project worker room-do`, running from the repo root where the `projects` config actually lives — identical semantics to the `npx vitest run --project worker room-do` workaround, just runnable via the intended workspace script.
- **Files modified:** `apps/worker/package.json`
- **Verification:** `npm run test:integration --workspace apps/worker` now runs and passes all 15 tests in `room-do.test.ts` (14 pre-existing + this plan's 2 new ones).
- **Committed in:** `94b4a11` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to make the plan's own literal `<verify>` command usable as written; no scope creep beyond a one-line script change.

## Issues Encountered
None beyond the pre-flagged `test:integration` script break, resolved above.

## Fault Injection Verification (per plan's acceptance criteria)

- **Task 1:** Temporarily forced the dedup comparison in `room-state.ts`'s `applyGameAction` to always be `false` (`actorSeat !== undefined && false && ...`). The RT-09 test failed as required — the duplicate clue was re-evaluated against the (now-changed) game state and was rejected with `not_your_turn`, which the test surfaced as a timeout waiting for the expected `state` frame shape. Reverted; confirmed `git diff` on `room-state.ts` is clean before committing.
- **Task 2:** Temporarily removed the `lastAppliedActionId` write from the seats map (`state.seats.map((seat) => seat)`, dropping the persistence side-effect). The D-08 test failed as required — the post-restart retry was likewise rejected with `not_your_turn` because the un-deduped retry attempted to re-apply against the already-advanced game state, again surfacing as a timeout. Reverted; confirmed `git diff` on `room-state.ts` is clean before committing.

Both fault-injection failures manifest as timeouts rather than a direct assertion failure, because once the dedup guard is disabled, the retry is evaluated by the real Hanabi adapter against a game state where it is no longer the acting seat's turn — the adapter's own `not_your_turn` rejection is itself proof that the retry was actually re-processed rather than short-circuited. This is a stronger signal than a soft assertion mismatch would have been.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- RT-09 is now proven end-to-end on a real WebSocket against a real `workerd` instance, closing the last open item this plan targeted for D-08/D-15.
- `npm test` is green across all 44 test files / 459 tests, including the full `room-do.test.ts` integration suite (15 tests) via both `npx vitest run --project worker room-do` and the now-fixed `npm run test:integration --workspace apps/worker`.
- Per this plan's explicit instructions, RT-09 was NOT marked complete in `.planning/REQUIREMENTS.md` — only STATE.md and ROADMAP.md plan progress were updated. A future step should reconcile REQUIREMENTS.md's RT-09 checkbox.
- The forehead-card toy construct in `room-do.test.ts` remains intact and untouched, as required — plan 04-08 owns its deliberate removal.

---
*Phase: 04-wire-engine-into-room-actor*
*Completed: 2026-09-16*

## Self-Check: PASSED

- FOUND: `apps/worker/src/room-do.test.ts`
- FOUND: `.planning/phases/04-wire-engine-into-room-actor/04-05-SUMMARY.md`
- FOUND commit `b148b33` (Task 1)
- FOUND commit `94b4a11` (Task 2 + script fix)
- FOUND commit `41447e1` (this SUMMARY)
