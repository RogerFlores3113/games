---
phase: 04-wire-engine-into-room-actor
plan: 06
subsystem: ui
tags: [react, nextjs, hanabi, zustand, tailwind]

requires:
  - phase: 04-wire-engine-into-room-actor
    provides: "HanabiView on the wire, game_action with actionId (plans 04-01..04-04)"
provides:
  - "Pure D-12 disabling predicates and engine-sourced score band (apps/web/lib/hanabi-board-logic.ts)"
  - "The interim, deliberately plain playable Hanabi board (apps/web/components/HanabiBoard.tsx)"
  - "RoomClient's in-progress branch rendering the real board and minting a fresh actionId per action"
affects: ["04-07 (Playwright specs bind to this screen's data-testid hooks)", "04-08 (deletes ForeheadCardGame.tsx)", "phase 6 (replaces this board wholesale)"]

tech-stack:
  added: []
  patterns:
    - "Client-side legality disabling limited to the D-12 four unambiguous cases, delegating to the engine's own variantConfig/scoreBand rather than re-deriving thresholds"
    - "Duck-typed view.game narrowing (isHanabiView) mirroring the toy's isForeheadCardView guard, since RoomView.game is z.unknown() at the room layer"

key-files:
  created:
    - apps/web/lib/hanabi-board-logic.ts
    - apps/web/lib/hanabi-board-logic.test.ts
    - apps/web/components/HanabiBoard.tsx
  modified:
    - apps/web/app/room/[code]/RoomClient.tsx

key-decisions:
  - "clueTouchCountForTarget only counts visible (non-hidden) cards in an other seat's hand, matching what the redacted view actually exposes to the client"
  - "Own-hand slots render position and raw positiveClues/negativeClues only, never possibleSuits/possibleRanks (narrowed candidates are Phase 6's UI-05)"
  - "Suit renders as plain written text with no suit-to-hue mapping this phase, per UI-SPEC"

patterns-established:
  - "hanabi-board-logic.ts is the single place client-side Hanabi legality/band logic lives, always delegating to packages/rules exports rather than reimplementing thresholds"

requirements-completed: [RT-01]

duration: 35min
completed: 2026-09-16
---

# Phase 4 Plan 06: Interim Playable Board Summary

**A plain, playable Hanabi table (HanabiBoard.tsx) renders every wire-visible field with own-hand identity structurally absent, replacing the forehead-card toy in RoomClient's in-progress branch.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-16T03:10:00Z (approx.)
- **Completed:** 2026-09-16T03:46:22Z
- **Tasks:** 3
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- Extracted and tested the four D-12 client-side disabling predicates plus the engine-sourced score band as pure functions, with 19 passing assertions covering rainbow clue-touch behaviour and the "rainbow is not nameable" rule
- Built the interim `HanabiBoard` component: turn indicator, other hands face up, played stacks, discard pile, clue/fuse tokens, deck count, own hand as clue-fact-only slots, play/discard/give-clue controls, and the end-of-game score+band state — with every required `data-testid` hook for plan 04-07's Playwright specs
- Swapped `RoomClient.tsx`'s in-progress branch from `ForeheadCardGame` to `HanabiBoard`, minting a fresh `actionId` per submitted action

## Task Commits

1. **Task 1: Extract the D-12 disabling rules and score band as tested pure functions** - `0196db3` (test)
2. **Task 2: Build the interim board component** - `7ec6874` (feat)
3. **Task 3: Swap the in-progress branch to the board and mint an actionId per intent** - `ff6a761` (feat)

## Files Created/Modified
- `apps/web/lib/hanabi-board-logic.ts` - Pure D-12 disabling predicates (`isPlayDisabled`, `isDiscardDisabled`, `isGiveClueDisabled`), `clueTouchCountForTarget`, `bandForView`, `cluableColorsForView` — all delegating to `packages/rules`' `variantConfig`/`scoreBand`/`maxScoreFor`
- `apps/web/lib/hanabi-board-logic.test.ts` - 19 assertions covering every predicate, including rainbow colour-clue touching and rainbow's exclusion from `cluableColors`
- `apps/web/components/HanabiBoard.tsx` - The interim Hanabi table: duck-typed `HanabiView` guard, per-array-mapped hand rendering (never a hardcoded slot count), own-hand tiles showing only position + raw clue facts, action controls wired to the Task 1 predicates, and the end-of-game branch
- `apps/web/app/room/[code]/RoomClient.tsx` - In-progress branch now renders `HanabiBoard`, minting `nanoid()` as `actionId` per emitted `game_action`

## Decisions Made
- Rendered `cluableColorsForView` and rank clue-value buttons from `RANKS`/`variantConfig(...).cluableColors` directly rather than hardcoding a 5-colour list, so Black's variant automatically gains its extra nameable colour with no board change
- Kept clue-target and clue-value selection as local component state (not lifted into the room store), since the board is explicitly disposable and Phase 6 replaces the whole interaction model

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04-07 can now write Playwright specs against this screen's `data-testid` floor (`turn-indicator`, `own-hand`, `own-hand-slot-{n}`, `other-hand-{seatId}`, `other-hand-card-{cardId}`, `played-stack-{suit}`, `discard-pile`, `clue-tokens`, `fuse-tokens`, `deck-count`, `play-button`, `discard-button`, `clue-target-{seatId}`, `clue-value-{value}`, `give-clue-button`, `game-over-heading`, `final-score`)
- `apps/web/components/ForeheadCardGame.tsx` remains in the tree, untouched, for plan 04-08's deletion sweep
- Full `npm test` (478 tests, 45 files) and `npx tsc -p apps/web/tsconfig.json --noEmit` are both green

---
*Phase: 04-wire-engine-into-room-actor*
*Completed: 2026-09-16*
