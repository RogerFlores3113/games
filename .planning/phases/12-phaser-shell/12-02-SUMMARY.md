---
phase: 12-phaser-shell
plan: 02
subsystem: expedition-scene-inputs
tags: [expedition, phaser-shell, ui-state-machine, catalogue]
dependency-graph:
  requires: []
  provides:
    - "@games/rules GEAR_DISPLAY/BOSS_DISPLAY pure-data catalogue"
    - "apps/web/lib/expedition/local-ui.ts D-02 targeting state machine"
    - "apps/web/lib/expedition/expedition-ids.ts spec §7.5 test-bridge id scheme"
  affects:
    - "Plan 12-05 (buildSceneModel)"
    - "Plan 12-08 (scene store)"
    - "Plans 12-09/12-10 (scenes)"
tech-stack:
  added: []
  patterns:
    - "registry-projection allowlist (catalog-display.ts mirrors view.ts's discipline)"
    - "pure state-machine transitions returning new objects, request only on confirm"
key-files:
  created:
    - packages/rules/src/expedition/adapter/catalog-display.ts
    - packages/rules/src/expedition/adapter/catalog-display.test.ts
    - apps/web/lib/expedition/local-ui.ts
    - apps/web/lib/expedition/local-ui.test.ts
    - apps/web/lib/expedition/expedition-ids.ts
    - apps/web/lib/expedition/expedition-ids.test.ts
  modified:
    - packages/rules/src/index.ts
decisions:
  - "ExpeditionTargetKind/ExpeditionGearWindow are re-aliases of gear-def's TargetKind/GearWindow, not duplicated unions"
  - "catalog-display.ts lives under adapter/ (not a top-level expedition/*.ts) because purity.test.ts's Core fence forbids top-level files from importing ./gear or ./boss"
  - "reconcileLocalUi truncates a gear targeting's selected array at the first invalidated own-card target (drops it and everything selected after), keeping positional target-kind alignment intact"
  - "objectiveObjectId falls back to the objective's own id for no-tricks/exactly-n kinds, which have no card target to label"
metrics:
  duration: ~35min
  completed: 2026-09-27
---

# Phase 12 Plan 02: Phaser-Shell Inputs (Catalogue, Targeting State Machine, Test-Bridge Ids) Summary

Built the three phaser-free contracts every Expedition scene depends on: a function-free gear/boss display catalogue exported from `@games/rules`, a pure D-02 highlight-then-confirm targeting state machine, and the spec §7.5 test-bridge id scheme with card labels.

## What Was Built

**Task 1 — `GEAR_DISPLAY`/`BOSS_DISPLAY` (`packages/rules/src/expedition/adapter/catalog-display.ts`):** an allowlist projection of `GEAR_REGISTRY`/`BOSS_REGISTRY` carrying only `id`/`name`/`size`/`window`/`text`/`downside`/`targets` (gear) and `id`/`name`/`text` (boss, no `modifiers`). Both are JSON-round-trip-lossless (no functions). Barrel-exported from `packages/rules/src/index.ts` alongside the nested `ExpeditionView` field types (`ExpeditionCardIdentityView`, `ExpeditionCardView`, `ExpeditionObjectiveView`, `ExpeditionSeatView`, `ExpeditionGearStatusView`, `ExpeditionCompletedTrickView`, `ExpeditionCurrentTrickView`, `ExpeditionRevealView`, `ExpeditionCampView`, `ExpeditionAttemptView`, `ExpeditionLogEntryView`) that downstream plans need for view-shaped test fixtures.

**Task 2 — `local-ui.ts` (`apps/web/lib/expedition/local-ui.ts`):** the pure D-02 state machine. `beginGearTargeting`/`beginWhisper` gate only on server-computed fields (`view.yourGear[].usableNow`, `view.attempt?.gearWindow`) and never re-derive legality. `candidateIdsForKind` mirrors only the toolkit's target-kind membership filter (teammate/own-card/face-up-objective/own-objective), never `canUse`/`canTarget`. `confirmTargeting` is the sole function that can produce a `RunAction`, building a fresh literal with exactly the wire keys `parseRunAction` expects. `reconcileLocalUi` clears stale targeting (gear no longer usable, window no longer between-tricks) and drops selected/hovered card ids that left the hand.

**Task 3 — `expedition-ids.ts` (`apps/web/lib/expedition/expedition-ids.ts`):** `rankLabel`/`cardLabel`/`SUIT_GLYPH` plus every `hand:`/`trick:`/`reveal:`/`objective:`/`seat:`/`gear:`/`draft:`/`loadout:`/`predeal-use:`/`interactable:` id builder and the fixed `READY_ID`/`WHISPER_ID`/`CONFIRM_ID`/`CANCEL_ID`/`PREDEAL_SKIP_ID`/`LAST_TRICK_ID` constants, matching spec §7.5 exactly. All 54 distinct card identities produce 54 distinct hand ids.

## Verification

- `npx vitest run --project rules catalog-display purity` — 20 tests passed
- `npx vitest run --project web local-ui expedition-ids` — 39 tests passed (26 local-ui, 13 expedition-ids)
- `npm run typecheck` — exits 0
- All plan-listed acceptance-criteria greps (barrel export count, no `modifiers` outside comments, zero phaser/react/zustand imports, zero non-comment `canUse(`/`canTarget(`/`legalPlays(`, `hand:` prefix present, zero non-type imports in `expedition-ids.ts`) pass as specified.

## Deviations from Plan

None — plan executed exactly as written. Two TypeScript-strict-mode fixes were needed to satisfy `noUncheckedIndexedAccess` (non-null assertions/guards on registry-indexed lookups in `catalog-display.test.ts` and `expedition-ids.test.ts`'s local `standard()` fixture helper's return type), both mechanical and within the scope of writing correct tests for the plan's own interfaces — not tracked as separate deviations since they did not change any behavior or contract.

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/adapter/catalog-display.ts
- FOUND: packages/rules/src/expedition/adapter/catalog-display.test.ts
- FOUND: apps/web/lib/expedition/local-ui.ts
- FOUND: apps/web/lib/expedition/local-ui.test.ts
- FOUND: apps/web/lib/expedition/expedition-ids.ts
- FOUND: apps/web/lib/expedition/expedition-ids.test.ts
- FOUND commit 9d14a4c (Task 1)
- FOUND commit abcc268 (Task 2)
- FOUND commit d7e30ab (Task 3)
