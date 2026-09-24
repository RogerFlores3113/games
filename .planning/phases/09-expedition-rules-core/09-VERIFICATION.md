---
phase: 09-expedition-rules-core
verified: 2026-09-23T23:10:00Z
status: human_needed
score: 8/8 must-haves verified (with 1 documented non-blocking defect)
overrides_applied: 0
gaps: []
deferred: []
human_verification:
  - test: "Decide whether WR-01/WR-02 (non-monotone ordered evaluator, self-confirming ordered oracle) must be fixed inside Phase 9 before Phase 10, or can move forward as tracked debt"
    expected: "Owner decision: fix now (re-plan Phase 9), or accept and track for Phase 10 (continue-after-fail / replay views) with a follow-up ID referenced in code"
    why_human: "This is a judgment call about acceptable technical debt, not something a grep-based verifier can resolve — the bug is unreachable in current base-rule play (confirmed by code trace) but breaks the 'pure function correct at any CampState' contract that Phase 10 (Trail Map holder swaps, continue-after-fail, replay/log views) is expected to build on"
---

# Phase 9: Expedition Rules Core Verification Report

**Phase Goal:** A pure, framework-free Expedition rules engine exists — deck construction, legal plays, trick winner, the camp state machine, and all four objective kinds — verified by property tests against the spec's rule text, not just hand-written examples.
**Verified:** 2026-09-23T23:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 3–5 players dealt equal hands from correctly-sized 54/52/50 deck, removed cards shown to everyone | ✓ VERIFIED | `deck.ts` `buildFullDeck`/`removedCardsFor`/`baseDeckFor`/`complementOf`; `deck.test.ts` asserts deck lengths 54/52/50, hand sizes 18/13/10, and `removedCards` recorded in `CampState` via `camp.ts:86` (`complementOf(deck)`). All `deck.test.ts` assertions pass (348/348 suite tests pass). |
| 2 | Follow-suit and trick-winner logic correctly handle Sun/Moon joker suit for both lead directions, proven by fast-check across all deck sizes | ✓ VERIFIED | `trick.ts` `legalPlaysFor`/`trickWinner` implement joker-first branches exactly as spec'd. `trick.property.test.ts` uses `fc.constantFrom(3, 4, 5)` at lines 28/82/129, 200 runs each, covering both lead directions (Sun led / Moon led) per plan's must-haves. Also re-proven inside whole-camp simulation in `camp.property.test.ts`. |
| 3 | Sun holder (or A♠ fallback) is leader, picks first objective, leads first; every objective's status always visible | ✓ VERIFIED (with caveat, see WR-01/WR-02 below) | `leader.ts leaderFor`; `camp.ts createCamp` seeds `expeditionLeaderSeatId` from it and uses it for both first pick and trick-0 lead. `objectiveStatuses(state)` (objectives.ts) recomputes every objective's status fresh from `CampState` on every call — confirmed no stored/cached status field exists on `Objective`. However, the `ordered` kind's evaluator has a confirmed non-monotone defect (see below) that is currently unreachable in real play but breaks the "status always visible/correct at any state" contract for hypothetical future consumers. |
| 4 | A camp fails the instant any objective becomes impossible, including exactly-N unreachability before the holder's final relevant trick, proven by fast-check on failure timing | ✓ VERIFIED for reachable play / ⚠ evidentiary gap for the `ordered` kind | `checkCampOutcome` fails when ANY objective is `failed`; `objectives.property.test.ts`'s `exactly-n` test has an independently-written `exactlyNOracle` (not a transcription of `exactlyNKind.evaluate`) plus a non-vacuity counter (`unreachableWhileFeasibleRuns`) asserted `>0` — this genuinely proves XRULE-07 for exactly-n. The `ordered` kind's `orderedOracle` in the same file is a line-by-line copy of `orderedKind.evaluate` (confirmed by direct code comparison, matching 09-REVIEW.md WR-02) — the property test for ordered failure timing is self-confirming, not an independent proof against spec text. Confirmed separately (WR-01, code-traced) that `orderedKind.evaluate` is non-monotone: an objective can go `failed` → `done` if the state is advanced past the point checkCampOutcome would normally halt play. Confirmed `driveCamp` (test-support.ts:111-113) halts as soon as `enumerateLegalActions` returns empty, which happens the instant `checkCampOutcome` leaves `in_progress` — so this bug is unreachable through `applyCampAction`/`driveCamp` today, and the camp-stop property (`objectives.property.test.ts` "camp stops at exactly the first state any objective evaluates failed") does correctly confirm stop-on-first-failure for reachable states. |
| 5 | Played cards are final: no undo, no auto-play of a queued card | ✓ VERIFIED | `actions.ts applyCampAction` only implements `pick-objective`/`play-card`; any other/malformed `action.type` falls through to `return { ok: false, error: "invalid_action" }` (line 93) with no state mutation. No undo action type exists in `CampAction` (state.ts). Trick completion (winner computed, `nextLeader` set) never invokes `applyCampAction` recursively or auto-plays a card — confirmed by reading `actions.ts` trick-completion branch. |

**Score:** 5/5 ROADMAP criteria hold in reachable gameplay; criteria 3 and 4 carry a documented, code-review-confirmed defect (WR-01/WR-02) in the `ordered` objective evaluator's correctness-at-any-state guarantee and its property-test independence. This does not block current phase behavior but is a real gap in the "verified by property tests against spec text" phase goal for one of the four objective kinds.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/rules/src/expedition/state.ts` | Full Expedition type contract | ✓ VERIFIED | Exists, exports `CampState` and full union types; compiled against by every other module |
| `packages/rules/src/expedition/deck.ts` | Deck construction, removed cards, dealing | ✓ VERIFIED | All exports present (`buildFullDeck`, `removedCardsFor`, `baseDeckFor`, `complementOf`, `identitiesEqual`, `cardLabel`, `assertPlayerCount`, `dealHands`, `buildObjectiveDeck`) |
| `packages/rules/src/expedition/trick.ts` | legalPlaysFor, isTrump, ledIdentity, trickWinner | ✓ VERIFIED | All present; joker branch checked before suit filter as required |
| `packages/rules/src/expedition/leader.ts` | leaderFor(hands) | ✓ VERIFIED | Sun-then-A♠ fallback, generic (no boss id) |
| `packages/rules/src/expedition/objectives.ts` | Four-kind registry, evaluateObjective, objectiveStatuses, nextObjectivePicker etc. | ⚠ STUB-ADJACENT DEFECT | Exists, substantive, wired, tested — but `orderedKind.evaluate` has a confirmed non-monotonicity bug (WR-01) |
| `packages/rules/src/expedition/rules.ts` | CoreRules seam + baseRules | ✓ VERIFIED | `export type CoreRules`, `baseRules` present; `isTrump` is declared but never called anywhere in Core (WR-03, info/warning in review, does not block Phase 9 goal since no Phase 9 feature depends on it) |
| `packages/rules/src/expedition/camp.ts` | createCamp, campPhase, currentActorSeatId, checkCampOutcome | ✓ VERIFIED | All present and correctly derive rather than store phase/actor |
| `packages/rules/src/expedition/legality.ts` + `actions.ts` | Legality predicates + applyCampAction | ✓ VERIFIED | Own-hand-only lookup, immutability, camp_over gating, invalid_action rejection all confirmed by direct reading |
| `packages/rules/src/expedition/test-support.ts` | enumerateLegalActions, locateAllCards, driveCamp | ✓ VERIFIED | Present; `driveCamp` halts on first non-`in_progress` outcome as documented |
| `*.property.test.ts` files | fast-check proofs vs spec text | ⚠ PARTIAL | trick/leader property tests are genuinely independent; exactly-n objective property test is genuinely independent with non-vacuity counters; **ordered-objective property test oracle is a transcription of the implementation (WR-02), not an independent proof** |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `deck.ts` | `../shuffle` | `shuffleWithSeed`/`seedToRngState`/`mintCardId` imports | ✓ WIRED |
| `trick.property.test.ts` | `deck.ts` | `dealHands(baseDeckFor(n))` | ✓ WIRED |
| `camp.ts createCamp` | `rules.deckFor`/`rules.leaderFor` | CoreRules param defaulting to `baseRules` | ✓ WIRED |
| `camp.ts checkCampOutcome` | `objectives.ts objectiveStatuses` + `rules.failureChecks` | fresh evaluation each call | ✓ WIRED |
| `legality.ts canPlayCard` | `rules.legalPlays` | follow-suit membership check | ✓ WIRED |
| `actions.ts` | `rules.trickWinner`/`rules.nextLeader` | trick completion | ✓ WIRED |
| `test-support.ts enumerateLegalActions` | `legality.ts` predicates | candidate filtering only through exported predicates (no re-derivation) | ✓ WIRED |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| XRULE-01 | 09-01, 09-04 | Deck sizes/removed cards/equal deal | ✓ SATISFIED | deck.ts + deck.test.ts, camp.ts records removedCards/totalTricks |
| XRULE-02 | 09-02, 09-05, 09-06 | Follow-suit + trick winner, winner leads next | ✓ SATISFIED | trick.ts + property tests + actions.ts trick completion |
| XRULE-03 | 09-02, 09-06 | Sun/Moon forced-follow joker suit | ✓ SATISFIED | trick.ts joker branch + trick.property.test.ts |
| XRULE-04 | 09-02, 09-04, 09-05, 09-06 | Sun/A♠ leader, picks + leads first | ✓ SATISFIED | leader.ts, camp.ts createCamp, camp.property.test.ts |
| XRULE-05 | 09-03, 09-04, 09-05 | Objective flip + clockwise pick order | ✓ SATISFIED | objectives.ts nextObjectivePicker, camp.ts, actions.ts |
| XRULE-06 | 09-03, 09-06 | Four objective kinds, always-visible status | ⚠ SATISFIED WITH DEFECT | objectives.ts implements all four kinds; `ordered` kind non-monotone (WR-01) under states unreachable in base play today |
| XRULE-07 | 09-03, 09-04, 09-05, 09-06 | Instant failure detection, play stops | ⚠ SATISFIED FOR REACHABLE PLAY / evidentiary gap for ordered proof | checkCampOutcome + exactly-n property test genuinely independent and non-vacuous; ordered-kind property test self-confirming (WR-02) |
| XRULE-08 | 09-05, 09-06 | No undo, no auto-play, final plays | ✓ SATISFIED | actions.ts, legality.ts, purity/action tests |

No orphaned requirements — all 8 IDs from REQUIREMENTS.md appear in Phase 9 plan frontmatter and are marked Complete there.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `objectives.ts` | 161-171 | Non-monotone ordered-objective evaluator (WR-01, confirmed by code trace) | ⚠ Warning | Breaks "pure function correct at any CampState" contract for future Phase 10 consumers (continue-after-fail, replay/log views); unreachable via current `applyCampAction`/`driveCamp` because play halts at first failure |
| `objectives.property.test.ts` | 85-115 | Self-confirming ordered oracle, a transcription of the implementation (WR-02, confirmed by code comparison) | ⚠ Warning | The property test does not actually prove ordered-kind failure timing against independently-restated spec text, unlike the exactly-n test in the same file |
| `rules.ts`/`trick.ts`/`actions.ts` | various | `isTrump` hook declared but never called by Core (WR-03, from 09-REVIEW.md) | ℹ Info | No Phase 9 feature depends on it; flagged for Phase 10 twist composition |
| `camp.ts`/`actions.ts`/`objectives.ts` | various | Hook-supplied seat ids (`leaderFor`/`nextLeader`) unvalidated (WR-04, from 09-REVIEW.md) | ℹ Info | Not exercised by base rules; relevant only once Phase 10 composes hooks |

No TBD/FIXME/XXX debt markers found in any Phase 9 file (checked via grep across all `expedition/*.ts` non-test files).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full Phase 9 expedition test suite | `npx vitest run --project rules` | 29 files, 348 tests, all passed | ✓ PASS |
| Deck sizes and hand sizes match spec | inspected `deck.test.ts` assertions (54/52/50, 18/13/10) | present and passing | ✓ PASS |
| Ordered-evaluator non-monotonicity | manual code trace of `objectives.ts:161-171` against WR-01's described scenario (② won trick 0 → ① fails; ① won trick 1 → ① reports done) | logic confirmed reachable via direct calls to `evaluateObjective` on hand-built states, confirmed unreachable via `driveCamp`/`applyCampAction` because `checkCampOutcome` halts play at first failure | ✓ CONFIRMED (defect exists, scoped as described) |

### Human Verification Required

1. **WR-01/WR-02 disposition**

   **Test:** Review the non-monotone ordered-objective evaluator (`objectives.ts:161-171`) and the self-confirming ordered oracle in `objectives.property.test.ts:85-115`, both flagged by 09-REVIEW.md and independently confirmed here by direct code trace.
   **Expected:** An owner decision on whether this must be fixed before Phase 9 is considered closed, or can be accepted as tracked debt for a Phase 10 follow-up (continue-after-fail, replay/log views, or the deferred "why we failed" feature all depend on this function's correctness at arbitrary states).
   **Why human:** This is a judgment call about acceptable technical debt versus phase-goal completeness — the bug does not affect any currently reachable game state (base play halts at first failure, confirmed by code trace of `driveCamp`), so it is not a functional regression today, but it does mean the phase's "verified by property tests against the spec's rule text" goal is not fully met for the `ordered` objective kind specifically, since its property test cannot catch implementation bugs by construction.

### Gaps Summary

No blocking gaps. All artifacts exist, are substantive, and are wired correctly; all 348 tests pass; all 8 requirement IDs are accounted for with implementation evidence; four of five ROADMAP success criteria are cleanly verified. The one open item — the `ordered` objective evaluator's non-monotonicity and its property test's lack of independence — is real, code-review-confirmed, and currently non-blocking for reachable gameplay, but is exactly the kind of thing the phase goal ("verified by property tests against the spec's rule text, not just hand-written examples") was meant to catch, and did not, for one of the four objective kinds. Routed to human decision rather than auto-failed, since the phase's other four success criteria and all requirement IDs are otherwise solidly verified with passing evidence.

---

_Verified: 2026-09-23T23:10:00Z_
_Verifier: Claude (gsd-verifier)_
