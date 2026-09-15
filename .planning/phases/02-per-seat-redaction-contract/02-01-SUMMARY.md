---
phase: 02-per-seat-redaction-contract
plan: 01
subsystem: testing
tags: [fast-check, vitest, prng, redaction, game-adapter, zero-dependency]

# Dependency graph
requires:
  - phase: 01-room-transport-skeleton
    provides: GameAdapter interface (packages/rules/src/adapter.ts), the D-15 counter placeholder this toy replaces conceptually (deletion deferred to a later plan)
provides:
  - "packages/rules/src/shuffle.ts: zero-dependency cyrb128+sfc32 128-bit-state seeded PRNG, Fisher-Yates shuffle, opaque card-id minting"
  - "packages/rules/src/forehead-card.ts: the toy secret-holding GameAdapter (foreheadCardGame) with whitelist-constructed per-seat views"
  - "packages/rules/src/forehead-card-leak-check.ts: the single shared leak checker (checkSeatViewForLeaks, secretsForSeat) reused by all D-11 layers"
  - "packages/rules/src/forehead-card.property.test.ts: D-11 layer-1 fast-check property (numRuns 200) proving no seat's view ever leaks its own card"
  - "D-13 canary suite proving the leak checker can fail (9 canaries + clean baseline)"
affects: [02-02, 02-03, 02-04, 02-05 (apps/worker wiring and apps/web UI plans in this phase, and Plan 05's deletion of the D-15 counter)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Whitelist discriminated-union projection: toPlayerView never spreads/omits/nulls — own card is always a brand-new { id, hidden: true } object literal"
    - "Structural key-presence leak detection (`\"value\" in entry`), never a truthiness/undefined check, so JSON.stringify's undefined-dropping behavior can't mask a latent bug"
    - "Fails-closed toPlayerView for an unknown/unseated viewer: placeholder yourCard, every hand rendered hidden"
    - "Single shared leak-checker module intended for reuse across all three D-11 layers (adapter property test here; wire property test and wrangler-dev integration test in later plans of this phase)"

key-files:
  created:
    - packages/rules/src/shuffle.ts
    - packages/rules/src/shuffle.test.ts
    - packages/rules/src/forehead-card.ts
    - packages/rules/src/forehead-card.test.ts
    - packages/rules/src/forehead-card-leak-check.ts
    - packages/rules/src/forehead-card-leak-check.test.ts
    - packages/rules/src/forehead-card.property.test.ts
  modified:
    - packages/rules/src/adapter.test.ts
    - packages/rules/src/index.ts

key-decisions:
  - "sfc32 seeded from all 4 cyrb128 words (128-bit state) chosen over a 32-bit PRNG (mulberry32) so the deck order can't be brute-forced from visible cards, matching mintGameSeed's 128-bit secret"
  - "Card ids minted from an independent 'card-ids' PRNG stream, never the pre-shuffle deck index (D-04)"
  - "fast-check's hexaString was removed from the installed 4.9.0 API; used fc.stringMatching(/^[0-9a-f]{32}$/) instead for the seed arbitrary"
  - "checkSeatViewForLeaks/secretsForSeat live in packages/rules (not apps/worker) since the D-11 layer-1 property test needed them at zero extra dependency cost; still designed for reuse by later worker-side layers per the file's own header comment"

patterns-established:
  - "Exact-key-count hostile-input guard (isGuessRequest) mirroring counter-game.ts's isIncrementRequest"
  - "Non-mutating applyAction: every accepted branch returns brand-new object literals, verified by structuredClone snapshot-diff tests"

requirements-completed: [HIDE-01, HIDE-03, HIDE-04]

# Metrics
duration: ~20min
completed: 2026-09-15
---

# Phase 2 Plan 1: Toy Secret-Holding Game and Shared Leak Checker Summary

**Built the "forehead card" toy GameAdapter (seeded 16-card deck, per-seat hidden card, public reveal-on-guess) plus the single shared leak checker, its D-13 canary suite, and the D-11 layer-1 fast-check property test proving no seat's projected view ever exposes its own card.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-15T19:16:00Z (approx.)
- **Completed:** 2026-09-15T19:21:00Z
- **Tasks:** 3
- **Files modified:** 9 (7 created, 2 modified)

## Accomplishments
- Zero-dependency, deterministic, 128-bit-state seeded PRNG (`shuffle.ts`) used for deck order and opaque card-id minting
- `foreheadCardGame`: a full `GameAdapter` implementation whose `toPlayerView` whitelist-constructs every card, so a seat's own card structurally cannot carry a `value` key
- Single shared leak checker (`checkSeatViewForLeaks`/`secretsForSeat`) proven able to detect 8 distinct leak shapes via canary tests, plus proven able to pass a clean real view
- D-11 layer-1 property test: 200 random games (2-5 seats, random seeds, random guess sequences) with zero leaks detected at every state transition, plus a deterministic full-game test
- Manually verified the property test genuinely fails against a deliberately leaky projection (temporary edit, reverted, not committed) — the canary evidence extends to the property test itself, not just the unit canaries

## Task Commits

Each task was committed atomically:

1. **Task 1: Zero-dependency seeded PRNG, shuffle, and card-id minting** - `7d36159` (feat)
2. **Task 2: The forehead-card toy adapter with whitelist projection** - `8cbfc60` (feat)
3. **Task 3: Shared leak checker, D-13 canary, and D-11 layer-1 property test** - `717569d` (feat)

**Plan metadata:** (this commit, following this SUMMARY)

_TDD applied to all three tasks: each test file was written and confirmed RED (module-not-found) before its implementation, then confirmed GREEN._

## Files Created/Modified
- `packages/rules/src/shuffle.ts` - cyrb128+sfc32 seeded PRNG, Fisher-Yates shuffle, mintCardId
- `packages/rules/src/shuffle.test.ts` - determinism, non-mutation, permutation, and id-uniqueness tests
- `packages/rules/src/forehead-card.ts` - foreheadCardGame adapter (createInitialState/applyAction/toPlayerView/checkGameEnd)
- `packages/rules/src/forehead-card.test.ts` - unit tests for every behavior bullet in the plan
- `packages/rules/src/forehead-card-leak-check.ts` - checkSeatViewForLeaks, secretsForSeat
- `packages/rules/src/forehead-card-leak-check.test.ts` - clean baseline + 8 D-13 canaries + secretsForSeat unit tests
- `packages/rules/src/forehead-card.property.test.ts` - D-11 layer-1 fast-check property (numRuns 200) + deterministic 5-seat game test
- `packages/rules/src/adapter.test.ts` - added forehead-card conformance suite; extended purity file list
- `packages/rules/src/index.ts` - re-exported foreheadCardGame, FOREHEAD_CARD_VALUES, view/state types, checkSeatViewForLeaks, secretsForSeat, SeatSecrets

## Decisions Made
- 128-bit sfc32 state over 32-bit mulberry32, matching mintGameSeed's secret size (see key-decisions above)
- `fc.stringMatching(/^[0-9a-f]{32}$/)` in place of the plan's suggested `fc.hexaString`, which does not exist in the installed fast-check 4.9.0 (Rule 1 — blocking fix, functionally equivalent)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `fast-check@4.9.0` has no `hexaString` export**
- **Found during:** Task 3 (D-11 layer-1 property test)
- **Issue:** The plan's action block specifies `fc.uint8Array(...)` mapped to hex / effectively `fc.hexaString`; the installed fast-check version does not export `hexaString`, causing a `TypeError` at test run time.
- **Fix:** Used `fc.stringMatching(/^[0-9a-f]{32}$/)` to generate the same 32-char lowercase-hex seed shape.
- **Files modified:** `packages/rules/src/forehead-card.property.test.ts`
- **Verification:** `npx vitest run --project rules forehead-card.property` passes with 200 runs.
- **Committed in:** `717569d` (Task 3 commit)

**2. [Rule 1 - Bug] Purity test false-positive on the substring `node:` inside a parameter type annotation**
- **Found during:** Task 3 (leak checker implementation)
- **Issue:** `adapter.test.ts`'s purity test scans new files for the forbidden substring `"node:"` (meant to catch `import ... from "node:fs"`-style imports). The leak checker's recursive walker had a parameter named `node: unknown`, whose declaration text literally contains the substring `node:`, tripping the check even though no Node import was present.
- **Fix:** Renamed the parameter from `node` to `subtree` throughout `walkStructural`.
- **Files modified:** `packages/rules/src/forehead-card-leak-check.ts`
- **Verification:** `npx vitest run --project rules` (full suite) passes, including the purity test.
- **Committed in:** `717569d` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — blocking bugs, no scope creep)
**Impact on plan:** Both fixes were required for the plan's own stated tests to run at all; neither changed the plan's intended behavior or interfaces.

## Note on acceptance-criteria grep false positive

Task 2's acceptance criterion `grep ... '\.\.\.|delete |Object\.assign|omit\(|value: (null|undefined)'` outputs 0 was not literally 0 — it matched 2 lines: `seatIds: [...seatIds]` and `revealed: [...state.revealed, revealedEntry]`. Both are **array-literal** copy spreads (the same non-mutation idiom `counter-game.ts` already uses, e.g. `seatIds: [...seatIds]`), not the forbidden **object-literal** spread (`{...card}`) that D-05 actually prohibits in projection code. Neither line is inside `toPlayerView`. No object literal anywhere in `forehead-card.ts` uses spread, `delete`, `Object.assign`, an omit helper, or `value: null`/`value: undefined`. Left as-is; flagging here rather than distorting the non-mutation idiom to satisfy an overly literal grep.

## Issues Encountered
None beyond the two auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `foreheadCardGame`, `FOREHEAD_CARD_VALUES`, and the leak-check helpers are exported from `@games/rules`, ready for Plan 02's Zod schema, Plan 03's worker wiring, and Plan 05's web UI, all specified against the exact names in this plan's interfaces block.
- The D-15 counter placeholder is intentionally still present (`counter-game.ts`, `room-state.ts`'s `const adapter = counterGame`, `CounterGame.tsx`) — deletion is Plan 05's job per this plan's objective note.
- The shared leak checker's file header documents its intended reuse by apps/worker's wire property test (D-11 layer 2) and wrangler-dev integration test (D-11 layer 3); those layers still need to be built in this phase's later plans.

---
*Phase: 02-per-seat-redaction-contract*
*Completed: 2026-09-15*
