---
phase: 09-expedition-rules-core
reviewed: 2026-09-26T00:00:00Z
depth: standard
review_type: re-review (gap closure 09-07, 09-08; diff a5a1bde^..HEAD)
files_reviewed: 8
files_reviewed_list:
  - packages/rules/src/expedition/objectives.ts
  - packages/rules/src/expedition/objectives.test.ts
  - packages/rules/src/expedition/objectives.property.test.ts
  - packages/rules/src/expedition/state.ts
  - packages/rules/src/expedition/camp.ts
  - packages/rules/src/expedition/camp.test.ts
  - packages/rules/src/expedition/actions.ts
  - packages/rules/src/expedition/actions.test.ts
findings:
  critical: 0
  warning: 3
  info: 7
  total: 10
prior_findings:
  WR-01: resolved
  WR-02: resolved
  WR-03: deferred (Phase 10)
  WR-04: resolved for leaderFor/nextLeader; residual trickWinner gap tracked as WR-05
  IN-01: open
  IN-02: resolved
  IN-03: open
  IN-04: open
  IN-05: open
  IN-06: resolved
  IN-07: open
status: issues_found
---

# Phase 9: Code Review Report (Re-review after gap closure)

**Reviewed:** 2026-09-26T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

This is a re-review of gap-closure plans 09-07 and 09-08 (`git diff a5a1bde^..HEAD -- packages/rules/src/expedition`). I checked each targeted finding against spec §3 and §5.2 and the A-TIE/A-LAST/A-END assumptions. I also mutation-tested a scratch copy of the evaluator (outside the repo, now deleted) to see whether the new tests actually catch regressions.

**Verification performed:**
- The `rules` project's expedition tests pass: 11 files, 159 tests.
- `tsc --noEmit -p packages/rules` is clean.
- **Mutation M1, reverting the WR-01 fix.** Two new unit tests fail, and so does the raw-sequence oracle/monotonicity property.
- **Mutation M2, making the new higher-marker check non-strict (`<=`).** This breaks A-TIE. The A-TIE unit test, the driveCamp ordered property, and the raw-sequence property all fail.
- **Mutation M3, making the lower-marker check non-strict (`>=`).** This also breaks A-TIE, and the same three tests fail.

**Conclusions:**
- **The oracle is independent.** The new ordered oracle is a pair-based restatement: a broken (lo, hi) pair, plus F1/F2. It shares no control flow with `orderedKind.evaluate` and no numeric "last" mapping. It detects every mutation above.
- **A-TIE is preserved.** Both marker comparisons in the resolved branch are strict, so cards won in the same trick index remain in order.
- **The fixed evaluator is monotone.** Traced by hand:
  - A resolved objective cannot later gain a higher marker resolved strictly earlier.
  - An unresolved objective that already failed on a resolved higher marker can only resolve at a strictly later index, so the new check keeps it failed.
- **`rawSequenceCampArb` builds states that are valid for the evaluator.** Every seat plays exactly `totalTricks` cards, played cards are removed from hands, and all objectives are owned. The `CompletedTrick` records are not internally consistent, though (see IN-09).

**Remaining defects:**
- WR-03 is deliberately deferred.
- WR-04's fix covers `leaderFor` and `nextLeader`, but not the third seat-returning hook, `trickWinner` (WR-05).
- The `invalid_rule_hook` path turns a silent soft-lock into a loud one, but the camp is still permanently stuck (WR-06).

## Prior Findings Status

| ID | Title | Status | Evidence |
|----|-------|--------|----------|
| WR-01 | Ordered evaluator not monotone | **Resolved** | `objectives.ts:188-190` adds the symmetric strict check. The unit tests at `objectives.test.ts:365-403` and the raw-sequence prefix property both fail when the check is reverted (M1). |
| WR-02 | Self-confirming ordered oracle | **Resolved** | `objectives.property.test.ts:86-158` is pair-based and uses its own `markerPrecedes`. It runs over states built directly (not via `driveCamp`) and caught M1, M2 and M3. |
| WR-03 | `isTrump` never consulted | **Deferred (Phase 10)** | Untouched by design. `trickWinner`/`legalPlaysFor` still hard-code jokers. Still open for Phase 10. |
| WR-04 | Hook seat ids not validated | **Resolved for `leaderFor`/`nextLeader`** | `camp.ts:123-128` throws at setup; `actions.ts:70-76` returns `invalid_rule_hook`; `camp.ts:181-186` throws on a bad stored leader. The residual `trickWinner` gap is tracked as WR-05, and the fix's own soft-lock behavior as WR-06. |
| IN-01 | Phantom `currentTrick` after final trick | **Open** | `actions.ts:77-81` is unchanged. |
| IN-02 | `createCamp` aliases `seatIds` | **Resolved** | `camp.ts:131` stores `[...seatIds]`; the test is at `camp.test.ts:110-122`. |
| IN-03 | Duplicated Ace constant | **Open** | Not in the diff (`leader.ts:10`). |
| IN-04 | Substring purity guard / test-support in `src/` | **Open** | Not in the diff. |
| IN-05 | No guard against a "finished but in_progress" camp | **Open** | `camp.ts:147-168` is unchanged. |
| IN-06 | Null action throws | **Resolved** | `actions.ts:97-99`; tests are at `actions.test.ts:294-318`. |
| IN-07 | Objective resolution assumes unique identities | **Open** | `objectives.ts:81-88` and `createCamp` are unchanged; no duplicate-identity assertion was added. |

## Warnings

### WR-03: `isTrump` hook is declared as Core-called but no Core code calls it (DEFERRED to Phase 10)

**File:** `packages/rules/src/expedition/rules.ts:8-10,24,38`; `packages/rules/src/expedition/trick.ts:43-66`; `packages/rules/src/expedition/actions.ts:61`
**Issue:** This is unchanged from the prior review. `rules.isTrump` is never called, so a Phase 10 layer that overrides only `isTrump` would be silently ignored. The owner deferred it to Phase 10; it is carried here so it is not lost.
**Fix:** In Phase 10, route trick ranking through the hook, e.g. `trickWinner(plays, rules)` and `legalPlaysFor(hand, led, rules.isTrump)`. Alternatively, remove `isTrump` from `CoreRules` until a caller exists. Add a test in which an overridden `isTrump` changes the winner.

### WR-05: `trickWinner` hook result is stored unvalidated (residual of WR-04)

**File:** `packages/rules/src/expedition/actions.ts:61-67`
**Issue:** WR-04 covered "hook-supplied seat ids". The fix validates `leaderFor` and `nextLeader`, but `rules.trickWinner(plays)` is also a composable `CoreRules` hook that returns a seat id. Its result is written straight into `CompletedTrick.winnerSeatId`.

With `baseRules.nextLeader`, a bad winner happens to be caught indirectly, because `nextLeader` echoes `winnerSeatId` into the new check. A Phase 10 layer that overrides `nextLeader`, such as the Machete gear's `commandeer` effect in spec §5.1, removes that accidental guard. A bad winner is then stored silently:
- `win-card`/`ordered` objectives whose card is in that trick evaluate `failed`.
- `no-tricks`/`exactly-n` counts are credited to a phantom seat.

The camp fails or passes for reasons no player caused, with no error.
**Fix:** Validate the winner against the trick's own players, which is stricter than `seatIds`, before building `completed`:
```ts
const winnerSeatId = rules.trickWinner(plays);
if (!plays.some((p) => p.seatId === winnerSeatId)) {
  return { ok: false, error: "invalid_rule_hook" };
}
```
Add a test that combines a bad `trickWinner` with an overridden, valid `nextLeader`.

### WR-06: `invalid_rule_hook` still permanently stalls the camp, and hook-failure handling is inconsistent

**File:** `packages/rules/src/expedition/actions.ts:70-76`; `packages/rules/src/expedition/camp.ts:123-128,181-186`
**Issue:** This is a new issue introduced by the WR-04 fix.
- **The camp is still stuck.** When `nextLeader` returns an unknown seat, the completing play is rejected and the state is left unchanged. `nextLeader` is a deterministic function of the state and the completed trick, so the same seat's retry gets the same rejection (and, with most hooks, so does any other card). No other seat is the actor. The camp is still permanently stuck, now loudly instead of silently. The actions.ts header ("instead of silently soft-locking the camp") is literally true, but it implies the camp recovers, and it does not.
- **The error is misattributed.** `invalid_rule_hook` is returned as the result of a player's `play-card`. A Phase 11 adapter mapping `CampError` to player feedback would tell the last player their move failed, when the defect is in rules composition.
- **Handling is inconsistent.** The same class of defect throws in `createCamp` (leaderFor) and in `currentActorSeatId`, but returns a `CampError` here.
- **The final trick is affected.** `nextLeader` is also consulted and validated after the final trick (index `totalTricks - 1`), when no next trick exists. A composed hook that returns a sentinel there would block the camp's final play and keep the outcome from being decided.

**Fix:** Choose one policy for rules-composition defects. The simplest option is to throw an `Error` everywhere, since this is a programmer error that no player can fix. Document it in the `CoreRules` header. Also skip the `nextLeader` call when `completedTricks.length === state.totalTricks`, so a missing next trick cannot block the camp's end:
```ts
if (completedTricks.length === state.totalTricks) {
  return { ok: true, state: { ...intermediate, currentTrick: { index: completed.index + 1, leaderSeatId: completed.winnerSeatId, plays: [] } } };
}
```
This also gives IN-01 a natural place to be addressed.

## Info

### IN-01: A phantom `currentTrick` is opened after the final trick (OPEN, carried forward)

**File:** `packages/rules/src/expedition/actions.ts:77-81`
**Issue:** This is unchanged. After the last trick, the state carries `currentTrick.index === totalTricks` with a leader for a trick that cannot exist. The raw-sequence property also reproduces this shape (`objectives.property.test.ts:345-349`).
**Fix:** Document the shape and have views key off `isCampFinished`, or stop opening a new trick once the camp is finished (see WR-06).

### IN-03: Duplicated Ace constant (OPEN, carried forward)

**File:** `packages/rules/src/expedition/leader.ts:10`
**Issue:** `A_OF_SPADES_RANK = 14` duplicates `RANK_ACE` in `deck.ts`.
**Fix:** Import `RANK_ACE` from `./deck`.

### IN-04: Purity guard is substring-based and ships test code in `src/` (OPEN, carried forward)

**File:** `packages/rules/src/expedition/purity.test.ts:14-40`; `packages/rules/src/expedition/test-support.ts`
**Issue:** This is unchanged. Mentioning a token in a comment fails the guard spuriously, `../shuffle` is not scanned, and `test-support.ts` is compiled into the package's declarations.
**Fix:** Match import specifiers and call sites with a regex, scan `../shuffle`, and exclude the test-support file from the build tsconfig.

### IN-05: No guard against a "finished but in_progress" camp (OPEN, carried forward)

**File:** `packages/rules/src/expedition/camp.ts:147-168`
**Issue:** This is unchanged. A future objective kind that leaves an objective `pending` when `isCampFinished` is true would leave the camp in `playing` with no legal action.
**Fix:** In `checkCampOutcome`, treat `pending` at `isCampFinished(state)` as failed, or throw an invariant error.

### IN-07: Objective resolution assumes identities are unique in the deck (OPEN, carried forward)

**File:** `packages/rules/src/expedition/objectives.ts:81-88`; `packages/rules/src/expedition/camp.ts:87`
**Issue:** This is unchanged. `trickContaining` returns the first match, and nothing checks that the `deckFor` hook returns distinct identities.
**Fix:** In `createCamp`, assert that `rules.deckFor(...)` contains no duplicate identities.

### IN-08: `currentActorSeatId`'s new invariant throw escapes `applyCampAction`

**File:** `packages/rules/src/expedition/camp.ts:181-186`; `packages/rules/src/expedition/legality.ts:55,81`
**Issue:** `canPickObjective`/`canPlayCard` call `currentActorSeatId`. The new throw therefore propagates out of `applyCampAction`, which is documented to return `AdapterResult` errors. With `leaderFor` and `nextLeader` now validated, this is reachable only from a corrupt or hand-edited persisted `CampState`, such as a Phase 11 Durable Object rehydrating bad storage. The worker would then see an exception on every action for that room. That is acceptable as an invariant guard, but the contract is not documented.
**Fix:** Note in the `applyCampAction`/legality docs that corrupt state throws. Alternatively, have the Phase 11 adapter validate rehydrated state (for example, `seatIds.includes(currentTrick.leaderSeatId)`) before dispatching.

### IN-09: `rawSequenceCampArb` builds internally inconsistent `CompletedTrick` records and hard-codes hand size

**File:** `packages/rules/src/expedition/objectives.property.test.ts:283,316-328,347`
**Issue:** The generated states are adequate for the evaluator, which reads only `index`, `plays[].card` and `winnerSeatId`. They violate other invariants, though:
- **Trick 0's leader:** `tricks[0].leaderSeatId` is `seatIds[0]`, but the k=0 prefix's `currentTrick.leaderSeatId` is `initial.expeditionLeaderSeatId`.
- **Play order:** `plays` is always in `seatIds` order, not starting from `leaderSeatId`.
- **Hand size:** `totalTricks` comes from the test's own `HAND_SIZE` table instead of `initial.totalTricks`. If the deck changes, `hand.length` reaches 0, `% 0` yields `NaN`, and the test crashes with an opaque `undefined` card error rather than a clear message.
- **A-TIE coverage is not asserted.** Same-trick coverage depends on chance. Mutations M2 and M3 were caught in this run, but no non-vacuity counter guarantees that a same-index pair was generated.

**Fix:**
- Use `const totalTricks = initial.totalTricks`.
- Seed `leaderSeatId` from `initial.expeditionLeaderSeatId`, and rotate `plays` to start at the leader.
- Add a `sameTrickPairRuns > 0` non-vacuity assertion.
- Alternatively, document explicitly that these states are only valid for the evaluator.

---

_Reviewed: 2026-09-26T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
