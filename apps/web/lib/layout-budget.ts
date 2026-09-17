/**
 * Phase 06.2 (RESEARCH.md Pitfall 1) — the single named height/width ledger
 * for the 1280x720 no-scroll fit (UI-11), sourced from the UI-SPEC's
 * "Layout — Height Budget" section. Later plans import these constants and
 * helpers instead of writing new pixel literals; 06.2-07 and 06.2-10
 * measure the real, rendered layout against this ledger.
 *
 * Load-bearing rule: the right-column token pitch is sized FROM the left
 * column's height (`tokenPitchPx`), never the other way round — the left
 * column (Play/Deck/Discard) is never grown to make room for a comfortable
 * token pitch. See RESEARCH.md's flagged risk ("11 tokens at a comfortable
 * 20px pitch costs ~220px if laid out independently").
 */

/** Playwright's fixed viewport for the UI-11 no-scroll verification task. */
export const VIEWPORT_TEST_HEIGHT_PX = 720;
export const VIEWPORT_TEST_WIDTH_PX = 1280;

/**
 * Page padding and inter-band gaps not attributed to any individual band
 * below — the fixed overhead the three main bands' sum must still fit
 * within, alongside VIEWPORT_TEST_HEIGHT_PX.
 */
export const BOARD_CHROME_PX = 40;

/**
 * UI-SPEC "Top (teammate hands)" row, this phase: 140px (seat label 20 +
 * card row 78 + status row 20 + gaps/padding). The 28px MarksZone pip band
 * from 06.1 is removed (HINT-04) — there is no MARKS_BAND_PX constant.
 */
export const TEAMMATE_BAND_PX = 140;

/**
 * UI-SPEC "Bottom (own hand)" row, this phase: 180px (turn indicator 24 +
 * card row 100 + controls row 44 + note-row 20 [now always-visible, same
 * 20px budget as 06.1's click-to-reveal chip], gaps/padding). The 28px
 * MarksZone pip band from 06.1 is removed (HINT-04) — there is no
 * MARKS_BAND_PX constant.
 */
export const OWN_BAND_PX = 180;

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

/** UI-SPEC Play area height (label 14 + fanned stacks 64 + outline padding). */
export const PLAY_AREA_PX = 100;
/** UI-SPEC deck-counter row height (small FireworkCardBack + "48" text, centered). */
export const DECK_COUNTER_PX = 48;
/** UI-SPEC Discard area height (label 14 + reorderable tile row 64-88 + outline padding). */
export const DISCARD_AREA_PX = 112;
/** Left column's total height — the sum of Play + Deck counter + Discard. */
export const LEFT_COLUMN_PX = PLAY_AREA_PX + DECK_COUNTER_PX + DISCARD_AREA_PX;

/** Clue tokens (8 max) + fuse tokens (3 max) = the worst-case token count (BOARD-02/03). */
export const MAX_TOKEN_COUNT = 11;
/** Vertical gap between adjacent tokens in the right column — reuses --space-xs. */
export const TOKEN_GAP_PX = 4;

/** Fanned-stack single card width (BOARD-05). */
export const PLAYED_CARD_WIDTH_PX = 48;
/** Fanned-stack row height — the existing single-card height, unchanged by fanning. */
export const PLAYED_CARD_HEIGHT_PX = 64;
/** Horizontal peek per additional fanned card, beyond the first (BOARD-05). */
export const FAN_PEEK_PX = 16;

/**
 * The right column's per-token pitch, computed FROM the left column's
 * height and the current token count — never the other way round. Shrinks
 * automatically if the left column grows (e.g. discard wraps to two rows).
 */
export function tokenPitchPx(columnHeightPx: number, tokenCount: number): number {
  if (tokenCount <= 0) return columnHeightPx;
  return (columnHeightPx - (tokenCount - 1) * TOKEN_GAP_PX) / tokenCount;
}

/**
 * A fanned played stack's total on-screen width (BOARD-05): the first
 * card's full width, plus FAN_PEEK_PX of additional peek per extra card.
 */
export function fannedStackWidth(cardCount: number): number {
  if (cardCount <= 0) return 0;
  return PLAYED_CARD_WIDTH_PX + (cardCount - 1) * FAN_PEEK_PX;
}
