---
phase: 02-per-seat-redaction-contract
plan: 05
subsystem: web+e2e+rules
tags: [redaction, toy-ui, playwright, counter-deletion]

# Dependency graph
requires:
  - phase: 02-per-seat-redaction-contract
    plan: 01
    provides: "foreheadCardGame adapter, FOREHEAD_CARD_VALUES, ForeheadCardView (@games/rules)"
  - phase: 02-per-seat-redaction-contract
    plan: 03
    provides: "worker wiring onto the toy adapter (game-registration.ts, seat-projection.ts)"
provides:
  - "apps/web/components/ForeheadCardGame.tsx: the in-browser D-03 toy screen — other seats' cards face up, own card an empty face-down tile (HIDE-01), turn indicator, guess controls, revealed pile/score/deck-count, end-of-game score"
  - "apps/web/app/room/[code]/RoomClient.tsx renders ForeheadCardGame for in_progress/ended rooms and sends { type: 'guess', value } game_action requests"
  - "e2e/start-game.spec.ts and e2e/in-progress-arrival.spec.ts drive the toy game, including an explicit HIDE-01 browser-surface assertion that a teammate's visible card value never appears in the viewer's own blank tile"
  - "packages/rules/src/counter-game.ts, counter-game.test.ts, and every CounterGame/CounterState/CounterAction/CounterView export deleted (D-02)"
affects: ["02-06 (phase close, if any remaining wrap-up plan exists)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Own-card tile renders zero children — no '?' glyph, no text — so the DOM itself carries no signal about the hidden value, matching the wire contract's structural absence of a value key"
    - "isForeheadCardView type guard checked field-by-field (yourCard/otherCards/revealed present, otherCards/revealed are arrays) before any narrowing cast, avoiding a too-narrow TS union that a direct `as` cast produced"

key-files:
  created:
    - apps/web/components/ForeheadCardGame.tsx
  modified:
    - apps/web/app/room/[code]/RoomClient.tsx
    - e2e/start-game.spec.ts
    - e2e/in-progress-arrival.spec.ts
    - packages/rules/src/index.ts
    - packages/rules/src/adapter.test.ts
    - packages/rules/src/adapter.ts
  deleted:
    - apps/web/components/CounterGame.tsx
    - packages/rules/src/counter-game.ts
    - packages/rules/src/counter-game.test.ts

key-decisions:
  - "isForeheadCardView narrows through `'otherCards' in game` / `'revealed' in game` checks before casting to typed arrays, rather than a direct `(game as {...}).otherCards` cast, because TS's narrowing after only `'yourCard' in game` produced a type with insufficient overlap for a further property-access cast (tsc TS2352)"
  - "Button already spreads ...rest props (confirmed by reading Button.tsx before writing ForeheadCardGame.tsx), so guess buttons pass data-testid directly with no wrapper span needed"

requirements-completed: []

# Metrics
duration: ~25min
completed: 2026-09-15
---

# Phase 2 Plan 5: Forehead-Card Toy UI, E2E Specs, and D-15 Counter Deletion Summary

**Replaced the counter screen with the forehead-card toy UI per UI-SPEC (blank own-card tile, face-up teammate cards, turn indicator, guess controls, revealed pile), updated the two counter-driven Playwright specs to drive the toy and assert HIDE-01 redaction is observable in a real browser, and deleted every remaining D-15 counter trace from packages/rules.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-15T~20:10:00Z (approx.)
- **Completed:** 2026-09-15T~20:35:00Z
- **Tasks:** 3
- **Files modified:** 10 (1 created, 6 modified, 3 deleted)

## Accomplishments
- `ForeheadCardGame.tsx`: a `"use client"` component rendering the D-03 layout top to bottom (turn indicator, other-seats' face-up cards, own blank face-down tile with `data-testid="own-card"` and zero children, guess controls disabled outside the viewer's turn, revealed pile/score/deck-count, and a distinct end-of-game "Game over" / "Final score: {score}" state with no reveal-all branch) — every color/spacing/type value reuses an existing Phase 1 CSS variable, verified by a zero-hex grep
- `RoomClient.tsx` renders `ForeheadCardGame` for both `in_progress` and `ended` rooms, sending `{ type: "game_action", request: { type: "guess", value } }`
- `e2e/start-game.spec.ts` now plays a full toy turn: asserts `own-card` visibility, exact turn-indicator copy, 16 guess buttons with correct enabled/disabled split, a post-guess deck-count of "13 left in deck" and a revealed-entry, and — the HIDE-01 browser-surface check — that each page's own-card tile has empty text and never contains the value visible in that page's teammate's other-card tile
- `e2e/in-progress-arrival.spec.ts` swapped both `counter-value` usages for `own-card`
- `packages/rules/src/counter-game.ts`/`.test.ts` deleted; `index.ts`'s counter exports and `adapter.test.ts`'s counter conformance suite and purity-file entry removed; `adapter.ts`'s stale D-15-counter doc comments updated to reference Phase 2's forehead-card toy

## Task Commits

Each task was committed atomically:

1. **Task 1: ForeheadCardGame screen and RoomClient swap** - `fe01b46` (feat)
2. **Task 2: Update counter-driven Playwright specs to the toy game** - `5008083` (test)
3. **Task 3: Delete the D-15 counter from packages/rules** - `d518337` (feat)

**Plan metadata:** (this commit, following this SUMMARY)

## Files Created/Modified
- `apps/web/components/ForeheadCardGame.tsx` - the D-03 toy screen (created)
- `apps/web/components/CounterGame.tsx` - deleted (D-02)
- `apps/web/app/room/[code]/RoomClient.tsx` - import/render swap to `ForeheadCardGame`
- `e2e/start-game.spec.ts` - toy-driven turn flow + HIDE-01 browser-surface assertion
- `e2e/in-progress-arrival.spec.ts` - `counter-value` → `own-card` testid swap
- `packages/rules/src/counter-game.ts` / `.test.ts` - deleted (D-02)
- `packages/rules/src/index.ts` - counter exports removed, header comment rewritten
- `packages/rules/src/adapter.test.ts` - counter conformance suite and purity-file entry removed
- `packages/rules/src/adapter.ts` - D-15-counter doc comments updated to reference the forehead-card toy

## Decisions Made
- `isForeheadCardView`'s type guard checks `'otherCards' in game` / `'revealed' in game` before casting to typed-array shapes, because TS's narrowing after only the `'yourCard' in game` check produced a type with insufficient overlap for a direct property-access cast (a straight port of `CounterGame.tsx`'s single-property guard pattern did not type-check against `ForeheadCardView`'s three-property shape)
- Guess buttons pass `data-testid` directly to `Button` (confirmed it spreads `...rest`), no wrapper `span` needed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Type guard cast failed tsc under a too-narrow intersection type**
- **Found during:** Task 1 verification (`npx tsc -p apps/web/tsconfig.json --noEmit`)
- **Issue:** `isForeheadCardView`'s original body cast `game` directly to `{ otherCards: unknown }` / `{ revealed: unknown }` after only checking `"yourCard" in game`; TS reported TS2352 ("neither type sufficiently overlaps with the other") because the narrowed type after a single `in` check didn't structurally overlap with the cast target.
- **Fix:** Added `"otherCards" in game` and `"revealed" in game` checks before each array-shaped property cast, matching the property-existence-then-array-check pattern the plan's interface block implied.
- **Files modified:** `apps/web/components/ForeheadCardGame.tsx`
- **Verification:** `npx tsc -p apps/web/tsconfig.json --noEmit` exits 0.
- **Committed in:** `fe01b46` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — blocking type error, no scope creep)
**Impact on plan:** Required for the plan's own stated tsc verification to pass; did not change the component's intended interface or rendered output.

## Issues Encountered
None beyond the one auto-fixed deviation above.

## User Setup Required
None - no external service configuration required. Playwright's Chromium browser was already installed in this environment (`~/.cache/ms-playwright`), so no install step was needed.

## Next Phase Readiness
- Every plan-listed file in `must_haves.artifacts` and `key_links` exists and matches: `ForeheadCardGame.tsx` contains `own-card`, `RoomClient.tsx` contains `ForeheadCardGame` (2x) and exactly one `type: "guess"`, `start-game.spec.ts` contains `guess-button-`.
- `grep -rnE "counterGame|CounterState|CounterAction|CounterView|CounterGame" apps packages e2e` (excluding node_modules/.next/.wrangler) returns no matches — D-02 is fully closed.
- The only remaining `"counter"` string literals in the repo are the intentional opaque persisted-data fixtures in `apps/worker/src/persistence.test.ts` and `apps/worker/src/scheduler.test.ts` (per this plan's explicit instruction to leave them, modeling a pre-swap room under `ROOM_SCHEMA_VERSION`'s reset path).
- `apps/worker/src/room-do.ts` and its D-08/D-09 single-chokepoint structural test were untouched by this plan, as expected — no worker-side change was needed to serve the new toy UI.
- With this plan's D-02/D-03 work done, Phase 2's remaining open item (per 02-CONTEXT.md's Deferred Ideas and prior plan summaries) is only optional Phase 5/6 hardening (a browser-level DevTools network-payload capture test) — nothing blocking for phase close.

## Known Stubs
None. The toy screen is intentionally minimal per D-03/UI-SPEC ("exists to be deleted in Phase 4"), but every element renders real server-pushed data with no hardcoded placeholder values.

---
*Phase: 02-per-seat-redaction-contract*
*Completed: 2026-09-15*

## Self-Check: PASSED

All 7 created/modified source files, both deleted counter files verified absent, and this SUMMARY.md verified present on disk; all 3 commit hashes (`fe01b46`, `5008083`, `d518337`) verified in `git log`.
