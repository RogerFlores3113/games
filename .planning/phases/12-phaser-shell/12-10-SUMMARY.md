---
phase: 12-phaser-shell
plan: 10
subsystem: expedition-phaser-shell
tags: [expedition, phaser, playwright, e2e, test-bridge, scene]

requires:
  - phase: 12-phaser-shell
    provides: CampScene, expedition-scene-store, object-index, test-bridge, compute-zoom (Plans 12-08/12-09)
  - phase: 12-phaser-shell
    provides: ExpeditionSettingsModal / corner gear button (Plan 12-11, sequencing dependency only)
provides:
  - BetweenCampsScene (D-01 throwaway fireside stub: draft/loadout/ready)
  - "between-camps" scene registration
  - e2e/expedition-helpers.ts (createExpeditionRoom, startExpeditionGame, waitForBridge, getModel, getScene, clickObject, hoverObject, waitForModel)
  - e2e/expedition-mount.spec.ts (mount/no-leak/scaling proof)
affects: [12-13 (reuses expedition-helpers.ts and BetweenCampsScene verbatim for the full-camp spec), 13-fireside-run-end (deletes BetweenCampsScene wholesale)]

tech-stack:
  added: []
  patterns:
    - "Scene subscribes to store on create(), unsubscribes on BOTH SHUTDOWN and DESTROY (not SHUTDOWN alone) to survive React Strict Mode's dev-only game.destroy(true) double-mount teardown"
    - "e2e helpers drive the canvas only through window.__expeditionTest + real Playwright mouse events, never app internals"

key-files:
  created:
    - apps/web/components/expedition/phaser/scenes/BetweenCampsScene.ts
    - e2e/expedition-helpers.ts
    - e2e/expedition-mount.spec.ts
  modified:
    - apps/web/components/expedition/phaser/scenes/scene-registry.ts

key-decisions:
  - "BetweenCampsScene listens to both Phaser.Scenes.Events.SHUTDOWN and DESTROY for its store-unsubscribe teardown, since game.destroy(true) (Strict Mode's double-mount cleanup) only fires DESTROY, not SHUTDOWN, on a scene that was never explicitly stopped first"
  - "Expedition's minimum seat count is 3 (worker limits.min), so all three mount-spec tests use 3 players even where 2 would otherwise suffice, to reach a startable game"

patterns-established:
  - "e2e/expedition-helpers.ts declares its own local ExpeditionTestBridge type mirror rather than importing from apps/web, keeping e2e specs decoupled from the app's build target"

requirements-completed: [SCENE-01, SCENE-10, SCENE-11, SCENE-12]

duration: ~55min
completed: 2026-09-28
---

# Phase 12 Plan 10: Between-Camps Stub & Expedition E2E Mount Spec Summary

Added the throwaway D-01 fireside stub (BetweenCampsScene: three-gear draft, owned-gear loadout toggles, Ready, per-seat readiness) so a run can advance from the fireside into camp, plus the shared `e2e/expedition-helpers.ts` bridge-driving helpers and `e2e/expedition-mount.spec.ts`, which proves one canvas per player, no double-mount/WebGL-context leak across 5 navigations under React Strict Mode, and whole-number scaling at 1280x720 (2x), 1920x1080 (3x), and 1000x600 (clamped to 1x with the enlarge hint).

## Performance

- **Duration:** ~55 min
- **Started:** 2026-09-28T02:31:00Z (approx, first file read)
- **Completed:** 2026-09-28T03:26:43Z
- **Tasks:** 2 completed
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- A run started at the fireside (draft-first, per the engine's `runPhase: "fireside"`) is now playable in the browser end to end: pick one of three offered gear, toggle owned gear into loadout slots, ready up — every click a fixed `dispatch` request literal, no client-side legality logic.
- `scene-registry.ts` gained its one promised line (`"between-camps": (deps) => new BetweenCampsScene(deps)`), keeping the stub cleanly deletable per D-01.
- Shared e2e helpers (`createExpeditionRoom`, `startExpeditionGame`, `waitForBridge`, `getModel`, `getScene`, `clickObject`, `hoverObject`, `waitForModel`) now exist for Plan 12-13's full-camp spec to reuse verbatim.
- `e2e/expedition-mount.spec.ts` proves success criterion 3 (no double mount / WebGL leak under Strict Mode) and D-09/D-10/D-11 scaling, all 3 tests green.

## Task Commits

1. **Task 1: BetweenCampsScene stub — draft, loadout toggles, Ready (D-01)** - `7fa83c1` (feat)
2. **Task 2: Expedition e2e helpers and the mount/scaling spec** - `dd17660` (feat, includes a Rule 1 bug fix)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update)

## Files Created/Modified

- `apps/web/components/expedition/phaser/scenes/BetweenCampsScene.ts` - the D-01 stub scene: sign/camp-number/supplies header, three-gear draft cards with hover tooltip, owned-gear loadout toggle list with equipped/fit-alpha styling, pack capacity label, Ready button, per-seat readiness list
- `apps/web/components/expedition/phaser/scenes/scene-registry.ts` - added the `"between-camps"` factory line
- `e2e/expedition-helpers.ts` - shared Expedition e2e helper contract (createExpeditionRoom, startExpeditionGame, waitForBridge, getModel, getScene, clickObject, hoverObject, waitForModel)
- `e2e/expedition-mount.spec.ts` - 3 tests: one-canvas-per-player + draft-offer shape, no double-mount/WebGL-leak across 5 navigations, whole-number scaling at 3 viewport sizes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] BetweenCampsScene left a stale store subscription across React Strict Mode's dev-only double mount**
- **Found during:** Task 2, first Playwright run of `expedition-mount.spec.ts` (test 1 passed but logged an uncaught `TypeError: Cannot read properties of null (reading 'add')` from the web dev server console)
- **Issue:** `ExpeditionPhaserMount.tsx`'s Strict Mode teardown calls `game.destroy(true)` directly on the first `Phaser.Game` instance without first calling `scene.stop()`. Phaser's `SHUTDOWN` scene event only fires from an explicit `stop()`; a scene destroyed via `game.destroy()` instead fires `DESTROY`. `BetweenCampsScene`'s original `create()` only listened for `SHUTDOWN`, so its store subscription was never torn down — when the second (post-double-mount) `ExpeditionBoard` instance's effect called `store.getState().setServer(...)`, the dead first scene's stale callback fired `renderModel()` against a scene whose `this.add` had already gone null, throwing.
- **Fix:** Added a shared `teardown` closure registered on BOTH `Phaser.Scenes.Events.SHUTDOWN` and `Phaser.Scenes.Events.DESTROY`, and guarded `renderModel()` with `this.unsubscribe === null` as a belt-and-suspenders check.
- **Files modified:** `apps/web/components/expedition/phaser/scenes/BetweenCampsScene.ts`
- **Commit:** `dd17660` (bundled with the Task 2 commit, since it was found and fixed while verifying Task 2's Playwright run)
- **Note:** `CampScene.ts` (Plan 12-08, unmodified by this plan) has the identical SHUTDOWN-only pattern and is architecturally exposed to the same race, but it was out of this plan's `files_modified` scope and was never exercised as the FIRST active scene in this plan's specs (a fresh Expedition run always starts at the fireside, so `between-camps` — not `camp` — is the scene alive at the moment of Strict Mode's double mount). Flagging this as a candidate fix for whichever future plan next touches `CampScene.ts`.

## Known Stubs

- `BetweenCampsScene.ts` is itself an intentional, documented stub (D-01): a bare functional draft/loadout/ready scene, explicitly throwaway. Phase 13 replaces it wholesale with the real fireside scene (trail map, backpack, hover-only rules text) and deletes this file plus its registry line and `between-camps-model.ts`. This is not an unintended gap — it is the plan's stated deliverable.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries were introduced. All dispatch calls use the same 8 fixed `RunAction` literal shapes already validated by `packages/rules/src/expedition/adapter/request-guards.ts` (T-12-23).

## Verification

- `npm run typecheck` — exits 0
- `npx vitest run --project web phaser-import-confinement` — 3 tests passed
- `npx vitest run --project web` (full suite) — 58 files, 775 tests passed
- `npx playwright test e2e/expedition-mount.spec.ts` — 3 passed, no console errors
- All acceptance-criteria greps confirmed directly (pick-draft/set-loadout/ready count >= 3, between-camps registry line count 1, D-01 comment present, CampScene.ts untouched, page.mouse.click present in helpers, no `../apps` import in helpers, Lobby.tsx diff unchanged from before this task)

## Self-Check: PASSED

- FOUND: apps/web/components/expedition/phaser/scenes/BetweenCampsScene.ts
- FOUND: apps/web/components/expedition/phaser/scenes/scene-registry.ts (modified)
- FOUND: e2e/expedition-helpers.ts
- FOUND: e2e/expedition-mount.spec.ts
- FOUND commit 7fa83c1 (Task 1)
- FOUND commit dd17660 (Task 2)
