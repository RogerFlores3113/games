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
 *
 * Gap closure 07-06 (owner gap 1, 2026-09-18): a seventh suit column added
 * for the 7-suit Black variant (five colours + Rainbow + Black).
 * Width-only cost (+54px: one 50px rank slot plus one 4px
 * SUIT_COLUMN_GAP_PX), heights unchanged; rank slots stay 50x65 - not
 * shrunk, per the owner's standing "board too small" complaint. Owner
 * decision (binding, verbatim): "just widen the board a bit to make space
 * for black in that format."
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
/**
 * Reserved suit-column count — the worst case is now the Black variant's
 * seven suits (five colours + Rainbow + Black, owner gap 2026-09-18,
 * 07-HUMAN-UAT.md gap 1: "Black variant includes Rainbow"). Rainbow alone is
 * six. Widened from 6 -> 7 in gap closure 07-06 (width-only cost, see
 * PLAY_AREA_WIDTH_PX's comment); rank slots stay at their existing 50x65
 * size, never shrunk.
 */
export const MAX_SUITS = 7;

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
 * The Play area's total reserved width at the Black-variant worst case
 * (seven suit columns, gap closure 07-06) — Play is now its own standalone
 * left region (UAT gap 21/22 moved Deck/Discard out of this column), so
 * this is ALSO the Play region's own rendered width, not shared with
 * anything else. Widening costs WIDTH only (328 -> 382, +54px = one 50px
 * rank slot plus one 4px SUIT_COLUMN_GAP_PX): heights are untouched, so the
 * 1280x720 vertical slack (TABLE_BAND_MIN_PX, unchanged) is unaffected.
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

/** Vertical/horizontal gap between wrapped discard-tile rows/columns —
 * reuses --space-xs, same as the pile zone's own
 * `gap-[length:var(--space-xs)]` (Table.tsx). Also the gap between the
 * Discard box's header row (label + buttons) and the pile zone beneath it. */
export const DISCARD_ROW_GAP_PX = 4;

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
 * The tableau's total reserved inner height. Gap closure 07-12 (owner gap 4,
 * swap discard <-> turn sign): Discard is no longer one of the three
 * side-by-side regions this MAX is taken over — it moved to its own row
 * BELOW the token+deck column (see DISCARD_AREA_HEIGHT_PX below), so it no
 * longer competes for this ceiling. The two regions that remain
 * side-by-side with Play are the token+deck column and (as of this gap
 * closure) the turn sign beside it, both far shorter than Play — Play still
 * dominates at 383, unchanged in value from the pre-swap ledger.
 */
export const BOARD_INNER_PX = Math.max(PLAY_AREA_HEIGHT_PX, TOKEN_COLUMN_TOTAL_HEIGHT_PX);

/**
 * UI-SPEC "Center (tableau)" row's height: the board panel's own top+bottom
 * padding plus `BOARD_INNER_PX`.
 */
export const TABLE_BAND_MIN_PX = BOARD_INNER_PX + 2 * BOARD_PANEL_PADDING_PX;

/**
 * Gap closure 07-12 (owner gap 4, 07-HUMAN-UAT.md "## Gaps (round 2)" item
 * 4, verbatim: "can we take the discard area and swap that into the space
 * that says 'X's turn'? should give the discard pile more real estate to
 * breathe and thus a larger tile size."): the compact Discard box and the
 * turn sign swap positions. The turn sign takes over the SMALL top-right
 * spot Discard used to occupy (beside the token column, the same 140-wide
 * reservation the pre-swap ledger gave Discard's compact box) —
 * `TURN_SIGN_WIDTH_PX` is literally that old compact-Discard width, and
 * `TURN_SIGN_HEIGHT_PX` matches the token+deck column's height so
 * the two sit evenly in the same row. Discard takes over the LARGE area
 * below that row — the same leftover space the turn sign used to fill
 * (real-browser measurement pre-swap: 257x223, see 07-12-SUMMARY.md's
 * BEFORE line), now `DISCARD_AREA_WIDTH_PX`/`DISCARD_AREA_HEIGHT_PX`.
 */
export const RIGHT_ROW_GAP_PX = 16; // Table.tsx's gap-[length:var(--space-md)] between the token column and its row sibling (globals.css --space-md).

/** The turn sign's fixed reserved width, in its new small top-right spot —
 * identical to the pre-swap compact Discard box's own width (140). */
export const TURN_SIGN_WIDTH_PX = 140;
/** The turn sign's fixed reserved height — matches the token+deck column
 * beside it so the top row's two cells are the same height. */
export const TURN_SIGN_HEIGHT_PX = TOKEN_COLUMN_TOTAL_HEIGHT_PX;

/** Discard's new fixed reserved width: the full width of the right-hand
 * column (token column + the inter-region gap + the turn sign beside it),
 * so Discard spans edge-to-edge beneath that row. */
export const DISCARD_AREA_WIDTH_PX = TOKEN_AREA_WIDTH_PX + RIGHT_ROW_GAP_PX + TURN_SIGN_WIDTH_PX;
/** Discard's new fixed reserved height: whatever vertical room lies below
 * the token+deck row inside `BOARD_INNER_PX` — the same leftover space the
 * turn sign used to fill pre-swap. */
export const DISCARD_AREA_HEIGHT_PX = BOARD_INNER_PX - TOKEN_COLUMN_TOTAL_HEIGHT_PX - MIDDLE_GAP_PX;

/** A discard tile's rendered width/height, plus how many columns/rows of
 * that size the pile zone reserves. */
export interface DiscardTileSize {
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
}

/**
 * A deeper pile than this still renders (clips inside the fixed Discard
 * box) — `discard-toggle` opens the unchanged `DiscardOverlay` to read the
 * rest. 24 keeps a real early/mid-game pile fully visible without wrapping
 * before this reservation clips it.
 */
export const DISCARD_MIN_VISIBLE_TILES = 24;

/**
 * The largest integer `tileWidth` (with `tileHeight` derived to keep the
 * original 16x22 discard-tile aspect ratio, `round(tileWidth * 22 / 16)`)
 * such that at least `minVisibleTiles` tiles fit inside a
 * `innerWidth` x `innerHeight` box, wrapping tile-sized cells with
 * `DISCARD_ROW_GAP_PX` gaps both horizontally and vertically (mirrors the
 * pile zone's own `flex-wrap` + `gap-[length:var(--space-xs)]` in
 * Table.tsx). `innerWidth`/`innerHeight` are the Discard box's own content
 * box — already reduced for its border/padding and header row by the
 * caller. Pure function of its inputs; no import-time side effects, so
 * `layout-budget.test.ts` can exercise it directly at arbitrary sizes.
 */
export function discardTileSizeFor(innerWidth: number, innerHeight: number, minVisibleTiles: number): DiscardTileSize {
  let best: DiscardTileSize | null = null;
  for (let tileWidth = 1; tileWidth <= innerWidth; tileWidth += 1) {
    const tileHeight = Math.round((tileWidth * 22) / 16);
    if (tileHeight > innerHeight) break;
    const columns = Math.max(1, Math.floor((innerWidth + DISCARD_ROW_GAP_PX) / (tileWidth + DISCARD_ROW_GAP_PX)));
    const rows = Math.max(1, Math.floor((innerHeight + DISCARD_ROW_GAP_PX) / (tileHeight + DISCARD_ROW_GAP_PX)));
    if (columns * rows >= minVisibleTiles) {
      best = { tileWidth, tileHeight, columns, rows };
    }
  }
  return (
    best ?? {
      tileWidth: 1,
      tileHeight: Math.round(22 / 16),
      columns: 1,
      rows: 1,
    }
  );
}

/** Discard box content width available to `discardTileSizeFor` — the box's
 * own reserved width minus its left+right padding. */
const DISCARD_CONTENT_WIDTH_PX = DISCARD_AREA_WIDTH_PX - 2 * AREA_PADDING_PX;
/** Discard box content height available to `discardTileSizeFor` — the box's
 * own reserved height minus its top+bottom padding, the label row, and the
 * gap between the label row and the pile zone beneath it. */
const DISCARD_CONTENT_HEIGHT_PX = DISCARD_AREA_HEIGHT_PX - 2 * AREA_PADDING_PX - AREA_LABEL_PX - DISCARD_ROW_GAP_PX;

const DISCARD_TILE_SIZE = discardTileSizeFor(
  DISCARD_CONTENT_WIDTH_PX,
  DISCARD_CONTENT_HEIGHT_PX,
  DISCARD_MIN_VISIBLE_TILES,
);

/** A discard tile's rendered width/height — derived from the new, much
 * larger Discard area via `discardTileSizeFor` (gap closure 07-12, owner gap
 * 4: "give the discard pile more real estate to breathe and thus a larger
 * tile size"). Real-browser measurement pre-swap (07-12-SUMMARY.md's BEFORE
 * line): 16x22. */
export const DISCARD_TILE_WIDTH_PX = DISCARD_TILE_SIZE.tileWidth;
export const DISCARD_TILE_HEIGHT_PX = DISCARD_TILE_SIZE.tileHeight;

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
 *
 * UAT gap 29 reconciliation (fifth owner review): fixing the stray-line bug
 * in `TeammateCard.tsx` (an inline-block child sitting on its `block`
 * parent's text baseline, leaving an invisible "descender gap" below the
 * card that had been silently padding out this band's height) legitimately
 * changed the real rendered height — the fix makes `card-identity` an
 * `inline-flex` flex item instead, which removes that gap. Re-measured at
 * the same 1280x720 worst case post-fix: 114px. Per this file's own rule,
 * the ledger is corrected to the new (correct) render, not the other way
 * around — 111 -> 114.
 */
export const TEAMMATE_BAND_PX = 114;

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
 * tile that adds zero flow height of its own. `bottom-controls-row` was down
 * to two stacked lines (CardActions, OwnHand) at 193px.
 *
 * Owner request (2026-09-19, "dont need play or discard buttons really"):
 * `CardActions` (the Play/Discard buttons line) is deleted outright — no
 * visible affordance replaces it (dragging a tile onto the Play/Discard
 * zone, or the P/D keyboard fallback on a focused tile, HAND-02). This row
 * is back down to a single line (OwnHand only). Real-browser measurement at
 * the same 1280x720 floor / 5-seat Black-variant UI-11 worst case:
 * 149px, down from 193px — 44px of vertical slack freed and NOT re-spent by
 * this change (see 07-14-SUMMARY.md for the freed-space accounting).
 */
export const OWN_BAND_PX = 149;
