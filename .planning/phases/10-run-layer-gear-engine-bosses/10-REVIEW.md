---
phase: 10-run-layer-gear-engine-bosses
reviewed: 2026-09-27T09:11:12Z
depth: standard
review_type: re-review (gap closure 10-18, 10-19; diff 46952c5..HEAD)
files_reviewed: 7
files_reviewed_list:
  - packages/rules/src/expedition/run/toolkit.ts
  - packages/rules/src/expedition/run/toolkit.test.ts
  - packages/rules/src/expedition/gear/reassign.ts
  - packages/rules/src/expedition/gear/objective-gear.test.ts
  - packages/rules/src/expedition/gear/gear.contract.test.ts
  - packages/rules/src/expedition/run/run-test-support.ts
  - packages/rules/src/expedition/run/run-test-support.test.ts
findings:
  critical: 0
  warning: 2
  info: 8
  total: 10
  new_in_this_review: 3
  carried_forward: 7
status: issues_found
---

# Phase 10: Code Review Report (Re-review after 10-18 / 10-19)

**Reviewed:** 2026-09-27T09:11:12Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found (no blockers; only the deferred warnings and info items remain open)

## Summary

This re-review covers the gap-closure diff `46952c5..HEAD` under `packages/`. Seven files changed:
- toolkit.ts: a one-line `replace-objective` fix.
- reassign.ts: a Thick Fog branch.
- The test harness and contract suite: hardening.
- New regression tests.

Test and type-check results:
- `vitest run --project rules packages/rules/src/expedition`: 32 files, 524 tests, all pass.
- `tsc --noEmit` in `packages/rules`: clean.

Both targeted defects are fixed correctly:
- **CR-01:** the toolkit's `replace-objective` op now accepts the same card-bearing kinds as `reroll.canTarget` and `camp.ts`'s `isCardBearingSlot`.
- **WR-02:** under face-down assignment, Trail Map's legality no longer reads a teammate's objective ownership.

The WR-01 harness hardening is effective. `enumerateLegalRunActions` now offers objective-pick gear. Its final `applyRunAction` filter would throw on any remaining legality/toolkit mismatch. The whole-run property test draws loadouts from the real `GEAR_REGISTRY`, so Compass is now exercised. The contract suite applies every accepted target combination at camp 6, which contains both ordered and win-card slots.

No new blocker or warning-level defect was introduced. The new findings are all Info-level: test and maintainability issues.

## Prior findings disposition

| ID | Title | Disposition |
|----|-------|-------------|
| CR-01 | Compass on a win-card objective throws in the toolkit | **RESOLVED** |
| WR-01 | Harness never exercises objective-pick gear | **RESOLVED** |
| WR-02 | Trail Map refusal leaks teammate objective ownership under Thick Fog | **RESOLVED** |
| WR-03 | A reveal's `fromSeatId` goes stale after a card changes hands | **DEFERRED / STILL OPEN** |
| WR-04 | `move-card` can create uneven hands; conservation check ignores hand sizes | **DEFERRED / STILL OPEN** |
| IN-01 | `whispersUsedBy` counts toolkit `log` ops with `event: "whisper"` | STILL OPEN |
| IN-02 | Boss-camp numbers hardcoded outside `BOSS_CAMPS` | STILL OPEN |
| IN-03 | `ctx.camp!` non-null assertions in `canUse`/`canTarget` | STILL OPEN |
| IN-04 | `:`-delimited stream names with no escaping | STILL OPEN |
| IN-05 | Mutiny "leader" ambiguity with Machete | STILL OPEN |

**Evidence per item:**

- **CR-01, RESOLVED.** The fix is at `toolkit.ts:287-291`: `if (objective.kind !== "ordered" && objective.kind !== "win-card") throw ...`. The predicate now matches `reroll.ts:36` and `camp.ts:17-18`. Three layers of regression tests cover it:
  - A unit test on the op: `toolkit.test.ts:545`.
  - End-to-end tests through `applyRunAction` at camp 2 (all win-card) and camp 4 (mixed): `objective-gear.test.ts:160` and `:187`. They check that id, kind and owner are kept, that the target equals the deck's top card, that the deck shrinks by one, and that other objectives are untouched.
  - The contract and harness coverage described under WR-01.

  The objective-pick window only exists before any trick is played, so the new target cannot collide with already-won cards.

- **WR-01, RESOLVED.**
  - `run-test-support.ts:253-264` enumerates `use-gear` candidates for `def.window === "objective-pick"` whenever `currentWindow` is `"objective-pick"`. The final filter at `:293` calls `applyRunAction` on every candidate, so a toolkit throw now fails `driveRun`, and with it `run.property.test.ts`.
  - `gear.contract.test.ts:125-144` (`findUsableFixtures`) collects every accepted `(seatId, targets)` pair.
  - `assertLegalUseContract` (`:189`) asserts no throw for each pair, with an explicit message: "checkUseGear accepted … but applyRunAction threw".
  - `run-test-support.test.ts:154` pins the objective-pick enumeration.

- **WR-02, RESOLVED.** `reassign.ts:42-45` returns `true` before any ownership read when `ctx.rules.objectiveAssignment(ctx.run) === "face-down"`. That removes the accept/refuse oracle entirely.
  - The chosen semantics are documented in the header at `:9-23`: always legal under fog, and a swap between two empty-handed seats is a gear-spending no-op.
  - Tests at `objective-gear.test.ts:373-485` cover the fixture shape, uniform acceptance across teammates, the no-op swap plus GEAR-05 finality, and a real transfer.
  - The only ownership information the user can now gain is what they receive from an actual, gear-spending swap. That is the gear's intended effect, not a leak.
  - Coverage is also indirect: the property test combines random boss pairs with Trail Map loadouts, so this branch also runs under the no-throw filter.

- **WR-03, DEFERRED / STILL OPEN.** Not touched by 10-18/10-19; `toolkit.ts` `swap-cards` still leaves `attempt.reveals` unchanged. Carry forward: before Phase 11 builds per-seat views, decide whether a reveal follows the card or pins only its identity.

- **WR-04, DEFERRED / STILL OPEN.** Not touched: `move-card` is still in `ToolkitOp`, and `applyToolkitOps` still checks only the card-id multiset. The hole stays latent while no v1 gear emits `move-card`.

- **IN-01, IN-02, IN-04, IN-05, STILL OPEN.** None of the affected files is in this diff.

- **IN-03, STILL OPEN.** `reassign.ts:41` still asserts `ctx.camp!`. The new fog branch does not dereference `camp` before returning, so it did not make this worse.

## Narrative Findings (AI reviewer)

No new Critical or Warning findings. The open warnings in the counts are the carried-forward WR-03 and WR-04. The new findings follow, numbered after the carried-forward IN-01..05.

## Warnings

### WR-03 (carried forward, deferred): Reveal location semantics are under-specified after `swap-cards`

**File:** `packages/rules/src/expedition/run/types.ts:69-74`; `packages/rules/src/expedition/run/toolkit.ts:245-276`
**Issue:** Unchanged from the prior review. A `Reveal.fromSeatId` goes stale after Trained Monkey moves the revealed card.
**Fix:** Before Phase 11 builds on reveals, document and enforce one rule. Either invalidate reveals whose card moves, or state that a reveal pins identity only.

### WR-04 (carried forward, deferred): `move-card` can strand a camp through uneven hands

**File:** `packages/rules/src/expedition/run/toolkit.ts:219-243`
**Issue:** Unchanged. The post-fold invariant does not check hand sizes.
**Fix:** Remove `move-card` from `ToolkitOp`, or assert per-seat hand sizes are unchanged after the fold.

## Info

### IN-06 (new): The card-bearing kind predicate is still hand-copied in three places, the drift that caused CR-01

**File:** `packages/rules/src/expedition/run/toolkit.ts:287-291`; `packages/rules/src/expedition/gear/reroll.ts:36`; `packages/rules/src/expedition/camp.ts:17-18`
**Issue:** The CR-01 fix adds a comment, "Must match camp.ts's isCardBearingSlot and reroll.ts's canTarget", instead of sharing one predicate. A future card-bearing objective kind would have to be added in three places.

The hardened contract suite now catches a mismatch, but only at camps where the new kind appears in the fixture.
**Fix:** Export one predicate from `state.ts` or `objectives.ts`, for example `isCardBearingObjective(o): o is WinCardObjective | OrderedObjective`, and use it in all three sites.

### IN-07 (new): The WR-01 harness test's kind assertion is vacuous

**File:** `packages/rules/src/expedition/run/run-test-support.test.ts:154-179`
**Issue:** At camp 2 every objective is a win-card, so `expect(objective.kind).toBe("win-card")` for each reroll candidate cannot fail. The test's real value is `rerollCandidates.length > 0`, together with the implicit no-throw in `enumerateLegalRunActions`'s filter.
**Fix:** Use camp 4 or camp 6 and assert that the candidates include both an ordered and a win-card target. Or drop the kind loop and name the test for what it actually checks.

### IN-08 (new): Duplicated test code in the gap-closure tests

**File:** `packages/rules/src/expedition/gear/objective-gear.test.ts:160-212`; `packages/rules/src/expedition/gear/gear.contract.test.ts:78-112, 189-276`; `packages/rules/src/expedition/run/run-test-support.ts:152-183`
**Issue:** The duplication shows up in three places:
- The two CR-01 end-to-end tests are identical except for `campNumber`.
- `assertLegalUseContract` repeats the same try/catch-and-rethrow block twice.
- `gear.contract.test.ts` keeps a hand-maintained mirror of `run-test-support.ts`'s unexported `cartesian` and `targetOptionsFor`, and its comment says so. The two copies can drift. For example, if a new `TargetKind` is added to one but not the other, the contract suite's "every accepted combination" guarantee silently narrows.

**Fix:**
- Use `it.each([2, 4])` for the CR-01 tests.
- Extract a small `applyOrExplain` helper for the try/catch block.
- Export `candidateTargets` from `run-test-support.ts` and import it in the contract suite.

### IN-01..IN-05 (carried forward)

These are unchanged from the prior review. See the dispositions table above.
- **IN-01:** `whispersUsedBy` and reserved log event names (`whisper.ts:388-391`).
- **IN-02:** hardcoded boss camps (`compose.ts:84`).
- **IN-03:** `ctx.camp!` in `commandeer.ts:260`, `reroll.ts:31` and `reassign.ts:41`.
- **IN-04:** stream-name delimiter escaping (`rng.ts:316-340`).
- **IN-05:** Mutiny leader ruling with Machete (`mutiny.ts:23-26`).

---

_Reviewed: 2026-09-27T09:11:12Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
