---
phase: 11-adapter-schemas-worker-wiring
plan: 06
subsystem: worker-registry
tags: [expedition, registry, zod, gameid, COMM-03]
dependency-graph:
  requires:
    - "Widened GameId/GameErrorDetail/CreateRoomRequest are Plan 11-02's ExpeditionViewSchema/ExpeditionConfigSchema/ExpeditionErrorCodeSchema (packages/schema/src/games/expedition*.ts)"
    - "expeditionGame adapter + ExpeditionConfig/ExpeditionEndResult/ExpeditionView/RunState/RunAction/RunError exports (Plan 11-03, packages/rules)"
  provides:
    - "GameIdSchema = z.enum([\"hanabi\", \"expedition\"]) (packages/schema/src/room.ts)"
    - "GameErrorDetailSchema Expedition member; CreateRoomRequestSchema Expedition member (config: z.null())"
    - "GAME_REGISTRY.expedition entry (apps/worker/src/game-registration.ts): adapter expeditionGame, displayName Expedition, limits {min:3,max:5}, mapExpeditionError (exhaustive 24-case switch)"
    - "Compile-time _AssertExpeditionErrorMutuallyAssignable / _AssertExpeditionViewAssignable / _AssertExpeditionKeysMutuallyAssignable in game-registration.ts"
    - "apps/web/components/expedition/ExpeditionBoard.tsx registered in BOARD_COMPONENTS (Record<GameId, ...> stays exhaustive)"
  affects:
    - "Phase 12 (replaces ExpeditionBoard with the Phaser mount; enables the landing picker's Expedition option)"
tech-stack:
  added: []
  patterns:
    - "Per-game exhaustive error mapper with never-typed default (Hanabi's mapError, mirrored verbatim for mapExpeditionError)"
    - "Compile-time [AdapterView] extends [WireView] + mutual keyof assertions per game, binding the adapter's TS types to the Zod wire schema at typecheck time"
key-files:
  created:
    - apps/web/components/expedition/ExpeditionBoard.tsx
  modified:
    - packages/schema/src/room.ts
    - packages/schema/src/messages.ts
    - packages/schema/src/create-room.ts
    - packages/schema/src/room.test.ts
    - packages/schema/src/messages.test.ts
    - packages/schema/src/create-room.test.ts
    - packages/schema/src/games/expedition.ts
    - apps/worker/src/game-registration.ts
    - apps/worker/src/game-registration.test.ts
    - apps/worker/src/seat-projection.test.ts
    - apps/worker/src/registry.test.ts
    - apps/web/components/game-ui.tsx
    - apps/web/lib/pending-room.test.ts
    - apps/web/app/api/room/route.test.ts
decisions:
  - "packages/schema/src/games/expedition.ts's CampResultViewSchema.campNumber widened from a 1-6 z.literal union to a plain z.number().int().min(1).max(6), matching ExpeditionCampResultView's `campNumber: number` — found by this plan's own [ExpeditionView] extends [ExpeditionViewWire] compile-time assertion (a literal-union inferred type is not assignable from a plain-number field)"
  - "apps/worker/src/registry.test.ts (not in this plan's files_modified list) required a Rule-1 fix: its own D-09/D-10 production-isolation assertions hardcoded GameIdSchema.options/GAME_REGISTRY keys to [\"hanabi\"] only, discovered only by running the plan's full-workspace `npm test` gate"
metrics:
  duration: ~35min
  completed: 2026-09-27
  tasks: 3
  files: 14
---

# Phase 11 Plan 06: Register Expedition in Production Summary

Widened the generic wire schemas (`GameIdSchema`, `GameErrorDetailSchema`, `CreateRoomRequestSchema`) to admit Expedition as a closed, strictly-typed second production game, added its `GAME_REGISTRY` entry with an exhaustive 24-case error mapper and three compile-time view/error assignability assertions, and gave the web app's exhaustive `BOARD_COMPONENTS` map a static placeholder board — wiring Plan 11-02's wire schemas and Plan 11-03's adapter through Phase 8's registry seam while leaving the landing picker disabled per D-12.

## What Was Built

**Task 1 — Generic wire schema widening**

`packages/schema/src/room.ts`: `GameIdSchema` widened to `z.enum(["hanabi", "expedition"])`, doc comment updated to record D-09 fulfilled.

`packages/schema/src/messages.ts`: imported `ExpeditionErrorCodeSchema` (mirroring the existing `HanabiErrorCodeSchema` import) and added a second `GameErrorDetailSchema` member, `{ gameId: "expedition", code: ExpeditionErrorCodeSchema }`.

`packages/schema/src/create-room.ts`: added a second `CreateRoomRequestSchema` union member with `config: z.null()` (MGR-03).

Tests updated across `room.test.ts`, `messages.test.ts`, `create-room.test.ts`: every "unregistered game" example switched from `"expedition"` to `"innovation"` (preserving the original intent — an unknown game is refused), plus new positive Expedition cases (accepted `GameIdSchema`/`RoomViewSchema`/join/`CreateRoomRequestSchema` parses; rejected non-null Expedition configs; a `clue_touches_nothing` `gameError` for `gameId: "expedition"` still throws, proving codes stay per-game closed).

**Task 2 — GAME_REGISTRY entry, compile-time assertions, web board map**

`apps/worker/src/game-registration.ts`: added `mapExpeditionError`, an exhaustive switch over all 24 `RunError` members (7 `CampError` + 17 more) with a `never`-typed default; added the three Expedition compile-time assertions (`_AssertExpeditionErrorMutuallyAssignable`, `_AssertExpeditionViewAssignable`, `_AssertExpeditionKeysMutuallyAssignable`) immediately after Hanabi's; added the `GAME_REGISTRY.expedition` entry via `defineGame<RunState, RunAction, ExpeditionConfig, ExpeditionEndResult, RunError>` with `limits: { min: 3, max: 5 }` (MGR-02). No `gameId === "..."` comparisons and no bare `"expedition"` string literal anywhere in the file (`EXPEDITION_GAME_ID` used throughout).

`apps/web/components/expedition/ExpeditionBoard.tsx` (new): renders the game's `gameDisplayName` and a static "not ready to play in the browser yet" notice; reads no game state, no imports beyond `RoomView`.

`apps/web/components/game-ui.tsx`: registered `expedition: ExpeditionBoard` in `BOARD_COMPONENTS` (no cast needed); `LANDING_GAME_OPTIONS`'s Expedition entry stays `disabled: true` with an updated comment. `LOBBY_SETTINGS`/`LANDING_SETTINGS` left untouched (Expedition has no settings).

**Task 3 — Test updates for the now-registered game**

`game-registration.test.ts`: unregistered `it.each` switched to `"innovation"`; frozen-registry test now expects `["hanabi", "expedition"]`; added coverage for `resolveGame("expedition")` (displayName, limits, defaultConfig, adapter id, configSchema accept/reject) and a test that `mapError` maps all 24 `RunError` names to a `GameErrorDetailSchema`-parseable `{ gameId: "expedition", code }`.

`seat-projection.test.ts`: MGR-05's unregistered-gameId case switched to `"innovation"`; added a sibling case proving a `RoomView` with `gameId: "expedition"` and a schema-mismatched `game` payload still fails closed via `ExpeditionViewSchema`, logging only issue codes/paths (never the leaked value).

`pending-room.test.ts`: "not a registered GameId" case switched to `"innovation"`; added a case proving a stored `"expedition"` now reads back as `"expedition"`.

`apps/web/app/api/room/route.test.ts`: both unknown-gameId cases (JSON and form paths) switched to `"innovation"`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `CampResultViewSchema.campNumber` widened from a literal union to a plain ranged number**
- **Found during:** Task 2, `npm run typecheck` (verifying the new `[ExpeditionView] extends [ExpeditionViewWire]` assertion)
- **Issue:** `packages/schema/src/games/expedition.ts`'s `CampResultViewSchema.campNumber` was `z.union([z.literal(1), ..., z.literal(6)])`, inferring a `1 | 2 | 3 | 4 | 5 | 6` literal-union type. `ExpeditionCampResultView.campNumber` (the adapter's own type, `packages/rules/src/expedition/adapter/view-types.ts`) is plain `number`. A plain `number` is not assignable to a 6-member literal union, so the new compile-time assertion this plan introduces correctly failed — exactly the drift class this assertion exists to catch.
- **Fix:** Widened the schema field to `z.number().int().min(1).max(6)` (matching the top-level `campNumber` field's own existing convention in the same file), preserving identical runtime validation (still rejects 0, 7, non-integers) while fixing the inferred TS type to plain `number`.
- **Files modified:** `packages/schema/src/games/expedition.ts`
- **Commit:** `1c36964`

**2. [Rule 1 - Bug] `apps/worker/src/registry.test.ts` hardcoded `GameIdSchema.options`/`GAME_REGISTRY` keys to `["hanabi"]` only**
- **Found during:** Task 3, running the plan's full-workspace `npm test` gate
- **Issue:** This file is not in the plan's `files_modified` list, but its own D-09/D-10 production-isolation describe block asserted `GameIdSchema.options` and `Object.keys(GAME_REGISTRY)` equal exactly `["hanabi"]`, which broke once Task 1/2 widened both to include Expedition. Left unfixed, `npm test` (an explicit acceptance criterion of this plan) would not exit 0.
- **Fix:** Updated both assertions to `["hanabi", "expedition"]`; retitled the two `it` blocks accordingly. No other assertion in this file (the toy-game unreachability proofs) needed to change.
- **Files modified:** `apps/worker/src/registry.test.ts`
- **Commit:** `f6f3404`

Both deviations were found by running this plan's own verification/acceptance commands before considering a task done; no runtime behavior beyond the registry widening itself changed.

## Known Stubs

`ExpeditionBoard.tsx` is an intentional stub — a static "not ready to play in the browser yet." notice with no game-state reading, no actions. This is explicitly scoped by this plan's `<objective>` (out of scope: enabling the landing-page picker, config mapping, any Phaser rendering) and by Phase 8's D-11/D-12 decisions. Phase 12 replaces it with the real Phaser mount.

## Threat Flags

None beyond this plan's own `<threat_model>` register (T-11-09, T-11-10, T-11-11, T-11-21, T-11-22), all of which map directly to the mitigations implemented here: the compile-time view/error assignability assertions (T-11-09), `CreateRoomRequestSchema`'s `config: z.null()` member (T-11-10), the exhaustive `mapExpeditionError` with a `never` default whose output is proven `GameErrorDetailSchema`-parseable for all 24 codes (T-11-11), `EXPEDITION_GAME_ID`-only literal usage with zero `gameId === "..."` comparisons (T-11-21, verified by grep and by the passing `source-structure.test.ts` suite), and the accepted risk that a crafted request could create an Expedition room before Phase 12's UI exists (T-11-22, accepted per plan). No new, unlisted surface was introduced.

## Self-Check: PASSED

- `apps/web/components/expedition/ExpeditionBoard.tsx` — FOUND
- `packages/schema/src/room.ts` — FOUND (modified, `z.enum(["hanabi", "expedition"])` present)
- `packages/schema/src/messages.ts` — FOUND (modified, Expedition `GameErrorDetailSchema` member present)
- `packages/schema/src/create-room.ts` — FOUND (modified, Expedition member with `config: z.null()` present)
- `apps/worker/src/game-registration.ts` — FOUND (modified, `GAME_REGISTRY.expedition`, `mapExpeditionError`, three `_AssertExpedition*` assertions present)
- `apps/web/components/game-ui.tsx` — FOUND (modified, `expedition: ExpeditionBoard` in `BOARD_COMPONENTS`, `disabled: true` preserved)
- Commit `1c36964` (Tasks 1+2: schema widening + registry entry + board map, committed together per this plan's commit note) — FOUND in `git log`
- Commit `f6f3404` (Task 3: test updates for the now-registered game) — FOUND in `git log`
- `npx vitest run --project schema` — 156 tests passed (8 files)
- `npx vitest run --project worker apps/worker/src/source-structure.test.ts` — 29 tests passed
- `npx vitest run --project worker apps/worker/src/game-registration.test.ts apps/worker/src/seat-projection.test.ts` — 33 tests passed
- `npx vitest run --project web apps/web/lib/pending-room.test.ts apps/web/app/api/room/route.test.ts` — 24 tests passed
- `npm run typecheck` — exits 0
- `npm test` (full workspace) — 1799 tests passed (121 files)
