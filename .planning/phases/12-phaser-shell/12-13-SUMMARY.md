---
phase: 12-phaser-shell
plan: 13
subsystem: expedition-e2e
tags: [expedition, phaser, playwright, e2e, whisper, gear, last-trick, reconnect, card-pack]

requires:
  - phase: 12-phaser-shell
    provides: CampScene, BetweenCampsScene, test bridge, e2e helpers, landing enablement (Plans 12-01..12-12)
provides:
  - e2e/expedition-camp.spec.ts (full-camp, reconnect, card-pack, interactables proof)
  - Fix for own gear/objectives being unclickable behind the hand (CampScene draw order)
  - Fix for the last-trick glance getting stuck open (CampScene per-frame self-heal)
  - Fix for gear test-bridge id collisions across seats sharing a gear type (draw-seats.ts)
affects: []

tech-stack:
  added: []
  patterns:
    - "clickUntilChanged(page, objectId, isSatisfied, opts) retries a move+down+up click, re-querying the object's position each attempt, until a caller-supplied predicate over the FRESH model is true — not just 'the model changed', since an unrelated redraw can satisfy a looser check even when the click itself missed"
    - "clickHandCard nudges the click position right by a fraction of the object's width, compensating for a custom Phaser hit-area rectangle that is never origin-adjusted for a setOrigin(0.5, 0) image"
    - "CampScene.update() self-heals hover-dependent local UI state (the last-trick glance) by checking the pointer against the object's CURRENT registered bounds every frame, rather than trusting Phaser's own pointerover/pointerout transition bookkeeping across a destroy-and-redraw"

key-files:
  created:
    - e2e/expedition-camp.spec.ts
  modified:
    - apps/web/components/expedition/phaser/scenes/CampScene.ts
    - apps/web/components/expedition/phaser/draw/draw-seats.ts

key-decisions:
  - "CampScene.renderTable draws the hand FIRST (not after seats), so the viewer's own seat — positioned at the bottom of the table, right where the hand fans out — renders its gear/objective row on top of the hand instead of underneath it"
  - "draw-seats.ts's drawGear only registers a gear chip's test-bridge id when it is the viewer's own (interactive) chip, since gear:<id> keys purely on gearId and a teammate holding the same item would otherwise overwrite the viewer's own clickable instance in the shared ObjectIndex"
  - "CampScene gained an update() method that closes the D-06 last-trick glance by checking the pointer against the pile's live bounds every frame, since opening it via hover destroys and recreates the very pile object being hovered, permanently breaking Phaser's own pointerout tracking for a real player's mouse-away gesture"

patterns-established:
  - "e2e/expedition-camp.spec.ts's clickUntilChanged/clickHandCard helpers are available for reuse by Phase 13's fireside/run-end e2e specs, which will drive the same kind of Phaser-scene, redraw-on-every-model-change interactions"

requirements-completed: [SCENE-02, SCENE-03, SCENE-04, SCENE-08, SCENE-09, SCENE-11, SCENE-12]

duration: ~3h
completed: 2026-09-28
---

# Phase 12 Plan 13: Full-Camp, Reconnect, Card-Pack and Interactables E2E Summary

Wrote `e2e/expedition-camp.spec.ts`, the phase's end-to-end proof: a full 3-player camp driven only through `window.__expeditionTest` with real mouse input (draft, loadout, legal plays, a gear use, a Whisper, the last-trick glance), plus refresh-and-resume at a draft/loadout/open-window, per-browser card-pack persistence, and proof the four interactables never touch game state — uncovering and fixing three real Phaser interaction bugs along the way (own gear/objectives unclickable behind the hand, the last-trick glance never closing, and a gear-id collision across seats).

## Performance

- **Duration:** ~3h (most of it root-causing three genuine Phaser interaction bugs the driver's real mouse input exposed)
- **Started:** 2026-09-28 (session start, after reading plan/context/prior summaries)
- **Completed:** 2026-09-28
- **Tasks:** 2 completed
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- `e2e/expedition-camp.spec.ts` (4 tests, all green, run repeatedly with no observed flakiness):
  - "a full 3-player camp through the test bridge (criterion 5)" — drives draft/loadout/ready, legal plays, one gear use (highlight-then-confirm), one Whisper (asserting the reveal lands only on the target's page, not the third teammate's — T-12-30), and the last-trick glance (hover opens with all 3 plays, moving away closes it), with a bounded retry across up to 3 camp attempts to guarantee both a gear use and a Whisper occur, and a running assertion that dimmed hand cards only ever appear on "Your turn"/"Between tricks".
  - "refresh mid-draft, mid-loadout and in an open window resumes the same seat (SCENE-11)" — reloads at three distinct points and asserts identical draft offer, loadout equip state, and (mid-camp) `youSeatId`/hand/sign label.
  - "card pack is per browser and persists (SCENE-08)" — switches the host to Classic via the settings modal, asserts the guest is unaffected, and that it survives a reload.
  - "interactables never send game actions (SCENE-09)" — clicks all four interactables twice each and asserts zero `game_action` websocket frames and a byte-identical model snapshot.
- Along the way, found and fixed three real product bugs (not test-only workarounds) via Rule 1:
  1. The viewer's own gear and objective chips were rendered UNDERNEATH their own hand (both fall in the same vertical band at the viewer's seat position), silently swallowing every click meant for gear/objectives — `CampScene.renderTable` now draws the hand before seats.
  2. The D-06 last-trick glance could get stuck open forever: opening it via hover destroys and redraws the whole scene (including the hovered pile itself), which permanently breaks Phaser's own pointerout bookkeeping for that object — `CampScene` gained a per-frame self-heal that closes it based on the pointer's live position vs. the pile's current bounds.
  3. `gear:<id>` test-bridge ids collided when two seats happened to hold the same gear type, since the id encodes only `gearId`; `drawGear` now registers the id only for the viewer's own (interactive) chip.

## Task Commits

1. **Task 1 + Task 2 bug fixes: own gear/objective visibility, last-trick self-heal, gear-id collision** - `bf0957b` (fix, Rule 1)
2. **Task 1 + Task 2: full-camp, reconnect, card-pack and interactables e2e** - `b2ce159` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update)

## Files Created/Modified

- `e2e/expedition-camp.spec.ts` — the full spec: `reachCamp`/`stepCamp`/`runWhisper`/`runGear`/`maybeCheckLastTrick`/`assertDimmingInvariant` drivers, `clickUntilChanged`/`clickHandCard` retrying click helpers, and the 4 tests
- `apps/web/components/expedition/phaser/scenes/CampScene.ts` — `renderTable` draws hand before seats; new `update()` self-heals the last-trick glance's close behavior
- `apps/web/components/expedition/phaser/draw/draw-seats.ts` — `drawGear` registers its test-bridge id only when interactive (the viewer's own chip)

## Decisions Made

- Built a single generic `clickUntilChanged<T>(page, objectId, isSatisfied, opts)` retry helper (used everywhere in the driver except a few `reachCamp`/interactables spots that keep the shared `clickObject` verbatim, satisfying the plan's own `clickObject(` usage floor) rather than several bespoke per-action click functions, since every in-camp click follows the same shape: click, then wait for a specific expected model condition, retrying the click itself if a redraw raced it.
- Chose to fix the three discovered Phaser bugs in production code (Rule 1) rather than working around them purely in the test driver, since all three are genuine player-facing defects (own gear/objectives were never clickable at the table in any camp; the last-trick glance could get permanently stuck open for a real player, not just under Playwright).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The viewer's own gear and objective chips were rendered underneath their own hand, making them permanently unclickable**
- **Found during:** Task 1, first real-mouse gear-use attempts in the full-camp driver consistently failed to open gear targeting
- **Issue:** `layout.ts` positions the viewer's own seat (ring 0) at `y=310`, and the gear/objective rows sit `anchor.y + 18..30` below that (`y≈328..340`) — squarely inside the hand's own vertical span (`HAND_Y=316` to `356`). `CampScene.renderTable` drew `drawHand` LAST (topmost), so every hand card silently absorbed clicks meant for the viewer's own gear/objective chips underneath it.
- **Fix:** Reordered `renderTable` to draw the hand FIRST, so the viewer's own seat (and its gear/objective chips) renders on top of the hand. `drawControls` (which draws the Confirm/Cancel pair) stays last, remaining topmost above both.
- **Files modified:** `apps/web/components/expedition/phaser/scenes/CampScene.ts`
- **Verification:** the full-camp e2e's gear-use step (targeting `chatter`/`broadcast`/`ghost`/`peek`, whichever was drafted) now opens and confirms reliably across repeated runs
- **Committed in:** `bf0957b`

**2. [Rule 1 - Bug] The D-06 last-trick glance could get stuck open, never closing when the pointer moved away**
- **Found during:** Task 1, the last-trick hover-and-leave assertion
- **Issue:** `onLastTrickHover(true)` (fired by hover) triggers a store update that `renderModel` answers by destroying and recreating the ENTIRE dynamic layer, including the very pile container the pointer is currently over. Phaser's own "currently hovered" bookkeeping (used to decide whether a later move-away should fire `pointerout`) is left pointing at the now-destroyed instance; entering the fresh instance re-fires `pointerover` correctly on any subsequent hover, but leaving it never fires `pointerout` since Phaser has nothing valid left to "leave". This affects real players, not just Playwright: moving the mouse away after opening the glance would never close it in the live game either.
- **Fix:** Added a `CampScene.update()` method that, whenever the glance is open, checks the pointer's live coordinates against the pile's CURRENT registered bounds every frame (via the existing `ObjectIndex`, not Phaser's event-transition state) and closes it the moment the pointer is no longer over it.
- **Files modified:** `apps/web/components/expedition/phaser/scenes/CampScene.ts`
- **Verification:** the last-trick close assertion now passes deterministically across many repeated runs (previously failed even with a 5-attempt hover-retry workaround, confirming the fix — not a timing band-aid — was needed)
- **Committed in:** `bf0957b`

**3. [Rule 1 - Bug] Gear test-bridge ids collided when two seats held the same gear item**
- **Found during:** Task 1, intermittent gear-use failures where "gear:<id>" resolved to a different (non-interactive, teammate) chip than the viewer's own
- **Issue:** `gearObjectId(gearId)` keys purely on the gear's catalog id, with no seat qualifier. `drawGear` registered EVERY seat's chip for a given gear type under that same id in the shared `ObjectIndex`, so if a teammate also held the identical gear item, whichever seat was drawn last (a `Map.set` overwrite) won the registration — sometimes hiding the viewer's own clickable chip entirely. This is purely a test-bridge ambiguity: real players are unaffected since Phaser's native hit-testing dispatches to the correct physical container regardless of the ObjectIndex.
- **Fix:** `drawGear` now registers the test-bridge id only when the chip is interactive (i.e., the viewer's own), which is always unique per seat set since only one seat is ever "isYou".
- **Files modified:** `apps/web/components/expedition/phaser/draw/draw-seats.ts`
- **Verification:** repeated full-camp runs no longer hit a spurious "gear:<id> resolved to the wrong seat's chip" failure
- **Committed in:** `bf0957b`

---

**Total deviations:** 3 auto-fixed (all Rule 1 — real Phaser interaction bugs the e2e's real mouse input surfaced)
**Impact on plan:** All three fixes are narrowly scoped, player-facing correctness fixes with no scope creep; none change the test-bridge id scheme, the wire protocol, or any server-authoritative logic.

## Issues Encountered

- The bulk of this plan's time went into root-causing why real Playwright mouse clicks on hand cards, gear chips, and the last-trick pile intermittently (and in two cases, deterministically) missed their targets. The root causes turned out to be three distinct, genuine bugs (documented above) rather than test flakiness — resolving them at the source (rather than adding ever-more-elaborate test-side retries) was the correct fix and is reflected in the final driver, which needed only ONE generic retry helper (`clickUntilChanged`) plus the hand-card position nudge (a genuine, still-present Phaser quirk: custom hit-area rectangles are never origin-adjusted, unrelated to the three bugs above) to run reliably.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 12's success criterion 5 (a full camp driven end to end through the test bridge, including a gear use, a Whisper, and refresh-and-resume) is now automatically proven; the phase's remaining plan (12-14) can proceed.
- `e2e/expedition-camp.spec.ts`'s `clickUntilChanged`/`clickHandCard` retry helpers are reusable by Phase 13's fireside/run-end e2e work, which will face the same "scene redraws everything on every model change" interaction pattern.
- No blockers.

---
*Phase: 12-phaser-shell*
*Completed: 2026-09-28*
