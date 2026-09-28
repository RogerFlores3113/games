---
phase: 12-phaser-shell
plan: 12
subsystem: expedition-landing-enablement
tags: [expedition, phaser, landing-picker, e2e, bundle-isolation, production-build]

requires:
  - phase: 12-phaser-shell
    provides: playable camp/between-camps scenes, test bridge, structural guards (Plans 12-01..12-11)
provides:
  - Expedition enabled end to end on the landing picker (LANDING_GAME_OPTIONS)
  - e2e proof the Phaser bundle never loads on the landing page or in a Hanabi game, and does load in an Expedition game
  - Full-mode check-expedition-build proof against a real production build
  - Rules README's interactable/card-pack recipes pointing at the real apps/web registries
affects: []

tech-stack:
  added: []
  patterns:
    - "Bundle-isolation e2e records every script response's text body via page.on('response', ...) filtered to resourceType() === 'script', then asserts presence/absence of Phaser's own runtime string literal signature"

key-files:
  created: []
  modified:
    - apps/web/components/game-ui.tsx
    - e2e/create-room.spec.ts
    - e2e/expedition-create.spec.ts
    - packages/rules/src/expedition/README.md
    - apps/web/components/expedition/phaser/scenes/CampScene.ts

key-decisions:
  - "This plan's own PHASER_SIGNATURE constant in expedition-create.spec.ts is a literal duplicate of check-expedition-build.mjs's, with a comment noting they must stay in sync, rather than importing the script (a Node ESM script, not a module built for import from Playwright's test runtime)"

patterns-established: []

requirements-completed: [SCENE-01, SCENE-12]

duration: ~45min
completed: 2026-09-27
---

# Phase 12 Plan 12: Enable Expedition Landing Option & Prove Bundle Isolation Summary

Flipped `LANDING_GAME_OPTIONS`' Expedition entry from disabled to enabled now that the camp board is playable, proved end to end (both the JS create path and the native form POST path) that this lands a host in a seated Expedition lobby, added an e2e suite proving the Phaser bundle loads only on an Expedition game page (never on `/` or a Hanabi room), re-ran the full-mode production build check, and retired the rules README's Phase-12/14 forward-contract placeholder text for interactables and card packs in favor of naming the real `apps/web` registries.

## Performance

- **Duration:** ~45 min
- **Started:** 2026-09-27 (session start, after reading plan/context/prior summaries)
- **Completed:** 2026-09-27
- **Tasks:** 2 completed, plus one pre-plan Rule-1 fix
- **Files modified:** 5 (0 created)

## Accomplishments

- `game-ui.tsx`'s `LANDING_GAME_OPTIONS` Expedition entry is now `{ value: "expedition", label: "Expedition", disabled: false }`, closing the single flip Phase 8 deliberately held back.
- `e2e/create-room.spec.ts`'s landing-picker test now asserts the Expedition `<option>` is enabled and reads "Expedition" (no more "coming soon"/`toBeDisabled`).
- `e2e/expedition-create.spec.ts` gained a new test proving the JS create path (select Expedition, fill name, click Create room) lands the host in a seated Expedition lobby with zero Hanabi variant radios rendered.
- A new `Phaser bundle isolation (SCENE-01)` describe block in `e2e/expedition-create.spec.ts` proves, via real script-response body recording: the landing page never loads Phaser; a 2-player Hanabi game never loads Phaser; a 3-player Expedition game does (positive control, proving the probe itself works).
- `npm run build:web && npm run check:expedition-build --workspace apps/web` (full mode, no `--skip-phaser-presence`) passed against a real production build: `__expeditionTest` absent from `.next/static`, Phaser signature present.
- `packages/rules/src/expedition/README.md`'s "Add an interactable" and "Add a card pack" sections now name the real `apps/web/components/expedition/phaser/interactables/registry.ts` (`INTERACTABLE_REGISTRY`) and `apps/web/components/expedition/phaser/card-packs/registry.ts` (`CARD_PACK_REGISTRY`, typed against `CardPackId`) registries and their contract tests, replacing the Phase 12/14 forward-looking placeholder prose.

## Task Commits

0. **Pre-plan Rule-1 fix: release CampScene store subscription on DESTROY** - `f6855d4` (fix)
1. **Task 1: Enable the Expedition landing option and update the landing e2e** - `498bcb3` (feat)
2. **Task 2: Bundle-isolation e2e, production build check, README update** - `e218978` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update)

## Files Created/Modified

- `apps/web/components/expedition/phaser/scenes/CampScene.ts` - store-unsubscribe teardown now fires on both `SHUTDOWN` and `DESTROY` (mirroring `BetweenCampsScene`'s Plan 12-10 fix), plus a `this.unsubscribe === null` guard in `syncFromStore`/`renderModel`, closing the same Strict-Mode double-mount race that plan flagged as a candidate fix
- `apps/web/components/game-ui.tsx` - `LANDING_GAME_OPTIONS` Expedition entry flipped to enabled, comment updated
- `e2e/create-room.spec.ts` - landing-picker test updated for the enabled Expedition option
- `e2e/expedition-create.spec.ts` - added the JS-create-path test and the `Phaser bundle isolation (SCENE-01)` describe block (3 tests)
- `packages/rules/src/expedition/README.md` - "Add an interactable"/"Add a card pack" sections rewritten to name the real registries

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CampScene left a stale store subscription across React Strict Mode's dev-only double mount (pre-plan fix, per orchestrator instruction)**
- **Found during:** Explicitly flagged by Plan 12-10's SUMMARY.md as a known candidate fix for whichever plan next touched `CampScene.ts`
- **Issue:** `game.destroy(true)` (Strict Mode's dev-only double-mount teardown) fires only the scene's `DESTROY` event, never `SHUTDOWN`. `CampScene`'s `create()` only unsubscribed from the scene store on `SHUTDOWN`, leaking the subscription so a later `setServer` on the surviving scene's store could call `syncFromStore`/`renderModel` against the torn-down first instance.
- **Fix:** Registered a shared `teardown` closure on both `Phaser.Scenes.Events.SHUTDOWN` and `Phaser.Scenes.Events.DESTROY` (mirroring `BetweenCampsScene`'s existing pattern), and added a `this.unsubscribe === null` guard at the top of `syncFromStore` and `renderModel`.
- **Files modified:** `apps/web/components/expedition/phaser/scenes/CampScene.ts`
- **Commit:** `f6855d4`
- **Verification:** `npm run typecheck` (0 errors), `npx vitest run --project web` (775 tests passed), `npx playwright test e2e/expedition-mount.spec.ts` (3 passed)

None found during Task 1 or Task 2 beyond the pre-plan fix above — both tasks executed as written.

## Known Stubs

None introduced by this plan.

## Threat Flags

None — this plan enables an already-built, already-server-authoritative surface (the landing option) and adds test/doc coverage; it introduces no new network endpoints, auth paths, file access patterns, or schema changes.

## Verification

- `npx playwright test e2e/create-room.spec.ts e2e/expedition-create.spec.ts` — 17 passed (11 + 6)
- `npx vitest run --project web game-agnostic-source` — 4 passed
- `npx vitest run --project web` (full suite) — 58 files, 775 tests passed
- `npm run typecheck` — exits 0
- `npm run build:web && npm run check:expedition-build --workspace apps/web` — exits 0, Phaser signature found, `__expeditionTest` absent
- Acceptance-criteria greps: `label: "Expedition", disabled: false` count 1 in game-ui.tsx; `coming soon` count 0 in create-room.spec.ts; `interactables/registry.ts` count 1, `card-packs/registry.ts` count 1, `built in Phase 14` count 0 in README.md

## Self-Check: PASSED

- FOUND: apps/web/components/game-ui.tsx (modified)
- FOUND: e2e/create-room.spec.ts (modified)
- FOUND: e2e/expedition-create.spec.ts (modified)
- FOUND: packages/rules/src/expedition/README.md (modified)
- FOUND: apps/web/components/expedition/phaser/scenes/CampScene.ts (modified)
- FOUND commit f6855d4 (pre-plan fix)
- FOUND commit 498bcb3 (Task 1)
- FOUND commit e218978 (Task 2)
