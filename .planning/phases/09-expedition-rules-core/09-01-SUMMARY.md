---
phase: 09-expedition-rules-core
plan: 01
subsystem: rules
tags: [expedition, deck, types, rules-engine]
dependency-graph:
  requires: []
  provides: [expedition-state-types, expedition-deck-module]
  affects: [09-02, 09-03]
tech-stack:
  added: []
  patterns:
    - "Expedition-only shuffle streams (expedition-deck, expedition-card-ids, expedition-objective-deck), independent from Hanabi's streams, reusing shuffle.ts unchanged"
    - "Deck complement (complementOf) as the generic public removed-cards computation, so a future deckFor override changes removedCards with no core edit"
key-files:
  created:
    - packages/rules/src/expedition/state.ts
    - packages/rules/src/expedition/deck.ts
    - packages/rules/src/expedition/deck.test.ts
  modified: []
decisions:
  - "StandardRank is numeric 2..14 (14 = Ace) so rank comparison is plain > with no ace-high special case (documented in state.ts)"
  - "CampState carries no stored phase/outcome/tricks-won fields; those are always derived from completedTricks, so a future holder-swap twist needs no new field"
  - "ASSUMPTION A-HOLDER / A-TRICKCOUNT / A-MULTI recorded as comments in state.ts per RESEARCH.md, owner-reviewable"
metrics:
  duration: "~15 min"
  completed: 2026-09-24
---

# Phase 9 Plan 1: Expedition Core Type Contract and Deck Module Summary

Full Expedition Core type vocabulary (`state.ts`) plus a deck module (`deck.ts`) that builds the 54/52/50-card deck per player count, deals equal deterministic hands, reports removed cards publicly, and builds the separately-shuffled objective deck — proven by 20 passing unit tests.

## What Was Built

**`packages/rules/src/expedition/state.ts`** — types only (26 `export type` declarations), readonly everywhere, no view types (Phase 11's job), no stored PRNG state. Exports `CardIdentity` (standard/joker union), `ExpeditionCard`, `Hand`, `TrickPlay`, `CompletedTrick`, `CurrentTrick`, the `Objective` union (`WinCardObjective` / `OrderedObjective` / `NoTricksObjective` / `ExactlyNObjective`), `ObjectiveSlot`, `ObjectiveStatus`, `CampState`, `CampAction`, `CampError`, `CampOutcome`, `CampPhase`. Documents three labeled assumptions (A-HOLDER, A-TRICKCOUNT, A-MULTI) per `09-RESEARCH.md`.

**`packages/rules/src/expedition/deck.ts`** — `buildFullDeck` (54 identities: 13 ranks x 4 suits + Sun + Moon), `assertPlayerCount`, `removedCardsFor` (3: none, 4: 2♣/2♦, 5: all four 2s), `baseDeckFor`, `complementOf`, `identitiesEqual`, `cardLabel`, `dealHands` (deterministic, round-robin, minted ids via `shuffleWithSeed`/`mintCardId` from `shuffle.ts`, unchanged), `buildObjectiveDeck` (standard identities only, separate shuffle stream). Uses three Expedition-only PRNG stream literals (`expedition-deck`, `expedition-card-ids`, `expedition-objective-deck`), independent of Hanabi's streams.

**`packages/rules/src/expedition/deck.test.ts`** — 20 tests covering every XRULE-01 behavior bullet: deck composition, removed-card sets per player count, base-deck/complement consistency, hand-size correctness, id uniqueness/format, determinism, seed variation, invalid-seat-count and non-divisible-deck throws, and the objective deck's separate shuffle order.

## Task Sequence

1. **Task 1 (auto):** Wrote `state.ts` — types only, verified against every acceptance-criteria grep (export count ≥ 24, no runtime exports, `CampState` field set, three assumption labels present, no `undo` action), `tsc -p packages/rules/tsconfig.json --noEmit` clean. Commit `2e5bcbd`.
2. **Task 2 (auto, tdd):**
   - RED: wrote `deck.test.ts` first; confirmed failure (`Cannot find module './deck'`). Commit `70d94b0`.
   - GREEN: implemented `deck.ts`; all 20 tests pass, `tsc` clean, stream-literal/forbidden-literal/boss-gear-eclipse greps all pass, `shuffle.ts` untouched (`git diff --quiet` exits 0). Commit `4467662`.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx vitest run packages/rules/src/expedition` — 20/20 passed
- `npx vitest run packages/rules/src/expedition packages/rules/src/hanabi` — 201/201 passed (Hanabi untouched)
- `npm run typecheck` (`tsc -b`) — exit 0

## Known Stubs

None.

## Threat Flags

None — this plan's only threat-register entries (T-09-01, T-09-02, T-09-03) were already scoped in the plan's own `<threat_model>` and are addressed by the id-minting and stream-separation design described above; no new surface introduced.

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/state.ts
- FOUND: packages/rules/src/expedition/deck.ts
- FOUND: packages/rules/src/expedition/deck.test.ts
- FOUND commit: 2e5bcbd
- FOUND commit: 70d94b0
- FOUND commit: 4467662
