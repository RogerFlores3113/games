---
phase: 08-multi-game-rooms
fixed_at: 2026-09-23T00:00:00Z
review_path: .planning/phases/08-multi-game-rooms/08-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-09-23
**Source review:** .planning/phases/08-multi-game-rooms/08-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (fix_scope: critical_warning; the 8 Info findings are out of scope)
- Fixed: 4
- Skipped: 0

Verification after every fix: `npx tsc -b` was clean. After the last fix, the full `npx vitest run` passed: 83 files, 1142 tests. E2E (Playwright) was not run.

## Fixed Issues

### WR-01: Host variant picker is no longer disabled while reconnecting (MGR-04 regression)

**Files modified:** `apps/web/components/game-ui.tsx`, `apps/web/components/Lobby.tsx`, `apps/web/components/hanabi/HanabiLobbySettings.tsx`, `apps/web/lib/lobby-render.test.ts`
**Commit:** 63b7887
**Applied fix:**
- Added a required `disabled: boolean` to `LobbySettingsProps`.
- `Lobby` passes `disabled={reconnecting}`, and `HanabiLobbySettings` sets `disabled` on every variant radio.
- Added a render test: all three radios are disabled when `reconnecting` is true, and none are disabled otherwise.

### WR-02: Landing form submits every game's settings under one shared `name="config"`

**Files modified:** `apps/web/lib/create-room-form.ts` (new), `apps/web/app/LandingForm.tsx`, `apps/web/app/api/room/route.ts`, `apps/web/app/api/room/route.test.ts`, `apps/web/components/game-ui.tsx`, `apps/web/components/hanabi/HanabiCreateSettings.tsx`
**Commit:** bc563a8
**Applied fix:**
- Each game's create-time config controls are now named `config.{gameId}`, via `configFieldName`. `LANDING_SETTINGS` components receive a `name` prop, typed by a new `CreateSettingsProps`.
- A shared `readCreateRoomForm(formData)` reads only the selected game's namespaced field. Both the JS path (`LandingForm`) and the native form POST (`route.ts`) use it.
- Route tests now use the namespaced field. Two tests were added:
  - A multi-panel submit. It includes another game's field and a legacy bare `config`, and only `config.hanabi` is used.
  - A submit where only another game's field is present. It is rejected.
- Deviation from the suggested fix: I did not add the post-hydration `<fieldset disabled>`. Namespacing alone fixes both failure modes the review describes (leaked config and a shared radio group), and it works before hydration. Adding hydration-gated `disabled` state would have introduced SSR/hydration-mismatch risk for no extra correctness.
- The review's side note that `CreateRoomRequestSchema` duplicates the registry's `configSchema` was not addressed. It is a cross-package refactor that needs a design decision.

### WR-03: The "no registry entry" fail-closed branch in `validateGameView` can never run

**Files modified:** `apps/worker/src/seat-projection.ts`, `apps/worker/src/seat-projection.test.ts`
**Commit:** e5663d5
**Applied fix:**
- `projectSeatView` now resolves the room's registry entry before calling `toSeatView`, which throws on an unknown gameId. When the entry is missing, it logs a redacted `HIDE-03` line (seatId only) and returns `null`, which becomes `view_unavailable`. It no longer throws, so a `#pushState` fan-out is not aborted. This also covers the lobby case.
- Added `projectSeatView` tests with an injected empty registry, for both a lobby room and a started room.

### WR-04: An invalid `gameError` is dropped without logging, and its gameId is never checked against the room

**Files modified:** `apps/worker/src/seat-projection.ts`, `apps/worker/src/seat-projection.test.ts`, `apps/worker/src/room-do.ts`, `apps/worker/src/game-registration.ts`, `apps/worker/src/game-registration.test.ts`
**Commit:** 9b3ca48
**Applied fix:**
- New `toWireGameError(gameError, roomGameId)` in `seat-projection.ts`. It checks the detail against `GameErrorDetailSchema`.
  - If the check fails, it logs redacted diagnostics (the room's gameId plus issue codes and paths, never the value) and returns `undefined`.
  - It also drops a schema-valid detail whose `gameId !== room.gameId`, with a log line.
- `room-do.ts` uses this helper in place of the inline `safeParse`.
- `resolveGame` now returns `undefined` for an entry whose own `gameId` does not match the key it is registered under. It fails closed instead of asserting.
- Added tests for each `toWireGameError` branch and for a registry keyed under the wrong name.
- Status: fixed, requires human verification. This changes fail-closed error-handling logic, so please confirm the intended semantics. In particular, a mis-keyed registry entry now makes that game unresolvable instead of throwing at construction time.

---

_Fixed: 2026-09-23_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
