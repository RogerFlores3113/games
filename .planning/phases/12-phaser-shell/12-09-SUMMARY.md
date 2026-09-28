---
phase: 12-phaser-shell
plan: 09
subsystem: expedition-phaser-camp-table
tags: [expedition, phaser, camp-scene, bitmaptext, zustand, highlight-then-confirm]

# Dependency graph
requires:
  - phase: 12-phaser-shell (plan 05)
    provides: "buildSceneModel — SceneModel/SeatModel/CardModel/ObjectiveChip/GearChip/MiniCard/TrickPlayModel, the sole read path for scenes"
  - phase: 12-phaser-shell (plan 02)
    provides: "expedition-ids.ts test-bridge id scheme (seatObjectId, gearObjectId, WHISPER_ID, CONFIRM_ID, CANCEL_ID, PREDEAL_SKIP_ID, LAST_TRICK_ID, preDealUseObjectId)"
  - phase: 12-phaser-shell (plan 03)
    provides: "layout.ts (seatAnchors, handFanXs, trickSlots, HUD, STUMP), palette.ts (PALETTE/toPhaserColor)"
  - phase: 12-phaser-shell (plan 08)
    provides: "expedition-scene-store.ts (dispatch/confirmTargeting/updateLocalUi chokepoint), CampScene shell with renderTable extension point, ObjectIndex"
provides:
  - "apps/web/components/expedition/phaser/draw/draw-seats.ts: drawSeats + the shared CampHandlers interface"
  - "apps/web/components/expedition/phaser/draw/draw-hand-trick.ts: drawHand, drawTrick, drawLastTrick"
  - "apps/web/components/expedition/phaser/draw/draw-controls.ts: drawControls (face-up objectives, Whisper, Confirm/Cancel, pre-deal Use/Skip)"
  - "CampScene.renderTable(model) filled in, wired to a full CampHandlers built from the store"
affects: [12-10, 12-13]

tech-stack:
  added: []
  patterns:
    - "Every camp draw module reads only SceneModel fields (never a server-view field or local-ui internals directly); CampScene's handlers are the only code that calls store.dispatch/confirmTargeting/updateLocalUi"
    - "Interactive canvas objects are always a Container (rect/image/bitmapText children) with setSize + setInteractive({useHandCursor}), matching the existing interactables/*.ts convention — never a directly-interactive BitmapText or Image"
    - "ObjectIndex.entries() is read back mid-render (drawControls' boundsFor) to position Confirm/Cancel relative to a sibling object drawn earlier in the same render pass, since the index is rebuilt fresh every renderModel call"

key-files:
  created:
    - apps/web/components/expedition/phaser/draw/draw-seats.ts
    - apps/web/components/expedition/phaser/draw/draw-hand-trick.ts
    - apps/web/components/expedition/phaser/draw/draw-controls.ts
  modified:
    - apps/web/components/expedition/phaser/scenes/CampScene.ts

key-decisions:
  - "CampScene keeps a `previousModel` field (set at the end of every renderModel) and passes it to drawTrick so a newly-appeared trick play can tween in from its player's seat anchor over ~150ms — cross-frame motion despite renderModel destroying and rebuilding every dynamic object each call"
  - "drawControls positions the Confirm/Cancel pair off the source item's live bounds via ObjectIndex.entries().find(...), rather than threading a separate position prop through drawSeats/drawControls, since drawSeats/drawHand already registered the gear box or Whisper token earlier in the same renderTable pass"
  - "Every CampScene handler starts with an explicit `if (state.reconnecting) return` guard, in addition to store.dispatch's own reconnecting no-op, per the plan's defense-in-depth instruction (T-12-20)"
  - "onPreDealUse dispatches use-gear directly with targets: [] only when GEAR_DISPLAY[gearId].targets is empty; any gear with a declared target list goes through beginGearTargeting so Use is never a silent bypass of the D-02 confirm step"
  - "Objective chips owned by a seat are drawn by drawSeats (own-objective targeting); the face-up objective pool during objective-pick is drawn separately by drawControls at the stump centre — these are two different ObjectiveChip populations on SceneModel (seat.objectives vs model.faceUpObjectives), not duplicate rendering of the same list"

patterns-established:
  - "Doc-comment prose that names a grep-matched literal (e.g. `yourLegalCardIds`, `\"whisper\"`) must be reworded to describe the guarantee without repeating the exact substring an acceptance-criteria grep checks for zero occurrences — third phase-12 plan in a row to hit this (12-03/05/07/08 precedent), now also 12-09"

requirements-completed: [SCENE-02, SCENE-03, SCENE-04, SCENE-12]

# Metrics
duration: ~25min
completed: 2026-09-28
---

# Phase 12 Plan 09: Camp Table — Seats, Hand, Trick, and Controls Summary

**The full camp table renders from `SceneModel` alone and every legal click — play a card, pick an objective, gear/Whisper highlight-then-confirm, pre-deal Use/Skip — becomes the correct store request or local-ui transition, closing SCENE-02/03/04.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-27 (file-read/context phase)
- **Completed:** 2026-09-28
- **Tasks:** 3
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- `drawSeats` renders every seat's truncated name, mayAct/targetable turn-glow outline, expedition-leader "L" flag, other-seats' hand-size peek (mini card back + `xN`), a tricks-won pile, the seat's own objectives with status glyphs (`+`/`x`/`-`) and order badges, its gear (dimmed 0.4 when spent, pulsing when the viewer's own usable gear, a hover tooltip showing the server's `reason` verbatim), reveals as tagged mini face-up cards, a `W>{name}` whisper tag, and a disconnected-seat dim + "Zz" icon — every seat is always registered under `seatObjectId`, gear only for the viewer under `gearObjectId`
- `drawHand`/`drawTrick`/`drawLastTrick` fan the viewer's hand with alpha-0.4 dimming, hover-lift, and a targeting outline (strip-width hit areas except the lifted card); place trick plays with a LED pennant and a seat-anchor deal-in tween for newly-appeared plays; register the last-trick pile as `LAST_TRICK_ID` and fan it open on hover with the leader marked and winner highlighted (D-06)
- `drawControls` renders the face-up objective pool at the stump centre during objective-pick, the Whisper token (highlighted while active), the D-02 Confirm/Cancel pair positioned off the live bounds of the gear box or Whisper token being targeted, and the pre-deal Use/Skip row
- `CampScene.renderTable` now calls all four draw modules in z-order and builds a full `CampHandlers` from the store: `onCard`/`onObjective`/`onSeat` route through `nextTargetKind`+`selectTarget` while targeting or through a fixed `play-card`/`pick-objective` dispatch otherwise; `onGear`/`onWhisper` call `beginGearTargeting`/`beginWhisper`; `onConfirm` calls `store.confirmTargeting()` (the only place a Whisper request is ever built); `onPreDealUse` dispatches `use-gear` directly only for zero-target gear, otherwise starts targeting; `onPreDealSkip` dispatches `skip-window`
- `npm run typecheck`, `npx vitest run --project web` (57 files / 764 tests), `npm run build:web`, and `npm run check:expedition-build --workspace apps/web` all green

## Task Commits

1. **Task 1: Draw seats — names, glow, objectives, gear, reveals, trick piles, disconnect** - `b65b389` (feat)
2. **Task 2: Draw the hand fan, the trick with led marker, and the last-trick glance with motion** - `74ed345` (feat)
3. **Task 3: Controls and input wiring — play, pick, highlight-then-confirm, Whisper, pre-deal Use/Skip** - `aebdac9` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/components/expedition/phaser/draw/draw-seats.ts` — `drawSeats`, exports `CampHandlers`
- `apps/web/components/expedition/phaser/draw/draw-hand-trick.ts` — `drawHand`, `drawTrick`, `drawLastTrick`
- `apps/web/components/expedition/phaser/draw/draw-controls.ts` — `drawControls`
- `apps/web/components/expedition/phaser/scenes/CampScene.ts` — `renderTable` filled in; `buildHandlers` constructs the full `CampHandlers` from the store; `previousModel` tracked for trick-deal motion

## Decisions Made

See `key-decisions` in frontmatter: the `previousModel`-based motion diffing, reading `ObjectIndex.entries()` mid-render to position Confirm/Cancel off a sibling object, the explicit `reconnecting` guard on every handler, the zero-target-gear Use-is-the-decision branch, and the seat-owned vs. face-up-pool split for objective rendering.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Doc-comment prose false-positived two of this plan's own acceptance-criteria greps**
- **Found during:** Task 2 and Task 3, running the plan's stated acceptance-criteria grep commands after the first draft
- **Issue:** `draw-hand-trick.ts`'s header doc comment named the literal substrings `` `yourLegalCardIds` ``/`` `legalPlays` `` in prose (matching the `grep -c "yourLegalCardIds\|legalPlays"` criterion, which expects exactly 0), and `CampScene.ts`'s header doc comment quoted `` `"whisper"` `` in prose (matching the `grep -c "\"whisper\""` criterion, which also expects exactly 0) — the same self-referential grep-collision class Plans 12-03/12-05/12-07/12-08 already hit.
- **Fix:** Reworded both passages to describe the same guarantee without repeating the exact matched substring ("the server view's own hand-legality or trick-plays fields directly", "the Whisper's server request itself").
- **Files modified:** `apps/web/components/expedition/phaser/draw/draw-hand-trick.ts`, `apps/web/components/expedition/phaser/scenes/CampScene.ts`
- **Verification:** Re-ran every acceptance-criteria grep from the plan; all now return the expected count. Re-ran `npm run typecheck` (exit 0), the named Vitest suites, `npm run build:web`, and `npm run check:expedition-build` (all green).
- **Committed in:** `74ed345` and `aebdac9` respectively (fixed before committing, not as a follow-up)

---

**Total deviations:** 1 auto-fixed class (comment-only, zero behavior change), applied to 2 files
**Impact on plan:** None — the fix only reworded doc comments; no shipped logic changed.

## Issues Encountered

None beyond the auto-fixed grep trips above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The camp table is now fully playable end to end through the store/dispatch chokepoint: play, pick, gear/Whisper confirm, and pre-deal Use/Skip all reach `parseRunAction` via `onAction`.
- SCENE-02/03/04 are visually and interactively complete for Plan 12-13's e2e coverage to drive against; no behavioural e2e proof was added by this plan (per the plan's own `<verification>` note: "Behavioural coverage lands in Plan 12-13's e2e").
- `CampHandlers` (defined in `draw-seats.ts`) is now the stable contract every future camp draw module builds against; Plan 12-10's `BetweenCampsScene` does not consume it (separate handler shape for the throwaway fireside stub).
- No blockers for 12-10.

---
*Phase: 12-phaser-shell*
*Completed: 2026-09-28*

## Self-Check: PASSED

- FOUND: apps/web/components/expedition/phaser/draw/draw-seats.ts
- FOUND: apps/web/components/expedition/phaser/draw/draw-hand-trick.ts
- FOUND: apps/web/components/expedition/phaser/draw/draw-controls.ts
- FOUND: apps/web/components/expedition/phaser/scenes/CampScene.ts
- FOUND commit: b65b389 (Task 1)
- FOUND commit: 74ed345 (Task 2)
- FOUND commit: aebdac9 (Task 3)
