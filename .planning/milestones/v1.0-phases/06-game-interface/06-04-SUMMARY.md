---
phase: 06-game-interface
plan: 04
subsystem: ui
tags: [react, tailwind-v4, hanabi, rules-11, end-of-game]

# Dependency graph
requires:
  - phase: 06-game-interface (Plan 01)
    provides: disabledReasonFor, endReasonForView, END_REASON_COPY, deckCountText, newlyCompletedStacks, STACK_FLASH_MS
  - phase: 06-game-interface (Plan 02)
    provides: SuitGlyph.tsx, SUIT_VISUALS, --color-card-glow token, .anim-stack-flash keyframes
provides:
  - Table (tableau: stacks, tokens, deck/final-round, discard pile, stack-complete flash)
  - CardActions (Play/Discard with visible aria-describedby reasons)
  - CluePicker (target + color/rank grid, hover/focus preview, zero-touch disabling)
  - EndOverlay (end-of-game modal: score/max, band, end reason, stacks, New game link)
affects: [06-05, 06-06, 06-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Table.tsx inlines the LUMINOSITY_FRAME 'known' border/box-shadow literals for stack-complete glow (with a comment pointing at luminosity-frame.ts) since that module is owned by 06-03 and Table only needs the completed-stack case, not the full three-step lookup"
    - "CluePicker selection state uses a Tailwind outline-* className (never an inline style prop) because Button.tsx's own inline style (minHeight/minWidth) would otherwise be silently overwritten by a passed-through style prop spread after it"

key-files:
  created:
    - apps/web/components/hanabi/Table.tsx
    - apps/web/components/hanabi/CardActions.tsx
    - apps/web/components/hanabi/CluePicker.tsx
    - apps/web/components/hanabi/EndOverlay.tsx
  modified: []

key-decisions:
  - "Table.tsx renders clue/fuse token pip dots as plain aria-hidden spans outside the clue-tokens/fuse-tokens testid elements, keeping those elements' textContent exactly 'N clue tokens' / 'N fuses left' for the e2e parseInt-style locators"
  - "CluePicker's zero-touch reason checks whether ANY cluable color or rank would touch zero of the selected target's cards, matching D-17's 'dimmed options' framing rather than re-deriving disabledReasonFor's single-clue-value message"
  - "EndOverlay's Link ref is focused via useEffect on mount (D-19 keyboard reachability) rather than autoFocus, since Next's Link forwards ref to the underlying anchor"

patterns-established:
  - "Every new interactive control in this plan disables via the shared disabledReasonFor chokepoint (hanabi-visual-logic.ts) rather than a locally re-derived boolean, so RULES-11's disabled-reason copy has one source of truth across CardActions and CluePicker"

requirements-completed: [UI-01, UI-06, UI-09, UI-10, RULES-11]

# Metrics
duration: ~20min
completed: 2026-09-17
---

# Phase 6 Plan 4: Tableau, Actions, and End Overlay Summary

**Four thin components — Table, CardActions, CluePicker, EndOverlay — rendering the always-visible tableau, visibly-disabled Play/Discard/Give-clue controls with inline reasons, and the designed end-of-game modal, all delegating every derivation to the Plan 01 pure-logic layer.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-17T19:00:00Z (session-local)
- **Completed:** 2026-09-17T19:20:00Z (session-local)
- **Tasks:** 3
- **Files modified:** 4 (all created)

## Accomplishments
- `Table.tsx` renders every UI-01 tableau element (stacks, clue/fuse tokens with pip indicators, deck/final-round text, discard pile) permanently, with a one-shot 600ms stack-complete flash driven by `newlyCompletedStacks`/`STACK_FLASH_MS` and a persistent static glow on completed stacks
- `CardActions.tsx` and `CluePicker.tsx` render Play/Discard/clue controls that are always present, never hidden, with every disabled state carrying a visible `aria-describedby`-linked reason sourced from `disabledReasonFor` — no `title`-only tooltips
- `CluePicker.tsx` wires hover AND focus to the same preview callback (D-17/D-19), disables clue values that would touch zero of the selected target's visible cards, and surfaces a visible "Dimmed options wouldn't touch any of {name}'s cards" caption
- `EndOverlay.tsx` shows score/max/band, the derived end reason (or omits the line when null), every stack with glyph and rank, and a single "New game" link to `/` with focus moved to it on mount

## Task Commits

Each task was committed atomically:

1. **Task 1: Table (tableau)** - `a1f765a` (feat)
2. **Task 2: CardActions and CluePicker** - `453a272` (feat)
3. **Task 3: EndOverlay** - `2f199f8` (feat)

## Files Created/Modified
- `apps/web/components/hanabi/Table.tsx` - Stacks with glyph+rank, clue/fuse token pips, deck/final-round text, flat wrapping discard `<ul>`, one-shot stack-complete flash
- `apps/web/components/hanabi/CardActions.tsx` - Play/Discard buttons with `disabledReasonFor`-sourced inline reasons
- `apps/web/components/hanabi/CluePicker.tsx` - Target select, color/rank grid with hover/focus preview, zero-touch disabling, give-clue button
- `apps/web/components/hanabi/EndOverlay.tsx` - End-of-game modal: heading, score/max/band, end reason, stack glyphs, New game link

## Decisions Made
- Table.tsx's completed-stack glow inlines the same two literal `LUMINOSITY_FRAME.known` border/box-shadow strings that `luminosity-frame.ts` (06-03) defines for card frames, with a comment pointing at that module, rather than importing a card-frame lookup into a stack-head context
- CluePicker's selected-target outline uses a Tailwind `outline-*` className instead of an inline `style` prop, because `Button.tsx` spreads `...rest` (including any passed `style`) after its own `style={{ minHeight, minWidth }}`, which would silently drop the 44px touch-target minimum if a caller passed a conflicting `style` object
- EndOverlay's score line extends the preserved `Final score: {score} — {band}` string to `Final score: {score} / {max} — {band}` per the plan's D-20 requirement; this is additive and does not change `bandForView`'s own contract

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed literal "rematch" substring from EndOverlay.tsx's header comment**
- **Found during:** Task 3 acceptance-criteria check (`grep -ciE "rematch|play again"` must output 0)
- **Issue:** The file's header comment describing D-21 ("no rematch") tripped the plan's own literal grep, which exists to catch an actual rematch action/button, not a comment mentioning the word
- **Fix:** Reworded to "no other action exists" without the literal substring
- **Files modified:** apps/web/components/hanabi/EndOverlay.tsx
- **Verification:** `grep -ciE "rematch|play again" apps/web/components/hanabi/EndOverlay.tsx` now exits 1 (count 0)
- **Committed in:** 2f199f8 (fixed before commit, not a separate commit)

---

**Total deviations:** 1 auto-fixed (cosmetic comment wording only — no functional or contract change)
**Impact on plan:** No scope creep; the fix satisfies the plan's own literal acceptance-criteria grep.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `Table`, `CardActions`, `CluePicker`, and `EndOverlay` are ready for the next plan's orchestrator (`HanabiBoard.tsx`) to wire into the fixed three-band layout alongside Plan 03's `TeammateHand`/`OwnHand`
- All testids the existing Playwright specs assert (`played-stack-{suit}`, `discard-pile`, `clue-tokens`, `fuse-tokens`, `deck-count`, `play-button`, `discard-button`, `clue-target-{seatId}`, `clue-value-{color|rank}`, `give-clue-button`, `game-over-heading`, `final-score`) are preserved verbatim
- No blockers identified

## Self-Check: PASSED

Verified all four created files exist on disk and all three task commit hashes (a1f765a, 453a272, 2f199f8) are present in `git log`.

---
*Phase: 06-game-interface*
*Completed: 2026-09-17*
