---
phase: 04-wire-engine-into-room-actor
reviewed: 2026-09-16T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - packages/rules/src/index.ts
  - apps/web/lib/hanabi-board-logic.ts
  - apps/web/lib/hanabi-board-logic.test.ts
  - apps/web/components/HanabiBoard.tsx
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 04-09: Code Review Report

**Reviewed:** 2026-09-16
**Depth:** standard
**Files Reviewed:** 4
**Status:** clean

## Summary

Reviewed the diff since `2acadfe` implementing plan 04-09: the fuse counter
must display fuses *remaining* (`MAX_FUSES - view.fuses`) while the wire
schema and engine keep `fuses` as a used-count. The change touches four
files:

- `packages/rules/src/index.ts`: adds `MAX_FUSES` to the package's public
  barrel export (re-exported from `./hanabi/legality`, where it is already
  defined and used by `isGameOver`/`checkGameEnd`).
- `apps/web/lib/hanabi-board-logic.ts`: adds `fusesRemainingForView(view)`,
  a pure one-line function `MAX_FUSES - view.fuses`, documented to clarify
  it does not change wire/engine semantics.
- `apps/web/lib/hanabi-board-logic.test.ts`: adds four unit tests covering
  0, 1, and 3 fuses used (including one parameterized on the imported
  `MAX_FUSES` constant rather than a hardcoded `3`).
- `apps/web/components/HanabiBoard.tsx`: the fuse-tokens paragraph switches
  from rendering `game.fuses` directly to `fusesRemainingForView(game)`.

Traced the invariant that makes this safe: `packages/rules/src/hanabi/legality.ts`
defines `MAX_FUSES = 3` and `isGameOver` returns true once
`state.fuses >= MAX_FUSES`; `endgame.ts`'s `checkGameEnd` uses the same
`>=` check to end the game on the fuse that brings the count to 3. Turn/action
legality gates (`canPlay`, `canDiscard`, `canClue`) are checked before any
mutation, and the engine has no code path that increments `fuses` past the
point the game is marked over, so `fuses` is bounded to `[0, 3]` in any
state actually reachable through `applyAction`. `packages/schema/src/games/hanabi.ts`
independently enforces `fuses: z.number().int().min(0).max(3)` at the wire
boundary, and `HanabiBoard.tsx` only renders a `game` that passed
`HanabiViewSchema.safeParse`. That means `fusesRemainingForView` can never
observably return a negative number in this codebase's current call paths —
the lack of defensive clamping (e.g., `Math.max(0, MAX_FUSES - view.fuses)`)
is not a live bug, just an assumption that holds only because two other
modules (engine invariant + schema bound) independently enforce it.

Checked for other call sites of the old `{game.fuses} fuses left` (or its
`fuse-tokens` test id) that might have been missed in the swap — none found
outside the four files above. Confirmed no worker-side test or schema test
asserts on the old "fuses used" display text, so this is a display-only
change with no wire/protocol impact, consistent with the plan's stated
scope.

All reviewed files meet quality standards. No issues found.
