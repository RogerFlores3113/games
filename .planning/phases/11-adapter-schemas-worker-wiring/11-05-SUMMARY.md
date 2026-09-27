---
phase: 11-adapter-schemas-worker-wiring
plan: 05
subsystem: rules-engine
tags: [expedition, per-seat-view, leak-checker, gear, boss, README, COMM-03, ENG-03]
dependency-graph:
  requires:
    - "checkExpeditionViewForLeaks/secretsForExpeditionSeat (Plan 11-04, packages/rules/src/expedition/adapter/view-leak-check.ts)"
    - "toExpeditionPlayerView (Plan 11-01, packages/rules/src/expedition/adapter/view.ts)"
  provides:
    - "RUN-07 whole-run property (run/run.property.test.ts) now also proves COMM-03/ENG-03's real per-seat no-leak guarantee at every state, for every seat and an unseated viewer"
    - "gear.contract.test.ts and boss.contract.test.ts leak-check every registered entry per seat automatically (spec §8 'no view leak after apply')"
    - "README documents the real leak checker, the WR-03 reveal-identity ruling, and an Adapter section"
  affects:
    - "Any future gear/boss/adapter plan inherits automatic per-seat leak coverage with zero test-file edits"
tech-stack:
  added: []
  patterns:
    - "One combined whole-run property proving end/no-throw/conservation/no-leak together, rather than a separate leak-only property layered on top (RUN-07 Property D)"
    - "Per-seat leak check placed unconditionally in the driven-camp/gear-use loop (never nested inside a reveal-conditional or attempt-only branch), matching Plan 11-04's own T-11-17 discipline"
key-files:
  created: []
  modified:
    - packages/rules/src/expedition/run/run.property.test.ts
    - packages/rules/src/expedition/gear/gear.contract.test.ts
    - packages/rules/src/expedition/boss/boss.contract.test.ts
    - packages/rules/src/expedition/README.md
decisions:
  - "Property D's leak-check loop iterates every state unconditionally (moved outside the `if (state.attempt !== null && state.attempt.camp !== null)` branch) so fireside, pre-deal, and ended states are checked too, per the plan's explicit instruction"
  - "gear.contract.test.ts's leak-check loop runs regardless of whether the use settled the camp (moved outside `if (applied.attempt !== null)`), since a use that settles the camp at the fireside must not leak there either — only the GEAR-05 gear_already_used re-check stays gated on an open attempt existing"
  - "boss.contract.test.ts keeps `expect(state.attempt.reveals).toEqual([])` but re-comments it as a real boss property ('bosses create no reveals'), not a leak check, since the per-seat checker now proves the no-leak guarantee directly"
metrics:
  duration: ~25min
  completed: 2026-09-27
  tasks: 2
  files: 4
---

# Phase 11 Plan 05: Retire Interim No-Leak Checks for the Real Per-Seat Checker Summary

Replaced Phase 10's documented "interim" structural no-leak checks in the whole-run property, the gear catalogue contract, and the boss catalogue contract with the real per-seat `checkExpeditionViewForLeaks`/`toExpeditionPlayerView` checker built in Plan 11-04, and updated the Expedition README's recipes and invariants to match — closing ENG-03/COMM-03's combined "always ends, never throws, conserves cards, never leaks" guarantee in one property, and giving every current and future registered gear/boss automatic per-seat leak coverage.

## What Was Built

**Task 1 — `run/run.property.test.ts`: the real leak checker folded into Property D**

The combined Property A/D `fc.property` body now iterates `[...state.seatIds, "spectator"]` at every recorded state in `driveRun`'s `states` array — including fireside, pre-deal, and ended states, not only states with an open attempt — calling `toExpeditionPlayerView(state, id, CATALOG)` and asserting `checkExpeditionViewForLeaks({ view, serialized: JSON.stringify(view), secrets: secretsForExpeditionSeat(state, id, CATALOG) })` equals `[]` (no seed argument, since this suite's `fc.string({ minLength: 1 })` seeds can be one character). A module-level `leakViewsChecked` counter, asserted `> 0` after `fc.assert`, proves the check is non-vacuous. The interim reveal-audience/`LOG_ENTRY_KEYS` block and the `LOG_ENTRY_KEYS` constant were removed entirely — the leak checker's forbidden-key and log-count layers supersede them, and the toolkit's `reveal` op already throws on an out-of-bounds audience (proven by the file's own `non-vacuity` tests elsewhere in the suite). The header paragraph was rewritten to state that Property D now includes the real per-seat leak checker at every state, and that the dedicated 32-hex-seed suite with the live seed-substring scan lives in `adapter/view.property.test.ts`. Measured runtime: 2.23s for the whole file (well under the plan's 120s ceiling; `numRuns` left at 40/15, unchanged).

**Task 2 — real per-seat leak checks in the gear and boss catalogue contracts, plus README update**

`gear.contract.test.ts`'s `assertLegalUseContract` replaced its interim reveal-audience and `LOG_ENTRY_KEYS` loops with a per-seat leak check run for every id in `[...applied.seatIds, "spectator"]`, using the contract's own catalog (never the production `CATALOG`) and `applied.seed` (a long, distinctive literal like `contract-peek-4`, safe for the raw substring scan). The leak loop was moved OUTSIDE the `if (applied.attempt !== null)` condition so a use that settles the camp at the fireside is checked too; the `gear_already_used` re-check stays inside that condition, since it is only meaningful while an attempt is still open. `LOG_ENTRY_KEYS` was removed as unused.

`boss.contract.test.ts`'s driven camp-3 test adds the same per-seat check at every state of the driven camp (ids = `[...state.seatIds, "spectator"]`, using the test's own `catalog` and `seed`), regardless of attempt state. `expect(state.attempt.reveals).toEqual([])` is kept but re-commented as "bosses create no reveals" — a real boss property, not a leak check, since the per-seat checker now proves the no-leak guarantee directly. Its `LOG_ENTRY_KEYS` assertion and constant were removed (superseded).

`README.md`: both the "Add a piece of gear" and "Add a boss twist" recipes now describe "the per-seat leak check (adapter/view-leak-check.ts, run for every seat and an unseated viewer)" in place of "the interim no-leak check". The "The seed and draft offers are private" invariant was rewritten to say both fields are redacted by `adapter/view.ts`'s explicit allowlist and proven by `adapter/view.property.test.ts`'s whole-run per-seat leak property. A new invariant bullet, "A reveal pins identity only (WR-03)", states that a reveal shows a card's identity and holder AT REVEAL TIME only — it never follows the card after a later move/swap, and the view never re-derives a revealed card's current holder. A new "Adapter" section names `adapter/adapter.ts` (`expeditionGame`), `adapter/view.ts`, `adapter/request-guards.ts`, and `adapter/view-leak-check.ts`, and states that a new gear/boss is leak-checked automatically by the two contract suites.

## Verification

- `npx vitest run --project rules packages/rules/src/expedition/run/run.property.test.ts` — 3 tests passed, 2.23s
- `npx vitest run --project rules packages/rules/src/expedition/gear/gear.contract.test.ts packages/rules/src/expedition/boss/boss.contract.test.ts` — 44 + 23 tests passed
- `npx vitest run --project rules` (whole rules project) — 792 tests passed (55 files)
- `npm run typecheck` — exits 0
- `grep -ci "interim" packages/rules/src/expedition/run/run.property.test.ts packages/rules/src/expedition/gear/gear.contract.test.ts packages/rules/src/expedition/boss/boss.contract.test.ts packages/rules/src/expedition/README.md` — 0 for each file
- `grep -c "checkExpeditionViewForLeaks"` — 3 in run.property.test.ts, 3 in gear.contract.test.ts, 3 in boss.contract.test.ts
- `grep -c "CATALOG"` — 0 in both gear.contract.test.ts and boss.contract.test.ts (each passes its own contract catalog, never the production CATALOG)
- `grep -c "LOG_ENTRY_KEYS"` — 0 in all three test files (superseded, removed)
- `grep -c "WR-03"` / `grep -c "view-leak-check"` in README.md — 2 / 3 (both present)

## Deviations from Plan

None — plan executed exactly as written. Both tasks' acceptance criteria were met on the first implementation pass; no auto-fixes, no architectural questions, no auth gates.

## Known Stubs

None. Every leak-check call site uses the real `toExpeditionPlayerView`/`checkExpeditionViewForLeaks`/`secretsForExpeditionSeat` functions against real driven state — no placeholder or mock data.

## Threat Flags

None. This plan closes T-11-19 (new gear/boss content leaking, mitigated by the contract suites' automatic per-seat check), T-11-20 (regression from removing interim checks, mitigated since the interim checks are removed only in favor of the strictly stronger real per-seat checker), and T-11-03 (seed exposure in contract fixtures, mitigated since both contract suites pass their long literal seeds, keeping the substring scan active). No new, unlisted surface was introduced.

## Self-Check: PASSED

- `packages/rules/src/expedition/run/run.property.test.ts` — FOUND, modified
- `packages/rules/src/expedition/gear/gear.contract.test.ts` — FOUND, modified
- `packages/rules/src/expedition/boss/boss.contract.test.ts` — FOUND, modified
- `packages/rules/src/expedition/README.md` — FOUND, modified
- Commit `05ef91a` (Task 1) — FOUND in `git log`
- Commit `fcc0d03` (Task 2) — FOUND in `git log`
- `npx vitest run --project rules` — 792 tests passed (55 files)
- `npm run typecheck` — exits 0
