# Deferred items

## UI-11 vertical overflow — root cause confirmed by 06.2-07: HanabiBoard.tsx's bottom controls row, NOT Table.tsx

**Status: NOT resolved. Escalated, not fixed, by plan 06.2-07 per that plan's
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
