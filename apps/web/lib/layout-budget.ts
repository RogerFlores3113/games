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
 */
export const BOARD_CHROME_PX = 16;

/**
 * UI-SPEC "Top (teammate hands)" row, this phase: 140px (seat label 20 +
 * card row 78 + status row 20 + gaps/padding). The 28px automatic clue-mark
 * pip band from 06.1 is removed (HINT-04) — there is no MARKS_BAND_PX
 * constant.
 */
export const TEAMMATE_BAND_PX = 140;

/**
 * UI-SPEC "Bottom (own hand)" row, this phase: originally set to 180px
 * (turn indicator 24 + card row 100 + controls row 44 + note-row 20 [now
 * always-visible, same 20px budget as 06.1's click-to-reveal chip],
 * gaps/padding). The 28px automatic clue-mark pip band from 06.1 is removed
 * (HINT-04) — there is no MARKS_BAND_PX constant.
 *
 * fix(06.2): 180 was never the real footprint of this band — it only
 * covered `OwnHand` itself (turn indicator + card row + note row, which
 * really does render at ~154px). It never accounted for `CardActions`,
 * `CluePicker`, `AudioControls`, and the keep-hints/tile-colour toggles,
 * which sit in the same bottom controls row but are separate flex children,
 * not sub-rows of `OwnHand`. Once Table.tsx stopped absorbing that gap
 * (06.2-07), a live 5-player 1280x720 measurement showed the true combined
 * height of the whole row (wrapped across two lines: OwnHand+CardActions on
 * one, CluePicker+AudioControls+toggles on the other) is ~285px, not 180px.
 * Corrected to 300px (285 measured + ~15px margin) — a real number this
 * phase's fixes (NoteBox width bug, CluePicker's compacted 2-row layout)
 * actually hit, not a number chosen to make the arithmetic below look
 * right. TEAMMATE_BAND_PX/TABLE_BAND_MIN_PX/BOARD_CHROME_PX keep their own
 * (now-accurate) values, and the four still sum to ≤720 — see
 * layout-budget.test.ts.
 */
export const OWN_BAND_PX = 300;

/**
 * UI-SPEC "Center (tableau)" row's minimum available height, this phase:
 * ~360px available, of which the left column (Play/Deck/Discard) occupies
 * ~260px and the right column (token line) stretches to match it via
 * `items-stretch`.
 */
export const TABLE_BAND_MIN_PX = 260;

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

/**
 * The inner height every board region (Play/Deck/Discard/Tokens) shares,
 * after the board panel's own top+bottom padding is removed from
 * `TABLE_BAND_MIN_PX`. Every board region below reserves a fixed slice of
 * this height up front rather than deriving its size from content.
 */
export const BOARD_INNER_PX = TABLE_BAND_MIN_PX - 2 * BOARD_PANEL_PADDING_PX;

/** A labelled board area's label-row height (e.g. "Play", "Discard"). */
export const AREA_LABEL_PX = 18;
/** A labelled board area's own internal padding, one side. */
export const AREA_PADDING_PX = 4;

/** Reserved rank-slot count per suit column — Hanabi stacks always run 1-5. */
export const MAX_RANK = 5;
/** Reserved suit-column count — the Rainbow/Black variant worst case. */
export const MAX_SUITS = 6;

/** A single rank slot's width (06.2-15, UAT gap 3 — suits as columns). */
export const RANK_SLOT_WIDTH_PX = 30;
/** A single rank slot's height. */
export const RANK_SLOT_HEIGHT_PX = 40;
/** Vertical gap between adjacent rank slots within one suit column. */
export const RANK_SLOT_GAP_PX = 2;
/** Horizontal gap between adjacent suit columns. */
export const SUIT_COLUMN_GAP_PX = 4;

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
 * suit columns).
 */
export const PLAY_AREA_WIDTH_PX = playColumnWidthPx(MAX_SUITS);

/**
 * The Play area's total reserved content height: label row + gap + the
 * rank grid + the area's own top+bottom padding. Proven at module load
 * (layout-budget.test.ts) to fit within `BOARD_INNER_PX`.
 */
export function playAreaContentHeightPx(): number {
  return AREA_LABEL_PX + AREA_PADDING_PX + playGridHeightPx() + 2 * AREA_PADDING_PX;
}

/**
 * UI-SPEC Play area height (06.2-15, UAT gap 1/gap 3): the Play region now
 * fills its whole reserved column height rather than a smaller
 * content-derived box — the old horizontal fan (BOARD-05) is replaced by a
 * five-row-per-suit column grid (see `playGridHeightPx`/`playColumnWidthPx`
 * and `PlayedStack.tsx`).
 */
export const PLAY_AREA_PX = BOARD_INNER_PX;
/** UI-SPEC deck-counter row height (small FireworkCardBack + "48" text, centered). */
export const DECK_COUNTER_PX = 40;
/** Gap between the Deck counter row and the Discard area below it. */
export const MIDDLE_GAP_PX = 4;
/**
 * UI-SPEC Discard area height: `BOARD_INNER_PX` minus the Deck counter row
 * and the gap between it and Discard. A deep discard pile wraps and clips
 * inside this fixed box rather than growing it — the expanded overlay
 * behind `discard-toggle` is where the full pile is read.
 */
export const DISCARD_AREA_PX = BOARD_INNER_PX - DECK_COUNTER_PX - MIDDLE_GAP_PX;
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

