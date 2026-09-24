---
phase: 09-expedition-rules-core
reviewed: 2026-09-23T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - packages/rules/src/expedition/actions.ts
  - packages/rules/src/expedition/camp.ts
  - packages/rules/src/expedition/deck.ts
  - packages/rules/src/expedition/leader.ts
  - packages/rules/src/expedition/legality.ts
  - packages/rules/src/expedition/objectives.ts
  - packages/rules/src/expedition/rules.ts
  - packages/rules/src/expedition/state.ts
  - packages/rules/src/expedition/trick.ts
  - packages/rules/src/expedition/test-support.ts
  - packages/rules/src/expedition/actions.test.ts
  - packages/rules/src/expedition/camp.test.ts
  - packages/rules/src/expedition/camp.property.test.ts
  - packages/rules/src/expedition/deck.test.ts
  - packages/rules/src/expedition/leader.test.ts
  - packages/rules/src/expedition/legality.test.ts
  - packages/rules/src/expedition/objectives.test.ts
  - packages/rules/src/expedition/objectives.property.test.ts
  - packages/rules/src/expedition/purity.test.ts
  - packages/rules/src/expedition/trick.test.ts
  - packages/rules/src/expedition/trick.property.test.ts
findings:
  critical: 0
  warning: 4
  info: 7
  total: 11
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-09-23T00:00:00Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

I reviewed the Expedition rules core against spec §3, §5.2 and §6.1: the deck, follow-suit, trick winner, leader, objective evaluation, camp setup and derivation, legality, transitions, and the test-support and property tests.

These rules match the spec:
- Deck removal per player count.
- Follow-suit, including the forced other joker when a joker is led.
- Sun > Moon > highest card of the led suit.
- The Sun holder picks first and leads first, with the A♠ fallback.
- Clockwise pick order.
- Failure timing for win-card, no-tricks and exactly-n.

The labeled assumptions A-TIE, A-LAST, A-END, A-TRICKCOUNT, A-MULTI and A-HOLDER are applied consistently with their own text.

I found no blockers that the base rules can reach. The main defects:
- **Non-monotone ordered evaluator.** It can move an objective from `failed` back to `done`. I confirmed this with a scratch test, which has been removed.
- **Self-confirming ordered oracle.** The property test's "independent" ordered oracle is a line-by-line copy of the evaluator, so it could not catch that bug.
- **`isTrump` hook never called.** The hook is declared but the Core never calls it.
- **Hook results not validated.** Phase 10 hook outputs (leader seats) are trusted without checks, and a bad seat produces silent soft-locks or thrown exceptions.

## Warnings

### WR-01: Ordered evaluator is not monotone; a failed objective can later report "done"

**File:** `packages/rules/src/expedition/objectives.ts:161-171`
**Issue:** The two branches check different things:
- While my card is **unresolved**, the loop fails me if any **higher**-marker objective has already resolved (line 167).
- Once my card **resolves**, it checks only **lower**-marker objectives (line 164). It never re-checks whether a higher-marker objective resolved strictly *before* me.

Result: ② is won at trick 0 → ① evaluates `failed`. Then ① is won by its owner at trick 1 → ① evaluates `done`. I confirmed this with a scratch vitest run (after t0: `failed`, after t1: `done`).

Base play stops at the first failure, so `applyCampAction` cannot reach this today. But the evaluator is public and is documented as a pure, stateless recompute from `CampState`. Anything that evaluates later states will under-report `failedObjectiveIds`. That includes a Phase 10 continue-after-fail flow, a replay/log view, the deferred "why we failed" feature, or a failure check that does not stop play.

A secondary effect: once ② is won out of order, the state's own statuses disagree about which objective broke the order.

**Fix:** Make the resolved branch symmetric, so an out-of-order resolution fails no matter which side is evaluated:
```ts
if (myTrickIndex !== undefined) {
  if (otherMarker < myMarker && (otherTrickIndex === undefined || otherTrickIndex > myTrickIndex)) return "failed";
  if (otherMarker > myMarker && otherTrickIndex !== undefined && otherTrickIndex < myTrickIndex) return "failed"; // A-TIE: equal index is fine
} else if (otherMarker > myMarker && otherTrickIndex !== undefined) {
  return "failed";
}
```
Also add a unit test for "higher marker won strictly earlier, then lower marker won by its owner → still failed", and a monotonicity property over arbitrary trick sequences that does not go through `driveCamp`.

### WR-02: The "independent" ordered oracle is a transcription of the implementation (self-confirming test)

**File:** `packages/rules/src/expedition/objectives.property.test.ts:85-115`
**Issue:** The header says the oracles "independently restate spec §5.2". But `orderedOracle` copies `orderedKind.evaluate` branch for branch: the same unresolved/resolved split, the same one-sided marker comparisons, and the same `last` check. Any logic error in the evaluator is reproduced exactly, so the property only proves the file equals itself.

This is how WR-01 got through. The monotonicity property in `camp.property.test.ts:294-303` cannot catch it either, because `driveCamp` stops at the first failure.

**Fix:** Restate the rule declaratively instead of transcribing the control flow. For example: "the objective is failed iff its card was won by a non-owner, OR there exist two resolved ordered objectives with markerA < markerB and indexA > indexB involving this objective, OR a lower marker is unresolved when this one resolved, OR a higher marker resolved while this one is unresolved, OR (last and index ≠ totalTricks−1)". Then compare that result to the engine on randomly generated `completedTricks` sequences built directly, not via `driveCamp`, so post-failure states are exercised.

### WR-03: `isTrump` hook is declared as Core-called but no Core code calls it

**File:** `packages/rules/src/expedition/rules.ts:8-10,24,38`; `packages/rules/src/expedition/trick.ts:43-66`; `packages/rules/src/expedition/actions.ts:58`
**Issue:** The `rules.ts` header says CoreRules defines "only the hooks the Core layer itself calls — deckFor, leaderFor, isTrump, ...". `rules.isTrump` is never called anywhere: `trickWinner` and `legalPlaysFor` hard-code `identity.kind === "joker"`. `CoreRules.trickWinner(plays)` also gets no `rules` or state, so it cannot consult a composed `isTrump`.

A Phase 10 twist or gear that overrides only `isTrump` (spec §6.1 lists it for "future trump twists") would be silently ignored. Trick resolution would keep using jokers, with no error.

**Fix:** Either remove `isTrump` from `CoreRules` until something calls it, or route through it. For example, make `trickWinner(plays, rules)` rank trumps via `rules.isTrump`, and have `legalPlaysFor` take an `isTrump` predicate. Add a test in which an overridden `isTrump` changes the winner.

### WR-04: Hook-supplied seat ids are never validated; a bad seat soft-locks the camp or throws out of `applyCampAction`

**File:** `packages/rules/src/expedition/camp.ts:120,173-174`; `packages/rules/src/expedition/actions.ts:67-72`; `packages/rules/src/expedition/objectives.ts:227-230`
**Issue:** `rules.leaderFor` and `rules.nextLeader` are the extension seams Phase 10 composes (Machete: `setNextLeader`). Their results are stored without checking them against `state.seatIds`, and each bad value fails differently:
- **Bad `nextLeader` result:** `currentActorSeatId` computes `indexOf(...) === -1` and then `seatIds[(-1 + plays.length) % n]`. With zero plays that is `seatIds[-1]`, i.e. `undefined` cast to `string` by `!`. Every `play-card` is rejected `not_your_turn`, and the camp is permanently stuck in `playing` with no error.
- **Bad `leaderFor` result:** `nextObjectivePicker` throws. The exception escapes `canPickObjective`/`applyCampAction`, which are documented to return `AdapterResult` errors.

**Fix:** Validate at the point of storage:
```ts
// camp.ts after rules.leaderFor(hands)
if (!seatIds.includes(expeditionLeaderSeatId)) throw new Error(`createCamp: leaderFor returned unknown seat ${expeditionLeaderSeatId}`);
// actions.ts after rules.nextLeader(...)
if (!state.seatIds.includes(nextLeaderSeatId)) throw new Error(`nextLeader returned unknown seat ${nextLeaderSeatId}`);
```
Also make `currentActorSeatId` throw, rather than returning `undefined`, when `leaderIndex === -1`.

## Info

### IN-01: A phantom `currentTrick` is opened after the final trick

**File:** `packages/rules/src/expedition/actions.ts:68-72`
**Issue:** When the last trick completes, the state gets `currentTrick.index === totalTricks` and a leader, for a trick that can never exist. Phase 11 views or the scene model could render a "next trick" marker or leader badge after the camp ends.
**Fix:** Keep the shape but document it. Alternatively, have views key off `isCampFinished`, or leave `currentTrick` at the final index with empty plays.

### IN-02: `createCamp` stores the caller's `seatIds` array by reference

**File:** `packages/rules/src/expedition/camp.ts:122-123`
**Issue:** `seatIds` is the caller's array, typed `readonly` but not copied. If the caller mutates it (for example, the worker's room seat list), camp state changes too, and actor/picker derivation shifts.
**Fix:** `seatIds: [...seatIds]`.

### IN-03: Duplicated Ace constant

**File:** `packages/rules/src/expedition/leader.ts:10`
**Issue:** `A_OF_SPADES_RANK = 14` duplicates `RANK_ACE` in `deck.ts:20`.
**Fix:** Import `RANK_ACE` from `./deck`.

### IN-04: Purity guard is substring-based and ships test code in `src/`

**File:** `packages/rules/src/expedition/purity.test.ts:14-40`; `packages/rules/src/expedition/test-support.ts`
**Issue:**
- Any comment that mentions a token (for example "unlike Date.now" or "node:") fails the guard spuriously.
- Imports outside the directory (`../shuffle`) are not scanned.
- `test-support.ts` is not a `.test.ts` file, so the package tsconfig (`include: ["src"]`) compiles it into the package's declarations.

**Fix:** Match import specifiers and call sites with a regex, not raw substrings. Scan the transitive `../shuffle` import. Consider renaming to `test-support.testutil.ts` or excluding it from the build tsconfig.

### IN-05: No guard against a "finished but in_progress" camp

**File:** `packages/rules/src/expedition/camp.ts:155-175`
**Issue:** With base rules, every objective is decided once all tricks are played. A future objective kind or rule layer that leaves an objective `pending` at `isCampFinished` would still make `campPhase` return `playing`, name a seat with an empty hand, and leave no legal action. The result is a silent soft-lock.
**Fix:** In `checkCampOutcome`, treat `pending` at `isCampFinished(state)` as failed, or throw an invariant error.

### IN-06: `applyCampAction` comment overstates forged-request handling

**File:** `packages/rules/src/expedition/actions.ts:77-93`
**Issue:** The doc says any hand-forged request is rejected `invalid_action`. A `null` or non-object action throws `TypeError` on `action.type` instead.
**Fix:** Add `if (typeof action !== "object" || action === null) return { ok: false, error: "invalid_action" };`, or narrow the comment to "well-formed objects". The Phase 11 schema layer is expected to validate first.

### IN-07: Objective resolution assumes identities are unique in the deck

**File:** `packages/rules/src/expedition/objectives.ts:67-74`; `packages/rules/src/expedition/deck.ts:114-116`
**Issue:** `trickContaining` matches by identity and returns the first trick. `deckFor` is an overridable hook, and nothing checks that the deck it returns has no duplicate identities. A future deck override with duplicates would silently resolve objectives against the wrong trick.
**Fix:** In `createCamp`, assert that `rules.deckFor(...)` contains no duplicate identities.

---

_Reviewed: 2026-09-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
