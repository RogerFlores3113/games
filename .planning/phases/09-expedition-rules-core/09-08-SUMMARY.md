---
phase: 09-expedition-rules-core
plan: 08
subsystem: expedition-rules-hook-validation
tags: [rules, hooks, gap-closure, hardening]
requirements: [XRULE-02, XRULE-04]
dependency-graph:
  requires: [09-04, 09-05]
  provides: ["validated leaderFor/nextLeader hook seam", "invalid_rule_hook CampError"]
  affects: [packages/rules/src/expedition]
tech-stack:
  added: []
  patterns: ["validate hook-supplied seat ids at the point of storage, not at the point of use"]
key-files:
  created: []
  modified:
    - packages/rules/src/expedition/state.ts
    - packages/rules/src/expedition/actions.ts
    - packages/rules/src/expedition/camp.ts
    - packages/rules/src/expedition/actions.test.ts
    - packages/rules/src/expedition/camp.test.ts
decisions:
  - "invalid_rule_hook added as the last CampError member (additive, no existing consumer outside packages/rules/src/expedition)"
  - "createCamp validates leaderFor's result and throws per its existing malformed-input contract, rather than adding an error return channel"
  - "WR-03 (isTrump hook never consulted) explicitly excluded from this gap; recorded as Phase 10 hook-composition design work"
metrics:
  duration: ~25min
  completed: 2026-09-26
---

# Phase 9 Plan 08: Validate leaderFor/nextLeader Hook Results (WR-04, IN-02, IN-06) Summary

Closed WR-04 by validating both Phase 10 hook-composition seams — `rules.leaderFor` and `rules.nextLeader` — against `state.seatIds` at the point their results are stored, so a bad composed hook now surfaces as an explicit error instead of a silent soft-lock or an uncaught exception. Also closed the two trivially adjacent one-liners IN-02 (seatIds aliasing) and IN-06 (non-object action guard).

## What Was Built

**Task 1 — `applyCampAction`/`nextLeader` validation (actions.ts, state.ts):**
- Added `"invalid_rule_hook"` as a new `CampError` member in `state.ts`, documented as returned when a composed hook returns a value outside the camp's domain — a rules-composition defect, not a player error.
- `applyPlayCard` now checks `state.seatIds.includes(nextLeaderSeatId)` immediately after calling `rules.nextLeader`. A bad result returns `{ ok: false, error: "invalid_rule_hook" }` with nothing built from the intermediate (post-trick-completion) state returned to the caller — the input state stays untouched.
- `applyCampAction` now guards `typeof action !== "object" || action === null` before touching `action.type`, returning `invalid_action` instead of throwing a `TypeError` on a null or non-object forged request (IN-06).
- Header comments in both files updated to document the new validation.

**Task 2 — `createCamp`/`currentActorSeatId` validation (camp.ts):**
- `createCamp` checks `seatIds.includes(expeditionLeaderSeatId)` right after calling `rules.leaderFor(hands)` and throws a descriptive `Error` (`createCamp: leaderFor returned unknown seat ${seat}`) if it fails — converting what used to be a later throw out of `nextObjectivePicker` (inside `canPickObjective`/`applyCampAction`) into a setup-time rejection, matching `createCamp`'s existing documented malformed-input contract.
- `createCamp` now stores `seatIds: [...seatIds]` instead of aliasing the caller's array (IN-02), proven by a test that mutates the caller's array after camp creation and confirms the camp's `seatIds` is unaffected.
- `currentActorSeatId`'s playing-phase branch now throws a descriptive invariant `Error` (`currentActorSeatId: currentTrick.leaderSeatId "${seat}" is not in seatIds`) instead of indexing `seatIds[-1]` (which silently coerced to `undefined`) when `leaderIndex === -1`. This is defense in depth: with Task 1 and this task's `leaderFor` validation in place, only a hand-built or corrupted state can reach this branch.
- File header updated to document that hook-supplied seat ids are validated at the point of storage.

## Deviations from Plan

None — plan executed exactly as written. Both tasks' `<behavior>` tests were written first, confirmed to fail (RED) against the pre-fix source, then confirmed to pass (GREEN) after the source edits.

## Excluded by Design (per plan's objective)

- **WR-03** (`isTrump` hook declared but never called by `trickWinner`/`legalPlaysFor`): explicitly out of scope for this gap-closure plan. Removing the hook would contradict spec §6.1's hook table; routing `trickWinner`/`legalPlaysFor` through it is Phase 10 hook-composition design work, not a cheap adjacent fix. Left as recorded review debt.
- **IN-01, IN-03, IN-04, IN-05, IN-07**: not adjacent to the functions this plan edits; left as review debt.

## Verification

- `npx vitest run --project rules packages/rules/src/expedition/actions.test.ts` — 13 passed
- `npx vitest run --project rules packages/rules/src/expedition/camp.test.ts` — 30 passed
- `npm test` (full suite) — 94 files, 1301 tests passed
- `npm run typecheck` — clean (`tsc -b`)
- `git diff HEAD~2 --stat` touches only files under `packages/rules/src/expedition/`

## Known Stubs

None.

## Threat Flags

None — this plan closes existing threat-register entries (T-09-G04 through T-09-G07 from the plan's own threat model); it introduces no new surface.

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/state.ts (invalid_rule_hook member present)
- FOUND: packages/rules/src/expedition/actions.ts (seatIds.includes(nextLeaderSeatId) guard present)
- FOUND: packages/rules/src/expedition/camp.ts (leaderFor returned unknown seat / seatIds: [...seatIds] / is not in seatIds all present)
- FOUND commit fb5b0de: fix(09-08): validate nextLeader hook result and guard non-object actions (WR-04, IN-06)
- FOUND commit f605e97: fix(09-08): validate leaderFor hook result, copy seatIds, guard actor lookup (WR-04, IN-02)
