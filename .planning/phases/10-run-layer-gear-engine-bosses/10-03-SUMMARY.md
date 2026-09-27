---
phase: 10-run-layer-gear-engine-bosses
plan: 03
subsystem: rules-engine
tags: [expedition, run-layer, rule-composition, balance-table, rng, typescript, vitest]

# Dependency graph
requires:
  - phase: 10-run-layer-gear-engine-bosses
    plan: 01
    provides: "baseRulesWith(isTrumpFn) factory and the composed-hook throw policy (POLICY A3) this plan's composeRules folds isTrump through and ruleLayersFor's throws follow"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 02
    provides: "run/types.ts's RunState/AttemptState/Catalog, run/run-rules.ts's RuleModifier/HOOK_NAMES/baseRunHooks, gear-def.ts/boss-def.ts's passiveModifier/effectModifier/modifiers shapes, run/rng.ts's STREAMS/seededIndex"
provides:
  - "run/compose.ts: composeRules(layers), activeBossId(run), ruleLayersFor(run, catalog), rulesFor(run, catalog) — the single hook-layering entry point every later Phase 10 plan (toolkit, actions, catalogue content) calls to get a composed RunRules"
  - "run/balance.ts: STARTING_SUPPLIES, FINAL_CAMP, BOSS_CAMPS, DRAFT_OFFER_SIZE, TRICK_COUNT_N_RANGE, BALANCE_TABLE, objectiveSlotsFor(seed, campNumber, attemptNumber) — the camp ramp data and camp-5 trick-count resolution every later run-loop plan reads"
affects: [10-04, 10-05, 10-06, 10-07, 10-08, 10-09, 10-10, 10-11, 10-12, 10-13, 10-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "isTrump folded separately and first (WR-03): composeRules folds every layer's isTrump mapper over trick.ts's default isTrump BEFORE building the base RunRules via baseRulesWith(composedIsTrump), so trickWinner/legalPlays automatically honor a trump-only layer with no extra composition code"
    - "one-narrowing-cast-per-hook registry dispatch: composeRules loops HOOK_NAMES and folds each layer's optional mapper via a single `as (prev: RunRules[key]) => RunRules[key]` cast, mirroring objectives.ts's KindRegistry dispatch idiom, so adding a hook to RunRules (Plan 02's HOOK_NAMES exhaustiveness check) is the only place a future hook needs registering"
    - "no-cache-by-construction: compose.ts holds no Map/WeakMap/module state; ruleLayersFor/composeRules/rulesFor read only their arguments, so a changed RunState always recomposes fresh (T-10-08, asserted by a grep gate and a differing-effects test)"
    - "balance data lives in one file: STARTING_SUPPLIES/FINAL_CAMP/BOSS_CAMPS/DRAFT_OFFER_SIZE/TRICK_COUNT_N_RANGE/BALANCE_TABLE are the only tunables for the camp ramp, so a Phase 15 balance pass (BAL-01) touches only run/balance.ts"

key-files:
  created:
    - packages/rules/src/expedition/run/balance.ts
    - packages/rules/src/expedition/run/balance.test.ts
    - packages/rules/src/expedition/run/compose.ts
    - packages/rules/src/expedition/run/compose.test.ts
  modified: []

key-decisions:
  - "The isTrump-only composition test (WR-03) uses an ADDITIVE layer (`prev(identity) || spade`) rather than a replacing one, since a replacing layer that drops jokers from trump changes joker follow-suit behavior in a way that masks the exact 'one hook change ripples into trickWinner/legalPlays' effect the plan's acceptance criterion is checking; the additive form isolates that one behavior change cleanly."
  - "balance.test.ts imports createCamp directly from ../camp (not re-exported through balance.ts) — balance.ts itself has no dependency on camp.ts, keeping its own header claim ('every resolved slot list is valid input to createCamp') proven by the test file, not baked into the balance module's own exports."

requirements-completed: [RUN-03]
# RUN-01 ("A run is six camps... objective counts and difficulty follow the
# balance table") is only PARTIALLY delivered here: BALANCE_TABLE and
# objectiveSlotsFor fully realize the "objective counts and difficulty
# follow the balance table" clause, but "a run is six camps" names the run
# loop itself (camp-to-camp progression, supplies spend, win/loss) — no run
# state machine or transition function exists yet (that is 10-05 onward per
# 10-05-PLAN.md's files_modified). Left unchecked in REQUIREMENTS.md.
# ENG-01 was already marked Complete by Plan 10-01; this plan's compose.ts/
# balance.ts are additional evidence for it (one file + one registry line
# per new gear/boss/objective kind) but require no re-marking.

# Metrics
duration: ~25min
completed: 2026-09-26
---

# Phase 10 Plan 03: Hook-Layering Engine & Balance Table Summary

**`composeRules`/`rulesFor` fold base -> boss -> gear-passive -> gear-effect rule layers fresh on every call with isTrump folded first (WR-03), and `run/balance.ts` encodes the spec §4.3 camp ramp with camp 5's trick-count objective resolved deterministically through Plan 10-02's named RNG streams (D-14/D-15).**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-09-26
- **Tasks:** 2/2 completed
- **Files created:** 4

## Accomplishments

- `run/balance.ts`'s `BALANCE_TABLE` encodes the full spec §4.3 camp ramp (2/3/3/4/4/5 objective slots for camps 1-6, boss camps 3/6, ordered ①② pairs on camps 4/6, camp 5's trick-count placeholder), with `STARTING_SUPPLIES`, `FINAL_CAMP`, `BOSS_CAMPS`, `DRAFT_OFFER_SIZE`, and an explicitly-labeled `TRICK_COUNT_N_RANGE` A6 placeholder collected in the same file for a no-code-change Phase 15 tuning pass.
- `objectiveSlotsFor(seed, campNumber, attemptNumber)` resolves camp 5's placeholder deterministically per `(seed, attemptNumber)` via `STREAMS.trickCountKind`/`STREAMS.trickCountN` (never an ad-hoc stream name), proven to yield both `no-tricks` and `exactly-n` across 200 seeds, and every resolved slot list is proven to pass `createCamp` at 3, 4 and 5 seats for all six camps.
- `run/compose.ts`'s `composeRules` folds `isTrump` first and separately across layers (closing WR-03 via composition, per Plan 10-01's factory), then folds every other `RunRules` hook over the resulting base, using a one-cast-per-hook registry dispatch keyed by `HOOK_NAMES`.
- `activeBossId(run)` reads the fixed `bossTwists` entry (D-02, never redraws) and respects `bossCancelled` (D-04) and the fireside/non-boss-camp cases.
- `ruleLayersFor(run, catalog)` orders base -> active boss -> each seat's equipped passives (seat order, then loadout order) -> each attempt effect (`effects` order), throwing a plain, id-naming `Error` for any equipped gear id, effect gear id, or boss id absent from the catalog (POLICY A3, T-10-10).
- `rulesFor` recomputes `ruleLayersFor` + `composeRules` fresh on every call — no `Map`/`WeakMap`/module-level state anywhere in `compose.ts` (T-10-08), proven both by a grep gate and by a test comparing two `RunState`s differing only in `attempt.effects`.
- Capacity is proven to equal `campNumber` regardless of `attemptNumber` (RUN-03) through the full composed-rules path, not just `baseRunHooks` in isolation.
- Every plan acceptance criterion (grep gates, `npx vitest run --project rules packages/rules/src/expedition/run`, `npm run typecheck`) passes; the full `packages/rules/src/expedition` suite (14 files, 204 tests) is green.

## Task Commits

Each task was committed atomically:

1. **Task 1: balance.ts camp ramp (RUN-01, D-14, D-15)** - `7e5bacc` (feat)
2. **Task 2: Hook composition — composeRules, ruleLayersFor, rulesFor, activeBossId** - `7e47d46` (feat)

## Files Created/Modified

- `packages/rules/src/expedition/run/balance.ts` - `STARTING_SUPPLIES`/`FINAL_CAMP`/`BOSS_CAMPS`/`DRAFT_OFFER_SIZE`/`TRICK_COUNT_N_RANGE`/`BALANCE_TABLE`/`objectiveSlotsFor`
- `packages/rules/src/expedition/run/balance.test.ts` - camp-ramp shape assertions, camp-5 resolution determinism/range/both-kinds-over-200-seeds, and a 3/4/5-seat `createCamp` validity sweep over all six camps
- `packages/rules/src/expedition/run/compose.ts` - `composeRules`/`activeBossId`/`ruleLayersFor`/`rulesFor`
- `packages/rules/src/expedition/run/compose.test.ts` - base-equivalence, layer-order non-commutativity, isTrump-only WR-03 composition (trickWinner and legalPlays), `activeBossId`'s four cases, `rulesFor`'s boss/passive/effect layering, RUN-03 capacity-across-attempts, no-cache T-10-08 proof, and the two POLICY A3 unknown-id throws

## Decisions Made

- Used an additive `isTrump` layer (`prev(identity) || spade`) rather than a replacing one for the WR-03 composition test, so the test isolates "one hook change ripples into `trickWinner`/`legalPlays`" instead of also changing joker trump status as a side effect.
- `balance.test.ts` imports `createCamp` directly from `../camp` rather than through a re-export in `balance.ts`, since `balance.ts` itself has no runtime dependency on `camp.ts` — only the test needs it to prove the module's own header claim.

## Deviations from Plan

None — plan executed as written; no bugs, missing functionality, blocking issues, or architectural changes were encountered.

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/run/balance.ts
- FOUND: packages/rules/src/expedition/run/balance.test.ts
- FOUND: packages/rules/src/expedition/run/compose.ts
- FOUND: packages/rules/src/expedition/run/compose.test.ts
- FOUND: 7e5bacc (git log)
- FOUND: 7e47d46 (git log)

## Verification

- `npx vitest run --project rules packages/rules/src/expedition/run/balance.test.ts` — 9 tests passed
- `npx vitest run --project rules packages/rules/src/expedition/run/compose.test.ts` — 18 tests passed
- `npx vitest run --project rules packages/rules/src/expedition/run` — 3 files, 32 tests passed
- `npx vitest run --project rules packages/rules/src/expedition` — 14 files, 204 tests passed
- `npm run typecheck` — exits 0
- `grep -c "export const BALANCE_TABLE" packages/rules/src/expedition/run/balance.ts` — 1
- `grep -c "TRICK_COUNT_N_RANGE" packages/rules/src/expedition/run/balance.ts` — 4
- `grep -c "STREAMS.trickCount" packages/rules/src/expedition/run/balance.ts` — 3
- `grep -cE "export function (composeRules|ruleLayersFor|rulesFor|activeBossId)" packages/rules/src/expedition/run/compose.ts` — 4
- `grep -v '^\s*//' packages/rules/src/expedition/run/compose.ts | grep -cE "new (Weak)?Map|let cache"` — 0
