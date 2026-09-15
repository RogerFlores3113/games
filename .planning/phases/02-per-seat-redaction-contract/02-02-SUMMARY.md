---
phase: 02-per-seat-redaction-contract
plan: 02
subsystem: schema
tags: [zod, strict-schema, discriminated-union, wire-protocol, redaction]

# Dependency graph
requires:
  - phase: 02-per-seat-redaction-contract
    plan: 01
    provides: ForeheadCardView TS type (packages/rules/src/forehead-card.ts) this schema structurally mirrors
provides:
  - "packages/schema/src/games/forehead-card.ts: strict, game-namespaced Zod view schema (ForeheadCardViewSchema, FOREHEAD_CARD_GAME_ID), reachable only via @games/schema/games/forehead-card"
  - "packages/schema/src/messages.ts: ErrorDetailSchema closed enum (D-08), ErrorMessageSchema.detail is no longer a free string"
affects: [02-03 (worker wiring: #viewFor schema-gate + #send chokepoint import this module)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Strict-at-every-nesting-level Zod schemas (z.strictObject nested inside z.strictObject, never z.object) so an unknown key at any depth fails validation, not just at the top level"
    - "Discriminated union on a boolean literal field (hidden: true | false) makes the hidden variant's shape (no value key) a compile-time and runtime invariant, not a convention"
    - "Subpath package export + tsconfig path + per-project vitest alias, ordered before the generic package alias, so a game-specific module is reachable only through its own import path and never through the package barrel"

key-files:
  created:
    - packages/schema/src/games/forehead-card.ts
    - packages/schema/src/games/forehead-card.test.ts
    - packages/schema/src/games/subpath.test.ts
  modified:
    - packages/schema/package.json
    - tsconfig.base.json
    - vitest.config.ts
    - packages/schema/src/messages.ts
    - packages/schema/src/messages.test.ts

key-decisions:
  - "ForeheadCardViewSchema lives under packages/schema/src/games/ (a new subfolder), exported only via the package.json 'exports' subpath './games/forehead-card' and a matching tsconfig.base.json paths entry — never re-exported from packages/schema/src/index.ts, keeping the generic barrel and RoomViewSchema.game (z.unknown()) untouched (D-06, FDN-01)"
  - "Vitest alias resolution is prefix-based in insertion order, so the subpath alias key was inserted before the generic @games/schema key in all four vitest projects (schema, rules, worker, web) to avoid being swallowed"
  - "ErrorDetailSchema is a single-member enum (z.enum(['view_unavailable'])) rather than a broader closed set, since 'view_unavailable' is the only detail value this phase's D-07 fail-closed path needs to emit"

requirements-completed: [HIDE-03, HIDE-02]

# Metrics
duration: ~15min
completed: 2026-09-15
---

# Phase 2 Plan 2: Strict Game-Namespaced View Schema and Closed Error Detail Summary

**Built the strict, discriminated-union Zod schema that rejects every forehead-card leak shape (including `value: undefined`) before a view is ever stringified, wired it behind a dedicated `@games/schema/games/forehead-card` subpath that bypasses the generic barrel, and closed `ErrorMessageSchema.detail` to a fixed enum so error frames can never carry free-text state.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-15T19:24:00Z (approx.)
- **Completed:** 2026-09-15T19:28:00Z
- **Tasks:** 3
- **Files modified:** 8 (5 created, 3 modified — plus messages.ts/messages.test.ts under Task 3, counted separately below)

## Accomplishments
- `ForeheadCardViewSchema`: `z.strictObject` at every nesting level (top-level view, card entries, other-card wrapper, revealed entries) composed with a `z.discriminatedUnion("hidden", ...)` — a hidden card structurally cannot carry a `value` key present, `null`, or `undefined`, and `yourCard` is typed as the hidden variant only so a visible own card is unrepresentable
- Confirmed via test that `"value" in fixture` is `true` for a `value: undefined` fixture before asserting the schema rejects it — proves the rejection is structural (`Object.keys`-based), not a truthiness/stringify-based check
- Subpath wiring across `package.json` exports, `tsconfig.base.json` paths, and all four `vitest.config.ts` projects' `resolve.alias` (subpath key ordered first in every project); `subpath.test.ts` proves the bare specifier resolves and that `packages/schema/src/index.ts` never mentions `games/` or `ForeheadCard`, and that `RoomViewSchema.game` still accepts an arbitrary object
- `ErrorDetailSchema = z.enum(["view_unavailable"])` replaces the previous free `z.string()` on `ErrorMessageSchema.detail`; confirmed via grep that no existing code in `apps/web`, `apps/worker/src`, or `e2e` sent or read a free-text `detail` before this change

## Task Commits

Each task was committed atomically:

1. **Task 1: Strict game-namespaced view schema** - `5310a14` (feat)
2. **Task 2: Subpath wiring** - `36e9016` (feat)
3. **Task 3: Close the error-frame free-text field (D-08)** - `f153a08` (feat)

**Plan metadata:** (this commit, following this SUMMARY)

_TDD applied to Tasks 1 and 3 (both `tdd="true"`): each test file was written and confirmed RED (module-not-found for Task 1; one assertion failing for Task 3) before its schema change, then confirmed GREEN. Task 2 (subpath wiring, not TDD) had its test written alongside the config changes and verified passing together._

## Files Created/Modified
- `packages/schema/src/games/forehead-card.ts` - `ForeheadCardViewSchema`, `FOREHEAD_CARD_GAME_ID`, `ForeheadCardViewWire` type
- `packages/schema/src/games/forehead-card.test.ts` - 17 tests covering accept/reject shapes for every behavior bullet
- `packages/schema/src/games/subpath.test.ts` - alias-ordering proof, barrel-purity proof, `RoomViewSchema.game` unknown proof
- `packages/schema/package.json` - added `"./games/forehead-card"` export
- `tsconfig.base.json` - added `"@games/schema/games/forehead-card"` path
- `vitest.config.ts` - added the subpath alias (ordered first) to all four projects
- `packages/schema/src/messages.ts` - `ErrorDetailSchema`, `ErrorDetail` type; `ErrorMessageSchema.detail` narrowed from `z.string().optional()` to `ErrorDetailSchema.optional()`
- `packages/schema/src/messages.test.ts` - 4 new tests for the closed enum

## Decisions Made
- Game-namespaced schema module placed under `packages/schema/src/games/` per the resolved Open Question 1 in `02-RESEARCH.md`, reachable only via its subpath — not `apps/worker/src/`
- Subpath alias inserted as the first key in every vitest project's `resolve.alias`, per Vite's prefix-based insertion-order matching (documented inline with a comment above the first occurrence)

## Deviations from Plan

None — plan executed exactly as written. All three tasks' behavior bullets, acceptance-criteria greps, and verification commands passed on first implementation (after the deliberate RED step for the two TDD tasks).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `ForeheadCardViewSchema` and `FOREHEAD_CARD_GAME_ID` are importable from `@games/schema/games/forehead-card`, ready for Plan 03's worker wiring: `#viewFor` will call `ForeheadCardViewSchema.safeParse(rawView.game)` and fail closed (D-07) into an `error` frame with `detail: "view_unavailable"` on rejection.
- `ErrorDetailSchema` is exported from `@games/schema` (via `messages.ts`'s `export *` in `index.ts`), so Plan 03's worker code can reference `"view_unavailable"` as a typed enum member rather than a bare string literal.
- `packages/schema/src/index.ts` (the generic barrel) is unchanged by this plan — verified by `subpath.test.ts` — so no downstream consumer of `@games/schema`'s top-level exports is affected.

---
*Phase: 02-per-seat-redaction-contract*
*Completed: 2026-09-15*
