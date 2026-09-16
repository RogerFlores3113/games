---
phase: 04-wire-engine-into-room-actor
plan: 08
subsystem: testing
tags: [vitest, playwright, source-structure, cleanup]

# Dependency graph
requires:
  - phase: 04-wire-engine-into-room-actor (04-03, 04-05)
    provides: Hanabi engine wired through game-registration.ts and redaction/leak coverage repointed to Hanabi (checkHanabiViewForLeaks/secretsForHanabiSeat)
provides:
  - Forehead-card toy deleted outright from packages/rules, packages/schema, apps/web, and all build wiring (package.json exports, tsconfig paths, vitest aliases)
  - Structural regression guard (existsSync assertions + zero-occurrence identifier check) making toy reintroduction fail the build
  - Green D-16 phase gate (tsc -b, npm test across 4 Vitest projects, npx playwright test)
  - Human-confirmed real two-player Hanabi game satisfying RT-01, RT-03, and own-hand redaction on the wire
affects: [phase-05, any future phase touching packages/rules/src/index.ts or apps/worker/src/source-structure.test.ts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Structural regression guard: existsSync(false) file-existence assertions paired with a zero-occurrence identifier grep, scoped to the identifier not the word, so historical design-rationale comments can be retained deliberately"

key-files:
  created: []
  modified:
    - packages/rules/src/index.ts
    - packages/rules/src/adapter.test.ts
    - packages/schema/package.json
    - packages/schema/src/games/subpath.test.ts
    - tsconfig.base.json
    - vitest.config.ts
    - apps/worker/src/source-structure.test.ts
    - .planning/phases/04-wire-engine-into-room-actor/04-VALIDATION.md

key-decisions:
  - "Human phase-gate sign-off recorded as user's plain approval with no fabricated frame contents or observations — user replied verbatim 'confirmed' with no caveats"

patterns-established:
  - "Zero-occurrence regression checks target the IDENTIFIER (e.g. foreheadCardGame) and FILE EXISTENCE, never a word like 'forehead', so legitimate historical design-rationale prose in comments survives deletion sweeps"

requirements-completed: []

# Metrics
duration: (continuation session; prior executor completed Tasks 1-2)
completed: 2026-09-16
---

# Phase 4 Plan 08: Delete the Forehead-Card Toy and Close the Phase Gate Summary

**Forehead-card toy deleted from source/tests/schema/UI/build-wiring with a non-reversible structural guard, and the full D-16 phase gate (tsc -b, npm test, playwright) confirmed green alongside a human-verified real two-player Hanabi game.**

## Performance

- **Tasks:** 3 (2 completed by prior executor session, Task 3 checkpoint resolved in this continuation)
- **Files modified:** 8 (7 source/config files in Tasks 1-2, 1 doc file in Task 3)

## Accomplishments

- Toy deleted outright: `forehead-card.ts`, `forehead-card-leak-check.ts`, their test/property-test files, `packages/schema/src/games/forehead-card.ts` + test, and `apps/web/components/ForeheadCardGame.tsx` — all removed via `git rm`, with every dangling reference in `packages/rules/src/index.ts`, `adapter.test.ts`, `packages/schema/package.json`, `tsconfig.base.json`, `vitest.config.ts`, and `subpath.test.ts` cleaned up.
- Regression guard hardened in `apps/worker/src/source-structure.test.ts`: the zero-occurrence `foreheadCardGame` identifier check now sits alongside `existsSync` assertions proving the deleted module files are gone from disk, fault-injection-tested by the prior executor (recreating an empty `forehead-card.ts` made the assertion fail, as required).
- Full D-16 gate reported green by the prior executor: per-package `tsc --noEmit` clean, `npm test` 41 files / 417 tests, `npx playwright test` 15/15.
- User ran the 10-step manual verification (two browsers, own-hand identity-free rendering, live clue propagation without reload, mid-game reload to the same seat, disabled-control states, raw WebSocket frame inspection for missing `suit`/`rank` keys) and replied **"confirmed"** with no caveats.

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete the toy and every dangling reference to it** - `d7842c1` (feat)
2. **Task 2: Make the deletion non-reversible by accident** - `130d319` (test)
3. **Task 3: Phase gate — full suite, e2e, and a real two-player game** - checkpoint, resolved by human "confirmed"; sign-off recorded in `04-VALIDATION.md` at `8841c5d` (docs)

**Plan metadata:** (this commit, following SUMMARY.md write)

## Files Created/Modified

- `packages/rules/src/index.ts` - toy export block removed; barrel now carries only the adapter contract and Hanabi engine
- `packages/rules/src/adapter.test.ts` - toy import/conformance call and purity file-list entries removed
- `packages/schema/package.json` - `./games/forehead-card` exports entry removed
- `packages/schema/src/games/subpath.test.ts` - forehead-card import/assertions dropped, Hanabi assertions retained
- `tsconfig.base.json` - forehead-card paths entry removed
- `vitest.config.ts` - forehead-card alias removed from all four project blocks
- `apps/worker/src/source-structure.test.ts` - `existsSync`-based file-deletion assertions added alongside the existing zero-occurrence identifier check
- `.planning/phases/04-wire-engine-into-room-actor/04-VALIDATION.md` - human sign-off recorded for the Task 3 checkpoint (Manual-Only Verifications table + dedicated sign-off section + per-task status row)

## Decisions Made

- Human phase-gate sign-off recorded as the user's plain approval, quoting the verbatim response "confirmed" — no frame contents, card identities, or screenshots were invented or attributed to the user beyond what they actually said.

## Deviations from Plan

None - plan executed exactly as written. Tasks 1-2 were completed and committed by a prior executor session; this continuation resolved the Task 3 checkpoint after the user completed manual verification.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The forehead-card toy exists nowhere in source, tests, schema, UI, or build wiring, and reintroducing it (by file or by identifier) fails the build.
- The full D-16 gate is green and a real two-player base game has been played end to end and confirmed by the user.
- Phase 4 (Wire Engine Into Room Actor) is complete; ready to proceed to Phase 5.

---
*Phase: 04-wire-engine-into-room-actor*
*Completed: 2026-09-16*
