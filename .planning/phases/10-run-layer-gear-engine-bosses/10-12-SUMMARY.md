---
phase: 10-run-layer-gear-engine-bosses
plan: 12
subsystem: rules-engine
tags: [expedition, boss-twist, deck, trick-taking, typescript, vitest]

# Dependency graph
requires:
  - phase: 10-run-layer-gear-engine-bosses
    plan: 02
    provides: "boss/boss-def.ts's BossDef type, run/run-rules.ts's RuleModifier/whisperAllowed hook"
  - phase: 10-run-layer-gear-engine-bosses
    plan: 07
    provides: "run/run-actions.ts's applyRunAction, run/run-test-support.ts's setupRun/advanceTo"
provides:
  - "boss/radio-silence.ts: radioSilence BossDef — Monsoon, blocks every Whisper this camp via whisperAllowed only"
  - "boss/eclipse.ts: eclipse BossDef, eclipseRemovedCards, eclipseDeckFor — Eclipse's own per-player-count removed-card table (spec §5.3, distinct from deck.ts's base table), removes Sun/Moon, no isTrump or leaderFor override needed"
affects: [10-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Eclipse's deckFor override needs no isTrump/leaderFor override alongside it: dropping both jokers from the dealt deck already makes the base isTrump predicate find no trump anywhere, so trickWinner's own 'no trump -> highest card of led suit wins' branch is exactly spec §5.3's rule for free, and leader.ts's existing A♠ fallback already covers 'no Sun in play' for any reason"

key-files:
  created:
    - packages/rules/src/expedition/boss/radio-silence.ts
    - packages/rules/src/expedition/boss/eclipse.ts
    - packages/rules/src/expedition/boss/radio-eclipse.test.ts
  modified: []

key-decisions:
  - "eclipse.ts's header and doc comments avoid the literal string \"removedCardsFor\" entirely (not just avoiding the import) so the plan's own grep acceptance gate (`grep -c \"removedCardsFor\" eclipse.ts` == 0) proves the file never references deck.ts's base removal table, not just that it doesn't import it."

requirements-completed: []
# BOSS-01 ("Each boss camp applies one twist from the provisional v1 set")
# is intentionally NOT marked complete: this plan delivers 2 of the 4
# provisional boss twists (Monsoon, Eclipse). The remaining two twists are
# later plans' work; BOSS-01 is only checked off once all four exist.

# Metrics
duration: ~20min
completed: 2026-09-26
---

# Phase 10 Plan 12: Monsoon and Eclipse Boss Twists Summary

**Monsoon blocks every Whisper this camp through the whisperAllowed hook alone; Eclipse strips the Sun and Moon plus its own per-player-count removed-card table (51/17, 52/13, 50/10 for 3/4/5 players per spec §5.3, distinct from deck.ts's base table), with no isTrump or leaderFor override needed since dropping both jokers already makes the base rules resolve every trick to the highest card of the led suit and the A♠ holder to lead.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-09-26
- **Tasks:** 1/1 completed
- **Files created:** 3

## Accomplishments

- `boss/radio-silence.ts`'s `radioSilence` is a single-hook `BossDef` (`whisperAllowed: () => () => false`), proven at a boss camp (every seat's whisper is `whisper_blocked`) and proven inert at a non-boss camp (a whisper with the same catalog succeeds) using the same seed and catalog.
- `boss/eclipse.ts`'s `eclipseRemovedCards`/`eclipseDeckFor` build Eclipse's own removal table straight from `buildFullDeck()` — never composing with or referencing deck.ts's base `removedCardsFor` table (Pitfall 6) — proven at exact sizes 51/52/50, joker-free, and matching spec §5.3's specific removed identities (3p lacks 2♣; 4p has every standard card; 5p lacks 2♣/2♦ but keeps 2♥/2♦'s siblings 2♥ and 2♠).
- Dealt-camp behavior at 3, 4 and 5 seats is proven end to end through real `applyRunAction`/`advanceTo` calls: hand sizes 17/13/10, no dealt card is a joker, `camp.removedCards` includes both jokers (via `createCamp`'s automatic `complementOf(deck)`), `camp.expeditionLeaderSeatId` is the A♠ holder, and that same seat is accepted as the first objective picker.
- A full trick driven with `rules.legalPlays`/`currentActorSeatId` at 3 seats resolves to the highest card of the led suit (asserted by independently recomputing the expected winner from the trick's own plays), and a direct `rulesFor(run).trickWinner` vs. base `trickWinner` sanity check on a joker-free trick agree.
- `npx vitest run --project rules packages/rules/src/expedition/boss` — 1 file, 12 tests passed; full `packages/rules/src/expedition` suite — 26 files, 424 tests passed; `npm run typecheck` exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Monsoon and Eclipse boss twists** - `18ebcbc` (feat)

## Files Created/Modified

- `packages/rules/src/expedition/boss/radio-silence.ts` - Monsoon `BossDef` (whisperAllowed only)
- `packages/rules/src/expedition/boss/eclipse.ts` - Eclipse `BossDef`, `eclipseRemovedCards`, `eclipseDeckFor`
- `packages/rules/src/expedition/boss/radio-eclipse.test.ts` - contract tests for both twists per the plan's behavior list

## Decisions Made

- `eclipse.ts`'s comments deliberately never spell out the literal string `removedCardsFor` (deck.ts's base table's name), so the plan's own grep gate proves the file is fully decoupled from that table in both code and prose, not merely un-imported.
- No `isTrump`/`leaderFor` modifier was added to `eclipse`'s `BossDef.modifiers`: `eclipseDeckFor` already omits both jokers, so the base `isTrump` predicate (Sun/Moon only) naturally finds no trump in an Eclipse deck, and `leader.ts`'s existing "fall back to A♠ for any reason the Sun is absent" logic already covers Eclipse without a boss-specific override — proven by the sanity test comparing `rulesFor(run).trickWinner` to the unmodified base `trickWinner`.

## Deviations from Plan

None - plan executed exactly as written. No bugs, missing critical functionality, or blocking issues were found in the Plan 02/07 code this plan depends on (BossDef, run-actions, run-test-support).

## Self-Check: PASSED

- FOUND: packages/rules/src/expedition/boss/radio-silence.ts
- FOUND: packages/rules/src/expedition/boss/eclipse.ts
- FOUND: packages/rules/src/expedition/boss/radio-eclipse.test.ts
- FOUND: 18ebcbc (git log)

## Verification

- `npx vitest run --project rules packages/rules/src/expedition/boss/radio-eclipse.test.ts` — 12 tests passed
- `npx vitest run --project rules packages/rules/src/expedition/boss` — 1 file, 12 tests passed
- `npx vitest run --project rules packages/rules/src/expedition` — 26 files, 424 tests passed
- `npm run typecheck` — exits 0
- `grep -c 'id: "radio-silence"' packages/rules/src/expedition/boss/radio-silence.ts` — 1
- `grep -c "whisperAllowed" packages/rules/src/expedition/boss/radio-silence.ts` — 2
- `grep -c "export function eclipseRemovedCards\|export function eclipseDeckFor" packages/rules/src/expedition/boss/eclipse.ts` — 2
- `grep -c "removedCardsFor" packages/rules/src/expedition/boss/eclipse.ts` — 0

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- BOSS-01 remains partially delivered (2 of 4 provisional twists: Monsoon, Eclipse). The remaining two boss twists are a later plan's work; a catalogue registry file tying all gear/boss ids into one `Catalog` still does not exist (Plan 10-14's job per this phase's 10-CONTEXT.md).
- Full `packages/rules` test suite passes with these changes in place.

---
*Phase: 10-run-layer-gear-engine-bosses*
*Completed: 2026-09-26*
