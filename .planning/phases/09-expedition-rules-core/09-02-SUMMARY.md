---
phase: 09-expedition-rules-core
plan: 02
subsystem: rules
tags: [expedition, trick-taking, rules-engine, fast-check]
dependency-graph:
  requires: [expedition-state-types, expedition-deck-module]
  provides: [expedition-trick-resolver, expedition-leader]
  affects: [09-04, 09-05]
tech-stack:
  added: []
  patterns:
    - "legalPlaysFor is the single shared follow-suit resolver — the joker branch is checked before the suit filter, so jokers never fall through a suit === comparison"
    - "trickWinner checks joker plays before any rank comparison, so a joker is never compared by rank"
    - "leaderFor is written generically (Sun absent for ANY reason falls back to A of spades) so Phase 10's Eclipse twist reuses it unchanged with no boss id in core code"
key-files:
  created:
    - packages/rules/src/expedition/trick.ts
    - packages/rules/src/expedition/trick.test.ts
    - packages/rules/src/expedition/trick.property.test.ts
    - packages/rules/src/expedition/leader.ts
    - packages/rules/src/expedition/leader.test.ts
  modified: []
decisions:
  - "trickWinner treats 'led is a joker with no play following the led suit' as unreachable rather than a special case: if led is Sun/Moon it is itself already returned by the sun/moon checks before the standard-suit branch runs"
metrics:
  duration: "~10 min"
  completed: 2026-09-23
---

# Phase 9 Plan 2: Trick Follow-Suit Resolver and Expedition Leader Summary

The trick-taking heart of Expedition: `legalPlaysFor` (the one shared follow-suit resolver, including the Sun/Moon two-card joker suit), `trickWinner` (joker precedence over highest-rank-of-led-suit), and `leaderFor` (Sun holder, A♠ fallback) — proven by 30 unit tests and 3 fast-check properties (numRuns: 200) across 3/4/5-player deals.

## What Was Built

**`packages/rules/src/expedition/trick.ts`** — `ledIdentity` (plays[0]'s identity or null), `isTrump` (true for Sun/Moon only), `legalPlaysFor` (null led → whole hand; joker led → the other joker alone if held, else whole hand; standard led → same-suit cards, or whole hand when void, jokers included), `trickWinner` (Sun wins, else Moon, else highest rank of the led suit; throws on empty plays). The joker branch in `legalPlaysFor` runs before the suit filter, and `trickWinner` checks Sun/Moon plays before any rank comparison, per RESEARCH.md Pitfalls 1–2.

**`packages/rules/src/expedition/trick.test.ts`** — 21 unit tests covering every `<behavior>` example: leading, follow-suit, void-hand joker-inclusion, both joker-lead directions with and without the other joker held, `isTrump`, `ledIdentity`, and `trickWinner`'s off-suit-loses / joker-precedence / never-compare-a-joker-by-rank cases.

**`packages/rules/src/expedition/trick.property.test.ts`** — 3 `fc.assert` properties (`fc.constantFrom(3, 4, 5)`, hex-string seeds, `numRuns: 200`), built on `dealHands(baseDeckFor(n))`: (1) `legalPlaysFor` output is always a non-empty subset of the hand and honors follow-suit/void/joker rules; (2) a forced-joker-lead property that leads both the Sun holder's Sun and the Moon holder's Moon on every run, so both lead directions are exercised unconditionally; (3) a full-trick property where each seat plays via `legalPlaysFor` in seat order and `trickWinner`'s result is checked against the spec rule and always found among the trick's own seats.

**`packages/rules/src/expedition/leader.ts`** — `leaderFor(hands)`: returns the Sun holder's seatId; falls back to the A♠ holder; throws `Error("leaderFor: no Sun and no A♠ in any hand — deck is malformed")` otherwise. Written generically (no `eclipse`/boss literal anywhere) so Phase 10's Eclipse twist reuses it unchanged.

**`packages/rules/src/expedition/leader.test.ts`** — 9 tests: Sun-holder correctness across 3/4/5 players and 6 seeds via real `dealHands` deals, A♠ fallback with and without the Moon present, and the malformed-deal throw.

## Task Sequence

1. **Task 1 (auto, tdd):**
   - RED: wrote `trick.test.ts` and `trick.property.test.ts` first; confirmed both fail (`Cannot find module './trick'`). Commit `bfc5d4b`.
   - GREEN: implemented `trick.ts`; 21/21 unit tests and 3/3 properties pass (200 runs each), all acceptance-criteria greps pass, `tsc -p packages/rules/tsconfig.json --noEmit` clean. Commit `cc04b16`.
2. **Task 2 (auto, tdd):**
   - RED: wrote `leader.test.ts` first; confirmed failure (`Cannot find module './leader'`). Commit `7a6304c`.
   - GREEN: implemented `leader.ts`; 9/9 tests pass, `eclipse` grep empty, `tsc` clean. Commit `bd17e15`.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx vitest run packages/rules/src/expedition` — 50/50 passed (4 test files: deck.test.ts from Plan 01 plus this plan's 3)
- `npx tsc -p packages/rules/tsconfig.json --noEmit` — exit 0
- `grep -c "fc.assert" trick.property.test.ts` → 3; `fc.constantFrom(3, 4, 5)` and `numRuns: 200` present
- `grep -c "^export function" trick.ts` → 4 (`ledIdentity`, `isTrump`, `legalPlaysFor`, `trickWinner`)
- `grep -i "eclipse" leader.ts` (excluding comments) → empty

## TDD Gate Compliance

Both tasks show a `test(...)` commit followed by a `feat(...)` commit in git log (`bfc5d4b` → `cc04b16`; `7a6304c` → `bd17e15`); RED confirmed via a real failing run before each GREEN implementation. No REFACTOR commit was needed for either task.

## Known Stubs

None.

## Threat Flags

None — this plan's only threat-register entries (T-09-04, T-09-05) were already scoped in the plan's own `<threat_model>` and are addressed by the single-shared-resolver design and joker-precedence-first ordering described above; no new surface introduced.

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/trick.ts
- FOUND: packages/rules/src/expedition/trick.test.ts
- FOUND: packages/rules/src/expedition/trick.property.test.ts
- FOUND: packages/rules/src/expedition/leader.ts
- FOUND: packages/rules/src/expedition/leader.test.ts
- FOUND commit: bfc5d4b
- FOUND commit: cc04b16
- FOUND commit: 7a6304c
- FOUND commit: bd17e15
