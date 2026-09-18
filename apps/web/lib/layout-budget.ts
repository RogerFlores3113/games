/**
 * Phase 06.2 (RESEARCH.md Pitfall 1) — the single named height/width ledger
 * for the 1280x720 no-scroll fit (UI-11), sourced from the UI-SPEC's
 * "Layout — Height Budget" section. Later plans import these constants and
 * helpers instead of writing new pixel literals; 06.2-07 and 06.2-10
 * measure the real, rendered layout against this ledger.
 *
 * Owner review (06.2-14, UAT gap 1): the right-column token area is now a
 * FIXED reservation (`TOKEN_AREA_HEIGHT_PX`/`TOKEN_AREA_WIDTH_PX`), not one
 * derived from the left column's height. Doubling the disc size to 40px
 * (gap 5) ruled out the old pitch-shrinks-to-fit approach — see
 * TOKEN_DISC_PX's own comment for the math.
 *
 * Owner review (06.2-15, UAT gap 1/gap 3): every board region — Play, Deck
 * counter, Discard, Tokens — now reserves a FIXED height and width up front;
 * content fills that reservation rather than the reservation being derived
 * from whatever content happens to be present. This replaces the deleted
 * "token pitch is sized FROM the left column's height" rule. The Play area
 * in particular is no longer a horizontal fan (BOARD-05) — it is a fixed
 * suit-column grid (`playGridHeightPx`/`playColumnWidthPx`), five rank
 * slots per suit, all five always reserved whether filled or not.
 *
 * Owner review (06.2-21, vertical stack restored): the owner's literal
 * layout — Play at the TOP, the deck count between, Discard at the BOTTOM,
 * clue/fuse tokens in a column to the RIGHT — is restored. 06.2-16's
 * side-by-side (Play left / Deck+Discard middle / Tokens right) build was a
 * documented tradeoff the owner rejected once shown it; the owner's fix was
 * "discard can be shrunk by default, clicking it will expand" plus slimming
 * the hand bands so the board gets the height the vertical stack needs.
 * `RANK_SLOT_HEIGHT_PX`/`RANK_SLOT_WIDTH_PX` were shrunk (40x30 -> 24x20) at
 * that point — a real-browser 1280x720 measurement (5 seats, Black variant)
 * showed hand-slimming alone could not fund the ~230px the full-size grid
 * would have needed. `DISCARD_COMPACT_PX` replaced `DISCARD_AREA_PX` — the
 * compact strip was a single clipped row; the existing `DiscardOverlay`
 * (unchanged) is what reads the full pile.
 *
 * Post-06.2-21 follow-up (spend the height gap 16's CluePicker deletion
 * freed): `OWN_BAND_PX` dropping 310 -> 193 left ~117px of real slack at the
 * 1280x720 floor (measured before: 110.5 + 294 + 193 + 6 = 603.5). That
 * slack is spent back on the rank-slot grid FIRST (restored fully to the
 * pre-06.2-21 40x30 — an 80px `TABLE_BAND_MIN_PX` cost: 294 -> 374), with
 * what remains given to the compact Discard strip's reserved row count
 * (`DISCARD_ROWS`, 1 -> 2, a further 26px: 374 -> 400) so a second row of
 * the pile is visible before opening the full overlay. Real-browser
 * re-measurement at the same 1280x720 worst case (5 seats, Black variant)
 * after both changes: 110.5 + 400 + 193 + 6 = 709.5 — ~10.5px of real
 * slack kept rather than tuning back to exactly 720px.
 *
 * That re-measurement also surfaced a real Rule-1 bug in
 * `useDiscardDrag.ts`, unrelated to these pixel values in principle but
 * only exposed by them in practice: `buildTiles()` included the
 * currently-DRAGGED tile's own (pointer-following) rect in its drop-index
 * comparison set, which — because a `dragLocatorTo`-style grab starts
 * exactly at the tile's own center — put the very first comparison on a
 * sub-pixel tie a real browser's floating-point layout resolves
 * inconsistently. It is now excluded, matching `useHandDrag.ts`'s
 * always-static slot-rect model.
 */

/** Playwright's fixed viewport for the UI-11 no-scroll verification task. */
export const VIEWPORT_TEST_HEIGHT_PX = 720;
export const VIEWPORT_TEST_WIDTH_PX = 1280;

/**
 * Page padding and inter-band gaps not attributed to any individual band
 * below — the fixed overhead the three main bands' sum must still fit
 * within, alongside VIEWPORT_TEST_HEIGHT_PX.
 *
 * fix(06.2): corrected 40 -> 16, matching the app's actual `gap-[3px]`/
 * `py-[3px]` main layout (measured: four 3px gaps ≈ 12px, plus a few px of
 * rounding), with a small margin kept rather than the fictional 40px this
 * was previously set to. See OWN_BAND_PX's comment for the full ledger
 * correction this phase's UI-11 fix required.
 *
 * fix(06.2, UAT gaps 13/14): corrected 16 -> 6. Moving Play/Discard above
 * the own hand (see OWN_BAND_PX) cost real height the 1280x720 floor did
 * not have to spare, so `<main>`'s own vertical padding and the board-scale
 * wrapper's inter-band gap were both trimmed to the minimum that still
 * reads as distinct bands — real-browser measurement at the same UI-11
 * worst case (5 seats, Black variant) confirmed the page fits at exactly
 * 720px with this reduced overhead.
 */
export const BOARD_CHROME_PX = 6;

/** UI-SPEC teammate card height (unchanged from 06.1's TeammateCard). */
export const TEAMMATE_CARD_HEIGHT_PX = 78;
/** UI-SPEC own-hand card height (unchanged from 06.1's OwnHandCard). */
export const OWN_CARD_HEIGHT_PX = 100;

/** UI-SPEC always-visible note box row height (NOTE-03), own-hand only. */
export const NOTE_ROW_PX = 20;
/** UI-SPEC bottom-band controls row height (Play/Discard/Give-clue/toggles). */
export const CONTROLS_ROW_PX = 44;
/** UI-SPEC teammate seat-label row height. */
export const SEAT_LABEL_PX = 20;
/** UI-SPEC own-hand turn-indicator row height. */
export const TURN_INDICATOR_PX = 24;
/** UI-SPEC teammate status row height (connected/disconnected indicator). */
export const STATUS_ROW_PX = 20;

/**
 * The board panel's own padding (`--space-sm`), one side — subtracted twice
 * (top+bottom) from `TABLE_BAND_MIN_PX` to get the height every board region
 * actually has available inside the panel (06.2-15, UAT gap 1).
 */
export const BOARD_PANEL_PADDING_PX = 8;

/** A labelled board area's label-row height (e.g. "Play", "Discard"). */
export const AREA_LABEL_PX = 18;
/** A labelled board area's own internal padding, one side. */
export const AREA_PADDING_PX = 4;

/** Reserved rank-slot count per suit column — Hanabi stacks always run 1-5. */
export const MAX_RANK = 5;
/** Reserved suit-column count — the Rainbow/Black variant worst case. */
export const MAX_SUITS = 6;

/**
 * A single rank slot's width/height. Shrunk from 30x40 to 20x24 at 06.2-21
 * (vertical stack restored) when the full-size grid did not fit alongside
 * the vertical Play/Deck/Discard stack; restored back to the full 30x40
 * post-06.2-21 once deleting the clue-menu (gap 16) freed enough OWN_BAND_PX
 * height for the 1280x720 floor to afford it again — real-browser
 * measurement confirmed the fit (see this file's header comment).
 */
export const RANK_SLOT_WIDTH_PX = 30;
/** A single rank slot's height — restored to 40 post-06.2-21 (see above). */
export const RANK_SLOT_HEIGHT_PX = 40;
/** Vertical gap between adjacent rank slots within one suit column. */
export const RANK_SLOT_GAP_PX = 2;
/** Horizontal gap between adjacent suit columns. */
export const SUIT_COLUMN_GAP_PX = 4;

/**
 * `PlayedStack`'s own column-header row (suit glyph) height — a single
 * source of truth shared with `PlayedStack.tsx` so the Play area's reserved
 * height calculation (`playAreaContentHeightPx`) always matches what
 * `PlayedStack` actually renders on top of its rank grid.
 */
export const STACK_HEADER_HEIGHT_PX = 20;

/**
 * A suit column's rank grid height: `MAX_RANK` slots reserved top to bottom
 * whether filled or not, so a column's rendered height never changes as
 * cards are played (UAT gap 1).
 */
export function playGridHeightPx(): number {
  return MAX_RANK * RANK_SLOT_HEIGHT_PX + (MAX_RANK - 1) * RANK_SLOT_GAP_PX;
}

/**
 * The Play area's total reserved width for `suitCount` suit columns
 * side-by-side, plus the area's own left+right padding.
 */
export function playColumnWidthPx(suitCount: number): number {
  return suitCount * RANK_SLOT_WIDTH_PX + (suitCount - 1) * SUIT_COLUMN_GAP_PX + 2 * AREA_PADDING_PX;
}

/**
 * The Play area's total reserved width at the Rainbow/Black worst case (six
 * suit columns) — also the width of the whole left column (Play/Deck/
 * Discard all share this width, stacked, per the owner's literal layout).
 */
export const PLAY_AREA_WIDTH_PX = playColumnWidthPx(MAX_SUITS);

/**
 * The Play area's total reserved height: label row + gap + `PlayedStack`'s
 * own header row + the rank grid + the area's own top+bottom padding. This
 * IS the Play box's rendered height (06.2-21) — the vertical stack no
 * longer lets Play fill the whole column the way the 06.2-16 side-by-side
 * build did, so this function's return value is consumed directly rather
 * than only being an internal fit-check.
 */
export function playAreaContentHeightPx(): number {
  return AREA_LABEL_PX + AREA_PADDING_PX + STACK_HEADER_HEIGHT_PX + playGridHeightPx() + 2 * AREA_PADDING_PX;
}

/** UI-SPEC Play area height (06.2-21) — see `playAreaContentHeightPx`. */
export const PLAY_AREA_HEIGHT_PX = playAreaContentHeightPx();

/** UI-SPEC deck-counter row height (small FireworkCardBack + "48" text, centered). */
export const DECK_COUNTER_PX = 40;
/** Gap between Play/Deck/Discard, stacked vertically (06.2-21). */
export const MIDDLE_GAP_PX = 4;

/** A compact discard tile's rendered width/height (06.2-21) — small enough
 * that the strip reads as "there are discards here", not a full pile. */
export const DISCARD_TILE_WIDTH_PX = 16;
export const DISCARD_TILE_HEIGHT_PX = 22;

/** Vertical gap between wrapped discard-tile rows — reuses --space-xs, same
 * as the strip's own `gap-[length:var(--space-xs)]` (Table.tsx). */
export const DISCARD_ROW_GAP_PX = 4;

/**
 * Reserved discard-strip row count (post-06.2-21 follow-up: spending the
 * height gap 16's CluePicker deletion freed). 1 -> 2 — the strip's tile
 * container already wraps (`flex-wrap`), so a taller reservation surfaces a
 * second row of the pile before `discard-toggle` opens the full
 * `DiscardOverlay`, with no Table.tsx changes needed.
 */
export const DISCARD_ROWS = 2;

/**
 * A compact Discard strip's total reserved height for `rows` rows of
 * `DISCARD_TILE_HEIGHT_PX`-tall tiles: label row + gap + `rows` tile rows
 * (with `DISCARD_ROW_GAP_PX` between them) + the area's own top+bottom
 * padding.
 */
export function discardCompactHeightPx(rows: number): number {
  return (
    AREA_LABEL_PX +
    AREA_PADDING_PX +
    rows * DISCARD_TILE_HEIGHT_PX +
    (rows - 1) * DISCARD_ROW_GAP_PX +
    2 * AREA_PADDING_PX
  );
}

/**
 * UI-SPEC compact Discard strip height (06.2-21, owner review: "discard can
 * be shrunk by default, clicking it will expand"; post-06.2-21 follow-up
 * grew this from one row to `DISCARD_ROWS`). A pile deeper than
 * `DISCARD_ROWS` rows wraps/clips inside this fixed box — `discard-toggle`
 * opens the existing full-size `DiscardOverlay` (unchanged) to read the
 * whole pile.
 */
export const DISCARD_COMPACT_PX = discardCompactHeightPx(DISCARD_ROWS);

/**
 * The left column's total reserved height (06.2-21): Play (top) + gap +
 * Deck counter (middle) + gap + compact Discard (bottom), stacked
 * vertically per the owner's literal description. This is also the inner
 * height every board region shares inside the panel's own top+bottom
 * padding — `TABLE_BAND_MIN_PX` below adds that padding back.
 */
export const BOARD_INNER_PX =
  PLAY_AREA_HEIGHT_PX + MIDDLE_GAP_PX + DECK_COUNTER_PX + MIDDLE_GAP_PX + DISCARD_COMPACT_PX;

/**
 * UI-SPEC "Center (tableau)" row's height (06.2-21): the board panel's own
 * top+bottom padding plus `BOARD_INNER_PX`, the left column's (Play/Deck/
 * Discard) fixed content height — the right column (tokens,
 * `TOKEN_AREA_HEIGHT_PX`, 172px) is shorter and does not drive this number.
 */
export const TABLE_BAND_MIN_PX = BOARD_INNER_PX + 2 * BOARD_PANEL_PADDING_PX;

/**
 * UI-SPEC "Top (teammate hands)" row, this phase (06.2-21, owner review:
 * "hands are just username + hand itself on a small board... shouldn't
 * need nearly as much padding"): `TeammateHand`'s outer border/box-shadow
 * and padding are gone in favor of a slim `.board-surface`-tiled panel —
 * card row (78) + a single compact label+status row + minimal padding,
 * budgeted below the pre-06.2-21 140px measured-117px footprint with margin
 * for the real render.
 */
export const TEAMMATE_BAND_PX = 110;

/**
 * UI-SPEC "Bottom (own hand)" row. Second owner review (UAT gaps 13/14):
 * Play/Discard (`CardActions`) render as their own line ABOVE the own hand
 * rather than beside it, and the own hand is wrapped in a `justify-center`
 * band so it stays horizontally centred at any seat count or window width.
 *
 * UAT gap 16: corrected 310 -> 193. Deleting `CluePicker` (the large
 * clue-target/clue-value menu that used to render as this row's third
 * stacked line) removes that whole line — clue-giving now happens via each
 * opponent tile's own quick-clue popover (`CluePopover`, opened from
 * `TeammateCard`), an absolutely-positioned overlay anchored to the clicked
 * tile that adds zero flow height of its own. `bottom-controls-row` is back
 * down to two stacked lines (CardActions, OwnHand); real-browser measurement
 * at the 1280x720 floor (5 seats, Black variant, the same UI-11 worst case)
 * came in at 193px, down from the CluePicker-era 310px three-line footprint.
 */
export const OWN_BAND_PX = 193;

/** Vertical/horizontal gap between adjacent tokens/slots — reuses --space-xs. */
export const TOKEN_GAP_PX = 4;

/**
 * A clue/fuse token disc's rendered size (UAT gap 5, "larger by 2x"). The
 * measured baseline before owner review: `tokenPitchPx(260, 11)` clamped by
 * the old `TOKEN_DISC_MAX_PX = 22`, which rendered discs at 20px. 2x that
 * measured 20px baseline is 40px.
 */
export const TOKEN_DISC_PX = 40;

/** Reserved clue-token slot count — always rendered, whether or not the
 * token is still available (UAT gap 1, BOARD-02). */
export const MAX_CLUE_TOKENS = 8;
/** Reserved fuse-token slot count (UAT gap 1, BOARD-03). */
export const MAX_FUSE_TOKENS = 3;

/**
 * The clue run is laid out as two columns of four rather than one column of
 * eight so eight 40px discs fit the board's reserved height
 * (`tokenRunHeightPx(8, 2) === 172 <= TABLE_BAND_MIN_PX`). The fuse run
 * stays a single column of three.
 */
export const CLUE_TOKEN_COLUMNS = 2;

/**
 * A token run's total rendered height for `slotCount` fixed slots laid out
 * in `columns` columns: `rows * TOKEN_DISC_PX + (rows - 1) * TOKEN_GAP_PX`,
 * where `rows = Math.ceil(slotCount / columns)`. Returns 0 for an empty run.
 */
export function tokenRunHeightPx(slotCount: number, columns: number): number {
  if (slotCount <= 0) return 0;
  const rows = Math.ceil(slotCount / columns);
  return rows * TOKEN_DISC_PX + (rows - 1) * TOKEN_GAP_PX;
}

/**
 * The token area's fixed reserved height — the larger of the two runs,
 * proven at module load to fit within `TABLE_BAND_MIN_PX` (see
 * layout-budget.test.ts's invariant test).
 */
export const TOKEN_AREA_HEIGHT_PX = Math.max(
  tokenRunHeightPx(MAX_CLUE_TOKENS, CLUE_TOKEN_COLUMNS),
  tokenRunHeightPx(MAX_FUSE_TOKENS, 1),
);

/**
 * The token area's fixed reserved width: the two clue columns, the gap
 * between the clue run and the fuse run (reusing TOKEN_GAP_PX*4, the same
 * inter-run gap `TokenColumn` renders), and the single fuse column.
 */
export const TOKEN_AREA_WIDTH_PX =
  CLUE_TOKEN_COLUMNS * TOKEN_DISC_PX +
  (CLUE_TOKEN_COLUMNS - 1) * TOKEN_GAP_PX +
  TOKEN_GAP_PX * 4 +
  TOKEN_DISC_PX;

