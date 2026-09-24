---
phase: 09-expedition-rules-core
plan: 04
subsystem: rules
tags: [expedition, rules-engine, hook-seam, camp-state-machine]
dependency-graph:
  requires: [expedition-state-types, expedition-deck-module, expedition-trick-resolver, expedition-leader, expedition-objective-evaluation, expedition-objective-pick-sequencing]
  provides: [expedition-core-rules-seam, expedition-camp-setup, expedition-camp-derived-state]
  affects: [09-05, 09-06]
tech-stack:
  added: []
  patterns:
    - "Every Core function that can behave differently under a twist/gear takes rules: CoreRules = baseRules as its LAST parameter (Phase 10 composes without changing any call signature)"
    - "campPhase/currentActorSeatId/checkCampOutcome are derived fresh from CampState on every call — mirrors hanabi/endgame.ts's fixed-order, statelessly-recomputed discipline; nothing cached"
key-files:
  created:
    - packages/rules/src/expedition/rules.ts
    - packages/rules/src/expedition/camp.ts
    - packages/rules/src/expedition/camp.test.ts
  modified: []
decisions:
  - "objectiveSlots validated (empty check, card-bearing-count-vs-deck check, exactly-n range, ordered marker rules) before minting any objective id or slicing the objective deck, so a thrown Error never leaves partial minted-id state"
  - "objective ids minted via the same mintCardId/seedToRngState machinery as card ids, seeded from every dealt card id up front, so an objective id can never collide with a card id"
metrics:
  duration: "~20 min"
  completed: 2026-09-23
---

# Phase 9 Plan 4: CoreRules Hook Seam and Camp Setup/Derived-State Summary

The Phase 9 seam every later Core function runs through (`CoreRules`/`baseRules`, spec §6.1) plus the camp state machine's setup and derived layer: `createCamp` deals, finds the leader, and flips objectives from a second shuffled deck; `campPhase`/`currentActorSeatId`/`checkCampOutcome` derive everything else fresh from `CampState` on every call — proven by 27 passing unit tests including a hook-seam override proof with no boss/gear code.

## What Was Built

**`packages/rules/src/expedition/rules.ts`** — `CoreRules` type with the 7 hooks the Core layer calls (`deckFor`, `leaderFor`, `isTrump`, `trickWinner`, `legalPlays`, `nextLeader`, `failureChecks`), and `baseRules`, the base-layer implementation delegating to `deck.ts`/`leader.ts`/`trick.ts` from Plans 01-02. `legalPlays` looks up the seat's hand in `state.hands` (empty array if absent) and calls the shared `legalPlaysFor`/`ledIdentity` resolver. `nextLeader` returns the trick's winner (spec §3's default). `failureChecks` returns `[]` — the base game has none; Mutiny/Camouflage are Phase 10.

**`packages/rules/src/expedition/camp.ts`** — `createCamp(input, rules = baseRules)`: validates player count (3-5) and no duplicate seat ids, deals via `rules.deckFor`/`dealHands`, computes `removedCards` via `complementOf`, builds the objective deck via `buildObjectiveDeck`, validates `objectiveSlots` (non-empty, card-bearing count fits the objective deck, `exactly-n`'s `n` an integer in `[0, totalTricks]`, `ordered`'s marker a positive integer or `"last"` with no duplicate numbers and at most one `"last"`) BEFORE minting any id or slicing the deck, mints each objective's id from `seedToRngState(seed, "expedition-objective-ids")` + `mintCardId` (seeded with every dealt card id so an objective id can never collide with a card id), takes card-bearing slots' targets from the top of the objective deck in slot order, and sets `expeditionLeaderSeatId` via `rules.leaderFor(hands)`. `checkCampOutcome`, `campPhase`, and `currentActorSeatId` are all derived fresh from `CampState` on every call, mirroring `hanabi/endgame.ts`'s fixed-order, statelessly-recomputed discipline: `checkCampOutcome` fails on any failed objective OR any fired failure check, succeeds only when every objective is done, else in-progress; `campPhase` is `objective-pick` while any objective is unowned, `playing` once all are owned and the outcome is still in-progress, `ended` once the outcome is decided; `currentActorSeatId` uses `nextObjectivePicker` during objective-pick, derives the current trick's actor from `currentTrick.leaderSeatId` + `plays.length` during play, and returns `null` once the camp is decided (play stops).

**`packages/rules/src/expedition/camp.test.ts`** — 27 tests: hand sizes/totalTricks/removedCards for 3/4/5 players; leader-is-Sun-holder; objective slot-order flipping with card-bearing targets pulled from the top of `buildObjectiveDeck` in order and the remainder retained in `objectiveDeck`; objective id format/uniqueness/non-collision with card ids; determinism (same inputs deep-equal) and seed variation; every malformed-input rejection (2/6 seats, duplicate seats, empty slots, too many card-bearing slots, out-of-range `exactly-n`, invalid/duplicate `ordered` markers, duplicate `"last"`); the hook-seam override proof (custom `deckFor` stripping both jokers records exactly Sun+Moon as removed and picks the A♠ holder as leader, with no Eclipse code); and every `campPhase`/`currentActorSeatId`/`checkCampOutcome` branch, including a custom `failureChecks` firing while every objective is still pending.

## Task Sequence

1. **Task 1 (auto):** Wrote `rules.ts`; `CoreRules`/`baseRules` grep checks and `eclipse|mutiny|machete|camouflage` (excluding comments) all pass; `tsc -p packages/rules/tsconfig.json --noEmit` clean. Commit `a823fdc`.
2. **Task 2 (auto, tdd):**
   - RED: wrote `camp.test.ts` first (27 `it(` cases); confirmed failure (`Cannot find module './camp'`). Commit `825349e`.
   - GREEN: implemented `camp.ts`; 27/27 tests pass, all acceptance-criteria greps pass (`expedition-objective-ids`, no `seed` field on `state.ts`, `failureChecks(` present, no boss/gear/twist literals outside comments), `tsc` clean. Commit `4e8497f`.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx vitest run packages/rules/src/expedition` — 117/117 passed (6 test files: deck/trick/trick.property/leader/objectives from Plans 01-03, plus this plan's camp.test.ts)
- `npm run typecheck` (`tsc -b`, root project references) — exit 0
- `grep -n "export type CoreRules"` / `grep -n "legalPlaysFor("` in `rules.ts` — both match
- `grep -n "expedition-objective-ids"` / `grep -n "failureChecks("` in `camp.ts` — both match
- `grep -i "eclipse\|mutiny\|machete\|camouflage\|boss\|gear"` in `rules.ts`/`camp.ts` (excluding comments) — empty in both
- `grep -i "seed"` in `state.ts` (excluding comments) — empty (no seed/RNG state stored in `CampState`)

## TDD Gate Compliance

Task 2 shows a `test(...)` commit followed by a `feat(...)` commit in git log (`825349e` -> `4e8497f`); RED confirmed via a real failing run (`Cannot find module './camp'`) before the GREEN implementation.

## Known Stubs

None.

## Threat Flags

None — this plan's threat-register entries (T-09-08 input validation, T-09-09 no seed/RNG-state leak, T-09-10 rule sets are server-side-only) were already scoped in the plan's own `<threat_model>` and are addressed by the validate-before-mint ordering and the grep-enforced absence of a stored seed described above; no new surface introduced.

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/rules.ts
- FOUND: packages/rules/src/expedition/camp.ts
- FOUND: packages/rules/src/expedition/camp.test.ts
- FOUND commit: a823fdc
- FOUND commit: 825349e
- FOUND commit: 4e8497f
