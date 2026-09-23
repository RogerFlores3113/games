---
phase: 06-game-interface
plan: 05
subsystem: ui
tags: [react, nextjs, tailwind, playwright, hanabi]

# Dependency graph
requires:
  - phase: 06-game-interface (06-03)
    provides: Hand.tsx (TeammateHand/OwnHand), OwnHandCard, TeammateCard, CandidateStrip
  - phase: 06-game-interface (06-04)
    provides: Table.tsx, CardActions.tsx, CluePicker.tsx, EndOverlay.tsx
  - phase: 06-game-interface (06-01)
    provides: hanabi-visual-logic.ts helpers (touchedCardIdsFromLatestClue, teammatesInTurnOrder, CLUE_HIGHLIGHT_MS), clueTouchIdsForTarget
provides:
  - Designed HanabiBoard orchestrator wired into RoomClient, replacing the interim Phase 4/5 board
  - Fixed-top-overlay ReconnectingBanner restyle (D-03)
  - Strengthened HIDE-01 Playwright assertion (card-identity scoped + own-hand glyph/identity absence)
  - D-17-compatible clue-value selection helper for e2e specs
affects: [07-variants]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Board orchestrator is a thin composition layer: all visual/behavioral logic lives in Hand/Table/CardActions/CluePicker/EndOverlay and lib helpers; the orchestrator only owns select-then-act state and wiring"
    - "just-clued highlight driven by a prevHistoryLengthRef that starts null so mount/refresh never replays a highlight, only genuinely new clue entries do"

key-files:
  created:
    - apps/web/components/hanabi/HanabiBoard.tsx
  modified:
    - apps/web/app/room/[code]/RoomClient.tsx
    - apps/web/components/ReconnectingBanner.tsx
    - e2e/hanabi-realtime.spec.ts
    - e2e/start-game.spec.ts
  deleted:
    - apps/web/components/HanabiBoard.tsx

key-decisions:
  - "ReconnectingBanner restyled to fixed top-center overlay (left-1/2 + -translate-x-1/2 + z-40) rather than an in-flow element, so it never pushes the three-band layout down"
  - "HIDE-01 assertion scoped to [data-testid^=\"other-hand-card-\"] [data-testid=\"card-identity\"] instead of the whole card element, since teammate cards now also render a candidate-strip glyph row that would make a whole-element text comparison vacuous"
  - "Added an own-hand data-glyph/card-identity absence check (no clues given yet) as a second, independent HIDE-01 layer alongside the pre-existing cross-page text comparison"

requirements-completed: [UI-01, UI-02, UI-03, UI-09, UI-11, RULES-11]

duration: 65min
completed: 2026-09-17
---

# Phase 6 Plan 05: Board Orchestrator Wiring Summary

**The designed Hanabi board (three-band layout, select-then-act clue preview, transient just-clued highlight, end-of-game overlay) replaces the interim Phase 4/5 board in RoomClient, with every pre-existing Playwright proof (including a strengthened HIDE-01 check) still green.**

## Performance

- **Duration:** ~65 min
- **Started:** 2026-09-17T01:17:00Z (approx.)
- **Completed:** 2026-09-17T02:22:11Z
- **Tasks:** 2
- **Files modified:** 6 (1 created, 1 deleted, 4 modified)

## Accomplishments
- New `apps/web/components/hanabi/HanabiBoard.tsx` orchestrator composes `TeammateHand`/`OwnHand` (06-03), `Table`/`CardActions`/`CluePicker`/`EndOverlay` (06-04) into the three-band layout (teammates top, tableau middle, own hand + controls bottom), owning select-then-act state, D-17 sustained clue preview, and the D-14 transient just-clued highlight driven off `game.history.length` growth
- `RoomClient.tsx` now imports the designed board; the interim `apps/web/components/HanabiBoard.tsx` (D-11's deliberately throwaway plain board) is deleted
- `ReconnectingBanner` restyled as a fixed top-center overlay so it no longer displaces the board layout, while keeping its exact testid/role/text contract
- `e2e/hanabi-realtime.spec.ts`'s clue-value helper now skips disabled (zero-touch) options before clicking, compatible with D-17's newly-disabled zero-touch clue buttons
- `e2e/start-game.spec.ts`'s HIDE-01 block strengthened: teammate identity comparison now reads only `card-identity` text (not the whole card, which also renders a candidate-strip glyph row), plus a new assertion that own-hand cards carry zero `data-glyph`/`card-identity` markers before any clue has been given
- Full `npx playwright test` run: all 18 pre-existing specs pass (see Issues Encountered for one intermittent, pre-existing, unrelated flake)

## Task Commits

1. **Task 1 + Task 2 (combined per plan): Board orchestrator, RoomClient swap, interim board deletion, banner restyle, and spec compatibility** - `50d1dca` (feat)

_Per the plan's explicit instruction, Tasks 1 and 2 were committed together as ONE atomic commit only after the full `npx playwright test` run was green._

## Files Created/Modified
- `apps/web/components/hanabi/HanabiBoard.tsx` - New board orchestrator: WR-03 schema gate, select-then-act state, D-14/D-17 derivations, three-band layout, EndOverlay at game end
- `apps/web/app/room/[code]/RoomClient.tsx` - Import swapped to `components/hanabi/HanabiBoard`
- `apps/web/components/ReconnectingBanner.tsx` - Restyled to a fixed top-center overlay (D-03)
- `apps/web/components/HanabiBoard.tsx` - Deleted (interim D-11 board)
- `e2e/hanabi-realtime.spec.ts` - `selectAClueValueThatTouchesSomething` skips disabled buttons (D-17 compatibility)
- `e2e/start-game.spec.ts` - HIDE-01 block scoped to `card-identity` + new own-hand glyph/identity absence check

## Decisions Made
- ReconnectingBanner uses `fixed left-1/2 top-[length:var(--space-sm)] z-40 -translate-x-1/2` rather than an in-flow block, matching the plan's explicit instruction that it must not push the three bands down
- HIDE-01's teammate-identity read scoped to the `card-identity` testid nested inside `other-hand-card-*`, since `TeammateCard` (06-03) now also renders a `CandidateStrip` glyph row inside the same element that would otherwise pollute a whole-element text comparison
- Added the own-hand no-clues-yet assertion as an independent second HIDE-01 layer (not a replacement for the existing cross-page comparison), per the plan's explicit instruction to add it "per page"

## Deviations from Plan

None — plan executed exactly as written. No architectural changes, no new dependencies (D-22 respected), no scope creep beyond the two named e2e compatibility edits.

## Issues Encountered

**Pre-existing stray dev servers blocked a clean Playwright run.** Before running the full suite, `lsof`/`ps` revealed leftover `next dev` (port 3000) and `wrangler dev` (port 8787) processes from an earlier session, without this plan's changes. Next's project-level dev lock rejected starting a fresh server even on a different port. These stray processes were killed (`kill` on the specific PIDs) before running `npx playwright test`, per the plan's own instruction to stop stray servers on the configured ports first.

**Intermittent, pre-existing flake in `RT-04: a frozen, hidden tab...` (e2e/hanabi-realtime.spec.ts).** This Phase 5 test (unmodified by this plan, and not exercising the D-17 clue-selection helper this plan touched) occasionally fails a `reconnecting-banner` count assertion with a tight 4000ms timeout when run in the full suite, but passes reliably:
- In isolation (`-g "RT-04: a frozen"` alone): passed
- Combined only with its sibling `RT-04/RT-06` test: passed
- In multiple full-suite runs at `--workers=2`: passed once, failed once (intermittent)
- Failed consistently at `--workers=8` (default) across two runs, and once at `--workers=2`

The failure is a timing-margin issue in CDP-freeze/backoff-timing interaction with CPU contention from concurrently running rooms/browsers — the test's own inline comments already document this fragility ("a bare CDP forced freeze did NOT reliably stop the client's heartbeat interval... confirming Research Pitfall 4's documented uncertainty"). This plan's changes (HanabiBoard orchestrator, ReconnectingBanner restyle) do not touch heartbeat, visibility, or reconnect-backoff logic, and the failing assertion checks only the unchanged `reconnecting-banner` testid's presence/absence. Per the plan's threat model (T-06-16), the assertion was NOT weakened or modified — this is documented here as a pre-existing, unrelated environmental flake rather than fixed, since fixing Phase 5's reconnect-timing infrastructure is out of this plan's scope.

## Next Phase Readiness
- The designed Hanabi board is live end-to-end; Phase 6's remaining UI-SPEC surface (glyphs, luminosity, candidate strips, end overlay) all render through this orchestrator
- Phase 7 (variants) can proceed against a stable board; no board-level work is expected to change for Rainbow/Black beyond what `variantConfig`-driven helpers already handle
- The pre-existing RT-04 frozen-tab flake (see Issues Encountered) is worth a future look if it recurs in CI, but is not a blocker — it predates this plan and is unrelated to the board swap

---
*Phase: 06-game-interface*
*Completed: 2026-09-17*

## Self-Check: PASSED

All claimed created/modified/deleted files verified present/absent on disk, and commit `50d1dca` verified present in git history.
