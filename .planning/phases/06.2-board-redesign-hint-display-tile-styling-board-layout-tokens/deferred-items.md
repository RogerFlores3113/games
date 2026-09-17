# Deferred items

## UI-11 5px vertical overflow (pre-existing, not caused by 06.2-06)

`e2e/start-game.spec.ts`'s "UI-11: five players fit a 1280x720 desktop
without scrolling" test fails on the `fitsNoScroll` assertion:
`document.documentElement.scrollHeight` (725px) exceeds `window.innerHeight`
(720px) by 5px at the 1280x720 viewport, with five seated players.

**Confirmed out of scope for plan 06.2-06:** removing every 06.2-06 addition
(the keep-hints toggle, TileColorPicker, and their wrapping controls-row
markup) from `HanabiBoard.tsx` and re-running the same measurement produced
byte-identical numbers (`controlsRow` bottom=722, `scrollHeight`=725,
`innerHeight`=720) — i.e. the overflow already exists with only 06.2-06's
Task 1/2 (NoteBox) changes applied, before any Task 3 markup is added. The
bottom controls row (`OwnHand`/`CardActions`/`CluePicker`/`AudioControls`,
`flex flex-none flex-wrap items-start justify-center`) already wraps to
several lines at 1280px width and its total height (440px measured) pushes
the page 2-5px past the viewport before this plan touches it.

This is very likely inherited from 06.2-04/06.2-05's layout-budget math
(CluePicker's target/color/rank rows plus the fanned played-stack width
computed in `layout-budget.ts`) rather than anything in 06.2-06 — no fix
attempted here per the deviation rules' scope boundary (pre-existing
failures in unrelated code are out of scope for this plan).

**Recommendation for 06.2-07** (board layout plan, BOARD-01..05): when
reworking the tableau/controls-row layout, re-measure this budget and
confirm UI-11 passes as part of that plan's own verification, since it owns
the layout-budget constants this overflow traces back to.
