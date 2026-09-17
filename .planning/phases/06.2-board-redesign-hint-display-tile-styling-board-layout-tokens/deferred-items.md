# Deferred items

## UI-11 vertical overflow — root cause confirmed by 06.2-07: HanabiBoard.tsx's bottom controls row, NOT Table.tsx

**Status: RESOLVED** by a scoped fix task run before 06.2-08 (not a plan — no
PLAN.md/SUMMARY.md, one atomic commit: `fix(06.2): restore the 1280x720
no-scroll fit in the bottom controls row`).

**Root causes found by live-browser measurement at 1280x720, 5 players:**

1. **`NoteBox`'s note input had no explicit width.** Its container div used
   `w-full` with no width constraint of its own, so the `<input>` fell back
   to the browser's intrinsic default text-input width (~200px) instead of
   the 88px `OwnHandCard` beneath it. Every own-hand slot's rendered width
   was therefore ~201px instead of 88px, and the whole `own-band` measured
   862px wide instead of ~410px — wide enough to monopolize its own wrapped
   row and push `CardActions`/`CluePicker`/`AudioControls` onto separate
   lines below it purely by width-driven `flex-wrap` accident, not by any
   real height requirement of those components. Fixed by giving the
   note-row container and the per-card slot wrapper (`Hand.tsx`) an
   explicit `width: CARD_WIDTH` (88px, now exported from `OwnHandCard.tsx`)
   instead of `w-full`.
2. **`CluePicker` stacked four rows where two would do.** "Clue" and "Color
   or rank" each sat on their own label row above their button group, and
   "Give clue" sat on a fifth row by itself — 210px tall before any
   conditional disabled-reason text. Compacted to two rows: each label now
   sits inline at the start of its own button row, and "Give clue" joins
   the value-button row. The value row's gap was tightened from
   `--space-sm` (8px) to `--space-xs` (4px) so the now-wider row (13 items:
   label + 5 colors + 5 ranks + give-clue) still fits under 1248px and can
   sit beside `AudioControls`/the keep-hints toggle/tile-colour picker on
   the same wrapped line instead of forcing a third.

**Measured before -> after (1280x720, 5 players, live browser):**

| Element | Before | After |
|---|---|---|
| `own-band` width | 862px | 410px |
| `CluePicker` height | 210px | 115px |
| Bottom controls row (2 wrapped lines instead of 3) | 440px | 285px |
| `tableau` height (flex-1 absorbs the freed space) | 278px | 306px |
| Page total (`document.documentElement.scrollHeight`) | 847px | **720px** (exactly `window.innerHeight`) |

No feature was removed: Play/Discard/CardActions, the full clue target +
color/rank grid, Give-clue, the always-visible note box, the keep-hints
toggle, the tile-colour picker, and audio controls are all still present,
reachable, and functional — verified by `e2e/start-game.spec.ts`'s UI-11
and 06.2-07 fit-check tests, and by `e2e/hanabi-table-polish.spec.ts`'s
full 9-test suite, all green.

`apps/web/lib/layout-budget.ts`'s `OWN_BAND_PX` (180 -> 300) and
`BOARD_CHROME_PX` (40 -> 16) were corrected to these measured numbers
rather than left as the fictional values that made the arithmetic-only
`layout-budget.test.ts` sum check pass without ever reflecting the real
render — the four bands still sum to ≤720px (140 + 260 + 16 + 300 = 716).

---

### Original diagnosis (06.2-07, kept for history)

**Status (at the time): NOT resolved. Escalated, not fixed, by plan 06.2-07 per that plan's
own explicit escape hatch** ("if the overflow needs a change outside this
plan's files, stop and report rather than silently widen scope").

Original report (06.2-06): `e2e/start-game.spec.ts`'s UI-11 test failed by
5px (`scrollHeight` 725 vs `innerHeight` 720) at 5 players, traced to the
bottom controls row (`OwnHand`/`CardActions`/`CluePicker`/`AudioControls` in
`HanabiBoard.tsx`) wrapping to 440px tall at 1280px width — already 260px
over its own `OWN_BAND_PX` budget (180px) before 06.2-07 touched anything.
The overflow was only 5px at the time because `Table.tsx`'s own rendered
height was far under its `TABLE_BAND_MIN_PX`/`LEFT_COLUMN_PX` budget (260px),
which incidentally absorbed most of the bottom row's 260px overage.

**06.2-07 update:** 06.2-07 rebuilt `Table.tsx` to BOARD-01..05's spec —
labelled Play/Deck/Discard areas, `TokenColumn`, `PlayedStack` — and it now
correctly renders at ~278px (matching its `LEFT_COLUMN_PX` budget of 260px
plus board-surface padding/border, for the first time). Measured live in a
5-player game at 1280x720 immediately after 06.2-07's Task 3:

| Element | Measured | Budget | Delta |
|---|---|---|---|
| `teammates-band` | 117px | 140px (`TEAMMATE_BAND_PX`) | −23px (slack) |
| `tableau` | 278px | 260px (`TABLE_BAND_MIN_PX`) + ~18px chrome | on-budget |
| bottom controls row | 440px | 180px (`OWN_BAND_PX`) | **+260px** |
| **page total** | **847px** | **720px** | **+127px over** |

Because `Table.tsx` no longer has slack to hide the bottom row's overage,
the true size of the pre-existing bug is now fully exposed: **the bottom
controls row is the sole and entire cause of the UI-11 failure.** No part of
`Table.tsx`/`layout-budget.ts`'s Play/Deck/Discard/token-column budget
contributes to the overflow — shrinking those further would violate
BOARD-01..05's own requirements (labelled areas, every stack card visible,
deck counter) without closing anywhere near a 260px gap.

**Confirmed out of scope for 06.2-07:** the fix requires changing
`HanabiBoard.tsx`'s bottom controls row layout and/or `CluePicker.tsx`'s
internal width (the component most likely driving the wrap), neither of
which is in 06.2-07's `files_modified`. 06.2-07 added the mandatory early
1280x720 fit check to `e2e/start-game.spec.ts` per its plan (in scope), but
that check **fails** and is left failing, documented here and in
06.2-07-SUMMARY.md rather than silently widening this plan's scope.

**Recommendation:** 06.2-08 already has `HanabiBoard.tsx` in its
`files_modified` (for the discard-drag wiring) and 06.2-10 already owns
`layout-budget.ts`/both e2e specs for the full worst-case verification —
either is a legitimate place to land the real fix (redesigning the bottom
controls row so it fits `OWN_BAND_PX`, or revising `OWN_BAND_PX` upward and
correspondingly trimming another band with real slack, e.g. `TEAMMATE_BAND_PX`'s
23px). This blocks 06.2-08/09's own five-player verification and should be
treated as a priority fix before those plans' own gates, not deferred to
06.2-10 alone.
