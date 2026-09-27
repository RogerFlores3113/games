---
phase: 10-run-layer-gear-engine-bosses
plan: 19
subsystem: expedition-run-gear
tags: [gear, hidden-information, gap-closure]
dependency-graph:
  requires: [10-18]
  provides: [WR-02-closed]
  affects: [packages/rules/src/expedition/gear/reassign.ts, packages/rules/src/expedition/gear/objective-gear.test.ts]
tech-stack:
  added: []
  patterns:
    - "canTarget checks ctx.rules.objectiveAssignment(ctx.run) before reading any hidden per-seat state, and short-circuits to always-legal under face-down assignment"
key-files:
  created: []
  modified:
    - packages/rules/src/expedition/gear/reassign.ts
    - packages/rules/src/expedition/gear/objective-gear.test.ts
decisions:
  - "Under Thick Fog, Trail Map's canTarget always returns true (WR-02 fix option 2 from 10-REVIEW.md) rather than checking only ctx.self — a self-only check would still forbid an objective-less seat from taking a teammate's objective, which the face-up rule allows, so the least-restrictive legality that leaks nothing is to always allow the use"
  - "A Trail Map swap where neither seat holds a pending objective is now a legal no-op under fog that still spends the gear — an accepted consequence documented in reassign.ts's header comment"
metrics:
  duration: "~15min"
  completed: "2026-09-27"
---

# Phase 10 Plan 19: Trail Map hidden-objective probe fix (WR-02) Summary

Closed review warning WR-02: under Thick Fog, Trail Map's `canTarget` refused a swap with "Neither of you has an unresolved objective" based partly on the TARGET's hidden pending-objective state, letting an objective-less seat probe teammates for free (a refusal costs nothing and is not logged) and learn who holds an objective — a direct violation of "each player sees only their own" (spec §5.3/§6.4).

## What Was Built

**Task 1 (RED):**
- `objective-gear.test.ts`: imported `blindOrders` (`../boss/blind-orders`) and `currentWindow`/`rulesFor`. Added a nested `describe("WR-02: under Thick Fog (face-down)", ...)` inside the existing `describe("Trail Map (reassign, D-10)", ...)` block, with a local `setupFogTrailMap()` fixture (5 seats p0..p4, camp 3, `bossTwists: { 3: "blind-orders", 6: null }`, every seat equipped `["reassign"]`, seed `"trail-map-fog-seed"`, advanced to `"objective-pick"`).
- Four tests, each titled with "WR-02":
  1. Fixture sanity check — `currentWindow` is `"between-tricks"` and exactly two of the five seats own no objective.
  2. `checkUseGear(run, S, "reassign", [T], catalog).ok` is `true` for every teammate `T` of an objective-less seat `S` (uniformity across teammates — the actual probe-resistance property).
  3. A swap between two objective-less seats applies `ok`, leaves every objective's `ownerSeatId` unchanged, and a second use by the same seat returns `gear_already_used`.
  4. A swap between an objective-less seat and an objective owner moves the pending objective to the objective-less seat.

**RED evidence:** Running the suite before the `reassign.ts` change produced exactly 2 failures out of the 4 new tests — test 2 (`checkUseGear` uniformity) and test 3 (no-op-swap applies `ok`) both failed with `expected false to be true`, because the current code refused the objective-less-to-objective-less swap with "Neither of you has an unresolved objective". Tests 1 (fixture sanity) and 4 (owner-to-objective-less move) passed unchanged, since they don't exercise the leaking refusal path. 18/20 tests in the file passed overall (2 failed).

**Task 2 (GREEN):**
- `reassign.ts`'s `canTarget`: added a check for `ctx.rules.objectiveAssignment(ctx.run) === "face-down"` before the existing pending-objective check. When face-down, it returns `true` immediately, never reading `ctx.self`'s or the target's hidden objective state. The face-up path is unchanged, including the "Neither of you has an unresolved objective" reason string.
- Added a header-comment paragraph citing WR-02 and spec §5.3/§6.4, explaining that legality must never depend on another seat's hidden objectives because the refusal code alone (without the reason string) leaks, and documenting the chosen rule (always-legal under fog, per 10-REVIEW.md's option 2, not a self-only check).
- `apply` and the toolkit's `swap-objectives` op were left untouched, as instructed.
- Did NOT tick GEAR-06 in REQUIREMENTS.md — its UI half (hiding the reason string) is Phase 11 scope.

## Verification

- `npx vitest run --project rules packages/rules/src/expedition/gear/objective-gear.test.ts packages/rules/src/expedition/gear/gear.contract.test.ts packages/rules/src/expedition/boss/fog-mutiny.test.ts`: 3 files, 74 tests, all passed.
- `npm test`: **115 files, 1666 tests, all passed.**
- `npm run typecheck` (`tsc -b`): exits 0, no errors.
- `grep -c "WR-02" objective-gear.test.ts` → 5 (4 test titles + describe block title); `grep -c "blind-orders" objective-gear.test.ts` → 3.
- `grep -c "objectiveAssignment" reassign.ts` → 2; `grep -c "face-down" reassign.ts` → 3; `grep -c "Neither of you has an unresolved objective"` → 1 (present, unchanged).
- The pre-existing test "gives 'Neither of you has an unresolved objective' when both are already done" (face-up, camp 2) is present unchanged and passes, confirming face-up behavior and D-10 are untouched.

## Deviations from Plan

None — plan executed exactly as written. The RED phase produced exactly 2 failures (the plan's behavior description said "Test A and Test B fail"; the fixture-sanity and objective-move tests passed as expected, matching the plan's framing that only the uniformity/no-op tests exercise the leaking path).

## Deferred Review Findings

- **WR-03** (a reveal's `fromSeatId` goes stale after Trained Monkey moves the card) remains deferred, pending a product decision on whether a reveal follows the card; it must be settled before Phase 11 builds the per-seat view.
- **WR-04** (the latent `move-card` op can break hand sizes) remains deferred; no v1 gear or boss emits `move-card` today, so it stays latent until content uses that op.

## Self-Check: PASSED

- `packages/rules/src/expedition/gear/reassign.ts` — FOUND
- `packages/rules/src/expedition/gear/objective-gear.test.ts` — FOUND
- Commit `a4166f4` (test(10-19): add failing Trail Map Thick Fog probe tests (WR-02)) — FOUND in `git log`
- Commit `d8ac917` (fix(10-19): Trail Map legality ignores hidden objectives under Thick Fog (WR-02)) — FOUND in `git log`
