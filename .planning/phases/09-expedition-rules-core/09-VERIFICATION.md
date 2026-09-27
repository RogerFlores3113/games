---
phase: 09-expedition-rules-core
verified: 2026-09-26T21:30:00Z
status: passed
score: 5/5 ROADMAP success criteria verified; 8/8 requirement IDs satisfied
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: "5/5 ROADMAP criteria (with 1 documented non-blocking defect: WR-01/WR-02)"
  gaps_closed:
    - "WR-01: orderedKind.evaluate is now monotone (failed is absorbing) — confirmed by direct code read of objectives.ts:159-201 and by running the full test suite"
    - "WR-02: the ordered-objective property oracle (objectives.property.test.ts) is now a pair-based restatement independent of the implementation, confirmed by direct code read (markerPrecedes, F1/F2/F3, no shared Infinity mapping) — not a transcription"
  gaps_remaining: []
  regressions: []
gaps: []
deferred:
  - truth: "isTrump hook is consulted by trickWinner/legalPlaysFor for non-base trump twists (WR-03)"
    addressed_in: "Phase 10"
    evidence: "Phase 10 goal: 'built on the layered hook/toolkit engine (base -> boss twist -> gear), with the v1 gear catalogue, the provisional boss twists...' — isTrump is a hook seam with no Phase 9 caller by design; the plan (09-08) explicitly excluded WR-03 as Phase 10 hook-composition design work."
  - truth: "trickWinner hook result is validated against the trick's own players before being stored (WR-05)"
    addressed_in: "Phase 10"
    evidence: "WR-05 is only reachable once a composed CoreRules layer overrides nextLeader independently of trickWinner (e.g. Machete gear's commandeer effect, spec §5.1) — that composition is Phase 10 gear-engine work; baseRules never triggers this path."
  - truth: "invalid_rule_hook recovers the camp instead of permanently stalling it, and hook-failure handling is fully consistent (WR-06)"
    addressed_in: "Phase 10"
    evidence: "WR-06 is a residual of the WR-04 fix and only matters once Phase 10 composes hooks that can return bad values; no Phase 9 base-rules path exercises invalid_rule_hook in real play (only hand-injected bad hooks in tests do)."
human_verification: []
---

# Phase 9: Expedition Rules Core Verification Report

**Phase Goal:** A pure, framework-free Expedition rules engine exists — deck construction, legal plays, trick winner, the camp state machine, and all four objective kinds — verified by property tests against the spec's rule text, not just hand-written examples.
**Verified:** 2026-09-26T21:30:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plans 09-07, 09-08), following owner decision recorded in 09-HUMAN-UAT.md ("fix now")

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 3–5 players dealt equal hands from correctly-sized 54/52/50 deck, removed cards shown to everyone | ✓ VERIFIED | Unchanged from prior verification; `deck.ts`/`deck.test.ts`; re-confirmed passing in this run (357/357 rules-project tests, 1301/1301 full suite). |
| 2 | Follow-suit and trick-winner logic correctly handle Sun/Moon joker suit for both lead directions, proven by fast-check across all deck sizes | ✓ VERIFIED | Unchanged; `trick.ts`, `trick.property.test.ts`. Re-confirmed passing. |
| 3 | Sun holder (or A♠ fallback) is leader, picks first objective, leads first; every objective's status always visible | ✓ VERIFIED — WR-01/WR-02 closed | `objectives.ts:159-201` (`orderedKind.evaluate`) now has a symmetric check: `otherMarker > myMarker && otherTrickIndex !== undefined && otherTrickIndex < myTrickIndex` returns `"failed"`, closing the failed→done flip. Read directly — matches plan 09-07's spec. `objectiveStatuses` still recomputes fresh every call (no cached field). |
| 4 | A camp fails the instant any objective becomes impossible, including exactly-N unreachability before the holder's final relevant trick, proven by fast-check on failure timing | ✓ VERIFIED — WR-01/WR-02 closed | `objectives.property.test.ts`'s `orderedOracle` (lines ~93-159) is now pair-based: `markerPrecedes(a,b)` has no numeric/Infinity mapping (confirmed by direct read — the only `POSITIVE_INFINITY` occurrences left in the file are in doc-comment prose explaining the OLD bug, not in executable code), and F1/F2/F3 failure conditions share no branch structure with `orderedKind.evaluate`. The new `rawSequenceCampArb` generator builds post-failure `CampState` prefixes directly (bypassing `driveCamp`/`applyCampAction`, which halt at first failure), and the property asserts oracle equality plus absorbing-failed monotonicity at every prefix, with two non-vacuity counters (`failedThenOwnWonByOwnerRuns`, `failedBeforeEnd` per kind) both asserted `> 0`. Ran the full property test myself — passes. |
| 5 | Played cards are final: no undo, no auto-play of a queued card | ✓ VERIFIED | Unchanged; `actions.ts applyCampAction`. Additionally hardened by 09-08: non-object/null actions now explicitly rejected (`invalid_action`) instead of throwing, confirmed at `actions.ts:97`. |

**Score:** 5/5 ROADMAP criteria verified with no open defects. The two review findings that previously routed this phase to `human_needed` (WR-01, WR-02) are closed, confirmed by direct code reading (not just SUMMARY claims) and by running the full test suite myself.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/rules/src/expedition/objectives.ts` | Monotone `orderedKind.evaluate`, all four kinds | ✓ VERIFIED | Symmetric higher/lower-marker check present (`otherTrickIndex < myTrickIndex`, count 1); "Monotonicity (WR-01)" header paragraph present (count 1). Read directly, matches described fix. |
| `packages/rules/src/expedition/objectives.test.ts` | WR-01 regression unit tests | ✓ VERIFIED | `WR-01` appears 2x; A-TIE test still present and passing. |
| `packages/rules/src/expedition/objectives.property.test.ts` | Independent pair-based ordered oracle + raw-sequence prefix monotonicity property | ✓ VERIFIED | `markerPrecedes` defined once, no numeric Infinity mapping in executable code; `rawSequenceCampArb` used in the new property; both non-vacuity counters present and asserted `>0`; only `evaluateObjective` imported from `./objectives` (oracle logic is standalone); no `driveCamp`/`applyCampAction` call inside the new property (both only appear in pre-existing camp-stop properties). |
| `packages/rules/src/expedition/state.ts` | `invalid_rule_hook` CampError member | ✓ VERIFIED | Present, last member of the union, with doc comment distinguishing it from player error. |
| `packages/rules/src/expedition/actions.ts` | `nextLeader` result validated against `seatIds`; non-object action guard | ✓ VERIFIED | `seatIds.includes(nextLeaderSeatId)` check present at line 71, returns `invalid_rule_hook` on failure; `typeof action !== "object" || action === null` guard present at line 97. |
| `packages/rules/src/expedition/camp.ts` | `leaderFor` result validated; `seatIds` copied; `currentActorSeatId` invariant | ✓ VERIFIED | `leaderFor returned unknown seat` throw present; `seatIds: [...seatIds]` present; `is not in seatIds` invariant throw present. All three greps return exactly 1 match as the plan specified. |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `objectives.property.test.ts` (new raw-sequence property) | `objectives.ts evaluateObjective` | comparison-only calls at every prefix | ✓ WIRED — confirmed by direct read; oracle logic itself never calls `evaluateObjective` or any objectives.ts internal helper |
| `camp.ts checkCampOutcome` | `objectives.ts orderedKind.evaluate` (fixed) | `objectiveStatuses` | ✓ WIRED — unchanged plumbing, now backed by a correct evaluator |
| `actions.ts applyPlayCard` | `rules.nextLeader` | `state.seatIds.includes(nextLeaderSeatId)` check before building next trick | ✓ WIRED — confirmed present |
| `camp.ts createCamp` | `rules.leaderFor` | `seatIds.includes(expeditionLeaderSeatId)` check before storing | ✓ WIRED — confirmed present |

### Behavioral Spot-Checks (run independently, not from SUMMARY claims)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full rules-project test suite | `npx vitest run --project rules` | 29 files, 357 tests, all passed | ✓ PASS |
| Full monorepo test suite | `npm test` | 94 files, 1301 tests, all passed | ✓ PASS |
| Typecheck | `npm run typecheck` (`tsc -b`) | clean, no output | ✓ PASS |
| No debt markers in non-test expedition source | `grep -rn "TBD\|FIXME\|XXX" packages/rules/src/expedition/*.ts \| grep -v .test.ts` | no output | ✓ PASS |
| All 09-07/09-08 acceptance-criteria greps | see below | all pass except one cosmetic mismatch (see Anti-Patterns) | ✓ PASS (substantively) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| XRULE-01 | 09-01, 09-04 | Deck sizes/removed cards/equal deal | ✓ SATISFIED | Unchanged; re-confirmed passing |
| XRULE-02 | 09-02, 09-05, 09-06, 09-08 | Follow-suit + trick winner, winner leads next | ✓ SATISFIED | Unchanged plus 09-08's `nextLeader` hardening |
| XRULE-03 | 09-02, 09-06 | Sun/Moon forced-follow joker suit | ✓ SATISFIED | Unchanged; re-confirmed passing |
| XRULE-04 | 09-02, 09-04, 09-05, 09-06, 09-08 | Sun/A♠ leader, picks + leads first | ✓ SATISFIED | Unchanged plus 09-08's `leaderFor` hardening |
| XRULE-05 | 09-03, 09-04, 09-05 | Objective flip + clockwise pick order | ✓ SATISFIED | Unchanged; re-confirmed passing |
| XRULE-06 | 09-03, 09-06, 09-07 | Four objective kinds, always-visible status | ✓ SATISFIED | `ordered` kind now monotone; all four kinds pass property tests |
| XRULE-07 | 09-03, 09-04, 09-05, 09-06, 09-07 | Instant failure detection, play stops | ✓ SATISFIED | `ordered` kind failure timing now independently proven; `exactly-n` already proven prior verification |
| XRULE-08 | 09-05, 09-06 | No undo, no auto-play, final plays | ✓ SATISFIED | Unchanged plus 09-08's non-object action guard |

No orphaned requirements — all 8 IDs from REQUIREMENTS.md appear in Phase 9 plan frontmatter (including gap-closure plans 09-07/09-08) and are marked Complete in REQUIREMENTS.md's tracking table.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `objectives.property.test.ts` | 81 | Doc-comment prose mentions `Number.POSITIVE_INFINITY` (describing the OLD, now-replaced oracle, for context) | ℹ Info | Cosmetic only — this is inside a `/** */` doc comment, not executable code; the plan's own acceptance-criteria grep (`grep -v '^\s*//'`) only strips `//` line comments so it still counts this line, but the intent (no numeric Infinity mapping in the oracle's actual logic) is satisfied — `markerPrecedes` itself contains no such mapping. Not a functional gap. |
| `objectives.ts`/`trick.ts`/`actions.ts` | various | `isTrump` hook still never called by Core (WR-03) | ℹ Info, deferred | Confirmed still present in 09-REVIEW.md re-review; explicitly deferred to Phase 10 hook-composition work (see Deferred section) |
| `actions.ts` | 61-67 | `trickWinner` hook result stored unvalidated (WR-05, new finding from 09-REVIEW.md re-review) | ℹ Info, deferred | Only reachable once a Phase 10 layer overrides `nextLeader` independently of `trickWinner`; baseRules never exercises this path. Deferred (see Deferred section) |
| `actions.ts`/`camp.ts` | various | `invalid_rule_hook` still permanently stalls the camp instead of recovering (WR-06, new finding introduced by the WR-04 fix itself) | ℹ Info, deferred | Only reachable via a bad composed hook; base rules never trigger it. Deferred (see Deferred section) |

No TBD/FIXME/XXX debt markers found in any Phase 9 non-test file (re-confirmed via grep in this verification run).

### Gaps Summary

No blocking gaps. Both must-fix items from the previous `human_needed` verification (WR-01: non-monotone ordered evaluator; WR-02: self-confirming property oracle) are closed, confirmed independently by direct code reading of the fix (not SUMMARY narrative) and by running the full test suite (357/357 rules tests, 1301/1301 monorepo tests, clean typecheck) myself in this verification pass. The gap-closure plans' own must_haves (09-07: monotone evaluator + independent oracle + non-vacuity proof; 09-08: `invalid_rule_hook` validation for `leaderFor`/`nextLeader`, seatIds copy, non-object action guard) are all present in the code exactly as specified, with matching acceptance-criteria greps (one cosmetic doc-comment mismatch noted above, non-blocking).

Three new review warnings (WR-03, WR-05, WR-06) surfaced during the 09-08 re-review. All three are scoped to rule-hook composition robustness that is only reachable once a Phase 10 layer (boss twists, gear, Machete's commandeer effect) composes `CoreRules` hooks differently from `baseRules`. Phase 9's own goal and all 5 ROADMAP success criteria are about the base rules engine (deck, legal plays, trick winner, camp state machine, four objective kinds) working correctly and being provably tested — none of the three deferred warnings affect base-rules correctness today, and Phase 10's own stated goal ("built on the layered hook/toolkit engine... v1 gear catalogue, provisional boss twists") is exactly where hook-composition robustness becomes load-bearing. They are recorded as deferred, not accepted-and-forgotten: 09-REVIEW.md documents them and this VERIFICATION.md's frontmatter carries them forward for Phase 10 planning to pick up.

---

_Verified: 2026-09-26T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
