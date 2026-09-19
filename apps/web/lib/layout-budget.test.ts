// Phase 06.2 Task 3 (RESEARCH.md Pitfall 1) — proves the 1280x720 height
// ledger's own invariants before any layout code imports it.
import { describe, expect, it } from "vitest";
import {
  BOARD_CHROME_PX,
  BOARD_INNER_PX,
  BOARD_PANEL_PADDING_PX,
  CLUE_TOKEN_COLUMNS,
  DECK_COUNTER_PX,
  DISCARD_COMPACT_PX,
  DISCARD_COMPACT_WIDTH_PX,
  DISCARD_ROWS,
  MAX_CLUE_TOKENS,
  MAX_FUSE_TOKENS,
  MAX_SUITS,
  MIDDLE_GAP_PX,
  OWN_BAND_PX,
  PLAY_AREA_HEIGHT_PX,
  PLAY_AREA_WIDTH_PX,
  RANK_SLOT_HEIGHT_PX,
  RANK_SLOT_WIDTH_PX,
  TABLE_BAND_MIN_PX,
  TEAMMATE_BAND_PX,
  TOKEN_AREA_HEIGHT_PX,
  TOKEN_AREA_WIDTH_PX,
  TOKEN_COLUMN_TOTAL_HEIGHT_PX,
  TOKEN_DISC_PX,
  VIEWPORT_TEST_HEIGHT_PX,
  discardCompactHeightPx,
  playAreaContentHeightPx,
  playColumnWidthPx,
  playGridHeightPx,
  tokenRunHeightPx,
} from "./layout-budget";
import * as layoutBudget from "./layout-budget";

describe("layout-budget", () => {
  it("the three bands plus chrome fit within the 1280x720 viewport (UI-11)", () => {
    const total = TEAMMATE_BAND_PX + OWN_BAND_PX + TABLE_BAND_MIN_PX + BOARD_CHROME_PX;
    expect(total).toBeLessThanOrEqual(VIEWPORT_TEST_HEIGHT_PX);
  });

  it("TEAMMATE_BAND_PX has no marks-band constant (HINT-04 removes the pip band)", () => {
    expect((layoutBudget as Record<string, unknown>).MARKS_BAND_PX).toBeUndefined();
    // UAT gap 29 reconciliation: fixing the inline-block descender-gap bug
    // in TeammateCard.tsx legitimately changed the real rendered height of
    // this band (111 -> 114) — see layout-budget.ts's own comment.
    expect(TEAMMATE_BAND_PX).toBe(114);
  });

  it("OWN_BAND_PX has no marks-band constant (HINT-04 removes the pip band)", () => {
    expect((layoutBudget as Record<string, unknown>).MARKS_BAND_PX).toBeUndefined();
    expect(OWN_BAND_PX).toBe(193);
  });

  it("UAT gap 20: TOKEN_DISC_PX is the pre-review 40px cut by roughly a third", () => {
    expect(TOKEN_DISC_PX).toBe(27);
  });

  it("playGridHeightPx is MAX_RANK slots at RANK_SLOT_HEIGHT_PX with RANK_SLOT_GAP_PX between them", () => {
    // fix(06.2-22, UAT gap 22): RANK_SLOT_HEIGHT_PX grown 40 -> 65 once
    // Deck/Discard left the Play column and freed the vertical room it no
    // longer has to share (208 -> 333).
    expect(playGridHeightPx()).toBe(333);
  });

  it("playAreaContentHeightPx (label + gap + stack header + grid + padding) IS PLAY_AREA_HEIGHT_PX", () => {
    expect(playAreaContentHeightPx()).toBe(PLAY_AREA_HEIGHT_PX);
    expect(PLAY_AREA_HEIGHT_PX).toBe(383);
  });

  it("playColumnWidthPx(MAX_SUITS) is the 7-suit Black worst-case Play area width", () => {
    // fix(06.2-22, UAT gap 22): RANK_SLOT_WIDTH_PX grown 30 -> 50
    // (208 -> 328) — Play is now its own standalone region, no longer
    // constrained to share a width with Deck/Discard.
    // fix(07-06, gap closure, owner gap 1): MAX_SUITS 6 -> 7 (Black now
    // deals five colours + Rainbow + Black) widens this width-only
    // (328 -> 382).
    expect(playColumnWidthPx(MAX_SUITS)).toBe(382);
  });

  it("MAX_SUITS is 7 and rank slots are NOT shrunk to make room (07-06, owner-mandated)", () => {
    expect(MAX_SUITS).toBe(7);
    expect(RANK_SLOT_WIDTH_PX).toBe(50);
    expect(RANK_SLOT_HEIGHT_PX).toBe(65);
  });

  it("07-06: the tableau's reserved width still fits the 1024px 'stays usable' floor at 7 suit columns", () => {
    // 16 = the --space-md gap Table.tsx renders between the tableau's three
    // side-by-side regions (Play | tokens+deck | Discard) — two such gaps.
    const INTER_REGION_GAP_PX = 16;
    const tableauReservedWidthPx =
      2 * BOARD_PANEL_PADDING_PX +
      PLAY_AREA_WIDTH_PX +
      INTER_REGION_GAP_PX +
      TOKEN_AREA_WIDTH_PX +
      INTER_REGION_GAP_PX +
      DISCARD_COMPACT_WIDTH_PX;
    expect(tableauReservedWidthPx).toBeLessThanOrEqual(1024);
  });

  it("discardCompactHeightPx(DISCARD_ROWS) IS DISCARD_COMPACT_PX, and DISCARD_ROWS is 5 (06.2-22, UAT gap 22)", () => {
    expect(discardCompactHeightPx(DISCARD_ROWS)).toBe(DISCARD_COMPACT_PX);
    expect(DISCARD_ROWS).toBe(5);
    expect(DISCARD_COMPACT_PX).toBe(156);
  });

  it("TOKEN_COLUMN_TOTAL_HEIGHT_PX is the token run plus a gap plus the Deck counter (UAT gap 21)", () => {
    expect(TOKEN_COLUMN_TOTAL_HEIGHT_PX).toBe(TOKEN_AREA_HEIGHT_PX + MIDDLE_GAP_PX + DECK_COUNTER_PX);
    expect(TOKEN_COLUMN_TOTAL_HEIGHT_PX).toBe(156);
  });

  it("BOARD_INNER_PX is the MAX of Play / token+deck column / Discard, since gap 19-22 made them side-by-side regions, not a stack", () => {
    expect(BOARD_INNER_PX).toBe(Math.max(PLAY_AREA_HEIGHT_PX, TOKEN_COLUMN_TOTAL_HEIGHT_PX, DISCARD_COMPACT_PX));
    expect(BOARD_INNER_PX).toBe(PLAY_AREA_HEIGHT_PX);
    expect(BOARD_INNER_PX).toBe(383);
  });

  it("TABLE_BAND_MIN_PX is BOARD_INNER_PX plus the board panel's own top+bottom padding", () => {
    expect(TABLE_BAND_MIN_PX).toBe(399);
  });

  it("TOKEN_AREA_HEIGHT_PX fits within BOARD_INNER_PX", () => {
    expect(TOKEN_AREA_HEIGHT_PX).toBeLessThanOrEqual(BOARD_INNER_PX);
  });

  it("tokenRunHeightPx(MAX_CLUE_TOKENS, CLUE_TOKEN_COLUMNS) is 120 at the gap-20 disc size", () => {
    expect(tokenRunHeightPx(MAX_CLUE_TOKENS, CLUE_TOKEN_COLUMNS)).toBe(120);
  });

  it("tokenRunHeightPx(MAX_FUSE_TOKENS, 1) is 89 at the gap-20 disc size", () => {
    expect(tokenRunHeightPx(MAX_FUSE_TOKENS, 1)).toBe(89);
  });

  it("tokenRunHeightPx returns 0 for an empty run", () => {
    expect(tokenRunHeightPx(0, CLUE_TOKEN_COLUMNS)).toBe(0);
  });

  it("TOKEN_AREA_HEIGHT_PX is the larger of the two runs and fits within TABLE_BAND_MIN_PX", () => {
    expect(TOKEN_AREA_HEIGHT_PX).toBe(
      Math.max(tokenRunHeightPx(MAX_CLUE_TOKENS, CLUE_TOKEN_COLUMNS), tokenRunHeightPx(MAX_FUSE_TOKENS, 1)),
    );
    expect(TOKEN_AREA_HEIGHT_PX).toBeLessThanOrEqual(TABLE_BAND_MIN_PX);
  });

  it("MAX_CLUE_TOKENS + MAX_FUSE_TOKENS equals the pre-existing worst-case token count of 11", () => {
    expect(MAX_CLUE_TOKENS + MAX_FUSE_TOKENS).toBe(11);
  });
});
