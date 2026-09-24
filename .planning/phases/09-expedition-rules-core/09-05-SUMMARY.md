---
phase: 09-expedition-rules-core
plan: 05
subsystem: rules
tags: [expedition, rules-engine, legality, state-transition, tdd]
dependency-graph:
  requires: [expedition-core-rules-seam, expedition-camp-setup, expedition-camp-derived-state]
  provides: [expedition-legality-predicates, expedition-apply-camp-action]
  affects: [09-06]
tech-stack:
  added: []
  patterns:
    - "canPickObjective/canPlayCard guard order is camp_over -> wrong_phase -> not_your_turn -> action-specific (deliberately differs from hanabi/legality.ts's turn-first order because currentActorSeatId is null once the camp is decided)"
    - "applyCampAction validates every transition through legality.ts's exported predicates first, then builds new state objects field-by-field/via spread — never mutates its input"
key-files:
  created:
    - packages/rules/src/expedition/legality.ts
    - packages/rules/src/expedition/legality.test.ts
    - packages/rules/src/expedition/actions.ts
    - packages/rules/src/expedition/actions.test.ts
  modified: []
decisions:
  - "legality.test.ts and actions.test.ts hand-build minimal CampState literals (not routed through createCamp) wherever a test needs exact control over hand contents or a guaranteed objective-failure trick, since CampState is plain data with no runtime-enforced invariants beyond the type system"
metrics:
  duration: "~20 min"
  completed: 2026-09-24
---

# Phase 9 Plan 5: Camp Legality and Action Transitions Summary

The only two Phase 9 state transitions — pick-objective and play-card — landed behind legality predicates that mirror Hanabi's own-hand-only lookup pattern, proven by 24 tests: a full camp can now be played action by action from `createCamp` to a decided outcome through `applyCampAction` alone.

## What Was Built

**`packages/rules/src/expedition/legality.ts`** — `Legality` type (`{ legal: true } | { legal: false; reason: CampError }`), `findOwnCard` (searches ONLY the named seat's own hand, mirroring `hanabi/legality.ts`'s `findOwnSlot`), `canPickObjective` and `canPlayCard`. Guard order is `camp_over -> wrong_phase -> not_your_turn -> action-specific` — deliberately different from Hanabi's turn-first order because `currentActorSeatId` returns `null` once the camp is decided, so `camp_over` must be checked before any turn-dependent lookup would even make sense. Follow-suit legality is decided exclusively by `rules.legalPlays` (which delegates to `trick.ts`'s `legalPlaysFor`) — there is no second copy of the follow-suit rule.

**`packages/rules/src/expedition/actions.ts`** — `applyCampAction(state, actorSeatId, action, rules = baseRules)`, the only transition function in Phase 9. Dispatches on `action.type`; anything other than `"pick-objective"`/`"play-card"` (including a hand-forged `{ type: "undo" }` cast through `unknown`) returns `invalid_action`. `pick-objective` sets the named objective's `ownerSeatId` after validating through `canPickObjective`. `play-card` validates through `canPlayCard`, removes the card from the actor's hand, appends it to `currentTrick.plays`, and — only when the last seat's play lands — resolves the trick via `rules.trickWinner`, appends it to `completedTricks`, and opens the next trick led by `rules.nextLeader`'s answer. No outcome is computed or stored here; every caller derives it fresh via `checkCampOutcome`. Every returned state is a new object; the function never mutates its input.

**Tests** — `legality.test.ts` (14 tests) covers each `CampError` reason the predicates can return, including camp_over winning over every other check once `checkCampOutcome` is decided, and a hand-built playing-phase state proving the own-hand-only and follow-suit rejections precisely. `actions.test.ts` (10 tests) drives real camps through `createCamp` + `applyCampAction` to prove leader-first clockwise picking order, play-card's hand/trick mutation, trick completion and the `nextLeader` hook seam (a custom rule set overriding which seat leads next), XRULE-07's play-stops guarantee (pinning down the exact action that flips `checkCampOutcome` to `failed`, via a hand-built about-to-fail state), a full camp driven with a fixed first-legal-play policy reaching a decided outcome no later than the last trick, XRULE-08's no-undo/no-auto-play guarantees, and non-mutation of `applyCampAction`'s input state for both accepted and rejected actions.

## Task Sequence

1. **Task 1 (auto, tdd):**
   - RED: wrote `legality.test.ts` first (14 `it(` cases); confirmed failure (`Cannot find module './legality'`). Commit `33591b9`.
   - GREEN: implemented `legality.ts`; 14/14 tests pass, all acceptance-criteria greps pass (`card_not_in_hand` test present, `rules.legalPlays(` present, no `suit ===` second follow-suit copy), `tsc -p packages/rules/tsconfig.json --noEmit` clean. Commit `c4d7d13`.
2. **Task 2 (auto, tdd):**
   - RED: wrote `actions.test.ts` first (10 `it(` cases); confirmed failure (`Cannot find module './actions'`). Commit `1d8dc5a`.
   - GREEN: implemented `actions.ts`; 10/10 tests pass (141/141 across the whole `expedition/` suite), all acceptance-criteria greps pass (`canPlayCard(`/`canPickObjective(` >= 2 matches, `rules.trickWinner(`/`rules.nextLeader(` exactly 2 matches, `undo` appears only in comment lines), `tsc` and `npm run typecheck` clean. Commit `bf40131`.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx vitest run packages/rules/src/expedition` — 141/141 passed (8 test files: deck/trick/trick.property/leader/objectives/camp from Plans 01-04, plus this plan's legality.test.ts and actions.test.ts)
- `npm run typecheck` (`tsc -b`, root project references) — exit 0
- `grep -n "card_not_in_hand"` in `legality.test.ts` — matches
- `grep -n "rules.legalPlays("` in `legality.ts` matches; `grep -n "suit ==="` in `legality.ts` — empty
- `grep -n "canPlayCard(\|canPickObjective("` in `actions.ts` — 2 matches
- `grep -n "rules.trickWinner(\|rules.nextLeader("` in `actions.ts` — 2 matches
- `grep "undo" actions.ts | grep -vE "^[[:space:]]*(//|\*|/\*)"` — empty (undo appears only in comments)

## TDD Gate Compliance

Both tasks show a `test(...)` commit followed by a `feat(...)` commit in git log (`33591b9` -> `c4d7d13`; `1d8dc5a` -> `bf40131`); RED confirmed via a real failing run (`Cannot find module`) before each GREEN implementation.

## Known Stubs

None.

## Threat Flags

None — this plan's threat-register entries (T-09-11 own-hand-only resolution, T-09-12 fixed guard order, T-09-13 single follow-suit resolver, T-09-14 no-undo/no-auto-play, T-09-15 accepted information-disclosure risk deferred to Phase 11) were already scoped in the plan's own `<threat_model>` and are addressed by the implementation and its acceptance-criteria greps described above; no new surface introduced.

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/legality.ts
- FOUND: packages/rules/src/expedition/legality.test.ts
- FOUND: packages/rules/src/expedition/actions.ts
- FOUND: packages/rules/src/expedition/actions.test.ts
- FOUND commit: 33591b9
- FOUND commit: c4d7d13
- FOUND commit: 1d8dc5a
- FOUND commit: bf40131
