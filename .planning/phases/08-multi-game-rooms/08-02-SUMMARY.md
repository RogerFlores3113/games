---
phase: 08-multi-game-rooms
plan: 02
subsystem: contracts
tags: [typescript, zod, generics, game-adapter, schema, registry-prep]

# Dependency graph
requires: [08-01]
provides:
  - "Generic GameAdapter<TState, TAction, TConfig, TEndResult, TError> (D-06)"
  - "GameIdSchema closed enum (D-09), currently [\"hanabi\"] only"
  - "HanabiErrorCodeSchema closed 9-member error vocabulary (D-07 prep)"
  - "CreateRoomRequestSchema discriminated on gameId (D-03 prep)"
affects: [08-03, 08-04, 08-05, 08-06, 08-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GameAdapter has no default type arguments — the seam cannot silently re-specialize back to Hanabi's shapes (Pitfall 17)"
    - "Per-game closed error enums mirror AdapterError 1:1 by name, re-exported through the existing games/<name> subpath rather than a new package export"
    - "z.discriminatedUnion(\"gameId\", [...strictObject per game...]) is the per-game request/error shape idiom, matching the existing ClientMessageSchema/ServerMessageSchema convention"

key-files:
  created:
    - packages/schema/src/games/hanabi-errors.ts
    - packages/schema/src/create-room.ts
    - packages/schema/src/create-room.test.ts
  modified:
    - packages/rules/src/adapter.ts
    - packages/rules/src/adapter.test.ts
    - packages/rules/src/hanabi/adapter.ts
    - packages/rules/src/hanabi/actions.ts
    - packages/rules/src/hanabi/discard-order.property.test.ts
    - packages/rules/src/hanabi/termination.property.test.ts
    - packages/rules/src/hanabi/variant-matrix.test.ts
    - packages/rules/src/hanabi/conservation.property.test.ts
    - packages/rules/src/hanabi/redaction.property.test.ts
    - packages/rules/src/hanabi/nameable-colour.property.test.ts
    - apps/worker/src/room-state.ts
    - packages/schema/src/room.ts
    - packages/schema/src/room.test.ts
    - packages/schema/src/games/hanabi.ts
    - packages/schema/src/games/hanabi.test.ts
    - packages/schema/src/index.ts

key-decisions:
  - "GameAdapter's five type parameters have no defaults, so a future call site cannot compile without deliberately naming a game's TConfig/TEndResult/TError — the type system enforces D-06's registry-first ordering rather than relying on convention"
  - "hanabi-errors.ts's file-header comment was reworded to avoid the literal substring 'z.string()' inside a comment, since the plan's own acceptance grep for that exact string would otherwise false-positive on prose rather than code"

patterns-established:
  - "Every additive schema export documents which future plan (08-03, 08-09) is its actual consumer, so a reviewer can tell 'used now' from 'wired later' at a glance"

requirements-completed: []

# Metrics
duration: 20min
completed: 2026-09-23
---

# Phase 8 Plan 02: Generic Adapter Contracts and Additive Registry Schemas Summary

**`GameAdapter` widened to five type parameters with zero behavioral change to Hanabi, plus three new additive Zod contracts (`GameIdSchema`, `HanabiErrorCodeSchema`, `CreateRoomRequestSchema`) that plans 08-03 through 08-09 wire into the actual room/wire layer.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2
- **Files modified:** 17 (14 modified + 3 created)

## Accomplishments

- `packages/rules/src/adapter.ts`'s `GameAdapter<TState, TAction>` widened to `GameAdapter<TState, TAction, TConfig, TEndResult, TError extends string>`, deliberately with no default type arguments (D-06, Pitfall 17) — `AdapterResult<TState, TError>` and `checkGameEnd`'s return type are now parameterized instead of hardcoded to Hanabi's `AdapterError`/`GameEndResult`
- `hanabiGame` re-annotated as `GameAdapter<HanabiState, HanabiAction, Variant, GameEndResult, AdapterError>`; `createInitialState` destructures `config: variant` (the envelope rename), function body byte-for-byte unchanged — MGR-04 holds
- Six Hanabi property/unit test files had their `createInitialState({ ..., variant, ... })` call-site key renamed to `config`; every other use of the word `variant` (the engine's own internal vocabulary, `HanabiState.variant`, `variantConfig()`, etc.) is untouched
- `apps/worker/src/room-state.ts`'s `startGame` now passes `config: state.variant` into `createInitialState`
- New `GameIdSchema = z.enum(["hanabi"])` in `packages/schema/src/room.ts` (D-09) — the closed production-registered-games list Expedition joins in Phase 11
- New `packages/schema/src/games/hanabi-errors.ts` exports `HanabiErrorCodeSchema`, a closed 9-member enum matching `AdapterError` 1:1 by name; re-exported from `games/hanabi.ts` so the worker's existing `@games/schema/games/hanabi` subpath import keeps working with no new package export/alias/tsconfig path
- New `packages/schema/src/create-room.ts` exports `CreateRoomRequestSchema = z.discriminatedUnion("gameId", [...])` with one `z.strictObject` member for Hanabi (`displayName` + `config: VariantSchema`), fail-closed on an unrecognized `gameId`, a missing/invalid `config`, or any extra key; re-exported from `packages/schema/src/index.ts`, whose text still contains neither `"games/"` nor `"Hanabi"` (the barrel-confinement guarantee `subpath.test.ts` checks holds)
- 16 new tests written first (TDD, Task 2): `GameIdSchema` accept/reject cases in `room.test.ts`, `HanabiErrorCodeSchema`'s exact option order in `hanabi.test.ts`, and the full accept/reject matrix from the plan's `<behavior>` block in the new `create-room.test.ts`

## Task Commits

1. **Task 1: Generic GameAdapter (D-06) with the Hanabi call-site rename** — `3636748` (refactor)
2. **Task 2: Additive schema contracts — GameIdSchema, HanabiErrorCodeSchema, CreateRoomRequestSchema** — `51a4a8e` (feat)

## Files Created/Modified

- `packages/rules/src/adapter.ts` — `GameAdapter`/`AdapterResult`/`checkGameEnd` generalized to five type parameters
- `packages/rules/src/adapter.test.ts` — `describeAdapterConformance`'s adapter parameter widened to `GameAdapter<any, any, any, any, any>`; `createInput`'s `variant` key renamed to `config`
- `packages/rules/src/hanabi/adapter.ts` — annotation and destructure updated; function body unchanged
- `packages/rules/src/hanabi/actions.ts` — six `AdapterResult<HanabiState>` return annotations widened to `AdapterResult<HanabiState, AdapterError>` (Rule 3 fix, see Deviations)
- `packages/rules/src/hanabi/{discard-order,termination,conservation,redaction,nameable-colour}.property.test.ts`, `variant-matrix.test.ts` — `createInitialState` call-site key renamed `variant` → `config` only
- `apps/worker/src/room-state.ts` — `startGame`'s `createInitialState` call passes `config: state.variant`
- `packages/schema/src/room.ts` — new `GameIdSchema`/`GameId`
- `packages/schema/src/room.test.ts` — new `GameIdSchema` describe block
- `packages/schema/src/games/hanabi-errors.ts` — new file, `HanabiErrorCodeSchema`/`HanabiErrorCode`
- `packages/schema/src/games/hanabi.ts` — re-exports `HanabiErrorCodeSchema`/`HanabiErrorCode`
- `packages/schema/src/games/hanabi.test.ts` — new `HanabiErrorCodeSchema` describe block
- `packages/schema/src/create-room.ts` — new file, `CreateRoomRequestSchema`/`CreateRoomRequest`
- `packages/schema/src/create-room.test.ts` — new file, full accept/reject matrix
- `packages/schema/src/index.ts` — `export * from "./create-room"` added

## Decisions Made

- `GameAdapter`'s five type parameters carry no defaults, so any future adapter registration must name its own `TConfig`/`TEndResult`/`TError` explicitly — this is a compile-time enforcement of D-06's "never re-specialize the seam back to Hanabi" intent (Pitfall 17), not merely a documented convention.
- `hanabi-errors.ts`'s header comment was reworded mid-task to avoid the literal substring `z.string()` appearing anywhere in the file (even in prose) — the plan's own acceptance criterion greps for that exact string to prove no free-text widening exists, and a comment mentioning it by name would have been a false positive against the file's own guarantee.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `packages/rules/src/hanabi/actions.ts`'s six `AdapterResult<HanabiState>` annotations needed a second type argument**
- **Found during:** Task 1, immediately after widening `AdapterResult<TState>` to `AdapterResult<TState, TError extends string>`
- **Issue:** `actions.ts` (not listed in Task 1's `<files>`) calls six functions each annotated `): AdapterResult<HanabiState> { ... }`. Once `AdapterResult` requires two type arguments, these six sites fail to compile (`TS2314: Generic type 'AdapterResult' requires 2 type argument(s)`), blocking `npm run typecheck`.
- **Fix:** Added `AdapterError` to the file's `import type { ... } from "../adapter"` and widened each of the six annotations to `AdapterResult<HanabiState, AdapterError>`. No behavioral change — `AdapterError` is exactly the error type these functions already returned.
- **Files modified:** `packages/rules/src/hanabi/actions.ts`
- **Commit:** `3636748`
- **Note:** this widens the plan's own acceptance criterion ("`git diff --stat` for `packages/rules/src/hanabi/` excluding tests lists only `adapter.ts`") to include `actions.ts` as well — documented here since the criterion as literally written no longer holds; the underlying invariant it protects (no behavioral change to Hanabi, MGR-04) does hold, confirmed by the full 1029-test suite passing unchanged in Task 1 and 1045 in Task 2.

Otherwise: plan executed exactly as written.

## Issues Encountered

None beyond the Rule 3 fix above. `npm test` (1045/1045) and `npm run typecheck` (`tsc -b`, root) both pass cleanly at the end of both tasks.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `GameAdapter`'s generic seam, `GameIdSchema`, `HanabiErrorCodeSchema`, and `CreateRoomRequestSchema` are all in place, additive-only, and unconsumed by production code paths yet — plan 08-03 (namespaced wire errors + the actual registry) is the first consumer.
- No blockers for plan 08-03.

---
*Phase: 08-multi-game-rooms*
*Completed: 2026-09-23*

## Self-Check: PASSED

All files listed under Files Created/Modified confirmed present on disk (`packages/schema/src/create-room.ts`, `create-room.test.ts`, `games/hanabi-errors.ts` confirmed newly created; all modified files confirmed changed via `git show --stat` on both commits). Commits `3636748` and `51a4a8e` confirmed present in `git log --oneline`.
