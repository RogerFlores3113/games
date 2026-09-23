---
phase: 08-multi-game-rooms
plan: 04
subsystem: api
tags: [zod, room-envelope, gameId, lobby, worker, cutover]

# Dependency graph
requires:
  - phase: 08-multi-game-rooms
    provides: "08-03 (gameId-keyed GAME_REGISTRY, resolveGame, injectable games parameter, namespaced GameErrorDetail)"
provides:
  - "RoomViewSchema (D-04, D-05): gameId, gameDisplayName, an opaque config, and limits {min, max} replace the top-level variant field; declared as a strictObject so an extra key (a stray variant, an extra limits key) is rejected, not silently stripped"
  - "toSeatView (apps/worker/src/room-state.ts): builds the new envelope from the resolved registry entry — gameId/gameDisplayName/limits copied by value, never the entry object itself"
  - "validateGameView (apps/worker/src/seat-projection.ts, MGR-05): resolves the per-game view schema via resolveGame(view.gameId) instead of the interim DEFAULT_GAME_ID key — an unregistered gameId fails closed with a redacted log and null, never a send"
  - "apps/web/components/Lobby.tsx: every seat-limit/display-name read (seat count, slot padding, start gate, waiting copy) is now view-driven, not Hanabi-constant-driven"
affects: [08-05, 08-06, 08-07, 08-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RoomViewSchema declared as z.strictObject (was z.object) so the D-04/D-05 envelope shape is closed — an old client/server sending the removed `variant` field, or an extra key on `limits`, fails Zod validation rather than being silently accepted"
    - "toSeatView copies registry metadata (displayName, limits.min, limits.max) by value into the view every call, never passes the GameRegistryEntry object itself across the room/game boundary (keeps the entry's type-erased adapter off the wire path structurally)"
    - "Lobby's segmented variant picker keeps byte-identical markup but derives its selected value via VariantSchema.safeParse(view.config).success — an unparseable config selects nothing rather than throwing, matching the fail-closed discipline used elsewhere in the wire layer"

key-files:
  created: []
  modified:
    - packages/schema/src/room.ts
    - packages/schema/src/room.test.ts
    - packages/schema/src/messages.test.ts
    - packages/schema/src/games/subpath.test.ts
    - apps/worker/src/room-state.ts
    - apps/worker/src/seat-projection.ts
    - apps/worker/src/seat-projection.test.ts
    - apps/worker/src/room-do.test.ts
    - apps/web/components/Lobby.tsx
    - apps/web/lib/lobby-seats.ts
    - apps/web/lib/lobby-seats.test.ts
    - apps/web/lib/pending-variant.ts
    - apps/web/lib/pending-variant.test.ts
    - apps/web/lib/room-store.test.ts
    - apps/web/lib/settings-modal-render.test.ts
    - e2e/start-game.spec.ts

key-decisions:
  - "RoomViewSchema switched from z.object to z.strictObject (was previously non-strict) so the plan's own acceptance criteria — rejecting an object that carries both the new envelope AND a leftover `variant` key — actually holds; this is a stricter gate than before, not merely an additive one, and is intentional per D-04's fail-closed direction during the migration window (D-15)"
  - "toSeatView's gameId/config fields stay interim (DEFAULT_GAME_ID / state.variant) exactly as game-registration.ts's roomGame helper already documented — RoomState itself gains its own gameId/config fields only in plan 08-05, so this plan's worker-side change is scoped to the outbound view only, never the persisted shape"
  - "apps/web/lib/settings-modal-render.test.ts (not in the plan's file list) contained its own RoomView literal and failed tsc -b once RoomViewSchema's fields changed — fixed as a Rule 1/3 blocking-issue fix in the same commit, since leaving it broken would fail the plan's own `npm run typecheck` gate"

patterns-established:
  - "Every RoomView-literal test fixture across schema/worker/web is renamed in the same commit as the schema change that invalidates it (v1.0 anti-pattern from RETROSPECTIVE.md lesson 2, reapplied here) — verified via a repo-wide grep for `.variant ===`/`variant: string }`/leftover `youSeatId`-adjacent literals before commit, not just the plan's own listed files"

requirements-completed: [MGR-05]

# Metrics
duration: 40min
completed: 2026-09-23
---

# Phase 8 Plan 04: Room View Carries gameId, Config and Per-Game Limits Summary

**`RoomView` drops its top-level Hanabi-only `variant` field and gains `gameId`, `gameDisplayName`, an opaque `config`, and per-game `limits` — the worker's `toSeatView`/`validateGameView` build and validate this envelope through the gameId-keyed registry from plan 08-03, and the web lobby's seat count, start gate, and copy now read from the view instead of hardcoded Hanabi constants — Hanabi itself is unchanged end to end.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments

- `RoomViewSchema` (packages/schema/src/room.ts) rewritten per D-04/D-05: `code`, `gameId: GameIdSchema`, `gameDisplayName: z.string()`, `config: z.unknown()` (opaque here, validated by the room's game `configSchema` in the worker registry — same convention as the existing `game: z.unknown()` comment), `limits: z.strictObject({ min, max })`, then the unchanged `status`/`hostSeatId`/`youSeatId`/`seats`/`game` fields. Declared as `z.strictObject` (was `z.object`) so an object carrying both the new shape and a leftover `variant` key, or `limits` with an extra key, is rejected outright — proven by new tests in `room.test.ts`.
- `apps/worker/src/room-state.ts`'s `toSeatView` resolves the room's registry entry once and returns `gameId: DEFAULT_GAME_ID` (interim — becomes `state.gameId` in plan 08-05), `gameDisplayName: entry.displayName`, `config: state.variant` (interim — becomes `state.config` in plan 08-05), and `limits: { min: entry.limits.min, max: entry.limits.max }` copied by value. Still the sole worker function permitted to build a `RoomView`.
- `apps/worker/src/seat-projection.ts`'s `validateGameView` (MGR-05) now resolves the per-game view schema via `resolveGame(view.gameId, games)` instead of 08-03's interim `DEFAULT_GAME_ID` lookup — an unregistered gameId fails closed with the same redacted `console.error` (seatId + message only, never the view) and returns `null`, proven by a new test that casts a view to an unregistered `"expedition"` gameId and asserts the redacted log/null return, plus a companion test proving a normal Hanabi view still projects successfully via its own gameId.
- `apps/web/components/Lobby.tsx` no longer imports `MIN_PLAYERS`/`MAX_PLAYERS`: `canStart`, the seat-count line, the start-gate line, both waiting-copy strings, and the "Waiting for players"/"Players" heading condition all read `view.limits.min`/`view.limits.max`/`view.gameDisplayName` (UI-SPEC's exact copy contract, byte-for-byte). The segmented variant picker's markup is unchanged; only its selected-value source moved to `VariantSchema.safeParse(view.config)`.
- `apps/web/lib/lobby-seats.ts`'s `lobbySlots` no longer defaults `max` to the (now-unimported) global `MAX_PLAYERS` — `max` is a required parameter, sourced from `view.limits.max` at the one real call site (`Lobby.tsx`).
- `apps/web/lib/pending-variant.ts`'s `variantToApply` compares `view.config` (was `view.variant`) — the apply-once-if-host-and-lobby gate itself is otherwise unchanged.
- Every RoomView-literal test fixture found across `packages/schema`, `apps/worker`, and `apps/web` was renamed to the new envelope shape in the SAME commit, including `apps/web/lib/settings-modal-render.test.ts` — a file not in the plan's own file list, found via `npm run typecheck` failing after Task 1's schema change (a real Rule 1/3 blocking-issue fix, not a plan deviation in substance).
- Full gate green: `npm test` (1070/1070), `npm run typecheck` (`tsc -b`, root) clean, and the four targeted Playwright specs (`create-room`, `start-game`, `variant-rainbow`, `variant-black`, 21 tests) green on two consecutive runs — the one observed failure on the first run (`create-room`/`start-game`/`variant-rainbow`/`variant-black` all timing out in the shared `createRoom` e2e helper on a cold dev-server start) reproduced the pre-existing, already-documented MGR-08 cold-start flake (STATE.md's own Deferred Items / v1.0-MILESTONE-AUDIT.md), not a regression introduced by this plan — confirmed by the identical suite passing cleanly twice in a row immediately after.

## Task Commits

Both tasks landed as ONE commit per the plan's explicit instruction (Task 1 alone is not independently buildable — apps/web would fail `tsc -b` against the new `RoomViewSchema` until Task 2's consumer updates land):

1. **Task 1 (schema/worker) + Task 2 (web/e2e/gate): room view carries gameId, config and per-game limits (D-04, D-05, MGR-05)** — `fbc9bac` (feat)

## Files Created/Modified

- `packages/schema/src/room.ts` — `RoomViewSchema` rewritten to the D-04/D-05 envelope, `z.strictObject`
- `packages/schema/src/room.test.ts` — new `RoomViewSchema` describe block: accepts the new shape, rejects a leftover `variant` key, rejects missing `limits`, rejects an extra `limits` key, rejects `gameId: "expedition"`
- `packages/schema/src/messages.test.ts` — `sampleRoomView` fixture renamed
- `packages/schema/src/games/subpath.test.ts` — inline `RoomViewSchema.safeParse` fixture renamed
- `apps/worker/src/room-state.ts` — `toSeatView` builds the new envelope from the resolved registry entry
- `apps/worker/src/seat-projection.ts` — `validateGameView` dispatches via `resolveGame(view.gameId, games)`
- `apps/worker/src/seat-projection.test.ts` — `leakyView`/standalone view fixtures renamed; new `MGR-05 per-game dispatch via view.gameId` describe block (unregistered-gameId fail-closed test, real-Hanabi-view-still-projects test)
- `apps/worker/src/room-do.test.ts` — four `(m.view as { variant: string }).variant === "..."` assertions renamed to `(m.view as { config: unknown }).config === "..."` (including two on the reclaimed-view/`joined` message path the plan's own read-first pointers did not enumerate)
- `apps/web/components/Lobby.tsx` — `MIN_PLAYERS`/`MAX_PLAYERS` import removed; every seat-limit/copy read redirected to `view.limits`/`view.gameDisplayName`; variant picker's selected value now `VariantSchema.safeParse(view.config)`
- `apps/web/lib/lobby-seats.ts` — `lobbySlots`'s `max` parameter is now required, no `MAX_PLAYERS` default
- `apps/web/lib/lobby-seats.test.ts` — `MAX_PLAYERS` import replaced by a local `HANABI_MAX_PLAYERS` test constant passed explicitly at every call site
- `apps/web/lib/pending-variant.ts` — `variantToApply` compares `view.config`
- `apps/web/lib/pending-variant.test.ts` — `makeView` fixture renamed; the "already matches" case now asserts against `config: "rainbow"`
- `apps/web/lib/room-store.test.ts` — `makeView` fixture renamed
- `apps/web/lib/settings-modal-render.test.ts` — `BASE_VIEW` fixture renamed (found via `tsc -b`, not in the plan's file list)
- `e2e/start-game.spec.ts` — comment referencing `view.variant` updated to `selectedVariant`/`view.config`

## Decisions Made

- `RoomViewSchema` moved from `z.object` (permissive/stripping) to `z.strictObject` — a deliberate tightening beyond a pure rename, required for the plan's own acceptance criterion that a `variant`-carrying object is rejected, and consistent with D-15's "strict schemas fail closed during the migration window" direction.
- `toSeatView`'s `gameId`/`config` fields stay wired through the interim `DEFAULT_GAME_ID`/`state.variant` path documented by 08-03's `roomGame` helper — `RoomState` itself is untouched in this plan (no `gameId`/`config` field yet); that re-key is explicitly plan 08-05's job, per the plan's own objective statement ("Persisted RoomState... NOT changed here").
- The out-of-plan `settings-modal-render.test.ts` fixture fix was applied as a Rule 1/3 blocking-issue fix (found by `npm run typecheck`, not a proactive scope expansion) rather than deferred, since leaving it broken would fail this plan's own stated verification gate.

## Deviations from Plan

**1. [Rule 1/3 — blocking issue] `apps/web/lib/settings-modal-render.test.ts`'s `BASE_VIEW` fixture required the same rename as the plan's listed web fixtures**
- **Found during:** Task 2's `npm run typecheck` gate
- **Issue:** This file (not in the plan's `files_modified` list or its "grep `youSeatId`" read-first pointer) builds its own `RoomView` literal with the old `variant` field; `tsc -b` failed on it once `RoomViewSchema` changed.
- **Fix:** Renamed the literal to `gameId`/`gameDisplayName`/`config`/`limits`, identical to every other fixture rename in this commit.
- **Files modified:** `apps/web/lib/settings-modal-render.test.ts`
- **Commit:** `fbc9bac`

**2. [Scope, not a deviation] `room-do.test.ts` had four `.variant` view-assertion sites, not the three the plan's interfaces block pointed to**
- The plan's `<interfaces>` block named lines ~541/563/585; a fourth site existed further down (the RT-03-style reclaim-after-eviction test's `joined` message assertion at ~line 898/919). Found via the acceptance-criteria grep itself (`grep -rn "\.variant ===\|variant: string }" apps/worker/src/room-do.test.ts`), which is exactly the mechanism the plan specifies for catching this — updated identically to the other three.

No deviations affected scope, architecture, or requirement completion beyond the two items above.

## Issues Encountered

- The first Playwright run of the four targeted specs (`create-room`, `start-game`, `variant-rainbow`, `variant-black`) showed 4 failures, all timing out in the shared `createRoom()` e2e helper waiting for the host's own seat row after a fresh `/room/{code}` navigation, with the page showing "Connecting to room…" indefinitely. Re-running the identical command twice in a row immediately after produced 21/21 green both times, and running the single first-failing test in isolation also passed — consistent with the pre-existing, already-tracked MGR-08 dev-server cold-start flake (this plan does not touch `POST /api/room`, the create-room form, or the WebSocket join path's timing at all), not a regression from the `RoomView` envelope change. No code change was made in response; documented here per the "no retries added" spirit of D-18, which is explicitly a later plan's fix, not this one's.

## User Setup Required

None — no external service configuration required. No deployment was performed (D-14: the executor does not deploy).

## Next Phase Readiness

- Plan 08-05 can now re-key `RoomState`/`toSeatView`'s `gameId`/`config` from the interim `DEFAULT_GAME_ID`/`state.variant` bridge to real persisted `state.gameId`/`state.config` fields — the outbound envelope shape this plan built is already final; only the worker's internal source-of-truth changes.
- `MGR-02`/`MGR-04` are left **Pending** in `REQUIREMENTS.md`: MGR-02's full text ("Hanabi 2–5, Expedition 3–5... the lobby enforces them") requires a second game with different limits actually registered, which is plan 08-07's test-only-game deliverable — this plan proved the lobby reads `view.limits` correctly, but only against Hanabi's own 2–5. MGR-04's full text ("The full existing unit and e2e suites pass") was exercised via `npm test`/`npm run typecheck` plus four targeted Playwright specs per this plan's own `<verification>` section, not the complete e2e suite — a later plan's full-suite run is still needed to close it out.
- `MGR-05` is marked **Complete**: its literal text ("Every per-seat view is validated against its own game's view schema before it is sent") is fully satisfied by `validateGameView`'s `resolveGame(view.gameId)` dispatch, proven both by the existing Hanabi leak-test suite (unchanged, still green) and by this plan's new unregistered-gameId fail-closed test — the mechanism does not depend on a second game being registered to be correct.
- No blockers for plan 08-05.

---
*Phase: 08-multi-game-rooms*
*Completed: 2026-09-23*

## Self-Check: PASSED

All files listed under Files Created/Modified confirmed present and modified via `git show --stat fbc9bac`. Commit `fbc9bac` confirmed present in `git log --oneline`.
