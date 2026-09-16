---
phase: 04-wire-engine-into-room-actor
fixed_at: 2026-09-16T00:00:00Z
review_path: .planning/phases/04-wire-engine-into-room-actor/04-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-09-16
**Source review:** .planning/phases/04-wire-engine-into-room-actor/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (Critical + Warning; IN-01 and IN-02 out of scope)
- Fixed: 4
- Skipped: 0

**Verification:** full `vitest run` 41 files / 418 tests passed; `tsc --noEmit` clean for apps/worker, apps/web, packages/rules, packages/schema.

## Fixed Issues

### WR-01: The action-dedup guarantee silently breaks for the game-ending action

**Files modified:** `apps/worker/src/room-state.ts`, `apps/worker/src/room-state.test.ts`
**Commit:** 73623e2
**Status:** fixed: requires human verification (logic change)
**Applied fix:** Moved the `lastAppliedActionId` dedup check ahead of the `status !== "in_progress"` gate in `applyGameAction`. Extended the existing "played to the end" test to retry the game-ending action's own `actionId` and assert idempotent success with the identical state object (this assertion fails against the old ordering). Note: a dedup hit now also returns success outside `in_progress` (e.g. lobby after a finished game) if the same actionId is resent; it returns the unchanged state, so it is harmless.

### WR-02: A conformance-suite assertion never actually executes for any adapter

**Files modified:** `packages/rules/src/adapter.test.ts`
**Commit:** aa94f4f
**Applied fix:** `describeAdapterConformance` now takes a required `nextLegalMove` driver. Split the test into "checkGameEnd returns null for a fresh game" and "returns an object with a numeric score once the game ends", which plays the game to completion (guarded at 2000 moves) and unconditionally asserts the non-null shape. Added a Hanabi driver mirroring `room-state.test.ts`'s `legalActionFor`.

### WR-03: `isHanabiView`'s type predicate is unsound

**Files modified:** `apps/web/components/HanabiBoard.tsx`
**Commit:** b8e1d78
**Applied fix:** `isHanabiView` now returns `HanabiViewSchema.safeParse(game).success` (imported from `@games/schema/games/hanabi`), so the client uses the same strict schema as the server's fail-closed gate. The A9 single-seam check only scans worker sources, so it is unaffected.

### WR-04: `RoomDO#onMessage` has no top-level exception containment, unlike `#onAlarm`

**Files modified:** `apps/worker/src/room-do.ts`
**Commit:** 0cb4818
**Applied fix:** Wrapped the dispatch body after the `parseClientMessage` gate in try/catch. The catch logs the connection id and error the same way `onAlarm` does and sends a generic `bad_request` error frame through `#send`. The single-writer and A8 structural invariants still hold.

---

_Fixed: 2026-09-16_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
