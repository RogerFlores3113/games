---
phase: 07-variant-support-rainbow-black
plan: 02
subsystem: testing
tags: [vitest, hanabi, variant-matrix, react-dom-server, suit-visuals, gradient]

# Dependency graph
requires:
  - phase: 07-01
    provides: canClue's clue_color_not_nameable guard (RULES-14 engine fix) that this plan's variant sweep runs alongside
provides:
  - Engine proof that base, Rainbow and Black each reach all three end conditions (fuses_exhausted, all_stacks_complete, final_round_elapsed) with score/maxScoreFor/scoreBand always agreeing (D-16)
  - Engine proof that no variant has an early "unwinnable" end (D-14)
  - Render-level proof that rainbow's glyphPath/silhouette are unique (UI-07) and that its gradient fill resolves at every call site (teammate tile, played-stack slot, compact discard, discard overlay), with red-card controls proving the gradient channel is rainbow-only
affects: [07-03, 07-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "buildState + field-override HanabiState construction (legality.test.ts's technique) reused for engine end-condition fixtures, no new production test helper added"
    - "renderToStaticMarkup + url(#ID)/<linearGradient id> string-extraction for proving a gradient fill resolves in rendered markup, not just appears in source"

key-files:
  created:
    - apps/web/lib/rainbow-art-render.test.ts
  modified:
    - packages/rules/src/hanabi/variant-matrix.test.ts
    - apps/web/lib/suit-visuals.test.ts

key-decisions:
  - "Task 1's four scenarios (a-d) constructed HanabiState directly via the legality.test.ts buildState+override technique rather than driving a full deal, since the deterministic misplay/completion scenarios need exact card control the existing full-game sweep does not provide"
  - "Task 1's final_round_elapsed scenario copies termination.property.test.ts's discard-then-clue-fallback driver verbatim (legal.find(discard) ?? legal.find(clue) ?? legal[0]), with clueTokens started below the 8-token cap so discard is legal from turn 1"
  - "Task 2's render fixtures render exactly one card per site (rainbow or, in the control, red) so the whole rendered markup IS the card's fragment, sidestepping fragile substring-extraction from Table's flat discard-tile markup"

requirements-completed: []  # UI-07/RULES-02/RULES-03 remain open per phase context: their end-to-end (real-UI) proof lands in 07-04, not here. This plan proves the engine/render layers only. requirements.mark-complete was deliberately NOT run.

# Metrics
duration: 35min
completed: 2026-09-18
---

# Phase 7 Plan 2: Variant end-condition and rainbow-gradient proof (test-only) Summary

**Extended variant-matrix.test.ts to prove every variant reaches every end condition with agreeing score/maxScore/band, and added a new render-contract test proving rainbow's gradient fill resolves at all four UI call sites — zero production files touched.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- D-16: `variant-matrix.test.ts` now proves, per variant (base/rainbow/black), that the engine reaches `fuses_exhausted`, `all_stacks_complete` (via the variant's sixth, box-specific suit as the completing suit for Rainbow/Black), and `final_round_elapsed`, with `checkHanabiGameEnd`'s `score`, `maxScoreFor` and `scoreBand` always agreeing — one branch-free sweep, no `variant === "..."` checks inside the new describe block.
- D-14: same sweep proves no early "unwinnable" end exists — discarding every copy of a suit's rank-1 card (count read from `rankCountsFor`, not a literal, so the same body covers Black's single-copy case too) leaves `checkHanabiGameEnd` returning `null` until a real end condition fires.
- UI-07/D-11: `suit-visuals.test.ts` gained an explicit assertion that rainbow's `glyphPath` and silhouette descriptor differ from every other suit's.
- UI-07/D-11: new `apps/web/lib/rainbow-art-render.test.ts` proves a rainbow face renders a resolvable `url(#id)` -> `<linearGradient id="id">` gradient fill at all four real call sites (`TeammateHand`/`TeammateCard`, `PlayedStack`, `Table`'s compact discard, `DiscardOverlay`), each paired with a red-card control proving the gradient channel is rainbow-only.

## Task Commits

1. **Task 1: Every variant reaches every end condition with agreeing score, maxScore and band (D-16, D-14)** - `60fed62` (test)
2. **Task 2: UI-07 rainbow distinguishability — distinct glyph and gradient at every call-site size (D-11)** - `484f6f9` (test)

## Files Created/Modified

- `packages/rules/src/hanabi/variant-matrix.test.ts` - Added a second `describe` block sweeping all three variants through fuses_exhausted, all_stacks_complete and final_round_elapsed constructed states, plus a D-14 no-early-end check
- `apps/web/lib/suit-visuals.test.ts` - Added a "UI-07:" titled `it` proving rainbow's glyphPath/silhouette are pairwise-distinct from every other suit
- `apps/web/lib/rainbow-art-render.test.ts` (new) - Render-contract test proving the rainbow gradient resolves at every call site, with red-card negative controls

## Decisions Made

- Used the existing `buildState`-style construction (deal via `dealInitialHands`, then override `stacks`/`fuses`/a single hand slot's card) for Task 1's constructed scenarios, matching `legality.test.ts`'s established pattern rather than adding a new production or test helper (per D-13's "no variant-specific criticality code" constraint).
- For the `final_round_elapsed` scenario, started `clueTokens` at 4 (below the 8-token cap) so `discard` is legal from the very first driven turn, avoiding the `discard_at_max_clues` stall the default max-tokens buildState would otherwise hit before any discard could run.
- For Task 2's render fixtures, rendered exactly one card per component call so the entire returned markup functions as "the card's fragment" — this was explicitly sanctioned by the plan's own escape hatch ("If extracting a card's fragment is awkward for Table, render a discard containing only the one card") and applied consistently across all four call sites for symmetry.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' acceptance criteria (string/grep checks, `vitest run` exit codes, no production-file diff) were verified directly and passed on the first implementation.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `packages/rules` (183 tests) and `apps/web` (496 tests) both green; `npx tsc -b apps/web packages/rules packages/schema apps/worker` clean.
- Engine-level end-condition coverage (D-16/D-14) and render-level rainbow distinguishability (UI-07/D-11) are proven; UI-07/RULES-02/RULES-03's *end-to-end* (real UI, real worker) proof is explicitly deferred to 07-04 per the phase's binding constraint — not marked complete in REQUIREMENTS.md here.
- No blockers for 07-03 (the rainbow tile's multi-colour clue popover, D-05..D-08) or 07-04 (e2e parametrization, D-17/D-18).

---
*Phase: 07-variant-support-rainbow-black*
*Completed: 2026-09-18*

## Self-Check: PASSED

All created/modified files confirmed present on disk; both task commits (`60fed62`, `484f6f9`) confirmed present in `git log`.
