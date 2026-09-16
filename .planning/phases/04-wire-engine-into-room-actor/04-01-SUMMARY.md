---
phase: 04-wire-engine-into-room-actor
plan: 01
subsystem: api
tags: [zod, schema, hanabi, redaction, wire-protocol]

# Dependency graph
requires:
  - phase: 03-hanabi-rules-engine
    provides: HanabiView/HanabiCardView/HistoryEntryView type shapes (packages/rules/src/hanabi/state.ts) that this schema mirrors field-for-field
  - phase: 02-per-seat-redaction-contract
    provides: the forehead-card.ts strict-schema/subpath-export template this plan copies
provides:
  - "packages/schema/src/games/hanabi.ts: strict, game-namespaced HanabiViewSchema/HanabiViewWire/HANABI_GAME_ID"
  - "the @games/schema/games/hanabi subpath, resolvable as a bare specifier in tsc and all four Vitest projects, alias-ordered before the bare @games/schema alias"
affects: [04-02, 04-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "z.strictObject at every nesting level (never .omit()/.extend()/.partial()) for a per-seat wire view schema"
    - "z.discriminatedUnion(\"hidden\", ...) so a hidden own-hand card structurally cannot carry suit/rank"
    - "a single z.strictObject (not a discriminated union) for a wire field the engine itself declares as a loose { type; value } shape, to preserve compile-time assignability"

key-files:
  created:
    - packages/schema/src/games/hanabi.ts
    - packages/schema/src/games/hanabi.test.ts
  modified:
    - packages/schema/src/games/subpath.test.ts
    - packages/schema/package.json
    - tsconfig.base.json
    - vitest.config.ts

key-decisions:
  - "ClueValueSchema is one z.strictObject({ type, value }), not a z.discriminatedUnion(\"type\", ...), because HanabiView declares Clue-like wire fields as the loose { type: \"color\"|\"rank\"; value: Suit|Rank }, which a narrower discriminated union cannot absorb — a discriminated union here would make game-registration.ts's compile-time assignability assertion evaluate to never"
  - "The own-hand redaction boundary is carried entirely by the hidden discriminant on HanabiCardViewSchema, not by ClueValueSchema's looseness — the two are independent axes"

patterns-established:
  - "Numeric wire fields bounded to real engine ranges at the schema level (clueTokens 0-8, fuses 0-3, topRank 0-5) rather than left as unbounded ints"

requirements-completed: []

# Metrics
duration: ~35min
completed: 2026-09-16
---

# Phase 4 Plan 1: Strict Hanabi Wire Schema Summary

**Strict, field-for-field Zod mirror of `HanabiView` at `packages/schema/src/games/hanabi.ts`, wired as a `@games/schema/games/hanabi` subpath across `tsconfig.base.json` and all four Vitest projects, proven to reject unknown keys and hidden-card identity leaks at every nesting level.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-16T02:15:00Z (approx)
- **Completed:** 2026-09-16T02:52:50Z
- **Tasks:** 2
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- `HanabiViewSchema` mirrors `HanabiView` (`packages/rules/src/hanabi/state.ts:103-118`) field-for-field, with `z.strictObject` at every nesting level and zero loose `z.object(` calls
- `HanabiCardViewSchema` is a true `z.discriminatedUnion("hidden", ...)` so a hidden own-hand card structurally cannot carry `suit`/`rank`; `HistoryEntryViewSchema` is a true `z.discriminatedUnion("type", ...)` over its four branches
- The `./games/hanabi` subpath resolves as a bare specifier in `tsc -b` and in all four Vitest projects (`schema`, `rules`, `worker`, `web`), with the subpath alias ordered before the bare `@games/schema` alias everywhere it appears
- 13 new tests in `hanabi.test.ts` prove the schema rejects unknown keys at the top level and at every nested level (`otherHands[].cards[]`, `facts`, `history` entries), rejects a hidden card carrying `suit`/`rank`/`suit: undefined`, and rejects out-of-range `clueTokens`/`fuses`/suit/rank values; a deliberate fault injection (adding `suit: "red"` to the valid fixture's hidden card) was confirmed to break a test before being reverted
- `subpath.test.ts` extended with a Hanabi bare-specifier resolution test and a widened barrel-purity check (`index.ts` contains neither `"games/"`, `"ForeheadCard"`, nor `"Hanabi"`)
- The pre-existing forehead-card toy schema, its test, and its wiring are untouched and still green (63/63 schema tests pass; 299/299 across schema+rules+web projects)

## Task Commits

1. **Task 1: Write the strict Hanabi view schema and wire its subpath** - `ace0b3e` (feat)
2. **Task 2: Prove the schema rejects unknown keys and identity-bearing hidden cards** - `4c9ba4e` (test)

**Plan metadata:** (pending — recorded in this commit's companion metadata commit)

## Files Created/Modified
- `packages/schema/src/games/hanabi.ts` - strict Hanabi wire view schema (`HanabiViewSchema`, `HanabiViewWire`, `HANABI_GAME_ID`)
- `packages/schema/src/games/hanabi.test.ts` - rejection-proof test suite (13 tests)
- `packages/schema/src/games/subpath.test.ts` - extended with Hanabi subpath resolution + widened barrel-purity assertion
- `packages/schema/package.json` - added `"./games/hanabi"` to `exports`
- `tsconfig.base.json` - added `@games/schema/games/hanabi` path entry above the bare `@games/schema` key
- `vitest.config.ts` - added `@games/schema/games/hanabi` alias to all four project alias blocks, each ordered before the bare `@games/schema` key

## Decisions Made
- `ClueValueSchema` deliberately stays a single `z.strictObject`, not a `z.discriminatedUnion("type", ...)`, per the plan's explicit instruction — a narrower discriminated union would not be assignable from the engine's loose `{ type; value }` shape and would break the compile-time assertion in plan 04-03's `game-registration.ts`. This is a view-shape concession only; the `hidden` discriminant on `HanabiCardViewSchema` continues to carry the actual redaction boundary.
- Test fixtures in `hanabi.test.ts` use named consts (`ownHiddenCard`, `otherVisibleCard`, `historyPlayEntry`, etc.) rather than array-indexing into `baseValidView` (e.g. `baseValidView.yourHand[0]`), because `tsconfig.base.json`'s `noUncheckedIndexedAccess: true` makes indexed array access possibly-`undefined` and fails `tsc -b`. This is a mechanical adaptation of the plan's described mutation-fixture structure, not a change in test intent.

## Deviations from Plan

None - plan executed exactly as written. The only adjustment was the `noUncheckedIndexedAccess` fixture restructuring above, which does not change test coverage or intent (Rule 3 - blocking compile error, auto-fixed).

## Issues Encountered
- Repo has no root `tsconfig.json` for a bare `npx tsc -b`; per-package `tsc -b <package-dir>` (schema, rules, worker, web) is the working invocation, matching `04-CONTEXT.md`'s D-16 phrasing ("per-package `tsc --noEmit` clean"). Used this form throughout verification.
- Uncommitted `*.tsconfig.tsbuildinfo` build artifacts appeared in `packages/schema`, `packages/rules`, and `apps/worker` after running `tsc -b`; left untracked/uncommitted per this plan's instruction not to touch files outside its own scope (a pre-existing `apps/web/tsconfig.tsbuildinfo` tracked-file diff was also left alone, as instructed).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `apps/worker/src/game-registration.ts`'s Plan 04-03 swap now has a real `HanabiViewSchema`/`HanabiViewWire`/`HANABI_GAME_ID` to import via the bare `@games/schema/games/hanabi` specifier.
- The forehead-card toy and its wiring remain fully intact for Plans 02 through 07; deletion is deferred to Plan 04-08 as instructed.
- No blockers identified for subsequent Phase 4 plans.

---
*Phase: 04-wire-engine-into-room-actor*
*Completed: 2026-09-16*

## Self-Check: PASSED
