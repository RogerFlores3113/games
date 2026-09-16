---
phase: 03-hanabi-rules-engine
plan: 01
subsystem: rules-engine
tags: [typescript, hanabi, variant-config, deterministic-shuffle, vitest]

requires:
  - phase: 02-per-seat-redaction-contract
    provides: shuffle.ts's seeded PRNG/opaque id minting (seedToRngState, shuffleWithSeed, mintCardId), GameAdapter contract, forehead-card.ts conventions
provides:
  - VariantConfig (Suit/Rank closed sets, per-variant suit lists, clue-touch predicates, rank-count tables)
  - variantConfig(), handSizeFor(), maxScoreFor() in packages/rules/src/hanabi/variant.ts
  - Shared HanabiState/HanabiAction/HanabiCard/HanabiView type vocabulary in packages/rules/src/hanabi/state.ts
  - buildDeck()/dealInitialHands() deterministic dealer in packages/rules/src/hanabi/deck.ts
  - WR-01 (PRNG residual-risk) closed by documentation in deck.ts's header
affects: [03-02, 03-03, 03-04, 03-05]

tech-stack:
  added: []
  patterns:
    - "Single VariantConfig object as the only source of suit/rank truth (D-08/D-09), never a hardcoded literal outside variant.ts"
    - "Mint all card ids up front at deal time rather than carrying idRng in state, so HanabiState never carries PRNG state a projection could leak"
    - "readonly state types vs non-readonly plain-object view types, matching forehead-card.ts's Phase 2 split for future z.infer assignability"

key-files:
  created:
    - packages/rules/src/hanabi/variant.ts
    - packages/rules/src/hanabi/variant.test.ts
    - packages/rules/src/hanabi/state.ts
    - packages/rules/src/hanabi/deck.ts
    - packages/rules/src/hanabi/deck.test.ts
  modified: []

key-decisions:
  - "Black is a normal color-cluable suit (own nameable clue color); Rainbow is touched by every color clue and never itself nameable — encoded in VariantConfig.cluableColors/colorClueTouches (resolves RESEARCH.md Open Question 1)"
  - "Cards are dealt round-robin (one card per seat per round) rather than contiguous blocks, matching how a physical deck is actually dealt"
  - "WR-01 (sfc32 internal-state-recovery risk) accepted as documented residual risk in deck.ts's header rather than swapping the PRNG, per RESEARCH.md Pitfall 5"

patterns-established:
  - "Exhaustive switch in variantConfig() throws on an unreachable variant rather than returning a partial config (T-03-03)"

requirements-completed: [RULES-01, RULES-02, RULES-03, RULES-19, FDN-02]

duration: 5min
completed: 2026-09-15
---

# Phase 3 Plan 1: Variant Config and Deterministic Dealer Summary

**Single-source VariantConfig (base/rainbow/black suit sets, clue-touch predicates) plus a seeded, id-minting Hanabi dealer built on the existing shuffle.ts primitives**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-09-15T17:10:32-07:00
- **Completed:** 2026-09-15T17:15:19-07:00
- **Tasks:** 2 completed
- **Files modified:** 5 (all new)

## Accomplishments
- `VariantConfig` is now the single source of suit count, rank distribution, and clue-touch behavior for all three variants — no hardcoded suit list or deck-size literal exists outside `variant.ts`
- Resolved the Black/Rainbow clue-color open question directly in code (`cluableColors`, `colorClueTouches`) with the Rainbow every-color-touch inference documented beside the predicate
- A deterministic, variant-parametrized dealer (`buildDeck`, `dealInitialHands`) reuses `shuffle.ts` unchanged with new stream names and mints every card id up front, so `HanabiState` will never carry PRNG state
- WR-01 closed by an explicit accepted-residual-risk note in `deck.ts`'s header

## Task Commits

1. **Task 1: VariantConfig and the shared type vocabulary** - `9900a08` (feat)
2. **Task 2: Deterministic variant-parametrized dealer** - `4569d56` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `packages/rules/src/hanabi/variant.ts` - Suit/Rank closed sets, VariantConfig, variantConfig(), handSizeFor(), maxScoreFor()
- `packages/rules/src/hanabi/variant.test.ts` - Unit tests covering all three variants' suit counts, cluableColors, clue-touch predicates, hand size, max score
- `packages/rules/src/hanabi/state.ts` - HanabiCard/HandSlot/ClueFacts/HanabiState/HanabiAction/HanabiView shared type vocabulary
- `packages/rules/src/hanabi/deck.ts` - buildDeck(), dealInitialHands() with opaque minted ids, WR-01 closure note
- `packages/rules/src/hanabi/deck.test.ts` - Deck totals (50/60/55), per-variant rank distributions, hand sizes across seat counts 2-5, id uniqueness/shape, same-seed determinism

## Decisions Made
- Black is a normal color-cluable suit; Rainbow is touched by every color clue and never itself nameable (resolves Open Question 1)
- Round-robin dealing (one card per seat per round) rather than contiguous per-seat blocks
- WR-01 accepted as a documented residual risk rather than re-engineered — see deck.ts header

## Deviations from Plan

None - plan executed exactly as written. One micro-adjustment: reworded two header comments (variant.ts's "imports nothing but types" comment, deck.ts's stream-name mention) to satisfy the plan's own literal-grep acceptance criteria (avoiding the bare word "import" outside a `//`-prefixed line, and avoiding a second literal occurrence of each stream name string) — this is wording only, no logic change, so not tracked as a numbered deviation.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `packages/rules/src/hanabi/{variant,state,deck}.ts` are ready for Plan 02 (clue logic / history) and Plan 03 (actions/legality/endgame) to import against
- Full `npm test` (32 files, 316 tests) stays green, including the untouched forehead-card toy suite (D-02)
- `npx tsc -p packages/rules/tsconfig.json --noEmit` exits 0
- No blockers for Plan 02

---
*Phase: 03-hanabi-rules-engine*
*Completed: 2026-09-15*
