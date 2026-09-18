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
 * Owner review (06.2-21, vertical stack, superseded — see below): Play at
 * the TOP, the deck count between, Discard at the BOTTOM, clue/fuse tokens
 * in a column to the RIGHT — all sharing the left column's fixed width.
 *
 * Third owner review (06.2-22, UAT gaps 19-22, "the slots for the play area
 * should be blank... Hint tokens and Fuses are too large — cut by 33%. Put
 * the 50 cards left in the deck as a '50 x [CARD IMAGE]', and put it below
 * the hints and fuses icon. Then make the discard pile to the right of the
 * hints and fuses. This should give us the real estate we need for a nice
 * large board."): the tableau is now THREE side-by-side regions —
 *   1. Play (left) — no longer sharing its column with Deck/Discard, so its
 *      own reserved height/width can grow to use the space they vacated.
 *   2. A narrow right-hand column: the clue/fuse token runs (now 33%
 *      smaller, `TOKEN_DISC_PX` 40 -> 27) stacked above the Deck counter
 *      (moved out of the Play column, now "{n} x [card back]" under the
 *      tokens).
 *   3. Discard, to the right of the token column.
 * `BOARD_INNER_PX` (the tableau's total reserved inner height) is now the
 * MAX of those three regions' own heights, not their sum — Play dominates
 * (383px) so the reserved height a real-browser render needs is unchanged
 * in practice (`TABLE_BAND_MIN_PX` 400 -> 399, within the existing 06.2-19
 * measurement tolerance), which is what lets the freed vertical room fund a
 * substantially larger `RANK_SLOT_WIDTH_PX`/`RANK_SLOT_HEIGHT_PX` (30x40 ->
 * 50x65) without reopening the 1280x720 floor fit (see the total-fit test
 * in layout-budget.test.ts: 111 + 193 + 399 + 6 = 709, 11px of slack kept).
 */

/** Playwright's fixed viewport for the UI-11 no-scroll verification task. */
export const VIEWPORT_TEST_HEIGHT_PX = 720;
export const VIEWPORT_TEST_WIDTH_PX = 1280;

/**
 * Page padding and inter-band gaps not attributed to any individual band
 * below — the fixed overhead the three main bands' sum must still fit
 * within, alongside VIEWPORT_TEST_HEIGHT_PX.
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
 * A single rank slot's width/height. UAT gap 22 (third owner review):
 * grown 30x40 -> 50x65 — moving the Deck counter and Discard out of the
 * Play column (gaps 21/22) freed the vertical room this column no longer
 * has to share, and the Play area's own width was never part of the tight
 * 1280x720 HEIGHT budget in the first place (only the vertical fit is
 * scroll-checked), so it grows too. See this file's header comment for the
 * full before/after ledger math.
 */
export const RANK_SLOT_WIDTH_PX = 50;
/** A single rank slot's height — see RANK_SLOT_WIDTH_PX's comment. */
export const RANK_SLOT_HEIGHT_PX = 65;
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
 * cards are played (UAT gap 1). UAT gap 19: an unfilled slot renders
 * nothing visible (see PlayedStack.tsx) but still reserves this exact
 * height/width — the grid's total footprint is unchanged by gap 19.
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
 * suit columns) — Play is now its own standalone left region (UAT gap
 * 21/22 moved Deck/Discard out of this column), so this is ALSO the Play
 * region's own rendered width, not shared with anything else.
 */
export const PLAY_AREA_WIDTH_PX = playColumnWidthPx(MAX_SUITS);

/**
 * The Play area's total reserved height: label row + gap + `PlayedStack`'s
 * own header row + the rank grid + the area's own top+bottom padding. This
 * IS the Play box's rendered height — consumed directly by Table.tsx, not
 * merely an internal fit-check.
 */
export function playAreaContentHeightPx(): number {
  return AREA_LABEL_PX + AREA_PADDING_PX + STACK_HEADER_HEIGHT_PX + playGridHeightPx() + 2 * AREA_PADDING_PX;
}

/** UI-SPEC Play area height — see `playAreaContentHeightPx`. */
export const PLAY_AREA_HEIGHT_PX = playAreaContentHeightPx();

/**
 * UI-SPEC deck-counter row height (UAT gap 21: "{n} x [card back]", moved
 * into the right-hand column below the clue/fuse tokens). Shrunk from the
 * pre-gap-21 40px now that it sits in the narrow `TOKEN_AREA_WIDTH_PX`
 * column rather than the wide Play-column width.
 */
export const DECK_COUNTER_PX = 32;
/** A deck-counter card-back image's rendered width/height (UAT gap 21). */
export const DECK_COUNTER_CARD_WIDTH_PX = 20;
export const DECK_COUNTER_CARD_HEIGHT_PX = 28;
/** Gap between the token run and the Deck counter, stacked vertically in
 * the right-hand column (UAT gap 21), and reused for the horizontal gap
 * between the three tableau regions (Play / tokens+deck / Discard). */
export const MIDDLE_GAP_PX = 4;

/** A compact discard tile's rendered width/height. */
export const DISCARD_TILE_WIDTH_PX = 16;
export const DISCARD_TILE_HEIGHT_PX = 22;

/** Vertical gap between wrapped discard-tile rows — reuses --space-xs, same
 * as the strip's own `gap-[length:var(--space-xs)]` (Table.tsx). */
export const DISCARD_ROW_GAP_PX = 4;

/**
 * Reserved discard-strip row count. UAT gap 22 (third owner review): the
 * compact Discard strip moved beside the token column instead of stacking
 * under Play, and grew 2 -> 5 rows so its own reserved height roughly
 * matches the token+deck column beside it (both ~156px) rather than reusing
 * whatever row count the old vertical-stack layout needed.
 */
export const DISCARD_ROWS = 5;

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

/** UI-SPEC compact Discard strip height — see `DISCARD_ROWS`'s comment. A
 * pile deeper than `DISCARD_ROWS` rows wraps/clips inside this fixed box —
 * `discard-toggle` opens the existing full-size `DiscardOverlay` (unchanged)
 * to read the whole pile. */
export const DISCARD_COMPACT_PX = discardCompactHeightPx(DISCARD_ROWS);

/**
 * The compact Discard strip's own reserved width (UAT gap 22). No longer
 * shares `PLAY_AREA_WIDTH_PX` now that it sits beside the token column
 * rather than stacked under Play — a narrower strip suits its new position
 * better, and Play keeps the width Discard used to force it to share.
 */
export const DISCARD_COMPACT_WIDTH_PX = 140;

/** Vertical/horizontal gap between adjacent tokens/slots — reuses --space-xs. */
export const TOKEN_GAP_PX = 4;

/**
 * A clue/fuse token disc's rendered size. UAT gap 20 (third owner review,
 * "Hint tokens and Fuses are too large — cut by 33%"): the prior 2x-owner-
 * reviewed size (40px) cut by roughly a third: `Math.round(40 * (2 / 3))`
 * = 27.
 */
export const TOKEN_DISC_PX = Math.round(40 * (2 / 3));

/** Reserved clue-token slot count — always rendered, whether or not the
 * token is still available (UAT gap 1, BOARD-02). */
export const MAX_CLUE_TOKENS = 8;
/** Reserved fuse-token slot count (UAT gap 1, BOARD-03). */
export const MAX_FUSE_TOKENS = 3;

/**
 * The clue run is laid out as two columns of four rather than one column of
 * eight so the discs fit the narrow right-hand column's reserved width.
 * The fuse run stays a single column of three.
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
 * The token area's fixed reserved height — the larger of the two runs.
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

/**
 * The right-hand column's total reserved height (UAT gap 21): the token
 * runs, a gap, then the Deck counter stacked below them.
 */
export const TOKEN_COLUMN_TOTAL_HEIGHT_PX = TOKEN_AREA_HEIGHT_PX + MIDDLE_GAP_PX + DECK_COUNTER_PX;

/**
 * The tableau's total reserved inner height (UAT gaps 19-22): Play, the
 * token+deck column, and Discard now sit SIDE BY SIDE, so the reserved
 * height is the MAX of the three regions, not their sum — Play dominates.
 * See this file's header comment for the full before/after math.
 */
export const BOARD_INNER_PX = Math.max(PLAY_AREA_HEIGHT_PX, TOKEN_COLUMN_TOTAL_HEIGHT_PX, DISCARD_COMPACT_PX);

/**
 * UI-SPEC "Center (tableau)" row's height: the board panel's own top+bottom
 * padding plus `BOARD_INNER_PX`.
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
 *
 * 06.2-19 reconciliation: real-browser re-measurement of `teammates-band` at
 * the same 1280x720 worst case (5 seats, Black variant, deep discard pile,
 * advanced stacks) came in at 110.5px — 0.5px over the then-current 110,
 * which per this file's own rule ("the ledger holds measured numbers... if
 * the render disagrees with the ledger, the ledger is corrected to the
 * render, never the reverse") means the constant was corrected up to 111 so
 * it never understates the real rendered height.
 */
export const TEAMMATE_BAND_PX = 111;

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
