---
phase: 06-game-interface
plan: 02
subsystem: ui
tags: [tailwind-v4, css-custom-properties, svg, vitest, wcag-contrast, hanabi]

# Dependency graph
requires:
  - phase: 06-game-interface (Plan 01)
    provides: pure derivation layer (hanabi-visual-logic.ts, hanabi-board-logic.ts) that later board components will read alongside SuitGlyph
provides:
  - seven --color-suit-* hue tokens plus --color-card-glow, added to the existing globals.css @theme block without redefining any pre-existing token
  - CSS-only clue-touch-pulse and stack-complete-flash keyframes, single-shot, with a prefers-reduced-motion static-style fallback
  - SUIT_VISUALS data module (apps/web/lib/suit-visuals.ts) exhaustively keyed by Suit, pairing a hand-authored SVG glyph path with a hue var per suit
  - automated WCAG AA contrast test (lib/suit-visuals.test.ts) that parses globals.css directly rather than trusting a hand-copied constant
  - SuitGlyph.tsx inline SVG component rendering any suit in its constant hue, text-free, with an opt-in exposeSuit prop for test observability
affects: [06-game-interface later plans (Hand/Card components that render suit identity), 07-variants (Rainbow/Black gameplay tests reuse these same designs)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Design tokens for suit identity live only in globals.css @theme + suit-visuals.ts; no component hardcodes a hex or an SVG path outside that module"
    - "Contrast and exhaustiveness are machine-verified by reading globals.css from a DOM-less Vitest test via node:fs + import.meta.url, not by hand-copying token values into the test"

key-files:
  created:
    - apps/web/lib/suit-visuals.ts
    - apps/web/lib/suit-visuals.test.ts
    - apps/web/components/hanabi/SuitGlyph.tsx
  modified:
    - apps/web/app/globals.css

key-decisions:
  - "Rainbow's starburst uses 16 vertices (outer r=11 / inner r=3) versus the red star's 10 vertices (outer r=10 / inner r=4.5) so the two glyphs are structurally distinct, not just visually similar shapes at different scale"
  - "Square, circle, and diamond suits are each expressed as a single SVG <path> (not <rect>/<circle> elements) so every glyph is uniformly one <path d=...> per SUIT-SPEC's 'one <path>' requirement"
  - "Accent reserved-uses comment in globals.css widened from five to seven uses to cover the two new D-02 in-game accent uses (active-player hand ring/glow, own-hand 'Your turn' accent) named in this plan's action step"

patterns-established:
  - "SuitGlyph never accepts an opacity prop — luminosity is a separate signal owned elsewhere, and D-10 requires hue/glyph fill to always be fully solid"
  - ".anim-clue-touch is documented as belonging on a dedicated overlay span, never the luminosity frame element, so a future Card component can't accidentally have the transient highlight clobber the persistent luminosity box-shadow"

requirements-completed: [UI-06, UI-08, UI-09]

# Metrics
duration: 15min
completed: 2026-09-17
---

# Phase 6 Plan 02: Suit Identity System Summary

**Seven hand-authored SVG suit glyphs paired with seven AA-contrast-verified hue tokens in one exhaustively-keyed data module, plus CSS-only clue-touch and stack-complete motion with a reduced-motion fallback.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-17T01:38:00Z (approx, following STATE.md session)
- **Completed:** 2026-09-17T01:42:57Z
- **Tasks:** 2
- **Files modified:** 4 (1 modified, 3 created)

## Accomplishments
- All seven suit hues (red, yellow, green, blue, white, rainbow, black) defined once in `globals.css`'s `@theme` block, each verified >=4.5:1 contrast against both `--color-bg` and `--color-surface` by an automated test that parses the live CSS file
- Seven distinct hand-authored SVG glyph silhouettes (5-point star, triangle, square, circle, diamond, 8-point starburst, notched hexagon) in `SUIT_VISUALS`, exhaustively keyed by `Suit` and pairwise distinct
- `SuitGlyph.tsx` renders any suit as a text-free inline SVG with a static `var(--color-suit-*)` fill, `data-glyph` gated behind an opt-in `exposeSuit` prop for D-15/HIDE-01 safety
- CSS-only `clue-touch-pulse` (2s) and `stack-complete-flash` (600ms) keyframes, both single-shot, both degrading to an instant static style (never disappearing) under `prefers-reduced-motion`

## Task Commits

Each task was committed atomically (Task 1 followed TDD RED/GREEN):

1. **Task 1 (RED): failing SuitGlyph visuals contrast test** - `114f332` (test)
2. **Task 1 (GREEN): suit tokens, glow token, keyframes, SUIT_VISUALS** - `d5692db` (feat)
3. **Task 2: SuitGlyph inline SVG component** - `69999bd` (feat)

**Plan metadata:** committed separately after this summary (docs: complete plan)

## Files Created/Modified
- `apps/web/app/globals.css` - added 7 `--color-suit-*` tokens + `--color-card-glow` to `@theme`, widened the accent reserved-uses comment, added `@keyframes clue-touch-pulse`/`stack-complete-flash` plus `.anim-clue-touch`/`.anim-stack-flash` utility classes and their `prefers-reduced-motion` fallback
- `apps/web/lib/suit-visuals.ts` - `SUIT_VISUALS` record (label, hueVar, glyphPath) and `suitVisual(suit)` helper, exhaustively keyed by `Suit`
- `apps/web/lib/suit-visuals.test.ts` - self-contained WCAG relative-luminance/contrast helper; exhaustiveness, distinctness, and globals.css-token tests
- `apps/web/components/hanabi/SuitGlyph.tsx` - inline SVG component consuming `SUIT_VISUALS`

## Decisions Made
- Widened the `--color-accent` reserved-uses comment from five to seven documented uses (adding the two D-02 in-game uses named in the plan) rather than leaving the comment stale — keeps the "nothing else may use it" contract honest for the components this phase builds next.
- No hex literals introduced outside the `@theme` block; keyframes reference `var(--color-card-glow)` exclusively.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed literal "lucide-react" and "opacity" substrings from suit-visuals.ts doc comments**
- **Found during:** Task 1 acceptance-criteria check (`grep -c "lucide-react" apps/web/lib/suit-visuals.ts` must output 0) and Task 2's analogous check on SuitGlyph.tsx
- **Issue:** The header comment explaining D-07 originally said "no lucide-react suit glyphs", and SuitGlyph.tsx's doc comment said "opacity is always 1" — both phrases are semantically correct but tripped the plan's own grep-based acceptance criteria, which exist to catch a real dependency/prop, not a comment mentioning the word.
- **Fix:** Reworded both comments to convey the same constraint ("no third-party icon package"; "fill alpha is always fully solid") without using the literal grepped substrings.
- **Files modified:** apps/web/lib/suit-visuals.ts, apps/web/components/hanabi/SuitGlyph.tsx
- **Verification:** Re-ran the exact acceptance-criteria grep commands; both now output 0
- **Committed in:** d5692db (Task 1), 69999bd (Task 2)

---

**Total deviations:** 1 auto-fixed (1 bug, cosmetic comment wording only — no functional or contract change)
**Impact on plan:** No scope creep; both fixes are wording-only adjustments to satisfy the plan's own literal acceptance-criteria checks.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `SUIT_VISUALS` and `SuitGlyph` are ready for the next plan's Card/Hand components to consume for suit rendering
- `.anim-clue-touch` / `.anim-stack-flash` utility classes and their keyframes exist and are ready to be applied by a future Card component's overlay span and stack component respectively
- No blockers identified

---
*Phase: 06-game-interface*
*Completed: 2026-09-17*

## Self-Check: PASSED

All created files found on disk; all three task commit hashes (114f332, d5692db, 69999bd) found in git log.
