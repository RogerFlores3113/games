---
phase: 12-phaser-shell
plan: 03
subsystem: ui
tags: [phaser, canvas, pixel-art, localStorage, vitest, expedition]

requires:
  - phase: 12-phaser-shell (plan 04)
    provides: phaser@3.90.0 installed and import-confinement/build guards
provides:
  - "computeZoom/isBelowComfortSize: the whole-number-zoom rule (D-09/D-10/D-11)"
  - "layout.ts: pure stage-pixel geometry (seat ellipse, hand fan, trick slots, HUD/interactable anchors)"
  - "palette.ts: the single canvas hex palette, mirrored from globals.css where meaning is shared"
  - "font/font-keys.ts: phaser-free bitmap-font key + cell-size constants (D-12)"
  - "card-pack-ids.ts + expedition-card-pack-pref.ts: SCENE-08's per-browser card-pack preference"
affects: [12-05, 12-06, 12-07, 12-08]

tech-stack:
  added: []
  patterns:
    - "Phaser-free pure geometry/palette modules under components/expedition/phaser/**, unit-tested with Vitest, imported (never re-derived) by later Phaser scenes"
    - "CSS-token mirroring: palette.ts documents and test-binds shared-meaning canvas colours to globals.css's @theme values"

key-files:
  created:
    - apps/web/lib/expedition/compute-zoom.ts
    - apps/web/lib/expedition/compute-zoom.test.ts
    - apps/web/components/expedition/phaser/layout.ts
    - apps/web/components/expedition/phaser/layout.test.ts
    - apps/web/components/expedition/phaser/palette.ts
    - apps/web/components/expedition/phaser/palette.test.ts
    - apps/web/components/expedition/phaser/font/font-keys.ts
    - apps/web/lib/expedition/card-pack-ids.ts
    - apps/web/lib/expedition/expedition-card-pack-pref.ts
    - apps/web/lib/expedition/expedition-card-pack-pref.test.ts
  modified: []

key-decisions:
  - "Seat ellipse (cx=320,cy=170,rx=240,ry=140) placed larger than STUMP so seatAnchors always keeps the viewer's y strictly greater than every upper-arc seat and >=96px pairwise separation for 3-5 seats"
  - "handFanXs step formula min(CARD_W+2, floor((HAND_MAX_W-CARD_W)/(count-1))) centred on x=320, verified against the 17-card fan and the single-card case"
  - "Card-art hex choices (cardFace/cardBack/cardEdge, sun/moon/done) are this plan's own picks for D-13 placeholder tier, recorded here since UI-SPEC left them to Claude's discretion: cardFace #E8DEC5 (parchment), cardBack #1B4332 (deep green, distinct from jungle #0F2318), cardEdge #2A1F14, sun #E8792E (warm orange, deliberately not the accent gold), moon #C9CDD6 (pale silver), done #4CAF6D (green)"
  - "suitBigIndex: spades #1A1A1A, hearts #D93B3B, diamonds #3B6EA5, clubs #3F8F5C — four pairwise-distinct hues; suitClassic reuses spades/hearts as black/red"

patterns-established:
  - "One phaser-free geometry/palette module per concern (compute-zoom, layout, palette, font-keys, card-pack-ids/pref), each independently Vitest-loadable with zero phaser import"

requirements-completed: [SCENE-08, SCENE-10]

duration: ~20min
completed: 2026-09-27
---

# Phase 12 Plan 03: Stage Geometry, Canvas Palette & Card-Pack Preference Summary

**Whole-number zoom (2x/3x/4x at 1280x720/1080p/1440p, clamped to 1x below), a 640x360 pure-geometry layout module, a canvas palette mirrored byte-for-byte from globals.css, and a per-browser card-pack preference defaulting to Big Index — all phaser-free, unit-tested pure modules.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-27T18:57Z
- **Completed:** 2026-09-27T19:00Z
- **Tasks:** 3
- **Files modified:** 10 (all created, none pre-existing)

## Accomplishments
- `computeZoom`/`isBelowComfortSize` implement D-09/D-10/D-11's whole-number scaling rule, proven integer-and->=1 across 200 sampled viewport sizes
- `layout.ts` gives every later scene its stage-pixel geometry (seat placement, hand fan, trick slots, HUD/interactable anchor points) as pure, testable functions with zero `phaser` import
- `palette.ts` is now the single source of every canvas hex value, with `palette.test.ts` reading `globals.css` directly at test time so a future token rename fails the test instead of silently drifting
- SCENE-08's card-pack preference (`card-pack-ids.ts` + `expedition-card-pack-pref.ts`) round-trips per browser, defaults to Big Index, and degrades safely on tampered/missing/SSR/throwing storage

## Task Commits

Each task was committed atomically:

1. **Task 1: Whole-number zoom and the 640x360 stage layout (D-09, D-10, D-11)** - `f691063` (feat)
2. **Task 2: Canvas palette mirrored from globals.css (UI-SPEC Color)** - `d1e0e63` (feat)
3. **Task 3: Card-pack ids and the per-browser preference (SCENE-08)** - `1da6a6c` (feat)

_No TDD-style separate red/green commits were used — each task's implementation and its test file were written together and verified green before committing, consistent with how this phase's prior plans (12-01, 12-02) committed._

## Files Created/Modified
- `apps/web/lib/expedition/compute-zoom.ts` - whole-number zoom + comfort-size threshold (D-09/D-10/D-11)
- `apps/web/lib/expedition/compute-zoom.test.ts` - integer/clamp/sample-size proofs
- `apps/web/components/expedition/phaser/layout.ts` - stage-pixel geometry: seat anchors, hand fan, trick slots, HUD/interactable anchors
- `apps/web/components/expedition/phaser/layout.test.ts` - bounds/spacing/ordering/integer proofs for every exported function
- `apps/web/components/expedition/phaser/palette.ts` - canvas hex palette, CSS-mirrored + world-only tokens
- `apps/web/components/expedition/phaser/palette.test.ts` - reads globals.css, asserts mirror equality/distinctness/no-accent-leak
- `apps/web/components/expedition/phaser/font/font-keys.ts` - `WORLD_LABEL_FONT`/`WORLD_SIGN_FONT` + cell sizes (D-12)
- `apps/web/lib/expedition/card-pack-ids.ts` - `CARD_PACK_IDS`/`CardPackId`/`DEFAULT_CARD_PACK_ID`/labels/guard
- `apps/web/lib/expedition/expedition-card-pack-pref.ts` - per-browser card-pack preference via `safe-storage.ts`
- `apps/web/lib/expedition/expedition-card-pack-pref.test.ts` - SSR/empty/round-trip/tamper/throwing-storage proofs

## Decisions Made
- Seat ellipse sized deliberately larger than `STUMP` (rx=240/ry=140 vs stump's 176/64) so the viewer's seat (bottom of the ellipse) always has strictly greater y than every upper-arc seat, and 3-5 seat pairwise distances clear the 96px minimum by comfortable margins (verified numerically before writing the test).
- `handFanXs`'s step formula matches the plan's contract exactly: `min(CARD_W+2, floor((HAND_MAX_W-CARD_W)/(count-1)))`, centred on x=320; the 17-card case lands step=25 (within the 12-30px band) and the 1-card case centres at x=306 exactly as specified.
- Every card-art and boss-effect hex value not pinned by UI-SPEC (cardFace/cardBack/cardEdge, the four suitBigIndex hues, sun/moon/done) was chosen by this plan per the task's explicit instruction to "record them in the SUMMARY" — see key-decisions above for the full list and the distinctness reasoning.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment text tripped the plan's own acceptance-criteria grep**
- **Found during:** Task 1 (compute-zoom.ts) and Task 2 (palette.ts)
- **Issue:** A doc comment in `compute-zoom.ts` contained the literal substring `Math.max(1` (making the acceptance grep count 2, not 1), and a doc comment in `palette.ts` contained the literal hex `#F5B942` (making the accent-absence grep count 1, not 0). Both were prose referencing the code, not the code itself.
- **Fix:** Reworded both comments to describe the same fact without repeating the exact matched substring.
- **Files modified:** `apps/web/lib/expedition/compute-zoom.ts`, `apps/web/components/expedition/phaser/palette.ts`
- **Verification:** Re-ran both acceptance-criteria greps; both now return the exact required count.
- **Committed in:** `f691063`, `d1e0e63` (part of each task's own commit — the comments were fixed before the task was committed, not as a follow-up)

**2. [Rule 3 - Blocking] Removed a `@ts-expect-error` that `tsc -b` flagged as unused**
- **Found during:** Task 3 (`expedition-card-pack-pref.test.ts`), while running `npm run typecheck` per the plan's `<verification>` block
- **Issue:** `TS2578: Unused '@ts-expect-error' directive` on a line where `globalThis.window.localStorage.getItem = () => {...}` already type-checked without a suppression (the fake `Storage` object's `getItem` property is already writable/assignable).
- **Fix:** Deleted the unnecessary directive.
- **Files modified:** `apps/web/lib/expedition/expedition-card-pack-pref.test.ts`
- **Verification:** `npm run typecheck` exits 0; `npx vitest run --project web expedition-card-pack-pref` still green (8/8).
- **Committed in:** `1da6a6c` (part of Task 3's commit)

---

**Total deviations:** 2 auto-fixed (1 bug-in-comment x2 occurrences, 1 blocking typecheck fix)
**Impact on plan:** Both fixes were made before each task's commit; no scope creep, no behavior change to shipped code.

## Issues Encountered
None beyond the two auto-fixed items above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `computeZoom`/`layout.ts`/`palette.ts`/`font-keys.ts` are ready for Plan 12-06+ to consume when building the actual Phaser scenes and card-pack/interactable registries — none of them import `phaser`, so they were verifiable with plain Vitest.
- SCENE-08 (card-pack preference) is fully closed by this plan; SCENE-10 (crisp pixel scaling) has its zoom math proven here but final owner sign-off (D-14) still depends on the real Phaser mount from later plans.
- No blockers for 12-05/12-06/12-07.

---
*Phase: 12-phaser-shell*
*Completed: 2026-09-27*

## Self-Check: PASSED

All 10 created files verified present on disk; all 3 task commit hashes (`f691063`, `d1e0e63`, `1da6a6c`) verified present in `git log`.
