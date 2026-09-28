---
phase: 12-phaser-shell
plan: 11
subsystem: expedition-web-chrome
tags: [expedition, settings-modal, card-pack, host-controls]
dependency-graph:
  requires: [12-08]
  provides: [expedition-settings-modal, expedition-corner-gear-button]
  affects: [apps/web/components/expedition/ExpeditionBoard.tsx]
tech-stack:
  added: []
  patterns: ["Ported HanabiBoard.tsx/SettingsModal.tsx shell verbatim for a second game's settings surface"]
key-files:
  created:
    - apps/web/components/expedition/ExpeditionSettingsModal.tsx
    - apps/web/lib/expedition-settings-modal-render.test.ts
  modified:
    - apps/web/components/expedition/ExpeditionBoard.tsx
decisions:
  - "Restart control gated on isHost && canRestart (both), not either alone, mirroring the plan's interface contract"
  - "Mute state is local-only (useState in ExpeditionBoard), matching D-07's no-op slot; no persistence added since D-07 explicitly defers real audio to Phase 14"
metrics:
  duration: ~20min
  completed: 2026-09-27
---

# Phase 12 Plan 11: Expedition Settings Modal & Corner Gear Button Summary

Ported Hanabi's `SettingsModal.tsx` shell into an Expedition-scoped `ExpeditionSettingsModal` holding the card-pack picker, a no-op mute toggle, host-only delete/restart, and a plain Leave link — then wired a 44px corner gear button into `ExpeditionBoard.tsx` to open it, closing Phase 11 review WR-05 (no exit controls).

## What Was Built

### Task 1: ExpeditionSettingsModal
Created `apps/web/components/expedition/ExpeditionSettingsModal.tsx`, porting `SettingsModal.tsx`'s outer shell verbatim: fixed backdrop, centred `role="dialog"` panel with `aria-modal="true"`, an accessible "Settings" title, Escape-to-close effect, backdrop-click-closes/panel-stops-propagation, and the two-step delete confirmation with the exact copy "This ends the game for everyone and cannot be undone." Hanabi-only concepts (`keepHints`, `TileColorPicker`, volume slider) were dropped entirely and replaced with:
- A `radiogroup` fieldset labelled "Card pack" with one radio per `CARD_PACK_IDS` entry (Big Index, Classic), the current pack checked, calling `onCardPackChange(id)`.
- A `<button aria-pressed>` "Mute" toggle calling `onToggleMute` (D-07: no audio exists yet; the slot exists for Phase 14).
- A host-only "Restart" button, shown only when both `isHost` and `canRestart` are true.
- A host-only "Delete room" two-step control, identical to Hanabi's.
- A "Leave table" `<a href="/">` with helper text "Your seat stays yours - reopen the room link to come back."

A render-contract test (`apps/web/lib/expedition-settings-modal-render.test.ts`, 11 tests) mirrors `settings-modal-render.test.ts`'s `renderToStaticMarkup` + source-scan pattern.

### Task 2: Wire the gear button and modal into ExpeditionBoard
`ExpeditionBoard.tsx` now:
- Computes `isHost` the same way `HanabiBoard.tsx` does (`view.youSeatId !== null && view.youSeatId === view.hostSeatId`).
- Renders a fixed-position, top-right 44px gear button (`aria-label="Settings"`, `data-testid="expedition-settings-button"`, lucide `Settings` icon) at an 8px (`--space-sm`) inset.
- Holds `settingsOpen`, local `muted` (no-op per D-07), and `cardPackId` (initialised from `readCardPackPref()`) state.
- On card-pack change: writes the pref via `writeCardPackPref`, updates local state, and calls `store.getState().setCardPack(id)` — local-only, never sent to the server (SCENE-08, T-12-26).
- Derives `canRestart` as `isHost && game !== null && game.runStatus !== "in_progress"`.
- Passes `onDeleteRoom`/`onRestartLobby` straight through from `BoardProps` — the worker re-checks host and ended-state on every request regardless (T-12-25).
- Keeps the dynamic Phaser mount, `ReconnectingBanner`, and the `BoardProps` signature unchanged.

## Deviations from Plan

None — plan executed exactly as written. One test-authoring correction was made during RED/GREEN: the initial test asserted `value="big-index"[^>]*checked` (value-before-checked attribute order), but React's `renderToStaticMarkup` emits `checked` before `value` for a controlled radio input. The test regex was widened to match either attribute order — this is a test-authoring fix, not a component change (the component's behavior already matched the plan's `<behavior>` spec).

## Verification

- `npx vitest run --project web expedition-settings-modal-render settings-modal-render` — 23 tests passed
- `npx vitest run --project web expedition-settings-modal-render game-agnostic-source` — 15 tests passed
- `npm run typecheck` exits 0
- Full `npx vitest run --project web` — 58 files, 775 tests passed
- All acceptance-criteria greps (delete-copy count, Hanabi-concept absence, `href="/"` count, `aria-label="Settings"` count, `writeCardPackPref(`, `setCardPack(`, `ssr: false`) confirmed by direct `grep -c`

## Self-Check: PASSED

- FOUND: apps/web/components/expedition/ExpeditionSettingsModal.tsx
- FOUND: apps/web/lib/expedition-settings-modal-render.test.ts
- FOUND: apps/web/components/expedition/ExpeditionBoard.tsx (modified)
- FOUND commit 912ac43 (Task 1)
- FOUND commit 378c11b (Task 2)
