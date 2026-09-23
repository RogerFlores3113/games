---
phase: 05-reconnect-session-durability-hardening
plan: 04
subsystem: web
tags: [react, hanabi-board, reconnect-ui, testid]

# Dependency graph
requires:
  - phase: 05-reconnect-session-durability-hardening (05-03)
    provides: "RoomSocketHandle { socket, reclaimSeat }; room-store.ts `reconnecting` status that keeps the last view"
provides:
  - "apps/web/lib/hanabi-board-logic.ts: isSeatConnected/turnIndicatorText pure helpers (D-07/D-08), unit-proven before any component wiring"
  - "apps/web/components/ReconnectingBanner.tsx: the D-05 'Reconnecting…' strip, reused by both HanabiBoard and Lobby"
  - "apps/web/components/HanabiBoard.tsx: per-seat seat-status-{seatId} connection dot+label on every hand, disconnected turn-text suffix, reconnecting-disabled controls with an act() D-06 guard"
  - "apps/web/app/room/[code]/RoomClient.tsx: use-this-tab-button reclaim on the superseded screen (D-11), reconnecting prop threaded to HanabiBoard/Lobby, D-06 guards on the variant-apply effect and send()"
affects: [05-05, 05-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "isSeatConnected defaults an unknown seat to connected — the server view always includes every seat, so a missing lookup is never a real disconnected signal"
    - "ReconnectingBanner and per-seat status are two distinct signals (own-socket vs. named-seat) rendered in two different places, never merged into one code path, per UI-SPEC Component Notes' explicit trap"

key-files:
  created:
    - apps/web/components/ReconnectingBanner.tsx
  modified:
    - apps/web/lib/hanabi-board-logic.ts
    - apps/web/lib/hanabi-board-logic.test.ts
    - apps/web/components/HanabiBoard.tsx
    - apps/web/components/Lobby.tsx
    - apps/web/app/room/[code]/RoomClient.tsx

key-decisions:
  - "act() wrapper inside HanabiBoard is deliberate defense-in-depth (D-06) on top of every control's own `disabled` prop — a click that somehow slips past a disabled control still never reaches onAction while reconnecting is true"
  - "RoomClient's send() also gates on status === \"reconnecting\", making the D-06 guard exist at both the component (HanabiBoard act()) and the dispatch chokepoint (send()) layers, since Lobby's onStartGame/onSetVariant route through send() directly rather than through an act()-style wrapper"
  - "view.youSeatId !== null guard kept on the own-hand seatStatus() call even though RoomView.youSeatId is a non-nullable z.string() in the current schema — matches the plan's locked interface instruction and costs nothing if the field is ever widened"

patterns-established: []

requirements-completed: [RT-04, RT-06, RT-08]

# Metrics
duration: ~3min
completed: 2026-09-16
---

# Phase 5 Plan 4: Reconnect/Disconnect UI States Summary

**Per-seat connection dots plus an explicit "— disconnected" turn suffix on the Hanabi board, a "Reconnecting…" banner that disables every action control while the last view stays on screen, and a "Use this tab" reclaim button on the superseded screen — all built on 05-03's `reconnecting` store status and `reclaimSeat` handle, at Phase 4's plain fidelity.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-09-16T21:41:17Z
- **Completed:** 2026-09-16T21:44:22Z
- **Tasks:** 3
- **Files modified:** 6 (1 created: ReconnectingBanner.tsx; 5 modified: hanabi-board-logic.ts, hanabi-board-logic.test.ts, HanabiBoard.tsx, Lobby.tsx, RoomClient.tsx)

## Accomplishments

- Closed D-07: every rendered hand on `HanabiBoard.tsx` (own hand and each other hand) now shows a `seat-status-{seatId}` connection dot + "Connected"/"Disconnected" label, copied verbatim from `SeatRow`'s existing idiom, reading `view.seats[].connected` — no new server data, purely additive rendering
- Closed D-07/D-09: the turn indicator now reads `turnIndicatorText(game, view.seats, labelFor)`, appending the exact em-dash suffix "Waiting for {name} — disconnected" when the active seat is disconnected, while "Your turn" and the connected "Waiting for {name}" strings are unchanged
- Closed D-08: nothing in the board's action handling skips, auto-acts, or times out an absent player's turn — the new copy is purely a display change; `isPlayDisabled`/`isDiscardDisabled`/`isGiveClueDisabled` are untouched
- Closed D-05: `ReconnectingBanner` renders above the turn indicator (board) and above the room code (lobby) whenever `status === "reconnecting"`, and every action control — Play, Discard, Give clue, own-hand slots, clue-target/value pickers, Start game, and every host variant radio — is disabled while it is visible; the full-screen "Connecting to room…" page never displaces a view that already exists
- Closed D-06: `HanabiBoard`'s `act()` wrapper no-ops `onAction` while reconnecting (defense in depth beyond the disabled controls), and `RoomClient`'s `send()` plus the variant-apply effect both skip sending while `status === "reconnecting"`, so nothing is sent against a stale view
- Closed D-11: the superseded screen keeps its unchanged "This room was opened in another tab." text and adds a primary `use-this-tab-button` that calls `reclaimSeat()` once and disables itself (`reclaiming` state) until `status` leaves `"superseded"`, so it can never double-fire and a tab superseded again later still gets a live button

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure seat-connection and turn-text helpers** — RED `cda5237` (test), GREEN `598a982` (feat), TDD
2. **Task 2: Board per-seat status, disconnected turn text, reconnecting banner and disabled controls** — `e7c1833` (feat)
3. **Task 3: RoomClient wiring — reconnecting prop for board and lobby, Use this tab reclaim** — `e8fcb1a` (feat)

## TDD Gate Compliance

Task 1 was `tdd="true"`. Gate sequence verified in git log: `test(05-04): add failing D-07...` (`cda5237`, RED) precedes `feat(05-04): add isSeatConnected/turnIndicatorText...` (`598a982`, GREEN). No refactor commit was needed — the implementation was minimal on the first pass.

## Files Created/Modified

- `apps/web/lib/hanabi-board-logic.ts` — `isSeatConnected(seats, seatId)` (unknown seat defaults to connected) and `turnIndicatorText(game, seats, labelFor)` (D-07/D-08 copy), each with a `/** D-07/D-08: ... */` doc comment
- `apps/web/lib/hanabi-board-logic.test.ts` — new `describe("D-07: seat connection + turn text")` block, 5 cases covering both helpers including the em-dash suffix
- `apps/web/components/ReconnectingBanner.tsx` (new) — `--color-surface`/`--color-border` strip, `--color-text` Label-role "Reconnecting…" text, an `aria-hidden` `--color-status-disconnected` dot, `role="status"`, `data-testid="reconnecting-banner"`; header comment documents the D-05 own-socket-vs-per-seat trap
- `apps/web/components/HanabiBoard.tsx` — `reconnecting?: boolean` prop; `seatStatus(seatId)` helper rendering the dot+label idiom for both own and other hands; `act()` D-06 guard wrapping every `onAction` call site; `|| reconnecting` added to play/discard/give-clue `disabled` expressions; `disabled={reconnecting}` added to own-hand slot buttons, clue-target buttons, and clue-value buttons
- `apps/web/components/Lobby.tsx` — `reconnecting?: boolean` prop; renders `ReconnectingBanner` at the top of `main`; `|| reconnecting` on Start game's disabled expression; `disabled={reconnecting}` on every variant radio input
- `apps/web/app/room/[code]/RoomClient.tsx` — destructures `reclaimSeat` from `useRoomSocket`; `reclaiming` state reset whenever `status !== "superseded"`; superseded branch gains the `use-this-tab-button`; variant-apply effect and `send()` both early-return while `status === "reconnecting"`; `reconnecting={status === "reconnecting"}` passed to both `Lobby` and `HanabiBoard`

## Decisions Made

- `HanabiBoard`'s `act()` wrapper is deliberate belt-and-suspenders on top of every control's own `disabled` prop, matching the threat register's T-05-16 mitigation, which lists both the disabled controls AND the `act()` guard as independent layers
- `RoomClient`'s `send()` gates on `status === "reconnecting"` in addition to `HanabiBoard`'s `act()`, since `Lobby`'s `onStartGame`/`onSetVariant` route straight through `send()` without an equivalent local wrapper — this keeps the D-06 guarantee uniform across both screens without adding a second guard mechanism to `Lobby` itself
- Kept the `view.youSeatId !== null` guard on the own-hand status call exactly as the plan's locked interfaces specified, even though the current `RoomView` schema has `youSeatId: z.string()` (non-nullable) — harmless now, forward-compatible if that field is ever widened

## Deviations from Plan

None — plan executed exactly as written. All acceptance-criteria greps (`seat-status-`, `turnIndicatorText(game, view.seats, labelFor)`, `Reconnecting…`, `|| reconnecting` ×3, `disabled={reconnecting}` ×4, `data-connected=`, single `turn-indicator`, `reclaimSeat()`, `Use this tab`, `reconnecting={status === "reconnecting"}` ×2, `ReconnectingBanner` + `|| reconnecting` in Lobby) matched on the first pass; `npx tsc -b apps/web`, `npx vitest run --project web` (96/96 passing), and `npm run build --workspace apps/web` all succeeded without modification.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. Browser-level verification of these states (reconnecting banner, per-seat disconnected indicator, superseded reclaim) is deferred to 05-05's Playwright coverage, per this plan's own `<verification>` note.

## Next Phase Readiness

- 05-05 can drive real network drops/backgrounding against these testids (`reconnecting-banner`, `seat-status-{seatId}`, `use-this-tab-button`) in Playwright without any further wiring
- No blockers identified for 05-05/05-06

---
*Phase: 05-reconnect-session-durability-hardening*
*Completed: 2026-09-16*

## Self-Check: PASSED

All 6 files_modified paths exist on disk; all 4 task commit hashes (cda5237, 598a982, e7c1833, e8fcb1a) found in git log.
